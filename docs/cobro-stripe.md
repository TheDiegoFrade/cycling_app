# Cobro con Stripe (reemplaza a Mercado Pago)

Plan para cambiar el proveedor de cobro de **Torq Coach IA** de Mercado Pago a
**Stripe**, sin tocar la lógica de acceso. Complementa a
[`cobro-y-registro.md`](cobro-y-registro.md): invitaciones, coaches, términos y
`aiAccess` siguen igual.

> **Para Claude Code:** implementa este documento por fases y en ese orden.
> Cada fase termina con `npm test` y `npm run build` en verde. No cambies
> `src/core/access.ts` (`aiAccess`, precios, gracia) salvo lo que diga la
> fase 0. No hagas commit de llaves: todo va como secreto de Supabase.

> **Estado (6-nov-2026):** fases 0, 2, 3, 4, 5 y 6 implementadas en la rama
> `feat/stripe`. Las fases 1 y 7 son del dashboard de Stripe y de producción.
> Ver «Notas de implementación» al final.

## Por qué así

- `aiAccess` ya decide con `subscriptions.status`, `paid_until` y
  `grace_until`. Stripe solo tiene que **llenar esas mismas columnas**.
- La app ya habla con la función `billing` por acciones (`status`,
  `subscribe`, `cancel`) y con `billing-webhook` para los avisos. Se conserva
  ese contrato, así la UI casi no cambia.
- Fiscal: los cobros los factura **Andrea (RESICO, régimen 626)**. Casi
  nadie pedirá factura, así que todo va a la **factura global mensual**. Por
  ahora se hace a mano en el portal del SAT con los datos que guarda la nueva
  tabla `billing_payments` (fase 5). Facturapi queda para después.

---

## Fase 0 — Decisiones (tomadas el 5-nov-2026)

1. **Precio: $329 MXN al mes, IVA incluido, para todos.** Se comunica
   como «$329 al mes» o «precio de lanzamiento». **Sin concepto de
   fundador y sin promesa de conservar el precio.** Cuando suba, Diego
   decide en ese momento si a los suscriptores existentes se les respeta
   (Stripe los deja en su precio a menos que se migren) o se les ajusta
   con aviso de 30 días (script de la nota de abajo).

   **Si algún día se ajusta a los existentes:** crear el precio nuevo,
   avisar con 30 días y mover cada suscripción en su siguiente renovación,
   sin prorrateo: `subscriptions.update(id, { items: [{ id: itemId, price: nuevo }], proration_behavior: 'none' })`;
   actualizar `subscriptions.price_mxn`. Quien no quiera, cancela y
   conserva lo ya pagado.
2. **Sin ventana fija de 60 días.** Se quita la lógica de `TORQ_LAUNCH_DATE` /
   `FOUNDER_DAYS`. Diego decide cuándo sube el precio para los nuevos: ese
   día se crea un precio nuevo en Stripe y se cambia **un secreto**
   (`STRIPE_CHECKOUT_LOOKUP_KEY`), sin desplegar código. Las suscripciones
   existentes se quedan en $329 solas: Stripe no cambia el precio de una
   suscripción viva.
3. **Prueba de 7 días con tarjeta.** Una sola prueba por cuenta: si la
   persona ya tuvo una suscripción (cualquier estado) no se le vuelve a dar.
4. **Si alguien cancela y su periodo pagado ya terminó**, vuelve a
   suscribirse al precio vigente de ese momento (no recupera el anterior). Si regresa antes de que termine lo pagado, lo conserva (como
   hoy hace `keptPrice`).
5. **Solo tarjeta, mes con mes.** Las suscripciones de Stripe no cobran OXXO
   en automático. Un plan anual en OXXO queda para la fase 7 (opcional).
6. **Cancelar** = `cancel_at_period_end`: conserva el acceso hasta
   `paid_until`, igual que hoy.

**Cambios en `src/core/access.ts`:** `PRICE_MXN = 329`; quitar
`FOUNDER_PRICE_MXN`, `FOUNDER_DAYS`, `founderUntilFromLaunch` y
`priceForNewSubscription` (y sus usos en `billing`, la UI de precios y
`edge-entry.ts`). El precio que se muestra sale de `status`, que lo lee del
precio de Stripe del lookup key vigente; `subscriptions.price_mxn` guarda el
que pagó cada quien. La UI ya no muestra nada de «fundador»: solo el precio («$329 al mes, IVA
incluido»). Los términos (§cobro) deben decir que el precio puede cambiar
con aviso previo de 30 días (subir `TERMS_VERSION`).

