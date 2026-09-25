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
