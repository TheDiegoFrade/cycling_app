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
-- De dónde salió el FTP (ver core/coach-profile.ts): el coach no debe tomar
-- los 200 W de fábrica ni un provisional por una medición.
alter table profiles add column if not exists ftp_source text
  check (ftp_source in ('default', 'provisional', 'manual', 'test_ramp', 'test_20min'));
alter table profiles add column if not exists ftp_updated_at timestamptz;
update profiles set ftp_source = case when ftp_confirmed then 'manual' else 'default' end
  where ftp_source is null;

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
-- Métricas por sesión para la ficha del atleta (curva con calidad de cada
-- pico, kJ, zonas, torque, tiempo a umbral, sesión estable): ver
-- src/engine/session-metrics.ts. Sin samples en la nube, esto es lo que
-- permite mirar 3 y 6 meses desde cualquier dispositivo y desde la vista
-- del coach.
alter table sessions add column if not exists metrics jsonb;
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

-- ─────────────────────────────────────────────────────────────────────────
-- sessions.source: de dónde llegó cada sesión (vista del coach, paso 1 —
-- ver docs/coach-view/README.md). Es la llave de la regla de Strava: sus
-- términos prohíben usar sus datos en modelos de IA y mostrarlos a otras
-- personas, así que lo que tenga source = 'strava' no entra al contexto del
-- coach de IA (ver src/core/session-source.ts y coach-chat/index.ts) ni,
-- más adelante, a la vista del coach.
--   torq: grabada en vivo con la app · fit_upload: .fit subido a mano ·
--   intervals: llegó de intervals.icu · strava: importada de Strava ·
--   manual: registrada a mano sin archivo
-- ─────────────────────────────────────────────────────────────────────────
alter table sessions add column if not exists source text;

alter table sessions drop constraint if exists sessions_source_check;
alter table sessions add constraint sessions_source_check
  check (source in ('torq', 'fit_upload', 'intervals', 'strava', 'manual'));

-- Filas de antes de esta columna: se deduce igual que sessionSourceOf()
-- en src/core/session-source.ts.
update sessions set source = case
  when strava_activity_id is not null or workout_id = 'strava-import' then 'strava'
  when workout_id = 'fit-import' then 'fit_upload'
  else 'torq'
end
where source is null;

-- Strava gana siempre, lo mande o no el cliente: si la fila trae id de
-- actividad de Strava, es 'strava'. Cubre también versiones viejas de la app
-- (PWA en caché) que todavía no mandan `source` — sin esto una importación
-- de Strava desde una de esas quedaría como 'torq' y se colaría a la IA.
create or replace function sessions_set_source() returns trigger
language plpgsql as $$
begin
  if new.strava_activity_id is not null or new.workout_id = 'strava-import' then
    new.source := 'strava';
  elsif new.source is null then
    new.source := case when new.workout_id = 'fit-import' then 'fit_upload' else 'torq' end;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_set_source on sessions;
create trigger sessions_set_source before insert or update on sessions
  for each row execute function sessions_set_source();

alter table sessions alter column source set not null;

-- ─────────────────────────────────────────────────────────────────────────
-- sessions.kind / completion / srpe_load: fuerza, movilidad y flexibilidad
-- conviven con la bici en la misma tabla (vista del coach, paso 2 — ver
-- docs/coach-view/README.md y src/core/session-kind.ts).
--   kind: bike_indoor, bike_outdoor, strength, mobility, flexibility, other.
--     null = bici de la que no sabemos si fue en interior o exterior (un
--     .fit subido a mano, o filas de antes de esta columna): se trata como
--     bici en todo.
--   completion: complete, partial, skipped — solo lo traen las sesiones
--     registradas a mano; null en bici grabada/importada (se asume hecha).
--   srpe_load: RPE × minutos, solo sesiones que no son de bici. Nunca se
--     convierte a TSS ni se suma al CTL de la bici: son escalas distintas.
-- ─────────────────────────────────────────────────────────────────────────
alter table sessions add column if not exists kind text;
alter table sessions drop constraint if exists sessions_kind_check;
alter table sessions add constraint sessions_kind_check
  check (kind in ('bike_indoor', 'bike_outdoor', 'strength', 'mobility', 'flexibility', 'other'));

