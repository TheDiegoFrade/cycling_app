// Uso: node run.mjs <escenario> <corrida> [--eval] [--no-retire] [--tag=x]
import path from 'node:path';
import {
  DUMMY_ID, OUT, activePlan, addDays, allWorkouts, dayOf, describeWorkout, fn, mondayOf, resetCounters, rest, save, sql, todayKey, tssOf, weekEnd, weekStartOf, workoutsByIds, zoneOf,
} from './lib.mjs';
import { SCENARIOS } from './scenarios.mjs';

const args = process.argv.slice(2);
const sid = Number(args[0]);
const runNo = Number(args[1]);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const tag = [...flags].find((f) => f.startsWith('--tag='))?.slice(6);
const s = SCENARIOS[sid];
const dir = path.join(OUT, `s${String(sid).padStart(2, '0')}-r${runNo}${tag ? '-' + tag : ''}`);
const log = [];
const note = (m) => { const line = `[${new Date().toISOString()}] ${m}`; log.push(line); console.log(line); };

function birthDateFor(age) {
  const t = todayKey();
  const y = Number(t.slice(0, 4)) - age;
  return `${y}-${t.slice(5, 7) === '01' ? '01' : String(Number(t.slice(5, 7)) - 1).padStart(2, '0')}-01`;
}

export async function retireAndVerify() {
  const before = await activePlan();
  const today = todayKey();
  if (!before) { note('baja: no había plan activo'); return { hadPlan: false }; }
  const ids = before.data.weeks.flatMap((w) => w.workoutIds);
  const r = await fn('coach-retire-plan', { status: 'abandoned' });
  const after = await activePlan();
  const leftovers = await workoutsByIds(ids);
  const future = (await allWorkouts()).filter((w) => (w.scheduledDate ?? '') >= today);
  const old = await rest('GET', `training_plans?id=eq.${before.id}&select=id,status`);
  const res = {
    planId: before.id, http: r.status, ms: r.ms, response: r.body, statusAfter: old[0]?.status, stillActive: after?.id ?? null,
    planWorkoutIds: ids.length, leftoverPlanWorkouts: leftovers.length, futureWorkoutsAfter: future.map((w) => ({ id: w.id, date: w.scheduledDate, name: w.name })),
  };
  note(`baja: HTTP ${r.status} en ${r.ms} ms · status=${res.statusAfter} · quedan ${leftovers.length}/${ids.length} workouts del plan · futuras=${future.length}`);
  return res;
}

export async function setProfile(sc) {
  const measured = sc.ftp !== null;
  const ftpUpdatedAt = measured ? new Date(Date.now() - (sc.ftpAgeDays ?? 30) * 86400000).toISOString() : null;
  const row = {
    ftp: sc.ftp ?? 200, ftp_source: measured ? 'manual' : 'default', ftp_confirmed: measured, ftp_updated_at: ftpUpdatedAt,
    hr_max: sc.hrMax, weight_kg: sc.weight, birth_date: birthDateFor(sc.age), sex: sc.sex ?? 'other', name: null,
    experience_level: sc.experienceLevel, general_fitness_level: sc.generalFitnessLevel, years_riding: sc.yearsRiding,
    competes: sc.competes, category: sc.category, discipline: sc.discipline, injuries: sc.injuries, updated_at: new Date().toISOString(),
  };
  await rest('PATCH', `profiles?user_id=eq.${DUMMY_ID}`, row);
  return row;
}

async function occupiedDates(start, weeks) {
  const end = addDays(start, weeks * 7);
  const ws = (await allWorkouts()).map((w) => w.scheduledDate).filter((d) => d && d >= start && d <= end);
  const ss = await rest('GET', `sessions?user_id=eq.${DUMMY_ID}&select=started_at`);
  const sd = ss.map((x) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(x.started_at))).filter((d) => d >= start && d <= end);
  // --clean: ignora la sesión con fecha futura del historial del dummy (contaminación E-01)
  return [...new Set([...ws, ...(flags.has('--clean') ? [] : sd)])].sort();
}

