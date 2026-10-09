// Coach de Torq — proxy delgado y sin estado sobre la API de Claude.
//
// REGLA DURA, no negociable: el user_id SIEMPRE sale de getUserId(req) (JWT
// verificado), NUNCA del body que manda el cliente. Este archivo usa el
// cliente admin (service role, ignora RLS) para leer/escribir, así que la
// única barrera contra mezclar datos entre usuarios es que CADA query de
// este archivo filtre por ese mismo `userId` derivado — nunca por un id que
// venga en el payload. Si en algún momento agregas una query nueva aquí,
// repite ese patrón.
//
// SEGUNDA REGLA DURA: los workouts que genera el coach se insertan como
// filas REALES en la tabla `workouts` de siempre (mismo shape que
// core/types.ts) — nunca se guarda el contenido embebido dentro de
// training_plans.data. training_plans.data solo guarda referencias (ids).
// `workouts` sigue siendo la única fuente de verdad, la misma que ya lee
// Entrenar/Calendario — así un workout hecho a mano nunca puede
// desincronizarse de lo que el plan "cree" que existe.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0/helpers/zod';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { ALLOWED_USER_IDS } from '../_shared/coach-access.ts';
import { evalWeekTarget, localDateKey, planTotalWeeks } from '../_shared/core.gen.js';
import { COACH_SYSTEM_PROMPT, WRITER_SYSTEM_PROMPT } from './prompt.ts';
import { buildUserMessage } from './message.ts';
import { PLANNING_MODES, WorkoutDescriptionsSchema, schemaForMode, inputContextSchemaForMode, type Mode } from './schemas.ts';
import { summarizeSegments, toGeneratedWorkout, totalMinutes, type PlannedWorkout } from './expand.ts';
import { resolveFromLibrary, type CoachWeekWorkout, type LibraryTemplate } from './library.ts';
import { acceptAiNotes, notesDueOnWeeklyEval, type StoredNotes } from './notes.ts';
import { callRow, logCalls, type CallRow, type CallStep, type UsageLike } from './usage-log.ts';
import { correctionMessage, guardOutput, usableStartDate } from './guard.ts';
import { plannerFor } from './routing.ts';
import { OTHER_MODEL, callCoach, readResponse } from './coach-call.ts';
import { deliverDraft, emailKey, planDraftOf, weekDraftOf } from './coach-email.ts';

type AdminClient = ReturnType<typeof createClient>;

function adminClient(): AdminClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

// Dos modelos para los modos que planifican (create_plan, weekly_eval,
// publish_block):
//  - El coach (routing.ts: Sonnet low para planes y bloques y para las
//    semanas donde hay que razonar el FTP; Haiku 5.5 low para las demás
//    evaluaciones semanales) razona y decide el plan, pero con una
//    salida corta: las series en forma compacta (`repeat`) y una intención
//    por workout. Antes Sonnet 5 escribía TODO (cada intervalo + una
//    descripción de 3-5 oraciones por workout, ~15k tokens) y se pasaba de
//    los 150 s de Supabase (IDLE_TIMEOUT en ~1 de cada 3-4 llamadas); por
//    eso se había bajado a Haiku 4.5, que razona peor.
//  - Los intervalos los desenrolla código (expand.ts): mecánico, sin pierde.
//  - WRITER_MODEL (Haiku) redacta las descripciones, una llamada por semana
//    en paralelo. Si falla o no alcanza el tiempo, queda la intención del
//    coach como descripción (fallbackDescription) — el plan nunca se pierde
//    por esto.
// coach_week y monthly_review van con Haiku 5.5 (routing.ts); solo el
// comentario post-sesión, que la app ya no llama, sigue con OTHER_MODEL.
const WRITER_MODEL = 'claude-haiku-5-5';

// Supabase Free corta la función a los ~150 s. El redactor solo arranca si
// al coach le sobró tiempo, y con un tope propio para no pasarse.
const WALL_CLOCK_BUDGET_MS = 140_000;
const WRITER_MIN_REMAINING_MS = 25_000;
const WRITER_MAX_MS = 40_000;
// La guardia solo pide una corrección si la primera respuesta llegó antes de
// esto: el reintento tarda lo mismo que la primera y aún tiene que caber.
const RETRY_MAX_ELAPSED_MS = 70_000;

// Red de seguridad, no el control principal (ver checkModeAllowed).
const MONTHLY_TOKEN_CEILING = 500_000;

// Reserva conservadora antes de llamar a Claude — más alta que lo que
// cuesta una llamada típica (~14-15k tokens vistos en pruebas reales), y
// ahora alineada con el techo real de max_tokens (48000) para que una
// llamada que sí llegue a generar una salida grande no se subestime
// mientras está en vuelo. Si la función muere a medio camino (timeout,
// crash real del proceso) esto ya quedó contado: mejor sobreestimar un
// gasto real que perderlo por completo. reconcileUsage corrige esto al
// número exacto en CUALQUIER camino donde Claude sí llegó a responder,
// no solo cuando todo lo de después también salió bien.
const PRE_CALL_RESERVE_TOKENS = 50_000;

// Crear y modificar un plan cuentan juntos contra el mismo tope — la
// situación de un atleta no debería cambiar tanto como para justificar más
// de esto en un mes (ver plan_actions en schema.sql).
const MONTHLY_PLAN_ACTION_LIMIT = 3;

// Tope SEPARADO del de arriba — weekly_eval ya está limitado estructuralmente
// a 2 veces por semana ISO (ver checkModeAllowed: la 2ª es un "refresh" de
// la misma semana siguiente), así que esto es una red de seguridad
// adicional, no el control principal. 10 = hasta 5 semanas ISO reales en un
// mes × 2 (el refresh completo cada semana) — con un número más bajo,
// usar ambos refresh temprano en el mes dejaría sin forma de avanzar las
// semanas siguientes, justo lo que este tope debe evitar, no causar.
// Separado de MONTHLY_PLAN_ACTION_LIMIT a propósito: evaluar la semana no
// debería comerse el presupuesto de crear/modificar el plan completo.
const MONTHLY_WEEKLY_EVAL_LIMIT = 10;

// Zona de los atletas (mismo criterio que monthly-self-report): decide qué
// día es "hoy" para la evaluación semanal y qué días ya pasaron.
const ATHLETE_TIME_ZONE = 'America/Mexico_City';
const athleteToday = () => localDateKey(new Date(), ATHLETE_TIME_ZONE);

const DAY_OFFSET: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };


