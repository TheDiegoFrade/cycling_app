// Revisa la respuesta de un escenario contra reglas duras de coach — lo que
// se puede comprobar con código, sin gastar una llamada. El criterio fino
// (¿es un buen plan?) va aparte, con rubric.md.
//
//   npm run coach:check -- 07-eval-fatiga              (lee results/07-eval-fatiga.json)
//   npm run coach:check -- 07-eval-fatiga otra.json
//   npm run coach:check                                (todos los que tengan resultado)
//
// ❌ = rompe una regla del prompt o del sistema · ⚠️ = sospechoso, revisar a mano.
import { schemaForMode, type Mode } from '../supabase/functions/coach-chat/schemas.ts';

const here = new URL('.', import.meta.url);
type Level = 'ok' | 'warn' | 'fail';
interface Finding { level: Level; msg: string }
interface Step { duration_s: number; power_pct: number; ramp_to_pct?: number }
interface Segment { repeat: number; steps: Step[] }

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_OFFSET: Record<string, number> = Object.fromEntries(DAYS.map((d, i) => [d, i]));

// Misma cuenta que dateForWeek/mondayOf en coach-chat/index.ts.
function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setUTCDate(m.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return m;
}
function dateForWeek(startDate: string, weekIndex: number, day: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const base = mondayOf(start);
  base.setUTCDate(base.getUTCDate() + weekIndex * 7 + (DAY_OFFSET[day] ?? 0));
  if (base < start) base.setUTCDate(base.getUTCDate() + 7);
  return base.toISOString().slice(0, 10);
}

const flat = (segments: Segment[]) => segments.flatMap((s) => Array.from({ length: s.repeat }, () => s.steps).flat());
const minutesOf = (steps: Step[]) => Math.round(steps.reduce((s, x) => s + x.duration_s, 0) / 60);
/** Duro = ≥8 min acumulados a ≥88 % FTP o ≥3 min a ≥105 %. */
function isHard(steps: Step[]): boolean {
  const at = (pct: number) => steps.filter((s) => Math.max(s.power_pct, s.ramp_to_pct ?? 0) >= pct).reduce((t, s) => t + s.duration_s, 0);
  return at(88) >= 480 || at(105) >= 180;
}
const maxPct = (steps: Step[]) => Math.max(0, ...steps.map((s) => Math.max(s.power_pct, s.ramp_to_pct ?? 0)));
/** Workout de test o de ajuste (rampa, 20 min, escalera): no cuenta como
 * sesión dura ni como intensidad de más, por diseño llega alto. */
const TEST_RE = /test|rampa|ramp|escalera/i;
// deno-lint-ignore no-explicit-any
const isTest = (w: any) => TEST_RE.test(`${w.name ?? ''} ${w.intent ?? ''}`);

function parseOutput(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return JSON.parse(body.slice(start, end + 1));
}

// deno-lint-ignore no-explicit-any
type Any = any;

function checkPlannedWeeks(f: Finding[], weeks: { workouts: Any[] }[], opts: { cap: number; startDate?: string; days?: string[]; occupied?: Set<string>; hoursPerWeek?: number }) {
  weeks.forEach((week, wi) => {
    const seen = new Set<string>();
    let weekMin = 0;
    const hardDates: string[] = [];
    for (const w of week.workouts) {
      const steps = flat(w.segments);
      const min = minutesOf(steps);
      weekMin += min;
      const tag = `S${wi + 1} ${w.dayOfWeek} «${w.name}»`;
      if (min > opts.cap) f.push({ level: 'fail', msg: `${tag}: ${min} min, pasa el tope de ${opts.cap}` });
      if (seen.has(w.dayOfWeek)) f.push({ level: 'fail', msg: `${tag}: dos entrenamientos el mismo día` });
      seen.add(w.dayOfWeek);
      if (opts.days && !opts.days.includes(w.dayOfWeek)) f.push({ level: 'fail', msg: `${tag}: día no disponible (${opts.days.join(', ')})` });
      if (opts.startDate) {
        const date = dateForWeek(opts.startDate, wi, w.dayOfWeek);
        if (opts.occupied?.has(date)) f.push({ level: 'fail', msg: `${tag}: cae en ${date}, que ya está ocupado` });
        if (!isTest(w) && isHard(steps)) hardDates.push(date);
      }
    }
    if (opts.hoursPerWeek && weekMin > opts.hoursPerWeek * 60 * 1.1) {
      f.push({ level: 'warn', msg: `S${wi + 1}: ${(weekMin / 60).toFixed(1)} h, más que las ${opts.hoursPerWeek} h disponibles` });
    }
    hardDates.sort();
    for (let i = 1; i < hardDates.length; i++) {
      const gap = (Date.parse(hardDates[i]) - Date.parse(hardDates[i - 1])) / 86400000;
      if (gap <= 1) f.push({ level: 'warn', msg: `S${wi + 1}: días duros seguidos (${hardDates[i - 1]} y ${hardDates[i]})` });
    }
  });
}

