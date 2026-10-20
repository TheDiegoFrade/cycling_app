// Suscripción Torq Coach IA con Mercado Pago. Una sola función con acciones
// (como la usa la app: supabase.functions.invoke('billing', { body: { action } })):
//  - status: qué acceso tiene la persona y a qué precio se suscribiría.
//  - subscribe: crea la suscripción y regresa el link de Mercado Pago.
//  - cancel: cancela; conserva el acceso hasta el fin del periodo pagado.
// Los avisos de Mercado Pago llegan a billing-webhook (otra función: esa no
// lleva sesión de usuario).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { loadAiAccess } from '../_shared/access.ts';
import { ADMIN_USER_IDS } from '../_shared/coach-access.ts';
import { appUrl as appUrlFromEnv } from '../_shared/mailer.ts';
import { cancelPreapproval, createPreapproval, mpConfigured } from '../_shared/mercadopago.ts';
import { FOUNDER_PRICE_MXN, founderUntilFromLaunch, priceForNewSubscription } from '../_shared/core.gen.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? 'status';
    const now = new Date();
    const access = await loadAiAccess(admin, userId, now);
    // Quien vuelve a suscribirse sin haber perdido lo pagado conserva su
    // precio (el de fundador se mantiene mientras no se interrumpa).
    const keptPrice = access.subscription && access.subscription.paid_until && new Date(access.subscription.paid_until) > now ? access.subscription.price_mxn : null;
    // Precio de fundador: los primeros 60 días desde TORQ_LAUNCH_DATE.
    const founderUntil = founderUntilFromLaunch(Deno.env.get('TORQ_LAUNCH_DATE'));
    const price = keptPrice ?? priceForNewSubscription(now, founderUntil);

    if (action === 'status') {
      return json({
        ...access,
        priceMxn: price,
        // Para decir «hasta el 30 de diciembre» junto al precio de fundador.
        founderUntil: keptPrice === null && price === FOUNDER_PRICE_MXN ? founderUntil : null,
        billingReady: mpConfigured(),
        isAdmin: ADMIN_USER_IDS.has(userId),
      });
    }

    if (action === 'subscribe') {
      if (access.ai && access.reason !== 'grace') return json({ error: 'not_needed', reason: access.reason }, 409);
      if (!mpConfigured()) return json({ error: 'billing_not_ready' }, 503);
      const { data: user } = await admin.auth.admin.getUserById(userId);
      const email = user?.user?.email;
      if (!email) return json({ error: 'sin correo en la cuenta' }, 400);
      const appUrl = appUrlFromEnv();
      // Solo en pruebas: Mercado Pago exige que quien paga sea su usuario de
      // prueba comprador. Con MP_TEST_PAYER_EMAIL se usa ese correo en vez del
      // de la cuenta de Torq. En producción NO debe existir.
      const payerEmail = Deno.env.get('MP_TEST_PAYER_EMAIL') || email;
      const pre = await createPreapproval({ userId, email: payerEmail, priceMxn: price, backUrl: `${appUrl}/?billing=return#/profile` });
      const { error } = await admin.from('subscriptions').upsert({
        user_id: userId,
        status: 'pending',
        price_mxn: price,
        mp_preapproval_id: pre.id,
        paid_until: access.subscription?.paid_until ?? null,
        grace_until: access.subscription?.grace_until ?? null,
        updated_at: now.toISOString(),
      });
      if (error) throw new Error(`no se pudo guardar la suscripción: ${error.message}`);
      return json({ initPoint: pre.init_point, priceMxn: price });
    }

    if (action === 'cancel') {
      const { data: row } = await admin.from('subscriptions').select('mp_preapproval_id').eq('user_id', userId).maybeSingle();
      if (!row?.mp_preapproval_id) return json({ error: 'no tienes una suscripción activa' }, 404);
      await cancelPreapproval(row.mp_preapproval_id);
      await admin.from('subscriptions').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('user_id', userId);
      return json({ ok: true });
    }

    return json({ error: 'acción desconocida' }, 400);
  } catch (err) {
    console.error('[billing]', err);
    return json({ error: 'no se pudo completar; intenta de nuevo en un momento' }, 500);
  }
});
