import { describe, expect, it } from 'vitest';
import { expandSegments, fallbackDescription, estimateTss, fitToCap, summarizeSegments, toGeneratedWorkout, totalMinutes } from './expand.ts';
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

describe('fitToCap', () => {
  const long: PlannedWorkout = {
    name: 'Fondo largo',
    dayOfWeek: 'sat',
    targetTSS: 80,
    erg: 'on',
    intent: 'Base aeróbica.',
    segments: [
      { repeat: 1, steps: [{ name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 50, ramp_to_pct: 65 }] },
      { repeat: 1, steps: [{ name: 'Fondo', type: 'steady', duration_s: 4800, power_pct: 68 }] },
      { repeat: 1, steps: [{ name: 'Enfriamiento', type: 'cooldown', duration_s: 300, power_pct: 50 }] },
    ],
  };

  it('no toca lo que ya cabe', () => {
    const r = fitToCap(threshold, 90);
    expect(r.trimmedS).toBe(0);
    expect(r.fits).toBe(true);
    expect(r.workout.segments).toEqual(threshold.segments);
  });

  it('recorta el bloque steady más largo hasta el tope, sin tocar el calentamiento', () => {
    expect(totalMinutes(long.segments)).toBe(95);
    const r = fitToCap(long, 90);
    expect(totalMinutes(r.workout.segments)).toBe(90);
    expect(r.trimmedS).toBe(300);
    expect(r.workout.segments[0].steps[0].duration_s).toBe(600);
    expect(r.workout.segments[1].steps[0].duration_s).toBe(4500);
    expect(long.segments[1].steps[0].duration_s).toBe(4800); // no muta el original
  });

  it('en una serie repetida recorta por repetición', () => {
    const w: PlannedWorkout = { ...long, segments: [{ repeat: 3, steps: [{ name: 'Tempo', type: 'steady', duration_s: 1200, power_pct: 80 }, { name: 'Rec', type: 'recovery', duration_s: 300, power_pct: 50 }] }] };
    const r = fitToCap(w, 60);
    expect(totalMinutes(r.workout.segments)).toBe(60);
    expect(r.workout.segments[0].steps[0].duration_s).toBe(900);
  });

  it('nunca recorta el bloque de un test, aunque no quepa', () => {
    const test: PlannedWorkout = {
      ...long,
      name: 'Test de 20 min',
      intent: 'Test de FTP autodosificado.',
      segments: [
        { repeat: 1, steps: [{ name: 'Calentamiento', type: 'warmup', duration_s: 1500, power_pct: 55 }] },
        { repeat: 1, steps: [{ name: 'Test 20 min', type: 'free', duration_s: 1200, power_pct: 100 }] },
        { repeat: 1, steps: [{ name: 'Suave', type: 'steady', duration_s: 600, power_pct: 55 }] },
      ],
    };
    const r = fitToCap(test, 45);
    expect(r.workout.segments[1].steps[0].duration_s).toBe(1200);
    expect(r.workout.segments[0].steps[0].duration_s).toBe(1500);
    expect(r.workout.segments[2].steps[0].duration_s).toBe(60);
    expect(r.fits).toBe(false);
  });
});

describe('selfPacedTestSteps', () => {
  const test20: PlannedWorkout = {
    name: 'Test de 20 min',
    dayOfWeek: 'sat',
    targetTSS: 70,
    erg: 'mixed',
    intent: 'Test de FTP: regula tú los 20 min.',
    segments: [
      { repeat: 1, steps: [{ name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 45, ramp_to_pct: 70 }] },
      { repeat: 3, steps: [{ name: 'Activación', type: 'interval', duration_s: 60, power_pct: 100 }, { name: 'Suave', type: 'recovery', duration_s: 60, power_pct: 50 }] },
      { repeat: 1, steps: [{ name: 'Test 20 min', type: 'interval', duration_s: 1200, power_pct: 100 }] },
      { repeat: 1, steps: [{ name: 'Enfriamiento', type: 'cooldown', duration_s: 720, power_pct: 45 }] },
    ],
  };

  it('el bloque máximo de un test sin ERG fijo corre como free; lo demás no cambia', () => {
    const iv = toGeneratedWorkout(test20, null).intervals;
    expect(iv.filter((i) => i.type === 'free').map((i) => i.name)).toEqual(['Test 20 min']);
    expect(iv.find((i) => i.name === 'Activación 1/3')?.type).toBe('interval'); // 1 min: no es el bloque del test
  });

  it('no toca la rampa ni workouts que no son test o van con ERG', () => {
    const ramp: PlannedWorkout = { ...test20, name: 'Test de rampa', erg: 'on' };
    expect(toGeneratedWorkout(ramp, null).intervals.some((i) => i.type === 'free')).toBe(false);
    expect(toGeneratedWorkout({ ...threshold, erg: 'off' }, null).intervals.some((i) => i.type === 'free')).toBe(false);
  });
});

describe('estimateTss', () => {
  const st = (duration_s: number, power_pct: number, ramp_to_pct?: number) => ({ name: 'x', type: 'steady' as const, duration_s, power_pct, ...(ramp_to_pct ? { ramp_to_pct } : {}) });
  it('una hora a FTP = 100; una hora al 65 % ≈ 42', () => {
    expect(estimateTss([{ repeat: 1, steps: [st(3600, 100)] }])).toBe(100);
    expect(estimateTss([{ repeat: 1, steps: [st(3600, 65)] }])).toBe(42);
  });
  it('los intervalos pesan más que su promedio (NP)', () => {
    const tss = estimateTss([{ repeat: 5, steps: [st(240, 115), st(240, 50)] }]);
    expect(tss).toBeGreaterThan(Math.round((2400 / 3600) * 0.825 ** 2 * 100));
  });
});
