import { dbGet, dbPut, STORES } from './db';

export interface AppSettings {
  factoryRulesEnabled: {
    cadenceFloor: boolean;
    hrCeiling: boolean;
    ergDetached: boolean;
    hrFloor: boolean;
    cadenceCeiling: boolean;
  };
  soundVolume: number; // 0..1
  /** Click vintage al tocar botones y links (ver ui/click-sound.ts). */
  clickSound: boolean;
  intervalsIcu?: { athleteId: string; apiKey: string };
  /** Quién aparece en la ilustración de fondo del inicio de sesión. */
  heroCharacter: 'man' | 'woman';
}

export const DEFAULT_SETTINGS: AppSettings = {
  factoryRulesEnabled: { cadenceFloor: true, hrCeiling: true, ergDetached: true, hrFloor: false, cadenceCeiling: false },
  soundVolume: 0.6,
  clickSound: true,
  heroCharacter: 'man',
};

const SETTINGS_KEY = 'settings';

/** Rellena con los valores por defecto lo que unos ajustes guardados antes
 * de agregar un interruptor nuevo no traen (si no, queda en `undefined` y
 * se lee como apagado). Vale para los locales y para los de la nube. */
export function withSettingsDefaults(stored: Partial<AppSettings> | null | undefined): AppSettings {
  return stored
    ? { ...DEFAULT_SETTINGS, ...stored, factoryRulesEnabled: { ...DEFAULT_SETTINGS.factoryRulesEnabled, ...stored.factoryRulesEnabled } }
    : DEFAULT_SETTINGS;
}

export async function loadSettings(): Promise<AppSettings> {
  return withSettingsDefaults(await dbGet<AppSettings>(STORES.profile, SETTINGS_KEY));
}

export function saveSettings(settings: AppSettings): Promise<IDBValidKey> {
  return dbPut(STORES.profile, settings, SETTINGS_KEY);
}
