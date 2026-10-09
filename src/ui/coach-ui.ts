// Piezas compartidas por las pantallas del coach (screens/coach-athletes.ts
// y screens/coach-athlete.ts).
import type { CoachAlert, CoachSessionRow } from '../core/coach-metrics';
import { sessionDateKey } from '../core/coach-metrics';
import type { SessionSource } from '../core/session-source';
import type { CoachAthlete } from '../sync/coach-athletes';
import { escapeHtml } from './workout-cover';
import { todayKey } from '../core/day-key';

/** Historia que se pide para que CTL (constante de 42 días) ya esté
 * estabilizado en lo que se muestra. */
export const COACH_OVERVIEW_DAYS = 120;
export const COACH_DETAIL_DAYS = 200;

const DISCIPLINE_LABELS: Record<NonNullable<CoachAthlete['discipline']>, string> = {
  mountain: 'MTB',
  road: 'Ruta',
  gravel: 'Gravel',
  other: 'Otra',
};

const SOURCE_LABELS: Record<SessionSource, string> = {
  torq: 'Torq',
  fit_upload: '.fit',
  intervals: 'intervals.icu',
  manual: 'Registrada',
  strava: 'Strava', // nunca llega aquí (RLS), pero el tipo lo pide
};

export function athleteName(a: CoachAthlete): string {
  return a.name?.trim() || 'Atleta sin nombre';
}

export function athleteInitials(a: CoachAthlete): string {
  const words = (a.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

export function disciplineLabel(a: CoachAthlete): string | null {
  return a.discipline ? DISCIPLINE_LABELS[a.discipline] : null;
}

export function sourceLabel(s: SessionSource): string {
  return SOURCE_LABELS[s];
}

/** "−6" / "+4" / "0" — signo menos tipográfico, como en los mockups. */
export function fmtSigned(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return r > 0 ? `+${r}` : `−${Math.abs(r)}`;
}

/** Color del número de Forma: naranja con fatiga alta, gris muy fresco. */
export function tsbColor(tsb: number): string {
  if (tsb <= -20) return 'var(--z5)';
  if (tsb >= 10) return 'var(--text-muted)';
  return 'var(--text)';
}

export function daysAgoLabel(row: CoachSessionRow, todayKey: string): string {
  const days = Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${sessionDateKey(row)}T00:00:00Z`)) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}

export function alertPillHtml(alert: CoachAlert): string {
  switch (alert.kind) {
    case 'no_data':
      return `<span class="coach-pill coach-pill-danger">${alert.days === null ? 'Sin actividades' : `Sin datos ${alert.days} días`}</span>`;
    case 'fatigue':
      return '<span class="coach-pill coach-pill-warn">Fatiga alta</span>';
    case 'ftp_unconfirmed':
      return '<span class="coach-pill coach-pill-caution">FTP sin confirmar</span>';
  }
}

export function avatarHtml(a: CoachAthlete): string {
  return `<span class="coach-avatar num" aria-hidden="true">${escapeHtml(athleteInitials(a))}</span>`;
}

/** Hoy en UTC (`YYYY-MM-DD`) — mismo criterio de fecha que Forma. */
/** Hoy en la zona del coach (ver core/day-key.ts). */
export function todayLocalKey(): string {
  return todayKey();
}

export function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** Texto de un error para mostrarlo. Los de Supabase (PostgREST) son
 * objetos con `message`, no instancias de Error: String() daría
 * "[object Object]". */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') return (err as { message: string }).message;
  return String(err);
}