interface CoachChatRequest {
  mode: Mode;
  // Export de datos ya armado del lado del cliente — nunca samples crudos.
  // create_plan requiere context.startDate ("YYYY-MM-DD"); para
  // finished_training_eval_comment, context.sessionId (id real de `sessions`,
  // usado para guardar el comentario y evitar que se pida dos veces para la
  // misma sesión).
  context: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();
  // Se arma al reservar cuota: si el intento falla, la devuelve (refundUsage).
  let refund: () => Promise<void> = async () => {};
  try {
    const userId = await getUserId(req);
    // Antes de CUALQUIER otra cosa — ni siquiera parsea el body todavía.
    // Rechazar aquí cuesta $0 (nunca se llega a tocar Claude).
    if (!ALLOWED_USER_IDS.has(userId)) {
      return json({ error: 'el coach todavía no está disponible para tu cuenta' }, 403);
    }
    const admin = adminClient();

    const body = (await req.json()) as CoachChatRequest;
    if (!body?.mode || !body?.context) return json({ error: 'falta mode o context' }, 400);

    // El context que manda el cliente se valida ANTES de llamar a Claude —
    // un payload mal armado truena aquí con un error claro, en vez de
    // dejarle al modelo adivinar datos faltantes o mal tipados.
    const contextCheck = inputContextSchemaForMode(body.mode).safeParse(body.context);
    if (!contextCheck.success) {
      // Los mensajes propios del schema vienen en español; los de zod no.
      const issue = contextCheck.error.issues[0];
      const own = issue && /[áéíóúñ]|elige|escribe|máximo|al menos/.test(issue.message) ? issue.message : null;
      return json({ error: own ?? 'revisa los datos de tu perfil y del formulario', details: contextCheck.error.issues }, 400);
    }

    const validContext = contextCheck.data; // ya validado y tipado — usar este, no body.context

    const allowed = await checkModeAllowed(admin, userId, body.mode, validContext);
    if (!allowed.ok) return json({ error: allowed.reason }, allowed.status ?? 429);

    // Expediente del atleta (athlete_notes): lo lee el servidor, nunca viene
    // del cliente. En los modos del coach es el de su atleta (el vínculo ya
    // se verificó arriba); en los demás, el del propio usuario.
    const notesAthleteId = body.mode === 'coach_week' || body.mode === 'monthly_review' ? (validContext as { athleteId: string }).athleteId : userId;
    const notes = await loadNotes(admin, notesAthleteId);
    // Sin coach humano, cada 4 evaluaciones semanales la IA propone el
    // expediente (notesUpdate); con coach lo propone monthly_review y él decide.
    const notesDue =
      body.mode === 'weekly_eval' &&
      notesDueOnWeeklyEval(await getActionCount(admin, userId, 'weekly_eval'), (await activeCoachOf(admin, userId)) !== null);
    // athleteNotes y notesDue solo los pone el servidor: si el cliente los
    // mandara, se descartan (los schemas de entrada ya no los aceptan, pero
    // se borran aquí también por si alguno los dejara pasar).
    const { athleteNotes: _clientNotes, athleteNotesBy: _clientBy, notesDue: _clientDue, ...cleanContext } = validContext as Record<string, unknown>;
    const context: Record<string, unknown> = {
      ...cleanContext,
      ...(notes?.body ? { athleteNotes: notes.body, athleteNotesBy: notes.updatedBy } : {}),
      ...(body.mode === 'weekly_eval' ? { notesDue } : {}),
    };
    // Si en lo que queda de esta semana ya no hay ningún día disponible y
    // libre (crear el plan un viernes con días mar/mié/jue), el plan arranca
    // el lunes siguiente: con la semana 0 vacía la guardia lo rechazaba (502)
    // y el atleta no podía crear plan hasta cambiar de semana.
    // "Hoy" del atleta: el coach no agenda en días que ya pasaron (guard.ts).
    if (PLANNING_MODES.has(body.mode)) context.today = athleteToday();
    if (body.mode === 'weekly_eval') await prepareWeeklyEvalContext(admin, userId, context);
    if (body.mode === 'create_plan') {
      const availability = context.availability as { days?: string[] } | undefined;
      const start = usableStartDate(context.startDate as string, availability?.days, new Set((context.occupiedDates as string[] | undefined) ?? []));
      if (start !== context.startDate) {
        console.log(`[coach-chat] create_plan: sin días usables desde ${context.startDate}, arranca el ${start}`);
        context.startDate = start;
      }
    }

    const usedThisMonth = await getMonthlyTokens(admin, userId);
    if (usedThisMonth >= MONTHLY_TOKEN_CEILING) {
      return json({ error: 'límite mensual de uso del coach alcanzado' }, 429);
    }

    // Reserva ANTES de llamar — si la función muere entre aquí y
    // recordUsage (timeout, crash, lo que sea), el gasto ya quedó
    // registrado como estimado en vez de perderse en silencio. Así
    // encontramos el problema real: una llamada que tronó por IDLE_TIMEOUT
    // probablemente sí se cobró del lado de Claude, pero nunca llegamos a
    // loguearla porque la función murió antes de recordUsage.
    const reserved = await reserveUsage(admin, userId);
    const period = reserved.period;
    refund = () => refundUsage(admin, userId, reserved.period, reserved.before);

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const schema = schemaForMode(body.mode);
    const userMessage = buildUserMessage(body.mode, context);

    const planning = PLANNING_MODES.has(body.mode);
    const system = [
      // Único bloque con cache_control — contenido 100% estático e
      // idéntico entre TODOS los usuarios. Nunca pongas datos de un
      // usuario aquí: los datos del atleta siempre van en `messages`.
      { type: 'text' as const, text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } },
    ];
    // Qué modelo responde (routing.ts); null solo en el comentario post-sesión.
    const choice = plannerFor(body.mode, context);
    if (choice) console.log(`[coach-chat] ${body.mode}: ${choice.model} (${choice.effort}) — ${choice.reason}`);
    // Cada llamada a Claude queda en coach_calls (usage-log.ts).
    const calls: CallRow[] = [];
    const ask = async (step: CallStep, messages: Anthropic.MessageParam[]) => {
      const callStarted = Date.now();
      const base = { userId, mode: body.mode, step, model: choice?.model ?? OTHER_MODEL, startedMs: callStarted };
      try {
        const r = await callCoach(client, choice, system, messages, schema);
        calls.push(callRow({ ...base, model: r.model }, r.usage));
        return r;
      } catch (err) {
        calls.push(callRow(base, null, err instanceof Error ? err.message : String(err)));
        await logCalls(admin, calls.splice(0));
        throw err;
      }
    };

