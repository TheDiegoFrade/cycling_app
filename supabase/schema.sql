-- Rodillo — esquema de Supabase (auth + datos por usuario)
--
-- Cómo usarlo: pega TODO este archivo en el SQL Editor de tu proyecto
-- (Supabase dashboard → SQL Editor → New query) y dale "Run". Es seguro
-- volver a correrlo si algo falla a medias (todo usa "if not exists" /
-- "on conflict do nothing" donde aplica).
--
-- Diseño de dos niveles: esta base de datos solo guarda el RESUMEN de cada
-- sesión (números, no los samples segundo a segundo) — el detalle completo
-- vive en el .fit dentro de Storage. Así la tabla queda liviana y rápida
-- para reportes/gráficas, y el .fit sigue siendo la fuente completa si
-- algún día hace falta reconstruir la sesión entera.

-- ─────────────────────────────────────────────────────────────────────────
-- profiles: un renglón por usuario, mismo shape que core/types.ts Profile
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ftp integer not null default 200,
  hr_max integer not null default 185,
  cadence_floor integer not null default 70,
  hr_ceiling integer not null default 170,
  hr_min integer not null default 0,
  cadence_max integer not null default 999,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles: leer lo propio" on profiles;
create policy "profiles: leer lo propio" on profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles: insertar lo propio" on profiles;
create policy "profiles: insertar lo propio" on profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles: actualizar lo propio" on profiles;
create policy "profiles: actualizar lo propio" on profiles for update
  using (auth.uid() = user_id);

-- Datos personales, todos opcionales — no entran en ningún cálculo del
-- motor (FTP/hr_max siguen mandando en zonas y reglas), solo identifican al
-- atleta y sirven de referencia.
alter table profiles add column if not exists name text;
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists height_cm numeric;
alter table profiles add column if not exists weight_kg numeric;
alter table profiles add column if not exists sex text check (sex in ('M', 'F', 'other'));

-- Contexto de coaching para el coach de IA (ver supabase/functions/coach-chat)
-- — mismo criterio: opcional, no afecta el motor, se fusiona al guardar
-- desde el cuestionario inicial, nunca se reemplaza el renglón completo.
alter table profiles add column if not exists experience_level text
  check (experience_level in ('new_to_cycling', 'returning_or_new_to_app', 'experienced'));
alter table profiles add column if not exists general_fitness_level text
  check (general_fitness_level in ('sedentary', 'active_other_sport', 'active_cyclist'));
alter table profiles add column if not exists years_riding numeric;
alter table profiles add column if not exists structured_training_years numeric;
alter table profiles add column if not exists competes boolean;
alter table profiles add column if not exists category text;
alter table profiles add column if not exists discipline text
  check (discipline in ('mountain', 'road', 'gravel', 'other'));
alter table profiles add column if not exists injuries text;
alter table profiles add column if not exists rides_outside boolean;
alter table profiles add column if not exists has_outdoor_power_meter boolean;
alter table profiles add column if not exists recent_best_result text;
-- ftp/hr_max ya existían desde el inicio (son requeridos para el motor) —
-- estas banderas dicen si el atleta confirmó que ese número es real, o si
-- sigue siendo el default sin tocar (ver core/types.ts Profile).
alter table profiles add column if not exists ftp_confirmed boolean;
alter table profiles add column if not exists hr_max_confirmed boolean;

-- ─────────────────────────────────────────────────────────────────────────
-- sessions: resumen de cada entrenamiento (sin los samples, ver Storage)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_name text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  ftp integer not null,
  avg_power numeric,
  max_power numeric,
  avg_cadence numeric,
  max_cadence numeric,
  avg_hr numeric,
  max_hr numeric,
  normalized_power numeric,
  intensity_factor numeric,
  training_stress_score numeric,
  variability_index numeric,
  efficiency_factor numeric,
  hr_drift_pct numeric,
  rpe smallint,
  note text,
  fit_path text, -- ruta dentro del bucket "fit-files", null si no se subió
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;

drop policy if exists "sessions: leer lo propio" on sessions;
create policy "sessions: leer lo propio" on sessions for select
  using (auth.uid() = user_id);

drop policy if exists "sessions: insertar lo propio" on sessions;
create policy "sessions: insertar lo propio" on sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "sessions: actualizar lo propio" on sessions;
create policy "sessions: actualizar lo propio" on sessions for update
  using (auth.uid() = user_id);

drop policy if exists "sessions: borrar lo propio" on sessions;
create policy "sessions: borrar lo propio" on sessions for delete
  using (auth.uid() = user_id);

create index if not exists sessions_user_started_idx on sessions (user_id, started_at desc);

-- id de la actividad de Strava de la que se importó esta sesión (si aplica)
-- — evita importar la misma actividad dos veces.
alter table sessions add column if not exists strava_activity_id bigint;
create unique index if not exists sessions_user_strava_activity_idx
  on sessions (user_id, strava_activity_id) where strava_activity_id is not null;

