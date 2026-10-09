// Quitar una sesión del plan, con su motivo (Edge Function plan-remove-workout).
// El servidor la borra, la anota en el plan para weekly_eval y la saca del
// borrador abierto del coach, si hay uno.
import { supabase } from '../supabase/client';

export type RemovalReason = 'time' | 'fatigue' | 'pain' | 'other';

export const REMOVAL_REASONS: { value: RemovalReason; label: string }[] = [
  { value: 'time', label: 'Sin tiempo' },
  { value: 'fatigue', label: 'Cansancio' },
  { value: 'pain', label: 'Molestia o dolor' },
  { value: 'other', label: 'Otro' },
];

export const removalReasonLabel = (r: RemovalReason) => REMOVAL_REASONS.find((x) => x.value === r)?.label ?? r;

/** Como queda guardada en training_plans.data.removedWorkouts. */
export interface RemovedWorkout {
  id: string;
  name: string;
  date: string | null;
  weekIndex: number;
  plannedTss: number | null;
  reason: RemovalReason;
  note: string | null;
  at: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Sin conexión a la nube');
  const { data, error } = await supabase.functions.invoke('plan-remove-workout', { body });
  if (error || data?.error) {
    let message = data?.error as string | undefined;
    if (!message && error && 'context' in error) {
      try {
        message = (await (error as unknown as { context: Response }).context.json())?.error;
      } catch {
        // sin JSON: nos quedamos con error.message
      }
    }
    throw new Error(message ?? error?.message ?? 'error desconocido');
  }
  return data as T;
}

/** El atleta quita una sesión suya que todavía no entrenó. */
export function removeFromPlan(workoutId: string, reason: RemovalReason, note: string | null, plannedTss: number | null): Promise<{ removed: true; fromPlan: boolean }> {
  return invoke({ action: 'remove', workoutId, reason, note, plannedTss });
}

/** Lo que quitó un atleta (para su coach), más reciente primero. */
export async function listAthleteRemovals(athleteId: string): Promise<RemovedWorkout[]> {
  return (await invoke<{ removed: RemovedWorkout[] }>({ action: 'list', athleteId })).removed ?? [];
}
