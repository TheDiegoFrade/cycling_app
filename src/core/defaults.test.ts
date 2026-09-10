import { describe, expect, it } from 'vitest';
import { buildCadenceMinRules, buildFactoryRules } from './defaults';
import { validateWorkout } from './validator';
import type { Profile } from './types';

const profile: Profile = { ftp: 250, hr_max: 190, cadence_floor: 70, hr_ceiling: 176 };

describe('buildFactoryRules', () => {
  it('genera piso de cadencia, techo de pulso y ERG desenganchado desde el perfil', () => {
    const rules = buildFactoryRules(profile);
    expect(rules.map((r) => r.id)).toEqual(['factory-cadence-floor', 'factory-hr-ceiling', 'factory-erg-detached']);
    expect(rules[0].when).toEqual({ metric: 'cadence', op: '<', value: 70 });
    expect(rules[1].when).toEqual({ metric: 'hr', op: '>', value: 176 });
    expect(rules[1].level).toBe('danger');
  });

  it('produce reglas válidas según el validador', () => {
    const workout = {
      format_version: 1 as const,
      id: 'w1',
      name: 'test',
      intervals: [{ name: 'Steady', type: 'steady' as const, duration_s: 60, power_pct: 70 }],
      rules: buildFactoryRules(profile),
      created_at: new Date(0).toISOString(),
    };
    expect(validateWorkout(workout).errors).toEqual([]);
  });
});

describe('buildCadenceMinRules', () => {
  it('genera una regla por cada bloque que trae cadence_min, numerada desde 1', () => {
    const rules = buildCadenceMinRules([
      { name: 'A', type: 'warmup', duration_s: 60, power_pct: 50 },
      { name: 'B', type: 'interval', duration_s: 120, power_pct: 110, cadence_min: 95 },
      { name: 'C', type: 'recovery', duration_s: 60, power_pct: 50, cadence_min: 85 },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ id: 'cadence-min-2', scope: { intervals: [2] }, when: { metric: 'cadence', op: '<', value: 95 } });
    expect(rules[1]).toMatchObject({ id: 'cadence-min-3', scope: { intervals: [3] }, when: { metric: 'cadence', op: '<', value: 85 } });
  });

  it('no genera nada si ningún bloque trae cadence_min', () => {
    const rules = buildCadenceMinRules([{ name: 'A', type: 'free', duration_s: 60, power_pct: 0 }]);
    expect(rules).toEqual([]);
  });
});