## Fase 1 — Stripe (dashboard, sin código)

1. Cuenta como **persona física** con el RFC de Andrea, su Constancia de
   Situación Fiscal, identificación y cuenta bancaria.
   - Nombre público del negocio: `Torq`
   - Descriptor en el estado de cuenta: `TORQ`
   - Sitio: `https://ridetorq.app`
2. **Modo de prueba** para todo lo que sigue.
3. **Producto** `Torq Coach IA` con **un** precio recurrente mensual en MXN
   (si aparece la opción de impuesto, *inclusive*):
   - mensual: 329.00 MXN, lookup key `torq_coach_ia_mensual`
   - Cuando Diego decida subir el precio: crear otro precio (p. ej.
     `torq_coach_ia_2027`) y cambiar el secreto `STRIPE_CHECKOUT_LOOKUP_KEY`.
     No archivar el de $329: las suscripciones existentes siguen en él.
4. **Customer portal** (Settings → Billing → Customer portal): activar
   *actualizar método de pago* y *ver historial de pagos*. **Desactivar
   cancelar** y *cambiar de plan* (eso se hace en la app). Idioma: español.
5. **Checkout → Branding:** logo y colores de Torq.
6. **Webhook** (Developers → Webhooks): URL
   `<SUPABASE_URL>/functions/v1/billing-webhook`, eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - `invoice.paid`, `invoice.payment_failed`
   - `charge.refunded`

   Copiar el *signing secret* (`whsec_…`).

## Fase 2 — Base de datos

Nuevo archivo idempotente en una transacción:
`supabase/pendientes/AAAA-MM-DD-stripe.sql`. Después se copia a
`supabase/schema.sql`.

```sql
begin;

alter table subscriptions add column if not exists provider text not null default 'stripe'
  check (provider in ('mercadopago', 'stripe'));
alter table subscriptions add column if not exists stripe_customer_id text unique;
alter table subscriptions add column if not exists stripe_subscription_id text unique;
-- mp_preapproval_id se queda (nullable) por historial.

-- Un renglón por cobro pagado: fuente de la factura global mensual.
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

commit;
```

`billing_events` ya existe y sirve tal cual: su `id` es el `event.id` de
Stripe (evita procesar dos veces el mismo aviso).

## Fase 3 — Edge Functions

### 3.1 `supabase/functions/_shared/stripe.ts` (nuevo)

```ts
import Stripe from 'npm:stripe@^17';
export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
  // Fijar la versión del API y anotarla aquí; revisar los nombres de campos de
  // invoice (subscription / parent.subscription_details) contra esa versión.
});
export const cryptoProvider = Stripe.createSubtleCryptoProvider();
export const stripeConfigured = () =>
  Boolean(Deno.env.get('STRIPE_SECRET_KEY') && Deno.env.get('STRIPE_WEBHOOK_SECRET'));
```

El precio del checkout se resuelve con
`prices.list({ lookup_keys: [STRIPE_CHECKOUT_LOOKUP_KEY] })` (default
`torq_coach_ia_mensual`). Conviene cachearlo unos minutos en memoria.

### 3.2 `billing` (modificar)

Mismas acciones y mismas respuestas. Cambia el proveedor:

- **status:** igual, con `billingReady: stripeConfigured()`.
- **subscribe:**
  1. Reusar `subscriptions.stripe_customer_id` o crear el Customer (correo de
     la cuenta, `metadata.user_id`).
  2. `checkout.sessions.create({ mode: 'subscription', customer, line_items: [{ price, quantity: 1 }], client_reference_id: userId, subscription_data: { metadata: { user_id }, ...(primeraVez ? { trial_period_days: 7 } : {}) }, payment_method_collection: 'always', success_url: ${APP_URL}/?billing=return#/profile, cancel_url: ${APP_URL}/#/profile, locale: 'es-419', allow_promotion_codes: false })`
     — `primeraVez` = no existe fila en `subscriptions` con
     `stripe_subscription_id` para ese usuario. La prueba pide tarjeta y
     cobra el día 8 si no cancela.
  3. Upsert en `subscriptions`: `status 'pending'`, `price_mxn`,
     `provider 'stripe'`, `stripe_customer_id`. Conservar `paid_until` y
     `grace_until`, como hoy.
  4. Responder `{ initPoint: session.url, priceMxn }`. Se queda el nombre
     `initPoint` para no tocar `src/sync/billing.ts`.
