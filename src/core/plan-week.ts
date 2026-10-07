// Lógica pura del editor de la semana de un atleta (vista del coach, paso
// 6a — ver supabase/schema.sql, plan_weeks). Sin red ni DOM.
import type { PlannedRoutine } from './coach-templates';
import type { Interval, Workout } from './types';
import type { WorkoutTemplate } from './workout-templates';

/** De dónde salió un elemento: lo que el atleta ya tenía agendado, algo
 * que agregó el coach, o una propuesta de la IA (la del coach o la del
 * atleta, paso 6b). */
export type PlanWeekItemOrigin = 'athlete' | 'coach' | 'ai';

/** Un elemento del borrador: un entrenamiento de bici (`workout`) o una
 * rutina de fuerza/movilidad (`routine`, paso 5) — exactamente uno de los
 * dos. `edited` marca lo que el coach tocó a mano — la IA no lo pisa. */
export type PlanWeekItem =
  | { workout: Workout; routine?: undefined; origin: PlanWeekItemOrigin; edited: boolean }
  | { routine: PlannedRoutine; workout?: undefined; origin: PlanWeekItemOrigin; edited: boolean };

/** ¿La IA del coach puede reemplazar este elemento? Nunca lo pasado, lo que
 * el coach agregó o editó, ni las rutinas de fuerza/movilidad. */
export function isLockedForAi(item: PlanWeekItem, todayKey: string): boolean {
  const day = itemDate(item) ?? '';
  return day < todayKey || item.routine !== undefined || item.origin === 'coach' || item.edited;
}

const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayCode = (typeof DAY_CODES)[number];

/** "mon".."sun" de cada día de la semana que empieza en `mondayKey`. */
export function dayCodeOf(dateKey: string, mondayKey: string): DayCode {
  return DAY_CODES[weekDays(mondayKey).indexOf(dateKey)] ?? 'mon';
}

export function dateOfDayCode(code: string, mondayKey: string): string | null {
  const i = DAY_CODES.indexOf(code as DayCode);
  return i < 0 ? null : weekDays(mondayKey)[i];
}

/** Días de esa semana en los que la IA puede poner algo: de hoy en adelante. */
export function openDayCodes(mondayKey: string, todayKey: string): DayCode[] {
  return weekDays(mondayKey).flatMap((d, i) => (d >= todayKey ? [DAY_CODES[i]] : []));
}

/** Aplica la propuesta de la IA: se queda todo lo bloqueado (ver
 * isLockedForAi) y lo demás se reemplaza por lo que propuso. */
export function applyAiProposal(items: readonly PlanWeekItem[], proposed: readonly Workout[], todayKey: string): PlanWeekItem[] {
  return [...items.filter((i) => isLockedForAi(i, todayKey)), ...proposed.map((workout): PlanWeekItem => ({ workout, origin: 'ai', edited: false }))];
}

export function itemDate(item: PlanWeekItem): string | undefined {
  return item.workout ? item.workout.scheduledDate : item.routine.scheduledDate;
}

export function itemId(item: PlanWeekItem): string {
  return item.workout ? item.workout.id : item.routine.id;
}

export function itemName(item: PlanWeekItem): string {
  return item.workout ? item.workout.name : item.routine.name;
}

/** El mismo item movido a otro día (marcado como editado). */
export function movedItem(item: PlanWeekItem, dateKey: string): PlanWeekItem {
  return item.workout
    ? { ...item, workout: { ...item.workout, scheduledDate: dateKey }, edited: true }
    : { ...item, routine: { ...item.routine, scheduledDate: dateKey }, edited: true };
}

/** Límites del ajuste de intensidad, en % de FTP de cada bloque. */
const MIN_POWER_PCT = 30;
const MAX_POWER_PCT = 200;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` de una fecha local (la misma que usa Plan para agendar). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Lunes (fecha local) de la semana que contiene `dateKey`. */
export function weekStartOf(dateKey: string): string {
  const d = parseKey(dateKey);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(d);
}

export function addDaysKey(dateKey: string, days: number): string {
  const d = parseKey(dateKey);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** Los 7 días (lunes a domingo) de la semana que empieza en `mondayKey`. */
export function weekDays(mondayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysKey(mondayKey, i));
}

/** Semana ISO, ej. "2026-W42" — la que se guarda en plan_weeks.iso_week. */
export function isoWeekLabel(mondayKey: string): string {
  const d = parseKey(mondayKey);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart.getTime()) / (7 * 86400000)) + 1;
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

/** Lo que el atleta ya tiene agendado esa semana (entrenamientos y
 * rutinas), como punto de partida del borrador (ordenado por día). */
export function itemsFromWorkouts(workouts: readonly Workout[], mondayKey: string, routines: readonly PlannedRoutine[] = []): PlanWeekItem[] {
  const days = new Set(weekDays(mondayKey));
  const items: PlanWeekItem[] = [
    ...workouts.filter((w) => w.scheduledDate && days.has(w.scheduledDate)).map((workout): PlanWeekItem => ({ workout, origin: 'athlete', edited: false })),
    ...routines.filter((r) => days.has(r.scheduledDate)).map((routine): PlanWeekItem => ({ routine, origin: 'athlete', edited: false })),
  ];
  return items.sort((a, b) => (itemDate(a) ?? '').localeCompare(itemDate(b) ?? ''));
}

/** Entrenamiento nuevo desde una plantilla de Torq, agendado ese día. */
export function workoutFromTemplate(template: WorkoutTemplate, minutes: number, dateKey: string, now: Date = new Date()): Workout {
  const m = Math.min(template.maxMinutes, Math.max(template.minMinutes, Math.round(minutes)));
  return {
    format_version: 1,
    id: crypto.randomUUID(),
    name: `${template.name} ${m} min`,
    description: template.description,
    intervals: template.build(m),
    created_at: now.toISOString(),
    scheduledDate: dateKey,
  };
}

function scalePct(pct: number, factor: number): number {
  return Math.min(MAX_POWER_PCT, Math.max(MIN_POWER_PCT, Math.round(pct * factor)));
}

/** Sube o baja la intensidad de todos los bloques un `deltaPct` (±5 en la
 * UI); el TSS se recalcula solo al estimar. Bloques ya en el límite se
 * quedan ahí. */
export function scaleIntensity(workout: Workout, deltaPct: number): Workout {
  const factor = 1 + deltaPct / 100;
  const intervals: Interval[] = workout.intervals.map((iv) => ({
    ...iv,
    power_pct: scalePct(iv.power_pct, factor),
    ...(iv.ramp_to_pct !== undefined ? { ramp_to_pct: scalePct(iv.ramp_to_pct, factor) } : {}),
  }));
  return { ...workout, intervals };
}

/** Marca un item de bici como editado por el coach, con el workout ya cambiado. */
export function editedItem(item: PlanWeekItem, workout: Workout): PlanWeekItem {
  return { workout, origin: item.origin, edited: true };
}
