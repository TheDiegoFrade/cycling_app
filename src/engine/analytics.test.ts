import { describe, expect, it } from 'vitest';
import { computeSessionAnalytics } from './analytics';
import type { Profile, Sample } from '../core/types';

const profile: Profile = { ftp: 250, hr_max: 190, cadence_floor: 70, hr_ceiling: 176, hr_min: 0, cadence_max: 999 };

function samplesOf(count: number, power: number, cadence: number, hr: number, startT = 0): Sample[] {
  return Array.from({ length: count }, (_, i) => ({
    t: startT + i,
    power,
    cadence,
    hr,
    target: power,
    intensity: 100,
    interval_index: 0,
  }));
}

describe('computeSessionAnalytics: potencia constante', () => {
  const samples = samplesOf(600, 250, 90, 150); // 10 min exactos a FTP

  it('NP = potencia promedio cuando la potencia es constante', () => {
    const a = computeSessionAnalytics(samples, profile);
    expect(a.avgPower).toBe(250);
    expect(a.normalizedPower).toBeCloseTo(250, 5);
  });

  it('variability index es 1 con potencia constante', () => {
    const a = computeSessionAnalytics(samples, profile);
    expect(a.variabilityIndex).toBeCloseTo(1, 5);
  });

  it('intensity factor = NP / FTP', () => {
    const a = computeSessionAnalytics(samples, profile);
    expect(a.intensityFactor).toBeCloseTo(1, 5);
  });

  it('TSS de 10 min exactos a FTP es 16.67 (10/60 de una hora a IF=1)', () => {
    const a = computeSessionAnalytics(samples, profile);
    expect(a.trainingStressScore).toBeCloseTo((600 / 3600) * 100, 2);
  });

  it('efficiency factor = NP / pulso promedio', () => {
    const a = computeSessionAnalytics(samples, profile);
    expect(a.efficiencyFactor).toBeCloseTo(250 / 150, 5);
  });
});

describe('computeSessionAnalytics: potencia variable', () => {
  it('NP > potencia promedio cuando hay picos y valles (desigualdad de Jensen)', () => {
    const samples = [...samplesOf(90, 100, 90, 140), ...samplesOf(90, 300, 90, 160, 90)];
    const a = computeSessionAnalytics(samples, profile);
    expect(a.avgPower).toBeCloseTo(200, 5);
    expect(a.normalizedPower).toBeGreaterThan(a.avgPower);
  });
});

describe('computeSessionAnalytics: pulso caído (ceros) se excluye', () => {
  it('no arrastra el promedio ni el máximo de pulso hacia 0', () => {
    const samples = [...samplesOf(30, 200, 90, 150), ...samplesOf(10, 200, 90, 0), ...samplesOf(30, 200, 90, 160)];
    const a = computeSessionAnalytics(samples, profile);
    expect(a.avgHr).toBeGreaterThan(140);
    expect(a.maxHr).toBe(160);
  });

  it('sin ninguna lectura de pulso, avgHr y maxHr son 0 y no hay zonas de pulso', () => {
    const samples = samplesOf(30, 200, 90, 0);
    const a = computeSessionAnalytics(samples, profile);
    expect(a.avgHr).toBe(0);
    expect(a.maxHr).toBe(0);
    expect(a.hrZoneSeconds).toEqual([]);
  });
});

describe('computeSessionAnalytics: FTP no configurado', () => {
  it('intensity factor y TSS son null si ftp es 0', () => {
    const a = computeSessionAnalytics(samplesOf(60, 150, 90, 140), { ...profile, ftp: 0 });
    expect(a.intensityFactor).toBeNull();
    expect(a.trainingStressScore).toBeNull();
  });
});

describe('computeSessionAnalytics: curva de potencia', () => {
  it('omite las ventanas más largas que la sesión', () => {
    const a = computeSessionAnalytics(samplesOf(45, 200, 90, 140), profile);
    const windows = a.powerCurve.map((p) => p.windowS);
    expect(windows).toEqual([5, 30]); // 60, 300, 1200 no caben en 45 muestras
  });

  it('el mejor promedio de 5 s detecta un pico corto', () => {
    const samples = [...samplesOf(30, 100, 90, 140), ...samplesOf(5, 400, 90, 150, 30), ...samplesOf(30, 100, 90, 140, 35)];
    const a = computeSessionAnalytics(samples, profile);
    const peak5s = a.powerCurve.find((p) => p.windowS === 5);
    expect(peak5s?.watts).toBe(400);
  });
});

describe('computeSessionAnalytics: desacople aeróbico (Pw:HR)', () => {
  it('null en sesiones cortas (< 10 min)', () => {
    const a = computeSessionAnalytics(samplesOf(300, 200, 90, 150), profile);
    expect(a.hrDriftPct).toBeNull();
  });

  it('~0% cuando potencia y pulso se mantienen parejos toda la sesión', () => {
    const samples = samplesOf(1200, 200, 90, 150);
    const a = computeSessionAnalytics(samples, profile);
    expect(a.hrDriftPct).toBeCloseTo(0, 5);
  });

  it('positivo cuando el pulso sube para la misma potencia en la 2ª mitad', () => {
    const samples = [...samplesOf(600, 200, 90, 150), ...samplesOf(600, 200, 90, 165, 600)];
    const a = computeSessionAnalytics(samples, profile);
    expect(a.hrDriftPct).not.toBeNull();
    expect(a.hrDriftPct as number).toBeGreaterThan(0);
  });

  it('null si falta pulso en alguna mitad', () => {
    const samples = [...samplesOf(600, 200, 90, 150), ...samplesOf(600, 200, 90, 0, 600)];
    const a = computeSessionAnalytics(samples, profile);
    expect(a.hrDriftPct).toBeNull();
  });
});

describe('computeSessionAnalytics: tiempo en zona', () => {
  it('suma de segundos en zona de potencia es igual al total de muestras', () => {
    const samples = [...samplesOf(20, 100, 90, 140), ...samplesOf(20, 300, 90, 140, 20)];
    const a = computeSessionAnalytics(samples, profile);
    const total = a.powerZoneSeconds.reduce((acc, z) => acc + z.seconds, 0);
    expect(total).toBe(40);
    expect(a.powerZoneSeconds).toHaveLength(6);
  });

  it('zona de pulso solo cuenta segundos con lectura real (excluye ceros)', () => {
    const samples = [...samplesOf(20, 200, 90, 150), ...samplesOf(10, 200, 90, 0)];
    const a = computeSessionAnalytics(samples, profile);
    const total = a.hrZoneSeconds.reduce((acc, z) => acc + z.seconds, 0);
    expect(total).toBe(20);
  });
});
