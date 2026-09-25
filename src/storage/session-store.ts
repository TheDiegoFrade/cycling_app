import type { RuleLevel, Sample } from '../core/types';
import { dbDelete, dbGetAll, dbPut, STORES } from './db';

export interface SessionRecord {
  id: string;
  workoutId: string;
  workoutName: string;
  startedAt: string;
  finishedAt: string;
  ftp: number;
  samples: Sample[];
  alerts: { t: number; level: RuleLevel; message: string }[];
  intensityChanges: { t: number; pct: number }[];
  /** Feedback subjetivo capturado después de terminar, en Resumen — no se
   * pide al cortar el entrenamiento para no interrumpir ese flujo. */
  rpe?: number;
  note?: string;
  /** Si esta sesión vino de importar una actividad de Strava, su id ahí —
   * evita importar la misma dos veces. Ver sync/strava.ts. */
  stravaActivityId?: number;
}

export function listSessions(): Promise<SessionRecord[]> {
  return dbGetAll<SessionRecord>(STORES.sessions);
}

export function saveSession(session: SessionRecord): Promise<IDBValidKey> {
  return dbPut(STORES.sessions, session);
}

export function deleteSession(id: string): Promise<undefined> {
  return dbDelete(STORES.sessions, id);
}
