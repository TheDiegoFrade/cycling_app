import { describe, expect, it } from 'vitest';
import { validateRulesFile, validateWorkout } from './validator';
import type { Rule, RulesFile, Workout } from './types';

function validWorkout(): Workout {
  return {
    format_version: 1,
    id: 'vo2-4x4',
    name: 'VO2 4x4 con cadencia alta',
    description: 'Cuatro repeticiones de 4 min a 115 % con cadencia alta.',
    intervals: [
      { name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 55, cadence_min: 85 },
      { name: 'VO2 1 de 4', type: 'interval', duration_s: 240, power_pct: 115, cadence_min: 95 },
      { name: 'Recuperación', type: 'recovery', duration_s: 180, power_pct: 50 },
      { name: 'Vuelta a la calma', type: 'cooldown', duration_s: 300, power_pct: 45, ramp_to_pct: 35 },
    ],
    countdown: { seconds: 5, sound: 'tick', start_sound: 'go' },
    comments: [
      { at_s: 20, message: 'Hoy el foco es cadencia', detail: 'Que no baje de 95 en los VO2.', sound: 'chime' },
      { interval: 2, offset_s: 0, message: 'Primer VO2' },
    ],
    rules: [
      {
        id: 'piso-cadencia',
        when: { metric: 'cadence', op: '<', value: 70 },
        scope: 'all',
        tolerance_s: 0,
        repeat_s: 4,
        level: 'adjust',
        message: 'No bajes de 70',
        detail: '{cadence} rpm · sube ya',
        sound: 'alarm_low',
      },
      {
        id: 'pulso-max',
        when: { metric: 'hr', op: '>', value: 176 },
        scope: { type: ['interval'] },
        tolerance_s: 0,
        repeat_s: 20,
        level: 'danger',
        message: 'Baja las pulsaciones',
        sound: 'alarm_desc',
      },
    ],
    created_at: '2026-09-10T00:00:00.000Z',
  };
}

describe('validateWorkout', () => {
  it('acepta un workout válido', () => {
    const result = validateWorkout(validWorkout());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rechaza algo que no es un objeto', () => {
    const result = validateWorkout('no soy json');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/objeto JSON/);
  });

  it('rechaza format_version distinto de 1', () => {
    const w = { ...validWorkout(), format_version: 2 } as unknown;
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('`format_version` debe ser `1`'))).toBe(true);
  });

  it('exige intervals no vacío', () => {
    const w = { ...validWorkout(), intervals: [] };
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('`intervals`'))).toBe(true);
  });

  it('reporta el tipo de intervalo inválido con las opciones disponibles', () => {
    const w = validWorkout();
    // @ts-expect-error probando dato inválido a propósito
    w.intervals[0].type = 'sprint';
    const result = validateWorkout(w);
    const err = result.errors.find((e) => e.includes('el intervalo #1'));
    expect(err).toMatch(/tipo `sprint`, que no existe/);
    expect(err).toMatch(/warmup, steady, interval, recovery, cooldown, free/);
  });

  it('reporta cadence_min mayor que cadence_max', () => {
    const w = validWorkout();
    w.intervals[0].cadence_min = 100;
    w.intervals[0].cadence_max = 90;
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('cadence_min` (100) mayor que `cadence_max` (90)'))).toBe(true);
  });

  it('mensaje de métrica inexistente sigue el formato pedido en la spec', () => {
    const w = validWorkout();
    // @ts-expect-error probando dato inválido a propósito
    w.rules![1].when.metric = 'heart_rate';
    const result = validateWorkout(w);
    const err = result.errors.find((e) => e.includes('pulso-max'));
    expect(err).toBe(
      'la regla `pulso-max` usa la métrica `heart_rate`, que no existe; las disponibles son: power, power_10s, power_pct_target, cadence, cadence_10s, cadence_stability, hr, hr_pct_max, hr_zone, hr_drop_60s, hr_drift, time_in_interval, time_left_interval, elapsed, intensity',
    );
  });

  it('rechaza operador de comparación inválido', () => {
    const w = validWorkout();
    // @ts-expect-error probando dato inválido a propósito
    w.rules![0].when.op = '==';
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('operador `==`'))).toBe(true);
  });

  it('rechaza scope.intervals fuera de rango', () => {
    const w = validWorkout();
    w.rules![0].scope = { intervals: [99] };
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('intervalo #99') && e.includes('solo tiene 4 intervalo(s)'))).toBe(true);
  });

  it('rechaza scope.minutes con fin antes que inicio', () => {
    const w = validWorkout();
    w.rules![0].scope = { minutes: [20, 10] };
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('scope.minutes'))).toBe(true);
  });

  it('rechaza ids de regla duplicados', () => {
    const w = validWorkout();
    w.rules![1].id = 'piso-cadencia';
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('más de una regla con el id `piso-cadencia`'))).toBe(true);
  });

  it('rechaza repeat_s negativo o cero (debe ser null o > 0)', () => {
    const w = validWorkout();
    w.rules![0].repeat_s = 0;
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('repeat_s'))).toBe(true);
  });

  it('acepta repeat_s null', () => {
    const w = validWorkout();
    w.rules![0].repeat_s = null;
    const result = validateWorkout(w);
    expect(result.valid).toBe(true);
  });

  it('rechaza comment.interval fuera de rango', () => {
    const w = validWorkout();
    w.comments![1].interval = 50;
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('intervalo #50') && e.includes('solo tiene 4 intervalo(s)'))).toBe(true);
  });

  it('exige at_s o interval en cada comentario', () => {
    const w = validWorkout();
    w.comments!.push({ message: 'sin ancla' } as never);
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('el comentario #3') && e.includes('at_s'))).toBe(true);
  });

  it('rechaza sonido inválido en una regla', () => {
    const w = validWorkout();
    // @ts-expect-error probando dato inválido a propósito
    w.rules![0].sound = 'boom';
    const result = validateWorkout(w);
    expect(result.errors.some((e) => e.includes('sonido `boom`'))).toBe(true);
  });

  it('acumula todos los errores en una sola pasada', () => {
    const w = validWorkout();
    // @ts-expect-error probando dato inválido a propósito
    w.format_version = 2;
    w.intervals = [];
    const result = validateWorkout(w);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validateRulesFile', () => {
  function validRulesFile(): RulesFile {
    const rules: Rule[] = [
      {
        id: 'piso-cadencia',
        when: { metric: 'cadence', op: '<', value: 70 },
        scope: 'all',
        tolerance_s: 0,
        repeat_s: 4,
        level: 'adjust',
        message: 'No bajes de 70',
        sound: 'alarm_low',
      },
    ];
    return {
      format_version: 1,
      name: 'Mis reglas de VO2',
      applies_to: 'any',
      rules,
    };
  }

  it('acepta un archivo de reglas válido sin intervalos', () => {
    const result = validateRulesFile(validRulesFile());
    expect(result.valid).toBe(true);
  });

  it('exige applies_to como "any" o nombre de archivo', () => {
    const rf = { ...validRulesFile(), applies_to: '' };
    const result = validateRulesFile(rf);
    expect(result.errors.some((e) => e.includes('applies_to'))).toBe(true);
  });

  it('no exige rango de intervalos para scope.intervals (se valida contra el workout al cargarlo)', () => {
    const rf = validRulesFile();
    rf.rules![0].scope = { intervals: [4] };
    const result = validateRulesFile(rf);
    expect(result.valid).toBe(true);
  });
});
