// API de Mercado Pago (suscripciones «sin plan asociado»: preapproval). El
// token vive en MP_ACCESS_TOKEN: uno de PRUEBA (TEST-…) mientras no haya
// cuenta real, y el de producción después. Nunca llega al navegador.

// Mismas formas que src/core/mercadopago.ts (las Edge Functions no importan de src/).
export interface MpPreapproval {
  id: string;
  status: string;
  external_reference?: string | null;
  auto_recurring?: { transaction_amount?: number; currency_id?: string } | null;
  next_payment_date?: string | null;
}
export interface MpAuthorizedPayment {
  id: string | number;
  preapproval_id: string;
  status?: string | null;
  payment?: { id?: string | number; status?: string | null } | null;
  debit_date?: string | null;
  date_created?: string | null;
}

const API = 'https://api.mercadopago.com';

export function mpConfigured(): boolean {
  return !!Deno.env.get('MP_ACCESS_TOKEN');
}

async function mp<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) throw new Error('MP_ACCESS_TOKEN no está configurado');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mercado Pago ${res.status} en ${path}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** Crea la suscripción y regresa el link donde la persona pone su tarjeta. */
export function createPreapproval(opts: { userId: string; email: string; priceMxn: number; backUrl: string }) {
  return mp<MpPreapproval & { init_point: string }>('POST', '/preapproval', {
    reason: 'Torq Coach IA',
    external_reference: opts.userId,
    payer_email: opts.email,
    back_url: opts.backUrl,
    status: 'pending',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: opts.priceMxn, currency_id: 'MXN' },
  });
}

export const getPreapproval = (id: string) => mp<MpPreapproval>('GET', `/preapproval/${encodeURIComponent(id)}`);
export const cancelPreapproval = (id: string) => mp<MpPreapproval>('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' });
export const getAuthorizedPayment = (id: string) => mp<MpAuthorizedPayment>('GET', `/authorized_payments/${encodeURIComponent(id)}`);
