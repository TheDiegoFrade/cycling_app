import { encodeFitActivity } from '../export/fit';
import type { Profile, Sample } from '../core/types';
import { saveSession } from '../storage/session-store';
import type { SessionRecord } from '../storage/session-store';
import { supabase } from '../supabase/client';
import { pushSessionToCloud } from './cloud-sync';

const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;

export function isStravaConfigured(): boolean {
  return Boolean(STRAVA_CLIENT_ID && supabase);
}

/** Manda a la persona a autorizar en strava.com — vuelve a esta misma URL
 * con `?code=...` en la query string (nunca en el hash, para no chocar con
 * nuestro router). `activity:read_all` para importar, `activity:write` para
 * subir lo grabado en Torq. */
export function redirectToStravaAuthorize(): void {
  const redirectUri = location.origin + location.pathname;
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all,activity:write',
  });
  location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

/** Se llama una vez al arrancar la app: si venimos de que Strava nos mandó
 * de vuelta con `?code=...`, lo intercambia por tokens (vía Edge Function,
 * ahí vive el client_secret) y limpia la URL. */
export async function handleStravaRedirect(): Promise<void> {
  if (!supabase) return;
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return;

  // limpia el `?code=...` de la URL de una vez, haya o no error, para no
  // reintentar el mismo code (de un solo uso) si recargan la página.
  history.replaceState(null, '', location.pathname + location.hash);

  const { error } = await supabase.functions.invoke('strava-oauth-exchange', { body: { code } });
  if (error) console.error('[strava] no se pudo conectar', error);
}

export interface StravaConnection {
  athleteId: number;
  athleteName: string | null;
}

export async function getStravaConnection(userId: string): Promise<StravaConnection | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('strava_connections')
    .select('strava_athlete_id, strava_athlete_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { athleteId: data.strava_athlete_id, athleteName: data.strava_athlete_name };
}

export async function disconnectStrava(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.functions.invoke('strava-disconnect', { body: {} });
  if (error) throw error;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Sube una sesión ya grabada en Torq a la cuenta de Strava del usuario. */
export async function uploadSessionToStrava(session: SessionRecord, profile: Profile): Promise<void> {
  if (!supabase) throw new Error('Supabase no configurado');
  const bytes = encodeFitActivity(new Date(session.startedAt), session.samples, { ...profile, ftp: session.ftp });
  const { error } = await supabase.functions.invoke('strava-upload', {
    body: { fitBase64: toBase64(bytes), filename: `${session.workoutName.replace(/[^\w-]+/g, '_')}.fit` },
  });
  if (error) throw error;
}

export interface StravaActivitySummary {
  id: number;
  name: string;
  startDate: string;
  movingTimeS: number;
  distanceM: number;
}

/** Actividades de ciclismo de Strava — `afterUnixS` opcional para no traer
 * todo el historial cada vez. */
export async function listStravaActivities(afterUnixS?: number): Promise<StravaActivitySummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.functions.invoke('strava-activities', { body: { afterUnixS } });
  if (error) throw error;
  return data as StravaActivitySummary[];
}

/** Trae los samples de una actividad de Strava y arma con ellos una
 * SessionRecord normal — reutiliza el mismo guardado local + sync a la nube
 * que cualquier sesión grabada en el rodillo, en vez de duplicar esa lógica. */
export async function importStravaActivity(activity: StravaActivitySummary, profile: Profile, userId: string | null): Promise<void> {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.functions.invoke('strava-streams', { body: { activityId: activity.id } });
  if (error) throw error;

  const rawSamples = (data as { samples: { t: number; power: number; cadence: number; hr: number }[] }).samples;
  const samples: Sample[] = rawSamples.map((s) => ({
    t: s.t,
    power: s.power,
    cadence: s.cadence,
    hr: s.hr,
    target: 0,
    intensity: 100,
    interval_index: 0,
  }));

  const startedAt = new Date(activity.startDate);
  const finishedAt = new Date(startedAt.getTime() + activity.movingTimeS * 1000);
  const record: SessionRecord = {
    id: crypto.randomUUID(),
    workoutId: 'strava-import',
    workoutName: activity.name,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ftp: profile.ftp,
    samples,
    alerts: [],
    intensityChanges: [],
    stravaActivityId: activity.id,
  };

  await saveSession(record);
  if (userId) await pushSessionToCloud(record, profile, userId);
}
