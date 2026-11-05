// Simula la evaluación semanal (weekly_eval) contra el coach REAL de
// producción, con la cuenta dummy. Por cada escenario:
//   1. crea el plan de una persona de perfiles-data.mjs (create_plan);
//   2. corre el plan dos semanas al pasado (startDate y fechas de sus
//      sesiones), para que la semana 2 ya haya terminado y el gate abra;
//   3. arma el contexto como lo arma la app (src/ui/coach.ts,
//      computeWeekEvalContext) con una semana simulada: RPE, desacople y
//      nota del atleta según el escenario;
//   4. llama a weekly_eval y guarda la decisión, el reasoning y la semana nueva.
// Al terminar da de baja el plan y le devuelve su perfil original al dummy.
//
//   node scripts/coach-sim/eval-semana.mjs                 # todos los escenarios
//   node scripts/coach-sim/eval-semana.mjs verde-daniel    # solo ese
//
// ⚠️ Escribe en PRODUCCIÓN, en la cuenta dummy (ver README.md): cambia su
// perfil, borra sus contadores y sus entrenos futuros, crea planes reales,
// manda correos a su bandeja y gasta IA (~US$0.15-0.25 por escenario).
import fs from 'node:fs';
import path from 'node:path';
import { PERFILES, createContext, profileRow, todayKey } from './perfiles-data.mjs';
import { DUMMY_ID, activePlan, addDays, describeWorkout, fn, rest, weekStartOf, workoutsByIds } from './lib.mjs';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out', 'eval-semana');
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const save = (name, obj) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
};
const SHIFT_DAYS = 14; // la semana de índice 1 queda completa en el pasado
// Lo que este script creó y corrió al pasado: la baja del plan solo borra lo
// futuro, así que al final se borra aquí (son de la cuenta dummy).
const created = { workouts: new Set(), routines: new Set() };

/** Escenarios: qué persona y cómo le fue la semana que se evalúa (índice 1). */
const ESCENARIOS = [
  {
    id: 'verde-daniel',
    perfil: 'p08',
    titulo: 'Luz verde: novato que cumplió todo, RPE bajo y desacople bajo',
    // Joe: con luz verde se aprieta (más repeticiones, primer RPE 7), una variable a la vez.
    sesion: (x) => ({ completed: true, rpe: x.hard ? 5 : 3, drift: x.hard ? 3 : 2, note: x.hard ? 'Las aceleraciones salieron bien, me quedé con ganas de más.' : null }),
    nota: 'Me sentí muy bien toda la semana, la rodilla sin molestias. Dormí bien. Con ganas de que suba un poco.',
    pmc: { ctl: 14, atl: 19, tsb: -5, ctlRampLast4Weeks: 9 },
  },
  {
    id: 'amarilla-carlos',
    perfil: 'p02',
    titulo: 'Luz amarilla: el desacople brinca en más de una sesión y el RPE sube',
    // Joe: si el desacople brinca en más de una sesión, se mantiene y se adelanta el test (FTP manual).
    sesion: (x) => ({ completed: true, rpe: x.hard ? 8 : 5, drift: x.hard ? 9 : 7, note: x.hard ? 'Los últimos bloques se me hicieron muy pesados, el pulso se fue para arriba.' : null }),
    nota: 'Las series se sintieron más pesadas de lo que esperaba y el pulso se me subía mucho. Dormí bien y no estoy enfermo. El sábado la salida con amigos se volvió carrera.',
    pmc: { ctl: 47, atl: 56, tsb: -9, ctlRampLast4Weeks: 6 },
    unplanned: (sat) => [{ date: sat, dayOfWeek: 'sat', name: 'Salida de montaña con amigos', minutes: 150, tss: 165, rpe: 8, note: 'Se volvió carrera en las subidas.' }],
  },
  {
    id: 'dias-daniel',
    perfil: 'p08',
    titulo: 'Bajar días: no le alcanzan 4 y confirma con cuáles sigue',
    // Debe guardar planDays [tue, thu, sat] y armar la semana en esos días.
    sesion: (x) => (x.day === 'mon' ? { completed: false } : { completed: true, rpe: x.hard ? 5 : 3, drift: 3, note: null }),
    nota: 'El lunes no pude, salgo tarde del trabajo. No me alcanzan 4 días: de ahora en adelante puedo sin problema martes, jueves y sábado. Lo que sí hice me sentó bien.',
    pmc: { ctl: 12, atl: 15, tsb: -3, ctlRampLast4Weeks: 7 },
  },
];

