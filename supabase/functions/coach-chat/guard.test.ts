import { describe, expect, it } from 'vitest';
import { correctionMessage, guardOutput, repairOutput, reviewOutput, usableStartDate } from './guard.ts';

const step = (min: number, pct: number) => ({ name: 'x', type: 'steady', duration_s: min * 60, power_pct: pct });
const easy = (day: string, min = 60, name = `Fondo ${day}`) => ({
  name,
  dayOfWeek: day,
  targetTSS: Math.round((min / 60) * 42), // el de la estructura (65 %)
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
  reasoning: 'Cumpliste la semana completa y no hay señales de fatiga, así que subimos una variable.',
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
    expect(g.fixes.every((f) => f.includes('TSS'))).toBe(true); // solo el TSS recalculado
  });

  it('sin FTP y sin nextTest es falla', () => {
    const f = reviewOutput('weekly_eval', weeklyCtx({ profile: { ftp: null } }), weeklyOut([easy('tue')]));
    expect(f.some((x) => x.level === 'fail' && x.msg.includes('nextTest'))).toBe(true);
  });
});

describe('create_plan sin FTP: el test', () => {
  const ctx = { startDate: '2026-10-12', availability: { days: ['mon', 'wed', 'sat'], maxSessionMinutes: 90 }, occupiedDates: [], profile: { ftp: null } };
  const ramp = { ...easy('sat'), name: 'Test de rampa', kind: 'test', segments: [{ repeat: 1, steps: [{ ...step(25, 50), ramp_to_pct: 200 }] }] };
  const sweet = (day: string) => ({ ...easy(day), name: `Sweet spot ${day}`, segments: [{ repeat: 3, steps: [step(8, 89), step(4, 50)] }] });
  const plan = (weeks: unknown[][]) => ({
    blocks: [{ weeks: weeks.length }],
    firstBlockWeeks: weeks.map((workouts, weekIndex) => ({ weekIndex, workouts })),
    coachNote: 'Hasta el test vas por sensación y el test te da tu FTP para el perfil; desde ahí las zonas van en watts.',
    suggestedFtp: null,
    nextTest: { weekIndex: 0, type: 'ramp', reason: 'x' },
  });
  const fails = (out: unknown) => reviewOutput('create_plan', ctx, out).filter((x) => x.level === 'fail').map((x) => x.msg);

  it('nextTest en una semana armada que no trae el test es falla', () => {
    expect(fails(plan([[easy('mon'), easy('wed')], [easy('mon')]])).some((m) => m.includes('nextTest cae en S1'))).toBe(true);
  });

  it('sweet spot antes del test es falla; después, no', () => {
    expect(fails(plan([[easy('mon'), easy('wed')], [sweet('mon')]])).some((m) => m.includes('antes del test'))).toBe(true);
    expect(fails(plan([[easy('mon'), ramp], [sweet('mon')]]))).toEqual([]);
  });
});

describe('TSS y suggestedFtp', () => {
  it('reemplaza el TSS del modelo por el de la estructura', () => {
    const w = { ...easy('tue', 90), targetTSS: 200 }; // 90 min al 65 %
    const { out, fixes } = repairOutput('weekly_eval', weeklyCtx(), weeklyOut([w]));
    expect(out.nextWeekWorkouts[0].targetTSS).toBe(63); // 1.5 h × 0.65² × 100
    expect(fixes[0]).toContain('TSS 200 → 63');
  });

  it('sin FTP, no saca un FTP del coachNote', () => {
    const ctx = { startDate: '2026-10-12', availability: { days: ['tue'], maxSessionMinutes: 90 }, occupiedDates: [], profile: { ftp: null } };
    const base = { blocks: [{ weeks: 1 }], firstBlockWeeks: [{ weekIndex: 0, workouts: [easy('tue')] }], suggestedFtp: null, nextTest: { weekIndex: 0, type: 'ramp', reason: 'x' } };
    const note = 'Tu pico de 5 min fue 300 W. Pon 200 W en tu perfil antes de empezar.';
    expect(repairOutput('create_plan', ctx, { ...base, coachNote: note }).out.suggestedFtp).toBeNull();
  });
});