alter table sessions add column if not exists completion text;
alter table sessions drop constraint if exists sessions_completion_check;
alter table sessions add constraint sessions_completion_check
  check (completion in ('complete', 'partial', 'skipped'));

alter table sessions add column if not exists srpe_load numeric;
alter table sessions drop constraint if exists sessions_srpe_load_check;
alter table sessions add constraint sessions_srpe_load_check
  check (srpe_load is null or (srpe_load >= 0 and kind in ('strength', 'mobility', 'flexibility', 'other')));

-- Lo único que se sabe con certeza de las filas viejas: lo grabado en vivo
-- con Torq es rodillo. Lo de Strava y los .fit subidos se quedan en null
-- (bici sin detalle) en vez de adivinar.
update sessions set kind = 'bike_indoor' where kind is null and source = 'torq';

-- Versiones viejas de la app (PWA en caché) no mandan `kind`: lo grabado
-- en vivo con Torq siempre es rodillo, así que el trigger de source también
-- lo completa. Misma función de arriba, con esa línea de más.
create or replace function sessions_set_source() returns trigger
language plpgsql as $$
begin
  if new.strava_activity_id is not null or new.workout_id = 'strava-import' then
    new.source := 'strava';
  elsif new.source is null then
    new.source := case when new.workout_id = 'fit-import' then 'fit_upload' else 'torq' end;
  end if;
  if new.kind is null and new.source = 'torq' then
    new.kind := 'bike_indoor';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Vista del coach, paso 3: vínculo coach ↔ atleta e invitaciones (ver
-- docs/coach-view/README.md, "Permisos (RLS)").
--
-- Quién es coach: profiles.is_coach, que SOLO se cambia a mano desde el SQL
-- Editor (el trigger de abajo ignora cualquier intento desde la app):
--   update profiles set is_coach = true
--   where user_id = (select id from auth.users where email = 'coach@ejemplo.com');
-- El atleta ve el nombre del coach (profiles.name) al abrir la invitación.
-- El coach NO es otro tipo de cuenta: es un usuario normal con un permiso
-- extra. Entrena con la app como cualquier atleta (Inicio, Plan, Historial,
-- Forma…) y además ve las secciones del coach en la barra lateral.
-- ─────────────────────────────────────────────────────────────────────────
alter table profiles add column if not exists is_coach boolean not null default false;

create or replace function profiles_protect_is_coach() returns trigger
language plpgsql as $$
begin
  -- Desde la app (rol authenticated/anon) nadie se puede volver coach:
  -- solo el SQL Editor o la service role (auth.role() distinto o null).
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_coach := false;
    elsif new.is_coach is distinct from old.is_coach then
      new.is_coach := old.is_coach;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_is_coach on profiles;
create trigger profiles_protect_is_coach before insert or update on profiles
  for each row execute function profiles_protect_is_coach();

-- coach_athletes: el vínculo y el plan acordado. Nadie lo escribe directo:
-- se crea con accept_coach_invite() y se termina con end_my_coach_link()
-- (ambas security definer, abajo). Coach y atleta pueden leer los suyos.
create table if not exists coach_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users (id) on delete cascade,
  athlete_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('basica', 'pro', 'revision', 'todo')),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (coach_id <> athlete_id)
);

alter table coach_athletes enable row level security;

drop policy if exists "coach_athletes: leer los propios" on coach_athletes;
create policy "coach_athletes: leer los propios" on coach_athletes for select
  using (auth.uid() = coach_id or auth.uid() = athlete_id);

-- Un atleta tiene como máximo un coach activo, garantizado por Postgres
-- (mismo patrón que training_plans_one_active_per_user).
create unique index if not exists coach_athletes_one_active_per_athlete
  on coach_athletes (athlete_id) where status = 'active';
create index if not exists coach_athletes_coach_status_idx on coach_athletes (coach_id, status);

-- coach_invites: links de un solo uso con vencimiento. Solo se guarda el
-- hash SHA-256 del token; el token va en el link y nunca toca la base.
create table if not exists coach_invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  tier text not null check (tier in ('basica', 'pro', 'revision', 'todo')),
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table coach_invites enable row level security;

drop policy if exists "coach_invites: leer las propias" on coach_invites;
create policy "coach_invites: leer las propias" on coach_invites for select
  using (auth.uid() = coach_id);

