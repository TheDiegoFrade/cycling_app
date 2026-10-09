// La ficha del atleta por ventanas de tiempo (7, 28, 90 y 180 días): lo que
// el coach de IA recibe como `athleteState` y lo que muestran Forma y la
// vista del coach. Sale de métricas ya calculadas por sesión
// (engine/session-metrics.ts), así funciona igual con sesiones locales que
// con las de la nube. La regla de "cuánta historia" vive aquí, no en el
// modelo: lo que no tiene datos suficientes va como null o 'untested'.
// Formato compacto a propósito (~460 tokens, ver
// coach-lab/fase-3-propuesta.md). Lógica pura.
import type { CurveKey, PeakQuality, SessionMetrics } from './session-metrics';

export interface StateSession {
  dateKey: string; // YYYY-MM-DD
  durationS: number;
  tss: number | null;
  hrDriftPct: number | null;
  ef: number | null;
  workoutId: string | null;
  metrics: SessionMetrics | null;
}

/** Workout de bici que estaba agendado (para el cumplimiento). */
export interface StatePlanned {
  id: string;
  dateKey: string;
}

export type PeakQualityOrUntested = PeakQuality | 'untested';
/** [watts, "MM-DD", calidad] — o [null, null, 'untested'] si nadie lo probó. */
export type PeakTuple = [number, string, PeakQuality] | [null, null, 'untested'];

export interface WindowState {
  hours: number;
  tss: number;
  kJ: number | null;
  sessions: number;
  compliancePct: number | null;
  /** Horas en Z1..Z6 de potencia. null si ninguna sesión trae métricas. */
  zoneHours: number[] | null;
  /** Mediana de sesiones estables (≥ 3, si no null). */
  aerobic: { decouplingPct: number; ef: number; n: number } | null;
  threshold: { longestMin: number; weeklyMin: number } | null;
  /** Minutos por semana a cadencia baja con carga (fuerza en la bici). */
  lowCadenceMinPerWeek: number | null;
  /** Solo en 28, 90 y 180 días: en una semana los picos casi nunca son máximos. */
  peaks?: Partial<Record<PeakKey, PeakTuple>>;
  /** Potencia crítica, solo en 90 días y solo con ≥ 2 esfuerzos máximos de
   * duraciones distintas (3-20 min). */
  cp?: { cpW: number; wPrimeKJ: number; from: string[] } | null;
}

export interface AthleteState {
  historyWeeks: number;
  /** El hueco más reciente de 7 días o más sin entrenar, en los últimos 180. */
  lastGap: { days: number; endedOn: string } | null;
  windows: { d7: WindowState; d28: WindowState; d90: WindowState; d180: WindowState };
}

export const PEAK_KEYS = ['s30', 'm1', 'm5', 'm8', 'm20', 'm60'] as const;
export type PeakKey = (typeof PEAK_KEYS)[number];
const CP_KEYS: { key: CurveKey; seconds: number }[] = [
  { key: 'm5', seconds: 300 },
  { key: 'm8', seconds: 480 },
  { key: 'm20', seconds: 1200 },
];
const MIN_COMPARABLE = 3;
const GAP_DAYS = 7;

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Potencia crítica por regresión lineal trabajo = CP·t + W′ sobre los
 * mejores esfuerzos máximos de 5, 8 y 20 min. null si no hay 2 duraciones
 * distintas o el ajuste no tiene sentido físico. */
export function criticalPower(points: { seconds: number; watts: number; dateKey: string }[]): WindowState['cp'] {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.seconds);
  const ys = points.map((p) => p.watts * p.seconds);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const cp = num / den;
  const wPrime = my - cp * mx;
  if (!(cp > 0) || !(wPrime > 0)) return null;
  return { cpW: Math.round(cp), wPrimeKJ: r1(wPrime / 1000), from: points.map((p) => p.dateKey.slice(5)) };
}

