// La zona principal de un workout, para que el coach de IA sepa qué tipo de
// sesión fue cada una de la semana (ver weekJustFinished.workouts en
// coach-chat/schemas.ts): "progresa una variable" exige saber qué se hizo, y
// un ERG desenganchado significa cosas distintas en umbral que en fondo.
// Se clasifica por el bloque más intenso que dura lo suficiente para ser el
// propósito de la sesión, no por un pico suelto. Lógica pura.
import type { Interval, Workout } from './types';

export type WorkoutZone = 'fondo' | 'tempo' | 'sweet spot' | 'umbral' | 'VO2' | 'test';

// [zona, %FTP mínimo, segundos acumulados mínimos], de la más intensa a la menos
const BANDS: [WorkoutZone, number, number][] = [
  ['VO2', 106, 120],
  ['umbral', 95, 300],
  ['sweet spot', 88, 300],
  ['tempo', 76, 600],
];

export function isTestWorkoutDoc(w: Pick<Workout, 'name' | 'kind'>): boolean {
  return w.kind === 'test' || (/test|rampa|ramp/i.test(w.name) && !/escalera/i.test(w.name));
}

export function mainZoneOf(w: Pick<Workout, 'name' | 'kind' | 'intervals'>): WorkoutZone {
  if (isTestWorkoutDoc(w)) return 'test';
  const work = w.intervals.filter((iv: Interval) => iv.type !== 'warmup' && iv.type !== 'cooldown');
  for (const [zone, minPct, minS] of BANDS) {
    const seconds = work.filter((iv) => Math.max(iv.power_pct, iv.ramp_to_pct ?? 0) >= minPct).reduce((s, iv) => s + iv.duration_s, 0);
    if (seconds >= minS) return zone;
  }
  return 'fondo';
}