describe('nombre contra contenido', () => {
  it('un "Fondo" con trabajo duro se renombra con lo que trae (no es falla)', () => {
    const w = { ...hard('tue'), name: 'Fondo tranquilo' };
    const g = guardOutput('weekly_eval', weeklyCtx(), weeklyOut([w]));
    expect(g.fails).toEqual([]);
    expect(g.out.nextWeekWorkouts[0].name).toBe('Fondo tranquilo con VO2');
  });

  it('un nombre que ya dice el trabajo duro se queda igual', () => {
    const w = { ...hard('tue'), name: 'Fondo largo con sweet spot corto' };
    const g = guardOutput('weekly_eval', weeklyCtx(), weeklyOut([w]));
    expect(g.fails).toEqual([]);
    expect(g.out.nextWeekWorkouts[0].name).toBe('Fondo largo con sweet spot corto');
  });
});

describe('arranque del plan y semanas concretas', () => {
  it('si en lo que queda de la semana no hay días usables, arranca el lunes siguiente', () => {
    // viernes 9 oct 2026 con días mar/mié/jue
    expect(usableStartDate('2026-10-09', ['tue', 'wed', 'thu'], new Set())).toBe('2026-10-12');
    // sábado disponible pero ocupado
    expect(usableStartDate('2026-10-09', ['tue', 'sat'], new Set(['2026-10-10']))).toBe('2026-10-12');
    // queda el sábado libre: arranca hoy
    expect(usableStartDate('2026-10-09', ['tue', 'sat'], new Set())).toBe('2026-10-09');
    // sin días elegidos cuenta cualquier día
    expect(usableStartDate('2026-10-11', undefined, new Set())).toBe('2026-10-11');
  });

  it('create_plan con más de 3 semanas concretas se recorta (no truena)', () => {
    const ctx = { startDate: '2026-10-12', availability: { days: ['tue', 'thu'], maxSessionMinutes: null, hoursPerWeek: 3 }, occupiedDates: [], profile: { ftp: 250 } };
    const out = {
      blocks: [{ name: 'Base', weeks: 6, focus: 'x' }],
      firstBlockWeeks: [0, 1, 2, 3].map((i) => ({ weekIndex: i, workouts: [easy('tue'), easy('thu')] })),
    };
    const { out: fixed, fixes } = repairOutput('create_plan', ctx, out);
    expect(fixed.firstBlockWeeks).toHaveLength(3);
    expect(fixes.some((f) => f.includes('máximo 3'))).toBe(true);
  });
});

describe('absorción y textos', () => {
  it('insert_recovery con algo sobre 75 % es falla', () => {
    const tempo = { ...easy('tue'), name: 'Tempo', segments: [{ repeat: 1, steps: [step(20, 82)] }] };
    const g = guardOutput('weekly_eval', weeklyCtx(), weeklyOut([tempo, easy('thu')], { decision: 'insert_recovery' }));
    expect(g.fails).toEqual([expect.stringContaining('«Tempo» llega a 82 %')]);
  });

  it('reasoning vacío es falla', () => {
    expect(guardOutput('weekly_eval', weeklyCtx(), weeklyOut([easy('tue')], { reasoning: '' })).fails[0]).toContain('reasoning vacío');
  });
});

