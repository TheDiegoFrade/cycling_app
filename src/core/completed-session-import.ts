import { parseFitActivity } from './fit-activity-parser';
import type { Profile } from './types';
import type { SessionRecord } from '../storage/session-store';

/** Cambia solo la fecha calendario de un ISO timestamp, conservando la hora
 * del día original — así "el 12 de marzo a las 7:03am" pasa a "el 20 de
 * marzo a las 7:03am" en vez de resetearse a medianoche. */
function overrideDateKeepingTime(iso: string, dateKey: string): string {
  const original = new Date(iso);
  const [y, m, d] = dateKey.split('-').map(Number);
  // en UTC explícito: setFullYear/local se corre con el timezone del
  // dispositivo y podía cambiar el día resultante según dónde se ejecute.
  return new Date(
    Date.UTC(y, m - 1, d, original.getUTCHours(), original.getUTCMinutes(), original.getUTCSeconds(), original.getUTCMilliseconds()),
  ).toISOString();
}

/** Arma una SessionRecord a partir de un .fit de actividad ya grabada
 * (Garmin/Wahoo/Zwift/etc.) — no la guarda, eso lo hace quien llame (mismo
 * contrato que core/workout-file-import.ts). `dateOverride` (YYYY-MM-DD) es
 * opcional: si no coincide con la fecha que trae el propio archivo, o el
 * archivo no la trae bien, se puede forzar la que el usuario quiera. */
export async function buildCompletedSessionFromFit(
  file: File,
  profile: Profile,
  dateOverride?: string,
  now: Date = new Date(),
): Promise<{ session?: SessionRecord; errors: string[] }> {
  if (!file.name.toLowerCase().endsWith('.fit')) return { errors: [`"${file.name}" no es un archivo .fit.`] };

  const buffer = await file.arrayBuffer();
  const parsed = parseFitActivity(buffer);
  if (parsed.errors.length > 0) return { errors: parsed.errors };
  if (!parsed.startedAt || !parsed.finishedAt) return { errors: ['no se pudo determinar la fecha/hora de la actividad en este archivo'] };

  const startedAt = dateOverride ? overrideDateKeepingTime(parsed.startedAt, dateOverride) : parsed.startedAt;
  const finishedAt = dateOverride ? overrideDateKeepingTime(parsed.finishedAt, dateOverride) : parsed.finishedAt;
  // Una actividad que empieza en el futuro es un error de fecha (reloj del
  // dispositivo o fecha mal elegida): si se guardaba, ese día quedaba como
  // "ocupado" y el coach armaba el plan alrededor de algo que no pasó.
  // 12 h de margen por husos horarios.
  if (Date.parse(startedAt) > now.getTime() + 12 * 3600_000) {
    return { errors: ['la fecha de esta actividad está en el futuro — revisa la fecha del archivo o elige la correcta'] };
  }

  // nombres de archivo tipo "260928212319_gsh42bpj" (exports crípticos de
  // algunos dispositivos: puro número de serie/timestamp) no son un nombre
  // legible aunque se le quiten los guiones — si ninguna racha de letras
  // tiene al menos una vocal (una palabra real), mejor el genérico de abajo.
  const rawName = file.name.replace(/\.fit$/i, '').replace(/[_-]+/g, ' ').trim();
  const letterRuns = rawName.match(/[a-záéíóúñ]+/gi) ?? [];
  const hasReadableWord = letterRuns.some((run) => run.length >= 3 && /[aeiouáéíóú]/i.test(run));
  const nameFromFile = hasReadableWord ? rawName : '';
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    workoutId: 'fit-import',
    workoutName: nameFromFile || 'Actividad importada',
    startedAt,
    finishedAt,
    ftp: profile.ftp,
    samples: parsed.samples,
    ...(parsed.rr ? { rr: parsed.rr } : {}),
    alerts: [],
    intensityChanges: [],
    source: 'fit_upload',
  };
  return { session, errors: [] };
}
