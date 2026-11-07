// Quién tiene la IA (coach IA y chat abierto de Piñón) y por qué. Lógica pura:
// la usa el servidor para decidir (supabase/functions/_shared/access.ts) y la
// app para mostrar el estado. Ver docs/evaluaciones/2026-10-20-ux-flujos.md,
// «Decisión de planes»:
//  - Atleta sin coach: suscripción Torq Coach IA ($349 al mes, cobro con Stripe;
//    ver docs/cobro-stripe.md).
//  - Coach (por invitación) y atleta con coach vinculado: gratis.
//  - Cuentas de cortesía (equipo y pruebas): gratis.

/** Precio en MXN al mes, IVA incluido. Es el de respaldo: el que se cobra de
 * verdad sale del precio de Stripe del lookup key vigente
 * (STRIPE_CHECKOUT_LOOKUP_KEY), y cada suscripción guarda el suyo. */
export const PRICE_MXN = 349;

/** Días de prueba la primera vez que alguien se suscribe (una por cuenta). */
export const TRIAL_DAYS = 7;

/** Días de gracia tras un cobro rechazado antes de quitar el acceso. */
export const GRACE_DAYS = 7;

export type SubscriptionStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface SubscriptionState {
  status: SubscriptionStatus;
  /** Hasta cuándo está pagado (fin del periodo en curso). */
  paidUntil: string | null;
  /** Si el último cobro falló: hasta cuándo se le sigue dando acceso. */
  graceUntil: string | null;
  priceMxn: number;
}

export interface AccessInput {
  comp: boolean;
  isCoach: boolean;
  hasActiveCoach: boolean;
  subscription: SubscriptionState | null;
  now: Date;
}

export type AccessReason = 'comp' | 'coach' | 'coached' | 'subscription' | 'grace' | 'none';

export interface Access {
  ai: boolean;
  reason: AccessReason;
}

const after = (iso: string | null, now: Date) => !!iso && new Date(iso).getTime() > now.getTime();

export function aiAccess(i: AccessInput): Access {
  if (i.comp) return { ai: true, reason: 'comp' };
  if (i.isCoach) return { ai: true, reason: 'coach' };
  if (i.hasActiveCoach) return { ai: true, reason: 'coached' };
  const s = i.subscription;
  if (s) {
    if (s.status === 'authorized' && (s.paidUntil === null || after(s.paidUntil, i.now))) return { ai: true, reason: 'subscription' };
    // Cobro rechazado: unos días para actualizar la tarjeta sin perder nada.
    if (after(s.graceUntil, i.now)) return { ai: true, reason: 'grace' };
    // Canceló: conserva lo que ya pagó hasta el fin del periodo.
    if ((s.status === 'cancelled' || s.status === 'paused') && after(s.paidUntil, i.now)) return { ai: true, reason: 'subscription' };
  }
  return { ai: false, reason: 'none' };
}

/** Edad mínima para usar Torq (términos §2). */
export const MIN_AGE = 18;
