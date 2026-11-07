-- Aviso al equipo cuando alguien se apunta a la lista de espera
-- (función waitlist-notify). Idempotente y en una transacción.
-- Requiere el secreto del Vault 'monthly_self_report_secret' (= CRON_SECRET),
-- el mismo que usan el reporte mensual y el check-in del domingo.
begin;

alter table waitlist add column if not exists notified_at timestamptz;

create extension if not exists pg_net;

create or replace function public.waitlist_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  -- pg_net es asíncrono: el alta no espera al correo ni falla si el correo falla.
  perform net.http_post(
    url := 'https://pmshhyyqoghoyjnsedza.supabase.co/functions/v1/waitlist-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'monthly_self_report_secret')
    ),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- Nunca impedir que alguien se apunte por un problema del aviso.
  raise warning '[waitlist_notify] %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.waitlist_notify() from public, anon, authenticated;

drop trigger if exists waitlist_notify on waitlist;
create trigger waitlist_notify after insert on waitlist
  for each row execute function public.waitlist_notify();

commit;
