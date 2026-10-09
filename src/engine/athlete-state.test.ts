import { describe, expect, it } from 'vitest';
import { computeAthleteState, criticalPower } from './athlete-state';
import type { StateSession } from './athlete-state';
import type { SessionMetrics } from './session-metrics';

const TODAY = '2026-10-08';

function metrics(over: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    v: 1,
    curve: { s30: 400, m1: 330, m5: 280, m8: 265, m20: 240 },
    curveQuality: {},
    kJ: 700,
    zoneSec: [600, 2400, 600, 0, 0, 0],
    torque: { avgNm: 25, maxNm: 60, lowCadenceMin: 2 },
    threshold: { longestMin: 0, totalMin: 0 },
    steady: false,
    ...over,
  };
}

function session(dateKey: string, over: Partial<StateSession> = {}): StateSession {
  return { dateKey, durationS: 3600, tss: 60, hrDriftPct: null, ef: null, workoutId: null, metrics: metrics(), ...over };
}

describe('computeAthleteState', () => {
  it('suma carga por ventana y cumplimiento contra lo agendado', () => {
    const s = computeAthleteState(
      [session('2026-10-07', { workoutId: 'a' }), session('2026-10-03'), session('2026-09-20'), session('2026-06-01')],
      [{ id: 'a', dateKey: '2026-10-07' }, { id: 'b', dateKey: '2026-10-05' }],
      TODAY,
    );
    expect(s.windows.d7).toMatchObject({ hours: 2, tss: 120, kJ: 1400, sessions: 2, compliancePct: 50, zoneHours: [0.3, 1.3, 0.3, 0, 0, 0] });
    expect(s.windows.d28.sessions).toBe(3);
    expect(s.windows.d180.sessions).toBe(4);
    expect(s.windows.d7.peaks).toBeUndefined(); // sin picos en una semana
    expect(s.historyWeeks).toBe(18);
  });

  it('picos con fecha y calidad; lo no probado va como untested', () => {
    const s = computeAthleteState(
      [
        session('2026-10-01', { metrics: metrics({ curve: { m20: 268, m5: 290 }, curveQuality: { m20: 'erg_fixed' } }) }),
        session('2026-09-25', { metrics: metrics({ curve: { m20: 250, m5: 310 }, curveQuality: { m5: 'max_effort' } }) }),
      ],
      [],
      TODAY,
    );
    expect(s.windows.d28.peaks).toMatchObject({ m20: [268, '10-01', 'erg_fixed'], m5: [310, '09-25', 'max_effort'], m60: [null, null, 'untested'] });
  });

  it('desacople y EF solo con 3 o más sesiones estables', () => {
    const steady = (d: string, drift: number, ef: number) => session(d, { hrDriftPct: drift, ef, metrics: metrics({ steady: true }) });
    const two = computeAthleteState([steady('2026-10-01', 3, 1.5), steady('2026-10-04', 5, 1.4), session('2026-10-06', { hrDriftPct: 12, ef: 1.1 })], [], TODAY);
    expect(two.windows.d28.aerobic).toBeNull();
    const three = computeAthleteState([steady('2026-10-01', 3, 1.5), steady('2026-10-04', 5, 1.4), steady('2026-10-06', 4, 1.45)], [], TODAY);
    expect(three.windows.d28.aerobic).toEqual({ decouplingPct: 4, ef: 1.45, n: 3 });
  });

  it('hueco más reciente de una semana o más', () => {
    expect(computeAthleteState([session('2026-10-07'), session('2026-09-20'), session('2026-09-18')], [], TODAY).lastGap).toEqual({ days: 16, endedOn: '2026-10-07' });
    expect(computeAthleteState([session('2026-09-20')], [], TODAY).lastGap).toEqual({ days: 18, endedOn: TODAY }); // sigue sin entrenar
    expect(computeAthleteState([session('2026-10-07'), session('2026-10-04')], [], TODAY).lastGap).toBeNull();
  });

  it('sin sesiones', () => {
    const s = computeAthleteState([], [], TODAY);
    expect(s.historyWeeks).toBe(0);
    expect(s.windows.d90).toMatchObject({ hours: 0, kJ: null, zoneHours: null, aerobic: null, cp: null });
  });

  it('potencia crítica solo con esfuerzos máximos de duraciones distintas', () => {
    const max = (d: string, curve: SessionMetrics['curve'], q: SessionMetrics['curveQuality']) => session(d, { metrics: metrics({ curve, curveQuality: q }) });
    const s = computeAthleteState(
      [max('2026-09-01', { m5: 320 }, { m5: 'max_effort' }), max('2026-09-15', { m20: 260 }, { m20: 'max_effort' }), max('2026-10-01', { m8: 400 }, {})],
      [],
      TODAY,
    );
    expect(s.windows.d90.cp).toEqual({ cpW: 240, wPrimeKJ: 24, from: ['09-01', '09-15'] });
    expect(computeAthleteState([max('2026-09-01', { m5: 320 }, { m5: 'max_effort' })], [], TODAY).windows.d90.cp).toBeNull();
  });
});

describe('criticalPower', () => {
  it('descarta ajustes sin sentido físico', () => {
    expect(criticalPower([{ seconds: 300, watts: 250, dateKey: '2026-09-01' }, { seconds: 1200, watts: 260, dateKey: '2026-09-02' }])).toBeNull();
  });
});
