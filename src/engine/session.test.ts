import { describe, expect, it } from 'vitest';
import { SessionEngine } from './session';
import type { EngineEvent } from './session';
import type { Interval, Profile, Rule, Workout } from '../core/types';

const profile: Profile = { ftp: 200, hr_max: 190, cadence_floor: 70, hr_ceiling: 176, hr_min: 0, cadence_max: 999 };

const intervals: Interval[] = [
  { name: 'Calentamiento', type: 'warmup', duration_s: 10, power_pct: 50 },
  { name: 'Interval', type: 'interval', duration_s: 8, power_pct: 100, cadence_min: 90 },
  { name: 'Cooldown', type: 'cooldown', duration_s: 6, power_pct: 40 },
];

function workoutWith(overrides: Partial<Workout> = {}): Workout {
  return {
    format_version: 1,
    id: 'w1',
    name: 'test',
    intervals,
    created_at: new Date(0).toISOString(),
    ...overrides,
  };
}

function good(target: number): { power: number; cadence: number; hr: number } {
  return { power: target, cadence: 95, hr: 140 };
}

function eventsOfType<T extends EngineEvent['type']>(events: EngineEvent[], type: T): EngineEvent[] {
  return events.filter((e) => e.type === type);
}

describe('SessionEngine: arranque y avance por bloques', () => {
  it('start() emite block-start del primer bloque de inmediato', () => {
    const engine = new SessionEngine({ workout: workoutWith(), profile, rules: [] });
    const events = engine.start();
    expect(events).toEqual([{ type: 'block-start', index1: 1, interval: intervals[0], targetWatts: 100 }]);
    expect(engine.currentState).toBe('running');
  });

  it('recorre los 3 bloques, dispara block-start en cada transición, countdown antes de cada cambio y termina al final', () => {
    const engine = new SessionEngine({ workout: workoutWith(), profile, rules: [] });
    const all: EngineEvent[] = [...engine.start()];
    for (let t = 0; t < 24; t++) {
      const target = t < 10 ? 100 : t < 18 ? 200 : 80;
      all.push(...engine.tick(good(target)));
    }

    const blockStarts = eventsOfType(all, 'block-start');
    expect(blockStarts).toHaveLength(3);
    expect(blockStarts.map((e) => (e as { index1: number }).index1)).toEqual([1, 2, 3]);

    const countdowns = eventsOfType(all, 'countdown');
    expect(countdowns).toHaveLength(10); // 5 antes del bloque 2 + 5 antes del bloque 3
    expect((countdowns[0] as { next: { index1: number } }).next.index1).toBe(2);

    expect(eventsOfType(all, 'finished')).toHaveLength(1);
    expect(engine.currentState).toBe('finished');

    const ticks = eventsOfType(all, 'tick');
    expect(ticks).toHaveLength(24);
  });

  it('el objetivo ERG en cada bloque refleja power_pct y el FTP del perfil', () => {
    const engine = new SessionEngine({ workout: workoutWith(), profile, rules: [] });
    engine.start();
    const tickAt = () => {
      const events = engine.tick(good(100));
      return events.find((e) => e.type === 'tick');
    };
    for (let t = 0; t < 10; t++) {
      const e = tickAt();
      expect(e && e.type === 'tick' ? e.sample.target : undefined).toBe(100); // 50% de 200
    }
  });
});

describe('SessionEngine: comentarios', () => {
  it('emite un comment cuando se cruza su ancla de tiempo, una sola vez', () => {
    const workout = workoutWith({
      comments: [
        { at_s: 2, message: 'Hoy el foco es cadencia' },
        { interval: 2, offset_s: 1, message: 'Primer VO2' },
      ],
    });
    const engine = new SessionEngine({ workout, profile, rules: [] });
    engine.start();
    const seenAt: number[] = [];
    for (let t = 0; t < 24; t++) {
      const events = engine.tick(good(100));
      if (events.some((e) => e.type === 'comment')) seenAt.push(t);
    }
    expect(seenAt).toEqual([2, 11]); // at_s=2, y segStart[1]=10 + offset_s=1
  });
});

describe('SessionEngine: pausa manual', () => {
  it('pause() congela el tiempo de sesión; resume() con cadencia > 0 lo retoma', () => {
    const engine = new SessionEngine({ workout: workoutWith(), profile, rules: [] });
    engine.start();
    engine.tick(good(100)); // t=0 procesado, elapsed ahora en 1

    const pauseEvents = engine.pause();
    expect(pauseEvents).toEqual([{ type: 'paused', reason: 'manual', targetWatts: 50 }]);
    expect(engine.currentState).toBe('paused');

    // mientras está pausado, tick() con cadencia 0 no avanza nada
    expect(engine.tick({ power: 0, cadence: 0, hr: 130 })).toEqual([]);
    expect(engine.currentState).toBe('paused');

    // vuelve a pedalear -> resume automático dentro del mismo tick
    const resumeEvents = engine.tick(good(100));
    expect(resumeEvents[0]).toEqual({ type: 'resumed', reason: 'manual' });
    expect(engine.currentState).toBe('running');
  });
});

