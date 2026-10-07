// Lectura de los atletas del coach (vista del coach, paso 4). Solo lectura:
// la vista coach_athlete_profiles y la policy "sessions: coach lee las de
// sus atletas" (supabase/schema.sql) deciden qué sale — siempre atletas con
// vínculo activo, y nunca sesiones de Strava.
import type { CoachSessionRow } from '../core/coach-metrics';
import type { CoachTier } from '../core/coach-invite';
import { supabase } from '../supabase/client';

export interface CoachAthlete {
  userId: string;
  tier: CoachTier;
  linkedAt: string;
  name: string | null;
  ftp: number | null;
  ftpConfirmed: boolean | null;
  hrMax: number | null;
  hrMaxConfirmed: boolean | null;
  discipline: 'mountain' | 'road' | 'gravel' | 'other' | null;
  injuries: string | null;
  /** Meta del plan activo del atleta, si tiene. */
  goal: string | null;
  /** Peso de su Perfil (para W/kg en el reporte mensual). */
  weightKg: number | null;
}

interface ProfileRow {
  user_id: string;
  tier: CoachTier;
  linked_at: string;
  name: string | null;
  ftp: number | null;
  ftp_confirmed: boolean | null;
  hr_max: number | null;
  hr_max_confirmed: boolean | null;
  discipline: CoachAthlete['discipline'];
  injuries: string | null;
  goal: string | null;
  weight_kg?: number | null;
}

/** Filas por página — PostgREST de Supabase regresa máximo 1000 por
 * request por defecto. */
const PAGE = 1000;

const PROFILE_COLUMNS = 'user_id, tier, linked_at, name, ftp, ftp_confirmed, hr_max, hr_max_confirmed, discipline, injuries, goal';

export async function listCoachAthletes(): Promise<CoachAthlete[]> {
  if (!supabase) return [];
  const query = (columns: string) => supabase!.from('coach_athlete_profiles').select(columns).order('linked_at', { ascending: true });
  let { data, error } = await query(`${PROFILE_COLUMNS}, weight_kg`);
  // weight_kg llegó con el paso 7: si la vista de Supabase todavía no lo
  // tiene (columna inexistente, 42703), se carga sin él y no hay W/kg.
  if (error?.code === '42703') ({ data, error } = await query(PROFILE_COLUMNS));
  if (error) throw error;
  return ((data ?? []) as unknown as ProfileRow[]).map((r) => ({
    userId: r.user_id,
    tier: r.tier,
    linkedAt: r.linked_at,
    name: r.name,
    ftp: r.ftp,
    ftpConfirmed: r.ftp_confirmed,
    hrMax: r.hr_max,
    hrMaxConfirmed: r.hr_max_confirmed,
    discipline: r.discipline,
    injuries: r.injuries,
    goal: r.goal,
    weightKg: r.weight_kg ?? null,
  }));
}

/** Sesiones de esos atletas desde `sinceIso`, más recientes primero. El
 * filtro de Strava ya lo aplica RLS; el .neq de abajo solo lo deja explícito. */
export async function listAthleteSessions(athleteIds: readonly string[], sinceIso: string): Promise<CoachSessionRow[]> {
  if (!supabase || athleteIds.length === 0) return [];
  const rows: CoachSessionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, user_id, workout_name, started_at, finished_at, training_stress_score, rpe, kind, completion, srpe_load, source')
      .in('user_id', athleteIds as string[])
      .neq('source', 'strava')
      .gte('started_at', sinceIso)
      .order('started_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      rows.push({
        id: r.id,
        userId: r.user_id,
        workoutName: r.workout_name,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        tss: r.training_stress_score,
        rpe: r.rpe,
        kind: r.kind,
        completion: r.completion,
        srpeLoad: r.srpe_load,
        source: r.source,
      });
    }
    if (!data || data.length < PAGE) return rows;
  }
}
