// Revisión mensual (vista del coach, paso 7). Lee lo necesario para armar
// el reporte (sesiones sin Strava, lo agendado) y guarda lo que escribe el
// coach en monthly_reviews. Las fechas de publicación las pone la base
// (trigger monthly_reviews_stamp en supabase/schema.sql).
import { addDays, buildMonthlyReport, monthEnd, monthStart, shiftMonth } from '../core/monthly-report';
import type { MonthlyReport, ReportSession, ReviewFinding, ReviewGoal, ReviewVerdict } from '../core/monthly-report';
import { mondayOfWeek } from '../engine/streaks';
import type { Workout } from '../core/types';
import { supabase } from '../supabase/client';
import { fetchPlannedRoutines } from './plan-weeks';

const PAGE = 1000;
/** Historia previa al mes para que el CTL arranque bien sembrado. */
const PMC_SEED_DAYS = 180;

function client() {
  if (!supabase) throw new Error('Supabase no configurado');
  return supabase;
}

export interface MonthlyReview {
  id: string;
  athleteId: string;
  coachId: string;
  monthKey: string; // "2026-09"
  status: 'draft' | 'published';
  verdict: ReviewVerdict | null;
  coachMessage: string;
  findings: ReviewFinding[];
  goals: ReviewGoal[];
  coachName: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

const REVIEW_COLUMNS = 'id, athlete_id, coach_id, month, status, verdict, coach_message, findings, goals, coach_name, published_at, updated_at';

interface ReviewRow {
  id: string;
  athlete_id: string;
  coach_id: string;
  month: string;
  status: 'draft' | 'published';
  verdict: ReviewVerdict | null;
  coach_message: string;
  findings: unknown;
  goals: unknown;
  coach_name: string | null;
  published_at: string | null;
  updated_at: string;
}

function fromRow(r: ReviewRow): MonthlyReview {
  return {
    id: r.id,
    athleteId: r.athlete_id,
    coachId: r.coach_id,
    monthKey: r.month.slice(0, 7),
    status: r.status,
    verdict: r.verdict,
    coachMessage: r.coach_message,
    findings: Array.isArray(r.findings) ? (r.findings as ReviewFinding[]) : [],
    goals: Array.isArray(r.goals) ? (r.goals as ReviewGoal[]) : [],
    coachName: r.coach_name,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
}

/** Sesiones de un atleta entre dos fechas (incluidas), sin Strava. Las lee
 * el propio atleta o su coach (RLS). */
export async function fetchReportSessions(athleteId: string, fromKey: string, toKey: string): Promise<ReportSession[]> {
  const rows: ReportSession[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from('sessions')
      .select(
        'id, workout_name, started_at, finished_at, training_stress_score, rpe, kind, completion, srpe_load, source, ftp, normalized_power, intensity_factor, efficiency_factor, hr_drift_pct, best_1min_power, best_5min_power, best_20min_power',
      )
      .eq('user_id', athleteId)
      .neq('source', 'strava')
      .gte('started_at', `${fromKey}T00:00:00Z`)
      .lte('started_at', `${toKey}T23:59:59.999Z`)
      .order('started_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      rows.push({
        id: r.id,
        workoutName: r.workout_name,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        tss: r.training_stress_score,
        rpe: r.rpe,
        kind: r.kind,
        completion: r.completion,
        srpeLoad: r.srpe_load,
        source: r.source,
        ftp: r.ftp,
        np: r.normalized_power,
        intensityFactor: r.intensity_factor,
        efficiencyFactor: r.efficiency_factor,
        decouplingPct: r.hr_drift_pct,
        best1: r.best_1min_power,
        best5: r.best_5min_power,
        best20: r.best_20min_power,
      });
    }
    if (!data || data.length < PAGE) return rows;
  }
}

