import { describe, expect, it } from 'vitest';
import { blockOfWeek, planContextFor, plannedTestLabel, weekStartOf } from './plan-context';
import type { StoredPlanData } from './plan-context';
import type { Profile } from './types';

const profile: Profile = {
  ftp: 200, hr_max: 185, cadence_floor: 70, hr_ceiling: 170, hr_min: 0, cadence_max: 999,
  discipline: 'mountain', experienceLevel: 'experienced', generalFitnessLevel: 'active_other_sport',
};

const blocks = [
  { name: 'Base', weeks: 4, focus: 'aeróbico', targetHoursPerWeek: 5, published: true },
  { name: 'Umbral', weeks: 4, focus: 'sweet spot y umbral', targetHoursPerWeek: 6 },
];

describe('blockOfWeek', () => {
  it('ubica la semana dentro de su bloque', () => {
    expect(blockOfWeek(blocks, 0)).toEqual({ index: 0, weekInBlock: 1 });
    expect(blockOfWeek(blocks, 3)).toEqual({ index: 0, weekInBlock: 4 });
    expect(blockOfWeek(blocks, 4)).toEqual({ index: 1, weekInBlock: 1 });
    expect(blockOfWeek(blocks, 9)).toEqual({ index: 1, weekInBlock: 6 });
  });
});

describe('weekStartOf', () => {
  it('ancla en el lunes de la semana del inicio', () => {
    expect(weekStartOf('2026-10-08', 0)).toBe('2026-10-05'); // jueves → su lunes
    expect(weekStartOf('2026-10-08', 3)).toBe('2026-10-26');
    expect(weekStartOf('2026-10-12', 1)).toBe('2026-10-19');
  });
});

describe('planContextFor', () => {
  const data: StoredPlanData = {
    startDate: '2026-10-08',
    blocks,
    weeks: [],
    form: { goal: 'Fondo MTB en marzo', days: ['tue', 'thu', 'sat'], hoursPerWeek: 6 },
    nextTest: { weekIndex: 4, type: 'ramp', reason: 'Tras la base' },
  };

  it('arma objetivo, días, bloque actual, siguiente y test', () => {
    expect(planContextFor({ goal: 'Plan MTB', data }, profile, 3)).toEqual({
      goal: 'Fondo MTB en marzo',
      discipline: 'mountain',
      experienceLevel: 'experienced',
      generalFitnessLevel: 'active_other_sport',
      days: ['tue', 'thu', 'sat'],
      hoursPerWeek: 6,
      currentBlock: { name: 'Base', focus: 'aeróbico', weeks: 4, weekInBlock: 4 },
      nextBlock: { name: 'Umbral', focus: 'sweet spot y umbral', weeks: 4, targetHoursPerWeek: 6 },
      nextTest: { weekIndex: 4, type: 'ramp', reason: 'Tras la base' },
    });
  });

  it('plan viejo sin formulario: nombre del plan y días de sus workouts', () => {
    const old = { ...data, form: undefined, nextTest: undefined };
    const ctx = planContextFor({ goal: 'Plan MTB', data: old }, profile, 5, ['sat', 'tue', 'tue']);
    expect(ctx.goal).toBe('Plan MTB');
    expect(ctx.days).toEqual(['tue', 'sat']);
    expect(ctx.hoursPerWeek).toBeNull();
    expect(ctx.nextBlock).toBeNull();
    expect(ctx.nextTest).toBeNull();
  });
});

describe('plannedTestLabel', () => {
  it('dice cuál y qué semana', () => {
    expect(plannedTestLabel({ weekIndex: 4, type: 'ramp', reason: '' }, '2026-10-08', false)).toBe('Tu primer test: test de rampa, semana del 2 nov.');
    expect(plannedTestLabel({ weekIndex: 1, type: 'test20', reason: '' }, '2026-10-08', true)).toContain('Próximo test: test de 20 min');
  });
});
