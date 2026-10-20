// Ser coach en Torq (Edge Function `coach-apply`): la solicitud de quien fue
// invitado y, para administradores, invitar, revisar y quitar el permiso.
import { supabase } from '../supabase/client';
import type { CoachApplicationAnswers, CoachApplicationErrors, CoachApplicationStatus } from '../core/coach-application';

export type ApplicationPreview =
  | { status: 'invalid' | 'expired' }
  | { status: 'wrong_email'; email: string }
  | { status: CoachApplicationStatus; answers: CoachApplicationAnswers | null };

export interface ApplicationRow {
  id: string;
  email: string;
  status: CoachApplicationStatus;
  invited_at: string;
  expires_at: string;
  user_id: string | null;
  answers: CoachApplicationAnswers | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  max_athletes: number;
}

export interface CoachRow {
  userId: string;
  name: string | null;
  email: string | null;
  athletes: number;
  maxAthletes: number;
  viaApplication: boolean;
}

async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; errors?: CoachApplicationErrors }> {
  if (!supabase) return { error: 'sin conexión con el servidor' };
  const { data, error } = await supabase.functions.invoke('coach-apply', { body });
  if (!error && data && !data.error) return { data: data as T };
  let payload: { error?: string; errors?: CoachApplicationErrors } | undefined = data;
  if (!payload?.error && error && 'context' in error) {
    payload = await (error as unknown as { context: Response }).context.json().catch(() => undefined);
  }
  return { error: payload?.error ?? 'failed', errors: payload?.errors };
}

export const previewApplication = (token: string) => call<ApplicationPreview>({ action: 'preview', token });
export const submitApplication = (token: string, answers: CoachApplicationAnswers) => call<{ ok: true }>({ action: 'submit', token, answers });
export const adminInviteCoach = (email: string, maxAthletes: number) => call<{ ok: true; link: string; emailed: boolean }>({ action: 'admin_invite', email, maxAthletes });
export const adminListCoaches = () => call<{ applications: ApplicationRow[]; coaches: CoachRow[] }>({ action: 'admin_list' });
export const adminReviewApplication = (id: string, decision: 'approve' | 'reject', opts: { note?: string; maxAthletes?: number } = {}) =>
  call<{ ok: true }>({ action: 'admin_review', id, decision, ...opts });
export const adminRevokeCoach = (userId: string) => call<{ ok: true; endedLinks: number }>({ action: 'admin_revoke', userId });

/** Para el coach: cuántos atletas tiene y cuántos puede tener. */
export async function fetchMySeats(): Promise<{ used: number; limit: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_coach_seats');
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return null;
  return { used: row.used, limit: row.seat_limit };
}
