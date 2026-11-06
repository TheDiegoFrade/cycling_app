// Avisos de Stripe (webhook). Se configura en Stripe → Developers → Webhooks,
// apuntando a <SUPABASE_URL>/functions/v1/billing-webhook, con los eventos:
//   checkout.session.completed
//   customer.subscription.created / updated / deleted
//   invoice.paid, invoice.payment_failed
//   charge.refunded
//   charge.dispute.created, radar.early_fraud_warning.created   (fraude)
// Va con --no-verify-jwt: Stripe no manda sesión; en su lugar se verifica su
// firma (stripe-signature) con STRIPE_WEBHOOK_SECRET sobre el cuerpo crudo.
// El estado de una suscripción se vuelve a pedir a Stripe (los avisos pueden
// llegar en desorden). Ver docs/cobro-stripe.md, fase 3.3.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cryptoProvider, idOf, stripe } from '../_shared/stripe.ts';
import type { Stripe } from '../_shared/stripe.ts';
import { GRACE_DAYS, disputeIsFraud, effectivePriceMxn, ivaSplit, laterIso, paidUntilFromPeriodEnd, stillLive, subscriptionChangeOf, trialCardReused } from '../_shared/core.gen.js';

const text = (body: string, status: number) => new Response(body, { status });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return text('ok', 200);
  const raw = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return text('falta la firma', 400);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '', undefined, cryptoProvider);
  } catch (err) {
    console.warn('[billing-webhook] firma inválida', (err as Error).message);
    return text('firma inválida', 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Stripe reintenta si no contestamos 2xx: cada aviso se procesa una sola vez.
  const { error: dup } = await admin.from('billing_events').insert({ id: event.id, kind: event.type });
  if (dup) {
    if (dup.code === '23505') return text('ok', 200); // ya se procesó
    console.error('[billing-webhook] billing_events', dup);
    return text('error', 500);
  }

  try {
    const userId = await handle(admin, event);
    if (userId) await admin.from('billing_events').update({ user_id: userId }).eq('id', event.id);
    return text('ok', 200);
  } catch (err) {
    console.error('[billing-webhook]', event.type, event.id, err);
    // se borra la marca para que el reintento de Stripe lo vuelva a procesar
    await admin.from('billing_events').delete().eq('id', event.id);
    return text('error', 500);
  }
});

/** Procesa el aviso. Regresa el usuario al que corresponde (si se supo). */
async function handle(admin: SupabaseClient, event: Stripe.Event): Promise<string | null> {
  const now = new Date();
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const subId = idOf(session.subscription);
      if (session.mode !== 'subscription' || !subId) return null;
      return syncSubscription(admin, subId, session.client_reference_id);
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return syncSubscription(admin, event.data.object.id, event.data.object.metadata?.user_id ?? null);
    case 'customer.subscription.deleted': {
      // Final: solo cambia la fila si es SU suscripción (no una anterior).
      const sub = event.data.object;
      const { data } = await admin
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: now.toISOString() })
        .eq('stripe_subscription_id', sub.id)
        .select('user_id');
      return data?.[0]?.user_id ?? null;
    }
    case 'invoice.paid':
      return invoicePaid(admin, event.data.object, event.created);
    case 'invoice.payment_failed': {
      const subId = subscriptionOfInvoice(event.data.object);
      if (!subId) return null;
      const row = await rowForSubscription(admin, subId);
      if (!row) return null;
      // La gracia es para quien ya pagó al menos una vez (se le venció la
      // tarjeta, no tenía saldo ese día). El primer cobro tras la prueba, o el
      // de una prueba cortada por tarjeta repetida, no la abre: si no, una
      // tarjeta sin fondos daría 7 días más gratis. Se abre una vez; los
      // reintentos no la alargan.
      const { count: paidBefore, error: payErr } = await admin
        .from('billing_payments')
        .select('stripe_invoice_id', { count: 'exact', head: true })
        .eq('user_id', row.user_id)
        .is('refunded_at', null);
      if (payErr) throw new Error(`billing_payments: ${payErr.message}`);
      if (!paidBefore) {
        console.warn('[billing-webhook] primer cobro rechazado: sin gracia', row.user_id, subId);
        return row.user_id;
      }
      if (!row.grace_until || new Date(row.grace_until) <= now) {
        const graceUntil = new Date(now.getTime() + GRACE_DAYS * 86_400_000).toISOString();
        await mustUpdate(admin.from('subscriptions').update({ grace_until: graceUntil, updated_at: now.toISOString() }).eq('user_id', row.user_id));
      }
      return row.user_id;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      // Solo un reembolso total saca el cobro de la factura global; uno
      // parcial necesita nota de crédito a mano (docs/cobro-stripe.md, fase 5).
      if (!charge.refunded) {
        console.warn('[billing-webhook] reembolso parcial: revisar a mano', charge.id, charge.amount_refunded);
        return null;
      }
      const { data } = await admin
        .from('billing_payments')
        .update({ refunded_at: now.toISOString() })
        .eq('stripe_charge_id', charge.id)
        .is('refunded_at', null)
        .select('user_id');
      return data?.[0]?.user_id ?? null;
    }
    case 'radar.early_fraud_warning.created': {
      // El banco avisa que el cargo parece fraude. Stripe recomienda
      // reembolsarlo ya: evita la disputa y su comisión.
      const efw = event.data.object;
      const chargeId = idOf(efw.charge);
      if (!chargeId) return null;
      await refundCharge(chargeId);
      return flagFraud(admin, chargeId, `alerta de fraude (${efw.fraud_type})`);
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      const chargeId = idOf(dispute.charge);
      if (!chargeId) return null;
      if (!disputeIsFraud(dispute.reason)) {
        console.warn('[billing-webhook] disputa (no es fraude): revisar a mano', dispute.id, dispute.reason);
        return null;
      }
      return flagFraud(admin, chargeId, `disputa (${dispute.reason})`);
    }
    default:
      return null;
  }
}

