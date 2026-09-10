import { describe, expect, it } from 'vitest';
import { RuleEngine } from './rules-engine';
import type { MetricsSnapshot } from './metrics';
import type { Rule } from '../core/types';

const allScope = { intervalIndex1: 1, intervalType: 'steady' as const, intervalZone: 1 as const, elapsedS: 0 };

function metricsAt(t: number, overrides: MetricsSnapshot): MetricsSnapshot {
  return { elapsed: t, ...overrides };
}

const cadenceFloor: Rule = {
  id: 'cadence-floor',
  when: { metric: 'cadence', op: '<', value: 70 },
  scope: 'all',
  tolerance_s: 0,
  repeat_s: 4,
  level: 'adjust',
  message: 'No bajes de 70',
  detail: '{cadence} rpm',
  sound: 'alarm_low',
};

describe('RuleEngine: tolerancia y disparo inmediato', () => {
  it('dispara de inmediato cuando tolerance_s es 0', () => {
    const engine = new RuleEngine([cadenceFloor]);
    const n = engine.evaluateTick(0, { cadence: 60 }, allScope);
    expect(n).toMatchObject({ kind: 'fire', rule: cadenceFloor, message: 'No bajes de 70', detail: '60 rpm' });
  });

  it('no dispara si la condición no se cumple', () => {
    const engine = new RuleEngine([cadenceFloor]);
    expect(engine.evaluateTick(0, { cadence: 90 }, allScope)).toBeNull();
  });

  it('espera tolerance_s sostenido antes de disparar', () => {
    const rule: Rule = { ...cadenceFloor, tolerance_s: 8, repeat_s: null };
    const engine = new RuleEngine([rule]);
    for (let t = 0; t < 8; t++) {
      expect(engine.evaluateTick(t, { cadence: 60 }, allScope)).toBeNull();
    }
    expect(engine.evaluateTick(8, { cadence: 60 }, allScope)).toMatchObject({ kind: 'fire' });
  });

  it('resetea la tolerancia si la condición se interrumpe antes de cumplirse', () => {
    const rule: Rule = { ...cadenceFloor, tolerance_s: 8, repeat_s: null };
    const engine = new RuleEngine([rule]);
    for (let t = 0; t < 5; t++) engine.evaluateTick(t, { cadence: 60 }, allScope);
    engine.evaluateTick(5, { cadence: 90 }, allScope); // se recupera antes de los 8 s
    // la condición vuelve a t=6; la tolerancia se cuenta desde ahí, no desde t=0
    for (let t = 6; t < 14; t++) {
      expect(engine.evaluateTick(t, { cadence: 60 }, allScope)).toBeNull();
    }
    expect(engine.evaluateTick(14, { cadence: 60 }, allScope)).toMatchObject({ kind: 'fire' });
  });
});

describe('RuleEngine: repetición', () => {
  it('repite cada repeat_s mientras la condición siga', () => {
    const engine = new RuleEngine([cadenceFloor]); // tolerance 0, repeat 4
    const fires: number[] = [];
    for (let t = 0; t < 13; t++) {
      const n = engine.evaluateTick(t, { cadence: 60 }, allScope);
      if (n) fires.push(t);
    }
    expect(fires).toEqual([0, 4, 8, 12]);
  });

  it('con repeat_s null solo dispara una vez mientras se sostenga', () => {
    const rule: Rule = { ...cadenceFloor, tolerance_s: 0, repeat_s: null };
    const engine = new RuleEngine([rule]);
    const fires: number[] = [];
    for (let t = 0; t < 10; t++) {
      const n = engine.evaluateTick(t, { cadence: 60 }, allScope);
      if (n) fires.push(t);
    }
    expect(fires).toEqual([0]);
  });

  it('si la condición se recupera y vuelve a cumplirse, dispara de nuevo desde cero', () => {
    const rule: Rule = { ...cadenceFloor, tolerance_s: 0, repeat_s: null };
    const engine = new RuleEngine([rule]);
    expect(engine.evaluateTick(0, { cadence: 60 }, allScope)).toMatchObject({ kind: 'fire' });
    expect(engine.evaluateTick(1, { cadence: 60 }, allScope)).toBeNull(); // ya disparó, repeat null
    engine.evaluateTick(2, { cadence: 90 }, allScope); // se recupera
    expect(engine.evaluateTick(3, { cadence: 60 }, allScope)).toMatchObject({ kind: 'fire' }); // vuelve a caer -> dispara otra vez
  });
});

