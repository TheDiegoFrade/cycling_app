// Corre los 10 perfiles de perfiles-data.mjs contra el coach IA REAL
// (coach-chat create_plan en producción, cuenta dummy) y arma un reporte para
// que Joe evalúe las primeras semanas de cada plan.
//
//   node scripts/coach-sim/perfiles.mjs              # los 10
//   node scripts/coach-sim/perfiles.mjs p03 p07      # solo esos
//   node scripts/coach-sim/perfiles.mjs --reporte    # rehace el reporte con lo ya corrido
//
// ⚠️ Igual que run.mjs (ver README.md): escribe en PRODUCCIÓN, en la cuenta
// dummy. Por cada perfil: cambia su perfil, borra sus contadores, sus
// entrenos y extras futuros, crea un plan real (manda la carta del plan a su
// correo) y gasta IA (~US$0.10–0.20 por plan). Al final da de baja el último
// plan y le devuelve su perfil original.
import fs from 'node:fs';
import path from 'node:path';
import { PERFILES, createContext, fmtLong, profileRow, todayKey } from './perfiles-data.mjs';
import { CORRIDA, GENERAL, POR_PERFIL } from './perfiles-analisis.mjs';

const args = process.argv.slice(2);
const onlyReport = args.includes('--reporte');
const ids = args.filter((a) => /^p\d\d$/.test(a));
const chosen = ids.length ? PERFILES.filter((p) => ids.includes(p.id)) : PERFILES;
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'out', 'perfiles');
// lib.mjs exige las credenciales al importarse: solo se carga si se va a correr.
let DUMMY_ID, activePlan, fn, rest, workoutsByIds;
const save = (dir, name, obj) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2)); };
const REPORT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/evaluaciones/planes-ia-para-joe.md');
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function cleanDummy() {
  const plan = await activePlan();
  if (plan) {
    const r = await fn('coach-retire-plan', { status: 'abandoned' });
    log(`  baja del plan anterior: HTTP ${r.status}`);
  }
  const today = todayKey();
  // Por la API REST con la llave de servicio (no hace falta la de administración).
  await rest('DELETE', `workouts?user_id=eq.${DUMMY_ID}&data->>scheduledDate=gte.${today}`);
  await rest('DELETE', `planned_routines?athlete_id=eq.${DUMMY_ID}&source=eq.ai&scheduled_date=gte.${today}`);
  // Contadores anti-abuso y expediente del dummy (lo mismo que resetCounters de lib.mjs).
  await rest('DELETE', `plan_actions?user_id=eq.${DUMMY_ID}`);
  await rest('DELETE', `coach_usage?user_id=eq.${DUMMY_ID}`);
  await rest('DELETE', `athlete_notes?athlete_id=eq.${DUMMY_ID}`);
}

async function runOne(p) {
  log(`${p.id} ${p.name} — ${p.resumen}`);
  await cleanDummy();
  await rest('PATCH', `profiles?user_id=eq.${DUMMY_ID}`, profileRow(p));
  const context = createContext(p);
  const t0 = Date.now();
  const resp = await fn('coach-chat', { mode: 'create_plan', context });
  log(`  create_plan: HTTP ${resp.status} en ${Math.round((Date.now() - t0) / 1000)} s${resp.status !== 200 ? ' — ' + JSON.stringify(resp.body).slice(0, 300) : ''}`);
  const out = { perfil: p.id, at: new Date().toISOString(), context, status: resp.status, ms: resp.ms, result: resp.body?.result ?? null, error: resp.status === 200 ? null : resp.body };
  if (resp.status === 200) {
    const plan = await activePlan();
    out.plan = { goal: plan?.goal, data: { ...plan?.data, weeks: undefined }, weeks: plan?.data?.weeks ?? [] };
    out.workouts = await workoutsByIds((plan?.data?.weeks ?? []).flatMap((w) => w.workoutIds));
    out.extras = await rest('GET', `planned_routines?athlete_id=eq.${DUMMY_ID}&source=eq.ai&scheduled_date=gte.${todayKey()}&select=scheduled_date,kind,name,payload&order=scheduled_date`);
  }
  save(DIR, `${p.id}.json`, out);
  return out;
}

