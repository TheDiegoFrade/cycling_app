// Cliente de Stripe para las Edge Functions de cobro (billing y
// billing-webhook). Las llaves viven en secretos de Supabase y nunca llegan al
// navegador: STRIPE_SECRET_KEY (sk_test_… en pruebas, sk_live_… en
// producción) y STRIPE_WEBHOOK_SECRET (whsec_… del endpoint). Ver
// docs/cobro-stripe.md.
//
// Versión del API fijada: 2026-09-30.endive (la del webhook en el dashboard).
// stripe@23.0.0 es la versión del SDK que trae esa misma por default, así los
// tipos coinciden con lo que manda Stripe. En esta versión:
//  - la suscripción de una factura está en invoice.parent.subscription_details.subscription
//    (ya no existe invoice.subscription);
//  - el cargo de una factura sale de sus InvoicePayments (ya no existe invoice.charge);
//  - el periodo cobrado está en cada línea (line.period.end), no en invoice.period_end
//    (que es el fin del periodo ANTERIOR en facturas de suscripción).
import Stripe from 'npm:stripe@23.0.0';

export const STRIPE_API_VERSION = '2026-09-30.endive';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export const stripeConfigured = () => Boolean(Deno.env.get('STRIPE_SECRET_KEY') && Deno.env.get('STRIPE_WEBHOOK_SECRET'));

/** El lookup key del precio con el que se suscriben los nuevos. Subir el
 * precio = crear otro precio en Stripe y cambiar este secreto (sin desplegar). */
export const checkoutLookupKey = () => Deno.env.get('STRIPE_CHECKOUT_LOOKUP_KEY') || 'torq_coach_ia_mensual';

export interface CheckoutPrice {
  id: string;
  /** MXN al mes, IVA incluido. */
  priceMxn: number;
}

const PRICE_TTL_MS = 5 * 60_000;
let cached: { key: string; at: number; price: CheckoutPrice } | null = null;

/** El precio vigente para suscripciones nuevas (cacheado 5 minutos). */
export async function checkoutPrice(): Promise<CheckoutPrice> {
  const key = checkoutLookupKey();
  if (cached && cached.key === key && Date.now() - cached.at < PRICE_TTL_MS) return cached.price;
  const { data } = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const p = data[0];
  if (!p || p.unit_amount == null) throw new Error(`no hay un precio activo en Stripe con lookup key «${key}»`);
  const price = { id: p.id, priceMxn: p.unit_amount / 100 };
  cached = { key, at: Date.now(), price };
  return price;
}

/** id de algo que puede venir como id o como objeto expandido. */
export const idOf = (x: string | { id: string } | null | undefined): string | null => (typeof x === 'string' ? x : (x?.id ?? null));

export type { Stripe };
