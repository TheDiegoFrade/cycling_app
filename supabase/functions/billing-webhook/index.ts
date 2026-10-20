// Avisos de Mercado Pago (webhook). Se configura en Mercado Pago → Tus
// integraciones → Webhooks con los eventos «Planes y suscripciones», apuntando
// a <SUPABASE_URL>/functions/v1/billing-webhook. Va con --no-verify-jwt:
// Mercado Pago no manda sesión; en su lugar se verifica su firma (x-signature)
// con MP_WEBHOOK_SECRET. Nunca se confía en el contenido del aviso: se vuelve
// a pedir el recurso a la API de Mercado Pago.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthorizedPayment, getPreapproval } from '../_shared/mercadopago.ts';
import { applyPayment, subscriptionStatusOf, verifyMpSignature } from '../_shared/core.gen.js';

const ok = () => new Response('ok', { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const type: string = body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '';
  const dataId: string | null = String(body?.data?.id ?? url.searchParams.get('data.id') ?? '') || null;
  const requestId = req.headers.get('x-request-id');

  const valid = await verifyMpSignature({
    signature: req.headers.get('x-signature'),
    requestId,
    dataId,
    secret: Deno.env.get('MP_WEBHOOK_SECRET') ?? '',
  });
  if (!valid) return new Response('firma inválida', { status: 401 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Mercado Pago reintenta si no contestamos a tiempo: cada aviso una sola vez.
  const eventId = requestId ?? `${type}:${dataId}:${body?.action ?? ''}`;
  const { error: dup } = await admin.from('billing_events').insert({ id: eventId, kind: type });
  if (dup) return ok();

  try {
    const now = new Date();
    if (type === 'subscription_preapproval' && dataId) {
      const pre = await getPreapproval(dataId);
      const status = subscriptionStatusOf(pre.status);
      await admin.from('subscriptions').update({ status, updated_at: now.toISOString() }).eq('mp_preapproval_id', pre.id);
      if (pre.external_reference) await admin.from('billing_events').update({ user_id: pre.external_reference }).eq('id', eventId);
    } else if (type === 'subscription_authorized_payment' && dataId) {
      const payment = await getAuthorizedPayment(dataId);
      const change = applyPayment(payment, now);
      if (change) await admin.from('subscriptions').update({ ...change, updated_at: now.toISOString() }).eq('mp_preapproval_id', payment.preapproval_id);
    }
    return ok();
  } catch (err) {
    console.error('[billing-webhook]', err);
    // se borra la marca para que el reintento de Mercado Pago lo vuelva a procesar
    await admin.from('billing_events').delete().eq('id', eventId);
    return new Response('error', { status: 500 });
  }
});
