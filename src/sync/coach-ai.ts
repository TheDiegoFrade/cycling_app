// IA del coach (vista del coach, paso 6b): pide a la Edge Function
// coach-chat (modo coach_week) una propuesta para la semana de un atleta.
// La función solo propone — no escribe nada; el editor la aplica al
// borrador (plan_weeks) y el coach decide si publica.
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
}

export interface ProposedWorkout {
  name: string;
  description: string;
  intervals: unknown[];
  targetTSS: number;
  dayOfWeek: string;
}

export interface CoachWeekProposal {
  rationale: string[];
  workouts: ProposedWorkout[];
}

export async function requestCoachWeek(context: CoachWeekContext): Promise<CoachWeekProposal> {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.functions.invoke('coach-chat', { body: { mode: 'coach_week', context } });
  if (error || data?.error) {
    // en respuestas non-2xx el mensaje real viene en el body de error.context
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
  return data.result as CoachWeekProposal;
}