describe('RuleEngine: recuperación', () => {
  it('emite recovery_message como info al dejar de cumplirse, solo si ya había disparado', () => {
    const rule: Rule = { ...cadenceFloor, tolerance_s: 0, repeat_s: null, recovery_message: 'De vuelta arriba de 70' };
    const engine = new RuleEngine([rule]);
    engine.evaluateTick(0, { cadence: 60 }, allScope); // dispara
    const n = engine.evaluateTick(1, { cadence: 90 }, allScope);
    expect(n).toEqual({ kind: 'recover', rule, message: 'De vuelta arriba de 70', sound: 'alarm_low' });
  });

  it('no emite recovery_message si la condición nunca llegó a disparar (tolerance no cumplida)', () => {
    const rule: Rule = { ...cadenceFloor, tolerance_s: 8, repeat_s: null, recovery_message: 'De vuelta' };
    const engine = new RuleEngine([rule]);
    engine.evaluateTick(0, { cadence: 60 }, allScope);
    engine.evaluateTick(1, { cadence: 60 }, allScope);
    const n = engine.evaluateTick(2, { cadence: 90 }, allScope); // se recupera antes de los 8s de tolerancia
    expect(n).toBeNull();
  });

  it('sin recovery_message no emite nada al recuperarse', () => {
    const engine = new RuleEngine([cadenceFloor]);
    engine.evaluateTick(0, { cadence: 60 }, allScope);
    expect(engine.evaluateTick(1, { cadence: 90 }, allScope)).toBeNull();
  });
});

describe('RuleEngine: scope', () => {
  it('scope "all" aplica en cualquier bloque', () => {
    const engine = new RuleEngine([cadenceFloor]);
    expect(engine.evaluateTick(0, { cadence: 60 }, { intervalIndex1: 5, intervalType: 'recovery', intervalZone: 1, elapsedS: 0 })).toMatchObject({ kind: 'fire' });
  });

  it('scope {type} solo aplica en los tipos listados', () => {
    const rule: Rule = { ...cadenceFloor, scope: { type: ['interval'] } };
    const engine = new RuleEngine([rule]);
    expect(engine.evaluateTick(0, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'recovery', intervalZone: 1, elapsedS: 0 })).toBeNull();
    expect(engine.evaluateTick(1, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'interval', intervalZone: 1, elapsedS: 1 })).toMatchObject({ kind: 'fire' });
  });

  it('scope {intervals} solo aplica en los números listados (base 1)', () => {
    const rule: Rule = { ...cadenceFloor, scope: { intervals: [2, 4] } };
    const engine = new RuleEngine([rule]);
    expect(engine.evaluateTick(0, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: 0 })).toBeNull();
    expect(engine.evaluateTick(1, { cadence: 60 }, { intervalIndex1: 2, intervalType: 'steady', intervalZone: 1, elapsedS: 1 })).toMatchObject({ kind: 'fire' });
  });

  it('scope {minutes} solo aplica dentro del rango [inicio, fin)', () => {
    const rule: Rule = { ...cadenceFloor, scope: { minutes: [10, 20] } };
    const engine = new RuleEngine([rule]);
    expect(engine.evaluateTick(9 * 60, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: 9 * 60 })).toBeNull();
    expect(engine.evaluateTick(10 * 60, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: 10 * 60 })).toMatchObject({ kind: 'fire' });
    expect(engine.evaluateTick(20 * 60, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: 20 * 60 })).toBeNull();
  });

  it('scope {zone} solo aplica en las zonas de potencia listadas (ej. techo/piso de pulso distinto por zona)', () => {
    const z1Ceiling: Rule = {
      id: 'hr-ceiling-z1',
      when: { metric: 'hr', op: '>', value: 106 },
      scope: { zone: [1] },
      tolerance_s: 0,
      repeat_s: null,
      level: 'danger',
      message: 'Baja las pulsaciones (Z1)',
      sound: 'alarm_desc',
    };
    const z2Ceiling: Rule = {
      id: 'hr-ceiling-z2',
      when: { metric: 'hr', op: '>', value: 128 },
      scope: { zone: [2] },
      tolerance_s: 0,
      repeat_s: null,
      level: 'danger',
      message: 'Baja las pulsaciones (Z2)',
      sound: 'alarm_desc',
    };
    const engine = new RuleEngine([z1Ceiling, z2Ceiling]);
    // hr=115: dispara en un bloque Z1 (>106) pero no en uno Z2 (no pasa de 128)
    expect(
      engine.evaluateTick(0, { hr: 115 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: 0 }),
    ).toMatchObject({ rule: { id: 'hr-ceiling-z1' } });
    expect(
      engine.evaluateTick(1, { hr: 115 }, { intervalIndex1: 2, intervalType: 'steady', intervalZone: 2, elapsedS: 1 }),
    ).toBeNull();
    // hr=130: en Z2 sí dispara (>128)
    expect(
      engine.evaluateTick(2, { hr: 130 }, { intervalIndex1: 2, intervalType: 'steady', intervalZone: 2, elapsedS: 2 }),
    ).toMatchObject({ rule: { id: 'hr-ceiling-z2' } });
  });

  it('salir del scope resetea la tolerancia (no queda "a medio camino" al volver a entrar)', () => {
    const rule: Rule = { ...cadenceFloor, tolerance_s: 8, repeat_s: null, scope: { intervals: [1] } };
    const engine = new RuleEngine([rule]);
    for (let t = 0; t < 5; t++) engine.evaluateTick(t, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: t });
    engine.evaluateTick(5, { cadence: 60 }, { intervalIndex1: 2, intervalType: 'steady', intervalZone: 1, elapsedS: 5 }); // sale de scope
    for (let t = 6; t < 14; t++) {
      expect(engine.evaluateTick(t, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: t })).toBeNull();
    }
    expect(engine.evaluateTick(14, { cadence: 60 }, { intervalIndex1: 1, intervalType: 'steady', intervalZone: 1, elapsedS: 14 })).toMatchObject({ kind: 'fire' });
  });
});

