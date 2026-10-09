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
