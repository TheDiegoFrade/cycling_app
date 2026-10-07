import type { NonBikeKind, SessionCompletion } from './session-kind';
import { NON_BIKE_KIND_LABELS } from './session-kind';
import type { Sample } from './types';
import type { SessionRecord } from '../storage/session-store';

/** workoutId de las sesiones registradas a mano en Registrar — no salen de
 * ningún workout de la biblioteca. */
export const LOGGED_SESSION_WORKOUT_ID = 'manual-log';

/** Lo que captura la pantalla Registrar (screens/log-session.ts). */
export interface LogSessionForm {
  kind: NonBikeKind;
  /** Vacío = se usa el nombre del tipo ("Fuerza"). */
  name: string;
  /** YYYY-MM-DD, fecha LOCAL del atleta (la misma que pinta Plan). */
  dateKey: string;
  completion: SessionCompletion;
  /** Ignorados si completion = 'skipped'. */
  minutes: number | null;
  rpe: number | null;
  note: string;
  /** .fit del reloj, si lo subió: samples + hora real de inicio. */
  fit: { samples: Sample[]; startedAt: string } | null;
}

/** Errores de validación en español, listos para mostrar; vacío si se puede
 * guardar. */
export function validateLogSessionForm(form: LogSessionForm): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateKey)) errors.push('Elige la fecha.');
  if (form.completion !== 'skipped') {
    if (!form.minutes || form.minutes <= 0) errors.push('Pon cuántos minutos duró.');
    else if (form.minutes > 600) errors.push('La duración no puede pasar de 600 minutos.');
    if (!form.rpe) errors.push('Elige qué tan duro se sintió (RPE).');
  }
  return errors;
}

/** Misma hora del día (local) en otra fecha local. */
function onLocalDate(iso: string, dateKey: string): Date {
  const original = new Date(iso);
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, original.getHours(), original.getMinutes(), original.getSeconds());
}

/** Arma (o actualiza) el SessionRecord de una sesión registrada a mano. No
 * la guarda — eso lo hace quien llame, igual que
 * core/completed-session-import.ts.
 *
 * Hora de inicio, en este orden: la del .fit (movida a la fecha elegida);
 * la que ya tenía si se está editando y no cambió la fecha; "ahora menos la
 * duración" si es hoy; mediodía local para cualquier otro día. */
export function buildLoggedSession(
  form: LogSessionForm,
  existing: SessionRecord | null,
  ftp: number,
  now: Date = new Date(),
): SessionRecord {
  const skipped = form.completion === 'skipped';
  const durationMs = skipped ? 0 : Math.round((form.minutes ?? 0) * 60000);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const existingDateKey = existing
    ? (() => {
        const d = new Date(existing.startedAt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })()
    : null;

  let started: Date;
  if (form.fit) started = onLocalDate(form.fit.startedAt, form.dateKey);
  else if (existing && existingDateKey === form.dateKey) started = new Date(existing.startedAt);
  else if (form.dateKey === todayKey) started = new Date(now.getTime() - durationMs);
  else {
    const [y, m, d] = form.dateKey.split('-').map(Number);
    started = new Date(y, m - 1, d, 12, 0, 0);
  }

  const samples = skipped ? [] : (form.fit?.samples ?? []);
  const note = form.note.trim();
  return {
    id: existing?.id ?? crypto.randomUUID(),
    workoutId: existing?.workoutId ?? LOGGED_SESSION_WORKOUT_ID,
    workoutName: form.name.trim() || NON_BIKE_KIND_LABELS[form.kind],
    startedAt: started.toISOString(),
    finishedAt: new Date(started.getTime() + durationMs).toISOString(),
    ftp: existing?.ftp ?? ftp,
    samples,
    alerts: [],
    intensityChanges: [],
    rpe: skipped ? undefined : (form.rpe ?? undefined),
    note: note || undefined,
    source: samples.length > 0 ? 'fit_upload' : 'manual',
    kind: form.kind,
    completion: form.completion,
  };
}