async function refundCharge(chargeId: string): Promise<void> {
  try {
    await stripe.refunds.create({ charge: chargeId });
  } catch (err) {
    if ((err as { code?: string }).code !== 'charge_already_refunded') throw err;
  }
}

/** Cargo fraudulento: se cancelan de inmediato las suscripciones de ese
 * cliente, se quita la IA y la cuenta queda marcada (no puede volver a
 * suscribirse hasta que un administrador quite la marca). */
async function flagFraud(admin: SupabaseClient, chargeId: string, reason: string): Promise<string | null> {
  const charge = await stripe.charges.retrieve(chargeId);
  const customerId = idOf(charge.customer);
  if (!customerId) return null;
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  for (const s of subs.data) if (stillLive(s)) await stripe.subscriptions.cancel(s.id);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('subscriptions')
    .update({ status: 'cancelled', paid_until: now, grace_until: null, fraud_flag_at: now, fraud_reason: reason, updated_at: now })
    .eq('stripe_customer_id', customerId)
    .select('user_id');
  if (error) throw new Error(`subscriptions: ${error.message}`);
  console.warn('[billing-webhook] cuenta marcada por fraude', customerId, reason);
  return data?.[0]?.user_id ?? null;
}

/** Una prueba por persona: si la tarjeta con la que empezó esta prueba ya
 * empezó otra en OTRA cuenta, la prueba se termina ya y se cobra hoy.
 * Regresa true si la terminó. */
async function endTrialIfCardReused(admin: SupabaseClient, sub: Stripe.Subscription, userId: string): Promise<boolean> {
  const pmId = idOf(sub.default_payment_method);
  if (!pmId) return false;
  const pm = await stripe.paymentMethods.retrieve(pmId);
  const fingerprint = pm.card?.fingerprint;
  if (!fingerprint) return false;
  const { error } = await admin
    .from('billing_trial_cards')
    .upsert({ fingerprint, user_id: userId, stripe_subscription_id: sub.id }, { onConflict: 'fingerprint', ignoreDuplicates: true });
  if (error) throw new Error(`billing_trial_cards: ${error.message}`);
  const { data: first } = await admin.from('billing_trial_cards').select('user_id, stripe_subscription_id').eq('fingerprint', fingerprint).maybeSingle();
  if (!trialCardReused(first, userId) || first?.stripe_subscription_id === sub.id) return false;
  console.warn('[billing-webhook] tarjeta ya usada en la prueba de otra cuenta: se cobra hoy', sub.id, userId);
  await stripe.subscriptions.update(sub.id, { trial_end: 'now' });
  return true;
}

