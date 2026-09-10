import type { Profile, Workout } from '../core/types';
import { buildPlan, intervalIndexAt, targetWattsAt } from './plan';
import type { RawSample } from './session';

/** Generador de muestras falsas de sensores: simula potencia alrededor del
 * objetivo ERG, cadencia alrededor del mínimo del bloque y pulso que sigue
 * al esfuerzo con inercia. `rng` es inyectable para que las pruebas sean
 * deterministas (por defecto usa `Math.random`). */
export function makeFakeSampleGenerator(workout: Workout, profile: Profile, rng: () => number = Math.random) {
  const plan = buildPlan(workout.intervals);
  let hrSim = 90;

  return function sampleAt(t: number, bias: number): RawSample {
    const index0 = intervalIndexAt(plan, t);
    const interval = plan.intervals[index0];
    const into = t - plan.segStart[index0];
    const target = targetWattsAt(plan, t, profile.ftp, bias);

    const rampIn = into < 4 ? -(4 - into) * 15 : 0;
    const power = Math.max(0, Math.round(target + (rng() * 16 - 8) + rampIn));

    const cadenceBase = interval.cadence_min ?? 90;
    const cadence = Math.max(0, Math.round(cadenceBase + 3 + (rng() * 4 - 2)));

    const hrTarget = 90 + (interval.power_pct / 100) * 70;
    hrSim += (hrTarget - hrSim) * 0.06 + (rng() * 0.8 - 0.4);

    return { power, cadence, hr: Math.round(hrSim) };
  };
}