- **cancel:**
  `subscriptions.update(stripe_subscription_id, { cancel_at_period_end: true })`
  y marcar `status 'cancelled'` localmente, como hoy.
- **portal (nueva):**
  `billingPortal.sessions.create({ customer, return_url: ${APP_URL}/#/profile })`.
  Responde `{ url }`. Sirve para actualizar la tarjeta en la gracia.

### 3.3 `billing-webhook` (reescribir)

Va con `--no-verify-jwt`, como hoy.

1. Leer el cuerpo **crudo** (`await req.text()`), verificarlo con
   `stripe.webhooks.constructEventAsync(raw, req.headers.get('stripe-signature'), STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider)`.
   Si falla, responder 400.
2. Insertar `event.id` en `billing_events`. Si ya existía, responder 200 y
   salir. Si algo falla después, borrar la marca y responder 500 para que
   Stripe reintente (mismo patrón de hoy).
3. Según el evento:

| Evento | Qué hace |
|---|---|
| `checkout.session.completed` | Guarda `stripe_subscription_id` y `stripe_customer_id` en la fila del `client_reference_id`. |
| `customer.subscription.created/updated` | `status = stripeStatusOf(sub)` (ver tabla abajo). |
| `customer.subscription.deleted` | `status = 'cancelled'`. No toca `paid_until`. |
| `invoice.paid` | `paid_until = fin del periodo de la línea + 2 días`, `grace_until = null`. Inserta en `billing_payments` (total, base, IVA, cargo, tipo de tarjeta, fecha). Si el monto es 0, no inserta. |
| `invoice.payment_failed` | `grace_until = now + GRACE_DAYS` si no estaba abierta. |
| `charge.refunded` | `billing_payments.refunded_at = now`. |

Nunca confiar ciegamente en el objeto del aviso para el estado de la
suscripción: en `subscription.updated` está bien usarlo porque viene firmado,
pero el `user_id` sale de `metadata.user_id` o de la fila por
`stripe_subscription_id`.

**Mapeo de estado** (`stripeStatusOf`, lógica pura en `src/core/stripe.ts`):

| Stripe | Torq |
|---|---|
| `active`, `trialing`, `past_due` | `authorized` (si `past_due`, la gracia la abre `invoice.payment_failed`). En `trialing`, `paid_until = trial_end` para que `aiAccess` dé acceso durante la prueba |
| `active` con `cancel_at_period_end = true` | `cancelled` (conserva hasta `paid_until`) |
| `paused` | `paused` |
| `canceled`, `unpaid`, `incomplete_expired` | `cancelled` |
| `incomplete` | `pending` |

### 3.4 Limpieza

- `src/core/mercadopago.ts` → reemplazar por `src/core/stripe.ts` con
  funciones puras: `stripeStatusOf`, `paidUntilFromPeriodEnd`,
  `ivaSplit(totalCents)`. Exportarlas en `src/core/edge-entry.ts` y correr
  `npm run build:edge`.
- **IVA incluido:** `base = round(total / 1.16)`, `iva = total − base`, en
  centavos. Prueba: 32900 → base 28362, IVA 4538.
- Borrar `_shared/mercadopago.ts` y los secretos `MP_*`, después de que
  Stripe funcione en producción.
- `scripts/deploy-functions.sh`: sin cambios de nombres; revisar que
  `billing-webhook` siga con `--no-verify-jwt`.

## Fase 4 — App (UI)

- `src/ui/pricing.ts`:
  - Botón «Suscribirme» (quitar «con Mercado Pago»).
  - Mensajes «Abriendo el pago…» y «Estamos confirmando tu pago…» sin nombre
    de proveedor.
  - En la gracia: botón **«Actualizar tarjeta»** → acción `portal` →
    `location.assign(url)`. Reemplaza el link a mercadopago.com.mx.
