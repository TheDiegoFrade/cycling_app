import type { Profile, Sample } from '../core/types';
import { hrZone, powerZone } from '../core/zones';

export interface PowerCurvePoint {
  windowS: number;
  watts: number;
}

export interface ZoneSeconds {
  zone: number;
  seconds: number;
}

export interface SessionAnalytics {
  avgPower: number;
  maxPower: number;
  avgCadence: number;
  maxCadence: number;
  avgHr: number;
  maxHr: number;
  /** Potencia normalizada (Coggan): promedio móvil de 30 s de potencia,
   * elevado a la 4ª potencia, promediado, y raíz 4ª. Necesita más contexto
   * cuanto más corta es la sesión — en sesiones muy cortas se acerca a la
   * potencia máxima sostenida en vez de ser representativa del esfuerzo. */
  normalizedPower: number;
  /** NP / FTP. `null` si no hay FTP configurado. */
  intensityFactor: number | null;
  /** (duración_s × NP × IF) / (FTP × 3600) × 100. `null` si no hay FTP. */
  trainingStressScore: number | null;
  /** NP / potencia promedio: qué tan "punchy" fue el esfuerzo (1.0 = muy
   * constante, > 1.05 = con muchos picos y valles). */
  variabilityIndex: number;
  /** NP / pulso promedio: eficiencia aeróbica, se compara entre sesiones
   * similares a lo largo del tiempo. `null` si no hubo lecturas de pulso. */
  efficiencyFactor: number | null;
  /** Desacople aeróbico (Pw:HR): compara potencia/pulso entre la primera y
   * segunda mitad de la sesión. Positivo = el pulso subió respecto a la
   * potencia en la segunda mitad (fatiga / base aeróbica incompleta); cerca
   * de 0 o negativo = esfuerzo sostenido de forma estable. Referencia común
   * (rodadas largas y parejas): <5% se considera buena base aeróbica.
   * `null` si la sesión es muy corta o falta pulso en alguna mitad. No debe
   * confundirse con el `hr_drift` del catálogo de reglas en vivo (core/metrics.ts) —
   * ese es un metric id reservado para el motor de reglas tick-a-tick, que
   * sigue sin implementarse; este es un cálculo de sesión completa a posteriori. */
  hrDriftPct: number | null;
  /** Mejor promedio sostenido para cada ventana estándar; se omiten las
   * ventanas más largas que la sesión. */
  powerCurve: PowerCurvePoint[];
  /** Segundos en cada zona de potencia (1–6, ver core/zones.ts). */
  powerZoneSeconds: ZoneSeconds[];
  /** Segundos en cada zona de pulso (1–5). Vacío si no hubo lecturas. */
  hrZoneSeconds: ZoneSeconds[];
}

const POWER_CURVE_WINDOWS_S = [5, 30, 60, 300, 1200];
const NP_WINDOW_S = 30;

function average(values: readonly number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function maxOf(values: readonly number[]): number {
  return values.length ? Math.max(...values) : 0;
}

/** Promedio móvil de ventana `windowS`, solo a partir de que se completa la
 * primera ventana (igual que el algoritmo de Coggan para NP). */
function rollingAverages(values: readonly number[], windowS: number): number[] {
  if (values.length < windowS) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= windowS) sum -= values[i - windowS];
    if (i >= windowS - 1) out.push(sum / windowS);
  }
  return out;
}

function normalizedPower(powers: readonly number[]): number {
  const rolling = rollingAverages(powers, Math.min(NP_WINDOW_S, powers.length || 1));
  if (rolling.length === 0) return average(powers);
  const meanFourthPower = average(rolling.map((p) => p ** 4));
  return Math.pow(meanFourthPower, 0.25);
}

function bestRollingAverage(values: readonly number[], windowS: number): number {
  const rolling = rollingAverages(values, windowS);
  return rolling.length ? Math.max(...rolling) : NaN;
}

