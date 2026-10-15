// Qué objeto 3D de /brand le toca a cada workout o día (rediseño «Sol-plato»,
// docs/rediseno/REDISENO.md). Lógica pura: la usan Inicio, Plan, Historial y
// Antes de empezar.
import type { Interval } from '../core/types';
import { isTestWorkoutDoc } from '../core/workout-zone';

export type Token = 'end' | 'ss' | 'ftp' | 'vo2' | 'rec' | 'moon' | 'fuerza';

/** Plantillas de Generar workout (src/core/workout-templates.ts). */
const BY_TEMPLATE: Record<string, Token> = { z2: 'end', recovery: 'rec', sweet_spot: 'ss', threshold: 'ftp', vo2max: 'vo2' };

/** Lo que define la intensidad de la sesión: el %FTP más alto que se
 * sostiene al menos 2 min, sumando bloques (unos 30/30 a 120 % cuentan). */
const MIN_WORK_S = 120;

export function tokenForTemplate(templateId: string): Token | null {
  return BY_TEMPLATE[templateId] ?? null;
}

export function tokenForIntervals(intervals: readonly Interval[]): Token {
  const work = intervals
    .filter((iv) => iv.type !== 'warmup' && iv.type !== 'cooldown')
    .map((iv) => ({ pct: Math.max(iv.power_pct ?? 0, iv.ramp_to_pct ?? 0), s: iv.duration_s }))
    .sort((a, b) => b.pct - a.pct);
  let acc = 0;
  let pct = 0;
  for (const w of work) {
    acc += w.s;
    pct = w.pct;
    if (acc >= MIN_WORK_S) break;
  }
  if (acc < MIN_WORK_S) pct = 0; // sesión de puro calentamiento o vacía
  if (pct < 56) return 'rec';
  if (pct < 76) return 'end';
  if (pct < 88) return 'ss';
  if (pct < 106) return 'ftp';
  return 'vo2';
}

/** Objeto de un workout de bici: los tests (20 min, rampa) son el pico de umbral. */
export function tokenForWorkout(w: { name: string; kind?: 'test'; intervals: readonly Interval[] }): Token {
  if (isTestWorkoutDoc(w)) return 'ftp';
  return tokenForIntervals(w.intervals);
}

/** Ruta del objeto. «fuerza» todavía no tiene 3D: es la bolita con
 * mancuerna de CSS (clase .tk-fuerza) y no lleva imagen. */
export function tokenUrl(t: Token): string | null {
  return t === 'fuerza' ? null : `/brand/obj-${t}.webp`;
}

/** <span> decorativo con el objeto. `size` en px; `extra` agrega clases (p. ej. «bob»). */
export function tokenHtml(t: Token, size: number, extra = ''): string {
  const url = tokenUrl(t);
  const cls = `tk${t === 'fuerza' ? ' tk-fuerza' : ''}${extra ? ` ${extra}` : ''}`;
  const bg = url ? `background-image:url('${url}');` : '';
  return `<span class="${cls}" aria-hidden="true" style="width:${size}px;height:${size}px;${bg}"></span>`;
}
