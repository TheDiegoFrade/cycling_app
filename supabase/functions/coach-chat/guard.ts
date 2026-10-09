// Guardia de la salida del coach: las reglas duras que se pueden comprobar
// con código. La usan producción (index.ts, antes de guardar nada) y el
// laboratorio (coach-lab/check.ts), así lo que el laboratorio marca como
// error es exactamente lo que producción no deja pasar.
//
//  - repairOutput: lo mecánico se arregla con código, sin gastar otra
//    llamada (tope de minutos, días repetidos/no disponibles/ocupados,
//    semanas de más, intensidad de umbral sin FTP medido, TSS calculado de
//    la estructura, suggestedFtp que falta cuando el texto sí da el número).
//  - reviewOutput: lo que queda. 'fail' = rompe una regla del prompt (en
//    producción se le pide al coach que lo corrija, una vez); 'warn' =
//    sospechoso, solo se registra; 'ok' = resumen informativo.
// Lógica pura.
import { estimateTss, fitToCap, isTestWorkout } from './expand.ts';
import type { PlannedWorkout } from './expand.ts';
import type { Mode } from './schemas.ts';

export type Level = 'ok' | 'warn' | 'fail';
export interface Finding {
  level: Level;
  msg: string;
}

// deno-lint-ignore no-explicit-any
type Any = any;
interface Step {
  duration_s: number;
  power_pct: number;
  ramp_to_pct?: number;
}
interface Segment {
  repeat: number;
  steps: Step[];
}

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_OFFSET: Record<string, number> = Object.fromEntries(DAYS.map((d, i) => [d, i]));
const DEFAULT_CAP_MIN = 90;
/** Sin FTP medido, lo más alto que puede pedir algo que no sea test. */
const NO_FTP_MAX_PCT = 90;
/** Semana de absorción: nada por encima de esto (prompt.ts, "Fatiga"). */
const ABSORPTION_MAX_PCT = 75;

// Misma cuenta que dateForWeek/mondayOf en index.ts.
function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setUTCDate(m.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return m;
}
export function dateForWeek(startDate: string, weekIndex: number, day: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const base = mondayOf(start);
  base.setUTCDate(base.getUTCDate() + weekIndex * 7 + (DAY_OFFSET[day] ?? 0));
  if (base < start) base.setUTCDate(base.getUTCDate() + 7);
  return base.toISOString().slice(0, 10);
}

/** Semanas concretas que create_plan puede guardar de una vez (el resto lo
 * arma weekly_eval). El schema ya no lo limita: un modelo que devolvía 4
 * tronaba la validación con un 400 en inglés; aquí se recorta. */
export const MAX_CONCRETE_WEEKS = 3;

/** Primer día de plan con al menos un día usable en su semana 0. Si ya no
 * queda ningún día disponible y libre entre `startDate` y el domingo (p. ej.
 * crear el plan un viernes con días mar/mié/jue), el plan arranca el lunes
 * siguiente: si no, la semana 0 quedaba vacía y la guarda rechazaba el plan. */
export function usableStartDate(startDate: string, days: readonly string[] | undefined, occupied: ReadonlySet<string>): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const offset = (start.getUTCDay() + 6) % 7;
  for (let i = offset; i < 7; i++) {
    const day = DAYS[i];
    if (days?.length && !days.includes(day)) continue;
    if (!occupied.has(dateForWeek(startDate, 0, day))) return startDate;
  }
  const next = mondayOf(start);
  next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString().slice(0, 10);
}