/** Entrenamientos agendados de un atleta entre dos fechas (incluidas). */
export async function fetchScheduledWorkouts(athleteId: string, fromKey: string, toKey: string): Promise<Workout[]> {
  const { data, error } = await client()
    .from('workouts')
    .select('data')
    .eq('user_id', athleteId)
    .gte('data->>scheduledDate', fromKey)
    .lte('data->>scheduledDate', toKey);
  if (error) throw error;
  return (data ?? []).map((r) => r.data as Workout);
}

/** La revisión de ESTE coach para ese atleta y mes (borrador o publicada). */
export async function fetchCoachReview(coachId: string, athleteId: string, monthKey: string): Promise<MonthlyReview | null> {
  const { data, error } = await client()
    .from('monthly_reviews')
    .select(REVIEW_COLUMNS)
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('month', `${monthKey}-01`)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as ReviewRow) : null;
}

/** Estado de las revisiones de un mes para todos los atletas del coach. */
export async function listCoachReviewsForMonth(coachId: string, monthKey: string): Promise<MonthlyReview[]> {
  const { data, error } = await client().from('monthly_reviews').select(REVIEW_COLUMNS).eq('coach_id', coachId).eq('month', `${monthKey}-01`);
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as ReviewRow));
}

/** Las publicadas del atleta (RLS ya filtra), más recientes primero. */
export async function listPublishedReviews(athleteId: string): Promise<MonthlyReview[]> {
  const { data, error } = await client()
    .from('monthly_reviews')
    .select(REVIEW_COLUMNS)
    .eq('athlete_id', athleteId)
    .eq('status', 'published')
    .order('month', { ascending: false })
    .order('published_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as ReviewRow));
}

export interface ReviewContent {
  verdict: ReviewVerdict | null;
  coachMessage: string;
  findings: ReviewFinding[];
  goals: ReviewGoal[];
  coachName: string | null;
}

function contentRow(c: ReviewContent) {
  return { verdict: c.verdict, coach_message: c.coachMessage, findings: c.findings, goals: c.goals, coach_name: c.coachName };
}

/** Crea la revisión (la primera vez) o guarda los cambios. */
export async function saveReview(existing: MonthlyReview | null, coachId: string, athleteId: string, monthKey: string, content: ReviewContent): Promise<MonthlyReview> {
  const query = existing
    ? client().from('monthly_reviews').update(contentRow(content)).eq('id', existing.id)
    : client()
        .from('monthly_reviews')
        .insert({ ...contentRow(content), coach_id: coachId, athlete_id: athleteId, month: `${monthKey}-01` });
  const { data, error } = await query.select(REVIEW_COLUMNS).single();
  if (error) throw error;
  return fromRow(data as ReviewRow);
}

export async function setReviewStatus(reviewId: string, status: 'draft' | 'published'): Promise<MonthlyReview> {
  const { data, error } = await client().from('monthly_reviews').update({ status }).eq('id', reviewId).select(REVIEW_COLUMNS).single();
  if (error) throw error;
  return fromRow(data as ReviewRow);
}

/** Todo lo que necesita el reporte de un mes, leído y calculado. Coach y
 * atleta llaman a esto igual (RLS decide qué puede leer cada quien). */
export async function loadMonthlyReport(athleteId: string, monthKey: string, ftp: number, todayKey: string): Promise<MonthlyReport> {
  const start = monthStart(monthKey);
  const end = monthEnd(monthKey);
  const prevStart = monthStart(shiftMonth(monthKey, -1));
  const planFrom = mondayOfWeek(start) < prevStart ? mondayOfWeek(start) : prevStart;
  const planTo = addDays(end, 6);
  const [sessions, workouts, routines] = await Promise.all([
    fetchReportSessions(athleteId, addDays(start, -PMC_SEED_DAYS), end),
    fetchScheduledWorkouts(athleteId, planFrom, planTo),
    fetchPlannedRoutines(athleteId, prevStart, end),
  ]);
  return buildMonthlyReport({ monthKey, todayKey, sessions, workouts, routines, ftp });
}
