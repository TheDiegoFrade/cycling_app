import { computeSessionAnalytics } from '../engine/analytics';
import { encodeFitActivity } from '../export/fit';
import { parseFitActivity } from '../core/fit-activity-parser';
import { isBikeSession, srpeLoad } from '../core/session-kind';
import type { SessionCompletion, SessionKind } from '../core/session-kind';
import { sessionSourceOf } from '../core/session-source';
import type { SessionSource } from '../core/session-source';
import type { Profile, Sample } from '../core/types';
import type { SessionRecord } from '../storage/session-store';
import { listWorkouts } from '../storage/workout-store';
import { computeSessionMetrics } from '../engine/session-metrics';
import type { MetricsHints, SessionMetrics } from '../engine/session-metrics';
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
  /** null = bici sin detalle (ver core/session-kind.ts). */
  kind: SessionKind | null;
  completion: SessionCompletion | null;
  /** RPE × minutos, solo sesiones que no son de bici. */
  srpeLoad: number | null;
  /** Elemento planeado que registra (planned_routines.id), si aplica. */
  plannedItemId: string | null;
  /** Métricas para la ficha del atleta (ver engine/session-metrics.ts);
   * null en sesiones que todavía no se rellenan. */
  metrics: SessionMetrics | null;
}

/** Duración de reloj (fin - inicio) en minutos — la que usan las sesiones
 * registradas a mano, que no tienen samples. */
function wallClockMinutes(startedAt: string, finishedAt: string): number {
  return Math.max(0, (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000);
}

/** Sube el .fit a Storage y el resumen a la tabla `sessions`. Best-effort:
 * la sesión ya quedó guardada local antes de llamar esto, así que si falla
 * (sin internet, sesión vencida) no se le avisa al usuario con un error
 * intrusivo — solo se deja registro en consola y ya, el próximo intento
 * relevante es la siguiente sesión que grabe. */
export async function pushSessionToCloud(session: SessionRecord, profile: Profile, userId: string): Promise<void> {
  if (!supabase) return;
  const sessionProfile: Profile = { ...profile, ftp: session.ftp };
  const bike = isBikeSession(session);
  try {
    // Fuerza/movilidad registradas a mano no traen samples: no hay .fit que
    // subir ni nada que analizar (fit_path y métricas quedan en null).
    const hasSamples = session.samples.length > 0;
    let fitPath: string | null = null;
    if (hasSamples) {
      const bytes = encodeFitActivity(new Date(session.startedAt), session.samples, sessionProfile, session.rr);
      fitPath = `${userId}/${session.id}.fit`;
      const { error: uploadError } = await supabase.storage
        .from('fit-files')
        .upload(fitPath, bytes, { contentType: 'application/octet-stream', upsert: true });
      if (uploadError) throw uploadError;
    }

    const a = hasSamples ? computeSessionAnalytics(session.samples, sessionProfile) : null;
    // Una sesión de fuerza grabada en el reloj trae pulso pero potencia en 0
    // — solo el pulso significa algo ahí; lo de potencia/cadencia/TSS sería
    // un cero falso que ensucia cualquier reporte.
    const p = bike ? a : null;
    const { error: insertError } = await supabase.from('sessions').upsert({
      id: session.id,
      user_id: userId,
      workout_name: session.workoutName,
      started_at: session.startedAt,
      finished_at: session.finishedAt,
      ftp: session.ftp,
      avg_power: p?.avgPower ?? null,
      max_power: p?.maxPower ?? null,
      avg_cadence: p?.avgCadence ?? null,
      max_cadence: p?.maxCadence ?? null,
      avg_hr: a?.avgHr ?? null,
      max_hr: a?.maxHr ?? null,
      normalized_power: p?.normalizedPower ?? null,
      intensity_factor: p?.intensityFactor ?? null,
      training_stress_score: p?.trainingStressScore ?? null,
      variability_index: p?.variabilityIndex ?? null,
      efficiency_factor: p?.efficiencyFactor ?? null,
      hr_drift_pct: p?.hrDriftPct ?? null,
      rpe: session.rpe ?? null,
      note: session.note ?? null,
      fit_path: fitPath,
      strava_activity_id: session.stravaActivityId ?? null,
      workout_id: session.workoutId,
      // el trigger sessions_set_source de schema.sql fuerza 'strava' igual
      // si trae strava_activity_id — esto es lo mismo, del lado del cliente.
      source: sessionSourceOf(session),
      kind: session.kind ?? null,
      completion: session.completion ?? null,
      planned_item_id: session.plannedItemId ?? null,
      srpe_load: srpeLoad(session.kind, session.completion, session.rpe, wallClockMinutes(session.startedAt, session.finishedAt)),
      // picos de potencia (mejor promedio sostenido) — guardados aparte del
      // resto para poder calcular récords históricos de TODA la cuenta sin
      // tener que descargar y decodificar el .fit de cada sesión, ver
      // getPowerRecords más abajo.
      best_1min_power: p?.powerCurve.find((c) => c.windowS === 60)?.watts ?? null,
      best_5min_power: p?.powerCurve.find((c) => c.windowS === 300)?.watts ?? null,
      best_20min_power: p?.powerCurve.find((c) => c.windowS === 1200)?.watts ?? null,
    });
    if (insertError) throw insertError;
    if (bike) await saveSessionMetrics(session.id, computeSessionMetrics(session.samples, session.ftp, await metricsHintsFor(session)));
  } catch (err) {
    console.error('[cloud-sync] no se pudo sincronizar la sesión', err);
  }
}

/** Qué sabemos del workout de la sesión para calificar sus picos: si era un
 * test y cuáles de sus intervalos eran libres (autodosificados). */
async function metricsHintsFor(session: Pick<SessionRecord, 'workoutId' | 'workoutName'>): Promise<MetricsHints> {
  const workout = (await listWorkouts()).find((w) => w.id === session.workoutId);
  const name = workout?.name ?? session.workoutName;
  return {
    isTest: workout?.kind === 'test' || (/test|rampa|ramp/i.test(name) && !/escalera/i.test(name)),
    selfPacedIntervals: workout?.intervals.flatMap((iv, i) => (iv.type === 'free' ? [i] : [])) ?? [],
  };
}

/** Aparte del upsert de la sesión, a propósito: si la columna `metrics`
 * todavía no existe en la base (schema.sql sin aplicar), solo falla esto y
 * la sesión sí se sincroniza. */
async function saveSessionMetrics(id: string, metrics: SessionMetrics | null): Promise<boolean> {
  if (!supabase || !metrics) return false;
  const { error } = await supabase.from('sessions').update({ metrics }).eq('id', id);
  if (error) console.warn('[cloud-sync] no se guardaron las métricas de la sesión', error.message);
  return !error;
}

/** Rellena `metrics` de las sesiones ya subidas que no lo tienen, desde las
 * sesiones de este dispositivo (con samples; no descarga nada). Corre solo,
 * en segundo plano, después de sincronizar. Devuelve cuántas llenó. */
export async function backfillMetricsFromLocal(userId: string, localSessions: readonly SessionRecord[]): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.from('sessions').select('id').eq('user_id', userId).is('metrics', null);
  if (error || !data) return 0; // p.ej. la columna todavía no existe
  const missing = new Set(data.map((r) => r.id as string));
  let filled = 0;
  for (const s of localSessions) {
    if (!missing.has(s.id) || !isBikeSession(s) || s.samples.length === 0) continue;
    if (await saveSessionMetrics(s.id, computeSessionMetrics(s.samples, s.ftp, await metricsHintsFor(s)))) filled++;
  }
  return filled;
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

/** Columnas de `sessions` que forman un CloudSessionSummary (las usa
 * también la vista del coach, ver sync/coach-athletes.ts). */
export const SESSION_SUMMARY_COLUMNS =
  'id, workout_name, started_at, finished_at, ftp, avg_power, max_power, avg_cadence, max_cadence, avg_hr, max_hr, normalized_power, intensity_factor, training_stress_score, variability_index, efficiency_factor, hr_drift_pct, rpe, note, strava_activity_id, fit_path, workout_id, source, kind, completion, srpe_load, planned_item_id, metrics';

// fila cruda de supabase-js (sin tipos generados en este proyecto)
export function rowToCloudSummary(row: Record<string, any>): CloudSessionSummary {
  return {
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
    kind: row.kind,
    completion: row.completion,
    srpeLoad: row.srpe_load,
    plannedItemId: row.planned_item_id,
    metrics: row.metrics ?? null,
  };
}

export async function listCloudSessions(userId: string): Promise<CloudSessionSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error || !data) {
    console.error('[cloud-sync] no se pudieron leer las sesiones remotas', error);
    return [];
  }
  return data.map(rowToCloudSummary);
}