const flat = (segments: Segment[]) => segments.flatMap((s) => Array.from({ length: s.repeat }, () => s.steps).flat());
const minutesOf = (steps: Step[]) => Math.round(steps.reduce((s, x) => s + x.duration_s, 0) / 60);
/** Duro = ≥8 min acumulados a ≥88 % FTP o ≥3 min a ≥105 %. */
function isHard(steps: Step[]): boolean {
  const at = (pct: number) => steps.filter((s) => Math.max(s.power_pct, s.ramp_to_pct ?? 0) >= pct).reduce((t, s) => t + s.duration_s, 0);
  return at(88) >= 480 || at(105) >= 180;
}
const maxPct = (steps: Step[]) => Math.max(0, ...steps.map((s) => Math.max(s.power_pct, s.ramp_to_pct ?? 0)));
const isTest = (w: Any) => isTestWorkout(w);
const EASY_NAME_RE = /fondo|suave|recuperaci|tranquil|conversacional|regenera|\bz2\b/i;
/** Un nombre que ya avisa del trabajo duro ("Fondo largo con sweet spot") no engaña. */
const HARD_NAME_RE = /sweet ?spot|umbral|tempo|vo2|interval|serie|over|under|sprint|bloque|calidad|cambios de ritmo|test|rampa|40:20|30\/30/i;
const misleadingName = (name: string, steps: Step[]) => isHard(steps) && EASY_NAME_RE.test(name) && !HARD_NAME_RE.test(name);

// ─── Dónde viven las semanas de cada modo ──────────────────────────────────

/** Semanas planeadas de la salida (las mismas referencias: mutarlas muta `out`). */
function weeksOf(mode: Mode, out: Any): { workouts: Any[] }[] {
  if (mode === 'create_plan') return out.firstBlockWeeks;
  if (mode === 'weekly_eval') return [{ workouts: out.nextWeekWorkouts }];
  if (mode === 'publish_block') return out.weeks;
  return [];
}

function setWeeks(mode: Mode, out: Any, weeks: { workouts: Any[] }[]): void {
  if (mode === 'create_plan') out.firstBlockWeeks = weeks;
  else if (mode === 'weekly_eval') out.nextWeekWorkouts = weeks[0].workouts;
  else if (mode === 'publish_block') out.weeks = weeks;
}

interface WeekOpts {
  cap: number;
  /** Fecha de la semana 0 (create_plan: startDate; los demás: el lunes que se genera). */
  startDate?: string;
  days?: string[];
  occupied: Set<string>;
  hoursPerWeek?: number;
  /** Hoy (YYYY-MM-DD): lo anterior ya pasó y no se agenda. */
  today?: string;
  minor?: boolean;
}

function weekOpts(mode: Mode, ctx: Any): WeekOpts {
  if (mode === 'create_plan') {
    return {
      cap: ctx.availability?.maxSessionMinutes ?? DEFAULT_CAP_MIN,
      startDate: ctx.startDate,
      days: ctx.availability?.days?.length ? ctx.availability.days : undefined,
      occupied: new Set(ctx.occupiedDates ?? []),
      hoursPerWeek: ctx.availability?.hoursPerWeek,
      today: ctx.today,
      minor: isMinor(ctx),
    };
  }
  return {
    cap: ctx.maxSessionMinutes ?? DEFAULT_CAP_MIN,
    startDate: ctx.nextWeekStart,
    days: ctx.plan?.days?.length ? ctx.plan.days : undefined,
    occupied: new Set(ctx.occupiedDates ?? []),
    today: ctx.today,
    minor: isMinor(ctx),
  };
}

/** ¿Se puede poner algo ese día? (disponible, no ocupado, no en el pasado). */
function dayUsable(day: string, wi: number, o: WeekOpts): boolean {
  if (o.days && !o.days.includes(day)) return false;
  if (!o.startDate) return true;
  // dateForWeek corre a la semana siguiente un día que ya pasó en la semana
  // 0: chocaría con la semana 1, así que en la práctica no está disponible.
  if (wi === 0 && DAY_OFFSET[day] < (new Date(`${o.startDate}T00:00:00Z`).getUTCDay() + 6) % 7) return false;
  const date = dateForWeek(o.startDate, wi, day);
  // Evaluar un jueves genera la semana que empezó el lunes: lun-mié ya pasaron.
  if (o.today && date < o.today) return false;
  return !o.occupied.has(date);
}