    const firstMessages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];
    const response = await ask('main', firstMessages);

    // Reconciliar AQUÍ, apenas Claude contestó — sin importar si lo que
    // sigue (parseo, validación, applyModeEffects) sale bien o mal. Antes
    // esto vivía solo en el camino feliz: una llamada que SÍ le cobró a
    // Claude pero falló después (JSON cortado, schema no cumplido, insert
    // fallido) dejaba pegada para siempre la reserva pesimista de
    // PRE_CALL_RESERVE_TOKENS en vez de corregirse al gasto real — cada
    // falla hacía que el tope mensual se leyera cada vez más alto de lo
    // que en verdad se gastó. (Encontrado: 3 de 4 llamadas reales de una
    // sesión de pruebas fallaron después de cobrar y se quedaron así.)
    await reconcileUsage(admin, userId, period, response.usage);

    let first = readResponse(response, schema);
    if (!first.ok) {
      await logCalls(admin, calls.splice(0));
      await refund();
      return json({ error: first.error }, 502);
    }

    // Guardia (guard.ts): lo mecánico lo arregla el código; si queda algo
    // que rompe una regla, se le pide al coach que lo corrija UNA vez, con
    // la lista exacta. Solo en los modos que planifican y si hay tiempo.
    let guard = guardOutput(body.mode, context, first.data);
    if (guard.fails.length && planning && Date.now() - startedAt < RETRY_MAX_ELAPSED_MS) {
      console.log(`[coach-chat] guardia: reintento por ${guard.fails.length} falla(s): ${guard.fails.join(' | ')}`);
      const retry = await ask('retry', [
        ...firstMessages,
        { role: 'assistant', content: first.text },
        { role: 'user', content: correctionMessage(guard.fails) },
      ]).catch(() => null); // ya quedó registrado; sigue con la primera respuesta
      if (retry) await addUsage(admin, userId, period, tokensOf(retry.usage));
      const second = retry ? readResponse(retry, schema) : null;
      if (second?.ok) {
        const g2 = guardOutput(body.mode, context, second.data);
        // Se queda con la corrección solo si de verdad corrigió algo.
        if (g2.fails.length < guard.fails.length) {
          first = second;
          guard = g2;
        }
      }
    }
    const lastCall = calls[calls.length - 1];
    if (lastCall) {
      lastCall.guard_fixes = guard.fixes.length;
      lastCall.guard_fails = guard.fails.length ? guard.fails.join(' | ').slice(0, 500) : null;
    }
    if (guard.fixes.length) console.log(`[coach-chat] guardia arregló: ${guard.fixes.join(' | ')}`);
    if (guard.warns.length) console.log(`[coach-chat] guardia avisa: ${guard.warns.join(' | ')}`);
    if (guard.fails.length && planning) {
      // No se guarda nada ni se gasta ningún tope: el atleta puede volver a pedirlo.
      console.log(`[coach-chat] guardia rechazó: ${guard.fails.join(' | ')}`);
      await logCalls(admin, calls.splice(0));
      await refund();
      return json({ error: 'el coach armó algo que no cumple las reglas de seguridad del plan — intenta de nuevo' }, 502);
    }
    const parseResult = { data: guard.out };

    // Modos que planifican: el coach ya decidió; ahora el código desenrolla
    // los intervalos y Haiku redacta las descripciones (ver routing.ts).
    const output = planning
      ? await finishPlannedWorkouts(client, admin, userId, period, body.mode, context, parseResult.data, startedAt, calls)
      : parseResult.data;
    await logCalls(admin, calls.splice(0));

    const result = await applyModeEffects(admin, userId, body.mode, context, output);
    // Se registra DESPUÉS de que todo salió bien, nunca antes (un intento
    // fallido no debe gastar ningún tope). create_plan cuenta contra
    // MONTHLY_PLAN_ACTION_LIMIT, weekly_eval contra su propio
    // MONTHLY_WEEKLY_EVAL_LIMIT — presupuestos separados a propósito.
    if (body.mode === 'create_plan') await logPlanAction(admin, userId, 'create');
    if (body.mode === 'weekly_eval') await logPlanAction(admin, userId, 'weekly_eval');

    // Correo al atleta (coach-email.ts). Sin coach humano sale solo, una vez
    // por plan y una por semana; con coach se guarda el borrador y el coach
    // decide si lo manda (send-coach-email). Va en segundo plano: la
    // respuesta no espera a Resend ni al PDF.
    if (body.mode === 'create_plan' || body.mode === 'weekly_eval') {
      const job = emailAthlete(admin, userId, body.mode, context, parseResult.data, result as Record<string, unknown>).catch((err) =>
        console.log(`[coach-chat] correo de ${body.mode} falló: ${err instanceof Error ? err.message : String(err)}`),
      );
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
      if (runtime) runtime.waitUntil(job);
      else await job;
    }

    return json({ result });
  } catch (err) {
    await refund().catch(() => {});
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[coach-chat] error: ${message}`);
    // Nada de errores internos en inglés (SDK, Postgres) hacia el atleta.
    const friendly = /^[a-záéíóúñ¿¡ ]/.test(message) && !/duplicate key|violates|Failed to|fetch failed|timeout/i.test(message)
      ? message
      : 'algo falló al armar tu plan — intenta de nuevo en unos minutos';
    return json({ error: friendly }, 500);
  }
});

/** La semana que va a generar weekly_eval la decide el servidor (mismo
 * cálculo que el gate): su lunes, y sus días ocupados sin contar las
 * sesiones que se van a rehacer (si no, el coach esquivaba justo los días
 * de la semana que está reemplazando). */
async function prepareWeeklyEvalContext(admin: AdminClient, userId: string, context: Record<string, unknown>): Promise<void> {
  const { data: plan } = await admin.from('training_plans').select('data').eq('user_id', userId).eq('status', 'active').maybeSingle();
  const planData = plan?.data as { startDate: string; weeks: { workoutIds: string[] }[] } | undefined;
  if (!planData) return;
  const t = evalWeekTarget(planData.startDate, athleteToday());
  if (!t) return;
  const monday = new Date(`${planData.startDate}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + t.target * 7);
  context.nextWeekStart = monday.toISOString().slice(0, 10);
  const replaced = planData.weeks[t.target]?.workoutIds ?? [];
  if (!replaced.length) return;
  const [{ data: rows }, { data: trained }] = await Promise.all([
    admin.from('workouts').select('id, data').eq('user_id', userId).in('id', replaced),
    admin.from('sessions').select('workout_id').in('workout_id', replaced),
  ]);
  const trainedIds = new Set((trained ?? []).map((x: { workout_id: string }) => x.workout_id));
  const today = athleteToday();
  const freed = new Set(
    ((rows ?? []) as { id: string; data: { scheduledDate?: string } }[])
      .filter((r) => !trainedIds.has(r.id) && (r.data.scheduledDate ?? '') >= today)
      .map((r) => r.data.scheduledDate),
  );
  context.occupiedDates = ((context.occupiedDates as string[] | undefined) ?? []).filter((d) => !freed.has(d));
}

/** Error con el código HTTP que debe ver el cliente. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Gate estructural — la frecuencia de llamadas la controla el ESTADO real
 * del plan/sesión, no un contador genérico.
 *  - create_plan: solo si no tiene ya un plan activo (y el índice único de
 *    Postgres lo respalda por si esta verificación tuviera un bug o dos
 *    requests se cruzaran).
 *  - weekly_eval: solo una vez por semana ISO por plan activo.
 *  - publish_block: solo si el bloque actual ya agotó sus semanas.
 *  - finished_training_eval_comment: solo si esa sesión no tiene ya un
 *    comentario guardado — evita pedirlo dos veces para la misma sesión — y
 *    nunca si vino de Strava.
 */
async function checkModeAllowed(
  admin: AdminClient,
  userId: string,
  mode: Mode,
  context: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; reason: string; status?: number }> {
  if (mode === 'coach_week' || mode === 'monthly_review') {
    // Solo el coach con vínculo ACTIVO con ese atleta — misma regla que
    // is_coach_of() en schema.sql. El userId es del JWT, nunca del body.
    const { data: link } = await admin
      .from('coach_athletes')
      .select('id')
      .eq('coach_id', userId)
      .eq('athlete_id', context.athleteId as string)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) return { ok: false, reason: 'ese atleta no está vinculado contigo' };
    return { ok: true };
  }

  if (mode === 'finished_training_eval_comment') {
    const sessionId = context.sessionId as string | undefined;
    if (!sessionId) return { ok: false, reason: 'falta context.sessionId' };
    const { data: session } = await admin
      .from('sessions')
      .select('coach_comment, source, strava_activity_id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!session) return { ok: false, reason: 'sesión no encontrada' };
    // Regla de Strava: sus términos prohíben usar sus datos en modelos de
    // IA. Esta función corre con service role (ignora RLS), así que el
    // filtro tiene que vivir aquí también, no solo en el cliente — ver
    // docs/coach-view/README.md. strava_activity_id es redundante con el
    // trigger sessions_set_source de schema.sql, pero no cuesta nada.
    if (session.source === 'strava' || session.strava_activity_id !== null) {
      return { ok: false, reason: 'las sesiones importadas de Strava no pueden pasar por el coach de IA' };
    }
    if (session.coach_comment) return { ok: false, reason: 'esta sesión ya tiene comentario' };
    return { ok: true };
  }

  const { data: plan } = await admin
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (mode === 'create_plan') {
    // 409: es un conflicto de estado, no un límite de uso (429 se lee como "reintenta").
    if (plan) return { ok: false, reason: 'ya tienes un plan activo', status: 409 };
    const monthlyActions = await getMonthlyActionCount(admin, userId, ['create', 'modify']);
    if (monthlyActions >= MONTHLY_PLAN_ACTION_LIMIT) {
      return {
        ok: false,
        reason: `ya usaste tus ${MONTHLY_PLAN_ACTION_LIMIT} creaciones/cambios de plan de este mes — vuelve el próximo mes`,
      };
    }
    return { ok: true };
  }

  if (!plan) return { ok: false, reason: 'no tienes un plan activo todavía' };

  if (mode === 'weekly_eval') {
    // Se evalúa la semana que acaba de terminar y se genera la siguiente
    // (src/core/eval-week.ts), también si abre un bloque nuevo: ya no hay
    // que esperar a que pasen todas las semanas armadas ni a publish_block.
    const planDataForGate = plan.data as { startDate: string; blocks: { weeks: number }[] };
    const t = evalWeekTarget(planDataForGate.startDate, athleteToday());
    if (!t) return { ok: false, reason: 'todavía no termina tu primera semana — vuelve el domingo para evaluarla' };
    if (t.target >= planTotalWeeks(planDataForGate.blocks)) {
      return { ok: false, reason: 'tu plan ya terminó: crea uno nuevo para seguir', status: 409 };
    }
    // Hasta 2 veces en la misma semana ISO — la segunda es un "refresh" por
    // si el atleta quiere agregar contexto que olvidó la primera vez (ver
    // applyModeEffects). La tercera sí se bloquea.
    if (plan.last_eval_iso_week === currentIsoWeek() && (plan.eval_count_this_iso_week ?? 0) >= 2) {
      return { ok: false, reason: 'ya usaste tus 2 evaluaciones de esta semana — vuelve la próxima semana' };
    }
    // Red de seguridad adicional — el gate de arriba ya es el control
    // principal, esto solo cubre el caso límite de muchas semanas reales en
    // un mes (o varios refresh seguidos) o un bug en ese gate.
    const monthlyEvals = await getMonthlyActionCount(admin, userId, ['weekly_eval']);
    if (monthlyEvals >= MONTHLY_WEEKLY_EVAL_LIMIT) {
      return {
        ok: false,
        reason: `ya usaste tus ${MONTHLY_WEEKLY_EVAL_LIMIT} evaluaciones de semana de este mes — vuelve el próximo mes`,
      };
    }
    return { ok: true };
  }

  // publish_block
  if (!plan.current_block_exhausted) return { ok: false, reason: 'el bloque actual todavía tiene semanas por correr' };
  return { ok: true };
}

