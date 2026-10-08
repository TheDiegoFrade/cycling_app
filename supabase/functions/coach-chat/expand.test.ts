import { describe, expect, it } from 'vitest';
import { expandSegments, fallbackDescription, summarizeSegments, toGeneratedWorkout, totalMinutes } from './expand.ts';
import type { PlannedWorkout } from './expand.ts';

const threshold: PlannedWorkout = {
  name: 'Umbral 4×8',
  dayOfWeek: 'tue',
  targetTSS: 70,
  erg: 'on',
  intent: 'Sube tu umbral con bloques sostenidos.',
  segments: [
    { repeat: 1, steps: [{ name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 50, ramp_to_pct: 70 }] },
    {
      repeat: 4,
      steps: [
        { name: 'Umbral', type: 'interval', duration_s: 480, power_pct: 97 },
        { name: 'Recuperación', type: 'recovery', duration_s: 240, power_pct: 55 },
      ],
    },
    { repeat: 1, steps: [{ name: 'Enfriamiento', type: 'cooldown', duration_s: 480, power_pct: 50 }] },
  ],
};

describe('expandSegments', () => {
  it('desenrolla las series y numera cada repetición', () => {
    const iv = expandSegments(threshold.segments);
    expect(iv).toHaveLength(10);
    expect(iv[0]).toEqual({ name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 50, ramp_to_pct: 70 });
    expect(iv.slice(1, 5).map((i) => i.name)).toEqual(['Umbral 1/4', 'Recuperación 1/4', 'Umbral 2/4', 'Recuperación 2/4']);
    expect(iv[9].name).toBe('Enfriamiento');
    expect(totalMinutes(threshold.segments)).toBe(66);
  });

  it('acota repeticiones absurdas', () => {
    expect(expandSegments([{ repeat: 0, steps: [{ name: 'A', type: 'steady', duration_s: 60, power_pct: 60 }] }])).toHaveLength(1);
    expect(expandSegments([{ repeat: 99, steps: [{ name: 'A', type: 'steady', duration_s: 60, power_pct: 60 }] }])).toHaveLength(30);
  });
});

describe('resumen y respaldo', () => {
  it('resume para el redactor', () => {
    expect(summarizeSegments(threshold.segments)).toBe(
      'Calentamiento 10 min al 50→70 % FTP · 4× (Umbral 8 min al 97 % FTP, Recuperación 4 min al 55 % FTP) · Enfriamiento 8 min al 50 % FTP',
    );
  });

  it('sin descripción del redactor usa intención + ERG', () => {
    expect(fallbackDescription({ intent: 'Rodada suave. ', erg: 'off' })).toBe('Rodada suave. Apaga el modo ERG y ve por sensación.');
    const w = toGeneratedWorkout(threshold, null);
    expect(w.description).toContain('Activa el modo ERG');
    expect(w.intervals).toHaveLength(10);
    expect(toGeneratedWorkout(threshold, '  Hoy toca umbral.  ').description).toBe('Hoy toca umbral.');
  });
});
