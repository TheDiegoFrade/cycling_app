import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { MockSupabase } from './mock-supabase';
import type { MockUser } from './mock-supabase';

/**
 * Sonda de UX: cada acción del "usuario" pasa por aquí para contar clics,
 * campos y tiempo humano estimado, y dejar un recorrido en JSON que
 * `e2e/report.mjs` junta en una tabla para el documento de evaluación.
 */

/** Segundos que una persona tarda en cada tipo de acción (estimación
 * conservadora tipo KLM: leer + mover el puntero + actuar). */
const HUMAN_COST_S = { click: 2.5, fill: 5, read: 3 } as const;

/** Palabras que delatan un texto en inglés que se coló a la UI. "error" y
 * "online" se escriben igual en español: no cuentan. */
const ENGLISH = /\b(invalid|credentials|returned|status code|failed to|function|unknown error|not found|network ?error|fetch|undefined|null|NaN|loading|please|edge function|non-2xx)\b/i;

/** Siglas que un ciclista novato no tiene por qué saber. */
const JARGON = /\b(CTL|ATL|TSB|weekIndex|IF|NP|VI|EF)\b/;

export const SHOTS_DIR = path.resolve('docs/evaluaciones/2026-10-20-ux/img');
const JOURNEYS_DIR = path.resolve('e2e/.out/journeys');

export interface Step {
  kind: 'click' | 'fill' | 'read' | 'wait' | 'shot' | 'note';
  label: string;
  t: number;
}

export class Ux {
  clicks = 0;
  fills = 0;
  reads = 0;
  readonly steps: Step[] = [];
  readonly findings: { id: string; text: string }[] = [];
  readonly metrics: Record<string, number | string | boolean> = {};
  /** Segundos de lectura de textos largos (ver readText). */
  private readingSeconds = 0;
  private readonly t0 = Date.now();

  constructor(
    readonly page: Page,
    private readonly info: TestInfo,
  ) {}

  private push(kind: Step['kind'], label: string): void {
    this.steps.push({ kind, label, t: Date.now() - this.t0 });
  }

  async click(target: Locator, label: string): Promise<void> {
    await target.click();
    this.clicks++;
    this.push('click', label);
  }

  async fill(target: Locator, value: string, label: string): Promise<void> {
    await target.fill(value);
    this.fills++;
    this.push('fill', label);
  }

  /** La persona se detiene a leer algo antes de decidir. */
  read(label: string): void {
    this.reads++;
    this.push('read', label);
  }

  /** Leer un bloque de texto (un formulario, una nota del coach): 200
   * palabras por minuto, lo normal leyendo en pantalla. */
  async readText(target: Locator, label: string): Promise<number> {
    const words = (await target.innerText()).split(/\s+/).filter(Boolean).length;
    const seconds = Math.round((words / 200) * 60);
    this.readingSeconds += seconds;
    this.push('read', `${label} (${words} palabras, ~${seconds} s)`);
    return seconds;
  }

  note(label: string): void {
    this.push('note', label);
  }

  /** Clics + campos: lo que de verdad le cuesta a la persona. */
  get interactions(): number {
    return this.clicks + this.fills;
  }

  get humanSeconds(): number {
    return Math.round(this.clicks * HUMAN_COST_S.click + this.fills * HUMAN_COST_S.fill + this.reads * HUMAN_COST_S.read + this.readingSeconds);
  }

  /** Marca un punto del recorrido ("llegó al chat") con su costo hasta ahí. */
  milestone(name: string): { clicks: number; interactions: number; humanSeconds: number } {
    const m = { clicks: this.clicks, interactions: this.interactions, humanSeconds: this.humanSeconds };
    this.metrics[`${name}.clicks`] = m.clicks;
    this.metrics[`${name}.interactions`] = m.interactions;
    this.metrics[`${name}.humanSeconds`] = m.humanSeconds;
    return m;
  }

  finding(id: string, text: string): void {
    this.findings.push({ id, text });
  }

  /** Captura de evidencia para el documento (se guarda en docs/…/img). */
  async shot(name: string, target?: Locator): Promise<void> {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const file = path.join(SHOTS_DIR, `${name}.jpg`);
    const opts = { path: file, type: 'jpeg' as const, quality: 78, animations: 'disabled' as const };
    if (target) await target.screenshot(opts);
    else await this.page.screenshot(opts);
    this.push('shot', name);
  }

  async visibleText(scope?: Locator): Promise<string> {
    return (scope ?? this.page.locator('body')).innerText();
  }

  async englishIn(scope?: Locator): Promise<string[]> {
    const text = await this.visibleText(scope);
    return text.split('\n').filter((l) => ENGLISH.test(l));
  }

  async jargonIn(scope?: Locator): Promise<string[]> {
    const text = await this.visibleText(scope);
    return text.split('\n').filter((l) => JARGON.test(l));
  }

  save(): void {
    fs.mkdirSync(JOURNEYS_DIR, { recursive: true });
    const id = this.info.titlePath.slice(1).join(' › ');
    const file = path.join(JOURNEYS_DIR, `${this.info.project.name}--${id.replace(/[^\w-]+/g, '_').slice(0, 120)}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          project: this.info.project.name,
          test: id,
          status: this.info.status,
          clicks: this.clicks,
          fills: this.fills,
          interactions: this.interactions,
          humanSeconds: this.humanSeconds,
          wallMs: Date.now() - this.t0,
          metrics: this.metrics,
          findings: this.findings,
          steps: this.steps,
          annotations: this.info.annotations,
        },
        null,
        2,
      ),
    );
  }
}

export interface Fixtures {
  ux: Ux;
  backend: MockSupabase;
  /** Errores de consola de la página (para detectar fallos silenciosos). */
  consoleErrors: string[];
}

/** Quieta los elementos al azar (asomadas de Piñón, música) para que las
 * pruebas sean reproducibles. Las guías de primera vez se dejan: son parte
 * de la bienvenida que queremos evaluar; quien no las quiera, las apaga. */
export const QUIET = { peek: 'off', ride: 'off' };

export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // fuentes y videos externos: el sandbox no tiene red, no es un bug de la app
      if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(t)) return;
      errors.push(t);
    });
    await use(errors);
  },
  backend: async ({ page }, use) => {
    const mock = new MockSupabase();
    await mock.install(page);
    // Red externa (fuentes, YouTube): no existe en el sandbox — cortarla
    // rápido en vez de esperar timeouts.
    await page.route(/^https:\/\/(?!localhost)/, (route) => route.abort());
    await use(mock);
  },
  ux: async ({ page }, use, info) => {
    await page.addInitScript((q) => {
      try {
        localStorage.setItem('torq.pinon.peek', q.peek);
        localStorage.setItem('torq.pinon.ride', q.ride);
      } catch {
        /* sin storage */
      }
    }, QUIET);
    const ux = new Ux(page, info);
    await use(ux);
    ux.save();
  },
});

export { expect };

/** Personas usadas en los tests (ver el documento: matriz de perfiles). */
export function user(id: string, email = `${id}@torq.test`): MockUser {
  return { id, email, password: 'secreta' };
}

/** Apaga las guías de Piñón para un test que no evalúa la bienvenida. */
export async function noGuides(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('torq.pinon.guides', 'off');
    } catch {
      /* sin storage */
    }
  });
}
