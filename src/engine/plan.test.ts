import { describe, expect, it } from 'vitest';
import { buildPlan, intervalIndexAt, targetWattsAt } from './plan';
import type { Interval } from '../core/types';

const intervals: Interval[] = [
  { name: 'Warmup', type: 'warmup', duration_s: 100, power_pct: 50, ramp_to_pct: 70 },
  { name: 'Steady', type: 'steady', duration_s: 50, power_pct: 90 },
  { name: 'Cooldown', type: 'cooldown', duration_s: 100, power_pct: 60, ramp_to_pct: 40 },
];

describe('buildPlan', () => {
  it('calcula el inicio de cada bloque y la duración total', () => {
    const plan = buildPlan(intervals);
    expect(plan.segStart).toEqual([0, 100, 150]);
    expect(plan.totalDuration).toBe(250);
  });
});

describe('intervalIndexAt', () => {
  const plan = buildPlan(intervals);
  it.each([
    [0, 0],
    [99, 0],
    [100, 1],
    [149, 1],
    [150, 2],
    [249, 2],
    [1000, 2], // más allá del final se queda en el último
  ])('t=%i -> índice %i', (t, expected) => {
    expect(intervalIndexAt(plan, t)).toBe(expected);
  });
});

describe('targetWattsAt', () => {
  const plan = buildPlan(intervals);
  const ftp = 200;

  it('interpola linealmente cuando hay ramp_to_pct', () => {
    expect(targetWattsAt(plan, 0, ftp, 1)).toBe(Math.round(0.5 * ftp));
    expect(targetWattsAt(plan, 50, ftp, 1)).toBe(Math.round(0.6 * ftp)); // a mitad de la rampa 50->70
    expect(targetWattsAt(plan, 99, ftp, 1)).toBeCloseTo(Math.round(0.698 * ftp), 0);
  });

  it('mantiene el valor constante cuando no hay ramp_to_pct', () => {
    expect(targetWattsAt(plan, 100, ftp, 1)).toBe(Math.round(0.9 * ftp));
    expect(targetWattsAt(plan, 149, ftp, 1)).toBe(Math.round(0.9 * ftp));
  });

  it('aplica el sesgo de intensidad manual', () => {
    expect(targetWattsAt(plan, 100, ftp, 1.1)).toBe(Math.round(0.9 * ftp * 1.1));
    expect(targetWattsAt(plan, 100, ftp, 0.5)).toBe(Math.round(0.9 * ftp * 0.5));
  });
});
