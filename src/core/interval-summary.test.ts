import { describe, expect, it } from 'vitest';
import { summarizeIntervals } from './interval-summary';
import type { Interval } from './types';

const iv = (name: string, min: number, pct: number, type: Interval['type'] = 'interval'): Interval => ({ name, type, duration_s: min * 60, power_pct: pct });

describe('summarizeIntervals', () => {
  it('agrupa series repetidas aunque los nombres cambien', () => {
    const list = [iv('Calentamiento', 10, 55, 'warmup'), iv('Umbral 1', 8, 97), iv('Rec', 4, 55, 'recovery'), iv('Umbral 2', 8, 97), iv('Rec', 4, 55, 'recovery'), iv('Umbral 3', 8, 97), iv('Rec', 4, 55, 'recovery'), iv('Enfriar', 5, 50, 'cooldown')];
    expect(summarizeIntervals(list)).toBe('Calentamiento 10 min 55 % · 3× (Umbral 1 8 min 97 %, Rec 4 min 55 %) · Enfriar 5 min 50 %');
  });

  it('sin repeticiones lista cada bloque y recorta si es muy largo', () => {
    expect(summarizeIntervals([iv('A', 0.5, 120), { ...iv('B', 10, 60, 'steady'), ramp_to_pct: 80 }])).toBe('A 30 s 120 % · B 10 min 60→80 %');
    expect(summarizeIntervals(Array.from({ length: 50 }, (_, i) => iv(`B${i}`, 1 + i, 60 + i)), 40)).toHaveLength(40);
  });
});