const ftpUnknown = (ctx: Any) => ctx.profile && ctx.profile.ftp === null;
const isMinor = (ctx: Any) => typeof ctx.profile?.ageYears === 'number' && ctx.profile.ageYears < 18;
/** Menores: rodillo entre semana de 60 min como máximo, 10 h por semana (prompt.ts, "Por edad"). */
const MINOR_WEEKDAY_CAP_MIN = 60;
const MINOR_MAX_WEEK_MIN = 600;
/** Al crear el plan la cadencia todavía no se conoce: nada de pedir 85+ rpm
 * a quien no entrena con estructura (prompt.ts, "Cadencia"). */
const START_MAX_CADENCE_MIN = 70;
const TIRED_RE = /cansad|agotad|reventad|muy pesad|se me hizo pesad|duermo mal|dormí mal|sin piernas|piernas cargad|fatiga/i;
/** Jerga interna que no debe llegar al atleta (el reasoning va al correo). */
const INTERNAL_RE = /weekIndex|\bnotesDue\b|en el contexto|no viene en el contexto|reglas del motor/i;
/** Siglas que el atleta no tiene por qué conocer (el reasoning va al correo). */
const ACRONYM_RE = /\b(TSS|TSB|CTL|ATL)\b/;
/** Objetivo sin meta de rendimiento: nada de tests (prompt.ts, "Fitness, salud o desestrés"). */
const NO_PERFORMANCE_RE = /sin meta de rendimiento|sin rendimiento|no busco rendimiento|desestr|solo por salud|por salud y ya/i;
const noPerformance = (ctx: Any) => NO_PERFORMANCE_RE.test(`${ctx.goal ?? ''} ${ctx.plan?.goal ?? ''}`);

function checkAbsorption(f: Finding[], workouts: Any[], why: string) {
  for (const w of workouts) {
    if (isTest(w)) continue;
    const top = maxPct(flat(w.segments));
    if (top > ABSORPTION_MAX_PCT) f.push({ level: 'fail', msg: `${why}: «${w.name}» llega a ${top} % y en absorción nada pasa de ${ABSORPTION_MAX_PCT} %` });
  }
}

function checkText(f: Finding[], field: string, text: unknown) {
  if (typeof text !== 'string' || text.trim().length < 40) f.push({ level: 'fail', msg: `${field} vacío o de una línea: el atleta se queda sin explicación` });
}

// ─── Arreglos mecánicos ────────────────────────────────────────────────────

