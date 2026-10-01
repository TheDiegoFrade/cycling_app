/** Lunes de la semana (UTC) que contiene `dateKey` — mismo criterio
 * lunes-domingo que ya usan calendar.ts/home.ts, pero en UTC para no
 * depender de la zona horaria de quien ejecute esto (tests, etc.). */
function mondayOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function addWeeks(mondayKey: string, weeks: number): string {
  const [y, m, d] = mondayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

export interface StreakResult {
  /** Semanas seguidas (hasta la actual o la pasada) con al menos una sesión. */
  currentWeeks: number;
  /** La racha más larga en todo el historial conocido. */
  bestWeeks: number;
}

/** Racha de semanas (lunes-domingo) con al menos una sesión completada — no
 * exige un TSS mínimo, cualquier sesión cuenta. La semana en curso no rompe
 * la racha si todavía no se ha entrenado esa semana (se cuenta desde la
 * semana pasada); si la pasada tampoco tiene sesión, la racha actual es 0. */
export function computeWeeklyStreak(sessionDates: readonly string[], todayKey: string): StreakResult {
  const trainedWeeks = new Set(sessionDates.map(mondayOfWeek));
  if (trainedWeeks.size === 0) return { currentWeeks: 0, bestWeeks: 0 };

  const thisMonday = mondayOfWeek(todayKey);
  let startMonday = thisMonday;
  if (!trainedWeeks.has(thisMonday)) startMonday = addWeeks(thisMonday, -1);

  let currentWeeks = 0;
  let cursor = startMonday;
  while (trainedWeeks.has(cursor)) {
    currentWeeks++;
    cursor = addWeeks(cursor, -1);
  }

  // mejor racha histórica: recorre todas las semanas entrenadas ordenadas y
  // cuenta tramos consecutivos (diferencia de 7 días entre lunes seguidos).
  const sortedWeeks = Array.from(trainedWeeks).sort();
  let bestWeeks = 1;
  let run = 1;
  for (let i = 1; i < sortedWeeks.length; i++) {
    const isConsecutive = addWeeks(sortedWeeks[i - 1], 1) === sortedWeeks[i];
    run = isConsecutive ? run + 1 : 1;
    bestWeeks = Math.max(bestWeeks, run);
  }

  return { currentWeeks, bestWeeks: Math.max(bestWeeks, currentWeeks) };
}
