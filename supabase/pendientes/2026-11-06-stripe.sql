-- Cobro con Stripe (docs/cobro-stripe.md, fase 2). Correr UNA vez en el SQL
-- Editor de Supabase sobre una base que ya tiene lo de `main`. Es idempotente
-- (se puede volver a correr sin romper nada). Todo o nada: va en una
-- transacción. Fuente: supabase/schema.sql (esto es una copia de sus partes
-- nuevas; si algo difiere, manda schema.sql).
begin;

-- ═══ 1. subscriptions: de qué proveedor es y sus ids en Stripe ════════════
alter table subscriptions add column if not exists provider text not null default 'stripe'
  check (provider in ('mercadopago', 'stripe'));
alter table subscriptions add column if not exists stripe_customer_id text unique;
alter table subscriptions add column if not exists stripe_subscription_id text unique;
-- mp_preapproval_id se queda (nullable) por historial. Las filas que ya
-- existían eran de Mercado Pago: el default 'stripe' no debe confundirlas.
update subscriptions set provider = 'mercadopago'
  where mp_preapproval_id is not null and stripe_subscription_id is null and provider <> 'mercadopago';

-- ═══ 2. billing_payments: un renglón por cobro pagado ═════════════════════
-- Fuente de la factura global mensual (fase 5).
create table if not exists billing_payments (
  stripe_invoice_id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  stripe_subscription_id text,
  stripe_charge_id text,           -- folio de la línea en la factura global
  total_cents integer not null,    -- con IVA
  base_cents integer not null,     -- sin IVA
  iva_cents integer not null,
  currency text not null default 'mxn',
  card_funding text,               -- credit | debit → forma de pago SAT 04 / 28
  paid_at timestamptz not null,
  refunded_at timestamptz,
  -- global = va en la global del mes; individual = se le hizo factura con RFC
  cfdi_mode text not null default 'global' check (cfdi_mode in ('global', 'individual')),
  cfdi_uuid text,                  -- UUID del CFDI (global o individual) cuando se emita
  created_at timestamptz not null default now()
);
alter table billing_payments enable row level security;
-- sin políticas: solo la service role (webhook y admin) la lee y escribe.
create index if not exists billing_payments_paid_at_idx on billing_payments (paid_at);
create index if not exists billing_payments_charge_idx on billing_payments (stripe_charge_id);

commit;
