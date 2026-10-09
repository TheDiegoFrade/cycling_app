import { describe, expect, it } from 'vitest';
import type { PlannedRoutine } from './coach-templates';
import {
  buildMonthlyReport,
  cleanFindings,
  cleanGoals,
  defaultReviewMonth,
  intensityBucket,
  isMonthKey,
  monthEnd,
  monthLabel,
  reviewAiContext,
  shiftMonth,
  suggestFindings,
  suggestVerdict,
} from './monthly-report';
import type { ReportSession } from './monthly-report';
import type { Workout } from './types';

let n = 0;
function ride(day: string, opts: Partial<ReportSession> & { minutes?: number } = {}): ReportSession {
  const minutes = opts.minutes ?? 60;
  const start = `${day}T12:00:00.000Z`;
  return {
    id: `s${++n}`,
    workoutName: 'Rodada',
    startedAt: start,
    finishedAt: new Date(Date.parse(start) + minutes * 60000).toISOString(),
    tss: 60,
    rpe: 5,
    kind: 'bike_indoor',
    completion: null,
    srpeLoad: null,
    source: 'torq',
    ftp: 250,
    np: 180,
    intensityFactor: 0.72,
    efficiencyFactor: 1.4,
    decouplingPct: null,
    best1: null,
    best5: null,
    best20: null,
    ...opts,
  };
}
function workout(day: string): Workout {
  return { format_version: 1, id: `w-${day}`, name: 'Plan', intervals: [{ name: 'Z2', type: 'steady', duration_s: 3600, power_pct: 65 }], created_at: '', scheduledDate: day };
}
function routine(day: string, kind: PlannedRoutine['kind'] = 'strength'): PlannedRoutine {
  return { id: `r-${day}`, kind, name: 'Fuerza', payload: { exercises: [] }, scheduledDate: day };
}

describe('fechas del mes', () => {
  it('fin de mes, corrimientos y etiquetas', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(defaultReviewMonth('2026-10-07')).toBe('2026-09');
    expect(monthLabel('2026-09')).toBe('septiembre 2026');
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('x')).toBe(false);
  });
});

describe('buildMonthlyReport', () => {
  it('resume el mes y lo compara con el anterior', () => {
    const sessions = [
      ride('2026-08-10', { tss: 50, best20: 250, ftp: 240 }),
      ride('2026-09-02', { tss: 80, best20: 262, best5: 300, minutes: 90, ftp: 250 }),
      ride('2026-09-09', { tss: 100, minutes: 120, decouplingPct: 6, intensityFactor: 0.7 }),
      ride('2026-09-23', { tss: 90, minutes: 120, decouplingPct: 4, intensityFactor: 0.7 }),
      ride('2026-09-15', { source: 'strava', tss: 500 }), // nunca cuenta
    ];
    const r = buildMonthlyReport({ monthKey: '2026-09', todayKey: '2026-10-07', sessions, workouts: [], routines: [], ftp: 250 });
    expect(r.inProgress).toBe(false);
    expect(r.endKey).toBe('2026-09-30');
    expect(r.kpis.tss).toBe(270);
    expect(r.kpis.tssPrev).toBe(50);
    expect(r.kpis.hours).toBeCloseTo(5.5);
    expect(r.kpis.ftp).toBe(250);
    expect(r.kpis.ftpPrev).toBe(240);
    expect(r.kpis.ctlEnd).toBeGreaterThan(r.kpis.ctlStart);
    expect(r.bests.find((b) => b.label === '20 min')).toEqual({ label: '20 min', month: 262, prev: 250, best90: 262 });
    expect(r.pmc.length).toBe(60);
    expect(r.pmc[r.pmc.length - 1].dateKey).toBe('2026-09-30');
    expect(r.keySessions[0].dateKey >= r.keySessions[r.keySessions.length - 1].dateKey).toBe(true);
    expect(r.keySessions.some((k) => k.note.includes('Mejor 20 min'))).toBe(true);
    const withDec = r.aerobic.filter((a) => a.decouplingPct !== null).map((a) => a.decouplingPct);
    expect(withDec).toEqual([6, 4]);
  });

  it('cumplimiento por día: completa, parcial, faltó, extra y descanso', () => {
    const sessions = [
      ride('2026-09-01'),
      ride('2026-09-02', { completion: 'partial' }),
      ride('2026-09-04'), // sin agendar → extra
      { ...ride('2026-09-05'), kind: 'strength' as const, srpeLoad: 300, tss: null },
      ride('2026-09-06', { completion: 'skipped' }), // "No la hice" → faltó
    ];
    const workouts = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-06'].map(workout);
    const routines = [routine('2026-09-05'), routine('2026-09-12')];
    const r = buildMonthlyReport({ monthKey: '2026-09', todayKey: '2026-10-01', sessions, workouts, routines, ftp: 250 });
    const status = (d: string) => r.days.find((x) => x.dateKey === d)?.status;
    expect(status('2026-09-01')).toBe('done');
    expect(status('2026-09-02')).toBe('part');
    expect(status('2026-09-03')).toBe('miss');
    expect(status('2026-09-04')).toBe('extra');
    expect(status('2026-09-05')).toBe('done');
    expect(status('2026-09-06')).toBe('miss');
    expect(status('2026-09-07')).toBe('rest');
    expect(r.kpis.plannedCount).toBe(6);
    expect(r.kpis.doneCount).toBe(3);
    expect(r.kpis.compliancePct).toBe(50);
    expect(r.routines).toEqual([{ kind: 'strength', planned: 2, done: 1 }]);
    expect(r.srpeTotal).toBe(300);
    expect(r.weeks[0].plannedTss).toBeGreaterThan(0);
  });

  it('mes en curso: corta en hoy y no cuenta lo que falta', () => {
    const r = buildMonthlyReport({ monthKey: '2026-10', todayKey: '2026-10-07', sessions: [ride('2026-10-02')], workouts: [workout('2026-10-02'), workout('2026-10-20')], routines: [], ftp: 250 });
    expect(r.inProgress).toBe(true);
    expect(r.endKey).toBe('2026-10-07');
    expect(r.kpis.plannedCount).toBe(1);
    expect(r.days.find((d) => d.dateKey === '2026-10-20')?.status).toBe('future');
  });

  it('sin datos', () => {
    const r = buildMonthlyReport({ monthKey: '2026-09', todayKey: '2026-10-07', sessions: [], workouts: [], routines: [], ftp: 250 });
    expect(r.hasData).toBe(false);
    expect(r.pmc).toEqual([]);
    expect(suggestFindings(r)[0].title).toContain('Sin datos');
  });

  it('distribución de intensidad por IF de sesión', () => {
    expect(intensityBucket(0.5)).toBe('recovery');
    expect(intensityBucket(0.7)).toBe('endurance');
    expect(intensityBucket(0.8)).toBe('tempo');
    expect(intensityBucket(0.9)).toBe('threshold');
    expect(intensityBucket(1.02)).toBe('vo2');
    const r = buildMonthlyReport({
      monthKey: '2026-09',
      todayKey: '2026-10-07',
      sessions: [ride('2026-09-01', { intensityFactor: 0.9 }), ride('2026-09-02', { intensityFactor: null, minutes: 30 })],
      workouts: [],
      routines: [],
      ftp: 250,
    });
    expect(r.intensity.find((i) => i.bucket === 'threshold')?.hours).toBeCloseTo(1);
    expect(r.hoursWithoutPower).toBeCloseTo(0.5);
  });
});