drop policy if exists "coach_invites: crear si es coach" on coach_invites;
create policy "coach_invites: crear si es coach" on coach_invites for insert
  with check (
    auth.uid() = coach_id
    and exists (select 1 from profiles where user_id = auth.uid() and is_coach)
    and used_by is null
    and used_at is null
    and expires_at > now()
    and expires_at <= now() + interval '30 days'
  );

-- Cancelar = borrar un link que nadie ha usado.
drop policy if exists "coach_invites: cancelar las propias sin usar" on coach_invites;
create policy "coach_invites: cancelar las propias sin usar" on coach_invites for delete
  using (auth.uid() = coach_id and used_by is null);

create index if not exists coach_invites_coach_idx on coach_invites (coach_id, created_at desc);

-- is_coach_of: LA regla de permisos de la vista del coach. Verdadera solo
-- si hay un vínculo activo entre el usuario actual y ese atleta — al
-- desvincularse deja de serlo en ese instante. Las políticas de lectura del
-- coach (paso 4) se construyen sobre esto.
create or replace function is_coach_of(p_athlete_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coach_athletes
    where coach_id = auth.uid() and athlete_id = p_athlete_id and status = 'active'
  );
$$;

-- Lo que ve el atleta al abrir el link, antes de aceptar. status:
-- valid | invalid | used | expired | own (el coach abrió su propio link).
create or replace function preview_coach_invite(p_token text)
returns table (status text, coach_name text, tier text, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  inv coach_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para ver la invitación.';
  end if;
  select * into inv from coach_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    return query select 'invalid'::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  return query
    select
      case
        when inv.used_by is not null then 'used'
        when inv.expires_at <= now() then 'expired'
        when inv.coach_id = auth.uid() then 'own'
        else 'valid'
      end,
      (select p.name from profiles p where p.user_id = inv.coach_id),
      inv.tier,
      inv.expires_at;
end;
$$;

-- Aceptar: todo en una transacción — marca el link como usado y crea el
-- vínculo, o no hace nada. El índice único de arriba respalda la regla de
-- un coach activo aunque dos aceptaciones se crucen.
create or replace function accept_coach_invite(p_token text)
returns table (coach_name text, tier text)
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv coach_invites%rowtype;
  current_coach uuid;
begin
  if uid is null then
    raise exception 'Inicia sesión para aceptar la invitación.';
  end if;
  select * into inv from coach_invites
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    for update;
  if not found then
    raise exception 'Este link de invitación no existe.';
  end if;
  if inv.used_by is not null then
    raise exception 'Este link ya se usó. Pídele a tu coach uno nuevo.';
  end if;
  if inv.expires_at <= now() then
    raise exception 'Este link ya venció. Pídele a tu coach uno nuevo.';
  end if;
  if inv.coach_id = uid then
    raise exception 'No puedes aceptar tu propia invitación.';
  end if;
  select coach_id into current_coach from coach_athletes where athlete_id = uid and status = 'active';
  if current_coach = inv.coach_id then
    raise exception 'Ya es tu coach.';
  elsif current_coach is not null then
    raise exception 'Ya tienes un coach. Desvincúlate desde Perfil antes de aceptar otro.';
  end if;

  insert into coach_athletes (coach_id, athlete_id, tier) values (inv.coach_id, uid, inv.tier);
  update coach_invites set used_by = uid, used_at = now() where id = inv.id;

  return query select (select p.name from profiles p where p.user_id = inv.coach_id), inv.tier;
end;
$$;

-- El coach actual del atleta (nombre incluido — el atleta no puede leer el
-- perfil del coach directo). Cero filas si no tiene.
create or replace function my_coach()
returns table (coach_name text, tier text, started_at timestamptz)
language sql stable security definer set search_path = public as $$
  select (select p.name from profiles p where p.user_id = ca.coach_id), ca.tier, ca.started_at
  from coach_athletes ca
  where ca.athlete_id = auth.uid() and ca.status = 'active';
$$;

-- El atleta termina el vínculo cuando quiera (desde Perfil). Regresa
-- true si había uno activo.
create or replace function end_my_coach_link() returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión.';
  end if;
  update coach_athletes set status = 'ended', ended_at = now()
    where athlete_id = auth.uid() and status = 'active';
  return found;
end;
$$;

-- Las funciones security definer no deben quedar abiertas a anon.
revoke execute on function is_coach_of(uuid) from public, anon;
revoke execute on function preview_coach_invite(text) from public, anon;
revoke execute on function accept_coach_invite(text) from public, anon;
revoke execute on function my_coach() from public, anon;
revoke execute on function end_my_coach_link() from public, anon;
grant execute on function is_coach_of(uuid) to authenticated;
grant execute on function preview_coach_invite(text) to authenticated;
grant execute on function accept_coach_invite(text) to authenticated;
grant execute on function my_coach() to authenticated;
grant execute on function end_my_coach_link() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Vista del coach, paso 4: lectura de los atletas (solo lectura). Todo se
-- apoya en coach_athletes / is_coach_of del paso 3: al desvincularse, el
-- coach deja de ver todo esto en ese mismo instante.
-- ─────────────────────────────────────────────────────────────────────────

-- sessions: el coach lee las de sus atletas, EXCEPTO las que llegaron por
-- Strava (sus términos prohíben mostrar sus datos a otras personas). No
-- escribe nada: no hay policy de insert/update/delete para él.
drop policy if exists "sessions: coach lee las de sus atletas" on sessions;
create policy "sessions: coach lee las de sus atletas" on sessions for select
  using (is_coach_of(user_id) and source <> 'strava');

-- El coach no lee `profiles` directo (trae fecha de nacimiento, etc.): lee
-- esta vista, solo con campos de entrenamiento y solo de SUS
-- atletas activos. La vista corre con los permisos de su dueño (como una
-- función security definer) — por eso el filtro por coach_id = auth.uid()
-- va adentro y es lo único que decide qué filas salen. La meta viene del
-- plan activo (training_plans.goal), que el coach tampoco lee directo.
create or replace view coach_athlete_profiles with (security_barrier) as
  select
    ca.athlete_id as user_id,
    ca.tier,
    ca.started_at as linked_at,
    p.name,
    p.ftp,
    p.ftp_confirmed,
    p.hr_max,
    p.hr_max_confirmed,
    p.discipline,
    p.injuries,
    (select tp.goal from training_plans tp where tp.user_id = ca.athlete_id and tp.status = 'active' limit 1) as goal,
    p.weight_kg -- paso 7: W/kg en el reporte mensual (columna nueva siempre al final)
  from coach_athletes ca
  left join profiles p on p.user_id = ca.athlete_id
  where ca.coach_id = auth.uid() and ca.status = 'active';

revoke all on coach_athlete_profiles from public, anon;
grant select on coach_athlete_profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Vista del coach, paso 6a: el coach edita y publica la semana de un atleta
-- (ver docs/coach-view/README.md, "Flujo de la semana").
--
-- plan_weeks: un borrador por atleta y semana (lunes a domingo). El coach lo
-- arma a partir de lo que el atleta ya tiene agendado (workouts), lo edita
-- y lo publica con publish_plan_week(); hasta entonces el atleta no ve nada.
-- Al publicar, la semana se escribe en `workouts` del atleta (lo que ya lee
-- su pantalla Plan) y la versión publicada anterior queda 'superseded'.
--   items: [{ workout: <Workout de core/types.ts>, origin: 'athlete'|'coach',
--             edited: boolean }]
--   base_workout_ids: los workouts del atleta que había en esa semana al
--     crear el borrador. Al publicar solo se borran de esos los que el
--     coach quitó — lo que el atleta agregue mientras tanto no se toca.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists plan_weeks (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users (id) on delete cascade,
  coach_id uuid not null references auth.users (id) on delete cascade,
  iso_week text not null, -- ej. "2026-W42"
  week_start date not null check (extract(isodow from week_start) = 1), -- lunes
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  base_workout_ids text[] not null default '{}',
  ai_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

alter table plan_weeks enable row level security;

-- El coach ve las semanas de sus atletas activos; el atleta, solo las
-- publicadas (nunca un borrador).
drop policy if exists "plan_weeks: coach lee las de sus atletas" on plan_weeks;
create policy "plan_weeks: coach lee las de sus atletas" on plan_weeks for select
  using (auth.uid() = coach_id and is_coach_of(athlete_id));

drop policy if exists "plan_weeks: atleta lee las publicadas" on plan_weeks;
create policy "plan_weeks: atleta lee las publicadas" on plan_weeks for select
  using (auth.uid() = athlete_id and status = 'published');

-- El coach crea y edita SOLO borradores; publicar va por la función de abajo.
drop policy if exists "plan_weeks: coach crea borradores" on plan_weeks;
create policy "plan_weeks: coach crea borradores" on plan_weeks for insert
  with check (auth.uid() = coach_id and is_coach_of(athlete_id) and status = 'draft' and published_at is null);

drop policy if exists "plan_weeks: coach edita borradores" on plan_weeks;
create policy "plan_weeks: coach edita borradores" on plan_weeks for update
  using (auth.uid() = coach_id and is_coach_of(athlete_id) and status = 'draft')
  with check (auth.uid() = coach_id and is_coach_of(athlete_id) and status = 'draft' and published_at is null);

drop policy if exists "plan_weeks: coach descarta borradores" on plan_weeks;
create policy "plan_weeks: coach descarta borradores" on plan_weeks for delete
  using (auth.uid() = coach_id and status = 'draft');

create unique index if not exists plan_weeks_one_draft_per_week
  on plan_weeks (athlete_id, coach_id, week_start) where status = 'draft';
create index if not exists plan_weeks_coach_week_idx on plan_weeks (coach_id, iso_week);
create index if not exists plan_weeks_athlete_week_idx on plan_weeks (athlete_id, week_start);

-- El coach lee lo que sus atletas tienen agendado (para armar el borrador).
-- No lo escribe directo: solo a través de publish_plan_week().
drop policy if exists "workouts: coach lee los de sus atletas" on workouts;
create policy "workouts: coach lee los de sus atletas" on workouts for select
  using (is_coach_of(user_id));

-- Publicar: todo en una transacción. Escribe los entrenamientos del
-- borrador en `workouts` del atleta, borra solo los que el coach quitó (de
-- base_workout_ids) y archiva la versión publicada anterior de esa semana.
create or replace function publish_plan_week(p_week_id uuid) returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare
  w plan_weeks%rowtype;
  item jsonb;
  wid text;
  day_key text;
  keep text[] := '{}';
  ts timestamptz := now();
begin
  select * into w from plan_weeks where id = p_week_id for update;
  if not found or w.coach_id is distinct from auth.uid() then
    raise exception 'No encontramos ese borrador.';
  end if;
  if not is_coach_of(w.athlete_id) then
    raise exception 'Este atleta ya no está vinculado contigo.';
  end if;
  if w.status <> 'draft' then
    raise exception 'Esta semana ya se publicó. Recarga para ver la versión actual.';
  end if;

  for item in select value from jsonb_array_elements(w.items) loop
    wid := item -> 'workout' ->> 'id';
    day_key := item -> 'workout' ->> 'scheduledDate';
    if wid is null or wid !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Hay un entrenamiento sin identificador válido.';
    end if;
    if day_key is null or day_key !~ '^\d{4}-\d{2}-\d{2}$'
       or day_key::date < w.week_start or day_key::date > w.week_start + 6 then
      raise exception 'Hay un entrenamiento fuera de esta semana.';
    end if;
    if exists (select 1 from workouts where id = wid::uuid and user_id <> w.athlete_id) then
      raise exception 'Un entrenamiento del borrador no pertenece a este atleta.';
    end if;
    insert into workouts (id, user_id, data, updated_at)
      values (wid::uuid, w.athlete_id, item -> 'workout', ts)
      on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
    keep := keep || wid;
  end loop;

  delete from workouts
    where user_id = w.athlete_id
      and id::text = any (w.base_workout_ids)
      and not (id::text = any (keep));

  update plan_weeks set status = 'superseded', updated_at = ts
    where athlete_id = w.athlete_id and week_start = w.week_start and status = 'published';
  update plan_weeks set status = 'published', published_at = ts, updated_at = ts
    where id = w.id;
  return ts;
end;
$$;

revoke execute on function publish_plan_week(uuid) from public, anon;
grant execute on function publish_plan_week(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Vista del coach, paso 5: biblioteca del coach y rutinas de fuerza/movilidad.
--
-- session_templates: plantillas del coach (bici, fuerza, movilidad,
-- flexibilidad). Solo el coach las ve y edita. Al agendarlas el contenido
-- se COPIA (a workouts o planned_routines, con id nuevo): editar o borrar
-- una plantilla nunca cambia lo ya publicado, y el atleta no necesita leer
-- esta tabla (más simple que el "lee las de sus semanas publicadas" del
-- README, con el mismo resultado).
--   payload bici: { description?, intervals: [...] }  (como core/types.ts Interval)
--   payload rutina: { description?, durationMin?, targetRpe?, note?,
--                     exercises: [{ name, dose, videoUrl? }] }
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists session_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bike', 'strength', 'mobility', 'flexibility')),
  name text not null check (char_length(name) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table session_templates enable row level security;

drop policy if exists "session_templates: coach lee las suyas" on session_templates;
create policy "session_templates: coach lee las suyas" on session_templates for select
  using (auth.uid() = coach_id);

drop policy if exists "session_templates: coach crea si es coach" on session_templates;
create policy "session_templates: coach crea si es coach" on session_templates for insert
  with check (auth.uid() = coach_id and exists (select 1 from profiles where user_id = auth.uid() and is_coach));

drop policy if exists "session_templates: coach edita las suyas" on session_templates;
create policy "session_templates: coach edita las suyas" on session_templates for update
  using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

drop policy if exists "session_templates: coach borra las suyas" on session_templates;
create policy "session_templates: coach borra las suyas" on session_templates for delete
  using (auth.uid() = coach_id);

create index if not exists session_templates_coach_idx on session_templates (coach_id, kind);

-- planned_routines: una rutina de fuerza/movilidad agendada a un atleta (la
-- copia de la plantilla). Se crean SOLO al publicar una semana
-- (publish_plan_week); el atleta las ve en Plan y las registra en
-- Registrar, que liga la sesión con sessions.planned_item_id.
create table if not exists planned_routines (
  id uuid primary key,
  athlete_id uuid not null references auth.users (id) on delete cascade,
  coach_id uuid references auth.users (id) on delete set null,
  scheduled_date date not null,
  kind text not null check (kind in ('strength', 'mobility', 'flexibility')),
  name text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  plan_week_id uuid references plan_weeks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table planned_routines enable row level security;

drop policy if exists "planned_routines: atleta lee las suyas" on planned_routines;
create policy "planned_routines: atleta lee las suyas" on planned_routines for select
  using (auth.uid() = athlete_id);

drop policy if exists "planned_routines: coach lee las de sus atletas" on planned_routines;
create policy "planned_routines: coach lee las de sus atletas" on planned_routines for select
  using (is_coach_of(athlete_id));

create index if not exists planned_routines_athlete_date_idx on planned_routines (athlete_id, scheduled_date);

-- Con qué elemento planeado (workout o rutina) se empata una sesión — por
-- ahora lo llena Registrar al registrar una rutina agendada.
alter table sessions add column if not exists planned_item_id uuid;

-- Publicar, ahora también con rutinas: cada item trae `workout` (bici, va a
-- workouts) o `routine` (va a planned_routines). Mismas reglas que antes:
-- todo en una transacción, solo se borra lo que el coach quitó de
-- base_workout_ids (que guarda ids de ambas tablas), nada fuera de la
-- semana, ningún id de otro usuario.
create or replace function publish_plan_week(p_week_id uuid) returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare
  w plan_weeks%rowtype;
  item jsonb;
  obj jsonb;
  wid text;
  day_key text;
  keep text[] := '{}';
  ts timestamptz := now();
begin
  select * into w from plan_weeks where id = p_week_id for update;
  if not found or w.coach_id is distinct from auth.uid() then
    raise exception 'No encontramos ese borrador.';
  end if;
  if not is_coach_of(w.athlete_id) then
    raise exception 'Este atleta ya no está vinculado contigo.';
  end if;
  if w.status <> 'draft' then
    raise exception 'Esta semana ya se publicó. Recarga para ver la versión actual.';
  end if;

  for item in select value from jsonb_array_elements(w.items) loop
    obj := coalesce(item -> 'workout', item -> 'routine');
    wid := obj ->> 'id';
    day_key := obj ->> 'scheduledDate';
    if obj is null or wid is null or wid !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Hay un elemento sin identificador válido.';
    end if;
    if day_key is null or day_key !~ '^\d{4}-\d{2}-\d{2}$'
       or day_key::date < w.week_start or day_key::date > w.week_start + 6 then
      raise exception 'Hay un elemento fuera de esta semana.';
    end if;
    if exists (select 1 from workouts where id = wid::uuid and user_id <> w.athlete_id)
       or exists (select 1 from planned_routines where id = wid::uuid and athlete_id <> w.athlete_id) then
      raise exception 'Un elemento del borrador no pertenece a este atleta.';
    end if;

    if item ? 'workout' then
      insert into workouts (id, user_id, data, updated_at)
        values (wid::uuid, w.athlete_id, obj, ts)
        on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
    else
      if (obj ->> 'kind') is null or (obj ->> 'kind') not in ('strength', 'mobility', 'flexibility') then
        raise exception 'Hay una rutina con un tipo no válido.';
      end if;
      insert into planned_routines (id, athlete_id, coach_id, scheduled_date, kind, name, payload, plan_week_id, updated_at)
        values (wid::uuid, w.athlete_id, w.coach_id, day_key::date, obj ->> 'kind', coalesce(nullif(obj ->> 'name', ''), 'Rutina'),
                coalesce(obj -> 'payload', '{}'::jsonb), w.id, ts)
        on conflict (id) do update set scheduled_date = excluded.scheduled_date, kind = excluded.kind, name = excluded.name,
          payload = excluded.payload, plan_week_id = excluded.plan_week_id, coach_id = excluded.coach_id, updated_at = excluded.updated_at;
    end if;
    keep := keep || wid;
  end loop;

  delete from workouts
    where user_id = w.athlete_id and id::text = any (w.base_workout_ids) and not (id::text = any (keep));
  delete from planned_routines
    where athlete_id = w.athlete_id and id::text = any (w.base_workout_ids) and not (id::text = any (keep));

  update plan_weeks set status = 'superseded', updated_at = ts
    where athlete_id = w.athlete_id and week_start = w.week_start and status = 'published';
  update plan_weeks set status = 'published', published_at = ts, updated_at = ts
    where id = w.id;
  return ts;
end;
$$;

revoke execute on function publish_plan_week(uuid) from public, anon;
grant execute on function publish_plan_week(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Vista del coach, paso 7: revisión mensual (docs/coach-view/mockups/
-- Revision.html). Los NÚMEROS del reporte no se guardan: coach y atleta los
-- calculan con las mismas sesiones (sin Strava). Aquí solo vive lo que
-- escribe el coach: veredicto, mensaje, hallazgos y objetivos.
--   findings: [{ tone: 'good'|'warn'|'bad', title, body }]
--   goals:    [{ title, detail }]
-- El atleta solo ve las publicadas, y las sigue viendo aunque después se
-- desvincule del coach (son suyas). Para corregir una publicada, el coach la
-- regresa a borrador (el atleta deja de verla) y la vuelve a publicar.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users (id) on delete cascade,
  coach_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1), -- primer día del mes
  status text not null default 'draft' check (status in ('draft', 'published')),
  verdict text check (verdict in ('on_track', 'attention', 'off_track')),
  coach_message text not null default '' check (char_length(coach_message) <= 4000),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array' and jsonb_array_length(findings) <= 6),
  goals jsonb not null default '[]'::jsonb check (jsonb_typeof(goals) = 'array' and jsonb_array_length(goals) <= 5),
  coach_name text check (char_length(coach_name) <= 120), -- firma, para cuando ya no estén vinculados
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (athlete_id, coach_id, month)
);

alter table monthly_reviews enable row level security;

drop policy if exists "monthly_reviews: coach lee las de sus atletas" on monthly_reviews;
create policy "monthly_reviews: coach lee las de sus atletas" on monthly_reviews for select
  using (auth.uid() = coach_id and is_coach_of(athlete_id));

drop policy if exists "monthly_reviews: atleta lee las publicadas" on monthly_reviews;
create policy "monthly_reviews: atleta lee las publicadas" on monthly_reviews for select
  using (auth.uid() = athlete_id and status = 'published');

drop policy if exists "monthly_reviews: coach crea" on monthly_reviews;
create policy "monthly_reviews: coach crea" on monthly_reviews for insert
  with check (auth.uid() = coach_id and is_coach_of(athlete_id));

drop policy if exists "monthly_reviews: coach edita" on monthly_reviews;
create policy "monthly_reviews: coach edita" on monthly_reviews for update
  using (auth.uid() = coach_id and is_coach_of(athlete_id))
  with check (auth.uid() = coach_id and is_coach_of(athlete_id));

drop policy if exists "monthly_reviews: coach borra borradores" on monthly_reviews;
create policy "monthly_reviews: coach borra borradores" on monthly_reviews for delete
  using (auth.uid() = coach_id and status = 'draft');

create index if not exists monthly_reviews_athlete_idx on monthly_reviews (athlete_id, month);

-- Las fechas las pone la base (no el navegador) y el atleta, el coach y el
-- mes de una revisión no cambian nunca.
create or replace function monthly_reviews_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.athlete_id <> old.athlete_id or new.coach_id <> old.coach_id or new.month <> old.month then
      raise exception 'No se puede cambiar el atleta, el coach ni el mes de una revisión.';
    end if;
  end if;
  new.updated_at := now();
  if new.status = 'published' then
    new.published_at := case when tg_op = 'UPDATE' and old.status = 'published' then old.published_at else now() end;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists monthly_reviews_stamp on monthly_reviews;
create trigger monthly_reviews_stamp before insert or update on monthly_reviews
  for each row execute function monthly_reviews_stamp();

-- Paso 7c: envío por correo (Edge Function send-review-email, con Resend).
-- La función pone emailed_at con service role; el coach solo lo lee.
alter table monthly_reviews add column if not exists emailed_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────
-- Vista del coach: detalle de las sesiones de sus atletas y descarga de su
-- .fit (screens/coach-session.ts). El coach lee un archivo de fit-files solo
-- si es el .fit de una sesión de un atleta suyo con vínculo activo y que NO
-- llegó por Strava (sus términos prohíben mostrar sus datos a otros). La
-- regla de las sesiones ("sessions: coach lee las de sus atletas") ya aplica
-- dentro del exists, así que es la misma barrera dos veces.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "fit-files: coach lee los de sus atletas" on storage.objects;
create policy "fit-files: coach lee los de sus atletas" on storage.objects for select
  using (
    bucket_id = 'fit-files'
    and exists (
      select 1 from public.sessions s
      where s.fit_path = storage.objects.name
        and s.source <> 'strava'
        and public.is_coach_of(s.user_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- athlete_notes: el expediente del atleta — lo que lo hace único (cómo
-- responde, qué sesiones se le caen, cuántas semanas de carga aguanta, qué
-- le molesta). Lo reciben los seis modos del coach de IA (coach-chat lo lee
-- con service role y lo mete al context) y manda sobre las reglas generales
-- del prompt. Lo edita su coach activo; sin coach, la IA lo actualiza cada 4
-- evaluaciones semanales (updated_by 'ai'). El atleta lo ve y puede borrarlo.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists athlete_notes (
  athlete_id uuid primary key references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 1200),
  updated_by text not null check (updated_by in ('coach', 'ai')),
  updated_by_user uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table athlete_notes enable row level security;

drop policy if exists "athlete_notes: atleta y su coach leen" on athlete_notes;
create policy "athlete_notes: atleta y su coach leen" on athlete_notes for select
  using (auth.uid() = athlete_id or is_coach_of(athlete_id));

drop policy if exists "athlete_notes: coach crea" on athlete_notes;
create policy "athlete_notes: coach crea" on athlete_notes for insert
  with check (is_coach_of(athlete_id) and updated_by = 'coach' and updated_by_user = auth.uid());

drop policy if exists "athlete_notes: coach edita" on athlete_notes;
create policy "athlete_notes: coach edita" on athlete_notes for update
  using (is_coach_of(athlete_id))
  with check (is_coach_of(athlete_id) and updated_by = 'coach' and updated_by_user = auth.uid());

drop policy if exists "athlete_notes: atleta borra el suyo" on athlete_notes;
create policy "athlete_notes: atleta borra el suyo" on athlete_notes for delete
  using (auth.uid() = athlete_id);
