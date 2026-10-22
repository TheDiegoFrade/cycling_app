# Auditoría de escalabilidad de Torq

22 de octubre de 2026 · Solo lectura: no se modificó código. Rama `claude/wizardly-bohr-uuc3nv` (= `main` + documentos).

**Cómo se verificó.** Lectura del repo, y mediciones reales: (1) datos de producción de solo lectura (36 sesiones, 38 archivos `.fit`, 594 llamadas a la IA) y (2) un Postgres 16 local con tu `supabase/schema.sql` real, llenado con 5,000 usuarios, 200 mil sesiones, 200 mil archivos en Storage y 2 millones de llamadas de IA, ejecutando las consultas como el rol `authenticated` (con RLS). Lo que no se puede verificar desde el código va marcado **«No verificable»**.

---

## Resumen (lo más urgente)

1. **El reporte mensual de la IA no escala a más de ~35–100 usuarios** y falla en silencio: elige candidatos con una consulta truncada y los procesa de uno en uno dentro de una sola invocación (`monthly-self-report/index.ts:222,257`).
2. **Faltan dos índices que ya se notan con volumen:** `sessions(fit_path)` (un coach tarda **1.1 s** en descargar un `.fit` con 200 mil sesiones; con índice, **0.16 ms**) y `coach_calls(user_id, created_at)` (cada mensaje a Piñón cuesta **97 ms** con 2 M de filas; con índice, **0.06 ms**).
3. **La app descarga todo el historial en cada apertura** sin paginar (`workout-sync.ts:9`, `cloud-sync.ts:242`, `state.ts:174`). Con el tope de 1000 filas de Supabase, a los años se truncaría y la app borraría de IndexedDB lo que no llegó (`state.ts:205`).
4. **No hay Worker con lógica ni conexión directa a Postgres:** el «backend» son Edge Functions de Supabase por HTTP. No hay riesgo de agotar conexiones por request; el cuello está en tiempos de la IA y en jobs programados.
5. **Sí está bien:** los `.fit` son un archivo por sesión (47 KB en promedio), nada crece por segundo, RLS está en las 22 tablas, no hay secretos en el frontend ni en el historial de git, y el costo de IA por usuario es ~US$0.11–0.17 al mes (≈1 % del precio).

---

## Tabla de hallazgos

