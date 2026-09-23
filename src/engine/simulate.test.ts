import { describe, expect, it } from 'vitest';
import { buildFactoryRules, buildIntervalLimitRules } from '../core/defaults';
import type { Profile, Workout } from '../core/types';
import { makeFakeSampleGenerator } from './simulate';
import { SessionEngine } from './session';
import type { EngineEvent } from './session';

/** PRNG determinista (mulberry32) para que la demo sea reproducible en CI,
 * sin depender de Math.random ni de una librería nueva. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const profile: Profile = { ftp: 250, hr_max: 190, cadence_floor: 80, hr_ceiling: 165, hr_min: 0, cadence_max: 999 };

const workout: Workout = {
  format_version: 1,
  id: 'demo',
  name: 'VO2 2x6" con cadencia alta (demo)',
  intervals: [
    { name: 'Calentamiento', type: 'warmup', duration_s: 5, power_pct: 50, cadence_min: 80 },
    { name: 'VO2 1 de 2', type: 'interval', duration_s: 6, power_pct: 115, cadence_min: 95 },
    { name: 'Recuperación', type: 'recovery', duration_s: 4, power_pct: 50 },
    { name: 'VO2 2 de 2', type: 'interval', duration_s: 6, power_pct: 115, cadence_min: 95 },
    { name: 'Vuelta a la calma', type: 'cooldown', duration_s: 5, power_pct: 40 },
  ],
  comments: [{ at_s: 1, message: 'Hoy el foco es cadencia', detail: 'Que no baje de 95 en los VO2.', sound: 'chime' }],
  created_at: new Date(0).toISOString(),
};

function describeEvent(e: EngineEvent): string | null {
  switch (e.type) {
    case 'tick':
      return `t=${e.t.toString().padStart(2, '0')} power=${e.sample.power}W target=${e.sample.target}W cadence=${e.sample.cadence} hr=${e.sample.hr}`;
    case 'block-start':
      return `  » bloque ${e.index1} "${e.interval.name}" — ${e.targetWatts} W`;
    case 'countdown':
      return `  » cuenta regresiva ${e.secondsLeft}s -> "${e.next.interval.name}"`;
    case 'comment':
      return `  » comentario: ${e.comment.message}`;
    case 'rule':
      return `  » regla [${e.notification.kind}] ${e.notification.rule.id}: ${e.notification.message}`;
    case 'paused':
      return `  » pausa (${e.reason})`;
    case 'resumed':
      return `  » reanuda (${e.reason})`;
    case 'finished':
      return '  » sesión terminada';
  }
}

describe('simulación de una sesión completa (motor + generador de muestras falsas)', () => {
  it('corre de punta a punta con datos simulados y termina, sin browser ni hardware', () => {
    const rules = [...buildFactoryRules(profile, workout), ...buildIntervalLimitRules(workout.intervals)];
    const engine = new SessionEngine({ workout, profile, rules });
    const sampleAt = makeFakeSampleGenerator(workout, profile, mulberry32(42));
    const totalDuration = workout.intervals.reduce((acc, i) => acc + i.duration_s, 0);

    console.log(`--- simulación: ${workout.name} (${totalDuration}s) ---`);
    const all: EngineEvent[] = [...engine.start()];
    for (const e of all) {
      const line = describeEvent(e);
      if (line) console.log(line);
    }

    for (let t = 0; t < totalDuration; t++) {
      const sample = sampleAt(t, 1);
      const events = engine.tick(sample);
      all.push(...events);
      for (const e of events) {
        const line = describeEvent(e);
        if (line) console.log(line);
      }
    }
    console.log('--- fin de la simulación ---');

    expect(engine.currentState).toBe('finished');
    expect(all.filter((e) => e.type === 'finished')).toHaveLength(1);
    expect(all.filter((e) => e.type === 'tick')).toHaveLength(totalDuration);
    expect(all.filter((e) => e.type === 'block-start')).toHaveLength(workout.intervals.length);
    expect(all.filter((e) => e.type === 'comment')).toHaveLength(1);

    // con cadence_min 95 en los bloques VO2 y una cadencia simulada ~95-98,
    // la regla de piso de intervalo puede o no disparar según el ruido; lo
    // que sí garantizamos es que el motor nunca revienta y que, si dispara
    // algo, es una de las reglas conocidas (fábrica o cadence-min).
    const ruleIds = new Set(rules.map((r) => r.id));
    for (const e of all) {
      if (e.type === 'rule') expect(ruleIds.has(e.notification.rule.id)).toBe(true);
    }
  });

  it('con una caída de cadencia, la regla de piso de fábrica dispara de inmediato (tolerance_s=0)', () => {
    // bloque sin cadence_min propio: así se prueba el piso global aislado,
    // sin que la exclusión por override (ver buildFactoryRules) lo apague.
    const soloWorkout: Workout = { ...workout, intervals: [{ name: 'A', type: 'steady', duration_s: 60, power_pct: 70 }] };
    const rules = buildFactoryRules(profile, soloWorkout);
    const engine = new SessionEngine({ workout: soloWorkout, profile, rules });
    engine.start();
    const events = engine.tick({ power: 130, cadence: 60, hr: 120 }); // por debajo de cadence_floor=80
    const rule = events.find((e) => e.type === 'rule');
    expect(rule).toMatchObject({ type: 'rule', notification: { rule: { id: 'factory-cadence-floor' } } });
  });
});