function checkCreatePlan(ctx: Any, out: Any): Finding[] {
  const f: Finding[] = [];
  const cap = ctx.availability.maxSessionMinutes ?? 90;
  const weeks = out.firstBlockWeeks as { workouts: Any[] }[];
  if (weeks.length > out.blocks[0].weeks) f.push({ level: 'fail', msg: `concretó ${weeks.length} semanas pero el bloque 1 dura ${out.blocks[0].weeks}` });
  checkPlannedWeeks(f, weeks, { cap, startDate: ctx.startDate, days: ctx.availability.days, occupied: new Set(ctx.occupiedDates), hoursPerWeek: ctx.availability.hoursPerWeek });

  const week0 = weeks[0]?.workouts ?? [];
  const tsb = ctx.recentHistory?.tsb;
  if (tsb !== undefined && tsb <= -25) {
    for (const w of week0) if (!isTest(w) && isHard(flat(w.segments))) f.push({ level: 'fail', msg: `TSB ${tsb} y aun así S1 trae «${w.name}» duro` });
  }
  const novice = ctx.experienceLevel === 'new_to_cycling' || ctx.generalFitnessLevel === 'sedentary';
  if (novice) {
    for (const [wi, week] of weeks.entries()) for (const w of week.workouts) {
      if (!isTest(w) && maxPct(flat(w.segments)) > 105) f.push({ level: 'warn', msg: `S${wi + 1} «${w.name}»: >105 % FTP para alguien nuevo/sedentario` });
    }
  }
  if (ctx.profile.ftp === null) {
    // Sin FTP medido el %FTP sale de un provisional: nada que no sea test
    // llega a umbral (95 %) hasta que haya un número de verdad.
    for (const [wi, week] of weeks.entries()) for (const w of week.workouts) {
      if (isTest(w)) continue;
      const top = maxPct(flat(w.segments));
      if (top >= 95) f.push({ level: 'fail', msg: `S${wi + 1} «${w.name}»: llega a ${top} % FTP sin FTP medido` });
    }
    if (!/\d+\s*(W|watts?|vatios)\b/i.test(out.coachNote)) f.push({ level: 'warn', msg: 'sin FTP y coachNote no trae un número en watts (FTP provisional)' });
    const hasTest = weeks.flatMap((w) => w.workouts).some((w) => /test|ftp|rampa|ramp/i.test(`${w.name} ${w.intent}`));
    if (!hasTest && !novice) f.push({ level: 'warn', msg: 'sin FTP y no aparece ningún test en las semanas concretadas' });
  }
  const tss = weeks.map((w) => w.workouts.reduce((s: number, x: Any) => s + x.targetTSS, 0));
  for (let i = 1; i < tss.length; i++) {
    if (tss[i] > tss[i - 1] * 1.2) f.push({ level: 'warn', msg: `TSS sube ${Math.round((tss[i] / tss[i - 1] - 1) * 100)} % de S${i} a S${i + 1} (${tss[i - 1]} → ${tss[i]})` });
  }
  f.push({ level: 'ok', msg: `TSS por semana: ${tss.join(' → ')} · bloques: ${out.blocks.map((b: Any) => `${b.name} (${b.weeks})`).join(', ')}` });
  return f;
}

