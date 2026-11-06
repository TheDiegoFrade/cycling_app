-- Ventas del mes anterior para la factura global (docs/cobro-stripe.md,
-- fase 5). Lo mismo que muestra la app en Admin → Ventas del mes. Correr en el
-- SQL Editor de Supabase. Los límites del mes son medianoche de CDMX.
--
-- Para otro mes, cambia `desde` por la fecha del día 1 de ese mes, p. ej.:
--   (timestamp '2026-11-01' at time zone 'America/Mexico_City')

with mes as (
  select
    date_trunc('month', (now() at time zone 'America/Mexico_City') - interval '1 month') at time zone 'America/Mexico_City' as desde,
    date_trunc('month', (now() at time zone 'America/Mexico_City')) at time zone 'America/Mexico_City' as hasta
)
select stripe_charge_id as folio,
       paid_at at time zone 'America/Mexico_City' as fecha_cdmx,
       total_cents / 100.0 as total,
       base_cents / 100.0 as base,
       iva_cents / 100.0 as iva,
       card_funding,
       case card_funding when 'credit' then '04' when 'debit' then '28' when 'prepaid' then '28' end as forma_pago_sat,
       cfdi_uuid
from billing_payments, mes
where paid_at >= mes.desde and paid_at < mes.hasta
  and cfdi_mode = 'global' and refunded_at is null
order by paid_at;

-- Totales al pie (suma de base y de IVA):
-- with mes as (...igual que arriba...)
-- select count(*), sum(total_cents) / 100.0 as total, sum(base_cents) / 100.0 as base, sum(iva_cents) / 100.0 as iva
-- from billing_payments, mes
-- where paid_at >= mes.desde and paid_at < mes.hasta and cfdi_mode = 'global' and refunded_at is null;

-- Ya timbrada la global: guardar su UUID (o usa «Guardar UUID» en la app).
-- update billing_payments set cfdi_uuid = '<UUID>'
-- where paid_at >= <desde> and paid_at < <hasta> and cfdi_mode = 'global' and refunded_at is null and cfdi_uuid is null;

-- Alguien pidió factura con su RFC (se hace a mano y sale de la global):
-- update billing_payments set cfdi_mode = 'individual', cfdi_uuid = '<UUID>' where stripe_invoice_id = 'in_…';
