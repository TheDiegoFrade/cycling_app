import { describe, expect, it } from 'vitest';
import { addDays } from './athlete-state';
import { wellnessSummary } from './wellness';
import type { WellnessDay } from './wellness';

const TODAY = '2026-10-08';

/** 60 días: VFC alrededor de 60 ms (55/65 alternados), los últimos 7 con `last`. */
function series(last: number, over: Partial<WellnessDay> = {}): WellnessDay[] {
  return Array.from({ length: 60 }, (_, i) => ({
    dateKey: addDays(TODAY, -i),
    hrvMs: i < 7 ? last : i % 2 ? 55 : 65,
    restingHr: 50,
    sleepH: 7.5,
    ...over,
  }));
}

describe('wellnessSummary', () => {
  it('sin datos → null', () => {
    expect(wellnessSummary([], TODAY)).toBeNull();
  });

  it('VFC de la semana dentro de lo normal', () => {
    expect(wellnessSummary(series(60), TODAY)).toEqual({
      hrv7d: 60,
      hrvBaseline60d: 60,
      hrvStatus: 'normal',
      restingHr7d: 50,
      restingHrBaseline60d: 50,
      sleepH7d: 7.5,
    });
  });

  it('VFC baja o alta contra la línea base', () => {
    expect(wellnessSummary(series(45), TODAY)!.hrvStatus).toBe('low');
    expect(wellnessSummary(series(75), TODAY)!.hrvStatus).toBe('high');
  });

  it('pocas mediciones → null en vez de un promedio engañoso', () => {
    const few = series(60).filter(
      (d) =>
        d.dateKey >= addDays(TODAY, -9) &&
        d.dateKey !== TODAY &&
        d.dateKey !== addDays(TODAY, -1) &&
        d.dateKey !== addDays(TODAY, -2) &&
        d.dateKey !== addDays(TODAY, -3) &&
        d.dateKey !== addDays(TODAY, -4),
    );
    const s = wellnessSummary(few, TODAY)!;
    expect(s.hrv7d).toBeNull(); // solo 2 días en la semana
    expect(s.hrvBaseline60d).toBeNull();
    expect(s.hrvStatus).toBeNull();
  });

  it('ignora valores vacíos o en 0', () => {
    expect(wellnessSummary(series(60, { sleepH: 0, restingHr: null }), TODAY)).toMatchObject({ sleepH7d: null, restingHr7d: null, hrv7d: 60 });
  });
});