function powerCurve(powers: readonly number[]): PowerCurvePoint[] {
  return POWER_CURVE_WINDOWS_S.map((windowS) => ({ windowS, watts: bestRollingAverage(powers, windowS) }))
    .filter((p) => Number.isFinite(p.watts))
    .map((p) => ({ windowS: p.windowS, watts: Math.round(p.watts) }));
}

/** Relación potencia:pulso de una mitad de la sesión. `null` si no hay
 * lecturas de pulso válidas en esa mitad (banda desconectada, etc.). */
function powerHrRatio(samples: readonly Sample[]): number | null {
  const hrs = samples.map((s) => s.hr).filter((hr) => hr > 0);
  if (hrs.length === 0) return null;
  const avgP = average(samples.map((s) => s.power));
  const avgH = average(hrs);
  return avgH > 0 ? avgP / avgH : null;
}

/** Desacople aeróbico entre la primera y segunda mitad de la sesión. Se
 * necesita un mínimo de muestras para que "primera mitad" / "segunda mitad"
 * signifique algo (sesiones muy cortas o series de intervalos no aplican). */
const HR_DRIFT_MIN_SAMPLES = 600; // 10 min

function hrDriftPct(samples: readonly Sample[]): number | null {
  if (samples.length < HR_DRIFT_MIN_SAMPLES) return null;
  const mid = Math.floor(samples.length / 2);
  const r1 = powerHrRatio(samples.slice(0, mid));
  const r2 = powerHrRatio(samples.slice(mid));
  if (r1 === null || r2 === null || r1 === 0) return null;
  return ((r1 - r2) / r1) * 100;
}

function zoneSecondsFrom(zones: readonly number[], zoneCount: number): ZoneSeconds[] {
  const counts = new Map<number, number>();
  for (const z of zones) counts.set(z, (counts.get(z) ?? 0) + 1);
  return Array.from({ length: zoneCount }, (_, i) => i + 1).map((zone) => ({ zone, seconds: counts.get(zone) ?? 0 }));
}

/** Todas las métricas se calculan sobre la sesión completa tal como se
 * grabó (incluye ceros de pausas/caídas de potencia — un cero de potencia
 * durante una pausa es un dato real; un cero de pulso es un sensor caído,
 * así que las lecturas de pulso en 0 se excluyen de todo lo relacionado a
 * pulso para no arrastrar el promedio hacia abajo). */
export function computeSessionAnalytics(samples: readonly Sample[], profile: Profile): SessionAnalytics {
  const powers = samples.map((s) => s.power);
  const cadences = samples.map((s) => s.cadence);
  const hrs = samples.map((s) => s.hr).filter((hr) => hr > 0);

  const avgPower = average(powers);
  const np = normalizedPower(powers);
  const avgHr = average(hrs);

  const intensityFactor = profile.ftp > 0 ? np / profile.ftp : null;
  const trainingStressScore =
    profile.ftp > 0 && intensityFactor !== null ? ((samples.length * np * intensityFactor) / (profile.ftp * 3600)) * 100 : null;

  return {
    avgPower,
    maxPower: maxOf(powers),
    avgCadence: average(cadences),
    maxCadence: maxOf(cadences),
    avgHr,
    maxHr: maxOf(hrs),
    normalizedPower: np,
    intensityFactor,
    trainingStressScore,
    variabilityIndex: avgPower > 0 ? np / avgPower : 1,
    efficiencyFactor: avgHr > 0 ? np / avgHr : null,
    hrDriftPct: hrDriftPct(samples),
    powerCurve: powerCurve(powers),
    powerZoneSeconds: zoneSecondsFrom(
      powers.map((w) => powerZone((w / profile.ftp) * 100)),
      6,
    ),
    hrZoneSeconds: hrs.length ? zoneSecondsFrom(hrs.map((hr) => hrZone(hr, profile.hr_max)), 5) : [],
  };
}
