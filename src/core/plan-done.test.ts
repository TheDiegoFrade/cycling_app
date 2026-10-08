import { describe, expect, it } from 'vitest';
import { pendingScheduled } from './plan-done';
import type { Workout } from './types';

function w(id: string, name: string): Workout {
  return { format_version: 1, id, name, intervals: [], created_at: '', scheduledDate: '2026-10-07' };
}

describe('pendingScheduled', () => {
  it('una sesión grabada desde el agendado lo quita (por id)', () => {
    const list = [w('a', 'PC Ajuste FTP'), w('b', 'Endurance')];
    expect(pendingScheduled(list, [{ workoutId: 'a', workoutName: 'Otro nombre' }]).map((x) => x.id)).toEqual(['b']);
  });

  it('sin id coincidente, empata por nombre (una sola vez)', () => {
    const list = [w('a', 'Endurance'), w('b', 'Endurance')];
    expect(pendingScheduled(list, [{ workoutId: 'fit-import', workoutName: ' endurance ' }]).map((x) => x.id)).toEqual(['b']);
  });

  it('fuerza/movilidad no consume un workout de bici; lo no entrenado sigue', () => {
    const list = [w('a', 'Fuerza')];
    expect(pendingScheduled(list, [{ workoutId: null, workoutName: 'Fuerza', nonBikeKind: 'strength' }])).toHaveLength(1);
    expect(pendingScheduled(list, [])).toHaveLength(1);
  });
});
