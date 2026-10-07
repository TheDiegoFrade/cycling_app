// Lógica pura del editor de la semana de un atleta (vista del coach, paso
// 6a — ver supabase/schema.sql, plan_weeks). Sin red ni DOM.
import type { Interval, Workout } from './types';
import type { WorkoutTemplate } from './workout-templates';

/** Un entrenamiento del borrador. `origin` dice de dónde salió (lo que el
 * atleta ya tenía agendado, o algo que agregó el coach); `edited` marca lo
 * que el coach tocó a mano — la IA (paso 6b) no debe pisarlo. */
export interface PlanWeekItem {
  workout: Workout;
  origin: 'athlete' | 'coach';
  edited: boolean;
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

/** Lo que el atleta ya tiene agendado esa semana, como punto de partida
 * del borrador (ordenado por día). */
export function itemsFromWorkouts(workouts: readonly Workout[], mondayKey: string): PlanWeekItem[] {
  const days = new Set(weekDays(mondayKey));
  return workouts
    .filter((w) => w.scheduledDate && days.has(w.scheduledDate))
    .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''))
    .map((workout) => ({ workout, origin: 'athlete', edited: false }));
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

/** Marca un item como editado por el coach, con el workout ya cambiado. */
export function editedItem(item: PlanWeekItem, workout: Workout): PlanWeekItem {
  return { ...item, workout, edited: true };
}