/** Inserta cada workout generado como fila real en `workouts` y regresa sus ids. */
async function materializeWeek(
  admin: AdminClient,
  userId: string,
  startDate: string,
  weekIndex: number,
  workouts: { name: string; description?: string; intervals: unknown[]; dayOfWeek: string; kind?: 'test' | null }[],
  // Red de seguridad — aunque el prompt ya le pide al modelo evitar estas
  // fechas, esto nunca deja que se inserte un workout en un día que el
  // atleta ya tiene ocupado, pase lo que pase con lo que decidió el
  // modelo. Mismo set que ya se validó y mandó en el context (ver
  // CreatePlanInputContextSchema.occupiedDates) — no hace falta volver a
  // consultar la base, ya se calculó una vez del lado del cliente.
  // (Encontrado en producción: create_plan duplicaba días ya completados.)
  occupiedDates: Set<string>,
  // Con coach humano activo, los workouts van a su borrador de la semana en
  // vez de a `workouts` — mismos ids, así training_plans los sigue
  // referenciando cuando el coach los publique sin cambios.
  coachId: string | null = null,
): Promise<string[]> {
  const ids: string[] = [];
  const forCoach: Record<string, unknown>[] = [];
  for (const w of workouts) {
    const scheduledDate = dateForWeek(startDate, weekIndex, w.dayOfWeek);
    if (occupiedDates.has(scheduledDate)) continue;
    const id = crypto.randomUUID();
    const workoutDoc = {
      format_version: 1,
      id,
      name: w.name,
      description: w.description,
      intervals: w.intervals,
      created_at: new Date().toISOString(),
      scheduledDate,
      ...(w.kind ? { kind: w.kind } : {}),
    };
    if (coachId) {
      forCoach.push(workoutDoc);
    } else {
      const { error } = await admin.from('workouts').insert({ id, user_id: userId, data: workoutDoc });
      if (error) throw new Error(`no se pudo guardar el workout generado: ${error.message}`);
    }
    ids.push(id);
    occupiedDates.add(scheduledDate); // no insertes dos del lote actual el mismo día tampoco
  }
  if (coachId && forCoach.length > 0) await sendWeekToCoachDraft(admin, userId, coachId, forCoach);
  return ids;
}

/** Coach humano con vínculo activo de este atleta, o null. */
/** Correo de create_plan / weekly_eval (ver coach-email.ts): sin coach lo
 * manda si ese plan o esa semana no se mandó ya; con coach guarda el borrador. */
async function emailAthlete(
  admin: AdminClient,
  userId: string,
  mode: 'create_plan' | 'weekly_eval',
  context: Record<string, unknown>,
  planned: Record<string, unknown>,
  result: Record<string, unknown>,
): Promise<void> {
  const { data: plan } = await admin.from('training_plans').select('id, data').eq('user_id', userId).eq('status', 'active').maybeSingle();
  const row = plan as { id: string; data: { startDate?: string; emails?: Record<string, string> } } | null;
  const startDate = row?.data?.startDate;
  if (!row || !startDate) {
    console.log(`[coach-chat] correo de ${mode} omitido: sin plan activo`);
    return;
  }
  const dateOf = (weekIndex: number, day: string) => dateForWeek(startDate, weekIndex, day);
  const weekIndex = result.weekIndex as number | undefined;
  const key = emailKey(mode, weekIndex);
  const draft = mode === 'create_plan' ? planDraftOf(context, planned, startDate, dateOf) : weekDraftOf(context, planned, weekIndex!, dateOf);

  if (result.sentToCoach) {
    await mergePlanData(admin, row.id, (data) => ({ ...data, emailDrafts: { ...(data.emailDrafts as object), [key]: draft } }));
    return;
  }
  if (row.data.emails?.[key]) {
    console.log(`[coach-chat] correo ${key} omitido: ya se mandó el ${row.data.emails[key]}`);
    return;
  }
  const { data: user } = await admin.auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (!email) {
    console.log(`[coach-chat] correo ${key} omitido: el atleta no tiene correo`);
    return;
  }
  const name = ((context.profile as { name?: string | null } | undefined)?.name ?? null) || null;
  const sent = await deliverDraft(mode === 'create_plan' ? 'plan' : 'week', draft, { email, name });
  if (!sent.ok) {
    console.log(`[coach-chat] correo ${key} falló: ${sent.error}`);
    return;
  }
  console.log(`[coach-chat] correo ${key} enviado a ${sent.sentTo}`);
  await mergePlanData(admin, row.id, (data) => ({ ...data, emails: { ...(data.emails as object), [key]: new Date().toISOString() } }));
}

