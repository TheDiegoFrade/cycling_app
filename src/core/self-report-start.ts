// Cómo trata el reporte mensual sin coach (monthly-self-report) el arranque
// de cada atleta: los reportes son por mes calendario, pero cada quien empieza
// en su fecha (su primera sesión o el inicio de su plan).
import { monthEnd, monthStart, shiftMonth } from './monthly-report';

/** Un mes de arranque con menos días que esto no tiene reporte propio: va
 * dentro del reporte del mes siguiente. */
export const SHORT_FIRST_MONTH_DAYS = 14;

export type StartPhase =
  /** Ya entrenaba desde antes de este mes (o no hay fecha): reporte normal. */
  | { kind: 'regular' }
  /** Empezó a mitad de este mes con días suficientes: se evalúa desde su fecha. */
  | { kind: 'first_partial'; startedOn: string }
  /** Empezó tan tarde que el mes no alcanza: sin reporte, va en el siguiente. */
  | { kind: 'skip_short_first'; startedOn: string; days: number }
  /** Su primer mes completo, después de un arranque corto el mes anterior. */
  | { kind: 'first_full_after_short'; startedOn: string };

/** Días desde `startedOn` hasta el fin de su mes, contando los dos. */
function daysToMonthEnd(startedOn: string): number {
  const end = monthEnd(startedOn.slice(0, 7));
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${startedOn}T00:00:00Z`)) / 86400000) + 1;
}

export function startPhase(startedOn: string | null, monthKey: string): StartPhase {
  if (!startedOn) return { kind: 'regular' };
  const start = monthStart(monthKey);
  const end = monthEnd(monthKey);
  if (startedOn > start && startedOn <= end) {
    const days = daysToMonthEnd(startedOn);
    return days < SHORT_FIRST_MONTH_DAYS ? { kind: 'skip_short_first', startedOn, days } : { kind: 'first_partial', startedOn };
  }
  const prevStart = monthStart(shiftMonth(monthKey, -1));
  if (startedOn > prevStart && startedOn < start && daysToMonthEnd(startedOn) < SHORT_FIRST_MONTH_DAYS) {
    return { kind: 'first_full_after_short', startedOn };
  }
  return { kind: 'regular' };
}
