import type { AppSettings } from '../storage/settings-store';
import { supabase } from '../supabase/client';

/** Mismo patrón de 3 estados que profile-sync: `undefined` = no se pudo
 * determinar (sin internet, error), `null` = confirmado que no hay ajustes
 * en la nube todavía, `AppSettings` = fuente de verdad ya en la nube. */
export async function fetchCloudSettings(userId: string): Promise<AppSettings | null | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from('settings').select('data').eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('[settings-sync] no se pudieron leer los ajustes remotos', error);
    return undefined;
  }
  if (!data) return null;
  return data.data as AppSettings;
}

export async function pushSettingsToCloud(settings: AppSettings, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('settings').upsert({ user_id: userId, data: settings });
    if (error) throw error;
  } catch (err) {
    console.error('[settings-sync] no se pudieron sincronizar los ajustes', err);
  }
}
