import type { Workout } from './types';

/** Lo agendado de un día que todavía no se entrena. Una sesión grabada
 * desde un workout agendado lo "consume" por id; si no trae id (importada,
 * otra versión), por nombre — así el día muestra una sola tarjeta. */
export function pendingScheduled(scheduledList: Workout[], completedList: readonly { workoutId?: string | null; workoutName: string; nonBikeKind?: unknown }[]): Workout[] {
  const remaining = [...scheduledList];
  const unmatched = completedList.filter((c) => !c.nonBikeKind);
  for (let i = unmatched.length - 1; i >= 0; i--) {
    const idx = remaining.findIndex((w) => w.id === unmatched[i].workoutId);
    if (idx >= 0) {
      remaining.splice(idx, 1);
      unmatched.splice(i, 1);
    }
  }
  for (const c of unmatched) {
    const idx = remaining.findIndex((w) => w.name.trim().toLowerCase() === c.workoutName.trim().toLowerCase());
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining;
}
