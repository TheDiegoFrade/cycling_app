import type { Profile } from '../core/types';
import { dbGet, dbPut, STORES } from './db';

const PROFILE_KEY = 'profile';

export const DEFAULT_PROFILE: Profile = { ftp: 200, hr_max: 185, cadence_floor: 70, hr_ceiling: 170, hr_min: 0, cadence_max: 999 };

export async function loadProfile(): Promise<Profile> {
  const stored = await dbGet<Profile>(STORES.profile, PROFILE_KEY);
  // combina con los defaults para que un perfil guardado antes de agregar un
  // campo nuevo (p.ej. hr_min/cadence_max) no se quede con `undefined` ahí.
  return stored ? { ...DEFAULT_PROFILE, ...stored } : DEFAULT_PROFILE;
}

export function saveProfile(profile: Profile): Promise<IDBValidKey> {
  return dbPut(STORES.profile, profile, PROFILE_KEY);
}
