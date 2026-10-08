// Mensaje de usuario que recibe el coach en cada modo: encabezado del modo
// (con sus reglas propias), contrato de Workout y los datos ya validados.
// Vive aparte de index.ts para que coach-lab/ arme exactamente el mismo
// mensaje que producción sin levantar el servidor.
import { PLAN_WORKOUT_CONTRACT, WORKOUT_CONTRACT } from './prompt.ts';
import { PLANNING_MODES, type Mode } from './schemas.ts';

export function buildUserMessage(mode: Mode, context: Record<string, unknown>): string {
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
      '- Biblioteca del coach (`library`): son SUS entrenamientos y tienen prioridad. Para cada día, si alguno encaja con lo que la semana necesita, úsalo antes de diseñar uno nuevo: pon su id en `fromLibraryId`.',
      '  - Si sirve tal cual: `libraryChange` = null e `intervals` vacío (el sistema copia la plantilla exacta). Usa su nombre en `name`.',
      '  - Si hace falta ajustarlo (fatiga, lesión, `maxSessionMinutes`, la indicación del coach): pon los `intervals` ya ajustados y en `libraryChange` una frase corta con qué cambiaste y por qué (ej. "De 5×5 a 4×5: TSB muy negativo"). Ajusta lo mínimo; no lo conviertas en otro entrenamiento.',
      '  - Solo si ninguno encaja, diseña uno nuevo: `fromLibraryId` = null y `libraryChange` = null.',
      '  - En `rationale`, menciona qué tomaste de su biblioteca y qué ajustaste.',
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
  const contract =
    mode === 'finished_training_eval_comment' || mode === 'monthly_review'
      ? ''
      : PLANNING_MODES.has(mode)
        ? `${PLAN_WORKOUT_CONTRACT}\n\n`
        : `${WORKOUT_CONTRACT}\n\n`;
  return `${headers[mode]}\n\n${contract}Datos:\n${JSON.stringify(context, null, 2)}`;
}
