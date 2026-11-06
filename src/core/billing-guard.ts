// Límites contra intentos de más y señales de fraude en el cobro (ver
// docs/cobro-stripe.md, «Abuso y fraude»). Lógica pura: la aplican la función
// billing (intentos por usuario) y billing-webhook (prueba por tarjeta,
// disputas y alertas de fraude de Stripe).

export type GuardedAction = 'subscribe' | 'portal' | 'cancel';

/** Cuántas veces se puede pedir cada acción por hora y por día. Abrir el pago
 * tres o cuatro veces es normal (se arrepiente, cambia de tarjeta); veinte no. */
export const BILLING_LIMITS: Record<GuardedAction, { perHour: number; perDay: number }> = {
  subscribe: { perHour: 5, perDay: 15 },
  portal: { perHour: 10, perDay: 30 },
  cancel: { perHour: 10, perDay: 30 },
};

export function isGuardedAction(a: unknown): a is GuardedAction {
  return a === 'subscribe' || a === 'portal' || a === 'cancel';
}

/** ¿Ya hizo demasiados intentos? (`lastHour`/`lastDay` sin contar el actual). */
export function billingLimitReached(action: GuardedAction, lastHour: number, lastDay: number): boolean {
  const l = BILLING_LIMITS[action];
  return lastHour >= l.perHour || lastDay >= l.perDay;
}

/** La prueba es una por persona: si la tarjeta (su huella en Stripe, no el
 * número) ya se usó para una prueba de OTRA cuenta, se cobra desde el día 1. */
export function trialCardReused(previous: { user_id: string } | null | undefined, userId: string): boolean {
  return !!previous && previous.user_id !== userId;
}

/** Disputas que señalan fraude (tarjeta robada o cargo no reconocido). Las
 * demás (p. ej. «no recibí el producto») se atienden a mano. */
const FRAUD_DISPUTES = new Set(['fraudulent', 'unrecognized']);

export function disputeIsFraud(reason: string | null | undefined): boolean {
  return FRAUD_DISPUTES.has(reason ?? '');
}