function checkWeeklyEval(ctx: Any, out: Any): Finding[] {
  const f: Finding[] = [];
  const tsb = ctx.pmcTrend.tsb;
  const wk = ctx.weekJustFinished;
  const tired = tsb <= -30 || (wk.missedWorkouts >= 2 && /cansad|reventad|agotad|dorm|enferm/i.test(wk.athleteNote ?? ''));
  if (tired && out.decision === 'progress') f.push({ level: 'fail', msg: `decision=progress con TSB ${tsb} / fatiga reportada` });
  if (tired && out.decision === 'maintain') f.push({ level: 'warn', msg: `decision=maintain con TSB ${tsb} / fatiga reportada` });
  const adherence = wk.plannedTSS ? wk.actualTSS / wk.plannedTSS : 1;
  if (!tired && tsb > -15 && adherence >= 0.9 && ['reduce', 'insert_recovery'].includes(out.decision)) {
    f.push({ level: 'warn', msg: `decision=${out.decision} con TSB ${tsb} y ${Math.round(adherence * 100)} % de cumplimiento` });
  }
  if (tsb <= -25) {
    for (const w of out.nextWeekWorkouts) if (!isTest(w) && isHard(flat(w.segments))) f.push({ level: 'fail', msg: `TSB ${tsb} y la semana siguiente trae «${w.name}» duro` });
  }
  checkPlannedWeeks(f, [{ workouts: out.nextWeekWorkouts }], { cap: ctx.maxSessionMinutes ?? 90 });
  const tss = out.nextWeekWorkouts.reduce((s: number, x: Any) => s + x.targetTSS, 0);
  f.push({ level: 'ok', msg: `decision=${out.decision} · TSS siguiente semana ${tss} (la que terminó: ${wk.actualTSS} real / ${wk.plannedTSS} plan)` });
  return f;
}

function checkCoachWeek(ctx: Any, out: Any): Finding[] {
  const f: Finding[] = [];
  const lib = new Map<string, Any>((ctx.library ?? []).map((t: Any) => [t.id, t]));
  const cap = ctx.maxSessionMinutes ?? 90;
  const tired = ctx.pmc?.tsb <= -20 || /cansad|fatig|absorb|descans|reventad/i.test(ctx.instruction);
  const lockedBike = new Set(ctx.lockedItems.filter((l: Any) => l.kind === 'bike').map((l: Any) => l.dayOfWeek));
  const legDays = ctx.lockedItems.filter((l: Any) => l.kind === 'strength').map((l: Any) => DAY_OFFSET[l.dayOfWeek]);
  const seen = new Set<string>();
  for (const w of out.workouts) {
    const tag = `${w.dayOfWeek} «${w.name}»`;
    const t = w.fromLibraryId ? lib.get(w.fromLibraryId) : undefined;
    if (w.fromLibraryId && !t) f.push({ level: 'fail', msg: `${tag}: fromLibraryId «${w.fromLibraryId}» no existe en la biblioteca` });
    if (w.libraryChange && w.intervals.length === 0) f.push({ level: 'warn', msg: `${tag}: dice que ajustó la plantilla pero no trae intervals (se copiará sin el ajuste)` });
    const exactCopy = t && !w.libraryChange;
    const min = exactCopy ? t.minutes : minutesOf(w.intervals);
    // Plantilla copiada tal cual: dura si su IF estimado (de TSS y minutos) ≥ 0.8.
    const hard = isTest(w) ? false : exactCopy ? t.tss !== null && Math.sqrt(t.tss / ((t.minutes / 60) * 100)) >= 0.8 : isHard(w.intervals);
    if (!ctx.openDays.includes(w.dayOfWeek)) f.push({ level: 'fail', msg: `${tag}: día no abierto (${ctx.openDays.join(', ')})` });
    if (seen.has(w.dayOfWeek)) f.push({ level: 'fail', msg: `${tag}: dos entrenamientos de bici el mismo día` });
    seen.add(w.dayOfWeek);
    if (lockedBike.has(w.dayOfWeek)) f.push({ level: 'fail', msg: `${tag}: ya hay bici bloqueada ese día` });
    if (min > cap) f.push({ level: 'fail', msg: `${tag}: ${min} min, pasa el tope de ${cap}` });
    if (hard && tired) f.push({ level: 'fail', msg: `${tag}: sesión dura con atleta cansado (TSB ${ctx.pmc?.tsb})` });
    if (hard && legDays.some((d: number) => Math.abs(d - DAY_OFFSET[w.dayOfWeek]) <= 1)) f.push({ level: 'fail', msg: `${tag}: sesión dura el día antes, el día o el día después de fuerza de pierna` });
  }
  // "310 TSB": la carga de una semana se escribe en TSS. Un TSB real casi
  // nunca pasa de ±50, así que un número mayor pegado a "TSB" es confusión.
  for (const r of out.rationale as string[]) {
    for (const m of r.matchAll(/(?:TSB\D{0,4}?(-?\d+(?:[.,]\d+)?))|(?:(-?\d+(?:[.,]\d+)?)\s*(?:de\s+)?TSB)/gi)) {
      const n = Math.abs(parseFloat((m[1] ?? m[2]).replace(',', '.')));
      if (n > 50) f.push({ level: 'fail', msg: `rationale habla de "${m[0].trim()}": eso es TSS, no TSB` });
    }
  }
  if (out.rationale.length < 2 || out.rationale.length > 5) f.push({ level: 'warn', msg: `rationale con ${out.rationale.length} razones (se piden 2-5)` });
  const fromLib = out.workouts.filter((w: Any) => w.fromLibraryId && lib.has(w.fromLibraryId)).length;
  f.push({ level: 'ok', msg: `${out.workouts.length} entrenamientos, ${fromLib} de la biblioteca` });
  return f;
}

