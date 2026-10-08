// Cómo salió el test más reciente, en números que el coach de IA sabe leer
// (ver "Cómo leer un test" en coach-chat/prompt.ts). El modelo nunca ve
// samples: este resumen es todo lo que recibe. Lo importante no es solo el
// promedio, sino si el test midió un máximo: con ERG fijo el bloque solo
// prueba que el atleta aguanta esa potencia, y un pulso que no deja de subir
// dice que iba por encima de su umbral. Lógica pura, sin I/O.
import type { Interval, Sample } from './types';

export interface LastTest {
  date: string; // YYYY-MM-DD
  type: 'ramp' | 'test20' | 'other';
  /** Potencia del bloque casi constante (CV < 2 % en promedios de 5 s): el
   * ERG la fijó y el test no midió un máximo. */
  ergFixed: boolean;
  blockMinutes: number;
  avgPowerW: number;
  /** Mejor minuto del bloque: en la rampa, de aquí sale el FTP (≈ 75 %). */
  best1MinW: number;
  /** % de la 2.ª mitad contra la 1.ª. null en la rampa o con ERG fijo. */
  powerFadePct: number | null;
  /** Media del minuto 2 y del último minuto del bloque (lpm). */
  hrStart: number | null;
  hrEnd: number | null;
  hrSlopeBpmPerMin: number | null;
  hrHalvesDeltaPct: number | null;
  hrEndPctOfMax: number | null;
  cadenceDeltaRpm: number | null;
  /** Bloque terminado: ≥ 95 % de su duración (en la rampa, ≥ 3 min: nadie
   * la termina, se acaba cuando el atleta ya no sostiene la cadencia). */
  completed: boolean;
  ftpInUseW: number;
}

const ERG_FIXED_CV = 0.02;

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const r1 = (x: number) => Math.round(x * 10) / 10;
const orNull = (x: number, round: (n: number) => number = Math.round) => (Number.isFinite(x) ? round(x) : null);

function rolling(values: readonly number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out.push(sum / window);
  }
  return out;
}

function coefficientOfVariation(values: readonly number[]): number {
  const m = mean(values);
  if (!(m > 0)) return Infinity;
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2))) / m;
}

/** Pendiente por mínimos cuadrados, en unidades por minuto (muestras a 1 Hz). */
function slopePerMinute(points: readonly { t: number; v: number }[]): number {
  if (points.length < 2) return NaN;
  const mt = mean(points.map((p) => p.t));
  const mv = mean(points.map((p) => p.v));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - mt) * (p.v - mv);
    den += (p.t - mt) ** 2;
  }
  return den > 0 ? (num / den) * 60 : NaN;
}

/** El bloque que mide el test y su tipo. Solo se llama sobre workouts que
 * ya se sabe que son test (kind 'test' o por nombre). La rampa es un step que
 * sube a ≥ 120 %; el de 20 min, el bloque continuo más largo de ≥ 15 min sin
 * importar su %FTP (el caso real venía prescrito al 85 %). Si no es ninguno,
 * el step más intenso. */
export function testBlockOf(intervals: readonly Interval[]): { index: number; type: LastTest['type'] } | null {
  const ramp = intervals.findIndex((iv) => (iv.ramp_to_pct ?? 0) >= 120);
  if (ramp >= 0) return { index: ramp, type: 'ramp' };
  let best = -1;
  intervals.forEach((iv, i) => {
    if (iv.duration_s >= 900 && iv.type !== 'warmup' && iv.type !== 'cooldown' && (best < 0 || iv.duration_s > intervals[best].duration_s)) best = i;
  });
  if (best >= 0) return { index: best, type: 'test20' };
  let hardest = -1;
  intervals.forEach((iv, i) => {
    if (iv.type !== 'warmup' && iv.type !== 'cooldown' && (hardest < 0 || iv.power_pct > intervals[hardest].power_pct)) hardest = i;
  });
  return hardest >= 0 ? { index: hardest, type: 'other' } : null;
}

export function readTest(
  session: { startedAt: string; ftp: number; samples: readonly Sample[] },
  intervals: readonly Interval[],
  hrMax: number,
): LastTest | null {
  const block = testBlockOf(intervals);
  if (!block) return null;
  const s = session.samples.filter((x) => x.interval_index === block.index);
  if (s.length < 60) return null;

  const power = s.map((x) => x.power);
  const half = Math.floor(s.length / 2);
  const ergFixed = coefficientOfVariation(rolling(power.slice(30), 5)) < ERG_FIXED_CV;
  const hrPoints = s.map((x, i) => ({ t: i, v: x.hr })).filter((p) => p.v > 0);
  const hrOf = (from: number, to: number) => mean(hrPoints.filter((p) => p.t >= from && p.t < to).map((p) => p.v));
  const hrEnd = hrOf(s.length - 60, s.length);
  const cad = (xs: readonly Sample[]) => mean(xs.map((x) => x.cadence).filter((c) => c > 0));
  const planned = intervals[block.index].duration_s;

  return {
    date: session.startedAt.slice(0, 10),
    type: block.type,
    ergFixed,
    blockMinutes: r1(s.length / 60),
    avgPowerW: Math.round(mean(power)),
    best1MinW: Math.round(Math.max(...rolling(power, Math.min(60, power.length)))),
    powerFadePct: block.type === 'ramp' || ergFixed ? null : orNull((mean(power.slice(half)) / mean(power.slice(0, half)) - 1) * 100, r1),
    hrStart: orNull(hrOf(60, 120)),
    hrEnd: orNull(hrEnd),
    hrSlopeBpmPerMin: orNull(slopePerMinute(hrPoints.filter((p) => p.t >= 60)), r1),
    hrHalvesDeltaPct: orNull((hrOf(half, s.length) / hrOf(0, half) - 1) * 100, r1),
    hrEndPctOfMax: hrMax > 0 ? orNull((hrEnd / hrMax) * 100) : null,
    cadenceDeltaRpm: orNull(cad(s.slice(half)) - cad(s.slice(0, half))),
    completed: block.type === 'ramp' ? s.length >= 180 : s.length >= planned * 0.95,
    ftpInUseW: session.ftp,
  };
}