/** Cambia solo una parte de training_plans.data, leyéndolo de nuevo justo antes. */
async function mergePlanData(admin: AdminClient, planId: string, change: (data: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  const { data: fresh } = await admin.from('training_plans').select('data').eq('id', planId).maybeSingle();
  const current = ((fresh as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const { error } = await admin.from('training_plans').update({ data: change(current) } as never).eq('id', planId);
  if (error) console.log(`[coach-chat] no se pudo guardar el registro del correo: ${error.message}`);
}

async function activeCoachOf(admin: AdminClient, athleteId: string): Promise<string | null> {
  const { data } = await admin.from('coach_athletes').select('coach_id').eq('athlete_id', athleteId).eq('status', 'active').maybeSingle();
  return (data?.coach_id as string | undefined) ?? null;
}

function isoWeekOf(mondayKey: string): string {
  const target = new Date(`${mondayKey}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Manda lo que generó la IA del atleta al borrador de su coach, una semana
 * (lunes a domingo) a la vez. Si el coach ya tiene borrador de esa semana,
 * se reemplaza solo lo que había propuesto la IA antes (origin 'ai') — lo
 * que el coach editó o agregó se queda. Si no hay borrador, se crea con lo
 * que el atleta ya tiene agendado más la propuesta. */
async function sendWeekToCoachDraft(admin: AdminClient, athleteId: string, coachId: string, docs: Record<string, unknown>[]): Promise<void> {
  const byMonday = new Map<string, Record<string, unknown>[]>();
  for (const d of docs) {
    const monday = mondayOf(new Date(`${d.scheduledDate as string}T00:00:00Z`)).toISOString().slice(0, 10);
    byMonday.set(monday, [...(byMonday.get(monday) ?? []), d]);
  }
  for (const [monday, weekDocs] of byMonday) {
    const sunday = new Date(`${monday}T00:00:00Z`);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const sundayKey = sunday.toISOString().slice(0, 10);
    const aiItems = weekDocs.map((workout) => ({ workout, origin: 'ai', edited: false }));

    const { data: draft } = await admin
      .from('plan_weeks')
      .select('id, items')
      .eq('athlete_id', athleteId)
      .eq('coach_id', coachId)
      .eq('week_start', monday)
      .eq('status', 'draft')
      .maybeSingle();

    if (draft) {
      const kept = ((draft.items as { origin?: string }[]) ?? []).filter((i) => i.origin !== 'ai');
      const { error } = await admin
        .from('plan_weeks')
        .update({ items: [...kept, ...aiItems], updated_at: new Date().toISOString() })
        .eq('id', draft.id);
      if (error) throw new Error(`no se pudo mandar la semana a tu coach: ${error.message}`);
      continue;
    }

    const [{ data: existing }, { data: routines }] = await Promise.all([
      admin.from('workouts').select('id, data').eq('user_id', athleteId).gte('data->>scheduledDate', monday).lte('data->>scheduledDate', sundayKey),
      admin.from('planned_routines').select('id, kind, name, payload, scheduled_date').eq('athlete_id', athleteId).gte('scheduled_date', monday).lte('scheduled_date', sundayKey),
    ]);
    const athleteItems = [
      ...(existing ?? []).map((r: { data: unknown }) => ({ workout: r.data, origin: 'athlete', edited: false })),
      ...(routines ?? []).map((r: { id: string; kind: string; name: string; payload: unknown; scheduled_date: string }) => ({
        routine: { id: r.id, kind: r.kind, name: r.name, payload: r.payload, scheduledDate: r.scheduled_date },
        origin: 'athlete',
        edited: false,
      })),
    ];
    const baseIds = [...(existing ?? []).map((r: { id: string }) => r.id), ...(routines ?? []).map((r: { id: string }) => r.id)];
    const { error } = await admin.from('plan_weeks').insert({
      athlete_id: athleteId,
      coach_id: coachId,
      week_start: monday,
      iso_week: isoWeekOf(monday),
      items: [...athleteItems, ...aiItems],
      base_workout_ids: baseIds,
    });
    if (error) throw new Error(`no se pudo mandar la semana a tu coach: ${error.message}`);
  }
}

function dateForWeek(startDate: string, weekIndex: number, dayOfWeek: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  // Ancla a lunes REAL de la semana calendario de startDate, no a
  // startDate mismo — si no, un plan que arranca miércoles mandaba el
  // workout "lunes" dos días adelante (miércoles+0), no al lunes de
  // verdad. Ver weekEndDate/mondayOf, mismo ancla que usa el gate.
  const base = mondayOf(start);
  base.setUTCDate(base.getUTCDate() + weekIndex * 7 + (DAY_OFFSET[dayOfWeek] ?? 0));
  // Si ese día ya pasó (solo posible en la semana 0, cuando el plan no
  // arranca en lunes) no se puede agendar en el pasado — se corre una
  // semana adelante en vez de dejarlo ahí.
  if (base < start) base.setUTCDate(base.getUTCDate() + 7);
  return base.toISOString().slice(0, 10);
}

function blockIndexForWeek(blocks: { weeks: number }[], weekIndex: number): number {
  let cum = 0;
  for (let i = 0; i < blocks.length; i++) {
    cum += blocks[i].weeks;
    if (weekIndex < cum) return i;
  }
  return blocks.length - 1;
}

const DAY_NAMES: Record<string, string> = { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' };

/** Semanas de workouts compactos que devolvió el coach, según el modo. */
function plannedWeeksOf(mode: Mode, output: Record<string, unknown>): PlannedWorkout[][] {
  if (mode === 'create_plan') return (output.firstBlockWeeks as { workouts: PlannedWorkout[] }[]).map((w) => w.workouts);
  if (mode === 'weekly_eval') return [output.nextWeekWorkouts as PlannedWorkout[]];
  return (output.weeks as { workouts: PlannedWorkout[] }[]).map((w) => w.workouts);
}

/** Mismo output con cada workout ya completo (intervalos + descripción),
 * en el shape que espera applyModeEffects/materializeWeek. */
function withGeneratedWeeks(mode: Mode, output: Record<string, unknown>, weeks: ReturnType<typeof toGeneratedWorkout>[][]): Record<string, unknown> {
  if (mode === 'create_plan') {
    return { ...output, firstBlockWeeks: (output.firstBlockWeeks as { weekIndex: number }[]).map((w, i) => ({ ...w, workouts: weeks[i] })) };
  }
  if (mode === 'weekly_eval') return { ...output, nextWeekWorkouts: weeks[0] };
  return { ...output, weeks: (output.weeks as { weekIndex: number }[]).map((w, i) => ({ ...w, workouts: weeks[i] })) };
}

/** Redacta las descripciones de una semana (Haiku). null si falla o se pasa
 * del tiempo — el llamador usa la intención del coach en su lugar. */
async function writeWeekDescriptions(
  client: Anthropic,
  athlete: { name: string | null; sex: string | null },
  workouts: PlannedWorkout[],
  timeoutMs: number,
  logAs: { userId: string; mode: string; calls: CallRow[] },
): Promise<{ descriptions: Map<number, string>; usage: UsageLike } | null> {
  const callStarted = Date.now();
  const base = { userId: logAs.userId, mode: logAs.mode, step: 'writer' as const, model: WRITER_MODEL, startedMs: callStarted };
  try {
    const payload = {
      athlete,
      workouts: workouts.map((w, index) => ({
        index,
        name: w.name,
        day: DAY_NAMES[w.dayOfWeek] ?? w.dayOfWeek,
        minutes: totalMinutes(w.segments),
        targetTSS: w.targetTSS,
        erg: w.erg,
        intent: w.intent,
        structure: summarizeSegments(w.segments),
      })),
    };
    const response = await client.messages.create(
      {
        model: WRITER_MODEL,
        max_tokens: 8000,
        // low: es redacción guiada, no razonamiento — y rápido.
        output_config: { effort: 'low', format: zodOutputFormat(WorkoutDescriptionsSchema) },
        system: [{ type: 'text', text: WRITER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `Escribe la descripción de cada workout de esta semana.\n\nDatos:\n${JSON.stringify(payload, null, 2)}` }],
      },
      { signal: AbortSignal.timeout(timeoutMs), maxRetries: 0 },
    );
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    const parsed = text ? WorkoutDescriptionsSchema.safeParse(JSON.parse(text)) : null;
    const descriptions = new Map<number, string>();
    if (parsed?.success) for (const d of parsed.data.descriptions) descriptions.set(d.index, d.description);
    logAs.calls.push(callRow({ ...base, model: response.model }, response.usage, parsed?.success ? null : 'salida del redactor inválida'));
    return { descriptions, usage: response.usage };
  } catch (err) {
    logAs.calls.push(callRow(base, null, err instanceof Error ? err.message : String(err)));
    return null;
  }
}

/** Después de que el coach (Sonnet) decidió: desenrolla los intervalos y
 * pide las descripciones a Haiku, una llamada por semana en paralelo, solo
 * si queda tiempo antes del límite de Supabase. */
async function finishPlannedWorkouts(
  client: Anthropic,
  admin: AdminClient,
  userId: string,
  period: string,
  mode: Mode,
  context: Record<string, unknown>,
  // deno-lint-ignore no-explicit-any
  output: any,
  startedAt: number,
  calls: CallRow[],
): Promise<Record<string, unknown>> {
  // El tope de minutos ya lo aplicó la guardia (guard.ts → fitToCap).
  const weeks = plannedWeeksOf(mode, output);
  const profile = context.profile as { name?: string | null; sex?: string | null } | undefined;
  const athlete = { name: profile?.name ?? null, sex: profile?.sex ?? null };

  const remaining = WALL_CLOCK_BUDGET_MS - (Date.now() - startedAt);
  const written =
    remaining >= WRITER_MIN_REMAINING_MS
      ? await Promise.all(weeks.map((w) => writeWeekDescriptions(client, athlete, w, Math.min(WRITER_MAX_MS, remaining - 5_000), { userId, mode, calls })))
      : weeks.map(() => null);

  const writerTokens = written.reduce((sum, r) => sum + (r ? tokensOf(r.usage) : 0), 0);
  if (writerTokens > 0) await addUsage(admin, userId, period, writerTokens);

  const generated = weeks.map((ws, wi) => ws.map((w, i) => toGeneratedWorkout(w, written[wi]?.descriptions.get(i) ?? null)));
  return withGeneratedWeeks(mode, output, generated);
}

/** coach_week: trae las plantillas que la IA citó (solo de bici y de ESTE
 * coach, userId del JWT) y resuelve copia exacta vs. ajuste (library.ts). */
async function resolveLibraryWorkouts(admin: AdminClient, coachId: string, workouts: CoachWeekWorkout[]): Promise<unknown[]> {
  const ids = [...new Set(workouts.map((w) => w.fromLibraryId).filter((id): id is string => !!id))];
  const templates = new Map<string, LibraryTemplate>();
  if (ids.length > 0) {
    const { data } = await admin.from('session_templates').select('id, name, payload').eq('coach_id', coachId).eq('kind', 'bike').in('id', ids);
    for (const t of (data ?? []) as (LibraryTemplate & { id: string })[]) templates.set(t.id, t);
  }
  return resolveFromLibrary(workouts, templates);
}

/** Aplica los efectos de cada modo: materializa workouts reales y
 * actualiza/crea el estado del plan. Devuelve lo que se manda al cliente. */
async function applyModeEffects(
  admin: AdminClient,
  userId: string,
  mode: Mode,
  context: Record<string, unknown>,
  // deno-lint-ignore no-explicit-any
  output: any,
): Promise<unknown> {
  if (mode === 'coach_week') {
    // No escribe nada: la propuesta se aplica en el borrador del coach
    // (plan_weeks) desde el cliente. Red de seguridad: se descarta
    // cualquier entrenamiento fuera de openDays (días pasados o no pedidos).
    const open = new Set((context.openDays as string[]) ?? []);
    return {
      rationale: output.rationale,
      workouts: await resolveLibraryWorkouts(admin, userId, (output.workouts as CoachWeekWorkout[]).filter((w) => open.has(w.dayOfWeek))),
    };
  }

  if (mode === 'monthly_review') {
    // No escribe nada: el coach aplica el borrador en su editor y decide.
    return output;
  }

  if (mode === 'finished_training_eval_comment') {
    const sessionId = context.sessionId as string;
    await admin.from('sessions').update({ coach_comment: output.comment }).eq('id', sessionId).eq('user_id', userId);
    return output;
  }

  // Atleta con coach humano activo: lo que genera su IA no va directo a su
  // calendario, llega como borrador al coach (ver sendWeekToCoachDraft) —
  // el atleta nunca ve una semana que su coach no publicó.
  const coachId = await activeCoachOf(admin, userId);

  if (mode === 'create_plan') {
    const startDate = context.startDate as string | undefined;
    if (!startDate) throw new Error('falta context.startDate');

    // Otro intento pudo terminar mientras este esperaba al modelo (~1 min).
    const { data: already } = await admin.from('training_plans').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle();
    if (already) throw new HttpError(409, 'ya tienes un plan activo (se creó en otro intento) — recarga la app para verlo');

    const occupiedDates = new Set((context.occupiedDates as string[] | undefined) ?? []);
    const weeks: { weekIndex: number; workoutIds: string[] }[] = [];
    for (let i = 0; i < output.firstBlockWeeks.length; i++) {
      const ids = await materializeWeek(admin, userId, startDate, i, output.firstBlockWeeks[i].workouts, occupiedDates, coachId);
      weeks.push({ weekIndex: i, workoutIds: ids });
    }

    const blocks = output.blocks.map((b: unknown, i: number) => ({ ...b, published: i === 0 }));
    const planId = crypto.randomUUID();
    // create_plan concretiza TODAS las semanas del primer bloque de una vez
    // (no solo la primera) — si ese bloque ya quedó completo, hay que
    // marcarlo agotado desde aquí. Si esto se queda en `false` por default,
    // weekly_eval cree que al bloque 0 le faltan semanas y termina
    // generando una semana que en realidad pertenece al siguiente bloque,
    // todavía sin publicar. (Encontrado simulando contra dperezcf.)
    const firstBlockExhausted = weeks.length >= blocks[0].weeks;

    // Foto del PMC al momento de arrancar el plan — sin esto, una
    // comparación futura ("cómo vas desde que empezaste este plan") no
    // tiene punto de partida fijo, solo el CTL/ATL/TSB del momento en que
    // se consulte, que ya para entonces cambió. recentHistory viene nulo si
    // el atleta no tenía ninguna sesión registrada todavía.
    const recentHistory = context.recentHistory as { ctl?: number; atl?: number; tsb?: number } | null;
    const startingPmc =
      recentHistory?.ctl !== undefined
        ? {
            ctl: recentHistory.ctl,
            atl: recentHistory.atl ?? 0,
            tsb: recentHistory.tsb ?? 0,
            capturedAt: new Date().toISOString(),
          }
        : null;

    // Se guarda para que weekly_eval lo vuelva a mandar después — si no,
    // el tope que el atleta puso una sola vez al crear el plan (ej. "máximo
    // 60 min") se perdía apenas tocaba evaluar la semana siguiente.
    const maxSessionMinutes = (context.availability as { maxSessionMinutes?: number | null } | undefined)?.maxSessionMinutes ?? null;

    const { error } = await admin.from('training_plans').insert({
      id: planId,
      user_id: userId,
      status: 'active',
      goal: output.planName,
      data: {
        startDate,
        blocks,
        weeks,
        startingPmc,
        maxSessionMinutes,
        ftpSuggestion: ftpSuggestionOf(output.suggestedFtp, 'create_plan'),
        // Lo que escribió el atleta en el formulario: weekly_eval y
        // publish_block lo reciben de vuelta en `plan` (src/core/plan-context.ts).
        form: {
          goal: context.goal as string,
          days: (context.availability as { days: string[] }).days,
          hoursPerWeek: (context.availability as { hoursPerWeek: number }).hoursPerWeek,
        },
        nextTest: output.nextTest ?? null,
      },
      current_block_exhausted: firstBlockExhausted,
    });
    if (error) {
      // Las sesiones ya se insertaron arriba: sin plan que las referencie, la
      // baja nunca las borraría (huérfanas en el calendario). Pasa con dos
      // create_plan cruzados (doble envío, o reintento tras un corte de red
      // mientras el primero seguía): el índice único deja pasar solo uno.
      const inserted = weeks.flatMap((w) => w.workoutIds);
      if (inserted.length && !coachId) await admin.from('workouts').delete().eq('user_id', userId).in('id', inserted);
      if (error.code === '23505') throw new HttpError(409, 'ya tienes un plan activo (se creó en otro intento) — recarga la app para verlo');
      throw new Error(`no se pudo guardar el plan: ${error.message}`);
    }

    return {
      planId,
      startDate,
      coachNote: output.coachNote,
      weeks,
      sentToCoach: coachId !== null,
      suggestedFtp: output.suggestedFtp ?? null,
      nextTest: output.nextTest ?? null,
    };
  }

  // weekly_eval y publish_block parten del plan activo existente.
  const { data: plan, error: planErr } = await admin
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  if (planErr || !plan) throw new Error('no hay plan activo');
  const planData = plan.data as {
    startDate: string;
    blocks: { weeks: number; published?: boolean }[];
    weeks: { weekIndex: number; workoutIds: string[] }[];
  };

  if (mode === 'weekly_eval') {
    // La semana que se genera es la siguiente a la que acaba de terminar
    // (src/core/eval-week.ts, mismo cálculo que el gate). Si ya estaba armada
    // —create_plan deja hasta 3— se rehace con la retro; si no, se agrega.
    // Una 2ª evaluación en la misma semana ("refresh") cae en la misma y la
    // vuelve a rehacer.
    const t = evalWeekTarget(planData.startDate, athleteToday());
    if (!t) throw new HttpError(429, 'todavía no termina tu primera semana — vuelve el domingo para evaluarla');
    const nextWeekIndex = t.target;
    const isRefresh = plan.last_eval_iso_week === currentIsoWeek();

    // Borra lo que ya estaba armado en esa semana — excepción sancionada al
    // "nunca borrar datos": son workouts de una semana que todavía no se
    // entrenó; igual que coach-retire-plan, nunca se borra uno que ya tenga
    // una sesión real encima (esos se quedan en la semana).
    // Tampoco los de días que ya pasaron (evaluar un jueves rehace la semana
    // en curso): se quedan como estaban, entrenados o no.
    const oldIds = planData.weeks[nextWeekIndex]?.workoutIds ?? [];
    let keptIds: string[] = [];
    if (oldIds.length > 0) {
      const today = athleteToday();
      const [{ data: trained }, { data: rows }] = await Promise.all([
        admin.from('sessions').select('workout_id').in('workout_id', oldIds),
        admin.from('workouts').select('id, data').eq('user_id', userId).in('id', oldIds),
      ]);
      const trainedIds = new Set((trained ?? []).map((s: { workout_id: string }) => s.workout_id));
      const dateOf = new Map(((rows ?? []) as { id: string; data: { scheduledDate?: string } }[]).map((r) => [r.id, r.data.scheduledDate ?? '']));
      const replaceable = (id: string) => !trainedIds.has(id) && (dateOf.get(id) ?? '') >= today;
      keptIds = oldIds.filter((id: string) => !replaceable(id));
      const toDelete = oldIds.filter(replaceable);
      if (toDelete.length > 0) await admin.from('workouts').delete().eq('user_id', userId).in('id', toDelete);
    }

    const weeklyEvalOccupiedDates = new Set((context.occupiedDates as string[] | undefined) ?? []);
    const ids = await materializeWeek(admin, userId, planData.startDate, nextWeekIndex, output.nextWeekWorkouts, weeklyEvalOccupiedDates, coachId);
    // Semanas contiguas: si el atleta se saltó evaluaciones, las de en medio
    // quedan vacías (ya pasaron).
    const weeks = planData.weeks.slice();
    for (let i = weeks.length; i <= nextWeekIndex; i++) weeks.push({ weekIndex: i, workoutIds: [] });
    weeks[nextWeekIndex] = { weekIndex: nextWeekIndex, workoutIds: [...keptIds, ...ids] };

    // La semana nueva puede abrir un bloque: queda publicado (antes eso
    // requería publish_block, que no tiene UI, y el plan se quedaba sin salida).
    const blockIdx = blockIndexForWeek(planData.blocks, nextWeekIndex);
    const blocks = planData.blocks.map((b, i) => (i <= blockIdx && !b.published ? { ...b, published: true } : b));

    const { error } = await admin
      .from('training_plans')
      .update({
        // lastEvalNote: el reasoning se devuelve en la respuesta pero nunca
        // vivía en ningún lado después de eso — un reload (o solo volver
        // mañana) lo perdía por completo. Guardarlo acá hace que
        // planSummaryHtml lo pueda seguir mostrando después.
        // ftpSuggestion: "change" la reemplaza, "keep" la borra (ya no
        // aplica), null la deja como estaba (el FTP no vino al caso).
        data: {
          ...planData,
          blocks,
          weeks,
          lastEvalNote: output.reasoning,
          // El coach revisa el test agendado cada semana: lo que diga ahora
          // reemplaza lo anterior (null = no hay test pendiente).
          nextTest: output.nextTest ?? null,
          ftpSuggestion:
            output.ftpAction === 'change'
              ? ftpSuggestionOf(output.suggestedFtp, 'weekly_eval')
              : output.ftpAction === 'keep'
                ? null
                : ((planData as { ftpSuggestion?: unknown }).ftpSuggestion ?? null),
        },
        last_eval_iso_week: currentIsoWeek(),
        eval_count_this_iso_week: isRefresh ? (plan.eval_count_this_iso_week ?? 1) + 1 : 1,
        // Ya no frena nada (ver el gate): se deja en false.
        current_block_exhausted: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id);
    if (error) throw new Error(`no se pudo actualizar el plan: ${error.message}`);

    return {
      decision: output.decision,
      reasoning: output.reasoning,
      contradictionFlag: output.contradictionFlag,
      recurringPatternFlag: output.recurringPatternFlag,
      weekIndex: nextWeekIndex,
      workoutIds: ids,
      sentToCoach: coachId !== null,
      ftpAction: output.ftpAction ?? null,
      suggestedFtp: output.suggestedFtp ?? null,
      nextTest: output.nextTest ?? null,
      notesUpdated: context.notesDue === true ? await saveAiNotes(admin, userId, output.notesUpdate) : false,
    };
  }

  // publish_block
  const nextBlockIdx = planData.blocks.findIndex((b) => !b.published);
  if (nextBlockIdx === -1) throw new Error('no hay bloque siguiente por publicar');
  const weeksBeforeBlock = planData.blocks.slice(0, nextBlockIdx).reduce((s, b) => s + b.weeks, 0);

  // publish_block todavía no tiene UI; cuando el cliente mande
  // occupiedDates (ya está en el schema), se respetan igual que en
  // create_plan/weekly_eval.
  const publishBlockOccupiedDates = new Set((context.occupiedDates as string[] | undefined) ?? []);
  const newWeeks: { weekIndex: number; workoutIds: string[] }[] = [];
  for (let i = 0; i < output.weeks.length; i++) {
    const weekIndex = weeksBeforeBlock + i;
    const ids = await materializeWeek(admin, userId, planData.startDate, weekIndex, output.weeks[i].workouts, publishBlockOccupiedDates, coachId);
    newWeeks.push({ weekIndex, workoutIds: ids });
  }

  const blocks = planData.blocks.map((b, i) => (i === nextBlockIdx ? { ...b, published: true } : b));

  const { error } = await admin
    .from('training_plans')
    .update({
      data: { ...planData, blocks, weeks: [...planData.weeks, ...newWeeks], nextTest: output.nextTest ?? null },
      current_block_exhausted: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id);
  if (error) throw new Error(`no se pudo actualizar el plan: ${error.message}`);

  return { blockName: output.blockName, coachNote: output.coachNote, weeks: newWeeks, sentToCoach: coachId !== null, nextTest: output.nextTest ?? null };
}

/** FTP que el coach propone poner en el perfil, guardado en el plan para que
 * la app ofrezca el botón aunque se recargue la página. El atleta decide. */
function ftpSuggestionOf(watts: number | null | undefined, from: 'create_plan' | 'weekly_eval') {
  return watts ? { watts: Math.round(watts), from, at: new Date().toISOString() } : null;
}

async function loadNotes(admin: AdminClient, athleteId: string): Promise<StoredNotes | null> {
  const { data } = await admin.from('athlete_notes').select('body, updated_by').eq('athlete_id', athleteId).maybeSingle();
  return data ? { body: data.body as string, updatedBy: data.updated_by as StoredNotes['updatedBy'] } : null;
}

/** Guarda el expediente que propuso la IA si pasa la guarda (acceptAiNotes:
 * tope y nunca borrar lo que escribió un coach). true si se guardó. */
async function saveAiNotes(admin: AdminClient, athleteId: string, proposed: string | null | undefined): Promise<boolean> {
  const body = acceptAiNotes(proposed, await loadNotes(admin, athleteId));
  if (!body) return false;
  const { error } = await admin
    .from('athlete_notes')
    .upsert({ athlete_id: athleteId, body, updated_by: 'ai', updated_by_user: null, updated_at: new Date().toISOString() });
  if (error) console.log(`[coach-chat] no se guardó el expediente: ${error.message}`);
  return !error;
}

/** Acciones de un tipo en toda la historia del usuario (no solo el mes). */
async function getActionCount(admin: AdminClient, userId: string, action: PlanActionType): Promise<number> {
  const { count } = await admin.from('plan_actions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('action', action);
  return count ?? 0;
}

async function getMonthlyTokens(admin: AdminClient, userId: string): Promise<number> {
  const { data } = await admin
    .from('coach_usage')
    .select('tokens_used')
    .eq('user_id', userId)
    .eq('period', currentMonthPeriod())
    .maybeSingle();
  return data?.tokens_used ?? 0;
}

type PlanActionType = 'create' | 'modify' | 'weekly_eval';

/** Cuenta acciones de ESTE mes calendario (UTC) filtradas por tipo — separa
 * el tope de create/modify (MONTHLY_PLAN_ACTION_LIMIT) del de weekly_eval
 * (MONTHLY_WEEKLY_EVAL_LIMIT), cada quien con su propio presupuesto. */
async function getMonthlyActionCount(admin: AdminClient, userId: string, actions: PlanActionType[]): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from('plan_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('action', actions)
    .gte('created_at', startOfMonth.toISOString());
  return count ?? 0;
}

async function logPlanAction(admin: AdminClient, userId: string, action: PlanActionType): Promise<void> {
  await admin.from('plan_actions').insert({ id: crypto.randomUUID(), user_id: userId, action });
}

/** Aparta PRE_CALL_RESERVE_TOKENS ANTES de llamar a Claude — si la función
 * muere a medio camino, esto ya quedó contado como gasto (sobreestimado,
 * nunca perdido). Regresa el período para que reconcileUsage sepa qué fila
 * corregir después. */
async function reserveUsage(admin: AdminClient, userId: string): Promise<{ period: string; before: number }> {
  const period = currentMonthPeriod();
  const { data: existing } = await admin
    .from('coach_usage')
    .select('tokens_used, requests_used')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle();

  await admin.from('coach_usage').upsert(
    {
      user_id: userId,
      period,
      tokens_used: (existing?.tokens_used ?? 0) + PRE_CALL_RESERVE_TOKENS,
      requests_used: (existing?.requests_used ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,period' },
  );
  return { period, before: existing?.tokens_used ?? 0 };
}

/** Un intento que no le dio nada al atleta (la guardia lo rechazó, el modelo
 * no devolvió una salida válida, un error) no cuenta contra su tope mensual:
 * la fila vuelve a lo que tenía antes de este intento. El gasto real sigue
 * registrado en coach_calls. Si no, reintentar como pide el mensaje
 * («intenta de nuevo») podía dejarlo sin cuota y sin plan. */
async function refundUsage(admin: AdminClient, userId: string, period: string, before: number): Promise<void> {
  await admin
    .from('coach_usage')
    .update({ tokens_used: before, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('period', period);
}

/** Tokens que cuentan contra el tope mensual (la lectura de caché no). */
function tokensOf(usage: UsageLike): number {
  return (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
}

/** Una llamada al coach. Streaming, no .parse() directo: Supabase Edge
 * Functions mata la conexión a los 150 s si no hay bytes fluyendo
 * (IDLE_TIMEOUT) — un plan grande sin streaming puede tardar más que eso en
 * generar el primer byte. output_config.format sigue aplicando igual en
 * modo streaming (lo fuerza el servidor, no el transporte); solo hay que
 * parsear el texto final a mano (readResponse). */
/** Corrige la reserva al número REAL de la llamada que sí terminó bien —
 * resta la reserva y suma lo que de verdad reportó la API. Si esto nunca se
 * llama (la función murió antes), la reserva de arriba se queda tal cual. */
async function reconcileUsage(admin: AdminClient, userId: string, period: string, usage: UsageLike): Promise<void> {
  const actualTokens = tokensOf(usage);
  const { data: existing } = await admin
    .from('coach_usage')
    .select('tokens_used')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle();

  await admin
    .from('coach_usage')
    .update({
      tokens_used: (existing?.tokens_used ?? PRE_CALL_RESERVE_TOKENS) - PRE_CALL_RESERVE_TOKENS + actualTokens,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('period', period);
}

/** Suma tokens ya gastados (el redactor) a la fila del mes. */
async function addUsage(admin: AdminClient, userId: string, period: string, tokens: number): Promise<void> {
  const { data: existing } = await admin
    .from('coach_usage')
    .select('tokens_used')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle();
  await admin
    .from('coach_usage')
    .update({ tokens_used: (existing?.tokens_used ?? 0) + tokens, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('period', period);
}

function currentMonthPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Fecha (lunes) de la semana calendario que contiene `date` — ancla para
 * alinear las "semanas" del plan a semanas reales (lunes-domingo), no a
 * bloques rígidos de 7 días desde startDate. Sin esto, un plan que arranca
 * un miércoles (lo normal, nadie crea su plan siempre en lunes) generaba
 * semanas que terminaban martes, y encima el día "lunes" de un workout caía
 * en miércoles (offset fijo de 7 días, sin alinear) — ver dateForWeek. */
function mondayOf(dateUtc: Date): Date {
  const dayNum = (dateUtc.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  const monday = new Date(dateUtc);
  monday.setUTCDate(monday.getUTCDate() - dayNum);
  return monday;
}

/** Último día (domingo) de la semana `weekIndex` de un plan, alineado a
 * semanas calendario reales — la semana 0 puede ser corta (de startDate al
 * domingo que sigue) si el plan no arrancó en lunes; de ahí en adelante son
 * semanas lunes-domingo completas. */
function weekEndDate(startDate: string, weekIndex: number): Date {
  const start = new Date(`${startDate}T00:00:00Z`);
  const firstMonday = mondayOf(start);
  const weekEnd = new Date(firstMonday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + weekIndex * 7 + 6);
  return weekEnd;
}

function currentIsoWeek(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