interface Row {
  user_id: string;
  status: string;
  paid_until: string | null;
  grace_until: string | null;
  stripe_subscription_id: string | null;
}

const ROW_COLS = 'user_id, status, paid_until, grace_until, stripe_subscription_id';

/** La fila de Torq de esta suscripción. Si todavía no está ligada (el aviso
 * llegó antes que checkout.session.completed), la liga con metadata.user_id. */
async function rowForSubscription(admin: SupabaseClient, subId: string): Promise<Row | null> {
  const { data, error } = await admin.from('subscriptions').select(ROW_COLS).eq('stripe_subscription_id', subId).maybeSingle();
  if (error) throw new Error(`subscriptions: ${error.message}`);
  if (data) return data as Row;
  const userId = await syncSubscription(admin, subId, null);
  if (!userId) return null;
  const again = await admin.from('subscriptions').select(ROW_COLS).eq('user_id', userId).eq('stripe_subscription_id', subId).maybeSingle();
  return (again.data as Row | null) ?? null;
}

/** Trae la suscripción de Stripe (estado actual, no el del aviso), la liga a
 * su usuario si hace falta y copia su estado a `subscriptions`. */
async function syncSubscription(admin: SupabaseClient, subId: string, hintUserId: string | null): Promise<string | null> {
  const sub = await stripe.subscriptions.retrieve(subId, { expand: ['discounts.source.coupon'] });
  const customerId = idOf(sub.customer);
  const { data: linked } = await admin.from('subscriptions').select(ROW_COLS).eq('stripe_subscription_id', subId).maybeSingle();
  let row = linked as Row | null;
  if (!row) {
    // Nunca se confía en el aviso para decir de quién es: el user_id sale de la
    // metadata que puso billing al crear el Checkout (o del client_reference_id).
    const userId = sub.metadata?.user_id || hintUserId;
    if (!userId) {
      console.warn('[billing-webhook] suscripción sin user_id', subId);
      return null;
    }
    const { data: mine, error } = await admin.from('subscriptions').select(ROW_COLS).eq('user_id', userId).maybeSingle();
    if (error) throw new Error(`subscriptions: ${error.message}`);
    if (!mine) {
      console.warn('[billing-webhook] suscripción de un usuario sin fila', subId, userId);
      return null;
    }
    // ¿Ya tenía OTRA suscripción viva (dos Checkouts abiertos a la vez)? Se
    // queda la primera y esta se cancela y reembolsa: nunca cobrar doble.
    if (mine.stripe_subscription_id && mine.stripe_subscription_id !== subId && mine.status !== 'pending') {
      const other = await stripe.subscriptions.retrieve(mine.stripe_subscription_id).catch(() => null);
      if (other && stillLive(other)) {
        await cancelDuplicate(sub);
        return userId;
      }
    }
    await mustUpdate(
      admin.from('subscriptions').update({ stripe_subscription_id: subId, stripe_customer_id: customerId, provider: 'stripe' }).eq('user_id', userId),
    );
    row = { ...(mine as Row), stripe_subscription_id: subId };
  }
  let current = sub;
  let trialEnded = false;
  if (sub.status === 'trialing' && (await endTrialIfCardReused(admin, sub, row.user_id))) {
    current = await stripe.subscriptions.retrieve(subId, { expand: ['discounts.source.coupon'] });
    trialEnded = true;
  }
  const change = subscriptionChangeOf(current);
  const patch: Record<string, unknown> = { status: change.status, updated_at: new Date().toISOString() };
  if (change.paid_until) patch.paid_until = current.cancel_at_period_end || current.cancel_at ? change.paid_until : laterIso(row.paid_until, change.paid_until);
  // Sin prueba: el acceso lo da el cobro (invoice.paid), no la prueba que ya se terminó.
  if (trialEnded) patch.paid_until = new Date().toISOString();
  // Precio que paga: el de lista menos su descuento vigente (cliente especial).
  const unit = current.items.data[0]?.price?.unit_amount;
  if (unit != null) patch.price_mxn = effectivePriceMxn(unit, discountsOf(current), Math.floor(Date.now() / 1000));
  await mustUpdate(admin.from('subscriptions').update(patch).eq('user_id', row.user_id).eq('stripe_subscription_id', subId));
  return row.user_id;
}

