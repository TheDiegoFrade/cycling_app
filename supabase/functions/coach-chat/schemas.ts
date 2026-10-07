// v4, no v3: el helper zodOutputFormat del SDK de Anthropic espera el shape
// interno de Zod v4 (.def) — con v3 (._def) truena con "Cannot read
// properties of undefined (reading 'def')" al armar el output_config.
import { z } from 'npm:zod@4';

// Mismo shape que src/core/types.ts Interval/Workout — si ese archivo cambia,
// actualiza esto a mano (Deno no puede importar directo desde src/).
const IntervalSchema = z.object({
  name: z.string(),
  type: z.enum(['warmup', 'steady', 'interval', 'recovery', 'cooldown', 'free']),
  duration_s: z.number().int().positive(),
  power_pct: z.number().positive(),
  ramp_to_pct: z.number().positive().optional(),
  cadence_min: z.number().int().positive().optional(),
  cadence_max: z.number().int().positive().optional(),
});

const GeneratedWorkoutSchema = z.object({
  name: z.string(),
  // Ya no opcional — es lo único que el atleta lee antes de empezar (ver
  // "antes de empezar" y el detalle en Plan), tiene que traer siempre
  // objetivo + modo ERG recomendado + qué esperar (ver WORKOUT_CONTRACT).
  description: z.string(),
  intervals: z.array(IntervalSchema).min(1),
  targetTSS: z.number().nonnegative(),
  dayOfWeek: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
});

const PlanBlockOutlineSchema = z.object({
  name: z.string(), // ej. "Base 1"
  weeks: z.number().int().positive(),
  focus: z.string(), // descripción corta, 1-2 líneas
  targetHoursPerWeek: z.number().positive(),
});

// Forma esperada de `context` para create_plan — el cliente la arma antes de
// llamar. `recentHistory` ("¿hay datos registrados en Torq?") y
// `experienceLevel` ("¿qué tan nuevo es el atleta de verdad?") son dos ejes
// DISTINTOS — alguien puede no tener historial en Torq y aun así ser un
// ciclista experimentado que recién llega a la app. No colapsar los dos en
// uno solo, ver la regla de arranque en prompt.ts que usa ambos.
export const CreatePlanInputContextSchema = z.object({
  startDate: z.string(), // YYYY-MM-DD
  goal: z.string(),
  experienceLevel: z.enum(['new_to_cycling', 'returning_or_new_to_app', 'experienced']),
  // Eje DISTINTO de experienceLevel — condición cardiovascular general
  // (de cualquier actividad), independiente de qué tan nuevo sea en
  // ciclismo estructurado. Alguien puede ser "new_to_cycling" y
  // "active_other_sport" a la vez (activo en otra cosa, bici genuinamente
  // nueva) — ver la regla de calibración en prompt.ts que usa ambos ejes.
  generalFitnessLevel: z.enum(['sedentary', 'active_other_sport', 'active_cyclist']),
  discipline: z.enum(['mountain', 'road', 'gravel', 'other']), // para qué compite/monta, no el equipo — todos entrenan en smart trainer
  yearsRiding: z.number().nonnegative(),
  competes: z.boolean(),
  category: z.string().nullable(), // solo tiene sentido si competes=true
  availability: z.object({
    hoursPerWeek: z.number().positive(),
    days: z.array(z.string()),
    // null = sin tope explícito del atleta — igual aplica el techo general
    // de 90 min (ver "Disciplina de salida"). Si el atleta SÍ da un
    // número, este manda aunque sea más bajo que el general.
    maxSessionMinutes: z.number().positive().nullable(),
  }),
  // Fechas (YYYY-MM-DD) que YA tienen un workout agendado o una sesión
  // completada dentro de las próximas semanas — nunca generes un workout
  // para estas fechas, el atleta ya tiene algo ahí (evita duplicar un día
  // que ya se entrenó o que ya tenía algo agendado de antes).
  occupiedDates: z.array(z.string()),
  // ftp null = el atleta no sabe su FTP todavía (no inventar un default aquí
  // ni en el cliente — un número falso es peor que admitir que no se sabe).
  profile: z.object({
    ftp: z.number().positive().nullable(),
    hr_max: z.number().positive(),
    // null = no dijo/prefiere no decir — en ese caso nunca uses lenguaje
    // con género gramatical (ver "Disciplina de salida").
    sex: z.enum(['M', 'F', 'other']).nullable(),
    // null = no lo puso en Perfil — en ese caso no inventes un nombre ni
    // uses genéricos como "atleta" en su lugar, simplemente no te dirijas
    // a nadie por nombre (ver "Disciplina de salida").
    name: z.string().nullable(),
  }),
  recentHistory: z
    .object({
      weeksOfData: z.number().int().nonnegative(), // cuántas semanas atrás hay sesiones reales EN TORQ
      avgHoursPerWeekLast4: z.number().nonnegative(),
      ctl: z.number().nonnegative().optional(), // PMC actual, si ya existe
      atl: z.number().nonnegative().optional(),
      tsb: z.number().optional(),
    })
    .nullable(), // null = sin historial registrado en Torq (no implica que sea principiante)
});

