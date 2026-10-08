// Resumen de bienestar (VFC de reposo, pulso en reposo, sueño) para la
// ficha del atleta: lo que el coach de IA recibe en `athleteState.wellness`
// y lo que muestra Forma. Los datos diarios vienen de intervals.icu (que a
// su vez los toma del reloj, Oura, Whoop, etc.), nunca de Strava.
//
// El estado de la VFC sigue el método de la línea base (Plews; Altini/
// HRV4Training): se compara el promedio de 7 días del ln(rMSSD) contra el
// de 60 días, y "normal" es estar dentro de ±0.5 desviaciones estándar de
// los valores diarios. Una medición sola no dice nada; la tendencia sí.
// Lógica pura.
import { addDays } from './athlete-state';

export interface WellnessDay {
  dateKey: string; // YYYY-MM-DD
  /** rMSSD de reposo (ms), normalmente de la noche. */
  hrvMs: number | null;
  restingHr: number | null;
  sleepH: number | null;
}

export type HrvStatus = 'low' | 'normal' | 'high';

export interface WellnessSummary {
  /** Promedio de 7 días (ms); null con menos de 3 mediciones. */
  hrv7d: number | null;
  /** Promedio de 60 días (ms); null con menos de 14 mediciones. */
  hrvBaseline60d: number | null;
  /** Necesita las dos de arriba. */
  hrvStatus: HrvStatus | null;
  restingHr7d: number | null;
  restingHrBaseline60d: number | null;
  sleepH7d: number | null;
}

const MIN_WEEK = 3;
const MIN_BASELINE = 14;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;

function valuesIn(days: readonly WellnessDay[], fromKey: string, toKey: string, pick: (d: WellnessDay) => number | null): number[] {
  return days
    .filter((d) => d.dateKey >= fromKey && d.dateKey <= toKey)
    .flatMap((d) => {
      const v = pick(d);
      return v !== null && v > 0 ? [v] : [];
    });
}

/** null si no hay ni un dato en los últimos 60 días (sin integración o sin
 * reloj que mida de noche): mejor ausente que una ficha llena de nulls. */
export function wellnessSummary(days: readonly WellnessDay[], todayKey: string): WellnessSummary | null {
  const from7 = addDays(todayKey, -6);
  const from60 = addDays(todayKey, -59);
  const hrv7 = valuesIn(days, from7, todayKey, (d) => d.hrvMs);
  const hrv60 = valuesIn(days, from60, todayKey, (d) => d.hrvMs);
  const rhr7 = valuesIn(days, from7, todayKey, (d) => d.restingHr);
  const rhr60 = valuesIn(days, from60, todayKey, (d) => d.restingHr);
  const sleep7 = valuesIn(days, from7, todayKey, (d) => d.sleepH);
  if (!hrv60.length && !rhr60.length && !valuesIn(days, from60, todayKey, (d) => d.sleepH).length) return null;

  let hrvStatus: HrvStatus | null = null;
  if (hrv7.length >= MIN_WEEK && hrv60.length >= MIN_BASELINE) {
    const ln60 = hrv60.map(Math.log);
    const base = mean(ln60);
    const sd = Math.sqrt(mean(ln60.map((x) => (x - base) ** 2)));
    const week = mean(hrv7.map(Math.log));
    hrvStatus = week < base - 0.5 * sd ? 'low' : week > base + 0.5 * sd ? 'high' : 'normal';
  }

  return {
    hrv7d: hrv7.length >= MIN_WEEK ? Math.round(mean(hrv7)) : null,
    hrvBaseline60d: hrv60.length >= MIN_BASELINE ? Math.round(mean(hrv60)) : null,
    hrvStatus,
    restingHr7d: rhr7.length >= MIN_WEEK ? Math.round(mean(rhr7)) : null,
    restingHrBaseline60d: rhr60.length >= MIN_BASELINE ? Math.round(mean(rhr60)) : null,
    sleepH7d: sleep7.length >= MIN_WEEK ? r1(mean(sleep7)) : null,
  };
}
