// Reporte mensual (vista del coach, paso 7 — docs/coach-view/mockups/
// Revision.html). Lógica pura: recibe las sesiones, lo agendado y el mes, y
// arma todos los números del reporte. Coach y atleta llaman a esto con los
// mismos datos (sin Strava) y ven exactamente lo mismo.
import { computePmc } from '../engine/pmc';
import type { PmcPoint } from '../engine/pmc';
import { mondayOfWeek } from '../engine/streaks';
import type { PlannedRoutine, RoutineKind } from './coach-templates';
import { isoWeekLabel } from './plan-week';
import { isBikeSession, wasTrained } from './session-kind';
import type { SessionCompletion, SessionKind } from './session-kind';
import type { SessionSource } from './session-source';
import type { Workout } from './types';
import { estimateWorkout } from './workout-estimate';

/** Una fila de `sessions` con lo que necesita el reporte. */
export interface ReportSession {
  id: string;
  workoutName: string;
  startedAt: string;
  finishedAt: string;
  tss: number | null;
  rpe: number | null;
  kind: SessionKind | null;
  completion: SessionCompletion | null;
  srpeLoad: number | null;
  source: SessionSource;
  ftp: number | null;
  np: number | null;
  intensityFactor: number | null;
  efficiencyFactor: number | null;
  /** Desacople Pw:HR en % (sessions.hr_drift_pct). */
  decouplingPct: number | null;
  best1: number | null;
  best5: number | null;
  best20: number | null;
}

export type DayStatus = 'done' | 'part' | 'miss' | 'extra' | 'rest' | 'future';

export interface ReportDay {
  dateKey: string;
  status: DayStatus;
  tss: number;
}

export interface ReportWeek {
  mondayKey: string;
  label: string; // "S40"
  plannedTss: number;
  doneTss: number;
}

export interface BestPower {
  label: string;
  month: number | null;
  prev: number | null;
  best90: number | null;
}

export type IntensityBucket = 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2';
export const INTENSITY_LABELS: Record<IntensityBucket, string> = {
  recovery: 'Suave',
  endurance: 'Resistencia',
  tempo: 'Tempo / SS',
  threshold: 'Umbral',
  vo2: 'VO2 / anaeróbico',
};
const INTENSITY_ORDER: readonly IntensityBucket[] = ['recovery', 'endurance', 'tempo', 'threshold', 'vo2'];

export interface AerobicWeek {
  mondayKey: string;
  label: string;
  decouplingPct: number | null;
  ef: number | null;
}

export interface KeySession {
  dateKey: string;
  name: string;
  durationS: number;
  np: number | null;
  intensityFactor: number | null;
  tss: number | null;
  rpe: number | null;
  source: SessionSource;
  note: string;
}

export interface RoutineCompliance {
  kind: RoutineKind;
  planned: number;
  done: number;
}

export interface MonthlyReport {
  monthKey: string; // "2026-09"
  startKey: string;
  endKey: string; // último día del mes, o hoy si el mes está en curso
  inProgress: boolean;
  hasData: boolean;
  kpis: {
    hours: number;
    hoursPrev: number;
    tss: number;
    tssPrev: number;
    plannedCount: number;
    doneCount: number;
    compliancePct: number | null;
    compliancePrevPct: number | null;
    ctlStart: number;
    ctlEnd: number;
    ftp: number | null;
    ftpPrev: number | null;
    tsbEnd: number;
  };
  /** CTL/ATL/TSB de los 60 días que terminan en endKey. */
  pmc: PmcPoint[];
  dailyTss: Map<string, number>;
  weeks: ReportWeek[];
  days: ReportDay[];
  bests: BestPower[];
  intensity: { bucket: IntensityBucket; hours: number }[];
  hoursWithoutPower: number;
  aerobic: AerobicWeek[];
  keySessions: KeySession[];
  routines: RoutineCompliance[];
  srpeTotal: number;
}

export interface ReportInput {
  monthKey: string;
  todayKey: string;
  /** Sesiones desde al menos 6 meses antes del mes (para sembrar el CTL). */
  sessions: readonly ReportSession[];
  /** Entrenamientos agendados (con scheduledDate) del mes y el anterior. */
  workouts: readonly Workout[];
  routines: readonly PlannedRoutine[];
  /** FTP para estimar el TSS planeado. */
  ftp: number;
}

const PMC_WINDOW_DAYS = 60;
/** "Rodada larga y pareja" para la base aeróbica. */
const AEROBIC_MIN_S = 60 * 60;
const AEROBIC_MAX_IF = 0.8;
const KEY_SESSIONS = 5;