function profileCtx(sc, row) {
  const measured = sc.ftp !== null;
  return {
    ftp: measured ? sc.ftp : null, provisionalFtp: null, ftpSource: row.ftp_source, ftpUpdatedAt: row.ftp_updated_at,
    hr_max: sc.hrKnown ? sc.hrMax : null, sex: sc.sex ?? 'other', name: null, injuries: sc.injuries, weightKg: sc.weight, ageYears: sc.age,
  };
}

export async function buildCreateContext(sc, row, overrides = {}) {
  const startDate = todayKey();
  return {
    startDate, goal: sc.goal(), experienceLevel: sc.experienceLevel, generalFitnessLevel: sc.generalFitnessLevel, discipline: sc.discipline,
    yearsRiding: sc.yearsRiding, competes: sc.competes, category: sc.competes ? sc.category : null,
    availability: { hoursPerWeek: sc.hours, days: sc.days, maxSessionMinutes: sc.maxMin },
    occupiedDates: await occupiedDates(startDate, 3),
    profile: profileCtx(sc, row), recentHistory: null, lastTest: null,
    ...overrides,
  };
}

export async function capturePlan(d, label = 'plan') {
  const plan = await activePlan();
  if (!plan) return null;
  const ids = plan.data.weeks.flatMap((w) => w.workoutIds);
  const ws = await workoutsByIds(ids);
  const byId = Object.fromEntries(ws.map((w) => [w.id, w]));
  const weeks = plan.data.weeks.map((w) => {
    const items = w.workoutIds.map((id) => byId[id]).filter(Boolean).map(describeWorkout).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    return { weekIndex: w.weekIndex, sessions: items, minutes: items.reduce((a, x) => a + x.min, 0), tss: items.reduce((a, x) => a + x.tss, 0) };
  });
  save(d, `${label}.json`, { id: plan.id, goal: plan.goal, status: plan.status, data: { ...plan.data, weeks: undefined }, weeks, rawWorkouts: ws });
  return { plan, weeks, ws };
}

function summaryMd(title, resp, cap) {
  const r = resp.body?.result ?? {};
  const L = [`## ${title}`, `HTTP ${resp.status} · ${Math.round(resp.ms / 1000)} s`];
  if (resp.status !== 200) { L.push('```', JSON.stringify(resp.body).slice(0, 1500), '```'); return L.join('\n'); }
  const pd = cap?.plan?.data ?? {};
  L.push(`planName: ${r.planName ?? cap?.plan?.goal} · startDate ${pd.startDate} · suggestedFtp ${r.suggestedFtp ?? null} · nextTest ${JSON.stringify(pd.nextTest ?? r.nextTest ?? null)}`);
  L.push(`blocks: ${(pd.blocks ?? []).map((b) => `${b.name} (${b.weeks} sem, ${b.targetHoursPerWeek ?? '?'} h) — ${b.focus}`).join(' / ')}`);
  if (r.coachNote) L.push(`coachNote: ${r.coachNote}`);
  for (const k of Object.keys(r)) if (!['coachNote', 'planName', 'suggestedFtp', 'nextTest'].includes(k) && typeof r[k] !== 'object') L.push(`${k}: ${r[k]}`);
  for (const k of ['reasoning', 'decision', 'contradictionFlag', 'recurringPatternFlag', 'ftpAction', 'notesUpdate']) if (r[k] !== undefined && typeof r[k] === 'object' && r[k] !== null) L.push(`${k}: ${JSON.stringify(r[k])}`);
  for (const w of cap?.weeks ?? []) {
    L.push(`### Semana índice ${w.weekIndex} (sem ${w.weekIndex + 1} para el atleta) · ${w.sessions.length} sesiones · ${Math.round(w.minutes / 6) / 10} h · TSS≈${w.tss}`);
    for (const x of w.sessions) L.push(`- ${x.date} ${x.day} · **${x.name}** · ${x.min}' · TSS≈${x.tss} · ${x.zone} · max ${x.maxPct}%${x.freeSteps ? ` · ${x.freeSteps} pasos free` : ''}${x.kind ? ' · kind=' + x.kind : ''}\n  - ${x.steps}\n  - _${(x.description ?? '').replace(/\s+/g, ' ')}_`);
  }
  return L.join('\n');
}

