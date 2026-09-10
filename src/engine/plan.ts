import type { Interval } from '../core/types';

export interface WorkoutPlan {
  intervals: Interval[];
  segStart: number[];
  totalDuration: number;
}

export function buildPlan(intervals: Interval[]): WorkoutPlan {
  const segStart: number[] = [];
  let acc = 0;
  for (const interval of intervals) {
    segStart.push(acc);
    acc += interval.duration_s;
  }
  return { intervals, segStart, totalDuration: acc };
}

/** Índice (base 0) del intervalo que contiene el segundo `t`. Si `t` cae en
 * o después del final, se queda en el último intervalo. */
export function intervalIndexAt(plan: WorkoutPlan, t: number): number {
  let i = 0;
  while (i < plan.intervals.length - 1 && t >= plan.segStart[i + 1]) i++;
  return i;
}

/** Objetivo ERG en watts en el segundo `t`, interpolando linealmente si el
 * bloque tiene `ramp_to_pct`, y aplicando el sesgo de intensidad manual. */
export function targetWattsAt(plan: WorkoutPlan, t: number, ftp: number, bias: number): number {
  const i = intervalIndexAt(plan, t);
  const interval = plan.intervals[i];
  const into = t - plan.segStart[i];
  const fromPct = interval.power_pct;
  const toPct = interval.ramp_to_pct ?? interval.power_pct;
  const frac = interval.duration_s > 0 ? Math.min(1, Math.max(0, into / interval.duration_s)) : 0;
  const pct = fromPct + (toPct - fromPct) * frac;
  return Math.round((pct / 100) * ftp * bias);
}
