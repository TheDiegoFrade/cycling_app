// ¿Este usuario tiene la IA? La única fuente de verdad (la app solo muestra lo
// que esto decide). Reglas en src/core/access.ts: cortesía o suscripción al
// corriente (con gracia si falló un cobro). Todos pagan, coaches y atletas
// con coach incluidos. Cortesía = COMP_USER_IDS (equipo) o un cliente
// especial «gratis» vigente (billing_overrides, lo da un administrador).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { aiAccess, freeActive } from './core.gen.js';
import { COMP_USER_IDS } from './coach-access.ts';

export interface AccessResult {
  ai: boolean;
  reason: 'comp' | 'subscription' | 'grace' | 'none';
  subscription: { status: string; price_mxn: number; paid_until: string | null; grace_until: string | null } | null;
}

export async function loadAiAccess(admin: SupabaseClient, userId: string, now = new Date()): Promise<AccessResult> {
  const [sub, override] = await Promise.all([
    admin.from('subscriptions').select('status, price_mxn, paid_until, grace_until').eq('user_id', userId).maybeSingle(),
    admin.from('billing_overrides').select('kind, until').eq('user_id', userId).maybeSingle(),
  ]);
  // Si la tabla todavía no existe (SQL sin correr), nadie es especial; no se
  // rompe la IA de los demás por eso.
  if (override.error) console.warn('[access] billing_overrides', override.error.message);
  if (sub.error) throw new Error(`no se pudo leer el acceso: ${sub.error.message}`);
  const s = sub.data;
  const access = aiAccess({
    comp: COMP_USER_IDS.has(userId) || freeActive(override.error ? null : override.data, now),
    subscription: s ? { status: s.status, paidUntil: s.paid_until, graceUntil: s.grace_until, priceMxn: s.price_mxn } : null,
    now,
  });
  // core.gen.js no trae tipos: el reason viene de src/core/access.ts (AccessReason).
  return { ai: access.ai, reason: access.reason as AccessResult['reason'], subscription: s ?? null };
}

/** Mensaje y código cuando no hay acceso: la app lo traduce a la pantalla de precios. */
export const NO_ACCESS = { error: 'subscription_required', message: 'El coach IA viene con Torq Coach IA. Suscríbete desde Plan o Perfil.' } as const;
