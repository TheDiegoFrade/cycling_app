// Suscripción Torq Coach IA (Edge Function `billing`, ver
// supabase/functions/billing). El servidor decide el acceso; aquí solo se
// pregunta y se muestra.
import type { AccessReason } from '../core/access';
import type { SaleRow } from '../core/sales';
import { supabase } from '../supabase/client';

export interface BillingStatus {
  ai: boolean;
  reason: AccessReason;
  subscription: { status: string; price_mxn: number; paid_until: string | null; grace_until: string | null } | null;
  /** Precio al que se suscribiría ahora (MXN al mes, IVA incluido). */
  priceMxn: number;
  /** Días de prueba que tendría al suscribirse (0 si ya tuvo una suscripción). */
  trialDays?: number;
  /** false = el cobro (Stripe) todavía no está configurado. */
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

/** Link al portal de Stripe para actualizar la tarjeta (null si no se pudo). */
export async function openBillingPortal(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'portal' } });
  return !error && typeof data?.url === 'string' ? data.url : null;
}

export async function cancelSubscription(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'cancel' } });
  return !error && data?.ok === true;
}

/** Solo administradores: cobros del mes (YYYY-MM) para la factura global. */
export async function fetchSales(month: string): Promise<{ data?: { month: string; rows: SaleRow[] }; error?: string }> {
  if (!supabase) return { error: 'failed' };
  const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'sales', month } });
  if (!error && Array.isArray(data?.rows)) return { data };
  return { error: (await errorCode(error, data)) ?? 'failed' };
}

/** Solo administradores: guarda el UUID de la global del mes. */
export async function setSalesCfdi(month: string, uuid: string): Promise<{ updated?: number; error?: string }> {
  if (!supabase) return { error: 'failed' };
  const { data, error } = await supabase.functions.invoke('billing', { body: { action: 'sales_set_cfdi', month, uuid } });
  if (!error && data?.ok === true) return { updated: data.updated };
  return { error: (await errorCode(error, data)) ?? 'failed' };
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
