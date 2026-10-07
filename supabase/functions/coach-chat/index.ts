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
import { COACH_SYSTEM_PROMPT, WORKOUT_CONTRACT } from './prompt.ts';
import { schemaForMode, inputContextSchemaForMode, type Mode } from './schemas.ts';

type AdminClient = ReturnType<typeof createClient>;

function adminClient(): AdminClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

// Haiku 4.5, no Sonnet: la tarea sigue siendo generar un plan estructurado
// con reglas bien definidas (la jerarquía de evidencia, el contrato de
// Workout), no razonamiento abierto complejo — y Sonnet 5 generando
// max_tokens altos (48000, con las descripciones ricas por workout) tardaba
// lo suficiente para toparse con fallas intermitentes tipo IDLE_TIMEOUT en
// ~1 de cada 3-4 llamadas reales (visto en pruebas: la reserva de tokens se
// gastaba completa sin reconciliar, señal de que la función moría antes de
// recibir respuesta). Haiku es mucho más rápido, reduciendo la ventana de
// riesgo. Si la calidad del plan baja de forma notoria, vale la pena volver
// a Sonnet y atacar la causa de raíz (streaming real al cliente) en vez de
// cambiar de modelo otra vez.
const MODEL = 'claude-haiku-4-5-20251001';

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

const DAY_OFFSET: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