// ---------- fechas (UTC, igual que Forma y coach-metrics) ----------

function parseKey(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}
function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(key: string, days: number): string {
  return toKey(parseKey(key) + days * 86400000);
}
export function monthStart(monthKey: string): string {
  return `${monthKey}-01`;
}
export function monthEnd(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return toKey(Date.UTC(y, m, 0));
}
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
export function isMonthKey(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
/** Mes que conviene revisar por defecto: el último mes completo. */
export function defaultReviewMonth(todayKey: string): string {
  return shiftMonth(todayKey.slice(0, 7), -1);
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "septiembre 2026" */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS_ES[m - 1]} ${y}`;
}
export function monthName(monthKey: string): string {
  return MONTHS_ES[Number(monthKey.slice(5, 7)) - 1];
}

function dateOf(s: ReportSession): string {
  return s.startedAt.slice(0, 10);
}
function durationS(s: ReportSession): number {
  return Math.max(0, (Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1000);
}
function inRange(key: string, from: string, to: string): boolean {
  return key >= from && key <= to;
}

function maxOf(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  return nums.length ? Math.max(...nums) : null;
}
function avgOf(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function intensityBucket(intensityFactor: number): IntensityBucket {
  if (intensityFactor < 0.65) return 'recovery';
  if (intensityFactor < 0.75) return 'endurance';
  if (intensityFactor < 0.85) return 'tempo';
  if (intensityFactor < 0.95) return 'threshold';
  return 'vo2';
}

interface Compliance {
  planned: number;
  done: number;
  days: ReportDay[];
}

/** Cumplimiento por día: lo agendado contra lo entrenado ese día. Se cuenta
 * por día (no por id) para que una rodada de Garmin cuente aunque no venga
 * del entrenamiento agendado. */
function compliance(
  from: string,
  to: string,
  todayKey: string,
  bike: readonly ReportSession[],
  nonBike: readonly ReportSession[],
  workouts: readonly Workout[],
  routines: readonly PlannedRoutine[],
): Compliance {
  const days: ReportDay[] = [];
  let planned = 0;
  let done = 0;
  for (let key = from; key <= to; key = addDays(key, 1)) {
    const plannedBike = workouts.filter((w) => w.scheduledDate === key).length;
    const plannedOther = routines.filter((r) => r.scheduledDate === key).length;
    const dayBike = bike.filter((s) => dateOf(s) === key);
    const dayOther = nonBike.filter((s) => dateOf(s) === key);
    const trainedBike = dayBike.filter(wasTrained);
    const trainedOther = dayOther.filter(wasTrained);
    const tss = trainedBike.reduce((sum, s) => sum + (s.tss ?? 0), 0);
    const p = plannedBike + plannedOther;
    const d = Math.min(plannedBike, trainedBike.length) + Math.min(plannedOther, trainedOther.length);
    const anyPartial = [...trainedBike, ...trainedOther].some((s) => s.completion === 'partial');
    // un día futuro solo cuenta si ya se entrenó (mes en curso)
    const future = key > todayKey;
    if (!future) {
      planned += p;
      done += d;
    }
    let status: DayStatus;
    if (future) status = 'future';
    else if (p === 0) status = trainedBike.length + trainedOther.length > 0 ? 'extra' : 'rest';
    else if (d === 0) status = 'miss';
    else if (d < p || anyPartial) status = 'part';
    else status = 'done';
    days.push({ dateKey: key, status, tss: Math.round(tss) });
  }
  return { planned, done, days };
}

function keySessions(bike: readonly ReportSession[]): KeySession[] {
  const picks = new Map<string, string>();
  const pick = (s: ReportSession | undefined, note: string) => {
    if (s && !picks.has(s.id)) picks.set(s.id, note);
  };
  const byMax = (f: (s: ReportSession) => number | null) =>
    bike.reduce<ReportSession | undefined>((best, s) => ((f(s) ?? -Infinity) > ((best && f(best)) ?? -Infinity) ? s : best), undefined);
  const b20 = byMax((s) => s.best20);
  if (b20?.best20) pick(b20, `Mejor 20 min del mes (${Math.round(b20.best20)} W).`);
  const b5 = byMax((s) => s.best5);
  if (b5?.best5) pick(b5, `Mejor 5 min del mes (${Math.round(b5.best5)} W).`);
  const longest = byMax(durationS);
  if (longest)
    pick(longest, longest.decouplingPct !== null && durationS(longest) >= AEROBIC_MIN_S ? `Sesión más larga · desacople ${longest.decouplingPct.toFixed(1)} %.` : 'Sesión más larga del mes.');
  const topTss = byMax((s) => s.tss);
  if (topTss?.tss) pick(topTss, 'Mayor carga del mes.');
  const hardest = byMax((s) => (s.rpe !== null && s.rpe >= 9 ? s.rpe : null));
  if (hardest) pick(hardest, `RPE ${hardest.rpe}: la más dura del mes.`);
  return [...picks.entries()]
    .slice(0, KEY_SESSIONS)
    .map(([id, note]) => {
      const s = bike.find((x) => x.id === id)!;
      return {
        dateKey: dateOf(s),
        name: s.workoutName,
        durationS: durationS(s),
        np: s.np,
        intensityFactor: s.intensityFactor,
        tss: s.tss,
        rpe: s.rpe,
        source: s.source,
        note,
      };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function buildMonthlyReport(input: ReportInput): MonthlyReport {
  const { monthKey, todayKey } = input;
  const startKey = monthStart(monthKey);
  const fullEnd = monthEnd(monthKey);
  const inProgress = todayKey >= startKey && todayKey < fullEnd;
  const endKey = inProgress ? todayKey : fullEnd;
  const prevMonth = shiftMonth(monthKey, -1);
  const prevStart = monthStart(prevMonth);
  // El mes anterior se compara con el mismo número de días si este va en curso.
  const prevEnd = inProgress ? addDays(prevStart, Number(todayKey.slice(8, 10)) - 1) : monthEnd(prevMonth);

  const sessions = input.sessions.filter((s) => s.source !== 'strava');
  const bikeAll = sessions.filter(isBikeSession);
  const trainedBike = bikeAll.filter(wasTrained);
  const nonBikeAll = sessions.filter((s) => !isBikeSession(s));

  const bikeMonth = trainedBike.filter((s) => inRange(dateOf(s), startKey, endKey));
  const bikePrev = trainedBike.filter((s) => inRange(dateOf(s), prevStart, prevEnd));
  const nonBikeMonth = nonBikeAll.filter((s) => inRange(dateOf(s), startKey, endKey));

  const sumHours = (rows: readonly ReportSession[]) => rows.reduce((sum, s) => sum + durationS(s), 0) / 3600;
  const sumTss = (rows: readonly ReportSession[]) => rows.reduce((sum, s) => sum + (s.tss ?? 0), 0);

  // PMC con toda la historia para sembrar bien el CTL; se recorta a 60 días.
  const entries = trainedBike.filter((s) => dateOf(s) <= endKey).map((s) => ({ dateKey: dateOf(s), tss: s.tss ?? 0 }));
  const windowStart = addDays(endKey, -(PMC_WINDOW_DAYS - 1));
  // los ceros en los extremos hacen que la ventana siempre tenga 60 días
  const full = entries.length ? computePmc([{ dateKey: windowStart, tss: 0 }, ...entries, { dateKey: endKey, tss: 0 }]).filter((p) => p.dateKey <= endKey) : [];
  const pmcAt = (key: string) => {
    let found: PmcPoint | null = null;
    for (const p of full) if (p.dateKey <= key) found = p;
    return found;
  };
  const pmc = full.filter((p) => p.dateKey >= windowStart);
  const dailyTss = new Map<string, number>();
  for (const e of entries) if (e.dateKey >= windowStart) dailyTss.set(e.dateKey, (dailyTss.get(e.dateKey) ?? 0) + e.tss);
  const startPoint = pmcAt(addDays(startKey, -1));
  const endPoint = pmcAt(endKey);
  // TSB "al cierre": la forma con la que arrancaría el día siguiente.
  const tsbEnd = endPoint ? endPoint.ctl - endPoint.atl : 0;

  const workoutsMonth = input.workouts.filter((w) => w.scheduledDate && inRange(w.scheduledDate, startKey, fullEnd));
  const workoutsPrev = input.workouts.filter((w) => w.scheduledDate && inRange(w.scheduledDate, prevStart, prevEnd));
  const routinesMonth = input.routines.filter((r) => inRange(r.scheduledDate, startKey, fullEnd));
  const routinesPrev = input.routines.filter((r) => inRange(r.scheduledDate, prevStart, prevEnd));
  const comp = compliance(startKey, fullEnd, todayKey, bikeAll.filter((s) => inRange(dateOf(s), startKey, fullEnd)), nonBikeMonth, workoutsMonth, routinesMonth);
  const compPrev = compliance(prevStart, prevEnd, todayKey, bikeAll.filter((s) => inRange(dateOf(s), prevStart, prevEnd)), nonBikeAll.filter((s) => inRange(dateOf(s), prevStart, prevEnd)), workoutsPrev, routinesPrev);
  const pct = (c: Compliance) => (c.planned > 0 ? Math.round((c.done / c.planned) * 100) : null);

  // Semanas (lunes a domingo) que tocan el mes.
  const weeks: ReportWeek[] = [];
  for (let monday = mondayOfWeek(startKey); monday <= fullEnd; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const plannedTss = input.workouts
      .filter((w) => w.scheduledDate && inRange(w.scheduledDate, monday, sunday))
      .reduce((sum, w) => sum + (estimateWorkout(w.intervals, input.ftp).tss ?? 0), 0);
    const doneTss = sumTss(trainedBike.filter((s) => inRange(dateOf(s), monday, sunday)));
    weeks.push({ mondayKey: monday, label: `S${Number(isoWeekLabel(monday).slice(-2))}`, plannedTss: Math.round(plannedTss), doneTss: Math.round(doneTss) });
  }

  const best90Start = addDays(endKey, -89);
  const bestsOf = (label: string, f: (s: ReportSession) => number | null): BestPower => ({
    label,
    month: maxOf(bikeMonth.map(f)),
    prev: maxOf(bikePrev.map(f)),
    best90: maxOf(trainedBike.filter((s) => inRange(dateOf(s), best90Start, endKey)).map(f)),
  });

  const intensityHours = new Map<IntensityBucket, number>();
  let hoursWithoutPower = 0;
  for (const s of bikeMonth) {
    const h = durationS(s) / 3600;
    if (s.intensityFactor === null || !(s.intensityFactor > 0)) hoursWithoutPower += h;
    else {
      const b = intensityBucket(s.intensityFactor);
      intensityHours.set(b, (intensityHours.get(b) ?? 0) + h);
    }
  }

  const aerobic: AerobicWeek[] = weeks.map((w) => {
    const rides = trainedBike.filter(
      (s) =>
        inRange(dateOf(s), w.mondayKey, addDays(w.mondayKey, 6)) &&
        inRange(dateOf(s), startKey, endKey) &&
        durationS(s) >= AEROBIC_MIN_S &&
        s.intensityFactor !== null &&
        s.intensityFactor <= AEROBIC_MAX_IF,
    );
    return { mondayKey: w.mondayKey, label: w.label, decouplingPct: avgOf(rides.map((s) => s.decouplingPct)), ef: avgOf(rides.map((s) => s.efficiencyFactor)) };
  });

  const routines: RoutineCompliance[] = (['strength', 'mobility', 'flexibility'] as const)
    .map((kind) => ({
      kind,
      planned: routinesMonth.filter((r) => r.kind === kind && r.scheduledDate <= todayKey).length,
      done: nonBikeMonth.filter((s) => s.kind === kind && wasTrained(s)).length,
    }))
    .filter((r) => r.planned > 0 || r.done > 0);

  const lastFtp = (rows: readonly ReportSession[]) => {
    const sorted = [...rows].filter((s) => s.ftp).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return sorted.length ? sorted[sorted.length - 1].ftp : null;
  };

  return {
    monthKey,
    startKey,
    endKey,
    inProgress,
    hasData: bikeMonth.length + nonBikeMonth.length > 0,
    kpis: {
      hours: sumHours(bikeMonth),
      hoursPrev: sumHours(bikePrev),
      tss: Math.round(sumTss(bikeMonth)),
      tssPrev: Math.round(sumTss(bikePrev)),
      plannedCount: comp.planned,
      doneCount: comp.done,
      compliancePct: pct(comp),
      compliancePrevPct: pct(compPrev),
      ctlStart: startPoint?.ctl ?? 0,
      ctlEnd: endPoint?.ctl ?? 0,
      ftp: lastFtp(bikeMonth),
      ftpPrev: lastFtp(bikePrev),
      tsbEnd,
    },
    pmc,
    dailyTss,
    weeks,
    days: comp.days,
    bests: [bestsOf('1 min', (s) => s.best1), bestsOf('5 min', (s) => s.best5), bestsOf('20 min', (s) => s.best20)],
    intensity: INTENSITY_ORDER.map((bucket) => ({ bucket, hours: intensityHours.get(bucket) ?? 0 })),
    hoursWithoutPower,
    aerobic,
    keySessions: keySessions(bikeMonth),
    routines,
    srpeTotal: Math.round(nonBikeMonth.filter(wasTrained).reduce((sum, s) => sum + (s.srpeLoad ?? 0), 0)),
  };
}

// ---------- Lo que escribe el coach ----------

export type ReviewVerdict = 'on_track' | 'attention' | 'off_track';
export const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  on_track: 'Mes bien encaminado',
  attention: 'Hay que ajustar algunas cosas',
  off_track: 'Mes complicado',
};

export type FindingTone = 'good' | 'warn' | 'bad';
export interface ReviewFinding {
  tone: FindingTone;
  title: string;
  body: string;
}
export interface ReviewGoal {
  title: string;
  detail: string;
}

export const MAX_FINDINGS = 6;
export const MAX_GOALS = 5;
export const MAX_MESSAGE = 4000;

/** Hallazgos sugeridos a partir de los datos (el coach los edita). Reglas
 * simples y explicables; nada inventado: si no hay datos, no hay hallazgo. */
export function suggestFindings(r: MonthlyReport): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  const k = r.kpis;
  if (!r.hasData) return [{ tone: 'warn', title: 'Sin datos este mes.', body: 'No hay sesiones registradas en Torq ni Garmin en este periodo.' }];

  const days = Math.max(1, Math.round((parseKey(r.endKey) - parseKey(r.startKey)) / 86400000) + 1);
  const perWeek = ((k.ctlEnd - k.ctlStart) / days) * 7;
  const ctlDelta = Math.round(k.ctlEnd - k.ctlStart);
  if (perWeek > 7) out.push({ tone: 'warn', title: 'La carga subió muy rápido.', body: `El Fitness subió ${ctlDelta} puntos (≈ ${perWeek.toFixed(1)} por semana); arriba de 7 por semana sube el riesgo de sobrecarga.` });
  else if (perWeek >= 1) out.push({ tone: 'good', title: 'Progresión de carga sana.', body: `El Fitness subió ${ctlDelta} puntos (≈ ${perWeek.toFixed(1)} por semana), un ritmo que se puede sostener.` });
  else if (perWeek <= -2) out.push({ tone: 'warn', title: 'El Fitness bajó.', body: `Bajó ${Math.abs(ctlDelta)} puntos en el mes. Si no fue una descarga planeada, revisa qué pasó.` });

  if (k.compliancePct !== null) {
    if (k.compliancePct >= 85) out.push({ tone: 'good', title: 'Muy buen cumplimiento.', body: `${k.doneCount} de ${k.plannedCount} sesiones agendadas (${k.compliancePct} %).` });
    else if (k.compliancePct < 70) out.push({ tone: 'warn', title: 'Cumplimiento bajo.', body: `${k.doneCount} de ${k.plannedCount} sesiones agendadas (${k.compliancePct} %). Vale la pena ajustar el plan a la semana real.` });
  }

  const b20 = r.bests.find((b) => b.label === '20 min');
  if (b20?.month && b20.prev && b20.month - b20.prev >= 3) out.push({ tone: 'good', title: 'Mejor esfuerzo de 20 min subió.', body: `${Math.round(b20.month)} W contra ${Math.round(b20.prev)} W el mes anterior: buena señal para revisar el FTP.` });

  const dec = r.aerobic.filter((a) => a.decouplingPct !== null);
  if (dec.length >= 2) {
    const first = dec[0].decouplingPct!;
    const last = dec[dec.length - 1].decouplingPct!;
    if (last <= first - 1) out.push({ tone: 'good', title: 'Base aeróbica mejorando.', body: `El desacople en rodadas largas bajó de ${first.toFixed(1)} % a ${last.toFixed(1)} %.` });
    else if (last > 5) out.push({ tone: 'warn', title: 'Desacople alto en rodadas largas.', body: `${last.toFixed(1)} % la última semana (meta < 5 %): más volumen suave ayuda.` });
  }

  for (const rc of r.routines) {
    if (rc.kind === 'strength' && rc.planned > 0 && rc.done / rc.planned < 0.75)
      out.push({ tone: 'warn', title: 'Fuerza inconsistente.', body: `${rc.done} de ${rc.planned} sesiones de fuerza agendadas.` });
  }

  if (k.tsbEnd <= -25) out.push({ tone: 'bad', title: 'Fatiga alta al cierre.', body: `La Forma terminó en ${Math.round(k.tsbEnd)}. Conviene empezar el siguiente mes con unos días más suaves.` });

  return out.slice(0, MAX_FINDINGS);
}

export function suggestVerdict(findings: readonly ReviewFinding[]): ReviewVerdict {
  if (findings.some((f) => f.tone === 'bad')) return 'off_track';
  if (findings.filter((f) => f.tone === 'warn').length >= 2) return 'attention';
  return 'on_track';
}

/** Limpia lo que escribe el coach antes de guardarlo. */
export function cleanFindings(list: readonly ReviewFinding[]): ReviewFinding[] {
  return list
    .map((f) => ({ tone: (['good', 'warn', 'bad'] as const).includes(f.tone) ? f.tone : 'warn', title: f.title.trim().slice(0, 140), body: f.body.trim().slice(0, 600) }))
    .filter((f) => f.title || f.body)
    .slice(0, MAX_FINDINGS);
}
export function cleanGoals(list: readonly ReviewGoal[]): ReviewGoal[] {
  return list
    .map((g) => ({ title: g.title.trim().slice(0, 140), detail: g.detail.trim().slice(0, 400) }))
    .filter((g) => g.title || g.detail)
    .slice(0, MAX_GOALS);
}

// ---------- Contexto para la IA (paso 7b) ----------

export interface ReviewAiAthlete {
  name: string | null;
  ftp: number | null;
  weightKg: number | null;
  discipline: string | null;
  injuries: string | null;
  goal: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const r1OrNull = (n: number | null) => (n === null ? null : round1(n));

/** Lo que se le manda a la IA para redactar la revisión: solo números ya
 * calculados (sin Strava, sin sesiones crudas) y redondeados. Mismo shape
 * que MonthlyReviewInputContextSchema en supabase/functions/coach-chat. */
export function reviewAiContext(r: MonthlyReport, athleteId: string, athlete: ReviewAiAthlete, coachDraft: string) {
  const k = r.kpis;
  return {
    athleteId,
    monthKey: r.monthKey,
    inProgress: r.inProgress,
    athlete: {
      name: athlete.name,
      ftp: athlete.ftp && athlete.ftp > 0 ? athlete.ftp : null,
      weightKg: athlete.weightKg && athlete.weightKg > 0 ? athlete.weightKg : null,
      discipline: athlete.discipline,
      injuries: athlete.injuries?.slice(0, 500) ?? null,
      goal: athlete.goal?.slice(0, 300) ?? null,
    },
    kpis: {
      hours: round1(k.hours),
      hoursPrev: round1(k.hoursPrev),
      tss: k.tss,
      tssPrev: k.tssPrev,
      plannedCount: k.plannedCount,
      doneCount: k.doneCount,
      compliancePct: k.compliancePct,
      compliancePrevPct: k.compliancePrevPct,
      ctlStart: round1(k.ctlStart),
      ctlEnd: round1(k.ctlEnd),
      ftp: k.ftp,
      ftpPrev: k.ftpPrev,
      tsbEnd: round1(k.tsbEnd),
    },
    weeks: r.weeks.map((w) => ({ label: w.label, plannedTss: w.plannedTss, doneTss: w.doneTss })),
    bests: r.bests.map((b) => ({ label: b.label, month: b.month, prev: b.prev, best90: b.best90 })),
    intensityHours: Object.fromEntries(r.intensity.map((i) => [INTENSITY_LABELS[i.bucket], round1(i.hours)])),
    hoursWithoutPower: round1(r.hoursWithoutPower),
    aerobic: r.aerobic.map((a) => ({ label: a.label, decouplingPct: r1OrNull(a.decouplingPct), ef: a.ef === null ? null : Math.round(a.ef * 100) / 100 })),
    routines: r.routines.map((x) => ({ kind: x.kind, planned: x.planned, done: x.done })),
    srpeTotal: r.srpeTotal,
    keySessions: r.keySessions.map((s) => ({
      date: s.dateKey,
      name: s.name.slice(0, 120),
      minutes: Math.round(s.durationS / 60),
      np: s.np === null ? null : Math.round(s.np),
      intensityFactor: s.intensityFactor === null ? null : Math.round(s.intensityFactor * 100) / 100,
      tss: s.tss === null ? null : Math.round(s.tss),
      rpe: s.rpe,
      note: s.note.slice(0, 200),
    })),
    missedDays: r.days.filter((d) => d.status === 'miss').length,
    partialDays: r.days.filter((d) => d.status === 'part').length,
    coachDraft: coachDraft.slice(0, 4000),
  };
}

export type ReviewAiContext = ReturnType<typeof reviewAiContext>;
