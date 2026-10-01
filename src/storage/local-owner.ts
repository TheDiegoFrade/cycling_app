import { dbClear, STORES } from './db';

/** IndexedDB ('rodillo') no está particionado por usuario — es un único set
 * de claves fijas por navegador. Si dos personas comparten el mismo
 * navegador/dispositivo (login A, logout, login B), sin este chequeo B vería
 * los datos de A al cargar (perfil/ajustes/workouts/sesiones), y peor: si la
 * cuenta de B está vacía en la nube, state.ts interpretaría eso como
 * "migrar lo local" y subiría los datos de A a la cuenta de B en Supabase.
 * Esto guarda qué usuario es dueño de la copia local actual y la borra por
 * completo en cuanto detecta un usuario distinto, antes de leer o
 * sincronizar nada. */
const OWNER_KEY = 'torq.local_data_owner';

export async function ensureLocalDataOwnership(userId: string | null): Promise<void> {
  const owner = localStorage.getItem(OWNER_KEY);
  const current = userId ?? '';
  if (owner === current) return;
  await Promise.all([dbClear(STORES.profile), dbClear(STORES.workouts), dbClear(STORES.sessions), dbClear(STORES.drafts)]);
  if (userId) localStorage.setItem(OWNER_KEY, userId);
  else localStorage.removeItem(OWNER_KEY);
}
