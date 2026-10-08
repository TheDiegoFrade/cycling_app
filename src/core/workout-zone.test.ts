import { describe, expect, it } from 'vitest';
import { mainZoneOf } from './workout-zone';
import type { Interval } from './types';

const wu: Interval = { name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 50, ramp_to_pct: 75 };
const rec: Interval = { name: 'Rec', type: 'recovery', duration_s: 240, power_pct: 55 };
const z = (intervals: Interval[], name = 'Sesión', kind?: 'test') => mainZoneOf({ name, kind, intervals });
const rep = (n: number, ivs: Interval[]) => Array.from({ length: n }, () => ivs).flat();

describe('mainZoneOf', () => {
  it('clasifica por el bloque que es el propósito de la sesión', () => {
    expect(z([wu, { name: 'Z2', type: 'steady', duration_s: 3600, power_pct: 68 }])).toBe('fondo');
    expect(z([wu, { name: 'Tempo', type: 'steady', duration_s: 1200, power_pct: 80 }])).toBe('tempo');
    expect(z([wu, ...rep(3, [{ name: 'SS', type: 'interval', duration_s: 720, power_pct: 90 }, rec])])).toBe('sweet spot');
    expect(z([wu, ...rep(4, [{ name: 'U', type: 'interval', duration_s: 480, power_pct: 98 }, rec])])).toBe('umbral');
    expect(z([wu, ...rep(5, [{ name: 'V', type: 'interval', duration_s: 180, power_pct: 118 }, rec])])).toBe('VO2');
  });

  it('un pico suelto no cambia la zona, y el calentamiento no cuenta', () => {
    expect(z([{ ...wu, ramp_to_pct: 120 }, { name: 'Z2', type: 'steady', duration_s: 3000, power_pct: 65 }, { name: 'Sprint', type: 'interval', duration_s: 15, power_pct: 200 }])).toBe('fondo');
  });

  it('test por kind o por nombre; la escalera de ajuste no es test', () => {
    expect(z([wu], 'Cualquier nombre', 'test')).toBe('test');
    expect(z([wu], 'Test de rampa')).toBe('test');
    expect(z([wu, { name: 'E', type: 'steady', duration_s: 240, power_pct: 70 }], 'Escalera de ajuste')).toBe('fondo');
  });
});
