-- ─────────────────────────────────────────────────────────────────────────
-- Check-in del domingo por correo (Edge Function weekly-checkin): «cierra tu
-- semana con el coach» a quien tiene plan del coach de IA y no ha evaluado
-- la semana que termina. Uno por plan y semana: la función aparta la fila
-- antes de mandar, así una segunda corrida no repite. Solo la usa la
-- función (service role): RLS encendido y sin políticas.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists weekly_checkin_emails (
  plan_id uuid not null references training_plans(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  week int not null, -- semana del plan que termina (1 = la primera)
  sent_to text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (plan_id, week)
);
alter table weekly_checkin_emails enable row level security;

-- Domingos a las 6 pm en la Ciudad de México = lunes 00:00 UTC (México ya
-- no tiene horario de verano). Usa el mismo secreto CRON_SECRET que el
-- reporte mensual (en el Vault como 'monthly_self_report_secret').
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'weekly-checkin',
  '0 0 * * 1',
  $cron$
  select net.http_post(
    url := 'https://pmshhyyqoghoyjnsedza.supabase.co/functions/v1/weekly-checkin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'monthly_self_report_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