/** Descarga el .fit que ya está en Storage para una sesión de nube y lo
 * decodifica de vuelta a samples segundo a segundo, usando el mismo parser
 * genérico que importa actividades de Garmin/Strava/etc. (ver
 * core/fit-activity-parser.ts) — el archivo lo escribimos nosotros mismos en
 * pushSessionToCloud, así que trae exactamente los campos que ese parser ya
 * sabe leer. Devuelve null si no hay .fit, no hay internet, o el archivo no
 * se puede leer — el llamador decide el resumen reducido como respaldo. */
/** El .fit tal cual está en Storage (para descargarlo). RLS decide: el
 * dueño, o su coach si la sesión no vino de Strava. */
export async function downloadFitBlob(fitPath: string): Promise<Blob> {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.storage.from('fit-files').download(fitPath);
  if (error || !data) throw error ?? new Error('no se encontró el archivo');
  return data;
}

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

/** Recalcula los picos de potencia y las métricas (`metrics`, ver
 * engine/session-metrics.ts) de sesiones ya subidas ANTES de que existieran
 * esas columnas — a demanda, nunca automático (ver plan de Forma): descarga
 * el .fit de cada una (ya tenemos la función para eso) y vuelve a correr el
 * mismo cálculo que pushSessionToCloud. Sesiones sin
 * fit_path (muy viejas) quedan fuera, igual que ya pasa con EF nulo en otras
 * partes de la app. Devuelve cuántas se actualizaron. */
export async function backfillPowerRecords(userId: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('sessions')
    .select('id, fit_path, ftp, workout_id, workout_name, best_5min_power, metrics')
    .eq('user_id', userId)
    .or('best_5min_power.is.null,metrics.is.null')
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
    let ok = false;
    if (row.best_5min_power === null) {
      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          best_1min_power: a.powerCurve.find((p) => p.windowS === 60)?.watts ?? null,
          best_5min_power: a.powerCurve.find((p) => p.windowS === 300)?.watts ?? null,
          best_20min_power: a.powerCurve.find((p) => p.windowS === 1200)?.watts ?? null,
        })
        .eq('id', row.id);
      ok = !updateError;
    }
    if (row.metrics === null) {
      // El .fit no trae índice de intervalo: solo se usa si era un test.
      const { isTest } = await metricsHintsFor({ workoutId: row.workout_id as string, workoutName: row.workout_name as string });
      ok = (await saveSessionMetrics(row.id as string, computeSessionMetrics(samples, row.ftp as number, { isTest }))) || ok;
    }
    if (ok) updated++;
  }
  onProgress?.(data.length, data.length);
  return updated;
}
