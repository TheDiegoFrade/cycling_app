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

// Lo que decide el coach (Sonnet) en create_plan / weekly_eval /
// publish_block: la serie en forma compacta (`repeat`) y una intención para
// el redactor. Los intervalos los desenrolla expand.ts y la `description`
// la escribe Haiku después (ver finishPlannedWorkouts en index.ts) — así la
// salida del coach es corta y no se pasa del tiempo límite.
const SegmentSchema = z.object({
  repeat: z.number().int().min(1).max(30),
  steps: z.array(IntervalSchema).min(1).max(8),
});

const PlannedWorkoutSchema = z.object({
  name: z.string(),
  dayOfWeek: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  targetTSS: z.number().nonnegative(),
  // on: potencia fija, el rodillo manda · off: por sensación o esfuerzo
  // autodosificado · mixed: ERG solo en algunos bloques
  erg: z.enum(['on', 'off', 'mixed']),
  // 1-3 frases para el redactor: objetivo, cómo abordarlo, tip de pacing y
  // qué sensación esperar. Si el redactor falla, esto es lo que ve el atleta.
  intent: z.string(),
  segments: z.array(SegmentSchema).min(1),
  // "test" en un workout de test (rampa o 20 min): la app lo reconoce para
  // leer el resultado (lastTest) sin adivinar por el nombre.
  kind: z.enum(['test']).nullable(),
});

/** Lo que devuelve el redactor (Haiku): una descripción por workout, en el
 * mismo orden en que se le mandaron. */
export const WorkoutDescriptionsSchema = z.object({
  descriptions: z.array(z.object({ index: z.number().int().nonnegative(), description: z.string() })),
});

/** Modos donde el coach decide y planifica (Sonnet + redactor). */
export const PLANNING_MODES = new Set<Mode>(['create_plan', 'weekly_eval', 'publish_block']);

const PlanBlockOutlineSchema = z.object({
  name: z.string(), // ej. "Base 1"
  weeks: z.number().int().positive(),
  focus: z.string(), // descripción corta, 1-2 líneas
  targetHoursPerWeek: z.number().positive(),
});

// FTP, lesiones, peso y edad del perfil (ver src/core/coach-profile.ts).
// Opcionales: la app los manda siempre, pero un context sin ellos (versión
// vieja de la app, escenarios de coach-lab) sigue siendo válido.
const FtpSourceSchema = z.enum(['default', 'provisional', 'manual', 'test_ramp', 'test_20min']);
const ProfileExtrasSchema = {
  // número sobre el que corre el rodillo cuando es un provisional; null si no
  provisionalFtp: z.number().positive().nullable().optional(),
  ftpSource: FtpSourceSchema.optional(),
  ftpUpdatedAt: z.string().nullable().optional(), // ISO
  injuries: z.string().max(1000).nullable().optional(),
  // Fuera de rango (300 kg, 0 años) = dato mal capturado: llega como null
  // ("no lo sé") en vez de como verdad; el Perfil ya no deja guardarlo.
  weightKg: z.number().nullable().optional().transform((v) => (v == null ? v : v >= 30 && v <= 200 ? v : null)),
  ageYears: z.number().int().nullable().optional().transform((v) => (v == null ? v : v >= 8 && v <= 100 ? v : null)),
};

// Próximo test que el coach decide (no hay fecha fija: él juzga cuándo el
// atleta está listo y lo revisa cada semana). Se guarda en el plan y vuelve
// en `plan.nextTest`. weekIndex = semana del plan (0 = la de arranque).
const NextTestSchema = z
  .object({
    weekIndex: z.number().int().nonnegative(),
    type: z.enum(['ramp', 'test20']),
    reason: z.string(), // una frase: por qué en esa semana
  })
  .nullable();

