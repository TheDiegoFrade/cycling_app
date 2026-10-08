// Datos de la sección "Análisis" de Forma (y de la ficha del atleta en la
// vista del coach) para una ventana de 1 semana a 6 meses: la ficha de esa
// ventana (engine/athlete-state.ts) más lo que solo necesita la pantalla —
// la curva completa contra la ventana anterior del mismo largo, el
// desacople sesión por sesión y el volumen por semana. Lógica pura.
import { addDays, inWindow, windowStateFor } from './athlete-state';
import type { StatePlanned, StateSession, WindowState } from './athlete-state';
import { CURVE_WINDOWS } from './session-metrics';
import type { CurveKey, PeakQuality } from './session-metrics';

export const ANALYSIS_WINDOWS = [
  { days: 7, label: '1 semana' },
  { days: 28, label: '1 mes' },
  { days: 90, label: '3 meses' },
  { days: 180, label: '6 meses' },
] as const;

export interface CurvePoint {
  key: CurveKey;
  seconds: number;
  /** Mejor de la ventana; null si nadie lo probó. */
  watts: number | null;
  dateKey: string | null;
  quality: PeakQuality | null;
  /** Mejor de la ventana anterior del mismo largo, para comparar. */
  prevWatts: number | null;
}

export interface WeekVolume {
  mondayKey: string;
  hours: number;
  tss: number;
  kJ: number | null;
}

export interface AnalysisWindow {
  days: number;
  state: WindowState;
  curve: CurvePoint[];
  /** Una por sesión estable (las únicas comparables), en orden de fecha. */
  decoupling: { dateKey: string; pct: number }[];
  weeks: WeekVolume[];
}

function mondayOf(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return addDays(dateKey, -((d.getUTCDay() + 6) % 7));
}

function bestOf(sessions: readonly StateSession[], key: CurveKey): StateSession | null {
  let best: StateSession | null = null;
  for (const s of sessions) if ((s.metrics?.curve[key] ?? 0) > (best?.metrics?.curve[key] ?? 0)) best = s;
  return best;
}

export function analysisWindow(sessions: readonly StateSession[], planned: readonly StatePlanned[], todayKey: string, days: number): AnalysisWindow {
  const current = inWindow(sessions, todayKey, days);
  const previous = inWindow(sessions, addDays(todayKey, -days), days);

  const curve = (Object.entries(CURVE_WINDOWS) as [CurveKey, number][]).map(([key, seconds]): CurvePoint => {
    const best = bestOf(current, key);
    const prev = bestOf(previous, key);
    return {
      key,
      seconds,
      watts: best?.metrics?.curve[key] ?? null,
      dateKey: best?.dateKey ?? null,
      quality: best ? (best.metrics!.curveQuality[key] ?? 'incidental') : null,
      prevWatts: prev?.metrics?.curve[key] ?? null,
    };
  });

  const decoupling = current
    .filter((s) => s.metrics?.steady && s.hrDriftPct !== null)
    .map((s) => ({ dateKey: s.dateKey, pct: Math.round(s.hrDriftPct! * 10) / 10 }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  // Semanas completas de la ventana, incluida la que está en curso.
  const weeks: WeekVolume[] = [];
  for (let m = mondayOf(addDays(todayKey, -(days - 1))); m <= todayKey; m = addDays(m, 7)) {
    const inWeek = current.filter((s) => s.dateKey >= m && s.dateKey < addDays(m, 7));
    const withKj = inWeek.filter((s) => s.metrics);
    weeks.push({
      mondayKey: m,
      hours: Math.round((inWeek.reduce((a, s) => a + s.durationS, 0) / 3600) * 10) / 10,
      tss: Math.round(inWeek.reduce((a, s) => a + (s.tss ?? 0), 0)),
      kJ: withKj.length ? Math.round(withKj.reduce((a, s) => a + s.metrics!.kJ, 0)) : null,
    });
  }

  return { days, state: windowStateFor(sessions, planned, todayKey, days, { peaks: true, cp: days >= 28 }), curve, decoupling, weeks };
}

/** Minutos que aguanta a `watts` según el modelo de potencia crítica
 * (W′ / (P − CP)). null por debajo de CP (en teoría, mucho tiempo). */
export function minutesAt(watts: number, cp: { cpW: number; wPrimeKJ: number }): number | null {
  if (watts <= cp.cpW) return null;
  return Math.round((cp.wPrimeKJ * 1000) / (watts - cp.cpW) / 60);
}
