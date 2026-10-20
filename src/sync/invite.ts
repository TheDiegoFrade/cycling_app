// Registro solo con invitación (Edge Function `invite`, ver
// supabase/functions/invite): alta desde el link de un coach y, para
// administradores, la lista de espera.
import { supabase } from '../supabase/client';

export interface WaitlistRow {
  id: string;
  email: string;
  name: string | null;
  discipline: string | null;
  created_at: string;
  invited_at: string | null;
}

async function call<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  if (!supabase) return { error: 'sin conexión con el servidor' };
  const { data, error } = await supabase.functions.invoke('invite', { body });
  if (!error && data && !data.error) return { data: data as T };
  let code: string | undefined = data?.error;
  if (!code && error && 'context' in error) {
    code = await (error as unknown as { context: Response }).context
      .json()
      .then((j: { error?: string }) => j?.error)
      .catch(() => undefined);
  }
  return { error: code ?? 'failed' };
}

/** Pide el correo para crear la cuenta desde el link de un coach. */
export function coachSignup(token: string, email: string) {
  return call<{ ok: true }>({ action: 'coach_signup', token, email });
}

export function listWaitlist() {
  return call<{ rows: WaitlistRow[] }>({ action: 'waitlist_list' });
}

export function inviteFromWaitlist(id: string) {
  return call<{ ok: true; alreadyHadAccount: boolean }>({ action: 'waitlist_invite', id });
}