// Contexto del plan guardado para weekly_eval y publish_block (ver
// src/core/plan-context.ts): sin esto generaban la semana sin saber los días
// del atleta, su objetivo ni en qué bloque va.
const PlanContextSchema = z.object({
  goal: z.string(),
  discipline: z.string().nullable(),
  experienceLevel: z.string().nullable(),
  generalFitnessLevel: z.string().nullable(),
  days: z.array(z.string()),
  hoursPerWeek: z.number().positive().nullable(),
  currentBlock: z.object({ name: z.string(), focus: z.string(), weeks: z.number().int().nonnegative(), weekInBlock: z.number().int().positive() }),
  nextBlock: z.object({ name: z.string(), focus: z.string(), weeks: z.number().int().positive(), targetHoursPerWeek: z.number().positive().nullable() }).nullable(),
  nextTest: NextTestSchema,
});

// Cómo salió el test más reciente (ver src/core/test-reading.ts). El modelo
// no ve samples: decide con esto si el test midió un máximo.
const LastTestSchema = z
  .object({
    date: z.string(),
    type: z.enum(['ramp', 'test20', 'other']),
    ergFixed: z.boolean(),
    blockMinutes: z.number().nonnegative(),
    avgPowerW: z.number().nonnegative(),
    best1MinW: z.number().nonnegative(),
    powerFadePct: z.number().nullable(),
    hrStart: z.number().nullable(),
    hrEnd: z.number().nullable(),
    hrSlopeBpmPerMin: z.number().nullable(),
    hrHalvesDeltaPct: z.number().nullable(),
    hrEndPctOfMax: z.number().nullable(),
    cadenceDeltaRpm: z.number().nullable(),
    completed: z.boolean(),
    ftpInUseW: z.number().positive(),
  })
  .nullable()
  .optional();

// Ficha del atleta por ventanas (ver src/engine/athlete-state.ts). Se valida
// por encima: la arma el código, no el usuario, y va compacta al modelo.
const PeakTupleSchema = z.tuple([z.number().nullable(), z.string().nullable(), z.enum(['max_effort', 'erg_fixed', 'incidental', 'untested'])]);
const WindowStateSchema = z.object({
  hours: z.number(),
  tss: z.number(),
  kJ: z.number().nullable(),
  sessions: z.number().int(),
  compliancePct: z.number().nullable(),
  zoneHours: z.array(z.number()).length(6).nullable(),
  aerobic: z.object({ decouplingPct: z.number(), ef: z.number(), n: z.number().int() }).nullable(),
  threshold: z.object({ longestMin: z.number(), weeklyMin: z.number() }).nullable(),
  lowCadenceMinPerWeek: z.number().nullable(),
  peaks: z.record(z.string(), PeakTupleSchema).optional(),
  cp: z.object({ cpW: z.number(), wPrimeKJ: z.number(), from: z.array(z.string()) }).nullable().optional(),
});
const AthleteStateSchema = z
  .object({
    historyWeeks: z.number().int().nonnegative(),
    lastGap: z.object({ days: z.number().int(), endedOn: z.string() }).nullable(),
    windows: z.object({ d7: WindowStateSchema, d28: WindowStateSchema, d90: WindowStateSchema, d180: WindowStateSchema }),
  })
  .optional();

// Forma esperada de `context` para create_plan — el cliente la arma antes de
// llamar. `recentHistory` ("¿hay datos registrados en Torq?") y
// `experienceLevel` ("¿qué tan nuevo es el atleta de verdad?") son dos ejes
// DISTINTOS — alguien puede no tener historial en Torq y aun así ser un
// ciclista experimentado que recién llega a la app. No colapsar los dos en
// uno solo, ver la regla de arranque en prompt.ts que usa ambos.
export const CreatePlanInputContextSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  goal: z.string().trim().min(3, 'escribe para qué entrenas'),
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
    hoursPerWeek: z.number().min(1, 'al menos 1 hora por semana').max(20, 'el máximo son 20 horas por semana'),
    days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1, 'elige al menos un día'),
    // null = sin tope explícito del atleta — igual aplica el techo general
    // de 90 min (ver "Disciplina de salida"). Si el atleta SÍ da un
    // número, este manda aunque sea más bajo que el general.
    maxSessionMinutes: z.number().min(20).max(360).nullable(),
  }),
  // Fechas (YYYY-MM-DD) que YA tienen un workout agendado o una sesión
  // completada dentro de las próximas semanas — nunca generes un workout
  // para estas fechas, el atleta ya tiene algo ahí (evita duplicar un día
  // que ya se entrenó o que ya tenía algo agendado de antes).
  occupiedDates: z.array(z.string()),
  // ftp null = el atleta no sabe su FTP todavía (no inventar un default aquí
  // ni en el cliente — un número falso es peor que admitir que no se sabe).
  profile: z.object({
    ftp: z.number().min(50).max(600).nullable(),
    // null = el atleta marcó "no sé mi pulso máximo": antes llegaba el 185
    // por defecto del perfil como si fuera un dato real (a cualquier edad).
    hr_max: z.number().min(120).max(230).nullable(),
    // null = no dijo/prefiere no decir — en ese caso nunca uses lenguaje
    // con género gramatical (ver "Disciplina de salida").
    sex: z.enum(['M', 'F', 'other']).nullable(),
    // null = no lo puso en Perfil — en ese caso no inventes un nombre ni
    // uses genéricos como "atleta" en su lugar, simplemente no te dirijas
    // a nadie por nombre (ver "Disciplina de salida").
    name: z.string().nullable(),
    ...ProfileExtrasSchema,
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
  lastTest: LastTestSchema,
  athleteState: AthleteStateSchema,
});

