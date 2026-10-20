// Quién tiene la IA (coach IA y chat abierto de Piñón) y por qué. Lógica pura:
// la usa el servidor para decidir (supabase/functions/_shared/access.ts) y la
// app para mostrar el estado. Ver docs/evaluaciones/2026-10-20-ux-flujos.md,
// «Decisión de planes»:
//  - Atleta sin coach: suscripción Torq Coach IA ($399, o $299 de fundador).
//  - Coach (por invitación) y atleta con coach vinculado: gratis.
//  - Cuentas de cortesía (equipo y pruebas): gratis.

/** Precios en MXN al mes, IVA incluido. */
export const PRICE_MXN = 399;
export const FOUNDER_PRICE_MXN = 299;

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

/** Precio al suscribirse: el de fundador si es antes de la fecha límite
 * (`founderUntil`, YYYY-MM-DD; sin fecha, no hay precio de fundador). Se
 * conserva mientras la suscripción siga activa: lo decide quien la crea, una
 * sola vez. */
export function priceForNewSubscription(now: Date, founderUntil: string | null | undefined): number {
  if (!founderUntil || !/^\d{4}-\d{2}-\d{2}$/.test(founderUntil)) return PRICE_MXN;
  return now.getTime() < new Date(`${founderUntil}T23:59:59-06:00`).getTime() ? FOUNDER_PRICE_MXN : PRICE_MXN;
}

/** Edad mínima para usar Torq (términos §2). */
export const MIN_AGE = 18;
