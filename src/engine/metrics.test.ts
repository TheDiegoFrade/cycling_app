import { describe, expect, it } from 'vitest';
import { computeMetrics } from './metrics';
import type { Profile, Sample } from '../core/types';

const profile: Profile = { ftp: 250, hr_max: 190, cadence_floor: 70, hr_ceiling: 176 };

function sample(t: number, power: number, cadence: number, hr: number): Sample {
  return { t, power, cadence, hr, target: 200, intensity: 100, interval_index: 0 };
}

describe('computeMetrics', () => {
  it('usa la última muestra para power, cadence y hr', () => {
    const history = [sample(0, 190, 90, 140), sample(1, 210, 92, 142)];
    const m = computeMetrics(history, { target: 200, profile, timeInInterval: 1, timeLeftInterval: 59, intensityPct: 100 });
    expect(m.power).toBe(210);
    expect(m.cadence).toBe(92);
    expect(m.hr).toBe(142);
  });

  it('promedia los últimos 10 s para power_10s y cadence_10s, incluso con menos historial', () => {
    const history = [sample(0, 100, 80, 130), sample(1, 200, 100, 130)];
    const m = computeMetrics(history, { target: 200, profile, timeInInterval: 1, timeLeftInterval: 59, intensityPct: 100 });
    expect(m.power_10s).toBe(150);
    expect(m.cadence_10s).toBe(90);
  });

  it('solo usa los últimos 10 valores cuando hay más historial', () => {
    const history = Array.from({ length: 15 }, (_, i) => sample(i, i < 5 ? 0 : 100, 90, 140));
    const m = computeMetrics(history, { target: 100, profile, timeInInterval: 14, timeLeftInterval: 0, intensityPct: 100 });
    expect(m.power_10s).toBe(100); // los primeros 5 (power=0) ya cayeron fuera de la ventana de 10
  });

  it('calcula power_pct_target relativo al objetivo actual', () => {
    const history = [sample(0, 190, 90, 140)];
    const m = computeMetrics(history, { target: 200, profile, timeInInterval: 0, timeLeftInterval: 60, intensityPct: 100 });
    expect(m.power_pct_target).toBeCloseTo(95, 5);
  });

  it('devuelve 0 en power_pct_target si el objetivo es 0 (evita división entre 0)', () => {
    const history = [sample(0, 0, 90, 140)];
    const m = computeMetrics(history, { target: 0, profile, timeInInterval: 0, timeLeftInterval: 60, intensityPct: 100 });
    expect(m.power_pct_target).toBe(0);
  });

  it('calcula hr_pct_max relativo al perfil', () => {
    const history = [sample(0, 190, 90, 171)];
    const m = computeMetrics(history, { target: 200, profile, timeInInterval: 0, timeLeftInterval: 60, intensityPct: 100 });
    expect(m.hr_pct_max).toBeCloseTo(90, 5);
  });

  it('pasa elapsed, time_in_interval, time_left_interval e intensity del contexto', () => {
    const history = [sample(42, 190, 90, 140)];
    const m = computeMetrics(history, { target: 200, profile, timeInInterval: 12, timeLeftInterval: 48, intensityPct: 105 });
    expect(m.elapsed).toBe(42);
    expect(m.time_in_interval).toBe(12);
    expect(m.time_left_interval).toBe(48);
    expect(m.intensity).toBe(105);
  });

  it('deja sin definir las métricas derivadas que todavía no se implementan', () => {
    const history = [sample(0, 190, 90, 140)];
    const m = computeMetrics(history, { target: 200, profile, timeInInterval: 0, timeLeftInterval: 60, intensityPct: 100 });
    expect(m.hr_drift).toBeUndefined();
    expect(m.cadence_stability).toBeUndefined();
    expect(m.hr_drop_60s).toBeUndefined();
    expect(m.hr_zone).toBeUndefined();
  });
});