export const CreatePlanOutputSchema = z.object({
  planName: z.string(),
  blocks: z.array(PlanBlockOutlineSchema).min(1), // esqueleto completo del plan
  firstBlockWeeks: z
    .array(
      z.object({
        weekIndex: z.number().int().nonnegative(),
        workouts: z.array(PlannedWorkoutSchema).min(1),
      }),
    )
    // Como mucho 3 semanas concretadas (el resto lo llena weekly_eval): lo
    // pide el prompt y lo recorta la guardia (MAX_CONCRETE_WEEKS en
    // guard.ts). No va como .max(3) aquí: si el modelo devolvía 4, la
    // validación del SDK tronaba con un 400 en inglés y sin plan.
    .min(1),
  coachNote: z.string(), // 3-5 líneas, voz del coach explicando el plan
  // FTP que el coach le propone poner en su perfil (provisional o tras un
  // test); null si no hay cambio. La app ofrece un botón, el atleta decide.
  suggestedFtp: z.number().positive().nullable(),
  nextTest: NextTestSchema,
  // Correo de bienvenida del plan, con PDF (ver report-email.ts y plan-pdf.ts).
  report: z.object({
    welcome: z.string(),
    why: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
    closing: z.string(),
  }),
});

// Sesión que el atleta quitó del plan (supabase/functions/plan-remove-workout).
const RemovedReasonSchema = z.enum(['time', 'fatigue', 'pain', 'other']);
const RemovedWorkoutSchema = z.object({
  name: z.string().max(120),
  date: z.string().nullable(),
  plannedTSS: z.number().nonnegative().nullable(),
  reason: RemovedReasonSchema,
  note: z.string().max(200).nullable(),
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
  profile: z.object({
    sex: z.enum(['M', 'F', 'other']).nullable(),
    name: z.string().nullable(),
    // FTP medido (null si es el default o un provisional)
    ftp: z.number().positive().nullable().optional(),
    ...ProfileExtrasSchema,
  }),
  maxSessionMinutes: z.number().positive().nullable(),
  occupiedDates: z.array(z.string()),
  plan: PlanContextSchema.optional(),
  nextWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // lunes de la semana que se va a generar
  lastTest: LastTestSchema,
  athleteState: AthleteStateSchema,
  weekJustFinished: z.object({
    // Sesiones que el atleta quitó del plan esa semana, con su motivo
    // (plan-remove-workout): ya no cuentan en plannedTSS ni como faltas.
    removedWorkouts: z.array(RemovedWorkoutSchema).max(14).optional(),
    plannedTSS: z.number().nonnegative(),
    actualTSS: z.number().nonnegative(),
    completedWorkouts: z.number().int().nonnegative(),
    missedWorkouts: z.number().int().nonnegative(),
    ruleTriggers: z.array(z.object({ ruleId: z.string(), count: z.number().int().nonnegative() })),
    athleteNote: z.string().nullable(),
    // Cada sesión planeada de esa semana y qué pasó en ella (ver
    // src/core/workout-zone.ts). Desbloquea sRPE, deriva y EF por sesión.
    workouts: z
      .array(
        z.object({
          dayOfWeek: z.string(),
          name: z.string(),
          zone: z.enum(['fondo', 'tempo', 'sweet spot', 'umbral', 'VO2', 'test']),
          plannedTSS: z.number().nonnegative(),
          actualTSS: z.number().nonnegative().nullable(),
          completed: z.boolean(),
          rpe: z.number().nullable(),
          hrDriftPct: z.number().nullable(),
          efficiencyFactor: z.number().nullable(),
          ruleTriggers: z.array(z.object({ ruleId: z.string(), count: z.number().int().nonnegative() })),
        }),
      )
      .max(14)
      .optional(),
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
  // Quitadas en las semanas anteriores del plan (solo motivo), para ver si se repite.
  removedBefore: z.array(z.object({ weeksAgo: z.number().int().positive(), reason: RemovedReasonSchema })).max(40).optional(),
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
  nextWeekWorkouts: z.array(PlannedWorkoutSchema).min(1),
  // "change": debe cambiar su FTP a suggestedFtp · "keep": mantenerlo (tras
  // un test, o si preguntó) · null: el FTP no viene al caso esta semana.
  ftpAction: z.enum(['keep', 'change']).nullable(),
  suggestedFtp: z.number().positive().nullable(),
  nextTest: NextTestSchema,
  // Texto COMPLETO nuevo del expediente, solo si el context trae notesDue
  // true; si no, null. Ver "Expediente del atleta" en prompt.ts.
  notesUpdate: z.string().max(1200).nullable(),
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
  // Mismo contexto que weekly_eval (ver arriba).
  profile: z
    .object({ sex: z.enum(['M', 'F', 'other']).nullable(), name: z.string().nullable(), ftp: z.number().positive().nullable().optional(), ...ProfileExtrasSchema })
    .optional(),
  maxSessionMinutes: z.number().positive().nullable().optional(),
  occupiedDates: z.array(z.string()).optional(),
  plan: PlanContextSchema.optional(),
  nextWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // lunes de la primera semana del bloque
  athleteState: AthleteStateSchema,
});

export const PublishBlockOutputSchema = z.object({
  blockName: z.string(),
  coachNote: z.string(),
  weeks: z
    .array(
      z.object({
        weekIndex: z.number().int().nonnegative(),
        workouts: z.array(PlannedWorkoutSchema).min(1),
      }),
    )
    .min(1),
  nextTest: NextTestSchema,
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
  // Plantillas de bici de la biblioteca del coach: tienen prioridad al armar
  // la semana (ver el header de coach_week en index.ts).
  library: z
    .array(
      z.object({
        id: z.string().max(64),
        name: z.string().max(120),
        minutes: z.number().nonnegative(),
        tss: z.number().nonnegative().nullable(),
        structure: z.string().max(600),
      }),
    )
    .max(40)
    .optional(),
  athleteState: AthleteStateSchema,
});

// Un entrenamiento propuesto en coach_week. Si sale de la biblioteca del
// coach: `fromLibraryId` + `libraryChange` null (copia exacta: `intervals`
// puede venir vacío, la función copia los de la plantilla) o con el ajuste
// que hizo y por qué (entonces `intervals` trae la versión ajustada).
const CoachWeekWorkoutSchema = z.object({
  name: z.string(),
  description: z.string(),
  intervals: z.array(IntervalSchema),
  targetTSS: z.number().nonnegative(),
  dayOfWeek: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  fromLibraryId: z.string().nullable(),
  libraryChange: z.string().nullable(),
});

export const CoachWeekOutputSchema = z.object({
  // 2-5 razones cortas, dirigidas al coach (el atleta no las ve)
  rationale: z.array(z.string()).min(1).max(6),
  // puede venir vacío si la indicación pide descanso
  workouts: z.array(CoachWeekWorkoutSchema),
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
  // Propuesta de expediente para que el coach la apruebe (null si nada nuevo).
  notesUpdate: z.string().max(1200).nullable(),
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
