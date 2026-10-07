// Borradores de semana del coach (vista del coach, paso 6a). El coach lee
// lo agendado del atleta y escribe SOLO en plan_weeks; publicar pasa por la
// función publish_plan_week de supabase/schema.sql, que es lo único que
// escribe en `workouts` del atleta.
import type { PlannedRoutine, RoutineKind, RoutinePayload } from '../core/coach-templates';
import { addDaysKey, isoWeekLabel } from '../core/plan-week';
import type { PlanWeekItem } from '../core/plan-week';
import type { Workout } from '../core/types';
import { supabase } from '../supabase/client';

export interface PlanWeekDraft {
  id: string;
  items: PlanWeekItem[];
  baseWorkoutIds: string[];
  updatedAt: string;
  /** Por qué la IA propuso esta semana (una razón por línea); solo el coach. */
  aiRationale: string | null;
}

function client() {
  if (!supabase) throw new Error('Supabase no configurado');
  return supabase;
}

/** Lo que el atleta tiene agendado de lunes a domingo de esa semana. */
export async function fetchAthleteWeekWorkouts(athleteId: string, mondayKey: string): Promise<Workout[]> {
  const { data, error } = await client()
    .from('workouts')
    .select('data')
    .eq('user_id', athleteId)
    .gte('data->>scheduledDate', mondayKey)
    .lte('data->>scheduledDate', addDaysKey(mondayKey, 6));
  if (error) throw error;
  return (data ?? []).map((r) => r.data as Workout);
}

interface RoutineRow {
  id: string;
  kind: RoutineKind;
  name: string;
  payload: unknown;
  scheduled_date: string;
}

function routineFromRow(r: RoutineRow): PlannedRoutine {
  return { id: r.id, kind: r.kind, name: r.name, payload: r.payload as RoutinePayload, scheduledDate: r.scheduled_date };
}

/** Rutinas de fuerza/movilidad agendadas a un atleta entre dos fechas
 * (incluidas). Las lee el propio atleta o su coach (RLS). */
export async function fetchPlannedRoutines(athleteId: string, fromKey: string, toKey: string): Promise<PlannedRoutine[]> {
  const { data, error } = await client()
    .from('planned_routines')
    .select('id, kind, name, payload, scheduled_date')
    .eq('athlete_id', athleteId)
    .gte('scheduled_date', fromKey)
    .lte('scheduled_date', toKey)
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => routineFromRow(r as RoutineRow));
}

/** El borrador de este coach para ese atleta y semana, o null. */
export async function fetchDraft(coachId: string, athleteId: string, mondayKey: string): Promise<PlanWeekDraft | null> {
  const { data, error } = await client()
    .from('plan_weeks')
    .select('id, items, base_workout_ids, updated_at, ai_rationale')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('week_start', mondayKey)
    .eq('status', 'draft')
    .maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id, items: data.items as PlanWeekItem[], baseWorkoutIds: data.base_workout_ids, updatedAt: data.updated_at, aiRationale: data.ai_rationale }
    : null;
}

/** Cuándo se publicó por última vez esa semana (de cualquier coach), o null. */
export async function fetchLastPublishedAt(athleteId: string, mondayKey: string): Promise<string | null> {
  const { data, error } = await client()
    .from('plan_weeks')
    .select('published_at')
    .eq('athlete_id', athleteId)
    .eq('week_start', mondayKey)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw error;
  return data?.published_at ?? null;
}

export async function createDraft(
  coachId: string,
  athleteId: string,
  mondayKey: string,
  items: PlanWeekItem[],
  baseWorkoutIds: string[],
  aiRationale: string | null = null,
): Promise<PlanWeekDraft> {
  const { data, error } = await client()
    .from('plan_weeks')
    .insert({
      coach_id: coachId,
      athlete_id: athleteId,
      week_start: mondayKey,
      iso_week: isoWeekLabel(mondayKey),
      items,
      base_workout_ids: baseWorkoutIds,
      ai_rationale: aiRationale,
    })
    .select('id, items, base_workout_ids, updated_at, ai_rationale')
    .single();
  if (error) throw error;
  return { id: data.id, items: data.items as PlanWeekItem[], baseWorkoutIds: data.base_workout_ids, updatedAt: data.updated_at, aiRationale: data.ai_rationale };
}

/** `aiRationale`: undefined = no tocarlo; string/null = reemplazarlo. */
export async function saveDraftItems(draftId: string, items: PlanWeekItem[], aiRationale?: string | null): Promise<void> {
  const patch = { items, updated_at: new Date().toISOString(), ...(aiRationale !== undefined ? { ai_rationale: aiRationale } : {}) };
  const { error } = await client().from('plan_weeks').update(patch).eq('id', draftId).eq('status', 'draft');
  if (error) throw error;
}

export async function discardDraft(draftId: string): Promise<void> {
  const { error } = await client().from('plan_weeks').delete().eq('id', draftId).eq('status', 'draft');
  if (error) throw error;
}

/** Lanza con el mensaje en español de publish_plan_week si no se puede. */
export async function publishDraft(draftId: string): Promise<string> {
  const { data, error } = await client().rpc('publish_plan_week', { p_week_id: draftId });
  if (error) throw new Error(error.message);
  return data as string;
}
