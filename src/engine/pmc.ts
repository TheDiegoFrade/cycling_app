import { estimateWorkout } from '../core/workout-estimate';
import type { Workout } from '../core/types';

const CTL_TIME_CONSTANT_DAYS = 42;
const ATL_TIME_CONSTANT_DAYS = 7;
const PROJECTION_MIN_DAYS = 7;
const PROJECTION_MAX_DAYS = 21;

export interface DailyTss {
  /** Fecha en formato `YYYY-MM-DD`, UTC. */
  dateKey: string;
  tss: number;
}

export interface PmcPoint {
  dateKey: string;
  /** Chronic Training Load ("Fitness"): EMA de 42 días del TSS diario. */
  ctl: number;
  /** Acute Training Load ("Fatigue"): EMA de 7 días del TSS diario. */
  atl: number;
  /** Training Stress Balance ("Form") = CTL − ATL del día anterior, es
   * decir la forma con la que arrancaste el día, antes de absorber el TSS
   * de hoy. */
  tsb: number;
}

function emaFactor(timeConstantDays: number): number {
  return 1 - Math.exp(-1 / timeConstantDays);
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Arma la serie diaria de CTL/ATL/TSB desde el primer hasta el último día
 * con datos, rellenando con TSS 0 los días sin sesión (el descanso también
 * cuenta para el modelo). Si dos sesiones caen el mismo día, su TSS se
 * suma. */
export function computePmc(entries: readonly DailyTss[]): PmcPoint[] {
  if (entries.length === 0) return [];

  const tssByDate = new Map<string, number>();
  for (const e of entries) tssByDate.set(e.dateKey, (tssByDate.get(e.dateKey) ?? 0) + e.tss);

  const dates = Array.from(tssByDate.keys()).sort();
  const start = parseDateKey(dates[0]);
  const end = parseDateKey(dates[dates.length - 1]);
  const ctlFactor = emaFactor(CTL_TIME_CONSTANT_DAYS);
  const atlFactor = emaFactor(ATL_TIME_CONSTANT_DAYS);

  const points: PmcPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateKey = toDateKey(d);
    const tsb = ctl - atl;
    const tss = tssByDate.get(dateKey) ?? 0;
    ctl = ctl + (tss - ctl) * ctlFactor;
    atl = atl + (tss - atl) * atlFactor;
    points.push({ dateKey, ctl, atl, tsb });
  }
  return points;
}

function addDays(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / 86400000);
}

/** TSS futuro sintético día por día, a partir de los workouts YA agendados
 * en Plan — nunca inventado: un día sin nada agendado cuenta TSS 0. El
 * horizonte es el día del último workout agendado (acotado entre
 * PROJECTION_MIN_DAYS y PROJECTION_MAX_DAYS), o el mínimo si no hay nada
 * agendado — así igual se ve la caída natural de Fitness si no se entrena.
 * Pensado para concatenarse con el histórico real y pasarse a computePmc en
 * una sola llamada (ver history.ts), para que el CTL/ATL de la proyección
 * arranque exactamente del valor real de hoy sin saltos. */
export function futureTssEntries(
  workouts: readonly Pick<Workout, 'scheduledDate' | 'intervals'>[],
  ftp: number,
  todayKey: string,
  minDays = PROJECTION_MIN_DAYS,
  maxDays = PROJECTION_MAX_DAYS,
): DailyTss[] {
  const future = workouts.filter((w) => w.scheduledDate && w.scheduledDate > todayKey);
  const lastScheduledKey = future.reduce<string | null>((max, w) => (!max || w.scheduledDate! > max ? w.scheduledDate! : max), null);
  const horizonDays = lastScheduledKey ? Math.min(maxDays, Math.max(minDays, daysBetween(todayKey, lastScheduledKey))) : minDays;

  const tssByDate = new Map<string, number>();
  future.forEach((w) => {
    const key = w.scheduledDate!;
    const tss = estimateWorkout(w.intervals, ftp).tss ?? 0;
    tssByDate.set(key, (tssByDate.get(key) ?? 0) + tss);
  });

  const entries: DailyTss[] = [];
  for (let offset = 1; offset <= horizonDays; offset++) {
    const dateKey = addDays(todayKey, offset);
    entries.push({ dateKey, tss: tssByDate.get(dateKey) ?? 0 });
  }
  return entries;
}
