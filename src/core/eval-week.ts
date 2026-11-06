// Qué semana del plan evalúa weekly_eval y cuál genera, según la fecha de
// hoy. Antes la evaluación solo se abría al terminar TODAS las semanas que
// create_plan dejó armadas (hasta 3): la retro de la semana 1 no podía tocar
// la 2 ni la 3, y al agotarse el bloque el plan se quedaba sin salida
// (publish_block no tiene UI). Ahora: al terminar cada semana se evalúa esa
// y se genera la siguiente — reemplazándola si ya estaba armada y todavía no
// empieza, o agregándola si no —, también cuando la siguiente abre un bloque
// nuevo. Lógica pura: la usan la app (coach.ts) y coach-chat (vía core.gen.js).

const DAY_MS = 86_400_000;

function mondayKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Semana del plan (0 = la de arranque) que contiene `dateKey`. Negativa si es antes del plan. */
export function planWeekOf(startDate: string, dateKey: string): number {
  const diff = Date.parse(`${mondayKey(dateKey)}T00:00:00Z`) - Date.parse(`${mondayKey(startDate)}T00:00:00Z`);
  return Math.round(diff / DAY_MS / 7);
}

export interface EvalTarget {
  /** La semana que se acaba de terminar (la que se evalúa). */
  evaluated: number;
  /** La que se genera con esa retro. */
  target: number;
}

/**
 * El domingo ya cuenta como fin de semana: se evalúa la semana que termina
 * hoy y se genera la que empieza mañana. Los demás días se evalúa la semana
 * pasada y se genera (o se rehace) la actual — los días que ya pasaron no se
 * agendan. null si todavía no termina ni la semana de arranque.
 */
export function evalWeekTarget(startDate: string, todayKey: string): EvalTarget | null {
  const current = planWeekOf(startDate, todayKey);
  const isSunday = new Date(`${todayKey}T00:00:00Z`).getUTCDay() === 0;
  const evaluated = isSunday ? current : current - 1;
  if (evaluated < 0) return null;
  return { evaluated, target: evaluated + 1 };
}

/** Semanas que dura el plan completo (todos sus bloques). */
export function planTotalWeeks(blocks: readonly { weeks: number }[]): number {
  return blocks.reduce((s, b) => s + b.weeks, 0);
}

/** ¿Le toca evaluar su semana? (para avisarle en Inicio y en Plan). Si la
 * semana que se acaba de terminar no se ha evaluado: `week` es esa (1 = la
 * primera) y `nextEmpty` dice si la siguiente todavía no tiene
 * entrenamientos (create_plan arma hasta 3 semanas; las demás solo existen
 * si evalúa). null = no hay nada que evaluar (todavía no termina la primera
 * semana, ya la evaluó, o el plan terminó). */
export function weeklyEvalDue(
  plan: {
    startDate: string;
    blocks: readonly { weeks: number }[];
    weeks: readonly { weekIndex: number; workoutIds: readonly string[] }[];
    /** Semana del plan (0 = la de arranque) que se evaluó la última vez. */
    lastEvaluatedWeek?: number | null;
    /** Planes de antes de guardar lastEvaluatedWeek: la semana ISO de la última evaluación. */
    lastEvalIsoWeek?: string | null;
  },
  todayKey: string,
  isoWeekOfToday: string,
): { week: number; nextWeek: number; nextEmpty: boolean } | null {
  const t = evalWeekTarget(plan.startDate, todayKey);
  if (!t || t.target >= planTotalWeeks(plan.blocks)) return null;
  const done =
    typeof plan.lastEvaluatedWeek === 'number' ? plan.lastEvaluatedWeek >= t.evaluated : !!plan.lastEvalIsoWeek && plan.lastEvalIsoWeek === isoWeekOfToday;
  if (done) return null;
  const nextEmpty = !plan.weeks.some((w) => w.weekIndex === t.target && w.workoutIds.length > 0);
  return { week: t.evaluated + 1, nextWeek: t.target + 1, nextEmpty };
}


/** La clave de semana ("2026-W44") con la que la app y coach-chat guardan
 * `last_eval_iso_week` (currentIsoWeek en coach.ts y coach-chat): mismo
 * cálculo, en UTC, para poder compararla. Ojo: no es la semana ISO exacta
 * (no ajusta por el día de la semana del 4 de enero; en 2026 queda una
 * atrás), pero solo se usa para saber si dos fechas caen en la misma semana
 * de lunes a domingo. */
export function storedIsoWeekKey(now: Date): string {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  target.setUTCDate(target.getUTCDate() - ((target.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / DAY_MS - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