describe('RuleEngine: prioridad y una sola notificación por tick', () => {
  const danger: Rule = {
    id: 'hr-ceiling',
    when: { metric: 'hr', op: '>', value: 176 },
    scope: 'all',
    tolerance_s: 0,
    repeat_s: 20,
    level: 'danger',
    message: 'Baja las pulsaciones',
    sound: 'alarm_desc',
  };
  const info: Rule = {
    id: 'coach',
    when: { metric: 'elapsed', op: '>=', value: 0 },
    scope: 'all',
    tolerance_s: 0,
    repeat_s: null,
    level: 'info',
    message: 'Comentario',
    sound: 'chime',
  };

  it('danger > adjust > info cuando varias reglas disparan en el mismo tick', () => {
    const engine = new RuleEngine([info, cadenceFloor, danger]);
    const n = engine.evaluateTick(0, metricsAt(0, { cadence: 60, hr: 180 }), allScope);
    expect(n?.kind).toBe('fire');
    expect(n && 'rule' in n ? n.rule.id : undefined).toBe('hr-ceiling');
  });

  it('descarta el resto de candidatos del mismo tick, no los encola para después', () => {
    const engine = new RuleEngine([cadenceFloor, danger]);
    engine.evaluateTick(0, metricsAt(0, { cadence: 60, hr: 180 }), allScope); // danger gana este tick
    // al siguiente tick cadenceFloor seguiría cumpliéndose pero repeat_s=4, aún no toca; danger ya no se cumple
    const n = engine.evaluateTick(1, metricsAt(1, { cadence: 60, hr: 150 }), allScope);
    expect(n).toBeNull();
  });
});

describe('RuleEngine: métricas no implementadas', () => {
  it('una métrica todavía sin calcular (undefined) nunca cumple la condición', () => {
    const rule: Rule = {
      id: 'hr-drift-rule',
      when: { metric: 'hr_drift', op: '>', value: 5 },
      scope: 'all',
      tolerance_s: 0,
      repeat_s: null,
      level: 'info',
      message: 'x',
      sound: 'none',
    };
    const engine = new RuleEngine([rule]);
    expect(engine.evaluateTick(0, { hr_drift: undefined }, allScope)).toBeNull();
  });
});

describe('RuleEngine: sustitución de {metric}', () => {
  it('sustituye {metric} en message y detail por el valor actual redondeado', () => {
    const rule: Rule = {
      id: 'hr-rule',
      when: { metric: 'hr', op: '>', value: 150 },
      scope: 'all',
      tolerance_s: 0,
      repeat_s: null,
      level: 'danger',
      message: '{hr} lpm es mucho',
      detail: 'límite superado por {hr}',
      sound: 'alarm_desc',
    };
    const engine = new RuleEngine([rule]);
    const n = engine.evaluateTick(0, { hr: 175.6 }, allScope);
    expect(n).toMatchObject({ message: '176 lpm es mucho', detail: 'límite superado por 176' });
  });
});