async function cleanDummy() {
  if (await activePlan()) log(`  baja del plan anterior: HTTP ${(await fn('coach-retire-plan', { status: 'abandoned' })).status}`);
  const today = todayKey();
  await rest('DELETE', `workouts?user_id=eq.${DUMMY_ID}&data->>scheduledDate=gte.${today}`);
  await rest('DELETE', `planned_routines?athlete_id=eq.${DUMMY_ID}&source=eq.ai&scheduled_date=gte.${today}`);
  await rest('DELETE', `plan_actions?user_id=eq.${DUMMY_ID}`);
  await rest('DELETE', `coach_usage?user_id=eq.${DUMMY_ID}`);
  await rest('DELETE', `athlete_notes?athlete_id=eq.${DUMMY_ID}`);
}

/** Corre el plan `days` días al pasado: startDate, sus sesiones y sus extras. */
async function shiftPlan(plan, days) {
  const newStart = addDays(plan.data.startDate, -days);
  await rest('PATCH', `training_plans?id=eq.${plan.id}`, { data: { ...plan.data, startDate: newStart } });
  const ids = plan.data.weeks.flatMap((w) => w.workoutIds);
  ids.forEach((id) => created.workouts.add(id));
  for (const w of await rest('GET', `workouts?user_id=eq.${DUMMY_ID}&id=in.(${ids.join(',')})&select=id,data`)) {
    if (w.data.scheduledDate) await rest('PATCH', `workouts?id=eq.${w.id}`, { data: { ...w.data, scheduledDate: addDays(w.data.scheduledDate, -days) } });
  }
  for (const r of await rest('GET', `planned_routines?athlete_id=eq.${DUMMY_ID}&source=eq.ai&select=id,scheduled_date`)) {
    created.routines.add(r.id);
    await rest('PATCH', `planned_routines?id=eq.${r.id}`, { scheduled_date: addDays(r.scheduled_date, -days) });
  }
  return newStart;
}

const ZONE = { fondo: 'fondo', tempo: 'tempo', 'sweet spot': 'sweet spot', umbral: 'umbral', VO2: 'VO2', test: 'test' };
/** Una sesión con trabajo por encima de fondo: por % o por steps "free" por RPE. */
const isHardish = (w, d) => d.zone !== 'fondo' || (w.intervals ?? []).some((iv) => iv.type === 'free' && iv.power_pct >= 75);

