import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, buildAchievementInput, evaluateAchievements } from './achievements';

const base = {
  totalSessions: 0,
  totalDurationS: 0,
  longestSessionS: 0,
  bestStreakWeeks: 0,
  currentStreakWeeks: 0,
  oldestFtp: null as number | null,
  currentFtp: 200,
};

describe('evaluateAchievements', () => {
  it('ningún logro con input vacío', () => {
    expect(evaluateAchievements(base).every((r) => !r.earned)).toBe(true);
  });

  it('first_session se gana con 1 sesión', () => {
    const r = evaluateAchievements({ ...base, totalSessions: 1 });
    expect(r.find((x) => x.achievement.id === 'first_session')!.earned).toBe(true);
  });

  it('sessions_10 no se gana con 9', () => {
    const r = evaluateAchievements({ ...base, totalSessions: 9 });
    expect(r.find((x) => x.achievement.id === 'sessions_10')!.earned).toBe(false);
  });

  it('sessions_50 y sessions_10 ambos ganados con 50 sesiones', () => {
    const r = evaluateAchievements({ ...base, totalSessions: 50 });
    expect(r.find((x) => x.achievement.id === 'sessions_10')!.earned).toBe(true);
    expect(r.find((x) => x.achievement.id === 'sessions_50')!.earned).toBe(true);
  });

  it('long_session_2h en el límite exacto (7200s) cuenta', () => {
    const r = evaluateAchievements({ ...base, longestSessionS: 7200 });
    expect(r.find((x) => x.achievement.id === 'long_session_2h')!.earned).toBe(true);
  });

  it('long_session_3h no se gana con 2h59m59s', () => {
    const r = evaluateAchievements({ ...base, longestSessionS: 10799 });
    expect(r.find((x) => x.achievement.id === 'long_session_3h')!.earned).toBe(false);
  });

  it('streak_current_8w usa currentStreakWeeks, no bestStreakWeeks', () => {
    const r = evaluateAchievements({ ...base, bestStreakWeeks: 20, currentStreakWeeks: 2 });
    expect(r.find((x) => x.achievement.id === 'streak_current_8w')!.earned).toBe(false);
  });

  it('ftp_improved es false con oldestFtp null, incluso con FTP alto', () => {
    const r = evaluateAchievements({ ...base, oldestFtp: null, currentFtp: 300 });
    expect(r.find((x) => x.achievement.id === 'ftp_improved')!.earned).toBe(false);
  });

  it('ftp_improved es false si currentFtp === oldestFtp (sin mejora, no regresión)', () => {
    const r = evaluateAchievements({ ...base, oldestFtp: 250, currentFtp: 250 });
    expect(r.find((x) => x.achievement.id === 'ftp_improved')!.earned).toBe(false);
  });

  it('ftp_improved es false si currentFtp bajó', () => {
    const r = evaluateAchievements({ ...base, oldestFtp: 250, currentFtp: 230 });
    expect(r.find((x) => x.achievement.id === 'ftp_improved')!.earned).toBe(false);
  });

  it('ftp_improved es true si currentFtp subió', () => {
    const r = evaluateAchievements({ ...base, oldestFtp: 250, currentFtp: 260 });
    expect(r.find((x) => x.achievement.id === 'ftp_improved')!.earned).toBe(true);
  });

  it('catálogo no tiene ids duplicados', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildAchievementInput', () => {
  it('sin filas, todo en 0/null', () => {
    const input = buildAchievementInput([], { currentWeeks: 0, bestWeeks: 0 }, 200);
    expect(input).toEqual({
      totalSessions: 0,
      totalDurationS: 0,
      longestSessionS: 0,
      bestStreakWeeks: 0,
      currentStreakWeeks: 0,
      oldestFtp: null,
      currentFtp: 200,
    });
  });

  it('toma el ftp de la fila más antigua con ftp > 0, ignorando el orden de entrada', () => {
    const rows = [
      { startedAt: '2026-03-01T00:00:00Z', durationS: 1800, ftp: 220 },
      { startedAt: '2026-01-01T00:00:00Z', durationS: 3600, ftp: 200 },
      { startedAt: '2026-02-01T00:00:00Z', durationS: 1200, ftp: 210 },
    ];
    const input = buildAchievementInput(rows, { currentWeeks: 2, bestWeeks: 3 }, 220);
    expect(input.oldestFtp).toBe(200);
    expect(input.totalSessions).toBe(3);
    expect(input.totalDurationS).toBe(6600);
    expect(input.longestSessionS).toBe(3600);
  });

  it('ignora filas con ftp 0 al buscar la más antigua con ftp válido', () => {
    const rows = [
      { startedAt: '2026-01-01T00:00:00Z', durationS: 1800, ftp: 0 },
      { startedAt: '2026-02-01T00:00:00Z', durationS: 1800, ftp: 215 },
    ];
    const input = buildAchievementInput(rows, { currentWeeks: 0, bestWeeks: 0 }, 220);
    expect(input.oldestFtp).toBe(215);
  });
});
