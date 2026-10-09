// Métricas por sesión que se guardan en la nube (sessions.metrics) para que
// la ficha del atleta pueda mirar 3 y 6 meses sin los samples, que solo
// viven en el dispositivo que grabó la sesión. Pensadas para lo que analiza
// un coach: curva de potencia con la calidad de cada pico, volumen en kJ,
// tiempo por zona, torque, tiempo a umbral y si la sesión sirve para
// comparar desacople. Ver coach-lab/fase-3-propuesta.md. Lógica pura.
import type { Sample } from '../core/types';
import { powerZone } from '../core/zones';
import { normalizedPower } from './analytics';

export const CURVE_WINDOWS = { s5: 5, s30: 30, m1: 60, m5: 300, m8: 480, m20: 1200, m60: 3600 } as const;
export type CurveKey = keyof typeof CURVE_WINDOWS;

/** Cómo salió un pico: de un esfuerzo máximo (test o bloque libre), con la
 * potencia fijada por el ERG (solo prueba que aguanta esa potencia), o
 * dentro de un entrenamiento normal. Una ventana sin dato no aparece. */
export type PeakQuality = 'max_effort' | 'erg_fixed' | 'incidental';

export interface SessionMetrics {
  v: 1;
  curve: Partial<Record<CurveKey, number>>;
  /** Solo las ventanas que no son 'incidental' (así pesa menos). */
  curveQuality: Partial<Record<CurveKey, Exclude<PeakQuality, 'incidental'>>>;
  kJ: number;
  /** Segundos en zonas de potencia Z1..Z6. */
  zoneSec: [number, number, number, number, number, number];
  /** N·m (9.549 × W / rpm). lowCadenceMin: minutos a < 70 rpm con > 80 % FTP. */
  torque: { avgNm: number; maxNm: number; lowCadenceMin: number } | null;
  /** Bloque continuo más largo y minutos totales a ≥ 95 % FTP (promedios de
   * 30 s; una caída de hasta 10 s no corta el bloque). */
  threshold: { longestMin: number; totalMin: number };
  /** Sirve para comparar desacople y EF: ≥ 45 min, VI ≤ 1.05, IF 0.60-0.80. */
  steady: boolean;
}

export interface MetricsHints {
  /** El workout es un test (kind 'test'): sus picos son esfuerzos máximos. */
  isTest?: boolean;
  /** Índices (base 0) de los intervalos 'free' (autodosificados). */
  selfPacedIntervals?: readonly number[];
}

const MIN_SAMPLES = 60;
const ERG_FIXED_CV = 0.02;
const ERG_TARGET_TOLERANCE = 0.05;
const LOW_CADENCE_RPM = 70;
const LOW_CADENCE_LOAD = 0.8;
const THRESHOLD_PCT = 0.95;
// Sobre promedios de 30 s, una caída de ~10 s se ve como ~30 s por debajo:
// eso no corta el bloque; una recuperación entre series (≥ 1 min) sí.
const THRESHOLD_GAP_S = 30;

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

function rolling(values: readonly number[], window: number): number[] {
  if (values.length < window) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out.push(sum / window);
  }
  return out;
}

/** Potencia casi constante y pegada al objetivo: la puso el ERG. Sin
 * objetivo registrado (samples leídos de un .fit), basta la variación. */
function isErgFixed(seg: readonly Sample[]): boolean {
  if (seg.length < MIN_SAMPLES) return false;
  const smooth = rolling(seg.map((s) => s.power), 5);
  const m = mean(smooth);
  if (!(m > 0)) return false;
  const cv = Math.sqrt(mean(smooth.map((v) => (v - m) ** 2))) / m;
  const target = mean(seg.map((s) => s.target));
  if (cv >= ERG_FIXED_CV) return false;
  return target > 0 ? Math.abs(mean(seg.map((s) => s.power)) - target) / target < ERG_TARGET_TOLERANCE : true;
}

function peakQuality(seg: readonly Sample[], hints: MetricsHints): PeakQuality {
  if (isErgFixed(seg)) return 'erg_fixed';
  if (hints.isTest) return 'max_effort';
  const selfPaced = new Set(hints.selfPacedIntervals ?? []);
  const inSelfPaced = seg.filter((s) => selfPaced.has(s.interval_index)).length;
  return inSelfPaced >= seg.length / 2 ? 'max_effort' : 'incidental';
}

function thresholdBlocks(powers: readonly number[], ftp: number): { longestMin: number; totalMin: number } {
  const above = rolling(powers, 30).map((p) => p >= THRESHOLD_PCT * ftp);
  let longest = 0;
  let run = 0;
  let gap = 0;
  for (const a of above) {
    if (a) {
      run += 1 + gap; // una caída corta dentro del bloque cuenta como parte de él
      gap = 0;
      longest = Math.max(longest, run);
    } else if (run > 0 && gap < THRESHOLD_GAP_S) {
      gap++;
    } else {
      run = 0;
      gap = 0;
    }
  }
  return { longestMin: r1(longest / 60), totalMin: r1(above.filter(Boolean).length / 60) };
}

export function computeSessionMetrics(samples: readonly Sample[], ftp: number, hints: MetricsHints = {}): SessionMetrics | null {
  if (samples.length < MIN_SAMPLES || !(ftp > 0)) return null;
  const powers = samples.map((s) => s.power);

  const curve: SessionMetrics['curve'] = {};
  const curveQuality: SessionMetrics['curveQuality'] = {};
  for (const [key, window] of Object.entries(CURVE_WINDOWS) as [CurveKey, number][]) {
    const avgs = rolling(powers, window);
    if (avgs.length === 0) continue;
    let best = 0;
    for (let i = 1; i < avgs.length; i++) if (avgs[i] > avgs[best]) best = i;
    curve[key] = Math.round(avgs[best]);
    // 5 y 30 s son demasiado cortos para distinguir ERG de un esfuerzo
    const q = window >= 60 ? peakQuality(samples.slice(best, best + window), hints) : hints.isTest ? 'max_effort' : 'incidental';
    if (q !== 'incidental') curveQuality[key] = q;
  }

  const zoneSec: SessionMetrics['zoneSec'] = [0, 0, 0, 0, 0, 0];
  for (const p of powers) zoneSec[powerZone((p / ftp) * 100) - 1]++;

  const pedaling = samples.filter((s) => s.cadence >= 20 && s.power > 0);
  const torques = pedaling.map((s) => (9.549 * s.power) / s.cadence);
  const lowCadenceS = pedaling.filter((s) => s.cadence < LOW_CADENCE_RPM && s.power > LOW_CADENCE_LOAD * ftp).length;

  const np = normalizedPower(powers);
  const avg = mean(powers);
  const intensity = np / ftp;

  return {
    v: 1,
    curve,
    curveQuality,
    kJ: Math.round(powers.reduce((a, b) => a + b, 0) / 1000),
    zoneSec,
    torque: torques.length ? { avgNm: r1(mean(torques)), maxNm: r1(Math.max(...torques)), lowCadenceMin: r1(lowCadenceS / 60) } : null,
    threshold: thresholdBlocks(powers, ftp),
    steady: samples.length >= 2700 && avg > 0 && np / avg <= 1.05 && intensity >= 0.6 && intensity <= 0.8,
  };
}