// Lanzamiento controlado — el coach llama a Claude (dinero real por
// request) y todavía no está listo para abrirse a toda la base de
// usuarios. Solo estos user_id pueden usarlo mientras tanto. Quitar
// esta lista (o vaciarla) es la forma de abrirlo a todos después.
const ALLOWED_USER_IDS = new Set([
  '68c9ddae-cee4-4d2f-8d0f-9553f9fe5782', // dperezcf@gmail.com — usuario dummy de pruebas
  '1d868aa6-bd45-4a1a-83aa-7d9f54c8d24b', // andrea.guerrero.guzman@gmail.com
  '95b1f5fc-a167-4c9e-ae16-95d158280c3d', // dpcfrade@gmail.com — dueño de la app y coach
]);

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
      return json({ error: 'context inválido', details: contextCheck.error.issues }, 400);
    }

    const context = contextCheck.data; // ya validado y tipado — usar este, no body.context

    const allowed = await checkModeAllowed(admin, userId, body.mode, context);
    if (!allowed.ok) return json({ error: allowed.reason }, 429);

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
    const period = await reserveUsage(admin, userId);

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const schema = schemaForMode(body.mode);
    const userMessage = buildUserMessage(body.mode, context);

    // Streaming, no .parse() directo: Supabase Edge Functions mata la
    // conexión a los 150s si no hay bytes fluyendo (IDLE_TIMEOUT) — un plan
    // grande sin streaming puede tardar más que eso en generar el primer
    // byte. output_config.format sigue aplicando igual en modo streaming
    // (lo fuerza el servidor, no el transporte); solo hay que parsear el
    // texto final a mano en vez de depender del parsed_output de .parse().
    const stream = client.messages.stream({
      model: MODEL,
      // create_plan concretiza TODAS las semanas del primer bloque de una
      // vez — con el protocolo de arranque de 3-6 semanas para perfiles
      // sedentarios (ver prompt.ts) el JSON completo (bloques + semanas +
      // intervals de cada workout + coachNote) puede acercarse a 16000
      // tokens de salida y cortarse a medias. 48000 da margen real sin
      // costo extra: Anthropic cobra por tokens generados, no por el techo.
      max_tokens: 48000,
      system: [
        // Único bloque con cache_control — contenido 100% estático e
        // idéntico entre TODOS los usuarios. Nunca pongas datos de un
        // usuario aquí: los datos del atleta siempre van en `messages`.
        { type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userMessage }],
      output_config: { format: zodOutputFormat(schema) },
    });
    const response = await stream.finalMessage();

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

    if (response.stop_reason === 'max_tokens') {
      return json({ error: 'la respuesta del coach se cortó por longitud (max_tokens) — intenta de nuevo' }, 502);
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    let parsedJson: unknown = null;
    try {
      if (textBlock) parsedJson = JSON.parse(textBlock.text);
    } catch {
      // JSON truncado o malformado — antes esto tronaba como excepción no
      // controlada y caía al catch genérico de abajo (400 con un mensaje
      // de JSON.parse que el cliente nunca llegaba a mostrar). Mensaje
      // explícito para que la próxima falla de este tipo sea diagnosticable
      // sin tener que adivinar ni gastar otra llamada real para probar.
      return json({ error: 'el modelo no devolvió JSON válido, intenta de nuevo' }, 502);
    }
    const parseResult = parsedJson !== null ? schema.safeParse(parsedJson) : null;
    if (!parseResult?.success) {
      return json({ error: 'el modelo no devolvió una salida válida, intenta de nuevo' }, 502);
    }

    const result = await applyModeEffects(admin, userId, body.mode, context, parseResult.data);
    // Se registra DESPUÉS de que todo salió bien, nunca antes (un intento
    // fallido no debe gastar ningún tope). create_plan cuenta contra
    // MONTHLY_PLAN_ACTION_LIMIT, weekly_eval contra su propio
    // MONTHLY_WEEKLY_EVAL_LIMIT — presupuestos separados a propósito.
    if (body.mode === 'create_plan') await logPlanAction(admin, userId, 'create');
    if (body.mode === 'weekly_eval') await logPlanAction(admin, userId, 'weekly_eval');

    return json({ result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

function buildUserMessage(mode: Mode, context: Record<string, unknown>): string {
  const headers: Record<Mode, string> = {
    create_plan: 'Modo: create_plan. Genera el esqueleto del plan y concretiza el primer bloque.',
    weekly_eval: 'Modo: weekly_eval. Evalúa la semana recién terminada y decide la que sigue.',
    publish_block: 'Modo: publish_block. Concretiza el siguiente bloque con base en cómo fue el anterior completo.',
    finished_training_eval_comment:
      'Modo: finished_training_eval_comment. Un comentario corto (1-2 líneas) sobre la sesión que se acaba de terminar. No es una evaluación, no cambia nada del plan.',
    coach_week: [
      'Modo: coach_week. Trabajas para el COACH HUMANO de este atleta: él decide y aprueba, tú propones.',
      'Reacomoda la semana que empieza en `weekStart` siguiendo la `instruction` del coach (si viene vacía, propón la mejor semana con los datos).',
      'Reglas duras:',
      '- Solo pon entrenamientos en días de `openDays` (de hoy en adelante). Nunca en días pasados.',
      '- `lockedItems` ya están decididos y no se tocan ni se repiten: cuéntalos en la carga de la semana y no pongas otro entrenamiento de bici el mismo día que uno bloqueado de bici.',
      '- Máximo un entrenamiento de bici por día. Respeta `maxSessionMinutes` si viene.',
      '- Si hay fuerza de pierna bloqueada, sepárala al menos 48 h de intervalos duros (umbral, VO2, sprints).',
      '- Respeta las lesiones del atleta (`athlete.injuries`).',
      '- `rationale`: 2-5 razones cortas en español, dirigidas al coach, hablando del atleta en tercera persona. El atleta no las ve.',
      '- `workouts` puede venir vacío si la indicación pide descanso.',
    ].join('\n'),
    monthly_review: [
      'Modo: monthly_review. Trabajas para el COACH HUMANO de este atleta: redactas un borrador de su revisión mensual; él la edita y decide si la publica.',
      'Los números ya vienen calculados (sin Strava). Úsalos tal cual: nunca inventes datos, sesiones ni causas que no se vean en ellos. Si algo no se puede saber con los datos, no lo afirmes.',
      '- `findings`: 3-6 hallazgos concretos, cada uno con al menos un número del mes y comparado con el mes anterior cuando exista. `tone`: good (va bien), warn (a cuidar), bad (importante, actuar ya). `title` corto con punto final; `body` de una o dos frases.',
      '- Referencias: progresión de CTL sana ≈ 1-7 puntos por semana; desacople < 5 % = buena base aeróbica; TSB entre −10 y −30 = construyendo, < −30 = fatiga alta; cumplimiento ≥ 85 % es muy bueno, < 70 % pide ajustar el plan.',
      '- `verdict`: on_track si el mes fue bueno, attention si hay 2 o más cosas a cuidar, off_track si hay algo importante (fatiga muy alta, mes casi sin entrenar).',
      '- `message`: borrador del mensaje AL ATLETA, de tú, cálido y directo, 2-3 párrafos cortos separados por una línea en blanco: qué salió bien, qué hay que mejorar y por qué importa. Sin saludo formal ni firma. Si `coachDraft` trae texto, respeta sus ideas y su tono y complétalo en vez de contradecirlo.',
      '- `goals`: 2-3 objetivos para el mes siguiente, concretos y medibles (`title`) con cómo se mide o por qué (`detail`). Respeta las lesiones del atleta.',
      '- Si `inProgress` es true, el mes no ha terminado: dilo con cuidado y no saques conclusiones de lo que falta.',
      '- Todo en español.',
    ].join('\n'),
  };
  // El contrato de Workout solo aplica a los modos que generan entrenamientos
  // — mandárselo a finished_training_eval_comment es tokens tirados, nunca
  // genera intervals.
  const contract = mode === 'finished_training_eval_comment' || mode === 'monthly_review' ? '' : `${WORKOUT_CONTRACT}\n\n`;
  return `${headers[mode]}\n\n${contract}Datos:\n${JSON.stringify(context, null, 2)}`;
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
): Promise<{ ok: true } | { ok: false; reason: string }> {
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
    if (plan) return { ok: false, reason: 'ya tienes un plan activo' };
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
    // Si el bloque actual ya se agotó, lo que toca es publish_block, no otra
    // weekly_eval — si no se revisa esto, weekly_eval seguiría generando
    // semanas hacia el siguiente bloque sin publicar (el mismo bug del
    // exhausted, solo que una llamada antes).
    if (plan.current_block_exhausted) {
      return { ok: false, reason: 'el bloque actual ya se agotó, toca publicar el siguiente bloque' };
    }
    // create_plan concretiza hasta 3 semanas de una vez (ver prompt.ts) —
    // mientras todavía queden semanas YA materializadas por delante que ni
    // siquiera han empezado, no hay nada real que evaluar ni un "siguiente"
    // que generar. Sin este chequeo, evaluar el día 1 de un plan nuevo
    // trataba semanas futuras sin un solo entrenamiento real como si fueran
    // adherencia perdida — encontrado probando este flujo justo así.
    const planDataForGate = plan.data as { startDate: string; weeks: { weekIndex: number }[] };
    const lastWeekEnd = weekEndDate(planDataForGate.startDate, planDataForGate.weeks.length - 1);
    const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    if (todayUtc <= lastWeekEnd) {
      return {
        ok: false,
        reason: `todavía tienes semanas armadas por delante (hasta el ${lastWeekEnd.toISOString().slice(0, 10)}) — vuelve cuando se acerque esa fecha`,
      };
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
  workouts: { name: string; description?: string; intervals: unknown[]; dayOfWeek: string }[],
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
      workouts: (output.workouts as { dayOfWeek: string }[]).filter((w) => open.has(w.dayOfWeek)),
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
      data: { startDate, blocks, weeks, startingPmc, maxSessionMinutes },
      current_block_exhausted: firstBlockExhausted,
    });
    if (error) throw new Error(`no se pudo guardar el plan: ${error.message}`);

    return { planId, coachNote: output.coachNote, weeks, sentToCoach: coachId !== null };
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
    // Hasta 2 evaluaciones por semana ISO (ver checkModeAllowed) — la
    // segunda es un "refresh" de la MISMA semana siguiente (el atleta
    // quiso agregar contexto que olvidó la primera vez), no una tercera
    // semana de golpe. isRefresh detecta esto comparando contra la semana
    // ISO ya guardada, mismo dato que ya validó el gate.
    const isRefresh = plan.last_eval_iso_week === currentIsoWeek();
    const nextWeekIndex = isRefresh ? planData.weeks.length - 1 : planData.weeks.length;

    if (isRefresh) {
      // Borra los workouts de la versión anterior de ESTA semana antes de
      // regenerarla — excepción sancionada al "nunca borrar datos": son
      // workouts futuros de una semana que por definición todavía no pasó
      // (se está regenerando la misma semana ISO), pero por si acaso se
      // verifica contra `sessions` igual que coach-retire-plan, nunca se
      // borra un workout que ya tenga una sesión real encima.
      const oldIds = planData.weeks[nextWeekIndex]?.workoutIds ?? [];
      if (oldIds.length > 0) {
        const { data: trained } = await admin.from('sessions').select('workout_id').in('workout_id', oldIds);
        const trainedIds = new Set((trained ?? []).map((s: { workout_id: string }) => s.workout_id));
        const toDelete = oldIds.filter((id: string) => !trainedIds.has(id));
        if (toDelete.length > 0) await admin.from('workouts').delete().eq('user_id', userId).in('id', toDelete);
      }
    }

    const weeklyEvalOccupiedDates = new Set((context.occupiedDates as string[] | undefined) ?? []);
    const ids = await materializeWeek(admin, userId, planData.startDate, nextWeekIndex, output.nextWeekWorkouts, weeklyEvalOccupiedDates, coachId);
    const weeks = isRefresh
      ? planData.weeks.map((w, i) => (i === nextWeekIndex ? { weekIndex: nextWeekIndex, workoutIds: ids } : w))
      : [...planData.weeks, { weekIndex: nextWeekIndex, workoutIds: ids }];

    const blockIdx = blockIndexForWeek(planData.blocks, nextWeekIndex);
    const weeksBeforeBlock = planData.blocks.slice(0, blockIdx).reduce((s, b) => s + b.weeks, 0);
    const blockExhausted = nextWeekIndex - weeksBeforeBlock + 1 >= planData.blocks[blockIdx].weeks;

    const { error } = await admin
      .from('training_plans')
      .update({
        // lastEvalNote: el reasoning se devuelve en la respuesta pero nunca
        // vivía en ningún lado después de eso — un reload (o solo volver
        // mañana) lo perdía por completo. Guardarlo acá hace que
        // planSummaryHtml lo pueda seguir mostrando después.
        data: { ...planData, weeks, lastEvalNote: output.reasoning },
        last_eval_iso_week: currentIsoWeek(),
        eval_count_this_iso_week: isRefresh ? (plan.eval_count_this_iso_week ?? 1) + 1 : 1,
        current_block_exhausted: blockExhausted,
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
    };
  }

  // publish_block
  const nextBlockIdx = planData.blocks.findIndex((b) => !b.published);
  if (nextBlockIdx === -1) throw new Error('no hay bloque siguiente por publicar');
  const weeksBeforeBlock = planData.blocks.slice(0, nextBlockIdx).reduce((s, b) => s + b.weeks, 0);

  // TODO: publish_block todavía no tiene UI ni occupiedDates en su schema
  // (ver PublishBlockInputContextSchema) — cuando se conecte, pasar el
  // mismo set real que create_plan/weekly_eval en vez de uno vacío.
  const publishBlockOccupiedDates = new Set<string>();
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
      data: { ...planData, blocks, weeks: [...planData.weeks, ...newWeeks] },
      current_block_exhausted: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id);
  if (error) throw new Error(`no se pudo actualizar el plan: ${error.message}`);

  return { blockName: output.blockName, coachNote: output.coachNote, weeks: newWeeks, sentToCoach: coachId !== null };
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
async function reserveUsage(admin: AdminClient, userId: string): Promise<string> {
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
  return period;
}

/** Corrige la reserva al número REAL de la llamada que sí terminó bien —
 * resta la reserva y suma lo que de verdad reportó la API. Si esto nunca se
 * llama (la función murió antes), la reserva de arriba se queda tal cual. */
async function reconcileUsage(admin: AdminClient, userId: string, period: string, usage: Anthropic.Usage): Promise<void> {
  const actualTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
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