export const CreatePlanOutputSchema = z.object({
  planName: z.string(),
  blocks: z.array(PlanBlockOutlineSchema).min(1), // esqueleto completo del plan
  firstBlockWeeks: z
    .array(
      z.object({
        weekIndex: z.number().int().nonnegative(),
        workouts: z.array(GeneratedWorkoutSchema).min(1),
      }),
    )
    .min(1)
    // Tope duro, no solo sugerencia de prompt: como mucho 3 semanas (21
    // días) concretadas con workouts reales aunque la fase de base dure
    // más — el resto lo llena weekly_eval semana a semana (ver prompt.ts).
    // Sin este máximo, un bloque largo (sedentary, 5-6 semanas) genera
    // 3-6x más JSON del necesario en una sola llamada.
    .max(3),
  coachNote: z.string(), // 3-5 líneas, voz del coach explicando el plan
});

// Forma esperada de `context` para weekly_eval. `pmcTrend` y
// `recentGapPattern` vienen del historial COMPLETO del atleta, no solo de
// las semanas que lleva este plan — una evaluación semanal que solo ve lo
// que el plan mismo generó pierde justo la tendencia de fondo (CTL/ATL/TSB,
// huecos recurrentes) que la jerarquía de evidencia del prompt necesita
// para no repetir el error de leer una semana aislada fuera de contexto.
export const WeeklyEvalInputContextSchema = z.object({
  // Mismos campos que create_plan y por la misma razón — generar la
  // semana siguiente necesita el mismo tope de duración y el mismo
  // cuidado de género gramatical que la primera vez, y evitar fechas que
  // ya tengan algo agendado/completado.
  profile: z.object({ sex: z.enum(['M', 'F', 'other']).nullable(), name: z.string().nullable() }),
  maxSessionMinutes: z.number().positive().nullable(),
  occupiedDates: z.array(z.string()),
  weekJustFinished: z.object({
    plannedTSS: z.number().nonnegative(),
    actualTSS: z.number().nonnegative(),
    completedWorkouts: z.number().int().nonnegative(),
    missedWorkouts: z.number().int().nonnegative(),
    ruleTriggers: z.array(z.object({ ruleId: z.string(), count: z.number().int().nonnegative() })),
    athleteNote: z.string().nullable(),
  }),
  pmcTrend: z.object({
    ctl: z.number().nonnegative(),
    atl: z.number().nonnegative(),
    tsb: z.number(),
    ctlRampLast4Weeks: z.number(), // historial real completo, no solo lo del plan
  }),
  recentGapPattern: z.array(z.object({ startDate: z.string(), endDate: z.string(), days: z.number().int() })).nullable(),
  // Desglose semana-por-semana de TODAS las semanas de ESTE plan ya
  // materializadas (no solo la última) — pmcTrend da la tendencia
  // comprimida, esto da la trayectoria real planeado-vs-logrado semana a
  // semana, para que la decisión no se base solo en un número agregado.
  // null si esta es la primera semana evaluada (nada antes que resumir).
  recentWeeksSummary: z
    .array(
      z.object({
        weekIndex: z.number().int().nonnegative(),
        plannedTSS: z.number().nonnegative(),
        actualTSS: z.number().nonnegative(),
        completedWorkouts: z.number().int().nonnegative(),
        missedWorkouts: z.number().int().nonnegative(),
      }),
    )
    .nullable(),
});

