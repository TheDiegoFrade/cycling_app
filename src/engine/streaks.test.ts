import { describe, expect, it } from 'vitest';
import { computeWeeklyStreak } from './streaks';

describe('computeWeeklyStreak', () => {
  it('sin sesiones, racha 0', () => {
    expect(computeWeeklyStreak([], '2026-01-15')).toEqual({ currentWeeks: 0, bestWeeks: 0 });
  });

  it('una sesión esta semana: racha actual 1', () => {
    // 2026-01-15 es jueves; lunes de esa semana es 2026-01-12
    const r = computeWeeklyStreak(['2026-01-13'], '2026-01-15');
    expect(r.currentWeeks).toBe(1);
    expect(r.bestWeeks).toBe(1);
  });

  it('3 semanas consecutivas entrenadas (incluida la actual)', () => {
    const dates = ['2026-01-01', '2026-01-08', '2026-01-13']; // semanas del 29dic, 5ene, 12ene
    const r = computeWeeklyStreak(dates, '2026-01-15');
    expect(r.currentWeeks).toBe(3);
    expect(r.bestWeeks).toBe(3);
  });

  it('si la semana actual no tiene sesión todavía, no rompe la racha (cuenta desde la pasada)', () => {
    const dates = ['2026-01-05', '2026-01-08']; // semana del 5 de enero entrenada
    // hoy es 2026-01-15 (semana del 12 de enero), sin sesión esta semana todavía
    const r = computeWeeklyStreak(dates, '2026-01-15');
    expect(r.currentWeeks).toBe(1);
  });

  it('si ni la semana actual ni la pasada tienen sesión, la racha actual es 0', () => {
    const dates = ['2025-12-01'];
    const r = computeWeeklyStreak(dates, '2026-01-15');
    expect(r.currentWeeks).toBe(0);
  });

  it('una semana sin entrenar rompe la racha', () => {
    const dates = ['2026-01-01', '2026-01-15']; // falta la semana del 8 de enero
    const r = computeWeeklyStreak(dates, '2026-01-15');
    expect(r.currentWeeks).toBe(1);
    expect(r.bestWeeks).toBe(1);
  });

  it('bestWeeks refleja la racha histórica más larga aunque ya se haya roto', () => {
    const dates = [
      '2025-01-06', '2025-01-13', '2025-01-20', '2025-01-27', // racha de 4 semanas, vieja
      '2026-01-13', // sesión suelta, reciente
    ];
    const r = computeWeeklyStreak(dates, '2026-02-01'); // ya pasó la semana del 13 de enero sin seguir
    expect(r.bestWeeks).toBe(4);
    expect(r.currentWeeks).toBe(0);
  });

  it('varias sesiones la misma semana cuentan como una sola semana entrenada', () => {
    const dates = ['2026-01-12', '2026-01-13', '2026-01-14'];
    const r = computeWeeklyStreak(dates, '2026-01-15');
    expect(r.currentWeeks).toBe(1);
  });
});
