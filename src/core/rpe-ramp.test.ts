import { describe, expect, it } from 'vitest';
import { rampHrStop, rampReferenceWatts, rpeRampIntervals, rpeZonesFromRamp } from './rpe-ramp';
import { buildPlan, targetWattsAt } from '../engine/plan';

describe('protocolo de la rampa por RPE', () => {
  it('arranca en 50 W y sube 25 W cada 2 min, en watts fijos (no depende del FTP)', () => {
    const iv = rpeRampIntervals();
    expect(iv.slice(0, 3).map((i) => [i.watts, i.duration_s])).toEqual([[50, 120], [75, 120], [100, 120]]);
    const plan = buildPlan(iv);
    expect(targetWattsAt(plan, 0, 300, 1)).toBe(50);
    expect(targetWattsAt(plan, 250, 120, 1)).toBe(100);
  });

  it('si pesa menos de 53 kg sube de 20 en 20', () => {
    expect(rpeRampIntervals(200, 50).slice(0, 3).map((i) => i.watts)).toEqual([50, 70, 90]);
    expect(rpeRampIntervals(200, 53).slice(0, 2).map((i) => i.watts)).toEqual([50, 75]);
  });

  it('por pulso se detiene al 80 % de (220 − edad)', () => {
    expect(rampHrStop(40)).toBe(144);
  });
});

describe('zonas de la rampa', () => {
  const s = (watts: number, rpe: number | null) => ({ watts, rpe, hr: null });

  it('fondo 1-4, umbral 5-7, VO2 8-9', () => {
    const z = rpeZonesFromRamp([s(50, 2), s(75, 3), s(100, 4), s(125, 5), s(150, 6), s(175, 7), s(200, 8)], 'rpe', '2026-10-13');
    expect(z).toMatchObject({ endurance: [50, 100], threshold: [125, 175], vo2: [200, 200], method: 'rpe', flagLowCapacity: false });
    expect(rampReferenceWatts(z)).toBe(175);
  });

  it('si brinca de 4 a 9, el umbral queda entre los dos', () => {
    const z = rpeZonesFromRamp([s(50, 2), s(75, 3), s(100, 4), s(125, null), s(150, 9)], 'rpe', '2026-10-13');
    expect(z.threshold).toEqual([125, 125]);
    expect(z.vo2).toEqual([150, 150]);
  });

  it('no pasa de 50 W: se marca para revisar', () => {
    expect(rpeZonesFromRamp([s(50, 9)], 'rpe', '2026-10-13').flagLowCapacity).toBe(true);
    expect(rampReferenceWatts(rpeZonesFromRamp([s(50, 9)], 'rpe', '2026-10-13'))).toBeNull();
    expect(rpeZonesFromRamp([s(50, null)], 'hr', '2026-10-13').flagLowCapacity).toBe(true);
  });

  it('por pulso no hay zonas por RPE (todavía) ni referencia', () => {
    const z = rpeZonesFromRamp([s(50, null), s(75, null), s(100, null)], 'hr', '2026-10-13');
    expect(z).toMatchObject({ method: 'hr', endurance: null, threshold: null, vo2: null });
    expect(rampReferenceWatts(z)).toBeNull();
  });
});