describe('reglas v3', () => {
  it('al crear el plan, quien no entrena con estructura no recibe 85+ rpm', () => {
    const ctx = { startDate: '2026-10-12', experienceLevel: 'new_to_cycling', availability: { days: ['tue', 'thu'], maxSessionMinutes: null, hoursPerWeek: 3 }, occupiedDates: [], profile: { ftp: null } };
    const fast = { ...easy('tue'), segments: [{ repeat: 1, steps: [{ ...step(40, 62), cadence_min: 85, cadence_max: 95 }] }] };
    const { out, fixes } = repairOutput('create_plan', ctx, { blocks: [{ name: 'Base', weeks: 4, focus: 'x' }], firstBlockWeeks: [{ weekIndex: 0, workouts: [fast] }] });
    const st = out.firstBlockWeeks[0].workouts[0].segments[0].steps[0];
    expect(st.cadence_min).toBe(70);
    expect(st.cadence_max).toBeUndefined();
    expect(fixes.some((f: string) => f.includes('cadencia'))).toBe(true);
  });

  it('si el atleta dice que está cansado, la semana nueva no sube carga', () => {
    const ctx = weeklyCtx({ weekJustFinished: { plannedTSS: 150, actualTSS: 148, completedWorkouts: 4, missedWorkouts: 0, athleteNote: 'Completé todo, pero estoy muy cansado.' } });
    const g = guardOutput('weekly_eval', ctx, weeklyOut([easy('tue', 90), easy('thu', 90), easy('sat', 90), easy('sun', 90)], { decision: 'maintain' }));
    expect(g.fails.some((f) => f.includes('no subas carga'))).toBe(true);
  });

  it('jerga interna en reasoning es falla', () => {
    const g = guardOutput('weekly_eval', weeklyCtx(), weeklyOut([easy('tue')], { reasoning: 'El retest va en la semana 7 (weekIndex 6), al abrir el bloque de construcción con la base hecha.' }));
    expect(g.fails.some((f) => f.includes('jerga interna'))).toBe(true);
  });

  it('un menor no pasa de 75 min entre semana ni hace tests', () => {
    const ctx = weeklyCtx({ profile: { ftp: 200, ageYears: 15 } });
    const { out, fixes } = repairOutput('weekly_eval', ctx, weeklyOut([easy('tue', 90), easy('sat', 90)]));
    expect(out.nextWeekWorkouts[0].segments[0].steps[0].duration_s).toBeLessThanOrEqual(75 * 60);
    const test = { ...easy('thu', 40), name: 'Test de rampa', kind: 'test' };
    expect(guardOutput('weekly_eval', ctx, weeklyOut([easy('tue', 60), test])).fails.some((f) => f.includes('no hace tests'))).toBe(true);
    expect(out.nextWeekWorkouts[1].segments[0].steps[0].duration_s).toBe(90 * 60); // sábado no
    expect(fixes.some((f: string) => f.includes('recortado'))).toBe(true);
  });
});

describe('reglas v3 (2)', () => {
  it('sin meta de rendimiento no hay tests ni nextTest', () => {
    const ctx = { startDate: '2026-10-12', goal: 'Quiero desestresarme, sin meta de rendimiento.', experienceLevel: 'returning_or_new_to_app', availability: { days: ['tue', 'thu'], maxSessionMinutes: 45, hoursPerWeek: 3 }, occupiedDates: [], profile: { ftp: null } };
    const out = { blocks: [{ name: 'Base', weeks: 4, focus: 'x' }], firstBlockWeeks: [{ weekIndex: 0, workouts: [easy('tue', 40)] }], coachNote: 'Todo por sensación, variedad tipo clase y sin números que te presionen esta temporada.', nextTest: { weekIndex: 3, type: 'ramp', reason: 'x' } };
    const g = guardOutput('create_plan', ctx, out);
    expect(g.fails.some((f) => f.includes('no busca rendimiento'))).toBe(true);
    expect(guardOutput('create_plan', ctx, { ...out, nextTest: null }).fails).toEqual([]);
  });

  it('siglas en el reasoning de la evaluación son falla', () => {
    const g = guardOutput('weekly_eval', weeklyCtx(), weeklyOut([easy('tue')], { reasoning: 'Cumpliste 195 de 201 TSS y el TSB está en +13, así que mantenemos la semana sin cambios.' }));
    expect(g.fails.some((f) => f.includes('sin siglas'))).toBe(true);
  });
});

