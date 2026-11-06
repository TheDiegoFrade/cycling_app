// Suscripción Torq Coach IA con Stripe. Una sola función con acciones
// (como la usa la app: supabase.functions.invoke('billing', { body: { action } })):
//  - status: qué acceso tiene la persona y a qué precio se suscribiría.
//  - subscribe: regresa el link de Stripe Checkout (o reactiva una suscripción
//    que se canceló pero sigue pagada, sin volver a cobrar).
//  - cancel: cancela al final del periodo; conserva el acceso hasta lo pagado.
//  - portal: link al portal de Stripe para actualizar la tarjeta.
//  - sales / sales_set_cfdi (solo administradores): cobros del mes para la
//    factura global y el UUID del CFDI ya timbrado.
//  - overrides_list / override_set / override_remove (solo administradores):
//    clientes especiales, gratis o con descuento (billing_overrides).
// Los avisos de Stripe llegan a billing-webhook (otra función: esa no lleva
// sesión de usuario). Ver docs/cobro-stripe.md.
//
// Contra abuso (docs/cobro-stripe.md, «Abuso y fraude»): subscribe, portal y
// cancel tienen un límite de intentos por hora y por día (billing_attempts);
// una cuenta marcada por fraude no puede suscribirse; y solo hay un Checkout
// abierto por persona (se reutiliza en vez de crear otro en cada clic).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { loadAiAccess } from '../_shared/access.ts';
import { ADMIN_USER_IDS } from '../_shared/coach-access.ts';
import { appUrl as appUrlFromEnv } from '../_shared/mailer.ts';
import { checkoutPrice, ensureCoupon, idOf, stripe, stripeConfigured } from '../_shared/stripe.ts';
import { PRICE_MXN, TRIAL_DAYS, billingLimitReached, couponIdFor, discountedPriceMxn, freeActive, freeUntil, parseOverrideInput, isCfdiUuid, isGuardedAction, isValidMonthKey, mxMonthRange, previousMonthKey, resumable, stillLive, trialEligible } from '../_shared/core.gen.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface SubRow {
  status: string;
  price_mxn: number;
  paid_until: string | null;
  grace_until: string | null;
  provider: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  fraud_flag_at: string | null;
}

interface OverrideRow {
  kind: 'free' | 'discount';
  percent_off: number | null;
  months: number | null;
  until: string | null;
  stripe_coupon_id: string | null;
}