/** Copia de `out` con lo mecánico arreglado, y qué se arregló. */
export function repairOutput(mode: Mode, ctx: Any, out: Any): { out: Any; fixes: string[] } {
  const fixed = structuredClone(out);
  const fixes: string[] = [];
  let weeks = weeksOf(mode, fixed);
  if (!weeks.length) return { out: fixed, fixes };
  const o = weekOpts(mode, ctx);

  // create_plan: nunca más semanas concretas de las que dura el bloque 1.
  if (mode === 'create_plan' && fixed.blocks?.[0] && weeks.length > fixed.blocks[0].weeks) {
    fixes.push(`se quitaron ${weeks.length - fixed.blocks[0].weeks} semanas concretadas de más (el bloque 1 dura ${fixed.blocks[0].weeks})`);
    weeks = weeks.slice(0, fixed.blocks[0].weeks);
  }
  // …ni más de MAX_CONCRETE_WEEKS de una vez.
  if (mode === 'create_plan' && weeks.length > MAX_CONCRETE_WEEKS) {
    fixes.push(`se quitaron ${weeks.length - MAX_CONCRETE_WEEKS} semanas concretadas de más (máximo ${MAX_CONCRETE_WEEKS} de una vez)`);
    weeks = weeks.slice(0, MAX_CONCRETE_WEEKS);
  }

  weeks = weeks.map((week, wi) => {
    const used = new Set<string>();
    const kept: Any[] = [];
    for (const raw of week.workouts) {
      let w: Any = raw;
      // Tope de minutos por sesión (menores: 60 entre semana).
      const cap = isMinor(ctx) && DAY_OFFSET[w.dayOfWeek] < 5 ? Math.min(o.cap, MINOR_WEEKDAY_CAP_MIN) : o.cap;
      const capped = fitToCap(w as PlannedWorkout, cap);
      if (capped.trimmedS > 0) fixes.push(`S${wi + 1} «${w.name}»: recortado ${Math.round(capped.trimmedS / 60)} min para caber en ${cap}`);
      w = capped.workout;
      // Al crear el plan, la cadencia de quien no entrena con estructura no se conoce todavía.
      if (mode === 'create_plan' && ctx.experienceLevel !== 'experienced' && !isTest(w)) {
        const tooHigh = w.segments.some((seg: Segment & { steps: Any[] }) => seg.steps.some((st: Any) => (st.cadence_min ?? 0) > START_MAX_CADENCE_MIN));
        if (tooHigh) {
          w = {
            ...w,
            segments: w.segments.map((seg: Segment & { steps: Any[] }) => ({
              ...seg,
              steps: seg.steps.map((st: Any) => {
                if ((st.cadence_min ?? 0) <= START_MAX_CADENCE_MIN) return st;
                const { cadence_max: _max, ...rest } = st;
                return { ...rest, cadence_min: START_MAX_CADENCE_MIN };
              }),
            })),
          };
          fixes.push(`S${wi + 1} «${w.name}»: cadencia mínima bajada a ${START_MAX_CADENCE_MIN} rpm (todavía no se conoce su cadencia)`);
        }
      }
      // Sin FTP medido, nada que no sea test llega a umbral.
      if (ftpUnknown(ctx) && !isTest(w) && maxPct(flat(w.segments)) >= 95) {
        const top = maxPct(flat(w.segments));
        w = {
          ...w,
          segments: w.segments.map((seg: Segment) => ({
            ...seg,
            steps: seg.steps.map((st) => ({
              ...st,
              power_pct: Math.min(st.power_pct, NO_FTP_MAX_PCT),
              ...(st.ramp_to_pct !== undefined ? { ramp_to_pct: Math.min(st.ramp_to_pct, NO_FTP_MAX_PCT) } : {}),
            })),
          })),
        };
        fixes.push(`S${wi + 1} «${w.name}»: bajado de ${top} % a ${NO_FTP_MAX_PCT} % (sin FTP medido)`);
      }
      // Nombre de sesión suave con trabajo duro: se le agrega qué trae (antes
      // era una falla que, si el reintento no la corregía, dejaba al atleta
      // sin semana: weekly_eval respondía 502).
      if (!isTest(w) && misleadingName(w.name, flat(w.segments))) {
        const top = maxPct(flat(w.segments));
        const label = top >= 106 ? 'VO2' : top >= 95 ? 'umbral' : 'sweet spot';
        fixes.push(`S${wi + 1} «${w.name}»: renombrado a «${w.name} con ${label}» (trae trabajo hasta ${top} %)`);
        w = { ...w, name: `${w.name} con ${label}` };
      }
      // TSS: el de la estructura, no el que estimó el modelo.
      const tss = estimateTss(w.segments);
      if (Math.abs(tss - w.targetTSS) > Math.max(10, tss * 0.2)) fixes.push(`S${wi + 1} «${w.name}»: TSS ${w.targetTSS} → ${tss} (calculado de la estructura)`);
      w = { ...w, targetTSS: tss };
      // Día repetido, no disponible u ocupado: al día libre más cercano.
      if (used.has(w.dayOfWeek) || !dayUsable(w.dayOfWeek, wi, o)) {
        const from = DAY_OFFSET[w.dayOfWeek];
        const free = DAYS.filter((d) => !used.has(d) && dayUsable(d, wi, o)).sort((a, b) => Math.abs(DAY_OFFSET[a] - from) - Math.abs(DAY_OFFSET[b] - from));
        if (!free.length) {
          fixes.push(`S${wi + 1} «${w.name}»: quitado, no quedaba un día libre esa semana`);
          continue;
        }
        fixes.push(`S${wi + 1} «${w.name}»: movido de ${w.dayOfWeek} a ${free[0]}`);
        w = { ...w, dayOfWeek: free[0] };
      }
      used.add(w.dayOfWeek);
      kept.push(w);
    }
    kept.sort((a, b) => DAY_OFFSET[a.dayOfWeek] - DAY_OFFSET[b.dayOfWeek]);
    return { ...week, workouts: kept };
  });
  setWeeks(mode, fixed, weeks);

  return { out: fixed, fixes };
}

