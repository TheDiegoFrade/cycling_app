// Vínculo coach ↔ atleta e invitaciones (vista del coach, paso 3). Todo lo
// sensible pasa por funciones security definer de supabase/schema.sql
// (preview/accept_coach_invite, my_coach, end_my_coach_link): el cliente
// nunca escribe coach_athletes directo.
import { INVITE_TTL_DAYS, generateInviteToken, inviteTokenHash } from '../core/coach-invite';
import type { CoachTier } from '../core/coach-invite';
import { supabase } from '../supabase/client';

export interface MyCoach {
  /** profiles.name del coach — null si no lo ha llenado. */
  coachName: string | null;
  tier: CoachTier;
  startedAt: string;
}

export interface CoachContext {
  /** profiles.is_coach — solo se cambia a mano en el SQL Editor. */
  isCoach: boolean;
  myCoach: MyCoach | null;
}

export const EMPTY_COACH_CONTEXT: CoachContext = { isCoach: false, myCoach: null };

export interface PendingInvite {
  id: string;
  tier: CoachTier;
  createdAt: string;
  expiresAt: string;
}

export type InvitePreview =
  | { status: 'valid' | 'own' | 'used' | 'expired'; coachName: string | null; tier: CoachTier; expiresAt: string }
  | { status: 'invalid' };

/** Rol de coach + coach actual. Best-effort: si falla (sin internet,
 * columnas que todavía no existen) regresa el contexto vacío. */
export async function fetchCoachContext(userId: string): Promise<CoachContext> {
  if (!supabase) return EMPTY_COACH_CONTEXT;
  try {
    const [profileRes, coachRes] = await Promise.all([
      supabase.from('profiles').select('is_coach').eq('user_id', userId).maybeSingle(),
      supabase.rpc('my_coach'),
    ]);
    if (profileRes.error) throw profileRes.error;
    if (coachRes.error) throw coachRes.error;
    const row = (coachRes.data as { coach_name: string | null; tier: CoachTier; started_at: string }[] | null)?.[0];
    return {
      isCoach: Boolean(profileRes.data?.is_coach),
      myCoach: row ? { coachName: row.coach_name, tier: row.tier, startedAt: row.started_at } : null,
    };
  } catch (err) {
    console.error('[coach-link] no se pudo leer el vínculo con el coach', err);
    return EMPTY_COACH_CONTEXT;
  }
}

/** Crea un link de un solo uso. Regresa el token: es la única vez que
 * existe (la base solo guarda su hash), así que el link se copia ahora o
 * se crea otro. */
export async function createInvite(coachId: string, tier: CoachTier): Promise<string> {
  if (!supabase) throw new Error('Supabase no configurado');
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString();
  const { error } = await supabase
    .from('coach_invites')
    .insert({ coach_id: coachId, token_hash: await inviteTokenHash(token), tier, expires_at: expiresAt });
  if (error) throw error;
  return token;
}

/** Links del coach que nadie ha usado y no han vencido. */
export async function listPendingInvites(coachId: string): Promise<PendingInvite[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('coach_invites')
    .select('id, tier, created_at, expires_at')
    .eq('coach_id', coachId)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, tier: r.tier, createdAt: r.created_at, expiresAt: r.expires_at }));
}

/** Cuántos atletas tiene vinculados ahora mismo. */
export async function countActiveAthletes(coachId: string): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('coach_athletes')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (error) throw error;
  return count ?? 0;
}

export async function cancelInvite(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('coach_invites').delete().eq('id', id);
  if (error) throw error;
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.rpc('preview_coach_invite', { p_token: token });
  if (error) throw error;
  const row = (data as { status: InvitePreview['status']; coach_name: string | null; tier: CoachTier; expires_at: string }[] | null)?.[0];
  if (!row || row.status === 'invalid') return { status: 'invalid' };
  return { status: row.status, coachName: row.coach_name, tier: row.tier, expiresAt: row.expires_at };
}

/** Lanza con el mensaje en español de accept_coach_invite si no se puede
 * (link usado, vencido, ya tiene coach…). */
export async function acceptInvite(token: string): Promise<MyCoach> {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.rpc('accept_coach_invite', { p_token: token });
  if (error) throw new Error(error.message);
  const row = (data as { coach_name: string | null; tier: CoachTier }[] | null)?.[0];
  if (!row) throw new Error('No se pudo aceptar la invitación.');
  return { coachName: row.coach_name, tier: row.tier, startedAt: new Date().toISOString() };
}

export async function endMyCoachLink(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('end_my_coach_link');
  if (error) throw new Error(error.message);
}
