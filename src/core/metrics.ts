/** Catálogo de métricas que el motor de reglas puede usar. Fuente única de verdad
 * para el validador (core) y para su cálculo real (engine, M2). */
export const METRIC_IDS = [
  'power',
  'power_10s',
  'power_pct_target',
  'cadence',
  'cadence_10s',
  'cadence_stability',
  'hr',
  'hr_pct_max',
  'hr_zone',
  'hr_drop_60s',
  'hr_drift',
  'time_in_interval',
  'time_left_interval',
  'elapsed',
  'intensity',
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export function isMetricId(value: string): value is MetricId {
  return (METRIC_IDS as readonly string[]).includes(value);
}
