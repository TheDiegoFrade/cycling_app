import type { Page, Route } from '@playwright/test';

/**
 * Supabase falso para las pruebas de UX. Intercepta en el navegador todo lo
 * que va a http://supabase.test (ver playwright.config.ts: la app se levanta
 * con VITE_SUPABASE_URL apuntando ahí), así no hace falta red ni la cuenta
 * dummy de producción.
 *
 * - auth/v1: login con contraseña, usuario actual, logout.
 * - rest/v1: un PostgREST de juguete — tablas en memoria con filtros `eq`,
 *   upsert/insert/update/delete. Suficiente para lo que la app lee y escribe.
 * - functions/v1: cada Edge Function responde con un handler configurable
 *   (pinon-chat, coach-chat…), con latencia y errores a elección del test.
 *
 * Todas las llamadas quedan en `calls` como evidencia para el reporte.
 */

export const SUPABASE_URL = 'http://supabase.test';
export const STORAGE_KEY = 'sb-supabase-auth-token';

export interface MockUser {
  id: string;
  email: string;
  password?: string;
}

export interface FnReply {
  status?: number;
  body: unknown;
  /** ms antes de responder — para simular a la IA pensando o un timeout. */
  delayMs?: number;
}

export type FnHandler = (body: any, ctx: MockSupabase) => FnReply | Promise<FnReply>;

export interface CallLog {
  at: number;
  kind: 'auth' | 'rest' | 'fn' | 'rpc' | 'storage';
  name: string;
  method: string;
  status: number;
  body?: unknown;
}

const TEN_YEARS_S = 10 * 365 * 24 * 3600;

