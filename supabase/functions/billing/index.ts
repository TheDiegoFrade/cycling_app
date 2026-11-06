// Suscripción Torq Coach IA con Stripe. Una sola función con acciones
// (como la usa la app: supabase.functions.invoke('billing', { body: { action } })):
//  - status: qué acceso tiene la persona y a qué precio se suscribiría.
//  - subscribe: regresa el link de Stripe Checkout (o reactiva una suscripción
//    que se canceló pero sigue pagada, sin volver a cobrar).
//  - cancel: cancela al final del periodo; conserva el acceso hasta lo pagado.
//  - portal: link al portal de Stripe para actualizar la tarjeta.
// Los avisos de Stripe llegan a billing-webhook (otra función: esa no lleva
// sesión de usuario). Ver docs/cobro-stripe.md.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { loadAiAccess } from '../_shared/access.ts';
import { ADMIN_USER_IDS } from '../_shared/coach-access.ts';
import { appUrl as appUrlFromEnv } from '../_shared/mailer.ts';
import { checkoutPrice, idOf, stripe, stripeConfigured } from '../_shared/stripe.ts';
import { PRICE_MXN, TRIAL_DAYS, resumable, stillLive, trialEligible } from '../_shared/core.gen.js';

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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? 'status';
    const now = new Date();
    const [access, rowRes] = await Promise.all([
      loadAiAccess(admin, userId, now),
      admin.from('subscriptions').select('status, price_mxn, paid_until, grace_until, provider, stripe_customer_id, stripe_subscription_id').eq('user_id', userId).maybeSingle(),
    ]);
    if (rowRes.error) throw new Error(`no se pudo leer la suscripción: ${rowRes.error.message}`);
    const row = rowRes.data as SubRow | null;
    // Quien canceló y regresa antes de que termine lo pagado reactiva su
    // misma suscripción y conserva su precio. Si ya venció, entra al vigente.
    const keepsPrice = !!row?.stripe_subscription_id && row.status === 'cancelled' && !!row.paid_until && new Date(row.paid_until) > now;
    const appUrl = appUrlFromEnv();

    if (action === 'status') {
      let priceMxn = PRICE_MXN;
      if (keepsPrice) priceMxn = row!.price_mxn;
      else if (stripeConfigured()) {
        try {
          priceMxn = (await checkoutPrice()).priceMxn;
        } catch (err) {
          console.error('[billing] precio de Stripe', err);
        }
      }
      return json({
        ...access,
        priceMxn,
        // Días de prueba que tendría al suscribirse (0 si ya tuvo).
        trialDays: !keepsPrice && trialEligible(row) ? TRIAL_DAYS : 0,
        billingReady: stripeConfigured(),
        isAdmin: ADMIN_USER_IDS.has(userId),
      });
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
      // persona lo abre dos veces. Se conservan paid_until y grace_until.
      const { error } = await admin.from('subscriptions').upsert({
        user_id: userId,
        status: 'pending',
        price_mxn: price.priceMxn,
        provider: 'stripe',
        stripe_customer_id: customer,
        paid_until: row?.paid_until ?? null,
        grace_until: row?.grace_until ?? null,
        updated_at: now.toISOString(),
      });
      if (error) throw new Error(`no se pudo guardar la suscripción: ${error.message}`);
      const firstTime = trialEligible(row);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        line_items: [{ price: price.id, quantity: 1 }],
        client_reference_id: userId,
        metadata: { user_id: userId },
        // La prueba pide tarjeta y cobra al terminar si no cancela.
        subscription_data: { metadata: { user_id: userId }, ...(firstTime ? { trial_period_days: TRIAL_DAYS } : {}) },
        payment_method_collection: 'always',
        success_url: `${appUrl}/?billing=return#/profile`,
        cancel_url: `${appUrl}/#/profile`,
        locale: 'es-419',
        allow_promotion_codes: false,
      });
      if (!session.url) throw new Error('Stripe no regresó el link de Checkout');
      // `initPoint` se queda con el nombre de antes para no tocar la app.
      return json({ initPoint: session.url, priceMxn: price.priceMxn });
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

    return json({ error: 'acción desconocida' }, 400);
  } catch (err) {
    console.error('[billing]', err);
    return json({ error: 'no se pudo completar; intenta de nuevo en un momento' }, 500);
  }
});