// ─── reporte ────────────────────────────────────────────────────────────
const DIAS = { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' };
const dayName = (key) => DIAS[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${key}T12:00:00Z`).getUTCDay()]];
const shortDate = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const TYPE = { warmup: 'Calentamiento', steady: 'Constante', interval: 'Intervalo', recovery: 'Recuperación', cooldown: 'Enfriamiento', free: 'Libre' };
const EXPERIENCE = { new_to_cycling: 'Nuevo en el ciclismo', returning_or_new_to_app: 'Retoma o nuevo en apps de entrenamiento', experienced: 'Con experiencia' };
const FITNESS = { sedentary: 'Sedentario', active_other_sport: 'Activo en otro deporte', active_cyclist: 'Ciclista activo' };
const DISCIPLINE = { mountain: 'Montaña', road: 'Ruta', gravel: 'Gravel', other: 'Sin disciplina (salud / general)' };
const ACT = { strength: 'Gym / fuerza', running: 'Correr', swimming: 'Natación', mobility: 'Yoga / movilidad', crossfit: 'Crossfit', other: 'Otro deporte', flexibility: 'Flexibilidad' };
const LVL = { low: 'bajo', medium: 'medio', high: 'alto' };
const SLEEPQ = { good: 'buena', fair: 'regular', poor: 'mala' };
const SMOKE = { no: 'no', occasional: 'ocasional', daily: 'diario' };
const ALC = { rarely: 'nunca o rara vez', weekly: '1–2 veces por semana', frequent: '3 o más veces por semana' };
const RPE = { yes: 'sí', somewhat: 'más o menos', no: 'no' };
const RECENT = { little: 'poco o nada', easy: 'rodadas suaves', with_intensity: 'con intensidad' };
const COND = { hypertension: 'hipertensión', diabetes: 'diabetes', metabolic: 'metabólica', asthma: 'asma', heart: 'cardiaca', dysautonomia: 'disautonomía', vertigo: 'vértigo', other: 'otra' };
const FTPSRC = { manual: 'lo escribió la persona (sin confirmar en Torq)', test_20min: 'test de 20 min', test_ramp: 'test de rampa', provisional: 'provisional (estimado)' };

const fmtMin = (s) => { const m = s / 60; return m >= 1 ? `${Math.round(m * 10) / 10}'` : `${s}"`; };
function stepText(iv, ftp) {
  const pct = iv.ramp_to_pct ? `${iv.power_pct}→${iv.ramp_to_pct}%` : `${iv.power_pct}%`;
  const w = ftp ? ` (${iv.ramp_to_pct ? `${Math.round((ftp * iv.power_pct) / 100)}→${Math.round((ftp * iv.ramp_to_pct) / 100)}` : Math.round((ftp * iv.power_pct) / 100)} W)` : '';
  const cad = iv.cadence_min || iv.cadence_max ? ` · ${iv.cadence_min ?? ''}${iv.cadence_max ? '–' + iv.cadence_max : '+'} rpm` : '';
  const hr = iv.hr_ceiling ? ` · pulso < ${iv.hr_ceiling}` : '';
  return iv.type === 'free' ? `${fmtMin(iv.duration_s)} libre, por sensación y sin ERG (referencia ~${pct}${w})${cad}` : `${fmtMin(iv.duration_s)} @ ${pct}${w}${cad}${hr}`;
}
/** Agrupa repeticiones: [A,B,A,B,A,B] → 3× (A + B). */
/** Escalera de rampa (6+ escalones iguales que suben lo mismo) en una línea. */
function rampLine(intervals, i, ftp) {
  let j = i + 1;
  const d = intervals[i + 1] ? intervals[i + 1].power_pct - intervals[i].power_pct : 0;
  while (j < intervals.length && intervals[j].type === intervals[i].type && intervals[j].duration_s === intervals[i].duration_s && Math.abs(intervals[j].power_pct - intervals[j - 1].power_pct - d) <= 1.5 && d > 0) j++;
  if (j - i < 6) return null;
  const a = intervals[i], b = intervals[j - 1];
  const step = (b.power_pct - a.power_pct) / (j - i - 1);
  const w = (pct) => (ftp ? ` (${Math.round((ftp * pct) / 100)} W)` : '');
  return { next: j, text: `Rampa: escalones de ${fmtMin(a.duration_s)} subiendo ~${Math.round(step * 10) / 10}% cada uno, de ${a.power_pct}%${w(a.power_pct)} hasta ${b.power_pct}%${w(b.power_pct)} o hasta no poder más (${j - i} escalones como máximo)` };
}
function structure(intervals, ftp) {
  const key = (iv) => `${iv.type}|${iv.duration_s}|${iv.power_pct}|${iv.ramp_to_pct ?? ''}|${iv.cadence_min ?? ''}|${iv.cadence_max ?? ''}`;
  const out = [];
  let i = 0;
  while (i < intervals.length) {
    const ramp = rampLine(intervals, i, ftp);
    if (ramp) {
      out.push(ramp.text);
      i = ramp.next;
      continue;
    }
    let best = { len: 1, reps: 1 };
    for (let len = 1; len <= 3; len++) {
      let reps = 1;
      while (i + (reps + 1) * len <= intervals.length && intervals.slice(i, i + len).every((x, k) => key(x) === key(intervals[i + reps * len + k]))) reps++;
      if (reps > 1 && reps * len > best.reps * best.len) best = { len, reps };
    }
    const group = intervals.slice(i, i + best.len);
    const label = group.length === 1 ? (group[0].type === 'free' ? stepText(group[0], ftp) : `${TYPE[group[0].type] ?? group[0].type} ${stepText(group[0], ftp)}`) : group.map((g) => stepText(g, ftp)).join(' + ');
    out.push(best.reps > 1 ? `${best.reps}× (${label})` : label);
    i += best.len * best.reps;
  }
  return out;
}
const minutesOf = (w) => Math.round((w.intervals ?? []).reduce((s, x) => s + x.duration_s, 0) / 60);
function tssOf(w) {
  let t = 0;
  for (const iv of w.intervals ?? []) {
    const a = (iv.power_pct ?? 0) / 100;
    const b = (iv.ramp_to_pct ?? iv.power_pct ?? 0) / 100;
    const ifac = iv.type === 'free' ? 0.65 : (a + b) / 2;
    t += (iv.duration_s / 3600) * ifac * ifac * 100;
  }
  return Math.round(t);
}

function fichaMd(p, ctx) {
  const i = p.intake;
  const ftp = p.ftp ? `${p.ftp.watts} W — ${FTPSRC[p.ftp.source] ?? p.ftp.source}, hace ${p.ftp.ageDays} días (${Math.round((p.ftp.watts / p.weight) * 10) / 10} W/kg)` : 'No lo sabe';
  const acts = p.otherActivities.length ? p.otherActivities.map((a) => `${ACT[a.kind] ?? a.kind} ${a.perWeek}×/sem de ${a.minutes} min${a.days.length ? ` (${a.days.map((d) => DIAS[d]).join(', ')})` : ''}`).join('; ') : 'Ninguna';
  const cond = i.conditions.length ? i.conditions.map((c) => COND[c]).join(', ') : 'Ninguna';
  const av = p.availability;
  return [
    '| | |',
    '|---|---|',
    `| **Edad · sexo · peso** | ${p.age} años · ${p.sex === 'F' ? 'mujer' : p.sex === 'M' ? 'hombre' : 'otro'} · ${p.weight} kg |`,
    `| **Disciplina** | ${DISCIPLINE[p.discipline]}${p.competes ? ` · compite (${p.category})` : ' · no compite'} |`,
    `| **Experiencia** | ${EXPERIENCE[p.experienceLevel]} · ${FITNESS[p.generalFitnessLevel]} · ${p.yearsRiding} años rodando · ${p.structuredTrainingYears} con plan estructurado |`,
    `| **FTP** | ${ftp} |`,
    `| **FC máxima** | ${p.hrMax ? `${p.hrMax} lpm (medida)` : 'No la sabe'} · reposo: ${i.restingHr ? `${i.restingHr} lpm` : 'no sabe'} |`,
    `| **Últimas 4 semanas** | ${RECENT[i.recentTraining]}${i.recentHoursPerWeek != null ? `, ~${i.recentHoursPerWeek} h/sem` : ''} |`,
    ...(i.recentTrainingNote ? [`| **Su semana típica (textual)** | «${i.recentTrainingNote}» |`] : []),
    `| **Salud** | Condiciones: ${cond}${i.takesMedication ? ` · medicamento: ${i.medicationNote}` : ''} · lesión reciente: ${i.recentInjury ? 'sí' : 'no'}${p.injuries ? ` · molestias: ${p.injuries}` : ''} |`,
    `| **Hábitos** | Duerme ${i.sleepHours} h (calidad ${SLEEPQ[i.sleepQuality]}) · estrés ${LVL[i.stress]} · fuma: ${SMOKE[i.smoking]} · alcohol: ${ALC[i.alcohol]} |`,
    `| **Esfuerzo** | ¿Sabe usar RPE?: ${RPE[i.rpeLiteracy]} · ¿ha hecho esfuerzos máximos?: ${i.maxEffortExperience ? 'sí' : 'no'} |`,
    `| **Otras actividades** | ${acts} |`,
    `| **Disponibilidad** | ${av.hoursPerWeek} h/sem · ${av.days.map((d) => DIAS[d]).join(', ')}${av.maxSessionMinutes ? ` · máx ${av.maxSessionMinutes} min por sesión` : ''} |`,
    `| **Su objetivo (textual)** | «${ctx.goal}» |`,
  ].join('\n');
}

function planMd(p, r) {
  if (r.status !== 200) return `> ❌ No se pudo crear el plan (HTTP ${r.status}): ${JSON.stringify(r.error).slice(0, 400)}`;
  // Watts solo con FTP medido: con uno provisional el coach trabaja por sensación.
  const ftp = p.ftp && p.ftp.source !== 'provisional' ? p.ftp.watts : null;
  const d = r.plan.data ?? {};
  const res = r.result ?? {};
  const byId = Object.fromEntries((r.workouts ?? []).map((w) => [w.id, w]));
  const L = [];
  L.push(`**Plan:** ${res.planName ?? r.plan.goal ?? '—'} · empieza el ${fmtLong(d.startDate)}`);
  if (d.blocks?.length) {
    L.push('', '**Estructura completa (bloques):**', '', '| Bloque | Semanas | h/sem | Enfoque |', '|---|---|---|---|');
    for (const b of d.blocks) L.push(`| ${b.name} | ${b.weeks} | ${b.targetHoursPerWeek ?? '—'} | ${b.focus} |`);
  }
  if (d.nextTest || res.nextTest) {
    const t = d.nextTest ?? res.nextTest;
    L.push('', `**Próximo test:** ${typeof t === 'object' ? [t.type, t.date ? fmtLong(t.date) : null, t.reason].filter(Boolean).join(' · ') : t}`);
  }
  if (res.suggestedFtp) L.push('', `**FTP que propone:** ${Math.round(res.suggestedFtp)} W`);
  if (res.coachNote) L.push('', '**Por qué, en palabras del coach IA** (su nota al atleta, textual):', '', `> ${res.coachNote.replace(/\n+/g, '\n> ')}`);
  for (const w of r.plan.weeks ?? []) {
    const ws = w.workoutIds.map((id) => byId[id]).filter(Boolean).sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
    const mins = ws.reduce((s, x) => s + minutesOf(x), 0);
    // Un test va hasta el fallo: su TSS «planeado» no dice nada y no se suma.
    const tss = ws.filter((x) => x.kind !== 'test').reduce((s, x) => s + tssOf(x), 0);
    L.push('', `#### Semana ${w.weekIndex + 1} · ${ws.length} sesiones de rodillo · ${Math.round(mins / 6) / 10} h · TSS ≈ ${tss}${ws.some((x) => x.kind === 'test') ? ' (sin contar el test)' : ''}`);
    for (const x of ws) {
      L.push('', `- **${dayName(x.scheduledDate)} ${shortDate(x.scheduledDate)} — ${x.name}** · ${minutesOf(x)} min · ${x.kind === 'test' ? '🧪 test hasta el fallo (la duración es el máximo posible)' : `TSS ≈ ${tssOf(x)}`}${x.erg === 'off' ? ' · por sensación (sin ERG)' : ''}`);
      for (const s of structure(x.intervals ?? [], ftp)) L.push(`  - ${s}`);
      if (x.description) L.push(`  - _${x.description.replace(/\s+/g, ' ').trim()}_`);
    }
    const wk = (r.extras ?? []).filter((e) => {
      const start = new Date(`${d.startDate}T12:00:00Z`);
      const monday = new Date(start); monday.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + w.weekIndex * 7);
      const end = new Date(monday); end.setUTCDate(monday.getUTCDate() + 6);
      const k = new Date(`${e.scheduled_date}T12:00:00Z`);
      return k >= monday && k <= end;
    });
    for (const e of wk) L.push(`- _Fuera del rodillo:_ **${dayName(e.scheduled_date)} ${shortDate(e.scheduled_date)} — ${e.name}** (${e.payload?.durationMin ?? '?'} min): ${e.payload?.description ?? ''}`);
  }
  return L.join('\n');
}

const EVAL = [
  '**Evaluación de Joe** (llenar):',
  '',
  '| Pregunta | Calificación (1–5) | Comentario |',
  '|---|---|---|',
  '| ¿El arranque es adecuado para esta persona (ni muy fuerte ni muy suave)? | | |',
  '| ¿Respeta su salud, lesiones y hábitos? | | |',
  '| ¿El volumen y los días cuadran con su disponibilidad y sus otras actividades? | | |',
  '| ¿Las sesiones (intensidades, duración, estructura) tienen sentido para su objetivo? | | |',
  '| ¿El test (o no hacer test) es la decisión correcta? | | |',
  '| ¿Lo que le explica el coach es claro y correcto? | | |',
  '| **¿Se lo darías tal cual a un atleta tuyo?** (sí / con cambios / no) | | |',
  '',
  '**¿Qué cambiarías?**',
  '',
  '&nbsp;',
].join('\n');

function report(results) {
  const date = fmtLong(todayKey());
  const L = [
    '# Planes del coach IA para que Joe los evalúe',
    `${date} · 10 personas con el cuestionario completo, como lo llena la app hoy. Cada plan lo creó el **coach IA real de producción** (\`coach-chat\`, modo crear plan) con la cuenta de pruebas. Es exactamente lo que vería una persona nueva en Torq, sin historial.`,
    '',
    '**Cómo leer cada sesión:** los porcentajes son del FTP (entre paréntesis, los watts si la persona tiene FTP). «3× (5\' @ 90% + 3\' @ 55%)» = 3 repeticiones de 5 min al 90% con 3 min al 55%. TSS ≈ estimado. El texto en cursiva es la descripción que ve el atleta.',
    '',
    '**Perfil de arranque:** antes de llamar a la IA, el código de Torq aplica tus reglas de la evaluación de salud y hábitos (`src/core/intake.ts`): si va primero el médico, si puede hacer un esfuerzo máximo, qué test toca y si arranca conservador. La IA está obligada a respetarlo. Va en cada perfil para que veas si la regla y el plan cuadran.',
    '',
    '**Qué es de quién:** el plan, las sesiones y la nota al atleta los escribió el coach IA (textual). Las secciones «Por qué tomó estas decisiones» y «Hallazgos» son un análisis aparte, hecho leyendo cada plan contra el perfil: la IA no entrega un razonamiento propio además de su nota.',
    '',
    `## Hallazgos y preguntas (análisis de la corrida del ${CORRIDA})`,
    '',
    GENERAL,
    '',
    '## Resumen',
    '',
    '| # | Persona | Objetivo | Arranque (reglas de Torq) | Plan | Semana 1 |',
    '|---|---|---|---|---|---|',
  ];
  const bodies = [];
  for (const p of PERFILES) {
    const r = results[p.id];
    if (!r) continue;
    const s = r.startingPreview;
    const w1 = r.status === 200 ? (() => {
      const byId = Object.fromEntries((r.workouts ?? []).map((w) => [w.id, w]));
      const ws = (r.plan.weeks?.[0]?.workoutIds ?? []).map((id) => byId[id]).filter(Boolean);
      return `${ws.length} sesiones · ${Math.round(ws.reduce((a, x) => a + minutesOf(x), 0) / 6) / 10} h`;
    })() : '❌ error';
    L.push(`| ${p.id.slice(1)} | [${p.name}](#${p.id}) | ${p.resumen} | ${s ? startingSummary(s) : '—'} | ${r.plan?.goal ?? (r.status === 200 ? '—' : '❌')} | ${w1} |`);
    bodies.push(
      `<a id="${p.id}"></a>`,
      `## ${p.id.slice(1)}. ${p.name} — ${p.resumen}`,
      '',
      '### Perfil',
      '',
      fichaMd(p, r.context),
      '',
      s ? `**Perfil de arranque (reglas de Torq):** ${startingSummary(s, true)}` : '',
      '',
      '### Lo que armó el coach IA',
      '',
      planMd(p, r),
      '',
      ...(POR_PERFIL[p.id] && r.status === 200
        ? [
            '### Por qué tomó estas decisiones (análisis, no texto de la IA)',
            '',
            ...POR_PERFIL[p.id].porque.map((x) => `- ${x}`),
            '',
            ...(POR_PERFIL[p.id].cambio ? [`**Qué cambió desde la corrida 1:** ${POR_PERFIL[p.id].cambio}`, ''] : []),
            '**Para revisar:**',
            '',
            ...POR_PERFIL[p.id].revisar.map((x) => `- ${x}`),
            '',
          ]
        : []),
      EVAL,
      '',
      '---',
      '',
    );
  }
  L.push('', '---', '', ...bodies);
  L.push(
    '## Cómo se generó',
    '',
    '- Perfiles: `scripts/coach-sim/perfiles-data.mjs` (cuestionario completo: salud y hábitos, otras actividades, FTP medido / provisional / sin dato).',
    '- Corrida: `node scripts/coach-sim/perfiles.mjs` contra producción con la cuenta de pruebas. Todo lo que contestó la IA (contexto enviado, respuesta, plan y cada sesión con sus intervalos) está en `docs/evaluaciones/planes-ia-para-joe-datos/` (corrida 2) y `…-datos/v1/` (corrida 1, antes de los cambios de #54).',
    '- Análisis: `scripts/coach-sim/perfiles-analisis.mjs`.',
    '- Validación sin IA: `perfiles-check.ts` (mismo schema del servidor y perfil de arranque).',
  );
  return L.join('\n');
}

function startingSummary(s, long = false) {
  const bits = [];
  if (s.healthFirst) bits.push(long ? 'primero su médico (condición o medicamento)' : 'médico primero');
  bits.push(s.testPlan === 'none' ? (long ? 'sin test: por sensación, subiendo de a poco' : 'sin test') : s.testPlan === 'ramp' ? 'test de rampa' : 'test de 20 min');
  if (s.start === 'conservative') bits.push('arranque conservador');
  if (s.baseFirst) bits.push(long ? 'base aeróbica antes de intensidad (tabaco/alcohol)' : 'base primero');
  if (s.intensityLimit) bits.push(`sin alta intensidad${long ? ` (${s.intensityLimitReasons.join(', ')})` : ''}`);
  if (s.metabolicFirst) bits.push(long ? 'primero el metabolismo (fondo y tempo constantes)' : 'metabólico primero');
  if (s.inSeason) bits.push(long ? 'viene entrenando con intensidad: no arranca desde cero' : 'en temporada');
  if (s.teachRpe && long) bits.push('enseñarle a usar RPE');
  if (long && s.notReadyReasons?.length) bits.push(`no hace máximos porque: ${s.notReadyReasons.join('; ')}`);
  if (long) bits.push(`estrés ajustado: ${LVL[s.stressAdjusted]}`);
  return bits.join(' · ');
}

async function main() {
  const results = {};
  for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) if (/^p\d\d\.json$/.test(f)) results[f.slice(0, 3)] = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (!onlyReport) {
    ({ DUMMY_ID, activePlan, fn, rest, workoutsByIds } = await import('./lib.mjs'));
    const [original] = await rest('GET', `profiles?user_id=eq.${DUMMY_ID}&select=*`);
    save(DIR, 'perfil-original-dummy.json', original);
    try {
      for (const p of chosen) {
        try {
          results[p.id] = await runOne(p);
        } catch (e) {
          log(`  ERROR ${e.message}`);
          results[p.id] = { perfil: p.id, status: 0, error: { message: e.message }, context: createContext(p) };
        }
      }
    } finally {
      await cleanDummy().catch((e) => log(`limpieza: ${e.message}`));
      const { user_id: _u, ...restore } = original ?? {};
      if (original) await rest('PATCH', `profiles?user_id=eq.${DUMMY_ID}`, restore);
      log('cuenta dummy: plan dado de baja y perfil original restaurado');
    }
  }
  // El perfil de arranque lo calcula el servidor con core.gen.js (mismas reglas que src/core/intake.ts).
  const { startingProfile } = await import('../../supabase/functions/_shared/core.gen.js');
  for (const p of PERFILES) if (results[p.id]) results[p.id].startingPreview = startingProfile({ intake: p.intake, ageYears: p.age, experienceLevel: p.experienceLevel, generalFitnessLevel: p.generalFitnessLevel, structuredTrainingYears: p.structuredTrainingYears });
  fs.writeFileSync(REPORT, report(results));
  log(`reporte: ${path.relative(process.cwd(), REPORT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
