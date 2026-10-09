// Arnés de simulación del coach IA de Torq — solo usa endpoints reales y datos del dummy.
// Ver README.md: escribe en PRODUCCIÓN (planes, correos, contadores) de la cuenta dummy.
import fs from 'node:fs';
import path from 'node:path';

export const URL_ = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const MGMT = process.env.SUPABASE_ACCESS_TOKEN;
export const REF = 'pmshhyyqoghoyjnsedza';
// La cuenta dummy va por variables de entorno para no dejar cuentas en el repo.
export const DUMMY_EMAIL = process.env.TORQ_DUMMY_EMAIL;
export const DUMMY_ID = process.env.TORQ_DUMMY_USER_ID;
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_ACCESS_TOKEN', 'TORQ_DUMMY_EMAIL', 'TORQ_DUMMY_USER_ID'].filter((k) => !process.env[k]);
if (missing.length) throw new Error(`faltan variables de entorno: ${missing.join(', ')} (ver README.md)`);
export const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');

const svc = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok || j?.message) throw new Error(`sql: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

export async function rest(method, pathq, body, extra = {}) {
  const r = await fetch(`${URL_}/rest/v1/${pathq}`, { method, headers: { ...svc, Prefer: 'return=representation', ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`rest ${method} ${pathq}: ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

let jwtCache = null;
export async function dummyJwt() {
  if (jwtCache && jwtCache.exp > Date.now() + 5 * 60_000) return jwtCache.token;
  for (let attempt = 1; ; attempt++) {
    try { return await mintJwt(); } catch (e) { if (attempt >= 6) throw e; await new Promise((r) => setTimeout(r, 15000)); }
  }
}
async function mintJwt() {
  const g = await fetch(`${URL_}/auth/v1/admin/generate_link`, { method: 'POST', headers: svc, body: JSON.stringify({ type: 'magiclink', email: DUMMY_EMAIL }) }).then((r) => r.json());
  const hash = g.hashed_token ?? g.properties?.hashed_token;
  const v = await fetch(`${URL_}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hash }) }).then((r) => r.json());
  if (!v.access_token) throw new Error(`auth: ${JSON.stringify(v).slice(0, 200)}`);
  jwtCache = { token: v.access_token, exp: Date.now() + (v.expires_in ?? 3600) * 1000 };
  return jwtCache.token;
}

export async function fn(name, body) {
  const t0 = Date.now();
  const r = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await dummyJwt()}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 2000) }; }
  return { status: r.status, ms: Date.now() - t0, body: json };
}

// ---------- fechas ----------
export const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function addDays(key, n) { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function mondayOf(key) { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
export const weekStartOf = (start, i) => addDays(mondayOf(start), i * 7);
export const weekEnd = (start, i) => addDays(mondayOf(start), i * 7 + 6);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const dayOf = (key) => DAYS[(new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7];
export function fmtLong(key) { return new Date(`${key}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }

// ---------- análisis de workouts (misma lógica que src/core) ----------
export function expandIntervals(w) { return w.intervals ?? []; }
export function tssOf(intervals, ftp = 100) {
  // NP/IF/TSS por segundo, como estimateWorkout (rampa lineal)
  const p = [];
  for (const iv of intervals) {
    const a = iv.power_pct, b = iv.ramp_to_pct ?? iv.power_pct;
    for (let t = 0; t < iv.duration_s; t++) p.push(((a + (b - a) * (t / iv.duration_s)) / 100) * ftp);
  }
  if (!p.length) return 0;
  const roll = [];
  let s = 0;
  for (let i = 0; i < p.length; i++) { s += p[i]; if (i >= 30) s -= p[i - 30]; if (i >= 29) roll.push(s / 30); }
  const np = roll.length ? Math.pow(roll.reduce((a, x) => a + x ** 4, 0) / roll.length, 0.25) : p.reduce((a, x) => a + x, 0) / p.length;
  const IF = np / ftp;
  return Math.round(((p.length * np * IF) / (ftp * 3600)) * 100);
}
const BANDS = [['VO2', 106, 120], ['umbral', 95, 300], ['sweet spot', 88, 300], ['tempo', 76, 600]];
export function zoneOf(w) {
  if (w.kind === 'test' || (/test|rampa|ramp/i.test(w.name) && !/escalera/i.test(w.name))) return 'test';
  const work = (w.intervals ?? []).filter((iv) => iv.type !== 'warmup' && iv.type !== 'cooldown');
  for (const [z, min, secs] of BANDS) if (work.filter((iv) => Math.max(iv.power_pct, iv.ramp_to_pct ?? 0) >= min).reduce((s, iv) => s + iv.duration_s, 0) >= secs) return z;
  return 'fondo';
}
export function describeWorkout(w) {
  const iv = w.intervals ?? [];
  const dur = Math.round(iv.reduce((s, x) => s + x.duration_s, 0) / 60);
  const maxPct = Math.max(0, ...iv.map((x) => Math.max(x.power_pct, x.ramp_to_pct ?? 0)));
  const cad = [...new Set(iv.filter((x) => x.cadence_min || x.cadence_max).map((x) => `${x.cadence_min ?? ''}-${x.cadence_max ?? ''}`))];
  const free = iv.filter((x) => x.type === 'free').length;
  // forma compacta de la serie: agrupa pasos consecutivos
  const steps = iv.map((x) => `${x.type[0]}${Math.round(x.duration_s / 60 * 10) / 10}'@${x.power_pct}${x.ramp_to_pct ? '→' + x.ramp_to_pct : ''}${x.cadence_min ? ' c' + x.cadence_min + (x.cadence_max ? '-' + x.cadence_max : '+') : ''}`);
  return { date: w.scheduledDate, day: w.scheduledDate ? dayOf(w.scheduledDate) : null, name: w.name, min: dur, tss: tssOf(iv), zone: zoneOf(w), maxPct, erg: w.erg ?? w.ergMode ?? null, cadence: cad, freeSteps: free, steps: steps.join(' | '), description: w.description ?? null, kind: w.kind ?? null };
}

// ---------- estado del dummy ----------
export async function activePlan() {
  const r = await rest('GET', `training_plans?user_id=eq.${DUMMY_ID}&status=eq.active&select=*`);
  return r[0] ?? null;
}
export async function workoutsByIds(ids) {
  if (!ids.length) return [];
  const r = await rest('GET', `workouts?user_id=eq.${DUMMY_ID}&id=in.(${ids.join(',')})&select=id,data`);
  return r.map((x) => ({ id: x.id, ...x.data }));
}
export async function allWorkouts() {
  const r = await rest('GET', `workouts?user_id=eq.${DUMMY_ID}&select=id,data`);
  return r.map((x) => ({ id: x.id, ...x.data }));
}

export async function resetCounters() {
  // Contadores anti-abuso y expediente del dummy (autorizado por el usuario).
  await sql(`delete from plan_actions where user_id='${DUMMY_ID}'; delete from coach_usage where user_id='${DUMMY_ID}'; delete from athlete_notes where athlete_id='${DUMMY_ID}';`);
}

export function save(dir, name, obj) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}