export async function createPlan(sc, row, label, overrides) {
  const context = await buildCreateContext(sc, row, overrides);
  save(dir, `${label}-context.json`, context);
  note(`${label}: create_plan…`);
  const resp = await fn('coach-chat', { mode: 'create_plan', context });
  note(`${label}: HTTP ${resp.status} en ${Math.round(resp.ms / 1000)} s${resp.status !== 200 ? ' — ' + JSON.stringify(resp.body).slice(0, 300) : ''}`);
  save(dir, `${label}-response.json`, resp);
  const cap = resp.status === 200 ? await capturePlan(dir, label) : null;
  save(dir, `${label}-summary.md`, summaryMd(`${s.title} — ${label}`, resp, cap));
  return { resp, cap, context };
}

// ---------- weekly_eval simulada ----------
function weekFeedback(sc, sessions) {
  const fb = sc.fb;
  const n = sessions.length;
  const doneCount = fb.completeFraction ? Math.round(n * fb.completeFraction) : n;
  // falta(n) las últimas sesiones no-test
  const order = sessions.map((x, i) => i).sort((a, b) => (sessions[b].zone === 'test') - (sessions[a].zone === 'test'));
  const done = new Set(order.slice(0, doneCount));
  return sessions.map((x, i) => {
    const completed = done.has(i);
    const longest = x.min === Math.max(...sessions.map((y) => y.min));
    const base = { fondo: 4, tempo: 5, 'sweet spot': 6, umbral: 7, VO2: 8, test: 9 }[x.zone] ?? 5;
    let rpe = base;
    if (fb.rpe === 'rising') rpe = base + Math.min(2, Math.round((i / Math.max(1, n - 1)) * 2));
    if (fb.rpe === 'above') rpe = base + 2;
    if (fb.z2Rpe && x.zone === 'fondo') rpe = fb.z2Rpe;
    if (fb.longRideRpe && longest) rpe = fb.longRideRpe;
    if (fb.intervalsRpe && ['VO2', 'umbral', 'sweet spot'].includes(x.zone)) rpe = fb.intervalsRpe;
    if (fb.thresholdRpe && ['umbral', 'sweet spot'].includes(x.zone)) rpe = fb.thresholdRpe;
    let drift = sc.noHr ? null : (x.zone === 'fondo' ? 3 : 4);
    if (fb.longRideDrift && longest) drift = fb.longRideDrift;
    if (fb.z2Hr && x.zone === 'fondo') drift = 7;
    const triggers = [];
    if (fb.cadenceFloorHits && x.cadence.length) triggers.push({ ruleId: 'factory-cadence-floor', count: fb.cadenceFloorHits });
    if (fb.hrCeilingHits && x.zone === 'fondo') triggers.push({ ruleId: 'factory-hr-ceiling', count: fb.hrCeilingHits });
    if (fb.ergDetachedHits && ['umbral', 'sweet spot', 'VO2'].includes(x.zone)) triggers.push({ ruleId: 'factory-erg-detached', count: fb.ergDetachedHits });
    const unfinished = fb.unfinished && completed && ['umbral', 'sweet spot', 'VO2', 'tempo'].includes(x.zone) ? true : false;
    const actual = completed ? Math.round(x.tss * (unfinished ? 0.6 : 0.97)) : null;
    return {
      dayOfWeek: x.day, name: x.name, zone: x.zone, plannedTSS: x.tss, actualTSS: actual, completed, rpe: completed ? Math.min(10, rpe) : null,
      hrDriftPct: completed ? drift : null, efficiencyFactor: completed && !sc.noHr ? (fb.z2Hr && x.zone === 'fondo' ? 1.05 : 1.35) : null, ruleTriggers: completed ? triggers : [],
    };
  });
}

function pmcFrom(daily) {
  let ctl = 0, atl = 0; const hist = [];
  for (const tss of daily) { ctl += (tss - ctl) / 42; atl += (tss - atl) / 7; hist.push(ctl); }
  return { ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round((ctl - atl) * 10) / 10, ctlRampLast4Weeks: Math.round((ctl - (hist[hist.length - 29] ?? 0)) * 10) / 10 };
}

