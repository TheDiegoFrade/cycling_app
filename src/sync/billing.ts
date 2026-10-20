// Suscripción Torq Coach IA (Edge Function `billing`, ver
// supabase/functions/billing). El servidor decide el acceso; aquí solo se
// pregunta y se muestra.
import type { AccessReason } from '../core/access';
import { supabase } from '../supabase/client';

export interface BillingStatus {
  ai: boolean;
  reason: AccessReason;
  subscription: { status: string; price_mxn: number; paid_until: string | null; grace_until: string | null } | null;
  /** Precio al que se suscribiría ahora (399, o 299 de fundador). */
  priceMxn: number;
  /** Último día (YYYY-MM-DD) del precio de fundador, si aplica. */
  founderUntil?: string | null;
  /** false = Mercado Pago todavía no está configurado (no se puede cobrar). */
  billingReady: boolean;
  isAdmin: boolean;
}

/** null = no se pudo saber (sin internet o función no desplegada). */
export async function fetchBillingStatus(): Promise<BillingStatus | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'status' }, timeout: 15_000 });
    if (error || typeof data?.ai !== 'boolean') return null;
    return data as BillingStatus;
  } catch {
    return null;
  }
}

export type SubscribeResult = { initPoint: string } | { error: 'not_needed' | 'billing_not_ready' | 'failed' };

export async function startSubscription(): Promise<SubscribeResult> {
  if (!supabase) return { error: 'failed' };
  const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'subscribe' } });
  if (!error && typeof data?.initPoint === 'string') return { initPoint: data.initPoint };
  const code = await errorCode(error, data);
  return { error: code === 'not_needed' || code === 'billing_not_ready' ? code : 'failed' };
}

export async function cancelSubscription(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'cancel' } });
  return !error && data?.ok === true;
}

async function errorCode(error: unknown, data: { error?: string } | null): Promise<string | undefined> {
  if (data?.error) return data.error;
  if (error && typeof error === 'object' && 'context' in error) {
    return (error as { context: Response }).context
      .json()
      .then((j: { error?: string }) => j?.error)
      .catch(() => undefined);
  }
  return undefined;
}