async function runEscenario(sc) {
  const p = PERFILES.find((x) => x.id === sc.perfil);
  log(`${sc.id}: ${p.name} — ${sc.titulo}`);
  await cleanDummy();
  await rest('PATCH', `profiles?user_id=eq.${DUMMY_ID}`, profileRow(p));
  const create = await fn('coach-chat', { mode: 'create_plan', context: createContext(p) });
  log(`  create_plan: HTTP ${create.status} en ${Math.round(create.ms / 1000)} s`);
  if (create.status !== 200) return { id: sc.id, error: create.body };

  const plan = await activePlan();
  const start = await shiftPlan(plan, SHIFT_DAYS);
  log(`  plan corrido ${SHIFT_DAYS} días: startDate ${plan.data.startDate} → ${start}`);

  // Semanas 0 y 1 ya pasaron: la 0 se cumplió normal; la 1 es la que se evalúa.
  const weekRows = [];
  for (const wi of [0, 1]) {
    const ws = (await workoutsByIds(plan.data.weeks[wi]?.workoutIds ?? [])).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    weekRows.push(
      ws.map((w) => {
        const d = describeWorkout(w);
        const hard = isHardish(w, d);
        const fb = wi === 1 ? sc.sesion({ ...d, hard }) : { completed: true, rpe: hard ? 5 : 3, drift: 3, note: null };
        return {
          dayOfWeek: d.day, name: w.name, zone: ZONE[d.zone] ?? 'fondo', plannedTSS: d.tss,
          actualTSS: fb.completed ? Math.round(d.tss * 0.97) : null, completed: fb.completed, rpe: fb.completed ? fb.rpe : null,
          hrDriftPct: fb.completed ? fb.drift : null, efficiencyFactor: fb.completed ? 1.3 : null, ruleTriggers: [], note: fb.note,
        };
      }),
    );
  }
  const sat = addDays(weekStartOf(start, 1), 5);
  const unplannedRides = sc.unplanned ? sc.unplanned(sat) : [];
  const summary = weekRows.map((rows, wi) => {
    const done = rows.filter((r) => r.completed);
    const extra = wi === 1 ? unplannedRides.reduce((s, r) => s + (r.tss ?? 0), 0) : 0;
    const rpes = done.map((r) => r.rpe);
    return {
      weekIndex: wi, plannedTSS: rows.reduce((s, r) => s + r.plannedTSS, 0), actualTSS: done.reduce((s, r) => s + r.actualTSS, 0) + extra,
      completedWorkouts: done.length, missedWorkouts: rows.length - done.length,
      ...(rpes.length ? { avgRpe: Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10, rpeCount: rpes.length } : {}),
    };
  });

  const createdCtx = createContext(p);
  const blocks = plan.data.blocks;
  const today = todayKey();
  const occupied = (await rest('GET', `workouts?user_id=eq.${DUMMY_ID}&data->>scheduledDate=gte.${today}&select=data`)).map((r) => r.data.scheduledDate);
  const context = {
    weekJustFinished: {
      plannedTSS: summary[1].plannedTSS, actualTSS: summary[1].actualTSS,
      completedWorkouts: summary[1].completedWorkouts, missedWorkouts: summary[1].missedWorkouts,
      ruleTriggers: [], athleteNote: sc.nota, otherActivitiesNote: null, otherActivities: [],
      workouts: weekRows[1],
      ...(unplannedRides.length ? { unplannedRides } : {}),
    },
    pmcTrend: sc.pmc,
    recentGapPattern: null,
    recentWeeksSummary: summary,
    profile: createdCtx.profile,
    maxSessionMinutes: plan.data.maxSessionMinutes ?? null,
    occupiedDates: [...new Set(occupied)],
    plan: {
      goal: plan.data.form?.goal ?? plan.goal, discipline: p.discipline, experienceLevel: p.experienceLevel, generalFitnessLevel: p.generalFitnessLevel,
      days: plan.data.form?.days ?? p.availability.days, hoursPerWeek: plan.data.form?.hoursPerWeek ?? p.availability.hoursPerWeek,
      currentBlock: { name: blocks[0].name, focus: blocks[0].focus, weeks: blocks[0].weeks, weekInBlock: 3 },
      nextBlock: blocks[1] ? { name: blocks[1].name, focus: blocks[1].focus, weeks: blocks[1].weeks, targetHoursPerWeek: blocks[1].targetHoursPerWeek ?? null } : null,
      nextTest: plan.data.nextTest ?? null,
    },
    lastTest: null,
  };

  const resp = await fn('coach-chat', { mode: 'weekly_eval', context });
  log(`  weekly_eval: HTTP ${resp.status} en ${Math.round(resp.ms / 1000)} s${resp.status !== 200 ? ' — ' + JSON.stringify(resp.body).slice(0, 300) : ''}`);
  const after = await activePlan();
  const target = after?.data?.weeks?.[2]?.workoutIds ?? [];
  target.forEach((id) => created.workouts.add(id));
  const nueva = (await workoutsByIds(target)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).map((w) => ({ ...describeWorkout(w), intervals: undefined }));
  const extras = await rest('GET', `planned_routines?athlete_id=eq.${DUMMY_ID}&source=eq.ai&scheduled_date=gte.${today}&select=scheduled_date,kind,name,payload&order=scheduled_date`);
  const out = { diasAntes: plan.data.form?.days ?? null, diasDespues: after?.data?.form?.days ?? null, escenario: sc.id, titulo: sc.titulo, perfil: p.id, at: new Date().toISOString(), create: create.body?.result ?? null, context, status: resp.status, ms: resp.ms, result: resp.body?.result ?? null, error: resp.status === 200 ? null : resp.body, semanaNueva: nueva, extras };
  save(`${sc.id}.json`, out);
  return out;
}

const ids = process.argv.slice(2);
const chosen = ids.length ? ESCENARIOS.filter((s) => ids.includes(s.id)) : ESCENARIOS;
const [original] = await rest('GET', `profiles?user_id=eq.${DUMMY_ID}&select=*`);
save('perfil-original-dummy.json', original);
try {
  for (const sc of chosen) await runEscenario(sc);
} finally {
  if (await activePlan()) log(`baja del último plan: HTTP ${(await fn('coach-retire-plan', { status: 'abandoned' })).status}`);
  const del = async (table, ids) => ids.length && rest('DELETE', `${table}?id=in.(${ids.join(',')})&${table === 'workouts' ? 'user_id' : 'athlete_id'}=eq.${DUMMY_ID}`);
  await del('workouts', [...created.workouts]).catch((e) => log(`limpieza workouts: ${e.message}`));
  await del('planned_routines', [...created.routines]).catch((e) => log(`limpieza extras: ${e.message}`));
  const { user_id: _u, ...restore } = original ?? {};
  if (original) await rest('PATCH', `profiles?user_id=eq.${DUMMY_ID}`, restore);
  log('cuenta dummy: plan dado de baja y perfil original restaurado');
}