// ─── Revisión ──────────────────────────────────────────────────────────────

function checkPlannedWeeks(f: Finding[], weeks: { workouts: Any[] }[], o: WeekOpts) {
  weeks.forEach((week, wi) => {
    const seen = new Set<string>();
    let weekMin = 0;
    const hardDays: number[] = [];
    // Vacía solo es falla si había algún día usable (si no —evaluar un sábado
    // con días lun/mié—, no había dónde poner nada esa semana).
    if (!week.workouts.length && DAYS.some((d) => dayUsable(d, wi, o))) f.push({ level: 'fail', msg: `S${wi + 1}: semana sin entrenamientos` });
    for (const w of week.workouts) {
      const steps = flat(w.segments);
      const min = minutesOf(steps);
      weekMin += min;
      const tag = `S${wi + 1} ${w.dayOfWeek} «${w.name}»`;
      if (min > o.cap) f.push({ level: 'fail', msg: `${tag}: ${min} min, pasa el tope de ${o.cap}` });
      if (seen.has(w.dayOfWeek)) f.push({ level: 'fail', msg: `${tag}: dos entrenamientos el mismo día` });
      else if (!dayUsable(w.dayOfWeek, wi, o)) {
        const why = o.days && !o.days.includes(w.dayOfWeek) ? `día no disponible (${o.days.join(', ')})` : `cae en ${dateForWeek(o.startDate!, wi, w.dayOfWeek)}, ocupado o antes del inicio`;
        f.push({ level: 'fail', msg: `${tag}: ${why}` });
      }
      seen.add(w.dayOfWeek);
      if (!isTest(w) && isHard(steps)) {
        hardDays.push(DAY_OFFSET[w.dayOfWeek]);
        // El nombre es lo que el atleta lee primero: "Fondo tranquilo" al 93 % engaña.
        if (misleadingName(w.name, steps)) f.push({ level: 'fail', msg: `${tag}: se llama como sesión suave pero trae trabajo duro (hasta ${maxPct(steps)} % FTP)` });
      }
    }
    if (o.minor && weekMin > MINOR_MAX_WEEK_MIN) {
      f.push({ level: 'fail', msg: `S${wi + 1}: ${(weekMin / 60).toFixed(1)} h; para un menor de 18 el máximo son ${MINOR_MAX_WEEK_MIN / 60} h por semana` });
    }
    if (o.minor && week.workouts.some((w) => isTest(w) && /20/.test(w.name))) {
      f.push({ level: 'fail', msg: `S${wi + 1}: un menor de 18 hace la rampa, no el test de 20 min` });
    }
    if (o.hoursPerWeek && weekMin > o.hoursPerWeek * 60 * 1.1) {
      f.push({ level: 'warn', msg: `S${wi + 1}: ${(weekMin / 60).toFixed(1)} h, más que las ${o.hoursPerWeek} h disponibles` });
    }
    hardDays.sort((a, b) => a - b);
    for (let i = 1; i < hardDays.length; i++) {
      if (hardDays[i] - hardDays[i - 1] <= 1) f.push({ level: 'warn', msg: `S${wi + 1}: días duros seguidos (${DAYS[hardDays[i - 1]]} y ${DAYS[hardDays[i]]})` });
    }
  });
}

