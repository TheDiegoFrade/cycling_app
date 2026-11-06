-- Plan sin bici (viaje): el coach de IA puede agendar «Caminar o trotar
-- suave» como rutina planeada de tipo 'running' (mismo valor que
-- sessions.kind, así se registra como cualquier otra). «Fuerza en casa» va
-- como 'strength' (no necesita cambio). Idempotente; correr una vez en el
-- SQL Editor. Fuente: supabase/schema.sql.
begin;

alter table planned_routines drop constraint if exists planned_routines_kind_check;
alter table planned_routines add constraint planned_routines_kind_check
  check (kind in ('strength', 'mobility', 'flexibility', 'outdoor', 'skills', 'running'));

commit;