describe('SessionEngine: auto-pausa', () => {
  it('si la cadencia es 0 por más de 10 s seguidos, se pausa sola, y se reanuda sola al pedalear', () => {
    const longWorkout = workoutWith({ intervals: [{ name: 'Steady', type: 'steady', duration_s: 100, power_pct: 60 }] });
    const engine = new SessionEngine({ workout: longWorkout, profile, rules: [] });
    engine.start();

    let pausedAt = -1;
    for (let i = 0; i < 15; i++) {
      const events = engine.tick({ power: 0, cadence: 0, hr: 120 });
      if (events.some((e) => e.type === 'paused')) {
        pausedAt = i;
        break;
      }
    }
    expect(pausedAt).toBe(10); // el 11º tick seguido en 0 (índice 10) dispara la auto-pausa
    expect(engine.currentState).toBe('paused');

    const resumeEvents = engine.tick(good(60));
    expect(resumeEvents[0]).toEqual({ type: 'resumed', reason: 'auto' });
    expect(engine.currentState).toBe('running');
  });
});

describe('SessionEngine: intensidad manual', () => {
  it('setIntensityPct ajusta el objetivo ERG y se limita al rango 50–120 %', () => {
    const engine = new SessionEngine({ workout: workoutWith(), profile, rules: [] });
    engine.start();
    engine.setIntensityPct(110);
    const events = engine.tick(good(110));
    const tick = events.find((e) => e.type === 'tick');
    expect(tick && tick.type === 'tick' ? tick.sample.target : undefined).toBe(110); // 50% * 200 * 1.10

    expect(engine.setIntensityPct(200)).toBe(120);
    expect(engine.setIntensityPct(10)).toBe(50);
  });

  it('adjustIntensityPct suma/resta sobre el valor actual', () => {
    const engine = new SessionEngine({ workout: workoutWith(), profile, rules: [] });
    expect(engine.adjustIntensityPct(5)).toBe(105);
    expect(engine.adjustIntensityPct(-10)).toBe(95);
  });
});

describe('SessionEngine: integración con el motor de reglas', () => {
  it('emite un evento rule cuando una regla del workout se cumple', () => {
    const cadenceMinRule: Rule = {
      id: 'cadence-min-2',
      when: { metric: 'cadence', op: '<', value: 90 },
      scope: { intervals: [2] },
      tolerance_s: 0,
      repeat_s: null,
      level: 'adjust',
      message: 'Sube la cadencia',
      detail: '{cadence} rpm',
      sound: 'alarm_low',
    };
    const engine = new SessionEngine({ workout: workoutWith(), profile, rules: [cadenceMinRule] });
    engine.start();
    for (let t = 0; t < 10; t++) engine.tick(good(100)); // bloque 1, fuera de scope
    const events = engine.tick({ power: 200, cadence: 80, hr: 150 }); // primer tick del bloque 2, cadencia baja
    const rule = events.find((e) => e.type === 'rule');
    expect(rule).toMatchObject({ type: 'rule', notification: { kind: 'fire', message: 'Sube la cadencia', detail: '80 rpm' } });
  });

  it('scope {zone} permite un techo/piso de pulso distinto por zona de potencia del bloque', () => {
    const zonedWorkout = workoutWith({
      intervals: [
        { name: 'Z1', type: 'recovery', duration_s: 5, power_pct: 50 }, // zona 1 (<55)
        { name: 'Z2', type: 'steady', duration_s: 5, power_pct: 65 }, // zona 2 (<75)
      ],
    });
    const rules: Rule[] = [
      {
        id: 'hr-ceiling-z1',
        when: { metric: 'hr', op: '>', value: 106 },
        scope: { zone: [1] },
        tolerance_s: 0,
        repeat_s: null,
        level: 'danger',
        message: 'Baja las pulsaciones (Z1)',
        sound: 'alarm_desc',
      },
      {
        id: 'hr-ceiling-z2',
        when: { metric: 'hr', op: '>', value: 128 },
        scope: { zone: [2] },
        tolerance_s: 0,
        repeat_s: null,
        level: 'danger',
        message: 'Baja las pulsaciones (Z2)',
        sound: 'alarm_desc',
      },
      {
        id: 'hr-floor-z2',
        when: { metric: 'hr', op: '<', value: 106 },
        scope: { zone: [2] },
        tolerance_s: 0,
        repeat_s: null,
        level: 'adjust',
        message: 'Sube el ritmo, te estás enfriando (Z2)',
        sound: 'alarm_low',
      },
    ];
    const engine = new SessionEngine({ workout: zonedWorkout, profile, rules });
    engine.start();

    // en Z1, hr=115 pasa el techo de 106 -> dispara hr-ceiling-z1
    const z1Events = engine.tick({ power: 100, cadence: 90, hr: 115 });
    expect(z1Events.find((e) => e.type === 'rule')).toMatchObject({ notification: { rule: { id: 'hr-ceiling-z1' } } });

    for (let t = 0; t < 4; t++) engine.tick({ power: 100, cadence: 90, hr: 115 }); // termina el bloque Z1

    // ya en Z2, hr=115 está dentro de la banda [106,128] -> ninguna regla dispara
    const midBandEvents = engine.tick({ power: 130, cadence: 90, hr: 115 });
    expect(midBandEvents.find((e) => e.type === 'rule')).toBeUndefined();

    // hr=100 en Z2 cae debajo del piso 106 -> dispara hr-floor-z2, no hr-ceiling-z1
    const belowFloorEvents = engine.tick({ power: 130, cadence: 90, hr: 100 });
    expect(belowFloorEvents.find((e) => e.type === 'rule')).toMatchObject({ notification: { rule: { id: 'hr-floor-z2' } } });
  });
});
