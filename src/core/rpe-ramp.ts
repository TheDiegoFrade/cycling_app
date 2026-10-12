// Rampa por RPE (método de Joe Hernández, UR Training). No saca un FTP: con
// el RPE que el atleta da al final de cada escalón estima tres zonas en
// watts — fondo (RPE 1-4), umbral (5-7) y VO2 (8-9).
//   - Arranca en 50 W y sube 25 W cada 2 min, en ERG (20 W si pesa menos
//     de 53 kg).
//   - Se detiene en cuanto el atleta dice 8 o más (puede brincar directo a
//     9). Si no sabe usar el RPE, se guía por pulso y se detiene al 80 % de
//     (220 − edad).
//   - Si no puede con 50 W, algo no anda bien: se marca para revisar.
import type { Interval } from './types';

export const RPE_RAMP = { startW: 50, stepW: 25, lightStepW: 20, lightKg: 53, stepS: 120, maxSteps: 24, stopRpe: 8, hrStopPct: 0.8 } as const;

/** Cuánto sube cada escalón: 25 W, o 20 W si pesa menos de 53 kg. */
export function rampStepW(weightKg?: number | null): number {
  return typeof weightKg === 'number' && weightKg > 0 && weightKg < RPE_RAMP.lightKg ? RPE_RAMP.lightStepW : RPE_RAMP.stepW;
}

/** Escalones del protocolo en watts fijos. `power_pct` es solo referencia
 * (contra `refFtp`) para pintar y estimar la carga; el motor usa `watts`. */
export function rpeRampIntervals(refFtp = 200, weightKg?: number | null): Interval[] {
  const step = rampStepW(weightKg);
  return Array.from({ length: RPE_RAMP.maxSteps }, (_, i) => {
    const watts = RPE_RAMP.startW + i * step;
    return {
      name: `Escalón ${i + 1} · ${watts} W`,
      type: 'steady' as const,
      duration_s: RPE_RAMP.stepS,
      watts,
      power_pct: Math.max(1, Math.round((watts / refFtp) * 100)),
    };
  });
}

/** Pulso en el que se detiene quien no sabe usar el RPE: 80 % de (220 − edad). */
export function rampHrStop(ageYears: number): number {
  return Math.round((220 - ageYears) * RPE_RAMP.hrStopPct);
}

export interface RampStep {
  watts: number;
  /** null = no lo dio (rampa por pulso, o no contestó). */
  rpe: number | null;
  /** Pulso promedio de los últimos 30 s del escalón. */
  hr: number | null;
}

export interface RpeZones {
  /** [watts mín, watts máx] de cada zona; null si la rampa no llegó ahí. */
  endurance: [number, number] | null;
  threshold: [number, number] | null;
  vo2: [number, number] | null;
  date: string; // YYYY-MM-DD
  method: 'rpe' | 'hr';
  stoppedBy: 'rpe' | 'hr' | 'manual';
  /** No pudo con 50 W: algo no anda bien, que lo revise un médico. */
  flagLowCapacity: boolean;
  steps: RampStep[];
}

/** Zonas a partir de los escalones con RPE. Si brincó una zona (de 4 a 8),
 * la de en medio queda entre los dos escalones que la rodean. */
export function rpeZonesFromRamp(steps: RampStep[], stoppedBy: RpeZones['stoppedBy'], date: string): RpeZones {
  const rated = steps.filter((s): s is RampStep & { rpe: number } => s.rpe !== null);
  const range = (xs: number[]): [number, number] | null => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);
  const endurance = range(rated.filter((s) => s.rpe <= 4).map((s) => s.watts));
  let threshold = range(rated.filter((s) => s.rpe >= 5 && s.rpe <= 7).map((s) => s.watts));
  const vo2 = range(rated.filter((s) => s.rpe >= 8).map((s) => s.watts));
  const step = steps.length > 1 ? steps[1].watts - steps[0].watts : RPE_RAMP.stepW;
  if (!threshold && endurance && vo2 && vo2[0] - endurance[1] > step) {
    threshold = [endurance[1] + step, vo2[0] - step];
  }
  const method = rated.length ? 'rpe' : 'hr';
  const flagLowCapacity = steps.length <= 1 && (stoppedBy !== 'manual' || (steps[0]?.rpe ?? 0) >= RPE_RAMP.stopRpe);
  return { endurance, threshold, vo2, date, method, stoppedBy, flagLowCapacity, steps };
}

/** Referencia interna para que los entrenamientos en % sigan funcionando:
 * el techo del umbral (lo más fuerte que aguanta antes del 8). No se le
 * muestra al atleta como FTP. null si la rampa no dio para estimarlo. */
export function rampReferenceWatts(z: RpeZones): number | null {
  if (z.flagLowCapacity) return null; // no pasó de 50 W: no hay de dónde
  if (z.threshold) return z.threshold[1];
  const step = z.steps.length > 1 ? z.steps[1].watts - z.steps[0].watts : RPE_RAMP.stepW;
  if (z.vo2) return Math.max(RPE_RAMP.startW, z.vo2[0] - step);
  return null;
}
