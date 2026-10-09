import { describe, expect, it } from 'vitest';
import { computeSessionMetrics } from './session-metrics';
import type { Sample } from '../core/types';

const FTP = 250;

/** n segundos con la función f(i) para power/cadence/hr/target. */
function seg(n: number, f: (i: number) => Partial<Sample>, interval_index = 0): Sample[] {
  return Array.from({ length: n }, (_, i) => ({ t: i, power: 0, cadence: 90, hr: 140, target: 0, intensity: 1, interval_index, ...f(i) }));
}
const concat = (...parts: Sample[][]) => parts.flat().map((s, t) => ({ ...s, t }));

describe('computeSessionMetrics', () => {
  it('nada con menos de un minuto o sin FTP', () => {
    expect(computeSessionMetrics(seg(30, () => ({ power: 200 })), FTP)).toBeNull();
    expect(computeSessionMetrics(seg(600, () => ({ power: 200 })), 0)).toBeNull();
  });

  it('curva con 8 y 60 min, kJ y zonas', () => {
    const m = computeSessionMetrics(seg(3600, (i) => ({ power: i < 480 ? 300 : 170 })), FTP)!;
    expect(m.curve.m8).toBe(300);
    expect(m.curve.m60).toBe(Math.round((480 * 300 + 3120 * 170) / 3600));
    expect(m.kJ).toBe(Math.round((480 * 300 + 3120 * 170) / 1000));
    expect(m.zoneSec).toEqual([0, 3120, 0, 0, 0, 480]); // 170 W = 68 % (Z2), 300 W = 120 % (Z6)
  });

  it('un bloque a potencia fija con el objetivo del ERG es erg_fixed, aun en un test', () => {
    const erg = seg(1200, (i) => ({ power: 170 + ((i * 7) % 5) - 2, target: 170 }));
    const m = computeSessionMetrics(erg, 200, { isTest: true })!;
    expect(m.curveQuality.m20).toBe('erg_fixed');
    // samples de un .fit: sin objetivo, cuenta solo la variación
    expect(computeSessionMetrics(erg.map((s) => ({ ...s, target: 0 })), 200, { isTest: true })!.curveQuality.m20).toBe('erg_fixed');
  });

  it('un bloque libre o un test sin ERG fijo son esfuerzos máximos; lo demás es incidental', () => {
    const selfPaced = concat(
      seg(600, () => ({ power: 150, target: 150 }), 0),
      seg(1200, (i) => ({ power: 270 + ((i % 30) - 15) * 2, target: 250 }), 1),
    );
    expect(computeSessionMetrics(selfPaced, FTP, { selfPacedIntervals: [1] })!.curveQuality.m20).toBe('max_effort');
    expect(computeSessionMetrics(selfPaced, FTP)!.curveQuality.m20).toBeUndefined(); // incidental no se guarda
    expect(computeSessionMetrics(selfPaced, FTP, { isTest: true })!.curveQuality.m5).toBe('max_effort');
  });

  it('torque y minutos a cadencia baja con carga', () => {
    const m = computeSessionMetrics(seg(600, (i) => (i < 300 ? { power: 230, cadence: 60 } : { power: 150, cadence: 95 })), FTP)!;
    expect(m.torque!.maxNm).toBe(Math.round(((9.549 * 230) / 60) * 10) / 10);
    expect(m.torque!.lowCadenceMin).toBe(5); // 230 W = 92 % FTP a 60 rpm
    expect(computeSessionMetrics(seg(120, () => ({ power: 0, cadence: 0 })), FTP)!.torque).toBeNull();
  });

  it('tiempo a umbral: una caída corta no corta el bloque', () => {
    const m = computeSessionMetrics(
      concat(
        seg(300, () => ({ power: 150 })),
        seg(600, () => ({ power: 250 })),
        seg(5, () => ({ power: 100 })),
        seg(600, () => ({ power: 250 })),
        seg(300, () => ({ power: 150 })),
      ),
      FTP,
    )!;
    expect(m.threshold.longestMin).toBeGreaterThan(19);
    expect(m.threshold.totalMin).toBeGreaterThan(18);
    // dos series de 10 min con 2 min de recuperación: dos bloques de 10
    const split = computeSessionMetrics(concat(seg(600, () => ({ power: 250 })), seg(120, () => ({ power: 120 })), seg(600, () => ({ power: 250 }))), FTP)!;
    expect(split.threshold.longestMin).toBeLessThan(11);
    expect(split.threshold.totalMin).toBeGreaterThan(18);
  });

  it('sesión estable solo si es larga, pareja y de intensidad aeróbica', () => {
    expect(computeSessionMetrics(seg(3000, () => ({ power: 175 })), FTP)!.steady).toBe(true); // IF 0.70
    expect(computeSessionMetrics(seg(1800, () => ({ power: 175 })), FTP)!.steady).toBe(false); // corta
    expect(computeSessionMetrics(seg(3000, () => ({ power: 240 })), FTP)!.steady).toBe(false); // IF 0.96
    expect(computeSessionMetrics(seg(3000, (i) => ({ power: i % 120 < 30 ? 400 : 120 })), FTP)!.steady).toBe(false); // intervalos
  });
});
