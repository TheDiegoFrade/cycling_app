import type { Workout } from '../core/types';
import { dbDelete, dbGetAll, dbPut, STORES } from './db';

export function listWorkouts(): Promise<Workout[]> {
  return dbGetAll<Workout>(STORES.workouts);
}

export function saveWorkout(workout: Workout): Promise<IDBValidKey> {
  return dbPut(STORES.workouts, workout);
}

export function deleteWorkout(id: string): Promise<undefined> {
  return dbDelete(STORES.workouts, id);
}
