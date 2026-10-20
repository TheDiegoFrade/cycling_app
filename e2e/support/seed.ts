import fs from 'node:fs';
import path from 'node:path';
import { findTemplate } from '../../src/core/workout-templates';
import type { MockSupabase, MockUser } from './mock-supabase';

/** Fecha local de la persona (el navegador corre en America/Mexico_City). */
export function todayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d);
}

/** Perfil completo (como si ya hubiera contestado el cuestionario), capturado
 * del propio cuestionario: e2e/fixtures/perfil-*.json. */
export function seedProfile(backend: MockSupabase, u: MockUser, who: 'ana' | 'beto'): void {
  const row = JSON.parse(fs.readFileSync(path.resolve(`e2e/fixtures/perfil-${who}.json`), 'utf8'));
  backend.table('profiles').push({ user_id: u.id, ...row });
}

/** Un workout agendado (hoy por defecto), como lo deja Plan o el coach. */
export function seedWorkout(backend: MockSupabase, u: MockUser, opts: { template?: string; minutes?: number; date?: string; name?: string } = {}): string {
  const t = findTemplate(opts.template ?? 'sweet_spot')!;
  const minutes = opts.minutes ?? 60;
  const id = `w-${backend.table('workouts').length + 1}`;
  backend.table('workouts').push({
    id,
    user_id: u.id,
    data: {
      format_version: 1,
      id,
      name: opts.name ?? `${t.name} · ${minutes} min`,
      intervals: t.build(minutes),
      created_at: new Date().toISOString(),
      scheduledDate: opts.date ?? todayKey(),
    },
  });
  return id;
}

/** Plan activo del coach IA (lo que deja create_plan en training_plans). */
export function seedActivePlan(backend: MockSupabase, u: MockUser, goal = 'Terminar mi primer gran fondo de 100 km'): void {
  backend.table('training_plans').push({
    id: 'plan-1',
    user_id: u.id,
    status: 'active',
    goal,
    data: { startDate: todayKey(-7), blocks: [{ name: 'Base', weeks: 3 }], weeks: [] },
    current_block_exhausted: false,
    last_eval_iso_week: null,
    eval_count_this_iso_week: 0,
  });
}