function checkNoFtp(f: Finding[], ctx: Any, out: Any, weeks: { workouts: Any[] }[]) {
  if (!ftpUnknown(ctx)) return;
  for (const [wi, week] of weeks.entries()) {
    for (const w of week.workouts) {
      if (isTest(w)) continue;
      const top = maxPct(flat(w.segments));
      if (top >= 95) f.push({ level: 'fail', msg: `S${wi + 1} «${w.name}»: llega a ${top} % FTP sin FTP medido` });
    }
  }
  if (!out.nextTest && !noPerformance(ctx)) f.push({ level: 'fail', msg: 'sin FTP medido y nextTest es null: tienes que decir cuándo se mide' });
}

/** Sin FTP medido, nada que no sea test llega a 88 % antes del primer test
 * (si no hay test en las semanas armadas, en ninguna). */
function checkNothingHardBeforeTest(f: Finding[], weeks: { workouts: Any[] }[]) {
  for (const [wi, week] of weeks.entries()) {
    const ordered = [...week.workouts].sort((a, b) => DAY_OFFSET[a.dayOfWeek] - DAY_OFFSET[b.dayOfWeek]);
    for (const w of ordered) {
      if (isTest(w)) return;
      const top = maxPct(flat(w.segments));
      if (top >= 88) f.push({ level: 'fail', msg: `S${wi + 1} «${w.name}»: llega a ${top} % antes del test, sin FTP medido (todo por sensación hasta medirlo)` });
    }
  }
}

function checkNoPerformance(f: Finding[], ctx: Any, out: Any, weeks: { workouts: Any[] }[]) {
  if (!noPerformance(ctx)) return;
  if (out.nextTest) f.push({ level: 'fail', msg: 'el atleta dijo que no busca rendimiento: nextTest va null (sin tests salvo que los pida)' });
  for (const [wi, week] of weeks.entries()) for (const w of week.workouts) if (isTest(w)) f.push({ level: 'fail', msg: `S${wi + 1} «${w.name}»: es un test y el atleta no busca rendimiento` });
}

