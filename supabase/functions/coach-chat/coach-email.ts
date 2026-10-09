// Correo al atleta sin coach humano después de create_plan (carta + PDF) y
// de weekly_eval (resumen corto). Corre en segundo plano después de
// responder: si falla, se registra en el log y el plan ya quedó guardado.
import { appUrl, EMAIL_TEST_RECIPIENT, sendEmail } from '../_shared/mailer.ts';
import { totalMinutes, type PlannedWorkout } from './expand.ts';
import { buildPlanPdf, toBase64 } from './plan-pdf.ts';
import { buildPlanEmail, buildWeeklyEmail, type ReportWeek, type WeeklyDecision } from './report-email.ts';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CoachEmailInput {
  mode: 'create_plan' | 'weekly_eval';
  athleteEmail: string;
  athleteName: string | null;
  context: Any;
  /** Lo que decidió el coach (ya pasado por la guardia), con `intent` y `erg` por workout. */
  planned: Any;
  /** Lo que regresó applyModeEffects. */
  result: Any;
  startDate: string; // del plan guardado
  dateOf: (weekIndex: number, dayOfWeek: string) => string;
}

function reportWeek(weekIndex: number, workouts: PlannedWorkout[], dateOf: CoachEmailInput['dateOf']): ReportWeek {
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

export async function sendCoachEmail(i: CoachEmailInput): Promise<void> {
  const testIntendedFor = EMAIL_TEST_RECIPIENT ? i.athleteEmail : null;
  let email: { subject: string; html: string; text: string };
  let attachments: { filename: string; content: string }[] | undefined;

  if (i.mode === 'create_plan') {
    const availability = i.context.availability as { days: string[]; hoursPerWeek: number };
    const data = {
      athleteName: i.athleteName,
      planName: i.planned.planName,
      goal: String(i.context.goal ?? ''),
      startDate: i.startDate,
      days: availability.days,
      hoursPerWeek: availability.hoursPerWeek,
      coachNote: i.planned.coachNote,
      why: i.planned.report?.why ?? [],
      closing: i.planned.report?.closing ?? '',
      blocks: i.planned.blocks,
      weeks: (i.planned.firstBlockWeeks as { workouts: PlannedWorkout[] }[]).map((w, wi) => reportWeek(wi, w.workouts, i.dateOf)),
      nextTest: testOf(i.planned.nextTest),
      appUrl: appUrl(),
      testIntendedFor,
    };
    email = buildPlanEmail(data);
    const pdf = await buildPlanPdf(data);
    attachments = [{ filename: 'plan-torq.pdf', content: toBase64(pdf) }];
  } else {
    const finished = i.context.weekJustFinished as Any | undefined;
    email = buildWeeklyEmail({
      athleteName: i.athleteName,
      decision: i.planned.decision as WeeklyDecision,
      reasoning: i.planned.reasoning,
      questions: [i.planned.contradictionFlag, i.planned.recurringPatternFlag].filter((q): q is string => typeof q === 'string' && q.trim() !== ''),
      lastWeek: finished
        ? { plannedTSS: finished.plannedTSS, actualTSS: finished.actualTSS, completed: finished.completedWorkouts, missed: finished.missedWorkouts }
        : null,
      nextWeek: reportWeek(i.result.weekIndex, i.planned.nextWeekWorkouts, i.dateOf),
      nextTest: testOf(i.planned.nextTest),
      ftp: i.planned.ftpAction ? { action: i.planned.ftpAction, suggested: i.planned.suggestedFtp ?? null } : null,
      appUrl: appUrl(),
      testIntendedFor,
    });
  }

  const sent = await sendEmail({ to: i.athleteEmail, ...email, attachments });
  if (sent.ok) console.log(`[coach-chat] correo de ${i.mode} enviado a ${sent.sentTo}`);
  else console.log(`[coach-chat] correo de ${i.mode} falló: ${sent.error}`);
}
