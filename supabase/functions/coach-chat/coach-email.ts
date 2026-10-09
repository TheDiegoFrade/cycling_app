// Correos del coach al atleta: la bienvenida del plan (con PDF) y el resumen
// de cada weekly_eval. Sin coach humano salen solos, una vez por plan y una
// por semana; con coach, se guarda el borrador en el plan y el coach decide
// si lo manda (send-coach-email, máximo 2 veces, con su comentario).
import { appUrl, EMAIL_TEST_RECIPIENT, sendEmail } from '../_shared/mailer.ts';
import { totalMinutes, type PlannedWorkout } from './expand.ts';
import { buildPlanPdf, toBase64 } from './plan-pdf.ts';
import { buildPlanEmail, buildWeeklyEmail, type CoachNote, type PlanReportData, type ReportWeek, type WeeklyDecision, type WeeklyReportData } from './report-email.ts';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Lo que se guarda para armar el correo (sin destinatario ni modo de prueba). */
export type PlanDraft = Omit<PlanReportData, 'athleteName' | 'appUrl' | 'testIntendedFor' | 'coach'>;
export type WeekDraft = Omit<WeeklyReportData, 'athleteName' | 'appUrl' | 'testIntendedFor' | 'coach'> & { weekIndex: number };

/** Clave de cada correo en training_plans.data.emails / emailDrafts. */
export const emailKey = (mode: 'create_plan' | 'weekly_eval', weekIndex?: number) => (mode === 'create_plan' ? 'plan' : `week:${weekIndex}`);

type DateOf = (weekIndex: number, dayOfWeek: string) => string;

function reportWeek(weekIndex: number, workouts: PlannedWorkout[], dateOf: DateOf): ReportWeek {
  return {
    weekNumber: weekIndex + 1,
    workouts: workouts
      .map((w) => ({
        date: dateOf(weekIndex, w.dayOfWeek),
        name: w.name,
        minutes: Math.round(totalMinutes(w.segments)),
        erg: w.erg,
        isTest: w.kind === 'test',
        intent: w.intent,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function testOf(nextTest: Any | null | undefined) {
  return nextTest ? { weekNumber: nextTest.weekIndex + 1, type: nextTest.type, reason: nextTest.reason } : null;
}

export function planDraftOf(context: Any, planned: Any, startDate: string, dateOf: DateOf): PlanDraft {
  const availability = context.availability as { days: string[]; hoursPerWeek: number };
  return {
    planName: planned.planName,
    goal: String(context.goal ?? ''),
    startDate,
    days: availability.days,
    hoursPerWeek: availability.hoursPerWeek,
    coachNote: planned.coachNote,
    welcome: planned.report?.welcome || planned.coachNote,
    why: planned.report?.why ?? [],
    closing: planned.report?.closing ?? '',
    blocks: (planned.blocks as Any[]).map((b) => ({ name: b.name, weeks: b.weeks, focus: b.focus, targetHoursPerWeek: b.targetHoursPerWeek })),
    weeks: (planned.firstBlockWeeks as { workouts: PlannedWorkout[] }[]).map((w, wi) => reportWeek(wi, w.workouts, dateOf)),
    nextTest: testOf(planned.nextTest),
  };
}

export function weekDraftOf(context: Any, planned: Any, weekIndex: number, dateOf: DateOf): WeekDraft {
  const finished = context.weekJustFinished as Any | undefined;
  return {
    weekIndex,
    decision: planned.decision as WeeklyDecision,
    reasoning: planned.reasoning,
    questions: [planned.contradictionFlag, planned.recurringPatternFlag].filter((q): q is string => typeof q === 'string' && q.trim() !== ''),
    lastWeek: finished
      ? { plannedTSS: finished.plannedTSS, actualTSS: finished.actualTSS, completed: finished.completedWorkouts, missed: finished.missedWorkouts }
      : null,
    nextWeek: reportWeek(weekIndex, planned.nextWeekWorkouts, dateOf),
    nextTest: testOf(planned.nextTest),
    ftp: planned.ftpAction ? { action: planned.ftpAction, suggested: planned.suggestedFtp ?? null } : null,
  };
}

export interface Recipient {
  email: string;
  name: string | null;
  replyTo?: string;
}

/** Arma y manda el correo. Regresa a quién le llegó, o el error. */
export async function deliverDraft(
  kind: 'plan' | 'week',
  draft: PlanDraft | WeekDraft,
  to: Recipient,
  coach: CoachNote | null = null,
): Promise<{ ok: true; sentTo: string; test: boolean } | { ok: false; error: string }> {
  const base = { athleteName: to.name, appUrl: appUrl(), testIntendedFor: EMAIL_TEST_RECIPIENT ? to.email : null, coach };
  let email: { subject: string; html: string; text: string };
  let attachments: { filename: string; content: string }[] | undefined;
  if (kind === 'plan') {
    const data: PlanReportData = { ...(draft as PlanDraft), ...base };
    email = buildPlanEmail(data);
    attachments = [{ filename: 'plan-torq.pdf', content: toBase64(await buildPlanPdf(data)) }];
  } else {
    email = buildWeeklyEmail({ ...(draft as WeekDraft), ...base });
  }
  const sent = await sendEmail({ to: to.email, ...email, attachments, replyTo: to.replyTo });
  return sent.ok ? { ...sent, test: EMAIL_TEST_RECIPIENT !== null } : sent;
}