export const WeeklyEvalOutputSchema = z.object({
  decision: z.enum(['progress', 'maintain', 'reduce', 'insert_recovery']),
  reasoning: z.string(), // 3-5 líneas citando qué señal pesó más y por qué
  contradictionFlag: z.string().nullable(), // si hubo señales contradictorias, explícalo aquí; si no, null
  recurringPatternFlag: z.string().nullable(), // si detectaste un patrón recurrente, pregunta concreta aquí; si no, null
  nextWeekWorkouts: z.array(GeneratedWorkoutSchema).min(1),
});

// Forma esperada de `context` para publish_block — resumen del BLOQUE
// anterior completo (no solo su última semana), más la tendencia de fondo.
export const PublishBlockInputContextSchema = z.object({
  previousBlockSummary: z.object({
    weeks: z.number().int().positive(),
    plannedTSS: z.number().nonnegative(),
    actualTSS: z.number().nonnegative(),
    completedWorkouts: z.number().int().nonnegative(),
    missedWorkouts: z.number().int().nonnegative(),
  }),
  pmcTrend: z.object({ ctl: z.number().nonnegative(), atl: z.number().nonnegative(), tsb: z.number() }),
});

export const PublishBlockOutputSchema = z.object({
  blockName: z.string(),
  coachNote: z.string(),
  weeks: z
    .array(
      z.object({
        weekIndex: z.number().int().nonnegative(),
        workouts: z.array(GeneratedWorkoutSchema).min(1),
      }),
    )
    .min(1),
});

// Comentario corto post-sesión — deliberadamente el modo más barato y más
// acotado de los cuatro: no decide nada del plan, no re-evalúa nada, solo
// reacciona a ESTA sesión en la voz del coach. Sin caja de respuesta, sin
// historial — un solo texto corto, se guarda en sessions.coach_comment y
// se acabó (ver checkModeAllowed en index.ts: no se puede pedir dos veces
// para la misma sesión).
export const FinishedTrainingEvalCommentSchema = z.object({
  comment: z.string(), // 1-2 líneas, nunca más
});

export const FinishedTrainingEvalCommentInputContextSchema = z.object({
  sessionId: z.string(),
  session: z.object({
    workoutName: z.string(),
    durationMin: z.number().positive(),
    tss: z.number().nonnegative().nullable(),
    avgPower: z.number().nonnegative().nullable(),
    normalizedPower: z.number().nonnegative().nullable(),
    ruleTriggers: z.array(z.object({ ruleId: z.string(), count: z.number().int().nonnegative() })),
  }),
});

// Vista del coach, paso 6b: el COACH humano le pide a la IA que reacomode
// la semana de uno de sus atletas. Solo días de hoy en adelante
// (openDays); lo pasado, lo que el coach editó a mano y las rutinas de
// fuerza/movilidad llegan como lockedItems y no se tocan. El cliente arma
// todo con lo que el coach PUEDE leer (RLS ya quitó lo de Strava); la
// función no escribe nada, solo regresa la propuesta.
const DayOfWeekSchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const CoachWeekInputContextSchema = z.object({
  athleteId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // lunes
  instruction: z.string().max(1000),
  openDays: z.array(DayOfWeekSchema).min(1),
  lockedItems: z
    .array(
      z.object({
        dayOfWeek: DayOfWeekSchema,
        name: z.string(),
        kind: z.enum(['bike', 'strength', 'mobility', 'flexibility']),
        minutes: z.number().nonnegative().nullable(),
        tss: z.number().nonnegative().nullable(),
        reason: z.enum(['past', 'coach_edit', 'routine']),
      }),
    )
    .max(40),
  athlete: z.object({
    name: z.string().nullable(),
    ftp: z.number().positive().nullable(),
    ftpConfirmed: z.boolean().nullable(),
    discipline: z.string().nullable(),
    injuries: z.string().nullable(),
    goal: z.string().nullable(),
  }),
  pmc: z.object({ ctl: z.number(), atl: z.number(), tsb: z.number() }).nullable(),
  recentWeeks: z
    .array(z.object({ weekStart: z.string(), bikeTss: z.number().nonnegative(), nonBikeSessions: z.number().int().nonnegative() }))
    .max(12),
  maxSessionMinutes: z.number().positive().nullable(),
});

