// El atleta quita una sesión de su plan, con un motivo. La sesión se borra de
// `workouts` y queda registrada en training_plans.data.removedWorkouts (el
// cliente solo puede LEER training_plans): weekly_eval la recibe como
// "quitada, con su motivo" en vez de contarla como falta. Con coach humano,
// también sale de su borrador abierto (si no, al publicar la volvería a crear)
// y el coach la ve en la ficha del atleta.
//
// body: { action: 'remove', workoutId, reason, note?, plannedTss? }  → atleta (su JWT)
//       { action: 'list', athleteId }                                → su coach (vínculo activo)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = ['time', 'fatigue', 'pain', 'other'] as const;
type Reason = (typeof REASONS)[number];
const NOTE_MAX = 200;
const KEEP_LAST = 60; // cuántas quitadas se guardan en el plan

export interface RemovedWorkout {
  id: string;
  name: string;
  date: string | null; // scheduledDate
  weekIndex: number;
  plannedTss: number | null;
  reason: Reason;
  note: string | null;
  at: string;
}

type Admin = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const body = (await req.json()) as Record<string, unknown>;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as Admin;

    if (body.action === 'list') {
      const athleteId = typeof body.athleteId === 'string' && UUID.test(body.athleteId) ? body.athleteId : null;
      if (!athleteId) return json({ error: 'falta athleteId' }, 400);
      const { data: link } = await admin.from('coach_athletes').select('id').eq('coach_id', userId).eq('athlete_id', athleteId).eq('status', 'active').maybeSingle();
      if (!link) return json({ error: 'ese atleta no está vinculado contigo' }, 403);
      const { data: plan } = await admin.from('training_plans').select('data').eq('user_id', athleteId).eq('status', 'active').maybeSingle();
      const removed = ((plan as { data?: { removedWorkouts?: RemovedWorkout[] } } | null)?.data?.removedWorkouts ?? []).slice(-20).reverse();
      return json({ removed });
    }

    if (body.action !== 'remove') return json({ error: 'acción desconocida' }, 400);
    const workoutId = typeof body.workoutId === 'string' && UUID.test(body.workoutId) ? body.workoutId : null;
    if (!workoutId) return json({ error: 'falta workoutId' }, 400);
    const reason = REASONS.includes(body.reason as Reason) ? (body.reason as Reason) : null;
    if (!reason) return json({ error: 'elige un motivo' }, 400);
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, NOTE_MAX) : null;
    const plannedTss = typeof body.plannedTss === 'number' && Number.isFinite(body.plannedTss) ? Math.max(0, Math.min(500, Math.round(body.plannedTss))) : null;

    // Solo su propia sesión, y nunca una que ya entrenó.
    const [{ data: row }, { data: done }] = await Promise.all([
      admin.from('workouts').select('id, data').eq('id', workoutId).eq('user_id', userId).maybeSingle(),
      admin.from('sessions').select('id').eq('user_id', userId).eq('workout_id', workoutId).limit(1).maybeSingle(),
    ]);
    if (!row) return json({ error: 'esa sesión no está en tu plan' }, 404);
    if (done) return json({ error: 'esa sesión ya la entrenaste: no se puede quitar' }, 409);
    const w = (row as { data: { name?: string; scheduledDate?: string } }).data ?? {};

    // Registro en el plan activo, si la sesión era del plan.
    const { data: plan } = await admin.from('training_plans').select('id, data').eq('user_id', userId).eq('status', 'active').maybeSingle();
    const planRow = plan as { id: string; data: { weeks?: { weekIndex: number; workoutIds: string[] }[]; removedWorkouts?: RemovedWorkout[] } } | null;
    const week = planRow?.data.weeks?.find((x) => x.workoutIds.includes(workoutId));
    if (planRow && week) {
      const entry: RemovedWorkout = {
        id: workoutId,
        name: String(w.name ?? 'Sesión').slice(0, 120),
        date: w.scheduledDate ?? null,
        weekIndex: week.weekIndex,
        plannedTss,
        reason,
        note,
        at: new Date().toISOString(),
      };
      const data = {
        ...planRow.data,
        weeks: planRow.data.weeks!.map((x) => (x === week ? { ...x, workoutIds: x.workoutIds.filter((id) => id !== workoutId) } : x)),
        removedWorkouts: [...(planRow.data.removedWorkouts ?? []), entry].slice(-KEEP_LAST),
      };
      const { error } = await admin.from('training_plans').update({ data } as never).eq('id', planRow.id);
      if (error) return json({ error: `no se pudo actualizar el plan: ${error.message}` }, 500);
    }

    const { error: delErr } = await admin.from('workouts').delete().eq('id', workoutId).eq('user_id', userId);
    if (delErr) return json({ error: `no se pudo borrar: ${delErr.message}` }, 500);

    // Con coach: que no reviva al publicar su borrador abierto.
    const { data: drafts } = await admin.from('plan_weeks').select('id, items, base_workout_ids').eq('athlete_id', userId).eq('status', 'draft');
    for (const d of (drafts ?? []) as { id: string; items: { workout?: { id?: string } }[] | null; base_workout_ids: string[] | null }[]) {
      const items = (d.items ?? []).filter((i) => i.workout?.id !== workoutId);
      const base = (d.base_workout_ids ?? []).filter((id) => id !== workoutId);
      if (items.length !== (d.items ?? []).length || base.length !== (d.base_workout_ids ?? []).length) {
        await admin.from('plan_weeks').update({ items, base_workout_ids: base, updated_at: new Date().toISOString() } as never).eq('id', d.id);
      }
    }

    return json({ removed: true, fromPlan: Boolean(week) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
