import { describe, expect, it } from 'vitest';
import { evalWeekTarget, storedIsoWeekKey, planTotalWeeks, planWeekOf, weeklyEvalDue } from './eval-week';

describe('planWeekOf', () => {
  it('cuenta semanas calendario desde el lunes de la semana de arranque', () => {
    expect(planWeekOf('2026-10-09', '2026-10-09')).toBe(0); // viernes de arranque
    expect(planWeekOf('2026-10-09', '2026-10-11')).toBe(0); // domingo
    expect(planWeekOf('2026-10-09', '2026-10-12')).toBe(1); // lunes siguiente
    expect(planWeekOf('2026-10-09', '2026-10-25')).toBe(2);
    expect(planWeekOf('2026-10-09', '2026-10-04')).toBe(-1);
  });
});

describe('evalWeekTarget', () => {
  it('sin una semana terminada no hay qué evaluar', () => {
    expect(evalWeekTarget('2026-10-09', '2026-10-10')).toBeNull(); // sábado de la semana 0
  });

  it('el domingo evalúa la semana que termina y genera la siguiente', () => {
    expect(evalWeekTarget('2026-10-09', '2026-10-11')).toEqual({ evaluated: 0, target: 1 });
    expect(evalWeekTarget('2026-10-09', '2026-10-18')).toEqual({ evaluated: 1, target: 2 });
  });

  it('entre semana evalúa la pasada y rehace la actual', () => {
    expect(evalWeekTarget('2026-10-09', '2026-10-12')).toEqual({ evaluated: 0, target: 1 }); // lunes
    expect(evalWeekTarget('2026-10-09', '2026-10-15')).toEqual({ evaluated: 0, target: 1 }); // jueves
  });
});

describe('planTotalWeeks', () => {
  it('suma las semanas de todos los bloques', () => {
    expect(planTotalWeeks([{ weeks: 4 }, { weeks: 4 }, { weeks: 3 }, { weeks: 1 }])).toBe(12);
  });
});

describe('weeklyEvalDue: ¿le toca evaluar su semana?', () => {
  // plan de 4 semanas que arrancó el lunes 19-oct; create_plan armó 3
  const plan = {
    startDate: '2026-10-19',
    blocks: [{ weeks: 4 }],
    weeks: [0, 1, 2].map((weekIndex) => ({ weekIndex, workoutIds: [`w${weekIndex}`] })),
  };
  it('antes de que termine la primera semana: nada', () => {
    expect(weeklyEvalDue(plan, '2026-10-24', '2026-W43')).toBeNull();
  });
  it('el domingo ya toca evaluar la semana 1', () => {
    expect(weeklyEvalDue(plan, '2026-10-25', '2026-W43')).toEqual({ week: 1, nextWeek: 2, nextEmpty: false });
  });
  it('ya evaluada (aunque fuera el domingo y hoy sea lunes): nada', () => {
    expect(weeklyEvalDue({ ...plan, lastEvaluatedWeek: 0 }, '2026-10-26', '2026-W44')).toBeNull();
  });
  it('la semana 2 terminó sin evaluar: toca, y la 3 ya está armada', () => {
    expect(weeklyEvalDue({ ...plan, lastEvaluatedWeek: 0 }, '2026-11-02', '2026-W45')).toEqual({ week: 2, nextWeek: 3, nextEmpty: false });
  });
  it('sin evaluar, la semana siguiente queda vacía', () => {
    expect(weeklyEvalDue(plan, '2026-11-09', '2026-W46')).toEqual({ week: 3, nextWeek: 4, nextEmpty: true });
  });
  it('plan terminado: nada', () => {
    expect(weeklyEvalDue(plan, '2026-11-16', '2026-W47')).toBeNull();
  });
  it('planes de antes (solo con la semana ISO): evaluado esta semana = hecho', () => {
    expect(weeklyEvalDue({ ...plan, lastEvalIsoWeek: '2026-W45' }, '2026-11-04', '2026-W45')).toBeNull();
    expect(weeklyEvalDue({ ...plan, lastEvalIsoWeek: '2026-W44' }, '2026-11-04', '2026-W45')).toEqual({ week: 2, nextWeek: 3, nextEmpty: false });
  });
});

describe('storedIsoWeekKey', () => {
  it('misma clave de lunes a domingo; cambia el lunes', () => {
    const k = (iso: string) => storedIsoWeekKey(new Date(iso));
    expect(k('2026-11-02T00:00:00Z')).toBe(k('2026-11-08T23:59:59Z'));
    expect(k('2026-11-09T00:00:00Z')).not.toBe(k('2026-11-08T23:59:59Z'));
  });
  it('es la clave que ya guardan la app y coach-chat', () => {
    expect(storedIsoWeekKey(new Date('2026-11-08T12:00:00Z'))).toBe('2026-W44');
  });
});