export async function weeklyEval(sc, row) {
  const plan = await activePlan();
  const n = plan.data.weeks.length;
  const shift = -7 * n;
  const oldStart = plan.data.startDate;
  const newStart = addDays(oldStart, shift);
  // Corre el plan n semanas al pasado para que el gate de weekly_eval abra (simulación).
  const ids = plan.data.weeks.flatMap((w) => w.workoutIds);
  await sql(`update training_plans set data = jsonb_set(data, '{startDate}', to_jsonb('${newStart}'::text)) where id='${plan.id}';
    update workouts set data = jsonb_set(data, '{scheduledDate}', to_jsonb(((data->>'scheduledDate')::date + ${shift})::text)) where user_id='${DUMMY_ID}' and id in (${ids.map((i) => `'${i}'`).join(',')}) and data ? 'scheduledDate';`);
  note(`eval: plan corrido ${shift} días (startDate ${oldStart} → ${newStart})`);
  const cap = await capturePlan(dir, 'pre-eval');
  const after_ids_dates = new Set(cap.weeks.flatMap((w) => w.sessions.map((x) => x.date)));
  const weekRows = cap.weeks.map((w) => ({ w, rows: weekFeedback(sc, w.sessions) }));
  const summ = weekRows.map(({ w, rows }) => ({
    weekIndex: w.weekIndex, plannedTSS: w.tss, actualTSS: rows.reduce((a, r) => a + (r.actualTSS ?? 0), 0) + (sc.fb.outdoorRide ? sc.fb.outdoorRide.tss : 0),
    completedWorkouts: rows.filter((r) => r.completed).length, missedWorkouts: rows.filter((r) => !r.completed).length,
  }));
  const last = weekRows[weekRows.length - 1];
  const lastSum = summ[summ.length - 1];
  // PMC: 6 semanas previas suaves + lo del plan
  const daily = [];
  const baseDaily = sc.experienceLevel === 'experienced' ? sc.hours * 50 / 7 : sc.hours * 30 / 7;
  for (let i = 0; i < 42; i++) daily.push(baseDaily);
  const startKey = newStart;
  for (let d = 0; d < 7 * n + 4; d++) {
    const key = addDays(startKey, d);
    let t = 0;
    weekRows.forEach(({ w, rows }) => w.sessions.forEach((x, i) => { if (x.date === key && rows[i].actualTSS) t += rows[i].actualTSS; }));
    daily.push(t);
  }
  const testSession = cap.weeks.flatMap((w) => w.sessions).find((x) => x.zone === 'test');
  const lastTest = testSession ? {
    date: testSession.date, type: /20/.test(testSession.name) ? 'test20' : 'ramp', ergFixed: false, blockMinutes: /20/.test(testSession.name) ? 20 : testSession.min - 15, avgPowerW: /20/.test(testSession.name) ? Math.round(sc.truthFtp / 0.95) : Math.round(sc.truthFtp * 0.85),
    best1MinW: sc.best1Min, powerFadePct: null, hrStart: sc.noHr ? null : 110, hrEnd: sc.noHr ? null : (sc.fb.lowHr ? 128 : Math.round(sc.hrMax * 0.97)), hrSlopeBpmPerMin: sc.noHr ? null : 3.2,
    hrHalvesDeltaPct: null, hrEndPctOfMax: sc.noHr ? null : (sc.fb.lowHr ? 69 : 97), cadenceDeltaRpm: sc.fb.cadenceFloorHits ? -12 : -3, completed: true, ftpInUseW: sc.ftp ?? 200,
  } : null;
  const blocks = plan.data.blocks;
  let start = 0, cur = 0, wib = 1;
  for (let i = 0; i < blocks.length; i++) { if (n < start + blocks[i].weeks) { cur = i; wib = n - start + 1; break; } start += blocks[i].weeks; cur = i; wib = n - start + 1; }
  const form = plan.data.form ?? { goal: plan.goal, days: sc.days, hoursPerWeek: sc.hours };
  let note2 = sc.fb.note;
  const context = {
    profile: { sex: sc.sex ?? 'other', name: null, ftp: sc.ftp, provisionalFtp: null, ftpSource: row.ftp_source, ftpUpdatedAt: row.ftp_updated_at, injuries: sc.injuries, weightKg: sc.weight, ageYears: sc.age },
    maxSessionMinutes: plan.data.maxSessionMinutes ?? null,
    occupiedDates: (await occupiedDates(todayKey(), 1)).filter((d) => !after_ids_dates.has(d)),
    plan: {
      goal: form.goal, discipline: sc.discipline, experienceLevel: sc.experienceLevel, generalFitnessLevel: sc.generalFitnessLevel, days: form.days, hoursPerWeek: form.hoursPerWeek,
      currentBlock: { name: blocks[cur].name, focus: blocks[cur].focus, weeks: blocks[cur].weeks, weekInBlock: Math.max(1, wib) },
      nextBlock: blocks[cur + 1] ? { name: blocks[cur + 1].name, focus: blocks[cur + 1].focus, weeks: blocks[cur + 1].weeks, targetHoursPerWeek: blocks[cur + 1].targetHoursPerWeek ?? null } : null,
      nextTest: plan.data.nextTest ?? null,
    },
    nextWeekStart: weekStartOf(newStart, n),
    lastTest,
    weekJustFinished: {
      plannedTSS: lastSum.plannedTSS, actualTSS: lastSum.actualTSS, completedWorkouts: lastSum.completedWorkouts, missedWorkouts: lastSum.missedWorkouts,
      ruleTriggers: Object.values(last.rows.flatMap((r) => r.ruleTriggers).reduce((m, t) => { m[t.ruleId] = { ruleId: t.ruleId, count: (m[t.ruleId]?.count ?? 0) + t.count }; return m; }, {})),
      athleteNote: note2, workouts: last.rows,
    },
    pmcTrend: pmcFrom(daily),
    recentGapPattern: null,
    recentWeeksSummary: summ.length > 1 ? summ : null,
  };
  save(dir, 'eval-context.json', context);
  let mode = 'weekly_eval';
  let sendCtx = context;
  if (plan.current_block_exhausted) {
    // El bloque se agotó: la app no tiene UI para publish_block (E-14); se llama directo al endpoint.
    mode = 'publish_block';
    sendCtx = {
      previousBlockSummary: { weeks: n, plannedTSS: summ.reduce((a, x) => a + x.plannedTSS, 0), actualTSS: summ.reduce((a, x) => a + x.actualTSS, 0), completedWorkouts: summ.reduce((a, x) => a + x.completedWorkouts, 0), missedWorkouts: summ.reduce((a, x) => a + x.missedWorkouts, 0) },
      pmcTrend: { ctl: context.pmcTrend.ctl, atl: context.pmcTrend.atl, tsb: context.pmcTrend.tsb },
      profile: context.profile, maxSessionMinutes: context.maxSessionMinutes, occupiedDates: context.occupiedDates, plan: context.plan, nextWeekStart: context.nextWeekStart,
    };
    save(dir, 'publish-context.json', sendCtx);
    note('eval: bloque agotado → publish_block (sin retro: el schema no la acepta)');
  }
  note(`eval: ${mode}…`);
  const resp = await fn('coach-chat', { mode, context: sendCtx });
  note(`eval: HTTP ${resp.status} en ${Math.round(resp.ms / 1000)} s${resp.status !== 200 ? ' — ' + JSON.stringify(resp.body).slice(0, 300) : ''}`);
  save(dir, 'eval-response.json', resp);
  const after = await capturePlan(dir, 'post-eval');
  const newWeek = after?.weeks[after.weeks.length - 1];
  const r = resp.body?.result ?? {};
  const md = [`## ${s.title} — ${mode}`, mode === 'publish_block' ? `blockName: ${r.blockName} · coachNote: ${r.coachNote}` : '', `HTTP ${resp.status} · ${Math.round(resp.ms / 1000)} s · hoy ${todayKey()} · nextWeekStart ${context.nextWeekStart}`,
    `retro enviada: ${note2} · lastTest: ${lastTest ? `${lastTest.type} best1Min ${lastTest.best1MinW} W` : 'ninguno'}`,
    `decision: ${r.decision} · ftpAction ${r.ftpAction} · suggestedFtp ${r.suggestedFtp} · nextTest ${JSON.stringify(r.nextTest)}`,
    `reasoning: ${r.reasoning}`, `contradictionFlag: ${r.contradictionFlag}`, `recurringPatternFlag: ${r.recurringPatternFlag}`, `notesUpdate: ${r.notesUpdate}`,
    `otros campos: ${JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['reasoning', 'decision', 'contradictionFlag', 'recurringPatternFlag', 'notesUpdate', 'nextWeekWorkouts', 'ftpAction', 'suggestedFtp', 'nextTest'].includes(k)))).slice(0, 800)}`];
  if (newWeek && after.weeks.length > n) {
    md.push(`### Semana generada índice ${newWeek.weekIndex} · ${newWeek.sessions.length} sesiones · ${Math.round(newWeek.minutes / 6) / 10} h · TSS≈${newWeek.tss}`);
    for (const x of newWeek.sessions) md.push(`- ${x.date} ${x.day} · **${x.name}** · ${x.min}' · TSS≈${x.tss} · ${x.zone} · max ${x.maxPct}%\n  - ${x.steps}\n  - _${(x.description ?? '').replace(/\s+/g, ' ')}_`);
  } else md.push('(no se agregó semana nueva al plan)');
  save(dir, 'eval-summary.md', md.join('\n'));
  return { resp, after };
}

