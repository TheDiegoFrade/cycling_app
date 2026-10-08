// IA del coach (vista del coach, pasos 6b y 7b): pide a la Edge Function
// coach-chat una propuesta para la semana de un atleta (coach_week) o el
// borrador de su revisión mensual (monthly_review).
// La función solo propone — no escribe nada; el editor la aplica al
// borrador (plan_weeks) y el coach decide si publica.
import type { ReviewAiContext, ReviewFinding, ReviewGoal, ReviewVerdict } from '../core/monthly-report';
import { supabase } from '../supabase/client';

export interface CoachWeekContext {
  athleteId: string;
  weekStart: string;
  instruction: string;
  openDays: string[];
  lockedItems: { dayOfWeek: string; name: string; kind: 'bike' | 'strength' | 'mobility' | 'flexibility'; minutes: number | null; tss: number | null; reason: 'past' | 'coach_edit' | 'routine' }[];
  athlete: { name: string | null; ftp: number | null; ftpConfirmed: boolean | null; discipline: string | null; injuries: string | null; goal: string | null };
  pmc: { ctl: number; atl: number; tsb: number } | null;
  recentWeeks: { weekStart: string; bikeTss: number; nonBikeSessions: number }[];
  maxSessionMinutes: number | null;
  /** Plantillas de bici del coach — la IA las prefiere (copia o adapta). */
  library: { id: string; name: string; minutes: number; tss: number | null; structure: string }[];
}

export interface ProposedWorkout {
  name: string;
  description: string;
  intervals: unknown[];
  targetTSS: number;
  dayOfWeek: string;
  /** null si la IA lo diseñó; si salió de la biblioteca, qué le cambió
   * (`change` null = copia exacta). */
  fromLibrary: { templateId: string; change: string | null } | null;
}

export interface CoachWeekProposal {
  rationale: string[];
  workouts: ProposedWorkout[];
}

/** Llama a la Edge Function coach-chat y regresa `result`, o lanza un
 * Error con el mensaje real (en respuestas non-2xx viene en el body). */
async function invokeCoach<T>(mode: string, context: unknown): Promise<T> {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.functions.invoke('coach-chat', { body: { mode, context } });
  if (error || data?.error) {
    let message = data?.error as string | undefined;
    if (!message && error && 'context' in error) {
      try {
        message = (await (error as unknown as { context: Response }).context.json())?.error;
      } catch {
        // sin JSON: nos quedamos con error.message
      }
    }
    throw new Error(message ?? error?.message ?? 'error desconocido');
  }
  return data.result as T;
}

export function requestCoachWeek(context: CoachWeekContext): Promise<CoachWeekProposal> {
  return invokeCoach<CoachWeekProposal>('coach_week', context);
}

/** Borrador de la revisión mensual (paso 7b, modo monthly_review). La
 * función no guarda nada: el coach lo edita en su revisión y decide. */
export interface MonthlyReviewDraft {
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
  message: string;
  goals: ReviewGoal[];
}

export function requestMonthlyReviewDraft(context: ReviewAiContext): Promise<MonthlyReviewDraft> {
  return invokeCoach<MonthlyReviewDraft>('monthly_review', context);
}
