// Da de baja el plan activo del usuario — nunca el plan en sí (solo cambia
// status a 'abandoned'/'completed'), pero SÍ borra los workouts que ese
// plan generó y que nunca se entrenaron. Esta es la única excepción
// intencional a "nunca borres nada": un workout agendado que nadie corrió
// no es historial, es agenda muerta de un plan que ya no existe. Lo que SÍ
// se entrenó (tiene una fila en `sessions` que lo referencia) NUNCA se
// toca, sin importar qué plan venga después. No llama a Claude: sin costo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
// La MISMA lista que coach-chat: antes tenía una copia propia sin dpcfrade,
// que podía crear un plan pero no darlo de baja (403).
import { ALLOWED_USER_IDS } from '../_shared/coach-access.ts';
import { localDateKey } from '../_shared/core.gen.js';

function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    if (!ALLOWED_USER_IDS.has(userId)) {
      return json({ error: 'el coach todavía no está disponible para tu cuenta' }, 403);
    }
    const admin = adminClient();

    const body = await req.json().catch(() => ({}));
    const status = body?.status === 'completed' ? 'completed' : 'abandoned';

    const { data: plan, error } = await admin
      .from('training_plans')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')
      .select('id, data')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!plan) return json({ error: 'no tienes un plan activo' }, 404);

    const planData = plan.data as { weeks: { workoutIds: string[] }[] };
    const allWorkoutIds = planData.weeks.flatMap((w) => w.workoutIds);

    let deletedIds: string[] = [];
    if (allWorkoutIds.length > 0) {
      // user_id SIEMPRE en el filtro, igual que en coach-chat — ver su
      // regla dura del encabezado, aplica exactamente igual aquí.
      const { data: completedSessions } = await admin
        .from('sessions')
        .select('workout_id')
        .eq('user_id', userId)
        .in('workout_id', allWorkoutIds);
      const completedIds = new Set((completedSessions ?? []).map((s) => s.workout_id));
      const toDelete = allWorkoutIds.filter((id) => !completedIds.has(id));

      if (toDelete.length > 0) {
        const { error: delError, data: delData } = await admin
          .from('workouts')
          .delete()
          .eq('user_id', userId)
          .in('id', toDelete)
          .select('id');
        if (delError) throw new Error(`no se pudieron limpiar los workouts sin entrenar: ${delError.message}`);
        deletedIds = (delData ?? []).map((w) => w.id as string);
      }
    }

    // Lo que el coach de IA puso en el calendario fuera del rodillo (salidas,
    // técnica, gimnasio) y no se registró: misma agenda muerta. Lo de un coach
    // humano (source 'coach') nunca se toca. Si la columna no existe todavía
    // (schema sin migrar) solo se registra: dar de baja el plan sigue.
    const today = localDateKey(new Date(), 'America/Mexico_City');
    const { data: extras, error: exError } = await admin
      .from('planned_routines')
      .select('id')
      .eq('athlete_id', userId)
      .eq('source', 'ai')
      .gte('scheduled_date', today);
    if (exError) console.log(`[coach-retire-plan] no se pudieron leer los extras: ${exError.message}`);
    const extraIds = (extras ?? []).map((r) => r.id as string);
    if (extraIds.length > 0) {
      const { data: logged } = await admin.from('sessions').select('planned_item_id').eq('user_id', userId).in('planned_item_id', extraIds);
      const keep = new Set((logged ?? []).map((r) => r.planned_item_id));
      const toDelete = extraIds.filter((id) => !keep.has(id));
      if (toDelete.length > 0) await admin.from('planned_routines').delete().eq('athlete_id', userId).in('id', toDelete);
    }

    // El cliente trae su propio appState.workouts/IndexedDB en memoria —
    // sin la lista exacta de ids borrados, se queda mostrando agenda muerta
    // hasta un reload completo (encontrado probando este mismo flujo).
    return json({ planId: plan.id, status, deletedWorkoutIds: deletedIds });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
