// Chat con Piñón: todo lo que se puede contestar sin IA se contesta aquí,
// con los datos que la app ya tiene. Solo lo que no encaja en nada de esto
// va a la función pinon-chat (Haiku). Lógica pura: ni DOM ni red.
//
// Piñón solo opina: nunca cambia el plan. Si le piden un cambio, manda al
// ajuste semanal del coach de IA, o con coach humano, a hablarlo con él.
import type { WorkoutZone } from './workout-zone';

export type PinonIntent = 'today' | 'week' | 'form' | 'why' | 'tired' | 'cheer' | 'change';

/** Botones del chat, en este orden. ('change' no tiene botón: sale del texto). */
export const PINON_QUICK: readonly { intent: Exclude<PinonIntent, 'change'>; label: string }[] = [
  { intent: 'today', label: '¿Qué toca hoy?' },
  { intent: 'week', label: '¿Cómo voy esta semana?' },
  { intent: 'form', label: '¿Cómo está mi forma?' },
  { intent: 'why', label: '¿Para qué sirve el entreno de hoy?' },
  { intent: 'tired', label: 'Ando sin energía' }, // neutro: «cansado/a» da por hecho el género
  { intent: 'cheer', label: 'Dame ánimo' },
];

/** Lo más largo que se puede escribir. */
export const PINON_MAX_CHARS = 200;
/** Mensajes con IA al día (Joe y las cuentas sin topes no tienen). */
export const PINON_DAILY_AI_LIMIT = 10;

export interface PinonChatSession {
  date: string;
  name: string;
  minutes: number;
  tss: number | null;
  rpe: number | null;
  note: string | null;
}

/** Lo que Piñón sabe del atleta. Lo mismo va a la IA cuando hace falta
 * (sin Strava: ver core/session-source.ts). */
export interface PinonChatData {
  todayKey: string;
  humanCoach: boolean;
  hasPlan: boolean;
  ftp: number;
  today?: { name: string; minutes: number; zone: WorkoutZone | null; description: string | null; done: boolean };
  week: { done: number; planned: number };
  form?: { ctl: number; atl: number; tsb: number };
  recent: PinonChatSession[];
  /** Lo agendado de esta semana y la siguiente (lunes a domingo), hecho o no. */
  schedule: PinonScheduledDay[];
  daysSinceLastRide: number | null;
}

export interface PinonScheduledDay {
  date: string;
  name: string;
  minutes: number;
  zone: WorkoutZone | null;
  done: boolean;
}

