import type { Profile } from '../core/types';
import { dbGet, dbPut, STORES } from './db';

const PROFILE_KEY = 'profile';

export const DEFAULT_PROFILE: Profile = { ftp: 200, hr_max: 185, cadence_floor: 70, hr_ceiling: 170 };

export async function loadProfile(): Promise<Profile> {
  const stored = await dbGet<Profile>(STORES.profile, PROFILE_KEY);
  return stored ?? DEFAULT_PROFILE;
}

export function saveProfile(profile: Profile): Promise<IDBValidKey> {
  return dbPut(STORES.profile, profile, PROFILE_KEY);
}
