// ¿Este usuario tiene la IA? La única fuente de verdad (la app solo muestra lo
// que esto decide). Reglas en src/core/access.ts: cortesía, coach, atleta con
// coach vinculado o suscripción al corriente (con gracia si falló un cobro).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { aiAccess } from './core.gen.js';
import { COMP_USER_IDS } from './coach-access.ts';

export interface AccessResult {
  ai: boolean;
  reason: 'comp' | 'coach' | 'coached' | 'subscription' | 'grace' | 'none';
  subscription: { status: string; price_mxn: number; paid_until: string | null; grace_until: string | null } | null;
}

export async function loadAiAccess(admin: SupabaseClient, userId: string, now = new Date()): Promise<AccessResult> {
  const [profile, link, sub] = await Promise.all([
    admin.from('profiles').select('is_coach').eq('user_id', userId).maybeSingle(),
    admin.from('coach_athletes').select('id').eq('athlete_id', userId).eq('status', 'active').limit(1),
    admin.from('subscriptions').select('status, price_mxn, paid_until, grace_until').eq('user_id', userId).maybeSingle(),
  ]);
  if (profile.error || link.error || sub.error) throw new Error(`no se pudo leer el acceso: ${(profile.error ?? link.error ?? sub.error)!.message}`);
  const s = sub.data;
  const access = aiAccess({
    comp: COMP_USER_IDS.has(userId),
    isCoach: Boolean(profile.data?.is_coach),
    hasActiveCoach: (link.data ?? []).length > 0,
    subscription: s ? { status: s.status, paidUntil: s.paid_until, graceUntil: s.grace_until, priceMxn: s.price_mxn } : null,
    now,
  });
  // core.gen.js no trae tipos: el reason viene de src/core/access.ts (AccessReason).
  return { ai: access.ai, reason: access.reason as AccessResult['reason'], subscription: s ?? null };
}

/** Mensaje y código cuando no hay acceso: la app lo traduce a la pantalla de precios. */
export const NO_ACCESS = { error: 'subscription_required', message: 'El coach IA viene con Torq Coach IA. Suscríbete desde Plan o Perfil.' } as const;