describe('hallazgos sugeridos', () => {
  it('detecta progresión, cumplimiento, fuerza y fatiga', () => {
    const sessions = Array.from({ length: 30 }, (_, i) => ride(`2026-09-${String(i + 1).padStart(2, '0')}`, { tss: 140 }));
    const workouts = sessions.map((s) => workout(s.startedAt.slice(0, 10)));
    const routines = [routine('2026-09-03'), routine('2026-09-10'), routine('2026-09-17'), routine('2026-09-24')];
    const r = buildMonthlyReport({ monthKey: '2026-09', todayKey: '2026-10-07', sessions, workouts, routines, ftp: 250 });
    const f = suggestFindings(r);
    const titles = f.map((x) => x.title);
    expect(titles).toContain('La carga subió muy rápido.');
    expect(titles).toContain('Fuerza inconsistente.');
    expect(titles).toContain('Fatiga alta al cierre.');
    expect(suggestVerdict(f)).toBe('off_track');
    expect(suggestVerdict([{ tone: 'good', title: 'a', body: '' }])).toBe('on_track');
    expect(suggestVerdict([{ tone: 'warn', title: 'a', body: '' }, { tone: 'warn', title: 'b', body: '' }])).toBe('attention');
  });

  it('limpia lo que escribe el coach', () => {
    expect(cleanFindings([{ tone: 'good', title: '  Bien ', body: '' }, { tone: 'bad', title: '', body: ' ' }])).toEqual([{ tone: 'good', title: 'Bien', body: '' }]);
    expect(cleanGoals(Array.from({ length: 8 }, (_, i) => ({ title: `g${i}`, detail: '' })))).toHaveLength(5);
  });
});

describe('contexto para la IA', () => {
  it('solo números redondeados, sin Strava, con lo que escribió el coach', () => {
    const sessions = [
      ride('2026-09-02', { tss: 80.4, best20: 262, decouplingPct: 4.26, minutes: 90, intensityFactor: 0.7, efficiencyFactor: 1.4234 }),
      ride('2026-09-10', { source: 'strava', tss: 500, workoutName: 'Secreta' }),
    ];
    const r = buildMonthlyReport({ monthKey: '2026-09', todayKey: '2026-10-07', sessions, workouts: [workout('2026-09-02'), workout('2026-09-03')], routines: [], ftp: 250 });
    const ctx = reviewAiContext(r, '00000000-0000-0000-0000-00000000000a', { name: 'Ana', ftp: 250, weightKg: 0, discipline: 'Ruta', injuries: null, goal: null }, 'Buen mes');
    expect(ctx.monthKey).toBe('2026-09');
    expect(ctx.athlete.weightKg).toBeNull();
    expect(ctx.kpis.tss).toBe(80);
    expect(ctx.missedDays).toBe(1);
    expect(ctx.aerobic.find((a) => a.decouplingPct !== null)?.decouplingPct).toBe(4.3);
    expect(ctx.coachDraft).toBe('Buen mes');
    expect(ctx.weeks[0].label).toBe('semana del 31 ago'); // el 1 de septiembre de 2026 es martes
    expect(JSON.stringify(ctx)).not.toMatch(/"S\d{2}"/);
    expect(JSON.stringify(ctx)).not.toContain('Secreta');
  });
});
