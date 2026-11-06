// Lo de Stripe que se puede probar sin red: cómo una suscripción o un cobro
// de Stripe se vuelve el estado de la suscripción en Torq (subscriptions, ver
// supabase/schema.sql) y cómo se separa el IVA de un cobro. Las llamadas a la
// API viven en supabase/functions/_shared/stripe.ts y en las funciones
// billing y billing-webhook. Ver docs/cobro-stripe.md.
import type { SubscriptionStatus } from './access';

/** Lo que nos importa de una suscripción de Stripe (timestamps en segundos). */
export interface StripeSubscriptionLike {
  status: string;
  cancel_at_period_end: boolean;
  /** Cancelación programada a una fecha (p. ej. desde el dashboard). */
  cancel_at?: number | null;
  trial_end?: number | null;
}

/** Margen tras el fin del periodo por si el siguiente cobro se procesa tarde. */
export const PAID_MARGIN_DAYS = 2;

const LIVE = new Set(['active', 'trialing', 'past_due']);

/** ¿Ya pidió cancelar? (se va al final del periodo, conserva lo pagado). */
export function cancelsAtPeriodEnd(sub: StripeSubscriptionLike): boolean {
  return sub.cancel_at_period_end || !!sub.cancel_at;
}

/** Estado de Stripe → estado en Torq (docs/cobro-stripe.md, «Mapeo de estado»).
 * past_due sigue autorizado: la gracia la abre invoice.payment_failed. */
export function stripeStatusOf(sub: StripeSubscriptionLike): SubscriptionStatus {
  if (LIVE.has(sub.status)) return cancelsAtPeriodEnd(sub) ? 'cancelled' : 'authorized';
  if (sub.status === 'paused') return 'paused';
  if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'incomplete_expired') return 'cancelled';
  return 'pending';
}

/** Pagado hasta: fin del periodo cobrado (segundos) + 2 días de margen. */
export function paidUntilFromPeriodEnd(periodEndS: number): string {
  return new Date((periodEndS + PAID_MARGIN_DAYS * 86_400) * 1000).toISOString();
}

/** Cambio en la fila de subscriptions por un aviso de suscripción. En prueba,
 * `paid_until` = fin de la prueba para que aiAccess dé acceso (con el margen
 * normal, salvo que ya haya cancelado: entonces termina justo al acabar la
 * prueba). Fuera de prueba, `paid_until` solo lo mueve invoice.paid. */
export function subscriptionChangeOf(sub: StripeSubscriptionLike): { status: SubscriptionStatus; paid_until?: string } {
  const status = stripeStatusOf(sub);
  if (sub.status === 'trialing' && sub.trial_end) {
    return {
      status,
      paid_until: cancelsAtPeriodEnd(sub) ? new Date(sub.trial_end * 1000).toISOString() : paidUntilFromPeriodEnd(sub.trial_end),
    };
  }
  return { status };
}

/** ¿Se puede reactivar sin pasar por Checkout? (canceló pero sigue viva). */
export function resumable(sub: StripeSubscriptionLike): boolean {
  return (sub.status === 'active' || sub.status === 'trialing') && cancelsAtPeriodEnd(sub);
}

/** ¿La suscripción sigue existiendo en Stripe (puede volver a cobrar)? */
export function stillLive(sub: StripeSubscriptionLike): boolean {
  return LIVE.has(sub.status) || sub.status === 'unpaid' || sub.status === 'paused';
}

/** Una sola prueba por cuenta: no la tiene quien ya tuvo una suscripción con
 * Stripe o un periodo pagado (también con Mercado Pago). Un Checkout que se
 * abandonó no cuenta: ahí todavía no hay `stripe_subscription_id`. */
export function trialEligible(row: { stripe_subscription_id?: string | null; paid_until?: string | null } | null | undefined): boolean {
  return !row || (!row.stripe_subscription_id && !row.paid_until);
}

/** La fecha más lejana (ISO): un aviso viejo que llega tarde no recorta lo pagado. */
export function laterIso(current: string | null | undefined, next: string): string {
  return current && new Date(current).getTime() > new Date(next).getTime() ? current : next;
}

/** IVA incluido (16 %), en centavos: base = round(total / 1.16), IVA = el resto. */
export function ivaSplit(totalCents: number): { base_cents: number; iva_cents: number } {
  const base = Math.round(totalCents / 1.16);
  return { base_cents: base, iva_cents: totalCents - base };
}