export const CoachWeekOutputSchema = z.object({
  // 2-5 razones cortas, dirigidas al coach (el atleta no las ve)
  rationale: z.array(z.string()).min(1).max(6),
  // puede venir vacío si la indicación pide descanso
  workouts: z.array(GeneratedWorkoutSchema),
});

// Revisión mensual (vista del coach, paso 7b). El cliente manda los números
// YA calculados del reporte (src/core/monthly-report.ts, sin Strava) — nunca
// sesiones crudas. La IA solo redacta; nada se guarda hasta que el coach lo
// edita y publica.
const ToneSchema = z.enum(['good', 'warn', 'bad']);
const num = z.number().finite();
const numOrNull = num.nullable();

export const MonthlyReviewInputContextSchema = z.object({
  athleteId: z.string().uuid(),
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  inProgress: z.boolean(),
  athlete: z.object({
    name: z.string().nullable(),
    ftp: num.positive().nullable(),
    weightKg: num.positive().nullable(),
    discipline: z.string().nullable(),
    injuries: z.string().nullable(),
    goal: z.string().nullable(),
  }),
  kpis: z.object({
    hours: num,
    hoursPrev: num,
    tss: num,
    tssPrev: num,
    plannedCount: num,
    doneCount: num,
    compliancePct: numOrNull,
    compliancePrevPct: numOrNull,
    ctlStart: num,
    ctlEnd: num,
    ftp: numOrNull,
    ftpPrev: numOrNull,
    tsbEnd: num,
  }),
  weeks: z.array(z.object({ label: z.string(), plannedTss: num, doneTss: num })).max(6),
  bests: z.array(z.object({ label: z.string(), month: numOrNull, prev: numOrNull, best90: numOrNull })).max(3),
  intensityHours: z.record(z.string(), num),
  hoursWithoutPower: num,
  aerobic: z.array(z.object({ label: z.string(), decouplingPct: numOrNull, ef: numOrNull })).max(6),
  routines: z.array(z.object({ kind: z.string(), planned: num, done: num })).max(3),
  srpeTotal: num,
  keySessions: z
    .array(z.object({ date: z.string(), name: z.string().max(120), minutes: num, np: numOrNull, intensityFactor: numOrNull, tss: numOrNull, rpe: numOrNull, note: z.string().max(200) }))
    .max(5),
  missedDays: z.number().int().nonnegative(),
  partialDays: z.number().int().nonnegative(),
  // Lo que el coach ya escribió (si algo): la IA lo respeta y lo complementa.
  coachDraft: z.string().max(4000),
});

export const MonthlyReviewOutputSchema = z.object({
  verdict: z.enum(['on_track', 'attention', 'off_track']),
  // 3-6 hallazgos concretos, cada uno con números del mes
  findings: z.array(z.object({ tone: ToneSchema, title: z.string().max(140), body: z.string().max(600) })).min(1).max(6),
  // borrador del mensaje al atleta (2-3 párrafos cortos, de tú)
  message: z.string().max(3000),
  // 2-3 objetivos medibles para el mes siguiente
  goals: z.array(z.object({ title: z.string().max(140), detail: z.string().max(400) })).max(3),
});

export type Mode = 'create_plan' | 'weekly_eval' | 'publish_block' | 'finished_training_eval_comment' | 'coach_week' | 'monthly_review';

export function schemaForMode(mode: Mode) {
  switch (mode) {
    case 'create_plan':
      return CreatePlanOutputSchema;
    case 'weekly_eval':
      return WeeklyEvalOutputSchema;
    case 'publish_block':
      return PublishBlockOutputSchema;
    case 'finished_training_eval_comment':
      return FinishedTrainingEvalCommentSchema;
    case 'coach_week':
      return CoachWeekOutputSchema;
    case 'monthly_review':
      return MonthlyReviewOutputSchema;
  }
}

export function inputContextSchemaForMode(mode: Mode) {
  switch (mode) {
    case 'create_plan':
      return CreatePlanInputContextSchema;
    case 'weekly_eval':
      return WeeklyEvalInputContextSchema;
    case 'publish_block':
      return PublishBlockInputContextSchema;
    case 'finished_training_eval_comment':
      return FinishedTrainingEvalCommentInputContextSchema;
    case 'coach_week':
      return CoachWeekInputContextSchema;
    case 'monthly_review':
      return MonthlyReviewInputContextSchema;
  }
}
