import { describe, expect, it } from 'vitest';
import { HAIKU, SONNET, plannerFor } from './routing.ts';

const week = (over: Record<string, unknown> = {}) => ({ weekJustFinished: { athleteNote: null, workouts: [], ...over } });

describe('plannerFor', () => {
  it('plan y bloque nuevos van con Sonnet low', () => {
    expect(plannerFor('create_plan', {})).toMatchObject({ model: SONNET, effort: 'low' });
    expect(plannerFor('publish_block', {})).toMatchObject({ model: SONNET, effort: 'low' });
  });

  it('una semana normal va con Haiku low', () => {
    expect(plannerFor('weekly_eval', week({ athleteNote: 'Dormí mal, piernas pesadas.' }))).toMatchObject({ model: HAIKU, effort: 'low' });
  });

  it('test en la semana, test reciente o nota sobre el FTP → Sonnet', () => {
    expect(plannerFor('weekly_eval', week({ workouts: [{ zone: 'test' }] })).model).toBe(SONNET);
    expect(plannerFor('weekly_eval', week({ athleteNote: 'Hice el test, ¿mi FTP es 162?' })).model).toBe(SONNET);
    expect(plannerFor('weekly_eval', week({ athleteNote: 'Aguanté 170 W sin problema' })).model).toBe(SONNET);
    expect(plannerFor('weekly_eval', { ...week(), nextWeekStart: '2026-10-12', lastTest: { date: '2026-10-07' } }).model).toBe(SONNET);
  });

  it('un test viejo no basta', () => {
    expect(plannerFor('weekly_eval', { ...week(), nextWeekStart: '2026-10-12', lastTest: { date: '2026-09-01' } }).model).toBe(HAIKU);
  });
});