async function cancelDuplicate(sub: Stripe.Subscription): Promise<void> {
  console.warn('[billing-webhook] suscripción duplicada: se cancela', sub.id);
  if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') await stripe.subscriptions.cancel(sub.id);
  const invoiceId = idOf(sub.latest_invoice);
  if (!invoiceId) return;
  const payments = await stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid' });
  for (const p of payments.data) {
    const pi = idOf(p.payment.payment_intent);
    const charge = idOf(p.payment.charge);
    try {
      if (pi) await stripe.refunds.create({ payment_intent: pi });
      else if (charge) await stripe.refunds.create({ charge });
    } catch (err) {
      // otro aviso de la misma suscripción ya lo reembolsó
      if ((err as { code?: string }).code !== 'charge_already_refunded') throw err;
    }
  }
}

function subscriptionOfInvoice(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription ?? null);
}

/** Cobro pagado: paid_until = fin del periodo cobrado + 2 días, se cierra la
 * gracia y se guarda el cobro para la factura global (si no fue de $0). */
async function invoicePaid(admin: SupabaseClient, invoice: Stripe.Invoice, eventCreated: number): Promise<string | null> {
  const subId = subscriptionOfInvoice(invoice);
  if (!subId) return null;
  const row = await rowForSubscription(admin, subId);
  if (!row) return null;
  const line = invoice.lines.data.find((l) => l.parent?.type === 'subscription_item_details') ?? invoice.lines.data[0];
  const periodEnd = line?.period?.end ?? invoice.period_end;
  const paidUntil = laterIso(row.paid_until, paidUntilFromPeriodEnd(periodEnd));
  await mustUpdate(
    admin.from('subscriptions').update({ paid_until: paidUntil, grace_until: null, updated_at: new Date().toISOString() }).eq('user_id', row.user_id).eq('stripe_subscription_id', subId),
  );

  const total = invoice.amount_paid;
  if (!total) return row.user_id; // la factura de $0 al empezar la prueba
  const charge = await chargeOfInvoice(invoice.id!);
  const { base_cents, iva_cents } = ivaSplit(total);
  const paidAt = invoice.status_transitions?.paid_at ?? eventCreated;
  const { error } = await admin.from('billing_payments').upsert(
    {
      stripe_invoice_id: invoice.id,
      user_id: row.user_id,
      stripe_subscription_id: subId,
      stripe_charge_id: charge?.id ?? null,
      total_cents: total,
      base_cents,
      iva_cents,
      currency: invoice.currency,
      card_funding: charge?.payment_method_details?.card?.funding ?? null,
      paid_at: new Date(paidAt * 1000).toISOString(),
    },
    { onConflict: 'stripe_invoice_id', ignoreDuplicates: true },
  );
  if (error) throw new Error(`billing_payments: ${error.message}`);
  return row.user_id;
}

/** El cargo con el que se pagó la factura (folio y tipo de tarjeta). */
async function chargeOfInvoice(invoiceId: string): Promise<Stripe.Charge | null> {
  const payments = await stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', expand: ['data.payment.payment_intent.latest_charge', 'data.payment.charge'] });
  for (const p of payments.data) {
    const direct = p.payment.charge;
    if (direct && typeof direct !== 'string') return direct;
    const pi = p.payment.payment_intent;
    if (pi && typeof pi !== 'string' && pi.latest_charge && typeof pi.latest_charge !== 'string') return pi.latest_charge;
  }
  return null;
}

async function mustUpdate(q: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await q;
  if (error) throw new Error(`subscriptions: ${error.message}`);
}

/** Los descuentos de una suscripción (con su cupón expandido). */
function discountsOf(sub: Stripe.Subscription): Array<{ end: number | null; percent_off: number | null; amount_off: number | null }> {
  const out: Array<{ end: number | null; percent_off: number | null; amount_off: number | null }> = [];
  for (const d of sub.discounts ?? []) {
    if (typeof d === 'string') continue;
    const c = d.source?.coupon;
    if (!c || typeof c === 'string') continue;
    out.push({ end: d.end, percent_off: c.percent_off, amount_off: c.amount_off });
  }
  return out;
}