-- Picos de potencia (mejor promedio sostenido de 1/5/20 min) — guardados
-- aparte para poder calcular récords históricos de TODA la cuenta sin tener
-- que descargar y decodificar el .fit de cada sesión guardada en la nube,
-- que no escala con el historial. Se calculan al subir cada sesión nueva
-- (ver sync/cloud-sync.ts pushSessionToCloud); las que ya estaban subidas
-- antes de este cambio se recalculan a demanda (botón "Recalcular picos
-- históricos", ver backfillPowerRecords), nunca automático.
alter table sessions add column if not exists best_1min_power numeric;
alter table sessions add column if not exists best_5min_power numeric;
alter table sessions add column if not exists best_20min_power numeric;

-- id del workout del que salió esta sesión ('fit-import' si vino de un
-- .fit subido a mano) — junto con strava_activity_id, distingue sesiones
-- grabadas en vivo con la app de las importadas, para que rachas/récords/
-- logros solo cuenten lo que de verdad se entrenó acá (ver
-- core/session-origin.ts). Filas de antes de esta columna quedan en null,
-- que se trata como "en vivo" para no quitarle un récord ya ganado a nadie.
alter table sessions add column if not exists workout_id text;

-- Comentario corto del coach IA para ESTA sesión (modo
-- finished_training_eval_comment) — null hasta que se pida uno. Null
-- también funciona como el gate de "no pedir dos veces para la misma
-- sesión", ver coach-chat/index.ts checkModeAllowed.
alter table sessions add column if not exists coach_comment text;

-- ─────────────────────────────────────────────────────────────────────────
-- settings: ajustes de la app (volumen, reglas de fábrica activas,
-- intervals.icu, personaje). Un renglón por usuario, blob jsonb porque el
-- shape de AppSettings cambia seguido (nuevos toggles) y no necesita
-- consultarse por columna — ver storage/settings-store.ts para el tipo.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

drop policy if exists "settings: leer lo propio" on settings;
create policy "settings: leer lo propio" on settings for select
  using (auth.uid() = user_id);

drop policy if exists "settings: insertar lo propio" on settings;
create policy "settings: insertar lo propio" on settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "settings: actualizar lo propio" on settings;
create policy "settings: actualizar lo propio" on settings for update
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- workouts: entrenos personalizados/importados/agendados. Blob jsonb con el
-- mismo shape que core/types.ts Workout (incluye su propio "id") — los
-- intervalos/reglas anidados no necesitan consultarse por columna.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists workouts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table workouts enable row level security;

drop policy if exists "workouts: leer lo propio" on workouts;
create policy "workouts: leer lo propio" on workouts for select
  using (auth.uid() = user_id);

drop policy if exists "workouts: insertar lo propio" on workouts;
create policy "workouts: insertar lo propio" on workouts for insert
  with check (auth.uid() = user_id);

drop policy if exists "workouts: actualizar lo propio" on workouts;
create policy "workouts: actualizar lo propio" on workouts for update
  using (auth.uid() = user_id);

drop policy if exists "workouts: borrar lo propio" on workouts;
create policy "workouts: borrar lo propio" on workouts for delete
  using (auth.uid() = user_id);

create index if not exists workouts_user_idx on workouts (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Strava: cada usuario conecta SU PROPIA cuenta (OAuth). Los tokens nunca
-- los toca el navegador directo — solo las Edge Functions (con la
-- service role key, que ignora RLS) los leen/escriben. Por eso esta tabla
-- no tiene policy de insert/update/select para el cliente: si no hay
-- policy, RLS lo bloquea por default para cualquiera que no sea service role.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists strava_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null, -- unix timestamp (segundos), tal como lo da Strava
  updated_at timestamptz not null default now()
);

alter table strava_tokens enable row level security;

-- Tabla aparte, SIN tokens, que el cliente sí puede leer — solo para
-- mostrar "conectado como fulano" en la UI sin exponer credenciales.
create table if not exists strava_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  strava_athlete_id bigint not null,
  strava_athlete_name text,
  connected_at timestamptz not null default now()
);

alter table strava_connections enable row level security;

drop policy if exists "strava_connections: leer lo propio" on strava_connections;
create policy "strava_connections: leer lo propio" on strava_connections for select
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Coach IA: planes generados y uso mensual de la API de Claude.
--
-- training_plans: el cliente puede LEER su plan (para pintar la pantalla
-- Plan), pero solo la Edge Function coach-chat (service role, ignora RLS)
-- puede escribirlo — igual que strava_tokens. El frecuencia de llamadas al
-- coach se controla con last_eval_iso_week / current_block_exhausted, ver
-- supabase/functions/coach-chat/index.ts (checkModeAllowed).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists training_plans (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  goal text not null,
  data jsonb not null, -- bloques + semanas + workouts generados, shape evoluciona
  last_eval_iso_week text, -- ej. "2026-W40" — gate de 1 evaluación semanal
  current_block_exhausted boolean not null default false, -- gate de publish_block
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table training_plans enable row level security;

drop policy if exists "training_plans: leer lo propio" on training_plans;
create policy "training_plans: leer lo propio" on training_plans for select
  using (auth.uid() = user_id);

-- Registro append-only de cada vez que se crea o modifica un plan — sirve
-- para el tope de 3 al mes (crear + modificar cuentan juntos, ver
-- coach-chat/index.ts checkModeAllowed). El cliente puede leerlo (para
-- mostrar "te quedan N de 3" antes de que lo intente), solo la Edge
-- Function escribe.
create table if not exists plan_actions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('create', 'modify')),
  created_at timestamptz not null default now()
);

