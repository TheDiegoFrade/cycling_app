import type { Workout } from '../core/types';
import { supabase } from '../supabase/client';

/** Mismo patrón de 3 estados que profile-sync: `undefined` = no se pudo
 * determinar (sin internet, error) — no tocar nada local con esto. Un
 * arreglo (posiblemente vacío) = fuente de verdad ya consultada en la nube. */
export async function fetchCloudWorkouts(userId: string): Promise<Workout[] | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from('workouts').select('data').eq('user_id', userId);
  if (error) {
    console.error('[workout-sync] no se pudieron leer los workouts remotos', error);
    return undefined;
  }
  return data.map((row) => row.data as Workout);
}

export async function pushWorkoutToCloud(workout: Workout, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('workouts').upsert({ id: workout.id, user_id: userId, data: workout });
    if (error) throw error;
  } catch (err) {
    console.error('[workout-sync] no se pudo sincronizar el workout', err);
  }
}

export async function deleteWorkoutFromCloud(id: string, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('workouts').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('[workout-sync] no se pudo borrar el workout de la nube', err);
  }
}