- `src/sync/billing.ts`: agregar `openBillingPortal()`.
- **Textos legales:** `terms-text.ts` §cobro y `privacy-text.ts` (tabla de
  pago y de terceros): cambiar Mercado Pago por **Stripe**. Subir
  `TERMS_VERSION`; a todos se les vuelve a pedir aceptar, y antes del
  lanzamiento no importa.

## Fase 5 — Factura global mensual (manual, sin Facturapi)

Torq no emite CFDI todavía. Solo guarda los datos para que Andrea haga **una
factura global al mes** en el portal gratuito del SAT.

1. **Vista para admin** (*Admin → Ventas del mes*, o al menos una consulta
   SQL guardada):

   Implementado: **Admin → Ventas del mes** (`#/admin/sales`) y
   [`supabase/consultas/ventas-del-mes.sql`](../supabase/consultas/ventas-del-mes.sql).
   Los límites del mes son medianoche de CDMX (la consulta original truncaba
   el mes en UTC y movía 6 horas los bordes):

   ```sql
   with mes as (
     select date_trunc('month', (now() at time zone 'America/Mexico_City') - interval '1 month') at time zone 'America/Mexico_City' as desde,
            date_trunc('month', (now() at time zone 'America/Mexico_City')) at time zone 'America/Mexico_City' as hasta
   )
   select stripe_charge_id as folio, paid_at, total_cents / 100.0 as total,
          base_cents / 100.0 as base, iva_cents / 100.0 as iva, card_funding
   from billing_payments, mes
   where paid_at >= mes.desde and paid_at < mes.hasta
     and cfdi_mode = 'global' and refunded_at is null
   order by paid_at;
   ```

   Con un botón «Descargar CSV» y los totales al pie (suma de base y de IVA).
2. **El día 1 de cada mes**, Andrea emite en el portal del SAT un CFDI de
   ingreso:
   - Receptor: RFC `XAXX010101000`, nombre `PUBLICO EN GENERAL`, régimen
     `616`, uso `S01`, CP = el de su domicilio fiscal.
   - Información global: periodicidad `04` (mensual), mes y año.
   - Una línea por cobro: clave `01010101`, unidad `ACT`, número de
     identificación = folio, valor = base, IVA trasladado 16%.
   - Forma de pago: la del mayor monto (`04` crédito o `28` débito); método
     `PUE`.
   - Guardar el UUID en `billing_payments.cfdi_uuid` de esas filas.
3. **Si alguien pide factura** antes del cierre: se le hace a mano con su RFC,
   se marca `cfdi_mode = 'individual'` y sale de la global.
4. **Reembolso de un cobro que ya está en una global:** necesita nota de
   crédito (CFDI de egreso). Por ahora a mano, con el contador.

> Cuando el volumen haga tedioso el paso 2, se automatiza con la API de
> Facturapi: un cron el día 1 que arma la global con la misma consulta.

## Fase 6 — Pruebas

**Unitarias** (`src/core/stripe.test.ts`, reemplaza a `mercadopago.test.ts`):
- `stripeStatusOf` para cada estado de la tabla, incluido
  `cancel_at_period_end`.
- `paidUntilFromPeriodEnd` (+2 días).
- `ivaSplit`: base + IVA = total para 32900 y montos raros.

**Webhook local**, con la Stripe CLI:

