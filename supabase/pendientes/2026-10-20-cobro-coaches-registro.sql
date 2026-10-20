-- Lo que este PR agrega a supabase/schema.sql, para correr UNA vez en el SQL
-- Editor de Supabase sobre una base que ya tiene lo de `main`. Es idempotente
-- (se puede volver a correr sin romper nada). Todo o nada: va en una
-- transacción. Fuente: supabase/schema.sql (esto es una copia de sus partes
-- nuevas; si algo difiere, manda schema.sql).
--   1. Coaches por invitación: coach_applications, coach_seat_limit, my_coach_seats
--   2. accept_coach_invite: revisa que siga siendo coach y su máximo de atletas
--   3. Lista de espera, suscripciones, avisos de Mercado Pago, aceptación de términos
begin;

-- ═══ 1. Coaches por invitación ═══════════════════════════════════════════
-- Coaches: solo por invitación de Torq y solicitud aprobada (ver
-- supabase/functions/coach-apply y docs/cobro-y-registro.md, «Coaches»).
-- Torq invita por correo → la persona llena la solicitud → un administrador
-- la aprueba (enciende profiles.is_coach) o la rechaza. Nadie escribe aquí
-- desde la app: todo pasa por la función con la service role. Quien la llenó
-- puede leer la suya.
create table if not exists coach_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_id uuid references auth.users (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'submitted', 'approved', 'rejected', 'revoked')),
  answers jsonb,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  max_athletes int not null default 20 check (max_athletes between 1 and 200)
);

alter table coach_applications enable row level security;

drop policy if exists "coach_applications: leer la propia" on coach_applications;
create policy "coach_applications: leer la propia" on coach_applications for select
  using (auth.uid() = user_id);

create index if not exists coach_applications_status_idx on coach_applications (status, invited_at desc);

-- Máximo de atletas activos de un coach: el de su solicitud aprobada, o 20
-- para los coaches que se dieron de alta a mano antes de las solicitudes.
create or replace function coach_seat_limit(p_coach uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select max_athletes from coach_applications
      where user_id = p_coach and status = 'approved'
      order by reviewed_at desc nulls last limit 1),
    20);
$$;

-- Para el coach: cuántos atletas tiene y cuántos puede tener.
create or replace function my_coach_seats() returns table (used int, seat_limit int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from coach_athletes where coach_id = auth.uid() and status = 'active'),
         coach_seat_limit(auth.uid());
$$;

revoke execute on function coach_seat_limit(uuid) from public, anon, authenticated;
revoke execute on function my_coach_seats() from public, anon;
grant execute on function my_coach_seats() to authenticated;

-- ═══ 2. accept_coach_invite (versión nueva) ══════════════════════════════
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
  -- Que siga siendo coach (Torq puede quitarle el permiso) y que no pase
  -- de su máximo de atletas (coach_seat_limit, lo pone Torq al aprobarlo):
  -- así nadie reparte links para que otros usen la IA sin pagar.
  if not exists (select 1 from profiles where user_id = inv.coach_id and is_coach) then
    raise exception 'Este link ya no es válido: la cuenta ya no es coach en Torq.';
  end if;
  if (select count(*) from coach_athletes where coach_id = inv.coach_id and status = 'active') >= coach_seat_limit(inv.coach_id) then
    raise exception 'Tu coach llegó a su máximo de atletas en Torq. Pídele que escriba a Torq.';
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

-- ═══ 3. Lista de espera, cobro y términos ═════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- Lista de espera. Torq es por invitación: quien llega sin cuenta deja su
-- correo desde el login (src/sync/waitlist.ts) y el admin invita por orden.
-- Cualquiera (anon) puede apuntarse, nadie puede leer la lista desde la app
-- (no hay policy de select: se ve solo en el dashboard / service role).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  name text check (name is null or length(name) <= 80),
  discipline text check (discipline is null or discipline in ('mountain', 'road', 'gravel', 'other')),
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_email_unique on waitlist (lower(email));
alter table waitlist enable row level security;

drop policy if exists "waitlist: cualquiera se apunta" on waitlist;
create policy "waitlist: cualquiera se apunta" on waitlist for insert
  to anon, authenticated with check (true);
-- Explícito por si el proyecto no da permisos por defecto a tablas nuevas
-- (solo insertar; leer sigue cerrado: no hay policy de select).
grant insert on waitlist to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Suscripción Torq Coach IA (Mercado Pago). Solo para atletas sin coach: los
-- coaches y sus atletas no pagan (ver src/core/access.ts). Una fila por
-- usuario; la escriben solo las Edge Functions billing-* con service role
-- (el atleta la puede leer, nunca escribir).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  -- precio fijado al suscribirse: 399, o 299 si fue antes de la fecha de fundador
  price_mxn integer not null check (price_mxn > 0),
  mp_preapproval_id text unique,
  -- hasta cuándo está pagado y, si el último cobro falló, hasta cuándo hay gracia
  paid_until timestamptz,
  grace_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
drop policy if exists "subscriptions: leer la propia" on subscriptions;
create policy "subscriptions: leer la propia" on subscriptions for select using (auth.uid() = user_id);

-- Cada aviso de Mercado Pago que ya se procesó (los reenvía si no contestamos
-- a tiempo): evita aplicar dos veces el mismo cobro.
create table if not exists billing_events (
  id text primary key,
  kind text not null,
  user_id uuid references auth.users (id) on delete set null,
  received_at timestamptz not null default now()
);
alter table billing_events enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- Aceptación de términos y del uso de datos de salud (docs/legal/). Es la
-- evidencia: quién, qué versión (con la huella SHA-256 del texto), cuándo y
-- desde qué navegador. Solo se inserta: nadie la edita ni la borra desde la
-- app. Un coach puede tener sus propios términos (doc = 'coach:<coach_id>').
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  doc text not null check (doc = 'torq' or doc like 'coach:%'),
  version text not null,
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  consents jsonb not null default '{}'::jsonb,
  user_agent text,
  accepted_at timestamptz not null default now()
);
create index if not exists legal_acceptances_user_idx on legal_acceptances (user_id, doc, version);
alter table legal_acceptances enable row level security;
drop policy if exists "legal_acceptances: aceptar" on legal_acceptances;
create policy "legal_acceptances: aceptar" on legal_acceptances for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "legal_acceptances: leer las propias" on legal_acceptances;
create policy "legal_acceptances: leer las propias" on legal_acceptances for select using (auth.uid() = user_id);

-- Lista de espera: cuándo se invitó a cada quien (lo marca admin-waitlist).
alter table waitlist add column if not exists invited_at timestamptz;

commit;
