import { describe, expect, it } from 'vitest';
import {
  isRideKind,
  plannedKindLabel,
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

describe('mensajes del .zwo', () => {
  it('se conservan al importar a la biblioteca y al agendar', async () => {
    const { bikePayloadFromWorkout, personalWorkoutFromBikeTemplate } = await import('./coach-templates');
    const imported = {
      format_version: 1 as const,
      id: 'x',
      name: 'Over-unders',
      intervals: [{ name: 'SS', type: 'steady' as const, duration_s: 600, power_pct: 90 }],
      comments: [{ at_s: 30, message: '¡Arriba la cadencia!' }],
      created_at: '',
    };
    const payload = bikePayloadFromWorkout(imported);
    expect(payload.comments).toEqual([{ at_s: 30, message: '¡Arriba la cadencia!' }]);
    const t: SessionTemplate = { id: 't', name: 'Over-unders', kind: 'bike', payload, updatedAt: '' };
    const scheduled = workoutFromBikeTemplate(t, '2026-10-14');
    expect(scheduled.comments?.[0].message).toBe('¡Arriba la cadencia!');
    expect(validateWorkout(scheduled).valid).toBe(true);
    const mine = personalWorkoutFromBikeTemplate(t);
    expect(mine.scheduledDate).toBeUndefined();
    expect(mine.comments).toHaveLength(1);
    expect(mine.id).not.toBe('t');
  });
});

describe('extras del coach de IA en el calendario', () => {
  it('sin ejercicios no dice «0 ejercicios»', () => {
    expect(routineSummary({ exercises: [], durationMin: 90 })).toBe('90 min');
  });

  it('el gimnasio de la IA es sugerencia; salida y técnica se ruedan', () => {
    expect(plannedKindLabel({ kind: 'strength', source: 'ai' })).toBe('Gimnasio (sugerencia)');
    expect(plannedKindLabel({ kind: 'strength', source: 'coach' })).toBe('Fuerza');
    expect(plannedKindLabel({ kind: 'skills', source: 'ai' })).toBe('Técnica en montaña');
    expect(['outdoor', 'skills', 'strength'].map((k) => isRideKind(k as 'outdoor'))).toEqual([true, true, false]);
  });
});
