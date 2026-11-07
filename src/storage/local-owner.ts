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

/** Lo que es de la persona y no del navegador: guías de Piñón ya vistas,
 * su historial de chat, logros vistos, avisos que cerró y sus preferencias
 * de vistas. Si entra otra cuenta en el mismo navegador, se borra: si no,
 * la cuenta nueva no veía las guías (ya vistas por la anterior) y podía ver
 * el chat de Piñón de otra persona. */
const LAST_USER_KEY = 'torq.local_last_user';
const PERSONAL_PREFIXES = ['torq.pinon.', 'torq.onboarding.draft.', 'torq.seenAchievements', 'torq.ftpOfferDismissed', 'torq.formaAnalysisDays', 'torq.coachAnalysisDays'];

/** Borra lo personal si `userId` no es la última cuenta que entró aquí.
 * Cerrar sesión y volver a entrar con la misma cuenta no borra nada; la
 * primera vez (sin última cuenta guardada) tampoco. */
export function clearPersonalPrefsIfOtherUser(userId: string, storage: Storage = localStorage): void {
  const last = storage.getItem(LAST_USER_KEY);
  if (last && last !== userId) {
    const doomed: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && PERSONAL_PREFIXES.some((p) => k.startsWith(p))) doomed.push(k);
    }
    doomed.forEach((k) => storage.removeItem(k));
  }
  storage.setItem(LAST_USER_KEY, userId);
}

export async function ensureLocalDataOwnership(userId: string | null): Promise<void> {
  if (userId) clearPersonalPrefsIfOtherUser(userId);
  const owner = localStorage.getItem(OWNER_KEY);
  const current = userId ?? '';
  if (owner === current) return;
  await Promise.all([dbClear(STORES.profile), dbClear(STORES.workouts), dbClear(STORES.sessions), dbClear(STORES.drafts)]);
  // Sin sesión también se guarda el dueño ('' = sin cuenta): antes se quitaba
  // la clave, y en el siguiente arranque null !== '' borraba todo otra vez —
  // sin nube (modo local) se perdían los datos en cada recarga.
  localStorage.setItem(OWNER_KEY, current);
}
