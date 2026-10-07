import type { Profile } from '../core/types';
import { supabase } from '../supabase/client';

/** `undefined` = no se pudo determinar (sin internet, error) — el llamador
 * no debe pisar nada con esto. `null` = confirmado que no hay perfil en la
 * nube todavía (usuario nuevo o migración pendiente). Un `Profile` = fuente
 * de verdad ya en la nube. */
export async function fetchCloudProfile(userId: string): Promise<Profile | null | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'ftp, hr_max, cadence_floor, hr_ceiling, hr_min, cadence_max, name, birth_date, height_cm, weight_kg, sex, experience_level, general_fitness_level, years_riding, structured_training_years, competes, category, discipline, injuries, rides_outside, has_outdoor_power_meter, recent_best_result, ftp_confirmed, hr_max_confirmed',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[profile-sync] no se pudo leer el perfil remoto', error);
    return undefined;
  }
  if (!data) return null;
  return {
    ftp: data.ftp,
    hr_max: data.hr_max,
    cadence_floor: data.cadence_floor,
    hr_ceiling: data.hr_ceiling,
    hr_min: data.hr_min,
    cadence_max: data.cadence_max,
    name: data.name ?? undefined,
    birth_date: data.birth_date ?? undefined,
    height_cm: data.height_cm ?? undefined,
    weight_kg: data.weight_kg ?? undefined,
    sex: data.sex ?? undefined,
    experienceLevel: data.experience_level ?? undefined,
    generalFitnessLevel: data.general_fitness_level ?? undefined,
    yearsRiding: data.years_riding ?? undefined,
    structuredTrainingYears: data.structured_training_years ?? undefined,
    competes: data.competes ?? undefined,
    category: data.category ?? undefined,
    discipline: data.discipline ?? undefined,
    injuries: data.injuries ?? undefined,
    ridesOutside: data.rides_outside ?? undefined,
    hasOutdoorPowerMeter: data.has_outdoor_power_meter ?? undefined,
    recentBestResult: data.recent_best_result ?? undefined,
    ftpConfirmed: data.ftp_confirmed ?? undefined,
    hrMaxConfirmed: data.hr_max_confirmed ?? undefined,
  };
}

/** Best-effort, igual que pushSessionToCloud: el perfil ya quedó guardado
 * local antes de llamar esto, así que un fallo solo se registra en consola. */
export async function pushProfileToCloud(profile: Profile, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('profiles').upsert({
      user_id: userId,
      ftp: profile.ftp,
      hr_max: profile.hr_max,
      cadence_floor: profile.cadence_floor,
      hr_ceiling: profile.hr_ceiling,
      hr_min: profile.hr_min,
      cadence_max: profile.cadence_max,
      // null explícito (no undefined) para que limpiar un campo en la UI
      // también lo borre en la nube en vez de dejar el valor viejo intacto.
      name: profile.name ?? null,
      birth_date: profile.birth_date ?? null,
      height_cm: profile.height_cm ?? null,
      weight_kg: profile.weight_kg ?? null,
      sex: profile.sex ?? null,
      experience_level: profile.experienceLevel ?? null,
      general_fitness_level: profile.generalFitnessLevel ?? null,
      years_riding: profile.yearsRiding ?? null,
      structured_training_years: profile.structuredTrainingYears ?? null,
      competes: profile.competes ?? null,
      category: profile.category ?? null,
      discipline: profile.discipline ?? null,
      injuries: profile.injuries ?? null,
      rides_outside: profile.ridesOutside ?? null,
      has_outdoor_power_meter: profile.hasOutdoorPowerMeter ?? null,
      recent_best_result: profile.recentBestResult ?? null,
      ftp_confirmed: profile.ftpConfirmed ?? null,
      hr_max_confirmed: profile.hrMaxConfirmed ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[profile-sync] no se pudo sincronizar el perfil', err);
  }
}
