import { describe, expect, it } from 'vitest';
import { buildFactoryRules, buildIntervalLimitRules } from './defaults';
import { validateWorkout } from './validator';
import type { Interval, Profile } from './types';

const profile: Profile = { ftp: 250, hr_max: 190, cadence_floor: 70, hr_ceiling: 176, hr_min: 0, cadence_max: 999 };

function workoutWith(intervals: Interval[]) {
  return { intervals };
}

describe('buildFactoryRules', () => {
  it('genera los 5 límites globales + ERG desenganchado desde el perfil, con scope "all" si ningún bloque los sobreescribe', () => {
    const workout = workoutWith([{ name: 'A', type: 'steady', duration_s: 60, power_pct: 70 }]);
    const rules = buildFactoryRules(profile, workout);
    expect(rules.map((r) => r.id)).toEqual([
      'factory-cadence-floor',
      'factory-hr-ceiling',
      'factory-hr-floor',
      'factory-cadence-ceiling',
      'factory-erg-detached',
    ]);
    expect(rules[0].when).toEqual({ metric: 'cadence_10s', op: '<', value: 70 });
    expect(rules[0].scope).toBe('all');
    expect(rules[1].when).toEqual({ metric: 'hr', op: '>', value: 176 });
    expect(rules[1].level).toBe('danger');
  });

  it('excluye del límite global los bloques que ya traen su propio valor', () => {
    const workout = workoutWith([
      { name: 'A', type: 'warmup', duration_s: 60, power_pct: 50 },
      { name: 'B', type: 'interval', duration_s: 120, power_pct: 110, hr_ceiling: 165 },
      { name: 'C', type: 'recovery', duration_s: 60, power_pct: 50 },
    ]);
    const rules = buildFactoryRules(profile, workout);
    const hrCeiling = rules.find((r) => r.id === 'factory-hr-ceiling')!;
    expect(hrCeiling.scope).toEqual({ intervals: [1, 3] }); // el 2 ya tiene el suyo
  });

  it('produce reglas válidas según el validador', () => {
    const intervals: Interval[] = [{ name: 'Steady', type: 'steady', duration_s: 60, power_pct: 70 }];
    const workout = {
      format_version: 1 as const,
      id: 'w1',
      name: 'test',
      intervals,
      rules: buildFactoryRules(profile, workoutWith(intervals)),
      created_at: new Date(0).toISOString(),
    };
    expect(validateWorkout(workout).errors).toEqual([]);
  });
});

describe('buildIntervalLimitRules', () => {
  it('genera una regla por cada límite que trae un bloque, numerada desde 1', () => {
    const rules = buildIntervalLimitRules([
      { name: 'A', type: 'warmup', duration_s: 60, power_pct: 50 },
      { name: 'B', type: 'interval', duration_s: 120, power_pct: 110, cadence_min: 95, hr_ceiling: 165 },
      { name: 'C', type: 'recovery', duration_s: 60, power_pct: 50, cadence_max: 85, hr_min: 100 },
    ]);
    expect(rules.map((r) => r.id)).toEqual(['cadence-min-2', 'hr-ceiling-2', 'cadence-max-3', 'hr-min-3']);
    expect(rules[0]).toMatchObject({ scope: { intervals: [2] }, when: { metric: 'cadence_10s', op: '<', value: 95 } });
    expect(rules[1]).toMatchObject({ scope: { intervals: [2] }, when: { metric: 'hr', op: '>', value: 165 }, level: 'danger' });
    expect(rules[2]).toMatchObject({ scope: { intervals: [3] }, when: { metric: 'cadence_10s', op: '>', value: 85 } });
    expect(rules[3]).toMatchObject({ scope: { intervals: [3] }, when: { metric: 'hr', op: '<', value: 100 } });
  });

  it('no genera nada si ningún bloque trae límites propios', () => {
    const rules = buildIntervalLimitRules([{ name: 'A', type: 'free', duration_s: 60, power_pct: 0 }]);
    expect(rules).toEqual([]);
  });
});