| # | Punto | Hallazgo | Sev. | Archivo:línea | Arreglo propuesto |
|---|---|---|---|---|---|
| 1 | Sesiones | El `.fit` completo va a **Supabase Storage** (bucket privado `fit-files`, `{user}/{sesión}.fit`); en Postgres solo van resúmenes (TSS, NP, IF, potencias, picos de 1/5/20 min) y `metrics jsonb` (~324 bytes). **Ninguna tabla crece por segundo.** Medido: 47 KB prom., 107 KB máx. por archivo. | OK | `cloud-sync.ts:81-85,94-135` · `schema.sql:84-107,137` · `export/fit.ts:21-26` | Ninguno. Proyección: ~10 MB por usuario al año → ~96 GB por 10 mil usuarios. |
| 2 | Conexión | No hay conexión directa a Postgres, pooler ni Hyperdrive. Todo es `supabase-js` sobre HTTP (PostgREST). El navegador crea **un** cliente (módulo). Las Edge Functions crean un cliente por petición, pero es barato (no abre conexión TCP). | Baja | `src/supabase/client.ts:19` · `pinon-chat/index.ts:32` · `coach-chat/index.ts:39` | Ninguno por conexiones. **No verificable:** tamaño del pool de PostgREST y `max_connections` según tu plan/compute (Dashboard → Database). |
| 3 | Worker | En el repo **no hay código de Worker ni `wrangler`**. `cycling-app.dpcfrade.workers.dev` solo sirve `dist/` (1.3 MB, JS principal 531 KB). Los límites de CPU/tiempo de Workers no aplican a la IA. | Baja | (ausente) · `_shared/mailer.ts:12` | Versionar `wrangler.jsonc` para reproducir el despliegue. **No verificable:** la config del dashboard de Cloudflare. |
| 4 | RLS | 54 políticas, RLS activado en las 22 tablas. Los coaches leen vía `is_coach_of()`. Medido con 200 mil sesiones: coach ve 800 sesiones de 20 atletas en **4.7 ms**; atleta lee las suyas en **0.09 ms**. | OK | `schema.sql:112-1440` | Ninguno hoy. Ver #11. |
| 5 | **Índice** | **Falta índice en `sessions.fit_path`.** La política de Storage del coach hace `exists(select … where fit_path = name)`. Medido: **1,087 ms** por descarga con 200 mil sesiones (recorre toda la tabla); **0.16 ms** con índice. Crece lineal con el total de sesiones (~10 s con 2 M). El atleta bajando su propio archivo no lo sufre (15 ms). | **Alta** | `schema.sql:1224-1233` | `create index if not exists sessions_fit_path_idx on sessions (fit_path) where fit_path is not null;` |
| 6 | **Índice** | **Falta índice en `coach_calls(user_id, …)`.** Piñón cuenta las llamadas del usuario de las últimas 24 h en cada mensaje. Con 2 M de filas: **97 ms** (escanea 26 mil filas de todos los usuarios) vs **0.06 ms** con `(user_id, created_at)`. Crece con el tráfico global. | Media | `schema.sql:1297` · `pinon-chat/index.ts:41-47` | `create index if not exists coach_calls_user_created_idx on coach_calls (user_id, created_at desc);` |
| 7 | **Coach IA** | **`monthly-self-report` no escala.** (a) `candidates()` trae una fila por sesión de TODOS los usuarios del mes, sin `distinct` ni orden, con `.limit(10000)`; con el `max_rows` de 1000 por defecto de Supabase, solo ve ~1000 sesiones (~60–80 usuarios) y siempre las mismas. (b) Procesa de uno en uno dentro de una sola petición: cada reporte tarda ~19 s (p50), máx. 30 s → ~7 usuarios por corrida con 150 s. (c) `Promise.all` sin tope de 3–4 consultas por usuario y `.catch(() => false)`, que descarta en silencio a quien falle. El cron solo corre los días 1–5. | **Alta** | `monthly-self-report/index.ts:217-230,257-263,36` · `schema.sql:1198-1214` | Cola de pendientes + lotes pequeños por invocación; `select distinct` en SQL (vista/RPC); concurrencia limitada con reintentos; cron cada 10 min los días 1–5. |
| 8 | Coach IA | El coach corre **síncrono dentro de la petición** del usuario. `create_plan`: p50 40 s, p90 53 s, máx. 81 s (122 llamadas); tope de código 140 s por el corte de ~150 s de Supabase. Sin cola, sin reintento por 429/529 y sin límite de concurrencia: bajo carga de Anthropic el usuario ve error. Hubo timeouts históricos (1 de cada 3–4 con el diseño anterior). | Media | `coach-chat/index.ts:64,200-260` | Fase 2: trabajo asíncrono (`coach_jobs` + sondeo) con reintentos y backoff. **No verificable:** tu tier de límites en la consola de Anthropic, ni el límite de duración de tu plan de Supabase (150 s Free / más en Pro). |
| 9 | Cliente | Cada apertura de la app baja **todo**: todos los workouts, todas las sesiones y los entrenos de «2000 a 2999», sin paginar ni ventana. Con el tope de 1000 filas se trunca; y como «la nube manda», lo que no llegó se **borra de IndexedDB**. Workouts sin `order`, así que cuáles 1000 llegan es arbitrario. Hoy: máx. 20 workouts por usuario (24 KB). | Media | `workout-sync.ts:9` · `cloud-sync.ts:242-253` · `state.ts:171-174,205` · `plan-weeks.ts:142` | Ventana de fechas + `range()` paginado + sync incremental por `updated_at`; no borrar local si la respuesta llegó truncada. |
| 10 | Cuota IA | El conteo de tokens usa **leer-y-luego-escribir** (no atómico). Peticiones simultáneas del mismo usuario pueden subcontar y pasar el tope; cada `create_plan` extra cuesta ~US$0.09 aunque solo un plan persista. Mitigan: índice único de un plan activo y tope de 3 acciones al mes. | Media | `coach-chat/index.ts:1225-1305` | RPC SQL con `update … set tokens_used = tokens_used + x` (atómico). |
| 11 | RLS / rendimiento | Las políticas usan `auth.uid() = user_id` sin envolver en `(select auth.uid())` y hay varias políticas permisivas por tabla (p. ej. `sessions`: propia + coach). Con los índices actuales rinde bien (ver #4), pero es lo que marca el linter de Supabase. | Baja | `schema.sql:31-1440` | Correr Advisors → Performance; envolver en `(select auth.uid())` y consolidar políticas. |
| 12 | Dependencias | Las Edge Functions importan con versión flotante: `esm.sh/@supabase/supabase-js@2` (15 archivos), `npm:@anthropic-ai/sdk@0`, `npm:zod@4`. Un release nuevo puede romper producción en el siguiente despliegue o arranque en frío, y `esm.sh` es un punto externo de falla. | Media | `coach-chat/index.ts:18` · `_shared/strava.ts:1` · `pinon-chat/index.ts:11-12` | Fijar versiones exactas (`npm:@supabase/supabase-js@2.x.y`) o un `deno.json`. |
| 13 | Abuso | Insert anónimo a la lista de espera sin captcha ni límite; `coach_signup` (sin sesión) puede disparar correos de invitación con un link de coach válido sin marcarlo usado. Riesgo de spam, de cuota de correo (Auth/Resend) y de crecimiento de la tabla. | Media | `schema.sql:1380-1382` · `invite/index.ts:43-57` | Turnstile (Cloudflare) o límite por IP en una función; marcar el link y limitar reenvíos. |
| 14 | Auth por petición | `getUserId` crea un cliente anónimo y llama `/auth/v1/user` en **cada** petición (+1 viaje de ida y vuelta, y carga al servicio de Auth). | Baja | `_shared/strava.ts:12-22` | Validar el JWT localmente con `getClaims()`. |
| 15 | Secretos | **Limpio.** Ninguna `service_role`, llave de Anthropic, Mercado Pago, Resend o Strava en `src/`, en `dist/` ni en el historial de git. Solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (pública por diseño) y `VITE_STRAVA_CLIENT_ID`. `.env.e2e` son valores falsos. CORS `*` en las funciones es aceptable porque exigen JWT. | OK | `src/supabase/client.ts` · `.env.example` · `_shared/cors.ts:2` | Ninguno. |
| 16 | Crecimiento | `coach_calls` ~45 filas por usuario-mes (estimado) → ~5.4 M filas al año con 10 mil usuarios; `billing_events` crece por cada aviso de Mercado Pago. Sin retención. Con los índices de #6 no es problema. | Baja | `schema.sql:1278,1411` | Política de retención (p. ej. 12 meses) más adelante. |
| 17 | N+1 menores | `backfillPowerRecords` baja los `.fit` de uno en uno (solo a demanda, manual). `monthly-self-report` hace ~7 consultas por usuario. | Baja | `cloud-sync.ts:339-372` · `monthly-self-report/index.ts:106-112` | Acotar con #7. |
| 18 | Migraciones | **No hay carpeta de migraciones:** el esquema es un solo `schema.sql` aplicado a mano. No se puede confirmar que producción tenga exactamente esos índices y políticas. | Media | `supabase/schema.sql` | Ejecutar las consultas de abajo; pasar a `supabase/migrations/` versionadas. |

---

## Punto 4 en detalle: IA y costo

**Dónde se llama:** `coach-chat` (crear plan, evaluación semanal, publicar bloque, semana del coach, revisión mensual), `pinon-chat` y `monthly-self-report`, todas Edge Functions de Supabase en Deno. Con streaming para no pasar el corte por inactividad. No hay segundo plano: el usuario espera.

**Límites de Workers:** no aplican; no hay Worker. Los límites relevantes son los de Edge Functions de Supabase (tiempo máximo por petición, CPU) y los de Anthropic (**no verificables** desde el código).

**Tokens y costo por llamada** (promedios reales de `coach_calls`, 594 llamadas):

| Paso | Modelo | Tokens (entrada / salida) | Costo | Duración p50 / máx. |
|---|---|---|---|---|
| Crear plan | Sonnet 5.5 | ~2,000 / ~5,800 | US$0.077 | 40 s / 81 s |
| Reintento de la guardia (~18 % de los planes) | Sonnet 5.5 | ~6,600 / ~5,400 | US$0.071 | 29 s / 36 s |
| Redactor de descripciones (×3) | Haiku 5.5 | ~800 / ~620 | US$0.0005 c/u | 4 s |
| **Plan completo** | | | **≈ US$0.089** | |
| Evaluación semanal | Haiku 5.5 / Sonnet 5.5 (si hay que razonar el FTP) | ~3,200 / ~5,600 y ~3,100 / ~1,900 | US$0.004 / US$0.059 | 27 s / 13 s |
| Reporte mensual | Haiku 5.5 | ~2,600 / ~4,700 | US$0.004 | 19 s / 30 s |
| Mensaje a Piñón | Haiku 5.5 | ~1,500 / ~100 | US$0.0002 | 1.3 s |

**Costo por usuario al mes** (supuestos: 4 evaluaciones, 30 mensajes a Piñón, 1 reporte):

| Escenario | Costo |
|---|---|
| Primer mes (plan + evaluaciones + Piñón + reporte) | **≈ US$0.17** |
| Mes normal (con 0.3 cambios de plan al mes) | **≈ US$0.11** |
| Máximo dentro de los topes (3 planes + 10 evaluaciones Sonnet + 10 Piñón al día) | ≈ US$0.93 |
| Techo teórico del tope de 500 mil tokens | ≈ US$5 |

Frente a $399 MXN (≈ $344 sin IVA ≈ US$18–19 con un tipo de cambio supuesto de 18.5), la IA es **~0.6–0.9 %** del ingreso (≈1.2 % con precio de fundador). No incluye la comisión de Mercado Pago.

**Costo que no tiene ingreso:** los atletas de un coach no pagan a Torq pero usan la IA. Un coach con sus 20 atletas cuesta **≈ US$2–3.4 al mes** de IA. Con 100 coaches llenos: ≈ US$220–340 al mes.

**Alerta de hoy:** tu límite de gasto de la consola es de US$20 al mes y ya va en 82 %. Es un interruptor general: al llegar, la IA se pausa para **todos** los usuarios. Conviene subirlo y poner alertas.

---

## Proyección con 10x y 100x

| | 1,000 usuarios | 10,000 | 100,000 |
|---|---|---|---|
| Archivos `.fit` por año (4 sesiones/semana, 47 KB) | ~10 GB | ~96 GB | ~960 GB |
| Filas de `sessions` por año | ~200 mil | ~2 M | ~20 M |
| Filas de `coach_calls` por año | ~540 mil | ~5.4 M | ~54 M |
| IA al mes (US$0.11–0.17 por usuario) | US$110–170 | US$1.1–1.7 mil | US$11–17 mil |
| Qué se rompe primero | Reporte mensual (#7); sin él, nada | Descarga del coach (#5) y Piñón (#6) si no hay índices; apertura de la app (#9) en usuarios con años de historial | Límites de Anthropic y de Edge Functions; costo de Storage; retención de tablas |

El primer punto de quiebre real es el **#7 (reporte mensual)**, ya con ~60–100 usuarios activos. Los índices (#5 y #6) se vuelven molestos hacia los miles. Lo demás (#8, #9) escala de forma más gradual.

---

## Lo que NO se pudo verificar desde el código

- **Supabase:** plan y compute, `max_connections` y tamaño del pool, **«Max rows» de la API** (por defecto 1000, y de eso dependen #7 y #9), límite de duración de Edge Functions, cuota de Storage, límite de correos de Auth.
- **Anthropic:** tier y límites de tokens por minuto y de concurrencia.
- **Cloudflare:** configuración real del despliegue (no hay `wrangler` en el repo) y límites de tu plan.
- **Resend:** cuota de envío y reputación del dominio.
- **Producción vs `schema.sql`:** no hay migraciones, así que los índices y políticas reales deben confirmarse con el SQL de abajo.

### SQL para revisarlo en Supabase (SQL Editor, solo lectura)

```sql
-- 1) Índices que existen de verdad (compara con schema.sql)
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' order by 1, 2;

-- 2) Tablas más grandes y filas
select relname, n_live_tup,
       pg_size_pretty(pg_total_relation_size(relid)) as tamano
from pg_stat_user_tables order by pg_total_relation_size(relid) desc;

-- 3) Políticas RLS reales
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3;

-- 4) Llaves foráneas sin índice (borrar un usuario las recorre)
select c.conrelid::regclass as tabla, a.attname as columna
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f'
  and not exists (select 1 from pg_index i
                  where i.indrelid = c.conrelid and i.indkey[0] = a.attnum);

-- 5) Índices que nunca se usan
select relname, indexrelname, idx_scan
from pg_stat_user_indexes where schemaname = 'public' and idx_scan = 0 order by 1;

-- 6) Conexiones
show max_connections;
select state, count(*) from pg_stat_activity group by 1;

-- 7) Consultas más pesadas (si pg_stat_statements está activo)
select left(query, 120) as consulta, calls,
       round(mean_exec_time::numeric, 1) as ms_prom,
       round(total_exec_time::numeric / 1000, 1) as s_total
from pg_stat_statements order by total_exec_time desc limit 15;

-- 8) ¿Existen los índices que faltan?
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('sessions_fit_path_idx', 'coach_calls_user_created_idx');
```

También: **Dashboard → Advisors → Performance** (muestra `auth_rls_initplan` y `multiple_permissive_policies`) y **Settings → API → Max rows**.

---

## Lista priorizada de cambios (esperan tu aprobación)

**P0, esta semana (minutos, riesgo bajo, solo SQL)**
1. Crear el índice en `sessions (fit_path)`. → #5
2. Crear el índice en `coach_calls (user_id, created_at desc)`. → #6

   **Sin `CONCURRENTLY`:** el SQL Editor de Supabase corre todo dentro de una transacción y `create index concurrently` falla ahí («cannot run inside a transaction block»). Hoy las tablas son pequeñas (36 sesiones y ~600 llamadas), así que un `create index` normal tarda milisegundos y el bloqueo es imperceptible. `CONCURRENTLY` solo haría falta con millones de filas, y entonces se corre desde `psql` o la CLI.
3. Subir el límite de gasto de la consola de Anthropic y configurar alertas.

**P1, antes de ~100 usuarios activos**
4. Rehacer `monthly-self-report`: cola de pendientes, lotes por invocación, `distinct` en SQL, concurrencia limitada y cron cada 10 min los días 1–5. → #7
5. Cliente: ventana de fechas, paginación y sync incremental; no borrar local con respuestas truncadas. → #9
6. Conteo de tokens atómico (RPC). → #10
7. Ejecutar el SQL de revisión y confirmar el «Max rows» y los índices reales. → #18

**P2, antes de miles de usuarios**
8. Fijar versiones exactas en las Edge Functions. → #12
9. Captcha y límite de envíos en lista de espera y `coach_signup`. → #13
10. Coach IA asíncrono (`coach_jobs` + sondeo) con reintentos y límite de concurrencia; verificar el tier de Anthropic. → #8
11. `(select auth.uid())` y consolidar políticas según Advisors. → #11
12. `getClaims()` en lugar de `getUser()`. → #14

**P3, higiene**
13. Pasar a `supabase/migrations/` versionadas; `wrangler.jsonc` en el repo; retención de `coach_calls` y `billing_events`. → #3, #16, #18

## Seguimiento — Lote 1 (implementado)

- Índices `sessions_fit_path_idx` y `coach_calls_user_created_idx` (sin CONCURRENTLY).
- Conteo de tokens atómico: función SQL `coach_usage_add` (solo `service_role`); `coach-chat` ya no lee-y-escribe. El reembolso resta solo lo que sumó ese request. Probado en Postgres local: 2000 incrementos concurrentes → 2000 exactos.
- Migraciones versionadas en `supabase/migrations/` (+ `scripts/check-schema-sync.sh`).
- Orden de despliegue: primero correr la migración en Supabase, luego desplegar `coach-chat`.
