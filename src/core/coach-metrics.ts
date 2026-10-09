// Cálculos de la vista del coach (pantallas Atletas y Análisis de un
// atleta, ver docs/coach-view/README.md). Puros: reciben las sesiones que el
// coach puede leer (RLS ya quitó las de Strava) y no tocan red ni DOM.
import { computePmc } from '../engine/pmc';
import type { PmcPoint } from '../engine/pmc';
import { addWeeks, mondayOfWeek } from '../engine/streaks';
import { isBikeSession, wasTrained } from './session-kind';
import type { NonBikeKind, SessionCompletion, SessionKind } from './session-kind';
import { isNonBikeKind } from './session-kind';
import type { SessionSource } from './session-source';
import { dayKeyOf } from './day-key';

/** Una fila de `sessions` tal como la lee el coach. */
export interface CoachSessionRow {
  id: string;
  userId: string;
  workoutName: string;
  startedAt: string;
  finishedAt: string;
  tss: number | null;
  rpe: number | null;
  kind: SessionKind | null;
  completion: SessionCompletion | null;
  srpeLoad: number | null;
  source: SessionSource;
}

/** Días sin ninguna actividad a partir de los cuales se marca la alerta. */
export const NO_DATA_ALERT_DAYS = 5;
/** Forma (TSB) igual o por debajo de esto = fatiga alta. */
export const HIGH_FATIGUE_TSB = -20;

export type CoachAlert =
  | { kind: 'no_data'; days: number | null }
  | { kind: 'fatigue'; tsb: number }
  | { kind: 'ftp_unconfirmed' };

export interface AthleteSummary {
  ctl: number;
  atl: number;
  tsb: number;
  /** CTL de hoy menos el de hace 7 días; null sin historia suficiente. */
  ctlDelta7: number | null;
  /** Última sesión entrenada (bici o no), o null si no hay ninguna. */
  last: CoachSessionRow | null;
  daysSinceLast: number | null;
  /** Semana lunes-domingo que contiene hoy. */
  weekBikeSessions: number;
  weekTss: number;
  weekNonBikeSessions: number;
  /** Últimas 4 semanas completas + la actual no: 28 días hacia atrás. */
  bikeSessions28d: number;
  nonBikeSessions28d: number;
  hoursPerWeek28d: number;
  alerts: CoachAlert[];
}

/** Misma fecha que usa Forma (UTC, `YYYY-MM-DD`) para que coach y atleta
 * vean exactamente los mismos números de CTL/ATL/TSB. */
export function sessionDateKey(row: { startedAt: string }): string {
  return dayKeyOf(row.startedAt);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

function durationS(row: CoachSessionRow): number {
  return Math.max(0, (Date.parse(row.finishedAt) - Date.parse(row.startedAt)) / 1000);
}

/** Serie diaria de CTL/ATL/TSB hasta hoy (incluido), solo con sesiones de
 * bici entrenadas — fuerza/movilidad nunca se suman al TSS. */
export function athletePmc(rows: readonly CoachSessionRow[], todayKey: string): PmcPoint[] {
  const entries = rows.filter((r) => isBikeSession(r) && wasTrained(r)).map((r) => ({ dateKey: sessionDateKey(r), tss: r.tss ?? 0 }));
  if (entries.length === 0) return [];
  return computePmc([...entries, { dateKey: todayKey, tss: 0 }]).filter((p) => p.dateKey <= todayKey);
}

export function summarizeAthlete(rows: readonly CoachSessionRow[], todayKey: string, ftpConfirmed: boolean | null): AthleteSummary {
  const trained = rows.filter(wasTrained);
  const pmc = athletePmc(rows, todayKey);
  const today = pmc[pmc.length - 1] ?? null;
  const weekAgo = pmc.length > 7 ? pmc[pmc.length - 8] : null;

  const last = trained.reduce<CoachSessionRow | null>((best, r) => (!best || r.startedAt > best.startedAt ? r : best), null);
  const daysSinceLast = last ? Math.max(0, daysBetween(sessionDateKey(last), todayKey)) : null;

  const weekStart = mondayOfWeek(todayKey);
  const thisWeek = trained.filter((r) => sessionDateKey(r) >= weekStart && sessionDateKey(r) <= todayKey);
  const weekBike = thisWeek.filter(isBikeSession);

  const since28 = new Date(Date.parse(`${todayKey}T00:00:00Z`) - 27 * 86400000).toISOString().slice(0, 10);
  const last28 = trained.filter((r) => sessionDateKey(r) >= since28 && sessionDateKey(r) <= todayKey);
  const bike28 = last28.filter(isBikeSession);

  const tsb = today ? today.tsb : 0;
  const alerts: CoachAlert[] = [];
  if (daysSinceLast === null || daysSinceLast >= NO_DATA_ALERT_DAYS) alerts.push({ kind: 'no_data', days: daysSinceLast });
  if (today && tsb <= HIGH_FATIGUE_TSB) alerts.push({ kind: 'fatigue', tsb });
  if (ftpConfirmed !== true) alerts.push({ kind: 'ftp_unconfirmed' });

  return {
    ctl: today?.ctl ?? 0,
    atl: today?.atl ?? 0,
    tsb,
    ctlDelta7: today && weekAgo ? today.ctl - weekAgo.ctl : null,
    last,
    daysSinceLast,
    weekBikeSessions: weekBike.length,
    weekTss: weekBike.reduce((sum, r) => sum + (r.tss ?? 0), 0),
    weekNonBikeSessions: thisWeek.length - weekBike.length,
    bikeSessions28d: bike28.length,
    nonBikeSessions28d: last28.length - bike28.length,
    hoursPerWeek28d: bike28.reduce((sum, r) => sum + durationS(r), 0) / 3600 / 4,
    alerts,
  };
}

export interface WeekLoad {
  /** Lunes de la semana, `YYYY-MM-DD`. */
  mondayKey: string;
  tss: number;
  /** Un elemento por sesión de fuerza/movilidad entrenada esa semana. */
  nonBike: NonBikeKind[];
}

/** TSS de bici por semana (lunes-domingo) de las últimas `weeks` semanas,
 * la actual incluida, más las sesiones de fuerza/movilidad de cada una. */
export function weeklyLoads(rows: readonly CoachSessionRow[], todayKey: string, weeks: number): WeekLoad[] {
  const current = mondayOfWeek(todayKey);
  const result: WeekLoad[] = Array.from({ length: weeks }, (_, i) => ({ mondayKey: addWeeks(current, i - weeks + 1), tss: 0, nonBike: [] }));
  const byMonday = new Map(result.map((w) => [w.mondayKey, w]));
  for (const r of rows) {
    if (!wasTrained(r)) continue;
    const week = byMonday.get(mondayOfWeek(sessionDateKey(r)));
    if (!week) continue;
    if (isNonBikeKind(r.kind)) week.nonBike.push(r.kind);
    else week.tss += r.tss ?? 0;
  }
  return result;
}