function checkCreatePlan(ctx: Any, out: Any): Finding[] {
  const f: Finding[] = [];
  const weeks = out.firstBlockWeeks as { workouts: Any[] }[];
  if (weeks.length > out.blocks[0].weeks) f.push({ level: 'fail', msg: `concretó ${weeks.length} semanas pero el bloque 1 dura ${out.blocks[0].weeks}` });
  checkPlannedWeeks(f, weeks, weekOpts('create_plan', ctx));

  checkText(f, 'coachNote', out.coachNote);
  const tsb = ctx.recentHistory?.tsb;
  if (tsb !== undefined && tsb <= -25) checkAbsorption(f, weeks[0]?.workouts ?? [], `TSB ${tsb}, la semana 1 es de absorción`);
  const novice = ctx.experienceLevel === 'new_to_cycling' || ctx.generalFitnessLevel === 'sedentary';
  if (novice) {
    for (const [wi, week] of weeks.entries())
      for (const w of week.workouts) {
        if (!isTest(w) && maxPct(flat(w.segments)) > 105) f.push({ level: 'warn', msg: `S${wi + 1} «${w.name}»: >105 % FTP para alguien nuevo/sedentario` });
      }
  }
  checkNoFtp(f, ctx, out, weeks);
  checkNoPerformance(f, ctx, out, weeks);
  if (ftpUnknown(ctx)) {
    if (out.suggestedFtp != null) f.push({ level: 'warn', msg: `sin FTP medido y suggestedFtp = ${out.suggestedFtp}: el número sale del test, no se estima` });
    if (!weeks.flatMap((w) => w.workouts).some(isTest) && !novice) f.push({ level: 'warn', msg: 'sin FTP y no aparece ningún test en las semanas concretadas' });
  }
  // Falla, no aviso: si la semana del test ya está armada y no lo trae (no
  // cupo, o repairOutput lo quitó por falta de día), el plan queda sin test.
  if (out.nextTest && out.nextTest.weekIndex < weeks.length && !weeks[out.nextTest.weekIndex].workouts.some(isTest)) {
    f.push({ level: 'fail', msg: `nextTest cae en S${out.nextTest.weekIndex + 1}, pero esa semana no trae ningún workout de test: mételo en un día disponible o mueve nextTest a la semana siguiente` });
  }
  if (ftpUnknown(ctx)) checkNothingHardBeforeTest(f, weeks);
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
  if (tired && out.decision === 'progress') f.push({ level: 'fail', msg: `decision=progress con TSB ${tsb} o fatiga reportada` });
  // Lo que el atleta dice manda sobre un TSB positivo: si dice que está
  // cansado, la semana nueva no sube (prompt.ts, "Si el atleta dice que está cansado").
  const saysTired = TIRED_RE.test(wk.athleteNote ?? '');
  const newTss = out.nextWeekWorkouts.reduce((s: number, x: Any) => s + x.targetTSS, 0);
  if (saysTired && out.decision === 'progress') f.push({ level: 'fail', msg: 'el atleta dice que está cansado y la decisión es progress' });
  if ((saysTired || out.decision !== 'progress') && wk.plannedTSS >= 100 && newTss > wk.plannedTSS * 1.1) {
    f.push({ level: 'fail', msg: `decision=${out.decision}${saysTired ? ' y el atleta reporta cansancio' : ''}, pero la semana nueva sube el TSS de ${wk.plannedTSS} a ${newTss}: no subas carga` });
  }
  for (const [field, text] of [['reasoning', out.reasoning], ['recurringPatternFlag', out.recurringPatternFlag], ['contradictionFlag', out.contradictionFlag]] as const) {
    if (typeof text === 'string' && INTERNAL_RE.test(text)) f.push({ level: 'fail', msg: `${field} le habla al atleta con jerga interna («${text.match(INTERNAL_RE)![0]}»): escríbelo para el atleta` });
  }
  if (typeof out.recurringPatternFlag === 'string' && !ctx.recentWeeksSummary && !ctx.removedBefore && !ctx.recentGapPattern) {
    f.push({ level: 'fail', msg: 'recurringPatternFlag afirma un patrón, pero el contexto no trae semanas anteriores (recentWeeksSummary, removedBefore ni recentGapPattern): con una sola semana no hay patrón' });
  }
  if (tired && out.decision === 'maintain') f.push({ level: 'warn', msg: `decision=maintain con TSB ${tsb} o fatiga reportada` });
  const adherence = wk.plannedTSS ? wk.actualTSS / wk.plannedTSS : 1;
  if (!tired && tsb > -15 && adherence >= 0.9 && ['reduce', 'insert_recovery'].includes(out.decision)) {
    f.push({ level: 'warn', msg: `decision=${out.decision} con TSB ${tsb} y ${Math.round(adherence * 100)} % de cumplimiento` });
  }
  checkText(f, 'reasoning', out.reasoning);
  if (out.decision === 'insert_recovery') checkAbsorption(f, out.nextWeekWorkouts, 'decision=insert_recovery');
  else if (tsb <= -25) {
    for (const w of out.nextWeekWorkouts) if (!isTest(w) && isHard(flat(w.segments))) f.push({ level: 'fail', msg: `TSB ${tsb} y la semana siguiente trae «${w.name}» duro` });
  }
  checkPlannedWeeks(f, [{ workouts: out.nextWeekWorkouts }], weekOpts('weekly_eval', ctx));
  checkNoFtp(f, ctx, out, [{ workouts: out.nextWeekWorkouts }]);
  checkNoPerformance(f, ctx, out, [{ workouts: out.nextWeekWorkouts }]);
  if (ACRONYM_RE.test(out.reasoning)) f.push({ level: 'fail', msg: `reasoning usa «${out.reasoning.match(ACRONYM_RE)![0]}»: le llega al atleta por correo; dilo con palabras (carga de la semana, frescura) sin siglas` });
  const prev = ctx.plan?.nextTest;
  if (prev && out.nextTest && prev.weekIndex !== out.nextTest.weekIndex && !/test|rampa/i.test(out.reasoning)) {
    f.push({ level: 'warn', msg: `movió el test de S${prev.weekIndex + 1} a S${out.nextTest.weekIndex + 1} sin explicarlo en reasoning` });
  }
  const tss = newTss;
  if (!ctx.notesDue && out.notesUpdate) f.push({ level: 'warn', msg: 'propuso notesUpdate sin notesDue: el servidor lo ignora' });
  if (out.notesUpdate && ctx.athleteNotesBy === 'coach' && ctx.athleteNotes && !out.notesUpdate.includes(ctx.athleteNotes.trim())) {
    f.push({ level: 'warn', msg: 'notesUpdate borró o cambió lo que escribió el coach (el servidor lo rechaza)' });
  }
  if (out.nextTest) f.push({ level: 'ok', msg: `nextTest: S${out.nextTest.weekIndex + 1} ${out.nextTest.type} — ${out.nextTest.reason}` });
  f.push({ level: 'ok', msg: `decision=${out.decision} · TSS siguiente semana ${tss} (la que terminó: ${wk.actualTSS} real / ${wk.plannedTSS} plan)` });
  return f;
}

