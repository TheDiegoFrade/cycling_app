import { describe, expect, it } from 'vitest';
import { athletePmc, summarizeAthlete, weeklyLoads } from './coach-metrics';
import type { CoachSessionRow } from './coach-metrics';

let n = 0;
function row(dateKey: string, overrides: Partial<CoachSessionRow> = {}): CoachSessionRow {
  n++;
  return {
    id: `s${n}`,
    userId: 'a',
    workoutName: 'Z2',
    startedAt: `${dateKey}T12:00:00.000Z`,
    finishedAt: `${dateKey}T13:00:00.000Z`,
    tss: 60,
    rpe: null,
    kind: 'bike_indoor',
    completion: null,
    srpeLoad: null,
    source: 'torq',
    ...overrides,
  };
}

const TODAY = '2026-10-08'; // jueves

describe('athletePmc', () => {
  it('llega hasta hoy y no suma fuerza/movilidad ni sesiones saltadas', () => {
    const bikeOnly = athletePmc([row('2026-10-01')], TODAY);
    const withGym = athletePmc(
      [row('2026-10-01'), row('2026-10-02', { kind: 'strength', tss: null, srpeLoad: 270 }), row('2026-10-03', { completion: 'skipped', kind: 'mobility' })],
      TODAY,
    );
    expect(bikeOnly[bikeOnly.length - 1].dateKey).toBe(TODAY);
    expect(withGym[withGym.length - 1].ctl).toBeCloseTo(bikeOnly[bikeOnly.length - 1].ctl);
  });

  it('vacío sin sesiones de bici', () => {
    expect(athletePmc([row('2026-10-01', { kind: 'strength' })], TODAY)).toEqual([]);
  });
});

describe('summarizeAthlete', () => {
  it('cuenta la semana actual (lunes-domingo) separando bici de fuerza', () => {
    const rows = [
      row('2026-10-05', { tss: 80 }), // lunes
      row('2026-10-07', { tss: 50 }),
      row('2026-10-06', { kind: 'strength', tss: null }),
      row('2026-10-04', { tss: 40 }), // domingo pasado: otra semana
    ];
    const s = summarizeAthlete(rows, TODAY, true);
    expect(s.weekBikeSessions).toBe(2);
    expect(s.weekTss).toBe(130);
    expect(s.weekNonBikeSessions).toBe(1);
    expect(s.daysSinceLast).toBe(1);
    expect(s.last?.startedAt.slice(0, 10)).toBe('2026-10-07');
    expect(s.alerts).toEqual([]);
  });

  it('alerta sin datos, fatiga alta y FTP sin confirmar', () => {
    const none = summarizeAthlete([], TODAY, null);
    expect(none.alerts).toEqual([{ kind: 'no_data', days: null }, { kind: 'ftp_unconfirmed' }]);

    const stale = summarizeAthlete([row('2026-10-01')], TODAY, true);
    expect(stale.alerts).toEqual([{ kind: 'no_data', days: 7 }]);

    // carga muy alta los últimos días -> ATL >> CTL -> TSB muy negativo
    const heavy = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => row(d, { tss: 250 }));
    const fatigued = summarizeAthlete(heavy, TODAY, true);
    expect(fatigued.tsb).toBeLessThanOrEqual(-20);
    expect(fatigued.alerts.map((a) => a.kind)).toEqual(['fatigue']);
  });

  it('una sesión "No la hice" no cuenta como última actividad', () => {
    const s = summarizeAthlete([row('2026-10-01'), row('2026-10-07', { kind: 'strength', completion: 'skipped' })], TODAY, true);
    expect(s.daysSinceLast).toBe(7);
  });

  it('horas por semana de bici en 28 días', () => {
    const s = summarizeAthlete([row('2026-10-01'), row('2026-09-20'), row('2026-09-01')], TODAY, true);
    expect(s.bikeSessions28d).toBe(2);
    expect(s.hoursPerWeek28d).toBeCloseTo(0.5);
  });
});

describe('weeklyLoads', () => {
  it('agrupa por semana lunes-domingo, la actual al final', () => {
    const weeks = weeklyLoads(
      [row('2026-10-05', { tss: 80 }), row('2026-10-06', { kind: 'mobility', tss: null }), row('2026-09-28', { tss: 40 }), row('2026-08-01')],
      TODAY,
      3,
    );
    expect(weeks.map((w) => w.mondayKey)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(weeks.map((w) => w.tss)).toEqual([0, 40, 80]);
    expect(weeks[2].nonBike).toEqual(['mobility']);
  });
});
