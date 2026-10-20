// Lo de Mercado Pago que se puede probar sin red: la firma de los avisos
// (webhooks) y cómo un cobro o una suscripción de Mercado Pago se vuelve el
// estado de la suscripción en Torq (subscriptions, ver supabase/schema.sql).
// Las llamadas a la API viven en supabase/functions/_shared/mercadopago.ts.
import { GRACE_DAYS } from './access';
import type { SubscriptionStatus } from './access';

/** Lo que nos importa de una suscripción (preapproval) de Mercado Pago. */
export interface MpPreapproval {
  id: string;
  status: string;
  external_reference?: string | null;
  auto_recurring?: { transaction_amount?: number; currency_id?: string } | null;
  next_payment_date?: string | null;
}

/** Lo que nos importa de un cobro de una suscripción (authorized_payment). */
export interface MpAuthorizedPayment {
  id: string | number;
  preapproval_id: string;
  status?: string | null;
  payment?: { id?: string | number; status?: string | null } | null;
  debit_date?: string | null;
  date_created?: string | null;
}

const STATUSES: readonly SubscriptionStatus[] = ['pending', 'authorized', 'paused', 'cancelled'];

export function subscriptionStatusOf(mpStatus: string | null | undefined): SubscriptionStatus {
  return STATUSES.includes(mpStatus as SubscriptionStatus) ? (mpStatus as SubscriptionStatus) : 'pending';
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function addMonthIso(iso: string): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

/** Cómo cambia la suscripción con un cobro:
 * - aprobado: pagado hasta un mes después del cobro (+2 días de margen por si
 *   el siguiente cobro se procesa tarde), y se quita la gracia;
 * - rechazado: se abre la gracia (si no estaba abierta) para que actualice
 *   su tarjeta sin perder el acceso de golpe.
 * null = el cobro todavía no se resuelve (programado, en reintento). */
export function applyPayment(p: MpAuthorizedPayment, now: Date): { paidUntil?: string; graceUntil: string | null } | null {
  const paymentStatus = p.payment?.status ?? null;
  const when = p.debit_date ?? p.date_created ?? now.toISOString();
  if (paymentStatus === 'approved') return { paidUntil: addDaysIso(addMonthIso(when), 2), graceUntil: null };
  if (paymentStatus === 'rejected' || p.status === 'recycling') return { graceUntil: addDaysIso(now.toISOString(), GRACE_DAYS) };
  return null;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Revisa la firma `x-signature` de un aviso de Mercado Pago (HMAC-SHA256 con
 * la clave secreta del webhook sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`).
 * Sin esto, cualquiera podría mandarnos un «pago aprobado» falso. */
export async function verifyMpSignature(opts: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  /** Avisos más viejos que esto se rechazan (default 10 min). */
  maxAgeS?: number;
  now?: Date;
}): Promise<boolean> {
  if (!opts.signature || !opts.dataId || !opts.secret) return false;
  const parts = Object.fromEntries(
    opts.signature.split(',').map((kv) => {
      const [k, ...v] = kv.split('=');
      return [k.trim(), v.join('=').trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  const nowMs = (opts.now ?? new Date()).getTime();
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > (opts.maxAgeS ?? 600) * 1000) return false;
  // Mercado Pago pide el id en minúsculas cuando es alfanumérico.
  const id = /^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  const manifest = `id:${id};${opts.requestId ? `request-id:${opts.requestId};` : ''}ts:${ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(opts.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)));
  // comparación sin atajos (mismo tiempo sin importar dónde difiere)
  if (mac.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
