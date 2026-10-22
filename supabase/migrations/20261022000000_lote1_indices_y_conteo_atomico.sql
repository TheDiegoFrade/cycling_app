-- Lote 1 (auditoría de escalabilidad): índices + conteo atómico de tokens.
-- Idempotente: se puede correr más de una vez. Pegar completo en el SQL
-- Editor de Supabase ANTES de desplegar coach-chat.

-- La política de Storage del coach busca sessions.fit_path = objects.name.
create index if not exists sessions_fit_path_idx on sessions (fit_path);

-- Consultas por usuario y mes sobre coach_calls (costos, reportes).
create index if not exists coach_calls_user_created_idx on coach_calls (user_id, created_at desc);

-- Suma (o resta, con valores negativos) tokens/requests de forma atómica:
-- un solo INSERT … ON CONFLICT DO UPDATE, sin leer-y-escribir desde la
-- función. Nunca baja de 0. Regresa el total del mes tras el cambio.
create or replace function coach_usage_add(p_user uuid, p_period date, p_tokens integer, p_requests integer default 0)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into coach_usage as u (user_id, period, tokens_used, requests_used, updated_at)
  values (p_user, p_period, greatest(p_tokens, 0), greatest(p_requests, 0), now())
  on conflict (user_id, period) do update
    set tokens_used = greatest(u.tokens_used + p_tokens, 0),
        requests_used = greatest(u.requests_used + p_requests, 0),
        updated_at = now()
  returning tokens_used;
$$;

revoke all on function coach_usage_add(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function coach_usage_add(uuid, date, integer, integer) to service_role;
