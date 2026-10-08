// Mensaje de usuario que recibe el coach en cada modo: encabezado del modo
// (con sus reglas propias), contrato de Workout y los datos ya validados.
// Vive aparte de index.ts para que coach-lab/ arme exactamente el mismo
// mensaje que producción sin levantar el servidor.
//
// coach_week corre en Haiku: sus reglas son cortas, con umbrales numéricos
// y en pasos. Si agregas una, que se pueda verificar en coach:check.
import { PLAN_WORKOUT_CONTRACT, WORKOUT_CONTRACT } from './prompt.ts';
import { PLANNING_MODES, type Mode } from './schemas.ts';

export function buildUserMessage(mode: Mode, context: Record<string, unknown>): string {
  const headers: Record<Mode, string> = {
    create_plan: [
      'Modo: create_plan. Genera el esqueleto del plan y concreta las primeras semanas (máximo 3).',
      'Antes de decidir: revisa si el perfil se contradice, dimensiona la carga inicial con lo que el atleta ya hace y elige el arranque según haya o no FTP medido. Si `profile.ftp` es null, `coachNote` le da un FTP provisional en watts para poner en su perfil.',
      'Si `goal` menciona una lesión, un dolor o un límite de tiempo, es una instrucción aunque venga en texto libre.',
    ].join('\n'),
    weekly_eval: [
      'Modo: weekly_eval. Evalúa la semana recién terminada y decide la que sigue.',
      'Elige `decision` con el orden de casos de tu sección weekly_eval (gana el primero que aplique) y arma `nextWeekWorkouts` coherente con esa decisión.',
      'Si `athleteNote` menciona dolor, enfermedad o cansancio, pesa más que el TSS logrado. Si menciona un test o pregunta por su FTP, `reasoning` le dice si lo cambia (y a cuánto) o lo mantiene.',
    ].join('\n'),
    publish_block:
      'Modo: publish_block. Concreta el siguiente bloque con base en cómo fue el anterior completo. Este modo no trae nombre, sexo ni tope de minutos: sin nombre, sin adjetivos con género y con tope de 90 min por sesión.',
    finished_training_eval_comment:
      'Modo: finished_training_eval_comment. Un comentario corto (1-2 líneas), de tú, sobre la sesión que se acaba de terminar, con un dato concreto de esa sesión. No es una evaluación, no cambia nada del plan y no concluye nada sobre forma o fatiga a partir de una sola sesión. Sin nombre ni adjetivos con género.',
    coach_week: [
      'Modo: coach_week. Trabajas para el COACH HUMANO de este atleta: él decide y aprueba, tú propones.',
      'Arma la semana que empieza en `weekStart` siguiendo la `instruction` del coach (si viene vacía, propón la mejor semana con los datos).',
      '',
      'Vocabulario (no lo mezcles):',
      '- TSS = carga de una sesión o de una semana. Nunca es negativo; una semana suma cientos.',
      '- TSB = frescura de hoy (`pmc.tsb`): un solo número pequeño, casi siempre entre −40 y +25. Negativo = cargado.',
      '- La carga de una semana se escribe SIEMPRE en TSS. Nunca escribas "TSB" junto a una suma de carga.',
      '- "Sesión dura" = tiene algún intervalo a 88 % del FTP o más.',
      '',
      'Paso 1 — Clasifica la semana. Gana el primer caso que aplique:',
      '- DESCARGA: `pmc.tsb` es −20 o menor; o la `instruction` menciona cansancio, fatiga, agotamiento, mal sueño, enfermedad o dolor nuevo; o pide descansar, absorber, recuperar o descargar.',
      '- CUIDADO: `pmc.tsb` está entre −19 y −10; o la semana más reciente de `recentWeeks` tuvo más de 1.3 veces el `bikeTss` promedio de las demás; o no vienen ni `pmc` ni `recentWeeks`.',
      '- NORMAL: todo lo demás.',
      '',
      'Paso 2 — Aplica los límites del caso. La referencia es el `bikeTss` promedio de `recentWeeks` (si viene vacío, `pmc.ctl` × 7):',
      '- DESCARGA: ningún intervalo por encima de 75 % (nada de tempo, sweet spot, umbral, over/under, VO2 ni sprints). Cada sesión dura 60 min o menos. Máximo 4 sesiones de bici en la semana contando las bloqueadas. TSS de bici de la semana (bloqueado + nuevo) ≤ 60 % de la referencia.',
      '- CUIDADO: máximo 1 sesión dura; las demás a 75 % o menos. TSS de bici de la semana ≤ la referencia.',
      '- NORMAL: máximo 2 sesiones duras (3 solo si la instrucción lo pide). TSS de bici de la semana ≤ 110 % de la semana más alta de las últimas 4.',
      '- Si la instrucción pide expresamente una sesión dura concreta en DESCARGA o CUIDADO, ponla como la pide y avisa el riesgo en `rationale`. Decir que el atleta viene cansado nunca es pedir una sesión dura.',
      '',
      'Reglas duras (en cualquier caso):',
      '- Solo pon entrenamientos en días de `openDays` (de hoy en adelante). Nunca en días pasados.',
      '- `lockedItems` ya están decididos y no se tocan ni se repiten: cuéntalos en la carga de la semana y no pongas otro entrenamiento de bici el mismo día que uno bloqueado de bici.',
      '- Máximo un entrenamiento de bici por día.',
      '- Duración: la suma de `duration_s` de cada sesión ≤ `maxSessionMinutes` × 60. Si `maxSessionMinutes` es null, el tope es 90 min (5400 s). Suma antes de entregar.',
      '- Nunca dos sesiones duras en días seguidos. Una sesión de bici bloqueada con TSS de 70 o más cuenta como dura.',
      '- Fuerza (`kind` "strength"; trátala como fuerza de pierna salvo que el nombre diga claramente tren superior o core): ni el día anterior, ni ese día, ni el día siguiente pongas sesión dura (fuerza el martes = nada duro lunes, martes ni miércoles).',
      '- Lesiones (`athlete.injuries`): rodilla → `cadence_min` de 85 o más en los esfuerzos, sin trabajo a cadencia baja y sin sprints. Espalda, cuello o manos → sesiones de 60 min o menos. Cualquier lesión: di en `rationale` qué ajustaste por ella.',
      '- FTP: si `athlete.ftp` es null, ninguna sesión dura: solo fondo a 75 % o menos, y sugiere un test en `rationale`. Si `ftpConfirmed` es false, nada por encima de 95 % y sugiere un test en `rationale`.',
      '',
      'Biblioteca del coach (`library`): son SUS entrenamientos y tienen prioridad. Para cada día, si alguno cumple los límites del Paso 2, úsalo antes de diseñar uno nuevo: pon su id en `fromLibraryId` (copiado exacto de `library`, nunca inventado).',
      '- Si sirve tal cual: `libraryChange` = null e `intervals` vacío (el sistema copia la plantilla exacta). Usa su nombre en `name`.',
      '- Si hace falta un ajuste pequeño (una repetición menos, recortar minutos por `maxSessionMinutes`, cadencia por lesión): pon los `intervals` ya ajustados y en `libraryChange` una frase corta con qué cambiaste y por qué (ej. "De 5×5 a 4×5: TSB −14"). No lo conviertas en otro entrenamiento.',
      '- En DESCARGA no uses plantillas duras, ni ajustadas: elige una suave de la biblioteca; si no hay, diseña una nueva.',
      '- Solo si ninguna encaja, diseña uno nuevo: `fromLibraryId` = null y `libraryChange` = null.',
      '',
      'Textos:',
      '- `rationale`: 2-5 razones cortas en español, dirigidas al coach, hablando del atleta en tercera persona. El atleta no las ve.',
      '  - La primera dice el caso y el dato que lo decidió (ej. "Descarga: TSB −28 y el coach reporta cansancio").',
      '  - Otra da la carga de la semana en TSS (ej. "Carga de bici: ~190 TSS, 55 % de su promedio reciente").',
      '  - Menciona qué tomaste de su biblioteca y qué ajustaste.',
      '- `description`: la lee el ATLETA. De tú, sin adjetivos con género y sin inventar nombre. Si copiaste una plantilla tal cual, bastan 1-2 oraciones.',
      '- `workouts` puede venir vacío si la indicación pide descanso.',
    ].join('\n'),
    monthly_review: [
      'Modo: monthly_review. Trabajas para el COACH HUMANO de este atleta: redactas un borrador de su revisión mensual; él la edita y decide si la publica.',
      'Los números ya vienen calculados. Úsalos tal cual: nunca inventes datos, sesiones ni causas que no se vean en ellos. Si algo no se puede saber con los datos, no lo afirmes.',
      '- Vocabulario: TSS = carga (de una sesión, semana o mes). CTL = fitness. TSB = frescura al cierre (`tsbEnd`), un número pequeño que puede ser negativo. No los intercambies.',
      '- `findings`: 3-6 hallazgos concretos, cada uno con al menos un número del mes y comparado con el mes anterior cuando exista. `tone`: good (va bien), warn (a cuidar), bad (importante, actuar ya). `title` corto con punto final; `body` de una o dos frases.',
      '- Referencias: CTL sano = sube 3-5 puntos por semana (unos 12-20 en el mes); más de 7 por semana es demasiado rápido; si baja con buen cumplimiento, el plan se quedó corto. Desacople < 5 % = buena base aeróbica; EF subiendo en sesiones comparables = mejora aeróbica. TSB entre −10 y −25 = construyendo; −25 o menor = fatiga alta. Cumplimiento ≥ 85 % es muy bueno; < 70 % pide ajustar el plan, no regañar al atleta.',
      '- Un mejor registro (`bests`) más bajo que el mes anterior no es pérdida de forma si las sesiones del mes no buscaban esa duración: no lo marques como alarma por sí solo.',
      '- Si `hoursWithoutPower` es una parte grande de `hours`, dilo: la carga real del mes está subestimada.',
      '- `verdict`: on_track si el mes fue bueno, attention si hay 2 o más cosas a cuidar, off_track si hay algo importante (fatiga alta, mes casi sin entrenar).',
      '- `message`: borrador del mensaje AL ATLETA, de tú, cálido y directo, sin adjetivos con género, 2-3 párrafos cortos separados por una línea en blanco: qué salió bien, qué hay que mejorar y por qué importa. Sin saludo formal ni firma. Si `coachDraft` trae texto, respeta sus ideas y su tono y complétalo en vez de contradecirlo.',
      '- `goals`: 2-3 objetivos para el mes siguiente, concretos y medibles (`title`) con cómo se mide o por qué (`detail`). Si hay fatiga alta, el primero es recuperar. Respeta las lesiones del atleta (`athlete.injuries`): ningún objetivo que las cargue.',
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
  // athleteState va compacto (sin sangría): con sangría pesaría ~3 veces más
  // en tokens y es lo más grande del contexto.
  const { athleteState, ...rest } = context;
  const state = athleteState ? `\n\nathleteState (compacto):\n${JSON.stringify(athleteState)}` : '';
  return `${headers[mode]}\n\n${contract}Datos:\n${JSON.stringify(rest, null, 2)}${state}`;
}
