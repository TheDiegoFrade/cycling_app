import { describe, expect, it } from 'vitest';
import { readTest, testBlockOf } from './test-reading';
import type { Interval, Sample } from './types';

const test20: Interval[] = [
  { name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 45, ramp_to_pct: 70 },
  { name: 'Activación', type: 'interval', duration_s: 60, power_pct: 100 },
  { name: 'Test 20 min', type: 'interval', duration_s: 1200, power_pct: 85 },
  { name: 'Enfriamiento', type: 'cooldown', duration_s: 600, power_pct: 45 },
];

function block(index: number, n: number, f: (i: number) => Partial<Sample>): Sample[] {
  return Array.from({ length: n }, (_, i) => ({ t: i, power: 0, cadence: 0, hr: 0, target: 0, intensity: 1, interval_index: index, ...f(i) }));
}

describe('testBlockOf', () => {
  it('reconoce rampa, 20 min y otro', () => {
    expect(testBlockOf([{ name: 'r', type: 'interval', duration_s: 1500, power_pct: 50, ramp_to_pct: 200 }])).toEqual({ index: 0, type: 'ramp' });
    expect(testBlockOf(test20)).toEqual({ index: 2, type: 'test20' });
    expect(testBlockOf([test20[0], { name: 'Escalón', type: 'steady', duration_s: 240, power_pct: 90 }])).toEqual({ index: 1, type: 'other' });
    expect(testBlockOf([])).toBeNull();
  });
});

describe('readTest', () => {
  it('caso real: 20 min a 170 W fijos por ERG con el pulso subiendo', () => {
    // Potencia pegada al objetivo (ruido de ±2 W), pulso de ~162 a ~180 lineal,
    // cadencia que cae de 78 a 72.
    const samples = block(2, 1200, (i) => ({
      power: 170 + ((i * 7) % 5) - 2,
      hr: 160.5 + i / 60,
      cadence: i < 600 ? 78 : 72,
      target: 170,
    }));
    const r = readTest({ startedAt: '2026-10-07T18:00:00Z', ftp: 200, samples }, test20, 182);
    expect(r).toMatchObject({
      date: '2026-10-07',
      type: 'test20',
      ergFixed: true,
      blockMinutes: 20,
      avgPowerW: 170,
      powerFadePct: null,
      hrStart: 162,
      hrEnd: 180,
      hrSlopeBpmPerMin: 1,
      hrEndPctOfMax: 99,
      cadenceDeltaRpm: -6,
      completed: true,
      ftpInUseW: 200,
    });
    expect(r!.hrHalvesDeltaPct).toBeCloseTo(6, 0);
  });

  it('20 min autodosificado: no es ERG fijo y mide la caída de potencia', () => {
    const samples = block(2, 1200, (i) => ({ power: (i < 600 ? 250 : 240) + ((i % 20) - 10) * 1.5, hr: 165, cadence: 90 }));
    const r = readTest({ startedAt: '2026-10-07T18:00:00Z', ftp: 230, samples }, test20, 190)!;
    expect(r.ergFixed).toBe(false);
    expect(r.powerFadePct).toBeCloseTo(-4, 0);
    expect(r.hrSlopeBpmPerMin).toBe(0);
  });

  it('rampa: mejor minuto, sin caída de potencia, completa con 3 min o más', () => {
    const ramp: Interval[] = [{ name: 'Rampa', type: 'interval', duration_s: 1500, power_pct: 50, ramp_to_pct: 200 }];
    const samples = block(0, 840, (i) => ({ power: 100 + i * 0.3, hr: 120 + i * 0.07, cadence: 90 }));
    const r = readTest({ startedAt: '2026-10-07T18:00:00Z', ftp: 200, samples }, ramp, 190)!;
    expect(r.type).toBe('ramp');
    expect(r.best1MinW).toBe(343); // promedio de los últimos 60 s
    expect(r.powerFadePct).toBeNull();
    expect(r.completed).toBe(true);
  });

  it('test interrumpido y sin pulso', () => {
    const samples = block(2, 400, () => ({ power: 230, cadence: 85 }));
    const r = readTest({ startedAt: '2026-10-07T18:00:00Z', ftp: 200, samples }, test20, 185)!;
    expect(r.completed).toBe(false);
    expect(r.hrStart).toBeNull();
    expect(r.hrSlopeBpmPerMin).toBeNull();
    expect(readTest({ startedAt: '2026-10-07', ftp: 200, samples: samples.slice(0, 30) }, test20, 185)).toBeNull();
  });
});
