import { describe, expect, it } from 'vitest';
import { WORKOUT_TEMPLATES, findTemplate } from './workout-templates';
import { validateWorkout } from './validator';

function totalDuration(intervals: { duration_s: number }[]): number {
  return intervals.reduce((acc, i) => acc + i.duration_s, 0);
}

function asWorkout(intervals: ReturnType<(typeof WORKOUT_TEMPLATES)[number]['build']>) {
  return {
    format_version: 1 as const,
    id: 'w1',
    name: 'test',
    intervals,
    created_at: new Date(0).toISOString(),
  };
}

describe('WORKOUT_TEMPLATES', () => {
  it('cada plantilla es válida según el validador en su duración por defecto', () => {
    for (const t of WORKOUT_TEMPLATES) {
      const intervals = t.build(t.defaultMinutes);
      expect(intervals.length).toBeGreaterThan(0);
      expect(validateWorkout(asWorkout(intervals)).errors).toEqual([]);
    }
  });

  it('cada plantilla es válida en sus extremos min y max de duración', () => {
    for (const t of WORKOUT_TEMPLATES) {
      for (const minutes of [t.minMinutes, t.maxMinutes]) {
        const intervals = t.build(minutes);
        const result = validateWorkout(asWorkout(intervals));
        expect(result.errors, `${t.id} @ ${minutes}min: ${result.errors.join('; ')}`).toEqual([]);
      }
    }
  });

  it('z2 y recuperación duran exactamente los minutos pedidos (bloques continuos)', () => {
    const z2 = findTemplate('z2')!;
    expect(totalDuration(z2.build(45))).toBe(45 * 60);
    expect(totalDuration(z2.build(20))).toBe(20 * 60);

    const recovery = findTemplate('recovery')!;
    expect(totalDuration(recovery.build(30))).toBe(30 * 60);
  });

  it('las plantillas de intervalos ajustan las repeticiones para acercarse a la duración pedida', () => {
    const vo2 = findTemplate('vo2max')!;
    const intervals = vo2.build(40);
    const reps = intervals.filter((i) => i.type === 'interval').length;
    expect(reps).toBeGreaterThanOrEqual(3);
    expect(reps).toBeLessThanOrEqual(6);
    // calentamiento(10) + enfriamiento(8) + reps*3 + (reps-1)*3, a lo más un ciclo de diferencia con lo pedido
    expect(Math.abs(totalDuration(intervals) / 60 - 40)).toBeLessThanOrEqual(6);
  });

  it('más minutos pedidos nunca generan menos repeticiones', () => {
    for (const id of ['sweet_spot', 'threshold', 'vo2max']) {
      const t = findTemplate(id)!;
      const repsAt = (m: number) => t.build(m).filter((i) => i.type === 'interval').length;
      expect(repsAt(t.maxMinutes)).toBeGreaterThanOrEqual(repsAt(t.minMinutes));
    }
  });

  it('la última repetición de un bloque de intervalos nunca deja un descanso colgado al final', () => {
    for (const id of ['sweet_spot', 'threshold', 'vo2max']) {
      const t = findTemplate(id)!;
      const intervals = t.build(t.defaultMinutes);
      const last = intervals[intervals.length - 1];
      expect(last.type).toBe('cooldown');
      const secondToLast = intervals[intervals.length - 2];
      expect(secondToLast.type).toBe('interval');
    }
  });

  it('findTemplate devuelve undefined para un id que no existe', () => {
    expect(findTemplate('no-existe')).toBeUndefined();
  });
});
