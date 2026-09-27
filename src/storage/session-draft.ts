import type { SessionRecord } from './session-store';
import { dbDelete, dbGet, dbGetAll, dbPut, STORES } from './db';

/** Autosave de una sesión EN CURSO — se escribe cada pocos segundos mientras
 * se entrena, para que un cierre inesperado de la pestaña (el navegador la
 * descarta por memoria, se cae el proceso, etc.) pierda como mucho unos
 * segundos en vez de todo el entrenamiento. Se borra al terminar limpio
 * (ver train.ts). Si queda uno al arrancar la app, Inicio ofrece
 * recuperarlo. */
export type SessionDraft = Pick<SessionRecord, 'id' | 'workoutId' | 'workoutName' | 'startedAt' | 'ftp' | 'samples' | 'alerts' | 'intensityChanges'>;

export function saveDraft(draft: SessionDraft): Promise<IDBValidKey> {
  return dbPut(STORES.drafts, draft);
}

export function listDrafts(): Promise<SessionDraft[]> {
  return dbGetAll<SessionDraft>(STORES.drafts);
}

export function getDraft(id: string): Promise<SessionDraft | undefined> {
  return dbGet<SessionDraft>(STORES.drafts, id);
}

export function clearDraft(id: string): Promise<undefined> {
  return dbDelete(STORES.drafts, id);
}
