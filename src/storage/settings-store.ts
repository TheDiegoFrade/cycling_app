import { dbGet, dbPut, STORES } from './db';

export interface AppSettings {
  factoryRulesEnabled: { cadenceFloor: boolean; hrCeiling: boolean; ergDetached: boolean };
  soundVolume: number; // 0..1
  intervalsIcu?: { athleteId: string; apiKey: string };
}

export const DEFAULT_SETTINGS: AppSettings = {
  factoryRulesEnabled: { cadenceFloor: true, hrCeiling: true, ergDetached: true },
  soundVolume: 0.6,
};

const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<AppSettings> {
  const stored = await dbGet<AppSettings>(STORES.profile, SETTINGS_KEY);
  return stored ?? DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): Promise<IDBValidKey> {
  return dbPut(STORES.profile, settings, SETTINGS_KEY);
}