function windowState(sessions: StateSession[], planned: StatePlanned[], days: number, withPeaks: boolean, withCp: boolean): WindowState {
  const weeks = days / 7;
  const withMetrics = sessions.filter((s) => s.metrics);
  const zoneSec = [0, 0, 0, 0, 0, 0];
  for (const s of withMetrics) s.metrics!.zoneSec.forEach((v, i) => (zoneSec[i] += v));

  const steady = sessions.filter((s) => s.metrics?.steady && s.hrDriftPct !== null && s.ef !== null);
  const doneIds = new Set(sessions.map((s) => s.workoutId).filter((id): id is string => !!id));

  const state: WindowState = {
    hours: r1(sessions.reduce((a, s) => a + s.durationS, 0) / 3600),
    tss: Math.round(sessions.reduce((a, s) => a + (s.tss ?? 0), 0)),
    kJ: withMetrics.length ? Math.round(withMetrics.reduce((a, s) => a + s.metrics!.kJ, 0)) : null,
    sessions: sessions.length,
    compliancePct: planned.length ? Math.round((planned.filter((p) => doneIds.has(p.id)).length / planned.length) * 100) : null,
    zoneHours: withMetrics.length ? zoneSec.map((v) => r1(v / 3600)) : null,
    aerobic:
      steady.length >= MIN_COMPARABLE
        ? { decouplingPct: r1(median(steady.map((s) => s.hrDriftPct!))), ef: r2(median(steady.map((s) => s.ef!))), n: steady.length }
        : null,
    threshold: withMetrics.length
      ? {
          longestMin: Math.max(...withMetrics.map((s) => s.metrics!.threshold.longestMin)),
          weeklyMin: Math.round(withMetrics.reduce((a, s) => a + s.metrics!.threshold.totalMin, 0) / weeks),
        }
      : null,
    lowCadenceMinPerWeek: withMetrics.length ? r1(withMetrics.reduce((a, s) => a + (s.metrics!.torque?.lowCadenceMin ?? 0), 0) / weeks) : null,
  };

  if (withPeaks) {
    const peaks: Partial<Record<PeakKey, PeakTuple>> = {};
    for (const key of PEAK_KEYS) {
      let best: StateSession | null = null;
      for (const s of withMetrics) if ((s.metrics!.curve[key] ?? 0) > (best?.metrics!.curve[key] ?? 0)) best = s;
      peaks[key] = best ? [best.metrics!.curve[key]!, best.dateKey.slice(5), best.metrics!.curveQuality[key] ?? 'incidental'] : [null, null, 'untested'];
    }
    state.peaks = peaks;
  }

  if (withCp) {
    // Solo esfuerzos máximos: un modelo hecho con picos incidentales engaña.
    const points = CP_KEYS.flatMap(({ key, seconds }) => {
      let best: StateSession | null = null;
      for (const s of withMetrics) {
        if (s.metrics!.curveQuality[key] === 'max_effort' && (s.metrics!.curve[key] ?? 0) > (best?.metrics!.curve[key] ?? 0)) best = s;
      }
      return best ? [{ seconds, watts: best.metrics!.curve[key]!, dateKey: best.dateKey }] : [];
    });
    state.cp = criticalPower(points);
  }
  return state;
}

/** Lo que cae en los `days` días que terminan en `endKey` (inclusive). */
export function inWindow<T extends { dateKey: string }>(xs: readonly T[], endKey: string, days: number): T[] {
  const from = addDays(endKey, -(days - 1));
  return xs.filter((x) => x.dateKey >= from && x.dateKey <= endKey);
}

/** Una ventana cualquiera (la usa también la pantalla Forma). */
export function windowStateFor(
  sessions: readonly StateSession[],
  planned: readonly StatePlanned[],
  endKey: string,
  days: number,
  opts: { peaks?: boolean; cp?: boolean } = {},
): WindowState {
  return windowState(inWindow(sessions, endKey, days), inWindow(planned, endKey, days), days, !!opts.peaks, !!opts.cp);
}

export function computeAthleteState(sessions: readonly StateSession[], planned: readonly StatePlanned[], todayKey: string): AthleteState {
  const win = (days: number, withPeaks: boolean, withCp = false) => windowStateFor(sessions, planned, todayKey, days, { peaks: withPeaks, cp: withCp });

  const dates = [...new Set(sessions.map((s) => s.dateKey))].filter((d) => d <= todayKey).sort();
  let lastGap: AthleteState['lastGap'] = null;
  const since = addDays(todayKey, -180);
  // huecos entre sesiones, y el que va de la última sesión a hoy
  const points = [...dates, addDays(todayKey, 1)];
  for (let i = points.length - 1; i > 0; i--) {
    const gap = daysBetween(points[i - 1], points[i]) - 1;
    if (points[i - 1] < since) break;
    if (gap >= GAP_DAYS) {
      lastGap = { days: gap, endedOn: i === points.length - 1 ? todayKey : points[i] };
      break;
    }
  }

  return {
    historyWeeks: dates.length ? Math.max(1, Math.round(daysBetween(dates[0], todayKey) / 7)) : 0,
    lastGap,
    windows: { d7: win(7, false), d28: win(28, true), d90: win(90, true, true), d180: win(180, true) },
  };
}
