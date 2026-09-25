import { computeSessionAnalytics } from '../engine/analytics';
import { encodeFitActivity } from '../export/fit';
import type { Profile } from '../core/types';
import type { SessionRecord } from '../storage/session-store';
import { supabase } from '../supabase/client';

/** Resumen de una sesión tal como vive en la tabla `sessions` de Supabase —
 * sin los samples segundo a segundo (esos solo están en el .fit de Storage).
 * Alcanza para Historial/PMC/tendencia de EF, no para redibujar la gráfica
 * detallada de una sesión — eso requeriría decodificar el .fit de vuelta,
 * que todavía no existe (solo hay encoder, ver export/fit.ts). */
export interface CloudSessionSummary {
  id: string;
  workoutName: string;
  startedAt: string;
  finishedAt: string;
  ftp: number;
  avgPower: number | null;
  trainingStressScore: number | null;
  efficiencyFactor: number | null;
  hrDriftPct: number | null;
  rpe: number | null;
  note: string | null;
  stravaActivityId: number | null;
}

/** Sube el .fit a Storage y el resumen a la tabla `sessions`. Best-effort:
 * la sesión ya quedó guardada local antes de llamar esto, así que si falla
 * (sin internet, sesión vencida) no se le avisa al usuario con un error
 * intrusivo — solo se deja registro en consola y ya, el próximo intento
 * relevante es la siguiente sesión que grabe. */
export async function pushSessionToCloud(session: SessionRecord, profile: Profile, userId: string): Promise<void> {
  if (!supabase) return;
  const sessionProfile: Profile = { ...profile, ftp: session.ftp };
  try {
    const bytes = encodeFitActivity(new Date(session.startedAt), session.samples, sessionProfile);
    const fitPath = `${userId}/${session.id}.fit`;
    const { error: uploadError } = await supabase.storage
      .from('fit-files')
      .upload(fitPath, bytes, { contentType: 'application/octet-stream', upsert: true });
    if (uploadError) throw uploadError;

    const a = computeSessionAnalytics(session.samples, sessionProfile);
    const { error: insertError } = await supabase.from('sessions').upsert({
      id: session.id,
      user_id: userId,
      workout_name: session.workoutName,
      started_at: session.startedAt,
      finished_at: session.finishedAt,
      ftp: session.ftp,
      avg_power: a.avgPower,
      max_power: a.maxPower,
      avg_cadence: a.avgCadence,
      max_cadence: a.maxCadence,
      avg_hr: a.avgHr,
      max_hr: a.maxHr,
      normalized_power: a.normalizedPower,
      intensity_factor: a.intensityFactor,
      training_stress_score: a.trainingStressScore,
      variability_index: a.variabilityIndex,
      efficiency_factor: a.efficiencyFactor,
      hr_drift_pct: a.hrDriftPct,
      rpe: session.rpe ?? null,
      note: session.note ?? null,
      fit_path: fitPath,
      strava_activity_id: session.stravaActivityId ?? null,
    });
    if (insertError) throw insertError;
  } catch (err) {
    console.error('[cloud-sync] no se pudo sincronizar la sesión', err);
  }
}

/** Borra una sesión de la nube (fila + .fit en Storage). Best-effort: si
 * falla, se deja registro en consola — el llamador decide si igual quita la
 * fila local o del estado en memoria. */
export async function deleteSessionFromCloud(id: string, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('sessions').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    await supabase.storage.from('fit-files').remove([`${userId}/${id}.fit`]);
  } catch (err) {
    console.error('[cloud-sync] no se pudo borrar la sesión de la nube', err);
  }
}

export async function listCloudSessions(userId: string): Promise<CloudSessionSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select(
      'id, workout_name, started_at, finished_at, ftp, avg_power, training_stress_score, efficiency_factor, hr_drift_pct, rpe, note, strava_activity_id',
    )
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error || !data) {
    console.error('[cloud-sync] no se pudieron leer las sesiones remotas', error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    workoutName: row.workout_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    ftp: row.ftp,
    avgPower: row.avg_power,
    trainingStressScore: row.training_stress_score,
    efficiencyFactor: row.efficiency_factor,
    hrDriftPct: row.hr_drift_pct,
    rpe: row.rpe,
    note: row.note,
    stravaActivityId: row.strava_activity_id,
  }));
}
