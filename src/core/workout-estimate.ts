import { normalizedPower } from '../engine/analytics';
import { buildPlan, targetWattsAt } from '../engine/plan';
import type { Interval } from './types';

export interface WorkoutEstimate {
  durationS: number;
  /** TSS estimado (mismo cálculo que una sesión real, ver engine/analytics.ts,
   * aplicado al perfil de potencia planeado en vez de muestras reales).
   * `null` si no hay FTP configurado. */
  tss: number | null;
  /** Rango de watts de los bloques "de trabajo" (no calentamiento/vuelta a la
   * calma/recuperación) — lo que se muestra como "a 190–200 W". Si el
   * workout no tiene ningún bloque de ese tipo, usa todos los bloques. */
  wattsRange: [number, number];
}

const NON_MAIN_TYPES = new Set(['warmup', 'cooldown', 'recovery']);

/** Estima duración, TSS y rango de watts de un workout SIN correrlo — para
 * mostrar "55 min · 71 TSS · a 190–200 W" en Inicio/Antes de empezar/Plan
 * antes de pedalear. Sintetiza un watt por segundo a partir del plan
 * (respetando rampas) y le aplica la misma fórmula NP/IF/TSS que una sesión
 * real (ver TORQ_DESIGN.md, TSS estimado). */
export function estimateWorkout(intervals: readonly Interval[], ftp: number): WorkoutEstimate {
  const plan = buildPlan(intervals as Interval[]);
  const powers: number[] = [];
  for (let t = 0; t < plan.totalDuration; t++) powers.push(targetWattsAt(plan, t, ftp, 1));

  const np = normalizedPower(powers);
  const intensityFactor = ftp > 0 ? np / ftp : null;
  const tss = ftp > 0 && intensityFactor !== null ? ((plan.totalDuration * np * intensityFactor) / (ftp * 3600)) * 100 : null;

  const mainIntervals = intervals.filter((iv) => !NON_MAIN_TYPES.has(iv.type));
  const candidates = mainIntervals.length ? mainIntervals : intervals;
  const wattsOf = (iv: Interval): number[] => {
    const from = Math.round((iv.power_pct / 100) * ftp);
    const to = Math.round(((iv.ramp_to_pct ?? iv.power_pct) / 100) * ftp);
    return [from, to];
  };
  const allWatts = candidates.flatMap(wattsOf);
  const wattsRange: [number, number] = allWatts.length ? [Math.min(...allWatts), Math.max(...allWatts)] : [0, 0];

  return {
    durationS: plan.totalDuration,
    tss: tss !== null ? Math.round(tss) : null,
    wattsRange,
  };
}