function fakeJwt(sub: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + TEN_YEARS_S;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, exp, role: 'authenticated' })}.sig`;
}

function sessionFor(user: MockUser) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: fakeJwt(user.id),
    refresh_token: 'refresh-' + user.id,
    token_type: 'bearer',
    expires_in: TEN_YEARS_S,
    expires_at: now + TEN_YEARS_S,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

export class MockSupabase {
  readonly tables = new Map<string, Record<string, unknown>[]>();
  readonly functions = new Map<string, FnHandler>();
  readonly rpcs = new Map<string, (args: any) => unknown>();
  readonly calls: CallLog[] = [];
  readonly users: MockUser[] = [];
  readonly t0 = Date.now();
  /** Por defecto la persona ya aceptó los términos (las pruebas que no son de
   * términos no pasan por esa pantalla). false = tabla real: hay que aceptar. */
  autoAcceptTerms = true;
  /** Correo de quien llega del correo de invitación (verifyOtp). */
  invitedEmail: string | null = null;
  /** Lo que contesta `billing` → status. Por defecto, cuenta con acceso. */
  billingStatus: Record<string, unknown> = { ai: true, reason: 'comp', subscription: null, priceMxn: 299, billingReady: true, isAdmin: false };

  constructor(users: MockUser[] = []) {
    this.users.push(...users);
    this.rpcs.set('my_coach', () => null);
    this.functions.set('billing', (body) => (body?.action === 'status' || !body?.action ? { body: this.billingStatus } : { status: 400, body: { error: 'acción no simulada' } }));
  }

  table(name: string): Record<string, unknown>[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  fnCalls(name: string): CallLog[] {
    return this.calls.filter((c) => c.kind === 'fn' && c.name === name);
  }

  private log(entry: Omit<CallLog, 'at'>): void {
    this.calls.push({ at: Date.now() - this.t0, ...entry });
  }

  /** Deja al navegador con la sesión ya iniciada (como un usuario que vuelve). */
  async seedSession(page: Page, user: MockUser): Promise<void> {
    const session = sessionFor(user);
    await page.addInitScript(([key, value]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      } catch {
        /* sin storage: el test verá el login */
      }
    }, [STORAGE_KEY, JSON.stringify(session)] as const);
  }

  async install(page: Page): Promise<void> {
    await page.route(`${SUPABASE_URL}/**`, (route) => this.handle(route));
  }

  private async handle(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
      'access-control-expose-headers': '*',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...extra }, body: body === undefined ? '' : JSON.stringify(body) });
    let reqBody: any = undefined;
    try {
      reqBody = req.postData() ? JSON.parse(req.postData()!) : undefined;
    } catch {
      reqBody = req.postData();
    }

    // ── auth ──
    if (path.startsWith('/auth/v1/')) {
      const name = path.slice('/auth/v1/'.length);
      if (name === 'token' && url.searchParams.get('grant_type') === 'password') {
        const u = this.users.find((x) => x.email === reqBody?.email && (x.password ?? 'secreta') === reqBody?.password);
        this.log({ kind: 'auth', name: 'login', method, status: u ? 200 : 400 });
        if (!u) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return json(200, sessionFor(u));
      }
      if (name === 'token') {
        const u = this.users[0];
        return json(200, sessionFor(u));
      }
      if (name === 'user' && method !== 'PUT') {
        const auth = req.headers()['authorization'] ?? '';
        const sub = (() => {
          try {
            return JSON.parse(Buffer.from(auth.replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub;
          } catch {
            return null;
          }
        })();
        const u = this.users.find((x) => x.id === sub);
        return u ? json(200, sessionFor(u).user) : json(401, { msg: 'no user' });
      }
      if (name === 'logout') return json(204, undefined);
      // Canjear el token del correo de invitación (verifyOtp type=invite):
      // la persona invitada queda con sesión.
      if (name === 'verify' && method === 'POST') {
        const u = this.users.find((x) => x.email === this.invitedEmail) ?? this.users[0];
        this.log({ kind: 'auth', name: 'verify', method, status: u && reqBody?.token_hash ? 200 : 400 });
        if (!u || !reqBody?.token_hash) return json(400, { msg: 'invalid' });
        return json(200, sessionFor(u));
      }
      if (name === 'user' && method === 'PUT') {
        this.log({ kind: 'auth', name: 'update_user', method, status: 200, body: reqBody?.password ? { password: '***' } : reqBody });
        return json(200, sessionFor(this.users.find((x) => x.email === this.invitedEmail) ?? this.users[0]).user);
      }
      if (name === 'recover' || name === 'otp') return json(200, {});
      this.log({ kind: 'auth', name, method, status: 404 });
      return json(404, { msg: 'not mocked' });
    }

    // ── edge functions ──
    if (path.startsWith('/functions/v1/')) {
      const name = path.slice('/functions/v1/'.length);
      const handler = this.functions.get(name);
      const reply = handler ? await handler(reqBody, this) : { status: 200, body: {} };
      if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
      this.log({ kind: 'fn', name, method, status: reply.status ?? 200, body: reqBody });
      return json(reply.status ?? 200, reply.body);
    }

    // ── storage ──
    if (path.startsWith('/storage/v1/')) {
      // subir: OK; bajar (.fit): no hay archivos en el simulado → 404, y la
      // app cae al resumen sin detalle segundo a segundo
      const status = method === 'GET' ? 404 : 200;
      this.log({ kind: 'storage', name: path, method, status });
      return status === 404 ? json(404, { error: 'not_found', message: 'Object not found' }) : json(200, { Key: path });
    }

    // ── rest / rpc ──
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.slice('/rest/v1/rpc/'.length);
      const fn = this.rpcs.get(name);
      this.log({ kind: 'rpc', name, method, status: 200 });
      return json(200, fn ? fn(reqBody) : null);
    }
    if (path.startsWith('/rest/v1/')) {
      const name = path.slice('/rest/v1/'.length);
      const rows = this.table(name);
      const filters: [string, string][] = [];
      url.searchParams.forEach((v, k) => {
        if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) return;
        filters.push([k, v]);
      });
      const matches = (row: Record<string, unknown>) =>
        filters.every(([k, v]) => {
          if (k.includes('->') ) return true; // filtros json: no los modelamos
          const [op, ...rest] = v.split('.');
          const val = rest.join('.');
          const cell = row[k];
          if (op === 'eq') return String(cell) === val;
          if (op === 'neq') return String(cell) !== val;
          if (op === 'is') return val === 'null' ? cell == null : String(cell) === val;
          if (op === 'in') return val.replace(/[()]/g, '').split(',').includes(String(cell));
          return true;
        });
      const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      const prefer = req.headers()['prefer'] ?? '';
      const respond = (data: Record<string, unknown>[]) => {
        this.log({ kind: 'rest', name, method, status: 200 });
        if (wantsObject) return data.length ? json(200, data[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
        if (method !== 'GET' && !prefer.includes('return=representation')) return json(201, undefined);
        return json(200, data, { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` });
      };
      if (method === 'GET' || method === 'HEAD') {
        const found = rows.filter(matches);
        if (name === 'legal_acceptances' && this.autoAcceptTerms && found.length === 0) return respond([{ id: 0 }]);
        return respond(found);
      }
      if (method === 'POST') {
        const incoming = (Array.isArray(reqBody) ? reqBody : [reqBody]) as Record<string, unknown>[];
        const conflict = url.searchParams.get('on_conflict')?.split(',');
        for (const r of incoming) {
          // sin on_conflict, PostgREST usa la llave primaria: `id`, o
          // `user_id` en las tablas de una fila por usuario (profiles, settings).
          const key = conflict ?? (r.id !== undefined ? ['id'] : r.user_id !== undefined ? ['user_id'] : ['id']);
          const i = rows.findIndex((x) => key.every((k) => r[k] !== undefined && x[k] === r[k]));
          if (i >= 0 && prefer.includes('merge-duplicates')) rows[i] = { ...rows[i], ...r };
          else if (i >= 0) rows[i] = { ...rows[i], ...r };
          else rows.push({ ...(key.includes('id') ? { id: r.id ?? `row-${rows.length + 1}` } : {}), ...r });
        }
        return respond(incoming);
      }
      if (method === 'PATCH') {
        const hit = rows.filter(matches);
        hit.forEach((r) => Object.assign(r, reqBody));
        return respond(hit);
      }
      if (method === 'DELETE') {
        const keep = rows.filter((r) => !matches(r));
        const gone = rows.filter(matches);
        this.tables.set(name, keep);
        return respond(gone);
      }
    }
    this.log({ kind: 'rest', name: path, method, status: 404 });
    return json(404, { message: 'not mocked' });
  }
}