```sh
stripe login
stripe listen --forward-to <SUPABASE_URL>/functions/v1/billing-webhook
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

**De punta a punta en modo de prueba:**

| Caso | Tarjeta de prueba | Resultado esperado |
|---|---|---|
| Suscribirse (primera vez) | `4242 4242 4242 4242` | Entra en prueba de 7 días con acceso a la IA; **no** hay fila en `billing_payments` (factura de $0). Con *test clock* +8 días: cobro de $329 y fila nueva |
| Segunda suscripción del mismo usuario | `4242 4242 4242 4242` | Sin prueba: cobra $329 de inmediato |
| Subir el precio | cambiar `STRIPE_CHECKOUT_LOOKUP_KEY` a un precio nuevo | Los nuevos pagan el nuevo; una suscripción existente sigue en $329 al renovar |
| Pide 3D Secure | `4000 0025 0000 3155` | Autenticar en Checkout → igual que arriba |
| Renovación que falla | `4000 0000 0000 0341` + *test clock* que avanza un mes | Gracia de 7 días; «Actualizar tarjeta» abre el portal |
| Cancelar | — | `cancel_at_period_end`; mantiene la IA hasta `paid_until`; al vencer → sin IA |
| Aviso repetido | reenviar el mismo evento desde el dashboard | No duplica `billing_payments` |
| Firma falsa | `curl` sin `stripe-signature` | 400 |

Actualizar `e2e/nube/06-cobro-y-registro.spec.ts` (backend simulado) con
`portal` y los textos nuevos.

## Fase 7 — Producción

1. CSD de Andrea tramitado y **activo** antes del primer cobro real (la
   global se timbra con él).
2. En Stripe, salir de modo de prueba: crear los mismos precios y el mismo
   webhook en *live* y copiar las llaves nuevas.
3. Secretos de Supabase:

| Variable | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (en pruebas `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del endpoint *live* |
| `APP_URL` | ya existe |
| `STRIPE_CHECKOUT_LOOKUP_KEY` | `torq_coach_ia_mensual` (cambiarlo es como se sube el precio para los nuevos) |
| `TORQ_LAUNCH_DATE` | ya no se usa: borrarlo |

4. `./scripts/deploy-functions.sh`.
5. Cobro real con tu tarjeta → revisar la fila en `billing_payments` →
   reembolsarlo desde Stripe.

### Opcional después

- **Plan anual con OXXO o SPEI:** Checkout `mode: 'payment'` (no
  suscripción), `payment_method_types: ['card', 'oxxo', 'customer_balance']`;
  con `checkout.session.completed` o
  `checkout.session.async_payment_succeeded` → `paid_until = +12 meses`.
  Entra a `billing_payments` igual.
- **Facturapi:** la global automática y «Solicitar factura» en Perfil.

## Rutina mensual (cuando ya cobre)

| Día | Qué | Quién |
|---|---|---|
| 1 | Factura global del mes anterior (fase 5) | Andrea o Diego |
| ≤ 17 | Declaración mensual RESICO: ISR (1%–2.5% sobre la base cobrada) e IVA | Andrea o contador |
| Abril | Declaración anual (sueldo + RESICO) | Andrea o contador |

## Notas de implementación

- **SDK:** `npm:stripe@23.0.0` con `apiVersion: '2026-09-30.endive'` (la del
  webhook). Es la versión del SDK que trae esa misma por default, así los
  tipos coinciden. En esta versión la suscripción de una factura está en
  `invoice.parent.subscription_details.subscription`, el cargo sale de
  `invoicePayments.list({ invoice })` y el periodo cobrado de
  `invoice.lines.data[].period.end`.
- **Estado traído de Stripe:** en `customer.subscription.*` y
  `checkout.session.completed` se vuelve a pedir la suscripción
  (`subscriptions.retrieve`): los avisos pueden llegar en desorden. Si
  `invoice.paid` llega antes que el Checkout, la liga con `metadata.user_id`.
- **Solo la suscripción de la fila:** `deleted`, `invoice.*` y los cambios de
  estado solo tocan la fila cuyo `stripe_subscription_id` coincide (un aviso de
  una suscripción anterior no la pisa). `paid_until` nunca retrocede.
- **Volver antes de que termine lo pagado:** `subscribe` quita la cancelación
  de la misma suscripción (`cancel_at_period_end: false`): sin Checkout, sin
  cobro nuevo y con su precio. Si la suscripción está `past_due`/`unpaid`,
  `subscribe` manda al portal en vez de abrir otra.
- **Dos Checkouts a la vez:** si se completa un segundo con una suscripción
  viva, el webhook cancela y reembolsa el segundo.
- **Prueba una vez:** no la tiene quien ya tiene `stripe_subscription_id` o un
  `paid_until` (también de Mercado Pago). Un Checkout abandonado no cuenta.
  `status` regresa `trialDays` y la app muestra «7 días de prueba».
- **Prueba:** `paid_until` = fin de la prueba + 2 días; si cancela durante la
  prueba, justo el fin de la prueba.
- **Reembolsos parciales:** no marcan `refunded_at` (necesitan nota de crédito
  a mano); quedan en el log de la función.
- **Mercado Pago:** `_shared/mercadopago.ts`, `src/core/mercadopago.ts` y los
  secretos `MP_*` siguen en el repo hasta que Stripe cobre en producción.