async function main() {
  const t0 = new Date().toISOString();
  note(`== Escenario ${sid} (${s.title}) corrida ${runNo} ${[...flags].join(' ')}`);
  const out = { scenario: sid, run: runNo, startedAt: t0 };
  if (flags.has('--try-dup')) {
    // Prueba: crear plan sin dar de baja el anterior
    const row0 = await setProfile(s);
    const ctx = await buildCreateContext(s, row0);
    const r = await fn('coach-chat', { mode: 'create_plan', context: ctx });
    out.tryDup = { status: r.status, body: r.body, activePlans: (await rest('GET', `training_plans?user_id=eq.${DUMMY_ID}&status=eq.active&select=id`)).length };
    note(`try-dup: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)} · planes activos=${out.tryDup.activePlans}`);
  }
  if (!flags.has('--no-retire')) out.retire = await retireAndVerify();
  if (flags.has('--rapid')) {
    // Prueba: baja + creación inmediata varias veces, y doble envío simultáneo
    await resetCounters();
    const row0 = await setProfile(s);
    const ctx = await buildCreateContext(s, row0);
    const [a, b] = await Promise.all([fn('coach-chat', { mode: 'create_plan', context: ctx }), fn('coach-chat', { mode: 'create_plan', context: ctx })]);
    const act = await rest('GET', `training_plans?user_id=eq.${DUMMY_ID}&status=eq.active&select=id,created_at`);
    out.rapid = { concurrent: [{ status: a.status, ms: a.ms, err: a.body?.error ?? null }, { status: b.status, ms: b.ms, err: b.body?.error ?? null }], activePlansAfterConcurrent: act };
    out.rapid.workoutsAfterConcurrent = (await allWorkouts()).length; out.rapid.planWorkoutsAfterConcurrent = act.length ? (await activePlan()).data.weeks.flatMap((w) => w.workoutIds).length : 0;
    note(`rapid: concurrentes ${a.status}/${b.status} · activos=${act.length}`);
    out.rapid.retire1 = await retireAndVerify();
    out.rapid.orphansAll = (await allWorkouts()).filter((w) => (w.scheduledDate ?? '') >= todayKey()).length;
    await resetCounters();
    const c2 = await fn('coach-chat', { mode: 'create_plan', context: ctx });
    note(`rapid: 2a creación inmediata ${c2.status}`);
    out.rapid.second = { status: c2.status, ms: c2.ms, err: c2.body?.error ?? null };
    out.rapid.retire2 = await retireAndVerify();
    out.rapid.orphansAll2 = (await allWorkouts()).filter((w) => (w.scheduledDate ?? '') >= todayKey()).length;
    out.rapid.orphanList = (await allWorkouts()).map((w) => ({ id: w.id, date: w.scheduledDate, name: w.name }));
    save(dir, 'rapid.json', out.rapid);
    // limpieza: las huérfanas contaminarían las fechas ocupadas de las corridas siguientes
    await sql(`delete from workouts where user_id='${DUMMY_ID}'`);
  }
  if (flags.has('--extreme')) {
    await resetCounters();
    const row0 = await setProfile(s);
    const base = await buildCreateContext(s, row0);
    const tries = {
      ftp0: { ...base, profile: { ...base.profile, ftp: 0 } },
      emptyGoalNoDays: { ...base, goal: '', availability: { ...base.availability, days: [] } },
      noHrMax: { ...base, profile: { ...base.profile, hr_max: undefined } },
      w300_h25: { ...base, profile: { ...base.profile, weightKg: 300 }, availability: { ...base.availability, hoursPerWeek: 25 } },
    };
    out.extreme = {};
    for (const [k, ctx] of Object.entries(tries)) {
      const r = await fn('coach-chat', { mode: 'create_plan', context: ctx });
      out.extreme[k] = { status: r.status, ms: r.ms, error: r.body?.error ?? null, details: r.body?.details ? JSON.stringify(r.body.details).slice(0, 400) : null };
      note(`extreme ${k}: HTTP ${r.status} ${r.body?.error ?? ''}`);
      if (r.status === 200) {
        save(dir, `extreme-${k}-response.json`, r);
        const cap = await capturePlan(dir, `extreme-${k}`);
        save(dir, `extreme-${k}-summary.md`, summaryMd(`${s.title} — extremo ${k}`, r, cap));
        out.extreme[k].retire = await retireAndVerify();
        await resetCounters();
      }
    }
    save(dir, 'extreme.json', out.extreme);
  }
  await resetCounters();
  out.profile = await setProfile(s);
  const c = await createPlan(s, out.profile, 'create');
  out.create = { status: c.resp.status, ms: c.resp.ms, planId: c.cap?.plan?.id ?? null };
  if (c.cap) {
    await new Promise((r) => setTimeout(r, 8000));
    const p = await activePlan();
    out.create.emails = p?.data?.emails ?? null;
    out.create.emailDrafts = p?.data?.emailDrafts ? Object.keys(p.data.emailDrafts) : null;
  }
  if (flags.has('--eval') && c.cap) {
    const e = await weeklyEval(s, out.profile);
    out.eval = { status: e.resp.status, ms: e.resp.ms };
    await new Promise((r) => setTimeout(r, 8000));
    const p = await activePlan();
    out.eval.emails = p?.data?.emails ?? null;
  }
  if (flags.has('--ftp-change') && c.cap) {
    // Prueba: cambiar el FTP con plan activo
    const before = await capturePlan(dir, 'pre-ftpchange');
    const planBefore = await activePlan();
    await rest('PATCH', `profiles?user_id=eq.${DUMMY_ID}`, { ftp: 250, ftp_source: 'manual', ftp_confirmed: true, ftp_updated_at: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 3000));
    const planAfter = await activePlan();
    const afterCap = await capturePlan(dir, 'post-ftpchange');
    out.ftpChange = {
      planUpdatedAtBefore: planBefore.updated_at, planUpdatedAtAfter: planAfter.updated_at,
      workoutsIdentical: JSON.stringify(before.ws.map((w) => w.intervals)) === JSON.stringify(afterCap.ws.map((w) => w.intervals)),
      planDataIdentical: JSON.stringify(planBefore.data) === JSON.stringify(planAfter.data),
    };
    note(`ftp-change: ${JSON.stringify(out.ftpChange)}`);
  }
  out.finishedAt = new Date().toISOString();
  save(dir, 'run.json', out);
  save(dir, 'log.txt', log.join('\n'));
}

if (process.argv[1].endsWith('run.mjs')) main().catch((e) => { note(`ERROR ${e.stack}`); save(dir, 'log.txt', log.join('\n')); process.exit(1); });
