import type { MetricId } from '../core/metrics';
import type { Profile, Sample } from '../core/types';

/** Solo las métricas MVP quedan pobladas; el resto del catálogo (hr_drift,
 * cadence_stability, hr_drop_60s, hr_zone) se deja `undefined` hasta que se
 * implementen — el motor de reglas ya sabe tratar eso como "no cumple". */
export type MetricsSnapshot = { [K in MetricId]?: number };

export interface MetricsContext {
  target: number;
  profile: Profile;
  timeInInterval: number;
  timeLeftInterval: number;
  intensityPct: number;
}

function average(history: readonly Sample[], windowS: number, pick: (s: Sample) => number): number {
  const slice = history.slice(-windowS);
  const sum = slice.reduce((acc, s) => acc + pick(s), 0);
  return sum / slice.length;
}

/** `history` debe venir ordenado de más viejo a más nuevo, un sample por
 * segundo, con la muestra actual al final. */
export function computeMetrics(history: readonly Sample[], ctx: MetricsContext): MetricsSnapshot {
  const now = history[history.length - 1];
  const power10s = average(history, 10, (s) => s.power);
  const cadence10s = average(history, 10, (s) => s.cadence);

  return {
    power: now.power,
    power_10s: power10s,
    power_pct_target: ctx.target > 0 ? (power10s / ctx.target) * 100 : 0,
    cadence: now.cadence,
    cadence_10s: cadence10s,
    hr: now.hr,
    hr_pct_max: (now.hr / ctx.profile.hr_max) * 100,
    time_in_interval: ctx.timeInInterval,
    time_left_interval: ctx.timeLeftInterval,
    elapsed: now.t,
    intensity: ctx.intensityPct,
  };
}
