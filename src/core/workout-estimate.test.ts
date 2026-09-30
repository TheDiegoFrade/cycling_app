import { describe, expect, it } from 'vitest';
import type { Interval } from './types';
import { estimateWorkout } from './workout-estimate';

describe('estimateWorkout', () => {
  it('calcula duración total, TSS estimado y rango de watts de los bloques de trabajo', () => {
    const intervals: Interval[] = [
      { name: 'Calentamiento', type: 'warmup', duration_s: 300, power_pct: 50 },
      { name: 'Umbral', type: 'interval', duration_s: 600, power_pct: 95 },
      { name: 'Vuelta a la calma', type: 'cooldown', duration_s: 300, power_pct: 40 },
    ];
    const est = estimateWorkout(intervals, 200);
    expect(est.durationS).toBe(1200);
    expect(est.tss).not.toBeNull();
    expect(est.tss).toBeGreaterThan(0);
    // el rango de watts excluye calentamiento/vuelta a la calma: solo el bloque "interval" a 95% de 200W
    expect(est.wattsRange).toEqual([190, 190]);
  });

  it('usa todos los bloques si ninguno es de tipo "de trabajo"', () => {
    const intervals: Interval[] = [{ name: 'Suave', type: 'recovery', duration_s: 60, power_pct: 50 }];
    const est = estimateWorkout(intervals, 200);
    expect(est.wattsRange).toEqual([100, 100]);
  });

  it('devuelve tss null si no hay FTP', () => {
    const intervals: Interval[] = [{ name: 'x', type: 'steady', duration_s: 60, power_pct: 70 }];
    expect(estimateWorkout(intervals, 0).tss).toBeNull();
  });

  it('incluye el rango de una rampa (power_pct -> ramp_to_pct)', () => {
    const intervals: Interval[] = [{ name: 'Rampa', type: 'interval', duration_s: 60, power_pct: 50, ramp_to_pct: 100 }];
    const est = estimateWorkout(intervals, 200);
    expect(est.wattsRange).toEqual([100, 200]);
  });
});
