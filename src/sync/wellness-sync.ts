// Bienestar diario (tabla wellness_days, ver supabase/schema.sql): la app lo
// trae de intervals.icu con la clave del atleta y lo guarda en la nube para
// que lo vean su coach y el coach de IA. Sin clave no pasa nada.
import { addDays } from '../engine/athlete-state';
import type { WellnessDay } from '../engine/wellness';
import { fetchWellness } from '../export/intervals-icu';
import type { IntervalsIcuCredentials } from '../export/intervals-icu';
import { supabase } from '../supabase/client';

export const WELLNESS_DAYS = 60;
const SYNC_EVERY_MS = 6 * 3600 * 1000;
const LAST_SYNC_KEY = 'torq.wellnessSyncedAt';

function lastSyncFor(userId: string): number {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_SYNC_KEY) ?? 'null') as {
      userId: string;
      at: number;
    } | null;
    return raw?.userId === userId ? raw.at : 0;
  } catch {
    return 0;
  }
}

/** Trae los últimos 60 días de intervals.icu y los sube. Como mucho cada 6
 * horas (o siempre con `force`). Falla en silencio: es un extra, no puede
 * frenar la sincronización ni el coach. Devuelve cuántos días subió. */
export async function syncWellnessFromIcu(userId: string, creds: IntervalsIcuCredentials | undefined, opts: { force?: boolean } = {}): Promise<number> {
  if (!supabase || !creds) return 0;
  if (!opts.force && Date.now() - lastSyncFor(userId) < SYNC_EVERY_MS) return 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const days = await fetchWellness(creds, addDays(today, -(WELLNESS_DAYS - 1)), today);
    if (days.length) {
      const { error } = await supabase.from('wellness_days').upsert(
        days.map((d) => ({
          user_id: userId,
          day: d.dateKey,
          hrv_ms: d.hrvMs,
          resting_hr: d.restingHr,
          sleep_h: d.sleepH,
          source: 'intervals.icu',
          updated_at: new Date().toISOString(),
        })),
      );
      if (error) throw error;
    }
    try {
      localStorage.setItem(LAST_SYNC_KEY, JSON.stringify({ userId, at: Date.now() }));
    } catch {
      /* sin storage: se vuelve a intentar la próxima vez */
    }
    return days.length;
  } catch (err) {
    console.warn('[wellness] no se pudo traer el bienestar de intervals.icu', err);
    return 0;
  }
}

/** Lo guardado en la nube (el propio atleta o, por RLS, su coach). */
export async function fetchWellnessDays(userId: string, sinceKey: string): Promise<WellnessDay[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('wellness_days')
    .select('day, hrv_ms, resting_hr, sleep_h')
    .eq('user_id', userId)
    .gte('day', sinceKey)
    .order('day');
  if (error) {
    console.warn('[wellness] no se pudo leer wellness_days', error);
    return [];
  }
  return (data ?? []).map((r: { day: string; hrv_ms: number | null; resting_hr: number | null; sleep_h: number | null }) => ({
    dateKey: r.day,
    hrvMs: r.hrv_ms,
    restingHr: r.resting_hr,
    sleepH: r.sleep_h,
  }));
}