/** Cuánto dura abierto un link de Checkout (Stripe pide entre 30 min y 24 h). */
const CHECKOUT_TTL_S = 60 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? 'status';
    const now = new Date();
    const [access, rowRes, overrideRes] = await Promise.all([
      loadAiAccess(admin, userId, now),
      admin.from('subscriptions').select('status, price_mxn, paid_until, grace_until, provider, stripe_customer_id, stripe_subscription_id, fraud_flag_at').eq('user_id', userId).maybeSingle(),
      admin.from('billing_overrides').select('kind, percent_off, months, until, stripe_coupon_id').eq('user_id', userId).maybeSingle(),
    ]);
    if (rowRes.error) throw new Error(`no se pudo leer la suscripción: ${rowRes.error.message}`);
    const row = rowRes.data as SubRow | null;
    // Cliente especial (lo decide un administrador). Sin la tabla, nadie lo es.
    const override = overrideRes.error ? null : (overrideRes.data as OverrideRow | null);
    const discount = override?.kind === 'discount' && override.percent_off ? override : null;
    // Quien canceló y regresa antes de que termine lo pagado reactiva su
    // misma suscripción y conserva su precio. Si ya venció, entra al vigente.
    const keepsPrice = !!row?.stripe_subscription_id && row.status === 'cancelled' && !!row.paid_until && new Date(row.paid_until) > now;
    const appUrl = appUrlFromEnv();

    if (action === 'status') {
      let priceMxn = PRICE_MXN;
      let priceMxnList = PRICE_MXN;
      // keepsPrice: price_mxn ya es lo que paga (con su descuento, si tiene).
      if (keepsPrice) priceMxn = row!.price_mxn;
      else {
        if (stripeConfigured()) {
          try {
            priceMxn = (await checkoutPrice()).priceMxn;
          } catch (err) {
            console.error('[billing] precio de Stripe', err);
          }
        }
        priceMxnList = priceMxn;
        priceMxn = discountedPriceMxn(priceMxn, discount?.percent_off);
      }
      return json({
        ...access,
        priceMxn,
        // Cliente especial: su descuento (para mostrarlo junto al precio) o
        // hasta cuándo no paga (null = siempre).
        discountPercent: discount?.percent_off ?? null,
        listPriceMxn: discount && !keepsPrice ? priceMxnList : null,
        discountMonths: discount?.months ?? null,
        compUntil: freeActive(override, now) ? override!.until : null,
        // Días de prueba que tendría al suscribirse (0 si ya tuvo).
        trialDays: !keepsPrice && !row?.fraud_flag_at && trialEligible(row) ? TRIAL_DAYS : 0,
        billingReady: stripeConfigured(),
        isAdmin: ADMIN_USER_IDS.has(userId),
      });
    }

    // Antes de cualquier acción que llame a Stripe por esta persona: ¿cuenta
    // bloqueada o demasiados intentos? El intento cuenta aunque luego falle.
    if (isGuardedAction(action)) {
      if (action === 'subscribe' && row?.fraud_flag_at) return json({ error: 'blocked' }, 403);
      const attempts = (since: number) =>
        admin.from('billing_attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('action', action).gte('at', new Date(now.getTime() - since).toISOString());
      const [hour, day] = await Promise.all([attempts(3_600_000), attempts(86_400_000)]);
      if (hour.error || day.error) throw new Error(`billing_attempts: ${(hour.error ?? day.error)!.message}`);
      if (billingLimitReached(action, hour.count ?? 0, day.count ?? 0)) {
        console.warn('[billing] demasiados intentos', userId, action, hour.count, day.count);
        return json({ error: 'too_many_attempts' }, 429);
      }
      await admin.from('billing_attempts').insert({ user_id: userId, action });
      // los de hace más de 2 días ya no cuentan para nada
      await admin.from('billing_attempts').delete().eq('user_id', userId).lt('at', new Date(now.getTime() - 2 * 86_400_000).toISOString());
    }

    if (action === 'subscribe') {
      const cancelledButPaid = access.reason === 'subscription' && access.subscription?.status === 'cancelled';
      if (access.ai && access.reason !== 'grace' && !cancelledButPaid) return json({ error: 'not_needed', reason: access.reason }, 409);
      if (!stripeConfigured()) return json({ error: 'billing_not_ready' }, 503);

      // ¿Ya tiene una suscripción viva en Stripe? Nunca abrir una segunda.
      if (row?.stripe_subscription_id) {
        const current = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        if (resumable(current)) {
          // Canceló pero sigue pagada: se quita la cancelación (mismo precio,
          // sin cobro nuevo). El aviso customer.subscription.updated lo confirma.
          await stripe.subscriptions.update(current.id, current.cancel_at_period_end ? { cancel_at_period_end: false } : { cancel_at: '' });
          await admin.from('subscriptions').update({ status: 'authorized', updated_at: now.toISOString() }).eq('user_id', userId);
          return json({ initPoint: `${appUrl}/?billing=return#/profile`, priceMxn: row.price_mxn });
        }
        if (stillLive(current)) {
          if (current.status === 'active' || current.status === 'trialing') return json({ error: 'not_needed', reason: 'subscription' }, 409);
          // past_due / unpaid / paused: lo que falta es la tarjeta, no otra suscripción.
          const portal = await stripe.billingPortal.sessions.create({ customer: idOf(current.customer)!, return_url: `${appUrl}/#/profile`, locale: 'es-419' });
          return json({ initPoint: portal.url, priceMxn: row.price_mxn });
        }
      }

      const { data: user } = await admin.auth.admin.getUserById(userId);
      const email = user?.user?.email;
      if (!email) return json({ error: 'sin correo en la cuenta' }, 400);
      const price = await checkoutPrice();
      const customer = row?.stripe_customer_id ?? (await stripe.customers.create({ email, metadata: { user_id: userId } })).id;
      // Se guarda antes de abrir Checkout: así no se crea otro Customer si la
      // persona lo abre dos veces. Se conservan paid_until y grace_until, y
      // «cancelled» (si le quedan días pagados, no los pierde por abrir Checkout).
      const { error } = await admin.from('subscriptions').upsert({
        user_id: userId,
        status: row?.status === 'cancelled' ? 'cancelled' : 'pending',
        price_mxn: price.priceMxn,
        provider: 'stripe',
        stripe_customer_id: customer,
        paid_until: row?.paid_until ?? null,
        grace_until: row?.grace_until ?? null,
        updated_at: now.toISOString(),
      });
      if (error) throw new Error(`no se pudo guardar la suscripción: ${error.message}`);
      const firstTime = trialEligible(row);
      const trial = firstTime ? '1' : '0';
      // Cliente con descuento: el cupón se aplica en Checkout y sigue en cada cobro.
      const coupon = discount ? await ensureCoupon(couponIdFor(discount.percent_off!, discount.months), discount.percent_off!, discount.months) : '';
      // Un solo Checkout abierto por persona: si ya hay uno con el mismo precio
      // y la misma prueba, se reutiliza; los demás se cierran. Así no se pueden
      // pagar dos suscripciones a la vez ni generar links sin fin.
      const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 10 });
      const reuse = open.data.find((s) => s.url && s.metadata?.user_id === userId && s.metadata?.price_id === price.id && s.metadata?.trial === trial && (s.metadata?.coupon ?? '') === coupon);
      for (const s of open.data) if (s.id !== reuse?.id) await stripe.checkout.sessions.expire(s.id).catch(() => null);
      const priceMxn = discountedPriceMxn(price.priceMxn, discount?.percent_off);
      if (reuse?.url) return json({ initPoint: reuse.url, priceMxn });
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        line_items: [{ price: price.id, quantity: 1 }],
        client_reference_id: userId,
        metadata: { user_id: userId, price_id: price.id, trial, coupon },
        expires_at: Math.floor(now.getTime() / 1000) + CHECKOUT_TTL_S,
        // La prueba pide tarjeta y cobra al terminar si no cancela.
        subscription_data: { metadata: { user_id: userId }, ...(firstTime ? { trial_period_days: TRIAL_DAYS } : {}) },
        payment_method_collection: 'always',
        success_url: `${appUrl}/?billing=return#/profile`,
        cancel_url: `${appUrl}/#/profile`,
        locale: 'es-419',
        // Stripe no deja mandar a la vez un descuento y códigos promocionales.
        ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: false }),
      });
      if (!session.url) throw new Error('Stripe no regresó el link de Checkout');
      // `initPoint` se queda con el nombre de antes para no tocar la app.
      return json({ initPoint: session.url, priceMxn });
    }

    if (action === 'cancel') {
      if (!row?.stripe_subscription_id) return json({ error: 'no tienes una suscripción activa' }, 404);
      await stripe.subscriptions.update(row.stripe_subscription_id, { cancel_at_period_end: true });
      await admin.from('subscriptions').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('user_id', userId);
      return json({ ok: true });
    }

    if (action === 'portal') {
      if (!stripeConfigured()) return json({ error: 'billing_not_ready' }, 503);
      if (!row?.stripe_customer_id) return json({ error: 'no tienes una suscripción con tarjeta' }, 404);
      const portal = await stripe.billingPortal.sessions.create({ customer: row.stripe_customer_id, return_url: `${appUrl}/#/profile`, locale: 'es-419' });
      return json({ url: portal.url });
    }

    // ── Solo administradores: ventas del mes para la factura global (fase 5) ──
    if (action === 'sales' || action === 'sales_set_cfdi') {
      if (!ADMIN_USER_IDS.has(userId)) return json({ error: 'solo administradores' }, 403);
      const month = isValidMonthKey(body?.month) ? body.month : previousMonthKey(now);
      const { from, to } = mxMonthRange(month);
      if (action === 'sales_set_cfdi') {
        // UUID de la global ya timbrada: se guarda en los cobros del mes que
        // van en la global y todavía no tienen uno.
        if (!isCfdiUuid(body?.uuid)) return json({ error: 'UUID inválido' }, 400);
        const { data, error } = await admin
          .from('billing_payments')
          .update({ cfdi_uuid: body.uuid.trim().toUpperCase() })
          .gte('paid_at', from)
          .lt('paid_at', to)
          .eq('cfdi_mode', 'global')
          .is('refunded_at', null)
          .is('cfdi_uuid', null)
          .select('stripe_invoice_id');
        if (error) throw new Error(`billing_payments: ${error.message}`);
        return json({ ok: true, updated: data?.length ?? 0 });
      }
      const { data, error } = await admin
        .from('billing_payments')
        .select('stripe_invoice_id, stripe_charge_id, paid_at, total_cents, base_cents, iva_cents, card_funding, cfdi_uuid')
        .gte('paid_at', from)
        .lt('paid_at', to)
        .eq('cfdi_mode', 'global')
        .is('refunded_at', null)
        .order('paid_at');
      if (error) throw new Error(`billing_payments: ${error.message}`);
      return json({ month, rows: data ?? [] });
    }

    // ── Solo administradores: clientes especiales (gratis o con descuento) ──
    if (action === 'overrides_list' || action === 'override_set' || action === 'override_remove') {
      if (!ADMIN_USER_IDS.has(userId)) return json({ error: 'solo administradores' }, 403);
      if (action === 'overrides_list') {
        const { data, error } = await admin.from('billing_overrides').select('user_id, email, kind, percent_off, months, until, note, created_at').order('created_at', { ascending: false });
        if (error) throw new Error(`billing_overrides: ${error.message}`);
        return json({ rows: data ?? [] });
      }
      if (action === 'override_set') {
        const parsed = parseOverrideInput(body);
        if (!parsed.ok || !parsed.value) return json({ error: parsed.error ?? 'datos inválidos' }, 400);
        const o: { email: string; kind: 'free' | 'discount'; percentOff: number | null; months: number | null; note: string | null } = parsed.value;
        const { data: targetId, error: findErr } = await admin.rpc('billing_user_id_by_email', { p_email: o.email });
        if (findErr) throw new Error(`billing_user_id_by_email: ${findErr.message}`);
        if (!targetId) return json({ error: 'user_not_found' }, 404);
        const target = targetId as string;
        const couponId = o.kind === 'discount' ? couponIdFor(o.percentOff!, o.months) : null;
        if (couponId && stripeConfigured()) await ensureCoupon(couponId, o.percentOff!, o.months);
        const { error } = await admin.from('billing_overrides').upsert({
          user_id: target,
          email: o.email,
          kind: o.kind,
          percent_off: o.percentOff,
          months: o.months,
          until: o.kind === 'free' ? freeUntil(now, o.months) : null,
          stripe_coupon_id: couponId,
          note: o.note,
          created_by: userId,
          created_at: now.toISOString(),
        });
        if (error) throw new Error(`billing_overrides: ${error.message}`);
        await applyOverrideToStripe(admin, target, o.kind === 'free' ? 'free' : couponId);
        return json({ ok: true });
      }
      // override_remove
      const target = String(body?.userId ?? '');
      const { data: removed, error } = await admin.from('billing_overrides').delete().eq('user_id', target).select('kind');
      if (error) throw new Error(`billing_overrides: ${error.message}`);
      if (removed?.[0]?.kind === 'discount') await applyOverrideToStripe(admin, target, null);
      return json({ ok: true });
    }

    return json({ error: 'acción desconocida' }, 400);
  } catch (err) {
    console.error('[billing]', err);
    return json({ error: 'no se pudo completar; intenta de nuevo en un momento' }, 500);
  }
});

/** Lleva a Stripe lo que decidió el administrador sobre una suscripción que
 * ya existe: 'free' = cancelar al final del periodo (ya no se le cobra; la
 * IA sigue por la cortesía); un cupón = aplicarlo desde el siguiente cobro;
 * null = quitar el descuento. Sin suscripción viva no hay nada que hacer: lo
 * nuevo se aplica cuando se suscriba. */
async function applyOverrideToStripe(admin: SupabaseClient, target: string, change: 'free' | string | null): Promise<void> {
  if (!stripeConfigured()) return;
  const { data: row } = await admin.from('subscriptions').select('stripe_subscription_id').eq('user_id', target).maybeSingle();
  const subId = (row as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id;
  if (!subId) return;
  const sub = await stripe.subscriptions.retrieve(subId);
  if (!stillLive(sub)) return;
  if (change === 'free') {
    if (!sub.cancel_at_period_end) await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    await admin.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('user_id', target);
  } else {
    await stripe.subscriptions.update(subId, { discounts: change ? [{ coupon: change }] : '' });
  }
}
