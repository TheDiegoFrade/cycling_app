import type { Interval } from './types';

/** Generador de workouts a partir de solo una duración — el %FTP de cada
 * bloque ya hace que escale solo al perfil de quien lo entrene (`power_pct`
 * es relativo, `targetWattsAt` lo multiplica por `profile.ftp` en vivo). No
 * hace falta saber el FTP de nadie para "armar" el workout, solo para
 * correrlo — que es justo el pedido: "con su FTP, ya lo pudiera hacer". */
export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  minMinutes: number;
  maxMinutes: number;
  defaultMinutes: number;
  build: (minutes: number) => Interval[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Calentamiento + bloque estable + vuelta a la calma. Para duraciones muy
 * cortas (< 20 min) se recorta el calentamiento/enfriamiento para no
 * comerse casi todo el tiempo en rampas. */
function buildSteady(minutes: number, steadyPct: number, cadenceMin: number | undefined, label: string): Interval[] {
  const rampMin = minutes >= 20 ? 5 : Math.max(1, Math.floor(minutes * 0.15));
  const steadyMin = Math.max(1, minutes - rampMin * 2);
  return [
    { name: 'Calentamiento', type: 'warmup', duration_s: rampMin * 60, power_pct: 50, ramp_to_pct: steadyPct },
    { name: label, type: 'steady', duration_s: steadyMin * 60, power_pct: steadyPct, cadence_min: cadenceMin },
    { name: 'Vuelta a la calma', type: 'cooldown', duration_s: rampMin * 60, power_pct: steadyPct, ramp_to_pct: 45 },
  ];
}

/** Calentamiento + N repeticiones de trabajo/descanso (N se ajusta solo para
 * caber en `minutes`, sin descanso sobrante después de la última repetición)
 * + vuelta a la calma. Estructura clásica de intervalos (sweet spot,
 * umbral, VO2max), con la duración total como único parámetro. */
function buildIntervals(
  minutes: number,
  opts: {
    warmupMin: number;
    cooldownMin: number;
    workMin: number;
    restMin: number;
    workPct: number;
    restPct: number;
    minReps: number;
    maxReps: number;
    workLabel: string;
    cadenceMin?: number;
  },
): Interval[] {
  const cycle = opts.workMin + opts.restMin;
  const available = minutes - opts.warmupMin - opts.cooldownMin + opts.restMin; // el último rep no lleva descanso
  const reps = clamp(Math.round(available / cycle), opts.minReps, opts.maxReps);

  const blocks: Interval[] = [
    { name: 'Calentamiento', type: 'warmup', duration_s: opts.warmupMin * 60, power_pct: 50, ramp_to_pct: opts.workPct - 15 },
  ];
  for (let i = 0; i < reps; i++) {
    blocks.push({
      name: `${opts.workLabel} ${i + 1}/${reps}`,
      type: 'interval',
      duration_s: opts.workMin * 60,
      power_pct: opts.workPct,
      cadence_min: opts.cadenceMin,
    });
    if (i < reps - 1) {
      blocks.push({ name: 'Recuperación', type: 'recovery', duration_s: opts.restMin * 60, power_pct: opts.restPct });
    }
  }
  blocks.push({ name: 'Vuelta a la calma', type: 'cooldown', duration_s: opts.cooldownMin * 60, power_pct: Math.min(opts.workPct, 60), ramp_to_pct: 45 });
  return blocks;
}

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'z2',
    name: 'Z2 aeróbico',
    description: 'Base aeróbica: rodada pareja y sostenida, sin picos.',
    minMinutes: 20,
    maxMinutes: 180,
    defaultMinutes: 45,
    build: (minutes) => buildSteady(minutes, 65, 85, 'Z2'),
  },
  {
    id: 'recovery',
    name: 'Recuperación',
    description: 'Pedaleo muy suave, para bajar fatiga entre días duros.',
    minMinutes: 15,
    maxMinutes: 90,
    defaultMinutes: 30,
    build: (minutes) => [{ name: 'Recuperación', type: 'recovery', duration_s: minutes * 60, power_pct: 55, cadence_min: 80 }],
  },
  {
    id: 'sweet_spot',
    name: 'Sweet spot',
    description: 'Repeticiones al 88-90% FTP — sube FTP sin el desgaste del umbral.',
    minMinutes: 40,
    maxMinutes: 90,
    defaultMinutes: 60,
    build: (minutes) =>
      buildIntervals(minutes, {
        warmupMin: 10,
        cooldownMin: 10,
        workMin: 12,
        restMin: 5,
        workPct: 88,
        restPct: 50,
        minReps: 2,
        maxReps: 4,
        workLabel: 'Sweet spot',
        cadenceMin: 85,
      }),
  },
  {
    id: 'threshold',
    name: 'Umbral (FTP)',
    description: 'Repeticiones al 100% FTP — el clásico de umbral.',
    minMinutes: 35,
    maxMinutes: 80,
    defaultMinutes: 50,
    build: (minutes) =>
      buildIntervals(minutes, {
        warmupMin: 10,
        cooldownMin: 10,
        workMin: 10,
        restMin: 5,
        workPct: 100,
        restPct: 50,
        minReps: 1,
        maxReps: 3,
        workLabel: 'Umbral',
        cadenceMin: 85,
      }),
  },
  {
    id: 'vo2max',
    name: 'VO2max',
    description: 'Repeticiones cortas y muy duras al 120% FTP.',
    minMinutes: 30,
    maxMinutes: 65,
    defaultMinutes: 40,
    build: (minutes) =>
      buildIntervals(minutes, {
        warmupMin: 10,
        cooldownMin: 8,
        workMin: 3,
        restMin: 3,
        workPct: 120,
        restPct: 50,
        minReps: 3,
        maxReps: 6,
        workLabel: 'VO2max',
        cadenceMin: 95,
      }),
  },
];

export function findTemplate(id: string): WorkoutTemplate | undefined {
  return WORKOUT_TEMPLATES.find((t) => t.id === id);
}