alter table plan_actions enable row level security;

drop policy if exists "plan_actions: leer lo propio" on plan_actions;
create policy "plan_actions: leer lo propio" on plan_actions for select
  using (auth.uid() = user_id);

create index if not exists plan_actions_user_created_idx on plan_actions (user_id, created_at);

create index if not exists training_plans_user_status_idx on training_plans (user_id, status);

-- Un solo plan activo por usuario, garantizado por Postgres — no depende de
-- que checkModeAllowed() en coach-chat/index.ts nunca tenga un bug ni de
-- que dos requests no se crucen. Insertar un segundo plan 'active' para el
-- mismo user_id truena con "duplicate key value" directo en la base.
create unique index if not exists training_plans_one_active_per_user
  on training_plans (user_id) where status = 'active';

-- coach_usage: conteo de tokens/requests por usuario y mes — solo para
-- monitoreo y como red de seguridad de gasto (ver MONTHLY_TOKEN_CEILING en
-- coach-chat/index.ts). El límite real de frecuencia es el de arriba, este
-- es solo el techo duro por si ese falla.
create table if not exists coach_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period date not null, -- primer día del mes, ej. 2026-10-01
  tokens_used integer not null default 0,
  requests_used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table coach_usage enable row level security;

drop policy if exists "coach_usage: leer lo propio" on coach_usage;
create policy "coach_usage: leer lo propio" on coach_usage for select
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Storage: bucket privado para los .fit, un archivo por sesión en
-- "{user_id}/{session_id}.fit" — el primer segmento de la ruta ES el
-- user_id, y las políticas de abajo exigen que coincida con auth.uid().
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('fit-files', 'fit-files', false)
on conflict (id) do nothing;

drop policy if exists "fit-files: leer lo propio" on storage.objects;
create policy "fit-files: leer lo propio" on storage.objects for select
  using (bucket_id = 'fit-files' and (storage.foldername(name)) [1] = auth.uid()::text);

drop policy if exists "fit-files: subir lo propio" on storage.objects;
create policy "fit-files: subir lo propio" on storage.objects for insert
  with check (bucket_id = 'fit-files' and (storage.foldername(name)) [1] = auth.uid()::text);

drop policy if exists "fit-files: borrar lo propio" on storage.objects;
create policy "fit-files: borrar lo propio" on storage.objects for delete
  using (bucket_id = 'fit-files' and (storage.foldername(name)) [1] = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- plan_actions: amplía el check de `action` para incluir 'weekly_eval' —
-- antes solo 'create'/'modify'. weekly_eval tiene su propio tope mensual
-- SEPARADO del de create/modify (ver MONTHLY_WEEKLY_EVAL_LIMIT en
-- coach-chat/index.ts) — mezclarlos haría que evaluar la semana unas pocas
-- veces se comiera todo el presupuesto de cambios de plan del mes.
-- ─────────────────────────────────────────────────────────────────────────
alter table plan_actions drop constraint if exists plan_actions_action_check;
alter table plan_actions add constraint plan_actions_action_check check (action in ('create', 'modify', 'weekly_eval'));

-- ─────────────────────────────────────────────────────────────────────────
-- training_plans: hasta 2 weekly_eval por semana ISO (antes 1) — permite
-- "refrescar" la semana si el atleta quiere agregar contexto que olvidó la
-- primera vez (ver MONTHLY_WEEKLY_EVAL_LIMIT y checkModeAllowed en
-- coach-chat/index.ts). eval_count_this_iso_week cuenta cuántas van en la
-- semana ISO de last_eval_iso_week; se resetea solo cuando cambia de semana.
-- ─────────────────────────────────────────────────────────────────────────
alter table training_plans add column if not exists eval_count_this_iso_week int not null default 0;

-- ─────────────────────────────────────────────────────────────────────────
-- fit-files: faltaba la política de UPDATE — nunca hizo falta hasta ahora
-- porque nada volvía a subir un .fit con el mismo id de sesión. El
-- drag-and-drop de sesiones completadas (mover de día) sí lo hace
-- (pushSessionToCloud con upsert:true sobre el mismo archivo), y eso
-- dispara un UPDATE en Storage que, sin esta política, RLS rechaza con
-- "new row violates row-level security policy" (encontrado probando el
-- drag-and-drop real). select/insert/delete ya existían, solo faltaba esta.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "fit-files: actualizar lo propio" on storage.objects;
create policy "fit-files: actualizar lo propio" on storage.objects for update
  using (bucket_id = 'fit-files' and (storage.foldername(name)) [1] = auth.uid()::text)
  with check (bucket_id = 'fit-files' and (storage.foldername(name)) [1] = auth.uid()::text);
