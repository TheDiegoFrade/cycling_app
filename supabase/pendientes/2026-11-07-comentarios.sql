-- ─────────────────────────────────────────────────────────────────────────
-- «Mandar comentario» (Edge Function feedback): lo que la gente escribe sobre
-- la app. Llega por correo a soporte (secreto SUPPORT_EMAIL) y queda aquí.
-- Solo la función escribe y lee (service role): RLS encendido y sin
-- políticas. Si se borra la cuenta, el comentario se queda sin nada que
-- identifique a la persona (user_id a null; el correo no se guarda: solo va
-- en el correo a soporte).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('problem', 'idea', 'like', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  screen text,
  device text,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
create index if not exists feedback_user_recent on feedback (user_id, created_at desc);
alter table feedback enable row level security;