function checkPublishBlock(ctx: Any, out: Any): Finding[] {
  const f: Finding[] = [];
  const cap = ctx.maxSessionMinutes ?? 90;
  checkPlannedWeeks(f, out.weeks, { cap });
  // Sin fecha de inicio en el context: días duros seguidos por día de la semana.
  out.weeks.forEach((week: Any, wi: number) => {
    const hard = week.workouts.filter((w: Any) => !isTest(w) && isHard(flat(w.segments))).map((w: Any) => DAY_OFFSET[w.dayOfWeek]).sort((a: number, b: number) => a - b);
    for (let i = 1; i < hard.length; i++) {
      if (hard[i] - hard[i - 1] <= 1) f.push({ level: 'warn', msg: `S${wi + 1}: días duros seguidos (${DAYS[hard[i - 1]]} y ${DAYS[hard[i]]})` });
    }
  });
  const tss = out.weeks.map((w: Any) => w.workouts.reduce((s: number, x: Any) => s + x.targetTSS, 0));
  f.push({ level: 'ok', msg: `«${out.blockName}» · TSS por semana: ${tss.join(' → ')}` });
  return f;
}

const CHECKERS: Partial<Record<Mode, (ctx: Any, out: Any) => Finding[]>> = {
  create_plan: checkCreatePlan,
  weekly_eval: checkWeeklyEval,
  coach_week: checkCoachWeek,
  publish_block: checkPublishBlock,
};

async function run(id: string, resultPath?: string): Promise<boolean> {
  const scenario = JSON.parse(await Deno.readTextFile(new URL(`scenarios/${id}.json`, here)));
  const path = resultPath ?? new URL(`results/${id}.json`, here).pathname;
  const mode = scenario.mode as Mode;
  console.log(`\n── ${id} (${mode}) — ${scenario.title}`);
  let out: unknown;
  try {
    out = parseOutput(await Deno.readTextFile(path));
  } catch (e) {
    console.log(`  ❌ no se pudo leer JSON de ${path}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
  const parsed = schemaForMode(mode).safeParse(out);
  if (!parsed.success) {
    console.log('  ❌ no cumple el schema de salida (en producción sería un 502):');
    for (const i of parsed.error.issues.slice(0, 8)) console.log(`     ${i.path.join('.')}: ${i.message}`);
    return false;
  }
  const findings = CHECKERS[mode]?.(scenario.context, parsed.data) ?? [];
  const icon = { ok: 'ℹ️ ', warn: '⚠️ ', fail: '❌' } as const;
  for (const x of findings) console.log(`  ${icon[x.level]} ${x.msg}`);
  const fails = findings.filter((x) => x.level === 'fail').length;
  const warns = findings.filter((x) => x.level === 'warn').length;
  console.log(fails ? `  → ${fails} fallas, ${warns} avisos` : warns ? `  → sin fallas, ${warns} avisos` : '  → ✅ pasa todas las reglas');
  console.log('  Revisa también a mano lo que espera un buen coach:');
  for (const e of scenario.expect) console.log(`     • ${e}`);
  return fails === 0;
}

const [id, file] = Deno.args;
if (id) {
  Deno.exit((await run(id, file)) ? 0 : 1);
}
let allOk = true;
let any = false;
for (const f of [...Deno.readDirSync(new URL('results/', here))].map((e) => e.name).filter((n) => n.endsWith('.json')).sort()) {
  any = true;
  allOk = (await run(f.replace(/\.json$/, ''))) && allOk;
}
if (!any) console.log('No hay respuestas en coach-lab/results/ todavía (guarda ahí <escenario>.json).');
Deno.exit(allOk ? 0 : 1);
