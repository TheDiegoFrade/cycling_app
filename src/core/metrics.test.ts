import { describe, expect, it } from 'vitest';
import { isMetricId, METRIC_IDS } from './metrics';

describe('catálogo de métricas', () => {
  it('incluye las métricas MVP del motor de reglas', () => {
    const mvp = [
      'power',
      'power_10s',
      'power_pct_target',
      'cadence',
      'cadence_10s',
      'hr',
      'hr_pct_max',
      'time_in_interval',
      'time_left_interval',
      'elapsed',
      'intensity',
    ];
    for (const id of mvp) {
      expect(METRIC_IDS).toContain(id);
    }
  });

  it('incluye las métricas derivadas que se implementan después, pero ya tipadas', () => {
    expect(METRIC_IDS).toContain('hr_drift');
    expect(METRIC_IDS).toContain('cadence_stability');
    expect(METRIC_IDS).toContain('hr_drop_60s');
    expect(METRIC_IDS).toContain('hr_zone');
  });

  it('isMetricId reconoce ids válidos y rechaza inválidos', () => {
    expect(isMetricId('power')).toBe(true);
    expect(isMetricId('heart_rate')).toBe(false);
  });
});
