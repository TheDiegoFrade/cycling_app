import { describe, expect, it } from 'vitest';
import { analysisWindow, minutesAt } from './analysis-window';
import type { StateSession } from './athlete-state';
import type { SessionMetrics } from './session-metrics';

const TODAY = '2026-10-08'; // jueves

function s(dateKey: string, curve: SessionMetrics['curve'], over: Partial<StateSession> = {}, mOver: Partial<SessionMetrics> = {}): StateSession {
  return {
    dateKey,
    durationS: 3600,
    tss: 60,
    hrDriftPct: null,
    ef: null,
    workoutId: null,
    metrics: { v: 1, curve, curveQuality: {}, kJ: 700, zoneSec: [0, 3600, 0, 0, 0, 0], torque: null, threshold: { longestMin: 0, totalMin: 0 }, steady: false, ...mOver },
    ...over,
  };
}

describe('analysisWindow', () => {
  const sessions = [
    s('2026-10-06', { m5: 300, m20: 250 }, {}, { curveQuality: { m5: 'max_effort' } }),
    s('2026-09-20', { m5: 310, m20: 240 }),
    s('2026-09-05', { m5: 290, m20: 260 }), // ventana anterior de 28 días
    s('2026-10-02', { m1: 400 }, { hrDriftPct: 3.26 }, { steady: true }),
    s('2026-09-25', {}, { hrDriftPct: 4 }, { steady: true }),
  ];

  it('curva de la ventana contra la anterior del mismo largo', () => {
    const w = analysisWindow(sessions, [], TODAY, 28);
    const m5 = w.curve.find((p) => p.key === 'm5')!;
    expect(m5).toMatchObject({ watts: 310, dateKey: '2026-09-20', quality: 'incidental', prevWatts: 290 });
    expect(w.curve.find((p) => p.key === 'm20')).toMatchObject({ watts: 250, quality: 'incidental', prevWatts: 260 });
    expect(w.curve.find((p) => p.key === 'm60')).toMatchObject({ watts: null, quality: null, prevWatts: null });
    expect(analysisWindow(sessions, [], TODAY, 7).curve.find((p) => p.key === 'm5')).toMatchObject({ watts: 300, quality: 'max_effort' });
  });

  it('desacople solo de sesiones estables, en orden', () => {
    expect(analysisWindow(sessions, [], TODAY, 28).decoupling).toEqual([
      { dateKey: '2026-09-25', pct: 4 },
      { dateKey: '2026-10-02', pct: 3.3 },
    ]);
  });

  it('volumen por semana desde el lunes, con la semana en curso', () => {
    const w = analysisWindow(sessions, [], TODAY, 7);
    expect(w.weeks).toEqual([
      { mondayKey: '2026-09-28', hours: 1, tss: 60, kJ: 700 },
      { mondayKey: '2026-10-05', hours: 1, tss: 60, kJ: 700 },
    ]);
    expect(analysisWindow(sessions, [], TODAY, 28).weeks).toHaveLength(5);
  });
});

describe('minutesAt', () => {
  it('W′ / (P − CP)', () => {
    expect(minutesAt(270, { cpW: 250, wPrimeKJ: 18 })).toBe(15);
    expect(minutesAt(240, { cpW: 250, wPrimeKJ: 18 })).toBeNull();
  });
});
