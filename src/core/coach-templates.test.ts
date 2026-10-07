import { describe, expect, it } from 'vitest';
import {
  routineFromTemplate,
  routineSummary,
  safeVideoUrl,
  validateBikeTemplate,
  validateRoutineTemplate,
  workoutFromBikeTemplate,
} from './coach-templates';
import type { RoutinePayload, SessionTemplate } from './coach-templates';
import { validateWorkout } from './validator';

const routine: RoutinePayload = {
  durationMin: 45,
  targetRpe: 6,
  exercises: [
    { name: 'Peso muerto rumano', dose: '3 × 8', videoUrl: 'https://youtu.be/x' },
    { name: 'Plancha lateral', dose: '3 × 30 s por lado' },
  ],
  note: 'Sin sentadilla profunda',
};

describe('safeVideoUrl', () => {
  it('solo acepta http(s)', () => {
    expect(safeVideoUrl('https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(safeVideoUrl('  http://x.com/v ')).toBe('http://x.com/v');
    expect(safeVideoUrl('javascript:alert(1)')).toBeNull();
    expect(safeVideoUrl('youtube.com/x')).toBeNull();
    expect(safeVideoUrl('')).toBeNull();
  });
});

describe('validateRoutineTemplate', () => {
  it('pide nombre, ejercicios con nombre y links seguros', () => {
    expect(validateRoutineTemplate('Fuerza · tren inferior', routine)).toEqual([]);
    expect(validateRoutineTemplate('', { exercises: [] })).toHaveLength(2);
    expect(validateRoutineTemplate('x', { exercises: [{ name: '', dose: '', videoUrl: 'ftp://x' }] })).toHaveLength(2);
    expect(validateRoutineTemplate('x', { ...routine, targetRpe: 11 })).toHaveLength(1);
  });
});

describe('validateBikeTemplate', () => {
  it('usa el mismo validador que los workouts', () => {
    expect(validateBikeTemplate('Z2', { intervals: [{ name: 'Z2', type: 'steady', duration_s: 3600, power_pct: 65 }] })).toEqual([]);
    expect(validateBikeTemplate('Z2', { intervals: [] })).toHaveLength(1);
    expect(validateBikeTemplate('', { intervals: [{ name: 'x', type: 'steady', duration_s: -5, power_pct: 65 }] }).length).toBeGreaterThan(1);
  });
});

describe('copias agendables', () => {
  it('bici: workout válido con id nuevo y fecha', () => {
    const t: SessionTemplate = { id: 't1', name: 'Sweet spot', kind: 'bike', payload: { intervals: [{ name: 'SS', type: 'steady', duration_s: 1200, power_pct: 90 }] }, updatedAt: '' };
    const w = workoutFromBikeTemplate(t, '2026-10-14');
    expect(w.id).not.toBe('t1');
    expect(w.scheduledDate).toBe('2026-10-14');
    expect(validateWorkout(w).valid).toBe(true);
    // copia, no referencia
    w.intervals[0].power_pct = 50;
    expect(t.payload.intervals[0].power_pct).toBe(90);
  });

  it('rutina: copia con id nuevo y descarta links inseguros', () => {
    const t: SessionTemplate = { id: 't2', name: 'Fuerza', kind: 'strength', payload: { exercises: [{ name: 'a', dose: '1', videoUrl: 'javascript:x' }] }, updatedAt: '' };
    const r = routineFromTemplate(t, '2026-10-13');
    expect(r.id).not.toBe('t2');
    expect(r.kind).toBe('strength');
    expect(r.payload.exercises[0].videoUrl).toBeUndefined();
  });

  it('resumen de la rutina', () => {
    expect(routineSummary(routine)).toBe('2 ejercicios · 45 min · RPE 6');
  });
});
