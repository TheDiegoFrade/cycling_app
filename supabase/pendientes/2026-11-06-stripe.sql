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

-- ═══ 3. Abuso y fraude (docs/cobro-stripe.md, «Abuso y fraude») ══════════
-- Cuenta marcada por fraude (disputa por cargo no reconocido o alerta de
-- fraude de Stripe): pierde la IA y no puede volver a suscribirse. Para
-- quitar la marca: update subscriptions set fraud_flag_at = null, fraud_reason = null where user_id = '…';
alter table subscriptions add column if not exists fraud_flag_at timestamptz;
alter table subscriptions add column if not exists fraud_reason text;

-- Intentos de suscribirse / portal / cancelar: la función billing cuenta los
-- de la última hora y del último día y corta con «demasiados intentos».
create table if not exists billing_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  at timestamptz not null default now()
);
alter table billing_attempts enable row level security;
-- sin políticas: solo la service role.
create index if not exists billing_attempts_user_at_idx on billing_attempts (user_id, action, at);

-- Una prueba por persona: la huella de la tarjeta (la da Stripe; no es el
-- número) con la que se empezó cada prueba. La misma tarjeta en otra cuenta
-- ya no tiene prueba: se cobra desde el día 1.
create table if not exists billing_trial_cards (
  fingerprint text primary key,
  user_id uuid references auth.users (id) on delete set null,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);
alter table billing_trial_cards enable row level security;
-- sin políticas: solo la service role.

-- ═══ 4. Clientes especiales (docs/cobro-stripe.md, «Clientes especiales») ═
-- A quién no se le cobra (gratis) o se le cobra con descuento. Lo decide un
-- administrador en Admin → Clientes especiales. Una fila por usuario.
create table if not exists billing_overrides (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  kind text not null check (kind in ('free', 'discount')),
  percent_off integer check (percent_off between 1 and 99),
  months integer check (months between 1 and 36),       -- null = para siempre
  until timestamptz,                                    -- gratis: hasta cuándo (null = siempre)
  stripe_coupon_id text,                                -- descuento: el cupón de Stripe
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'free' and percent_off is null) or (kind = 'discount' and percent_off is not null))
);
alter table billing_overrides enable row level security;
-- sin políticas: solo la service role.

-- Buscar la cuenta por correo (para dar de alta un cliente especial). Solo
-- la llama la función billing con la service role.
create or replace function billing_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;
revoke all on function billing_user_id_by_email(text) from public;
revoke all on function billing_user_id_by_email(text) from anon, authenticated;
grant execute on function billing_user_id_by_email(text) to service_role;

-- ═══ 5. Precios con centavos ═════════════════════════════════════════════
-- Con descuento el precio puede tener centavos ($329 con 50 % = $164.50).
alter table subscriptions alter column price_mxn type numeric(10, 2);

commit;