function checkPublishBlock(ctx: Any, out: Any): Finding[] {
  const f: Finding[] = [];
  checkPlannedWeeks(f, out.weeks, weekOpts('publish_block', ctx));
  const tss = out.weeks.map((w: Any) => w.workouts.reduce((s: number, x: Any) => s + x.targetTSS, 0));
  f.push({ level: 'ok', msg: `«${out.blockName}» · TSS por semana: ${tss.join(' → ')}` });
  return f;
}

function checkCoachWeek(ctx: Any, out: Any): Finding[] {
  const f: Finding[] = [];
  const lib = new Map<string, Any>((ctx.library ?? []).map((t: Any) => [t.id, t]));
  const cap = ctx.maxSessionMinutes ?? DEFAULT_CAP_MIN;
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

const CHECKERS: Partial<Record<Mode, (ctx: Any, out: Any) => Finding[]>> = {
  create_plan: checkCreatePlan,
  weekly_eval: checkWeeklyEval,
  publish_block: checkPublishBlock,
  coach_week: checkCoachWeek,
};

/** Revisa una salida ya validada contra el schema (no la cambia). */
export function reviewOutput(mode: Mode, ctx: Any, out: Any): Finding[] {
  return CHECKERS[mode]?.(ctx, out) ?? [];
}

export interface GuardResult {
  out: Any;
  fixes: string[];
  fails: string[];
  warns: string[];
}

/** Lo que corre producción: arregla lo mecánico y revisa lo que queda. */
export function guardOutput(mode: Mode, ctx: Any, out: Any): GuardResult {
  const { out: fixed, fixes } = repairOutput(mode, ctx, out);
  const findings = reviewOutput(mode, ctx, fixed);
  return {
    out: fixed,
    fixes,
    fails: findings.filter((x) => x.level === 'fail').map((x) => x.msg),
    warns: findings.filter((x) => x.level === 'warn').map((x) => x.msg),
  };
}

/** Mensaje para el único reintento: qué reglas rompió la respuesta. */
export function correctionMessage(fails: string[]): string {
  return [
    'Tu respuesta rompe estas reglas:',
    ...fails.map((x) => `- ${x}`),
    '',
    'Corrígela y devuelve el JSON completo otra vez, con el mismo formato. Cambia solo lo necesario para cumplir las reglas; si cambias un entrenamiento, ajusta su intent y su targetTSS para que coincidan.',
  ].join('\n');
}