export interface PinonReplyAction {
  label: string;
  href: string;
}
export interface PinonReply {
  text: string;
  action?: PinonReplyAction;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pedir un cambio al plan gana sobre todo lo demás: Piñón no cambia nada.
// Verbo (con «me/le/lo/la» pegado: «cámbiame», «súbele») + algo del plan.
const CHANGE_VERBS =
  '(mueve|mover|muevas|cambia|cambiar|cambies|quita|quitar|quites|borra|borrar|elimina|eliminar|agrega|agregar|anade|anadir|reprograma|reprogramar|ajusta|ajustar|modifica|modificar|recorre|recorrer|cancela|cancelar)';
// Estos solo con «me/le»: «¿qué pasa si…?» o «¿por qué sube mi pulso?» no piden cambios.
const CHANGE_ONLY_ENCLITIC = '(subeme|subele|bajame|bajale|ponme|ponle|pasame|pasale)';
const CHANGE_RE = new RegExp(
  `\\b(${CHANGE_VERBS}(me|le|lo|la|melo|mela|selo|sela)?|${CHANGE_ONLY_ENCLITIC})\\b.*\\b(entreno|entrenamiento|entrenamientos|plan|sesion|sesiones|dia|semana|workout|rodada|intervalos?|intensidad|ftp|zonas?)\\b`,
);
const RULES: [PinonIntent, RegExp][] = [
  ['tired', /\b(cansad[oa]|agotad[oa]|fundid[oa]|reventad[oa]|sin energia|piernas pesadas|no tengo ganas|desvelad[oa]|dormi mal|me siento mal|adolorid[oa])\b/],
  ['cheer', /\b(animo|animame|motivame|motivacion|echame porras|porras|dame fuerza)\b/],
  ['why', /\b(para que (sirve|es)|por que (toca|hago|este|esto)|de que sirve|que gano)\b/],
  ['today', /\b(que (me )?toca|toca hoy|que hago hoy|entreno de hoy|entrenamiento de hoy|hoy que)\b/],
  ['week', /\b(como voy|mi semana|esta semana|cuantos llevo|cuantas llevo|voy bien)\b/],
  ['form', /\b(mi forma|como estoy de forma|como ando de forma|fatiga|fitness|tsb|ctl|atl|estoy en forma)\b/],
];
// Si habla de otro día, las respuestas locales (que son de hoy y de esta
// semana) contestarían otra cosa: eso lo ve la IA con la agenda.
const OTHER_DAY_RE =
  /\b(manana|pasado|ayer|lunes|martes|miercoles|jueves|viernes|sabado|domingo|fin de semana|finde|semana que (entra|viene)|proxima semana|siguiente semana|semana pasada)\b/;
// «¿para qué sirve…?» solo es la del botón si habla del entreno, no de un concepto.
const WHY_ABOUT_TODAY_RE = /\b(hoy|esto|este|entreno|entrenamiento)\b/;
const CONCEPT_RE = /\b(ftp|zona|zonas|vo2|umbral|tempo|sweet spot|cadencia|rodillo|erg|rpe|pulso|potencia)\b/;
/** «Estoy cansado» solo si es corto: si trae un «por qué» o a su coach, que lo vea la IA. */
const TIRED_MAX = 45;

/** Reconoce preguntas comunes escritas a mano. Solo textos cortos: una
 * pregunta larga casi siempre trae algo más y la contesta la IA. Un pedido
 * de cambio se reconoce a cualquier largo. */
export function matchIntent(text: string): PinonIntent | null {
  const t = normalize(text);
  if (!t) return null;
  if (CHANGE_RE.test(t)) return 'change';
  if (t.length > 70 || OTHER_DAY_RE.test(t)) return null;
  for (const [intent, re] of RULES) {
    if (!re.test(t)) continue;
    if (intent === 'why' && (!WHY_ABOUT_TODAY_RE.test(t) || CONCEPT_RE.test(t))) continue;
    if (intent === 'tired' && (t.length > TIRED_MAX || /\b(coach|por que)\b/.test(t))) continue;
    return intent;
  }
  return null;
}

const ZONE_WHY: Record<WorkoutZone, string> = {
  fondo: 'construye tu base aeróbica: más horas aguantando sin quemarte',
  tempo: 'te acostumbra a sostener un ritmo firme mucho rato',
  'sweet spot': 'sube tu FTP con mucho estímulo y poca fatiga',
  umbral: 'empuja tu FTP: aprender a sostener justo en tu límite',
  VO2: 'sube tu techo: el motor para los cambios de ritmo y las subidas',
  test: 'mide dónde estás para que tus zonas sean las correctas',
};

const CHEERS = [
  'Cada pedalada cuenta, aunque hoy no se sienta. Tú solo súbete y yo cuento.',
  'Lo difícil es empezar. Los primeros 10 minutos y ya agarraste ritmo.',
  'Nadie se pone fuerte en un día, pero sí en muchos días como hoy.',
  'Las semanas aburridas y constantes son las que te ponen fuerte.',
] as const;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const PLAN: PinonReplyAction = { label: 'Ver mi plan', href: '#/plan' };
const RIDE: PinonReplyAction = { label: 'Empezar a rodar', href: '#/prepare' };
const FORM: PinonReplyAction = { label: 'Ver Forma', href: '#/form' };

/** Respuesta sin IA. `seed` rota las frases (p. ej. el día del año). */
export function localAnswer(intent: PinonIntent, d: PinonChatData, seed = 0): PinonReply {
  switch (intent) {
    case 'today': {
      if (d.today?.done) return { text: `Hoy ya rodaste ${d.today.name}. Bien hecho: ahora a recuperar y comer bien.` };
      if (d.today) return { text: `Hoy toca ${d.today.name}, ${d.today.minutes} min.${d.today.zone ? ` Es de ${d.today.zone}.` : ''}`, action: RIDE };
      if (!d.hasPlan && !d.humanCoach) return { text: 'Todavía no tienes plan. Si lo armamos, cada día te digo qué toca.', action: PLAN };
      return { text: 'Hoy no tienes nada agendado: toca descansar. Mañana rodamos con piernas frescas.' };
    }
    case 'week': {
      const { done, planned } = d.week;
      if (planned === 0) return { text: done > 0 ? `Llevas ${plural(done, 'rodada', 'rodadas')} esta semana. Vas bien.` : 'Esta semana no tienes nada agendado todavía.', action: PLAN };
      if (done >= planned) return { text: `Llevas ${done} de ${planned}: semana cerrada. Eso es constancia.` };
      const left = planned - done;
      return { text: `Llevas ${done} de ${planned}. ${left === 1 ? 'Una más y cierras la semana.' : `Te faltan ${left}; vas a tiempo.`}`, action: PLAN };
    }
    case 'form': {
      if (!d.form) return { text: 'Todavía no tengo suficientes rodadas para medir tu forma. Rueda unas cuantas y te cuento.' };
      const { ctl, tsb } = d.form;
      // con la base en casi 0 (nuevo, o mucho sin rodar) «fresco» no dice nada
      if (ctl < 5) return { text: 'Tu base todavía está muy baja, o hace rato que no ruedas. Con unas semanas constantes empieza a subir.', action: FORM };
      const how =
        tsb < -20
          ? 'Vienes cargado: el cansancio va por delante de tu base. Es normal en semanas duras; cuida el sueño.'
          : tsb < -5
            ? 'Estás entrenando en serio: algo de fatiga, justo lo que te hace mejorar.'
            : tsb <= 10
              ? 'Estás fresco y en equilibrio, buen momento para un entreno de calidad.'
              : 'Estás muy descansado. Si no viene una carrera, toca volver a cargar.';
      return { text: `Tu base (fitness) es ${Math.round(ctl)} y tu forma ${tsb > 0 ? '+' : ''}${Math.round(tsb)}. ${how}`, action: FORM };
    }
    case 'why': {
      if (!d.today) return { text: 'Hoy no hay entreno agendado. El descanso también entrena: ahí es donde el cuerpo se adapta.' };
      const why = d.today.zone ? ZONE_WHY[d.today.zone] : 'suma minutos a tu base';
      return { text: `${d.today.name}: ${why}.` };
    }
    case 'tired': {
      if (d.humanCoach) return { text: 'Escúchate. Cuéntale a tu coach cómo te sientes; con eso ajusta lo que sigue. Hoy, si ruedas, sin forzar.' };
      if (d.form && d.form.tsb < -20) return { text: 'Tus números dicen lo mismo: vienes cargado. Hoy algo muy suave o descansa, y anota tu RPE: el ajuste semanal lo toma en cuenta.' };
      return { text: 'Pasa. Si es solo flojera, los primeros 10 minutos lo arreglan. Si es cansancio de verdad, hoy suave y anota tu RPE al terminar.' };
    }
    case 'cheer': {
      const streak = d.week.done > 0 ? ` Ya llevas ${plural(d.week.done, 'rodada', 'rodadas')} esta semana.` : '';
      return { text: `${CHEERS[Math.abs(seed) % CHEERS.length]}${streak}` };
    }
    case 'change':
      return d.humanCoach
        ? { text: 'Yo no muevo tu plan: eso lo ve tu coach. Escríbele y cuéntale qué necesitas.' }
        : { text: 'Yo no muevo tu plan, solo te acompaño. Los cambios los hace el coach en el ajuste semanal, desde Plan.', action: PLAN };
  }
}

/** Llave de caché: la misma pregunta con los mismos datos el mismo día. */
export function pinonCacheKey(text: string, d: PinonChatData): string {
  const s = `${normalize(text)}|${JSON.stringify(d)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${d.todayKey}:${(h >>> 0).toString(36)}`;
}
