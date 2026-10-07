import { computeSessionAnalytics } from '../engine/analytics';
import { encodeFitActivity } from '../export/fit';
import { parseFitActivity } from '../core/fit-activity-parser';
import { sessionSourceOf } from '../core/session-source';
import type { SessionSource } from '../core/session-source';
import type { Profile, Sample } from '../core/types';
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
  maxPower: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgHr: number | null;
  maxHr: number | null;
  normalizedPower: number | null;
  intensityFactor: number | null;
  trainingStressScore: number | null;
  variabilityIndex: number | null;
  efficiencyFactor: number | null;
  hrDriftPct: number | null;
  rpe: number | null;
  note: string | null;
  stravaActivityId: number | null;
  fitPath: string | null;
  /** 'fit-import' si esta sesión se subió a mano desde un .fit, o el id del
   * workout original si se grabó en vivo con la app. */
  workoutId: string | null;
  /** De dónde llegó (ver core/session-source.ts) — 'strava' nunca entra al
   * contexto del coach de IA. */
  source: SessionSource;
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
      workout_id: session.workoutId,
      // el trigger sessions_set_source de schema.sql fuerza 'strava' igual
      // si trae strava_activity_id — esto es lo mismo, del lado del cliente.
      source: sessionSourceOf(session),
      // picos de potencia (mejor promedio sostenido) — guardados aparte del
      // resto para poder calcular récords históricos de TODA la cuenta sin
      // tener que descargar y decodificar el .fit de cada sesión, ver
      // getPowerRecords más abajo.
      best_1min_power: a.powerCurve.find((p) => p.windowS === 60)?.watts ?? null,
      best_5min_power: a.powerCurve.find((p) => p.windowS === 300)?.watts ?? null,
      best_20min_power: a.powerCurve.find((p) => p.windowS === 1200)?.watts ?? null,
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
      'id, workout_name, started_at, finished_at, ftp, avg_power, max_power, avg_cadence, max_cadence, avg_hr, max_hr, normalized_power, intensity_factor, training_stress_score, variability_index, efficiency_factor, hr_drift_pct, rpe, note, strava_activity_id, fit_path, workout_id, source',
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
    maxPower: row.max_power,
    avgCadence: row.avg_cadence,
    maxCadence: row.max_cadence,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    normalizedPower: row.normalized_power,
    intensityFactor: row.intensity_factor,
    trainingStressScore: row.training_stress_score,
    variabilityIndex: row.variability_index,
    efficiencyFactor: row.efficiency_factor,
    hrDriftPct: row.hr_drift_pct,
    rpe: row.rpe,
    note: row.note,
    stravaActivityId: row.strava_activity_id,
    fitPath: row.fit_path,
    workoutId: row.workout_id,
    source: sessionSourceOf({ source: row.source, workoutId: row.workout_id, stravaActivityId: row.strava_activity_id }),
  }));
}

/** Descarga el .fit que ya está en Storage para una sesión de nube y lo
 * decodifica de vuelta a samples segundo a segundo, usando el mismo parser
 * genérico que importa actividades de Garmin/Strava/etc. (ver
 * core/fit-activity-parser.ts) — el archivo lo escribimos nosotros mismos en
 * pushSessionToCloud, así que trae exactamente los campos que ese parser ya
 * sabe leer. Devuelve null si no hay .fit, no hay internet, o el archivo no
 * se puede leer — el llamador decide el resumen reducido como respaldo. */
export async function downloadSessionSamples(fitPath: string): Promise<Sample[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.storage.from('fit-files').download(fitPath);
    if (error || !data) throw error ?? new Error('sin datos');
    const buffer = await data.arrayBuffer();
    const { samples, errors } = parseFitActivity(buffer);
    if (samples.length === 0) throw new Error(errors.join('; ') || 'sin samples');
    return samples;
  } catch (err) {
    console.error('[cloud-sync] no se pudo reconstruir la sesión desde su .fit', err);
    return null;
  }
}

export interface PowerRecord {
  watts: number;
  /** Fecha (YYYY-MM-DD) de la sesión que logró este pico. */
  dateKey: string;
}

export interface PowerRecords {
  best1min: PowerRecord | null;
  best5min: PowerRecord | null;
  best20min: PowerRecord | null;
}

const POWER_RECORD_COLUMNS = [
  { key: 'best1min' as const, column: 'best_1min_power' },
  { key: 'best5min' as const, column: 'best_5min_power' },
  { key: 'best20min' as const, column: 'best_20min_power' },
];

/** Mejor pico histórico de TODA la cuenta por ventana (1/5/20 min) — cuenta
 * cualquier sesión (grabada en vivo, importada de Strava o subida a mano),
 * todas compiten por igual por "tu récord en Torq". Sesiones sin estos
 * valores calculados (subidas antes de que existieran, ver
 * backfillPowerRecords) simplemente no compiten por el récord. */
export async function getPowerRecords(userId: string): Promise<PowerRecords> {
  if (!supabase) return { best1min: null, best5min: null, best20min: null };
  const results = await Promise.all(
    POWER_RECORD_COLUMNS.map(async ({ column }) => {
      const selectCols: string = `${column}, started_at`;
      const { data, error } = await supabase!
        .from('sessions')
        .select(selectCols)
        .eq('user_id', userId)
        .not(column, 'is', null)
        .order(column, { ascending: false })
        .limit(1);
      if (error || !data) return null;
      const best = (data as unknown as Record<string, unknown>[])[0];
      if (!best) return null;
      const watts = best[column] as number | null;
      return watts ? { watts, dateKey: String(best.started_at).slice(0, 10) } : null;
    }),
  );
  return { best1min: results[0], best5min: results[1], best20min: results[2] };
}

/** Recalcula los picos de potencia de sesiones ya subidas ANTES de que
 * existieran estas columnas — a demanda, nunca automático (ver plan de
 * Forma): descarga el .fit de cada una (ya tenemos la función para eso) y
 * vuelve a correr el mismo cálculo que pushSessionToCloud. Sesiones sin
 * fit_path (muy viejas) quedan fuera, igual que ya pasa con EF nulo en otras
 * partes de la app. Devuelve cuántas se actualizaron. */
export async function backfillPowerRecords(userId: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('sessions')
    .select('id, fit_path, ftp')
    .eq('user_id', userId)
    .is('best_5min_power', null)
    .not('fit_path', 'is', null);
  if (error || !data) return 0;

  let updated = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    onProgress?.(i, data.length);
    const samples = await downloadSessionSamples(row.fit_path as string);
    if (!samples || samples.length === 0) continue;
    // el perfil solo importa aquí por el ftp que ya trae la propia sesión —
    // powerCurve no depende de ningún otro campo del perfil.
    const a = computeSessionAnalytics(samples, { ftp: row.ftp as number, hr_max: 200, cadence_floor: 0, hr_ceiling: 999, hr_min: 0, cadence_max: 999 });
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        best_1min_power: a.powerCurve.find((p) => p.windowS === 60)?.watts ?? null,
        best_5min_power: a.powerCurve.find((p) => p.windowS === 300)?.watts ?? null,
        best_20min_power: a.powerCurve.find((p) => p.windowS === 1200)?.watts ?? null,
      })
      .eq('id', row.id);
    if (!updateError) updated++;
  }
  onProgress?.(data.length, data.length);
  return updated;
}
