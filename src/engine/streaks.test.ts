import { describe, expect, it } from 'vitest';
import { computeWeeklyStreak, computeWeeklyVolumeTrend } from './streaks';

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

describe('computeWeeklyVolumeTrend', () => {
  // hoy es 2026-01-15 (jueves); lunes de esta semana es 2026-01-12.
  it('sin sesiones, ambos promedios son 0', () => {
    expect(computeWeeklyVolumeTrend([], '2026-01-15')).toEqual({ recentHoursPerWeek: 0, priorHoursPerWeek: 0 });
  });

  it('una sesión en las últimas 4 semanas completas cuenta en recent, no en prior', () => {
    const rows = [{ startedAt: '2026-01-06T10:00:00Z', durationS: 3600 }]; // semana del 5 de enero
    const r = computeWeeklyVolumeTrend(rows, '2026-01-15', 4);
    expect(r.recentHoursPerWeek).toBeCloseTo(0.25); // 1h / 4 semanas
    expect(r.priorHoursPerWeek).toBe(0);
  });

  it('una sesión en el bloque "prior" (semanas 5-8 atrás) cuenta ahí, no en recent', () => {
    const rows = [{ startedAt: '2025-12-10T10:00:00Z', durationS: 7200 }];
    const r = computeWeeklyVolumeTrend(rows, '2026-01-15', 4);
    expect(r.recentHoursPerWeek).toBe(0);
    expect(r.priorHoursPerWeek).toBeCloseTo(0.5); // 2h / 4 semanas
  });

  it('la semana en curso (parcial) no se cuenta en recent', () => {
    const rows = [{ startedAt: '2026-01-14T10:00:00Z', durationS: 3600 }]; // dentro de la semana del 12 de enero, en curso
    const r = computeWeeklyVolumeTrend(rows, '2026-01-15', 4);
    expect(r.recentHoursPerWeek).toBe(0);
  });
});
