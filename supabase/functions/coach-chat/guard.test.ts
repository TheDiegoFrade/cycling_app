import { describe, expect, it } from 'vitest';
import { correctionMessage, guardOutput, repairOutput, reviewOutput } from './guard.ts';

const step = (min: number, pct: number) => ({ name: 'x', type: 'steady', duration_s: min * 60, power_pct: pct });
const easy = (day: string, min = 60, name = `Fondo ${day}`) => ({
  name,
  dayOfWeek: day,
  targetTSS: 50,
  erg: 'on',
  intent: 'fondo',
  kind: null,
  segments: [{ repeat: 1, steps: [step(min, 65)] }],
});
const hard = (day: string) => ({ ...easy(day), name: `VO2 ${day}`, intent: 'VO2', segments: [{ repeat: 5, steps: [step(4, 115), step(4, 50)] }] });

function weeklyCtx(over: Record<string, unknown> = {}) {
  return {
    profile: { ftp: 250 },
    maxSessionMinutes: 90,
    occupiedDates: [] as string[],
    nextWeekStart: '2026-10-12', // lunes
    plan: { days: ['tue', 'thu', 'sat', 'sun'] },
    pmcTrend: { ctl: 50, atl: 55, tsb: -5 },
    weekJustFinished: { plannedTSS: 300, actualTSS: 290, completedWorkouts: 4, missedWorkouts: 0, athleteNote: null },
    ...over,
  };
}
const weeklyOut = (workouts: unknown[], over: Record<string, unknown> = {}) => ({
  decision: 'progress',
  reasoning: 'r',
  nextWeekWorkouts: workouts,
  nextTest: null,
  notesUpdate: null,
  ...over,
});

describe('repairOutput', () => {
  it('mueve un día repetido, no disponible u ocupado al libre más cercano', () => {
    const ctx = weeklyCtx({ occupiedDates: ['2026-10-17'] }); // sábado ocupado
    const out = weeklyOut([easy('tue'), easy('tue', 45, 'Otra'), easy('wed'), easy('sat')]);
    const { out: fixed, fixes } = repairOutput('weekly_eval', ctx, out);
    expect(fixed.nextWeekWorkouts.map((w: { dayOfWeek: string }) => w.dayOfWeek)).toEqual(['tue', 'thu', 'sun']);
    // martes repetido → jueves; miércoles (no disponible) → domingo; sábado (ocupado) → sin lugar
    expect(fixes).toHaveLength(3);
    expect(out.nextWeekWorkouts[1].dayOfWeek).toBe('tue'); // no muta la original
  });

  it('quita lo que no cabe en ningún día y recorta lo que pasa del tope', () => {
    const ctx = weeklyCtx({ plan: { days: ['tue'] }, maxSessionMinutes: 60 });
    const { out, fixes } = repairOutput('weekly_eval', ctx, weeklyOut([easy('tue', 80), easy('thu')]));
    expect(out.nextWeekWorkouts).toHaveLength(1);
    expect(fixes.some((f) => f.includes('recortado'))).toBe(true);
    expect(fixes.some((f) => f.includes('quitado'))).toBe(true);
  });

  it('sin FTP medido baja a 90 % lo que no es test', () => {
    const ctx = weeklyCtx({ profile: { ftp: null } });
    const test = { ...hard('sat'), name: 'Test de rampa', kind: 'test' };
    const { out } = repairOutput('weekly_eval', ctx, weeklyOut([hard('tue'), test]));
    expect(out.nextWeekWorkouts[0].segments[0].steps[0].power_pct).toBe(90);
    expect(out.nextWeekWorkouts[1].segments[0].steps[0].power_pct).toBe(115);
  });

  it('create_plan: en la semana 0 no usa días antes del inicio', () => {
    const ctx = { startDate: '2026-10-14', availability: { days: ['mon', 'wed', 'fri'], maxSessionMinutes: 90 }, occupiedDates: [], profile: { ftp: 250 } };
    const out = { blocks: [{ weeks: 4 }], firstBlockWeeks: [{ weekIndex: 0, workouts: [easy('mon'), easy('fri')] }, { weekIndex: 1, workouts: [easy('mon')] }] };
    const { out: fixed } = repairOutput('create_plan', ctx, out);
    expect(fixed.firstBlockWeeks[0].workouts.map((w: { dayOfWeek: string }) => w.dayOfWeek)).toEqual(['wed', 'fri']);
    expect(fixed.firstBlockWeeks[1].workouts[0].dayOfWeek).toBe('mon');
  });
});

describe('reviewOutput / guardOutput', () => {
  it('TSB muy bajo con sesión dura: falla que el código no arregla', () => {
    const g = guardOutput('weekly_eval', weeklyCtx({ pmcTrend: { ctl: 60, atl: 95, tsb: -35 } }), weeklyOut([hard('tue'), easy('sat')]));
    expect(g.fails).toEqual(expect.arrayContaining([expect.stringContaining('decision=progress'), expect.stringContaining('«VO2 tue» duro')]));
    expect(correctionMessage(g.fails)).toContain('- decision=progress');
  });

  it('una semana limpia pasa sin fallas', () => {
    const g = guardOutput('weekly_eval', weeklyCtx(), weeklyOut([hard('tue'), easy('thu'), easy('sat')]));
    expect(g.fails).toEqual([]);
    expect(g.fixes).toEqual([]);
  });

  it('sin FTP y sin nextTest es falla', () => {
    const f = reviewOutput('weekly_eval', weeklyCtx({ profile: { ftp: null } }), weeklyOut([easy('tue')]));
    expect(f.some((x) => x.level === 'fail' && x.msg.includes('nextTest'))).toBe(true);
  });
});
