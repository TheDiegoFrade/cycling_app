import { describe, expect, it } from 'vitest';
import { addDaysKey, isoWeekLabel, itemsFromWorkouts, scaleIntensity, weekDays, weekStartOf, workoutFromTemplate } from './plan-week';
import type { Workout } from './types';
import { validateWorkout } from './validator';
import { WORKOUT_TEMPLATES } from './workout-templates';

function workout(id: string, scheduledDate?: string): Workout {
  return {
    format_version: 1,
    id,
    name: id,
    intervals: [
      { name: 'Calentamiento', type: 'warmup', duration_s: 300, power_pct: 50, ramp_to_pct: 75 },
      { name: 'Bloque', type: 'steady', duration_s: 1200, power_pct: 90 },
    ],
    created_at: '2026-10-01T00:00:00.000Z',
    scheduledDate,
  };
}

describe('fechas de la semana', () => {
  it('lunes de la semana y sus 7 días', () => {
    expect(weekStartOf('2026-10-08')).toBe('2026-10-05'); // jueves -> lunes
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05');
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(weekDays('2026-10-05')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('semana ISO', () => {
    expect(isoWeekLabel('2026-10-05')).toBe('2026-W41');
    expect(isoWeekLabel('2026-12-28')).toBe('2026-W53');
    expect(isoWeekLabel('2027-01-04')).toBe('2027-W01');
  });
});

describe('itemsFromWorkouts', () => {
  it('toma solo lo agendado en esa semana, ordenado por día', () => {
    const items = itemsFromWorkouts([workout('b', '2026-10-09'), workout('a', '2026-10-06'), workout('x', '2026-10-12'), workout('lib')], '2026-10-05');
    expect(items.map((i) => i.workout.id)).toEqual(['a', 'b']);
    expect(items.every((i) => i.origin === 'athlete' && !i.edited)).toBe(true);
  });
});

describe('workoutFromTemplate', () => {
  it('arma un workout válido, agendado y dentro de los minutos permitidos', () => {
    const t = WORKOUT_TEMPLATES[0];
    const w = workoutFromTemplate(t, 10_000, '2026-10-07');
    expect(w.scheduledDate).toBe('2026-10-07');
    expect(w.name).toContain(String(t.maxMinutes));
    expect(validateWorkout(w).valid).toBe(true);
    expect(w.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('scaleIntensity', () => {
  it('sube y baja cada bloque, incluida la rampa, sin salirse de los límites', () => {
    const up = scaleIntensity(workout('a'), 5);
    expect(up.intervals.map((i) => i.power_pct)).toEqual([53, 95]);
    expect(up.intervals[0].ramp_to_pct).toBe(79);
    expect(up.intervals[1].ramp_to_pct).toBeUndefined();
    const down = scaleIntensity(workout('a'), -5);
    expect(down.intervals.map((i) => i.power_pct)).toEqual([48, 86]);
    expect(validateWorkout(up).valid).toBe(true);

    const extreme = scaleIntensity({ ...workout('a'), intervals: [{ name: 'x', type: 'steady', duration_s: 60, power_pct: 31 }] }, -50);
    expect(extreme.intervals[0].power_pct).toBe(30);
  });
});
