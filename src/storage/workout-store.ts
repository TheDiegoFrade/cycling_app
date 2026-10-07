import type { Workout } from '../core/types';
import { dbDelete, dbGet, dbGetAll, dbPut, STORES } from './db';

export function listWorkouts(): Promise<Workout[]> {
  return dbGetAll<Workout>(STORES.workouts);
}

export function saveWorkout(workout: Workout): Promise<IDBValidKey> {
  return dbPut(STORES.workouts, workout);
}

export function deleteWorkout(id: string): Promise<undefined> {
  return dbDelete(STORES.workouts, id);
}

// Marca si ya se hizo la migración "subir mis workouts locales a la nube
// porque la nube está vacía" para este usuario en este navegador — ver
// syncFromCloud en ui/state.ts. Sin esto, la nube quedando en cero por un
// borrado legítimo (p. ej. el coach dando de baja un plan) se confunde con
// "usuario nuevo que nunca sincronizó" y resucita lo que se acaba de borrar
// en cada sync. ensureLocalDataOwnership ya limpia todo lo local (incluida
// esta bandera) cuando cambia el dueño, así que un usuario nuevo en este
// navegador sí vuelve a calificar para la migración de una sola vez.
const WORKOUTS_MIGRATED_KEY = 'workoutsMigratedToCloud';

export async function hasMigratedWorkoutsToCloud(): Promise<boolean> {
  return (await dbGet<boolean>(STORES.profile, WORKOUTS_MIGRATED_KEY)) === true;
}

export function markWorkoutsMigratedToCloud(): Promise<IDBValidKey> {
  return dbPut(STORES.profile, true, WORKOUTS_MIGRATED_KEY);
}
