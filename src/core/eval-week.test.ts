import { describe, expect, it } from 'vitest';
import { evalWeekTarget, planTotalWeeks, planWeekOf } from './eval-week';

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
