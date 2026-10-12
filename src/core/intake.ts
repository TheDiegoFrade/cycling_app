// Evaluación inicial de salud y hábitos (método de Joe Hernández, UR
// Training) y el «perfil de arranque» que sale de ella. El orden manda:
//   1. Salud: una condición crónica o un medicamento vuelven secundario el
//      objetivo (se le explica al atleta) y no hay esfuerzos máximos sin
//      que lo vea un médico.
//   2. Hábitos: fumar y el alcohol frecuente piden base aeróbica primero;
//      el estrés que dice el atleta se ajusta con lo demás (no se toma
//      literal); el sueño decide qué tan agresivo puede arrancar.
//   3. Experiencia: si nunca ha hecho un esfuerzo máximo o no sabe medir
//      su esfuerzo (RPE), no hay test máximo: rampa con RPE o, si tampoco,
//      sin test y por sensación, subiendo de a poco.
// Los umbrales están marcados (provisional): esperan la revisión de Joe.
// Lo calcula el servidor también (core.gen.js) para que el coach IA lo
// reciba decidido y la guardia lo haga cumplir.

export type ChronicCondition = 'hypertension' | 'diabetes' | 'asthma' | 'heart' | 'other';
export const CHRONIC_CONDITIONS: readonly ChronicCondition[] = ['hypertension', 'diabetes', 'asthma', 'heart', 'other'];
export const CHRONIC_CONDITION_LABELS: Record<ChronicCondition, string> = {
  hypertension: 'Presión alta',
  diabetes: 'Diabetes',
  asthma: 'Asma',
  heart: 'Del corazón',
  other: 'Otra',
};

export type Smoking = 'no' | 'occasional' | 'daily';
export type Alcohol = 'rarely' | 'weekly' | 'frequent';
export type Level3 = 'low' | 'medium' | 'high';
export type SleepQuality = 'good' | 'fair' | 'poor';
export type RpeLiteracy = 'yes' | 'somewhat' | 'no';

export interface HealthIntake {
  /** [] = ninguna. */
  conditions: ChronicCondition[];
  /** Cuál, si marcó «Otra» (texto corto). */
  conditionsOther?: string;
  takesMedication: boolean;
  medicationNote?: string;
  /** Lesión o cirugía importante en los últimos 2 años. Más vieja no
   * cuenta, salvo que deje molestia (eso va en Profile.injuries). */
  recentInjury: boolean;
  smoking: Smoking;
  /** rarely = nunca o rara vez · weekly = 1-2 veces por semana ·
   * frequent = 3 o más veces por semana. */
  alcohol: Alcohol;
  stress: Level3;
  sleepHours: number;
  sleepQuality: SleepQuality;
  /** Pulso en reposo; null = no lo sabe. */
  restingHr: number | null;
  rpeLiteracy: RpeLiteracy;
  /** ¿Ha hecho esfuerzos al máximo (carreras, tests, series a tope)? */
  maxEffortExperience: boolean;
}

/** Qué le falta a la evaluación; null si está completa. */
export function intakeError(i: HealthIntake | undefined): string | null {
  if (!i) return 'Contesta las preguntas de salud y hábitos.';
  if (i.conditions.includes('other') && !i.conditionsOther?.trim()) return 'Escribe cuál es la otra condición de salud.';
  if (!(i.sleepHours >= 3 && i.sleepHours <= 12)) return 'Escribe cuántas horas duermes en promedio (de 3 a 12).';
  if (i.restingHr !== null && !(i.restingHr >= 30 && i.restingHr <= 120)) return 'Escribe tu pulso en reposo (de 30 a 120) o marca que no lo sabes.';
  return null;
}

export type TestPlan = 'none' | 'ramp' | 'test20';

export interface StartingProfile {
  /** Hay condición de salud o medicamento: el objetivo pasa a segundo
   * plano, se le explica y se remite al médico. */
  healthFirst: boolean;
  /** ¿Puede hacer un esfuerzo máximo? */
  maxEffortReady: boolean;
  /** Por qué no (en palabras para el coach). Vacío si está listo. */
  notReadyReasons: string[];
  /** none = sin test, por sensación subiendo de a poco · ramp = rampa en
   * el rodillo · test20 = 20 min a máximo (sabe dosificarse). */
  testPlan: TestPlan;
  /** Base aeróbica antes de meter intensidad (fumar, alcohol frecuente). */
  baseFirst: boolean;
  /** conservative = arranca suave y poco polarizado (sueño corto o malo,
   * estrés alto ajustado). */
  start: 'conservative' | 'normal';
  /** Estrés ajustado (el que dice, subido por alcohol, sueño o tabaco). */
  stressAdjusted: Level3;
  /** No sabe usar RPE: hay que enseñárselo antes de pedírselo. */
  teachRpe: boolean;
}

/** (provisional) Menos de 6 h o mal sueño = arranque conservador. */
const SHORT_SLEEP_H = 6;

const bump = (l: Level3): Level3 => (l === 'low' ? 'medium' : 'high');

export function startingProfile(
  p: {
    intake?: HealthIntake;
    ageYears?: number | null;
    experienceLevel?: 'new_to_cycling' | 'returning_or_new_to_app' | 'experienced';
    generalFitnessLevel?: 'sedentary' | 'active_other_sport' | 'active_cyclist';
    structuredTrainingYears?: number;
  },
): StartingProfile {
  const i = p.intake;
  const healthFirst = !!i && (i.conditions.length > 0 || i.takesMedication);
  const reasons: string[] = [];
  if (i?.conditions.length) reasons.push('tiene una condición de salud: primero que lo vea su médico');
  else if (i?.takesMedication) reasons.push('toma medicamento de forma regular: primero que lo vea su médico');
  if (i?.recentInjury) reasons.push('lesión o cirugía en los últimos 2 años');
  if (typeof p.ageYears === 'number' && p.ageYears < 18) reasons.push('es menor de edad');
  if (p.generalFitnessLevel === 'sedentary') reasons.push('viene de estar sedentario');
  if (i?.rpeLiteracy === 'no') reasons.push('todavía no sabe medir su esfuerzo (RPE)');
  const maxEffortReady = reasons.length === 0;

  // Rampa para quien empieza o nunca ha dado un máximo; 20 min solo para
  // quien ya sabe dosificarse (experimentado, con esfuerzos máximos y RPE).
  const knowsHowToDose =
    !!i?.maxEffortExperience && i.rpeLiteracy === 'yes' && (p.experienceLevel === 'experienced' || (p.structuredTrainingYears ?? 0) >= 1);
  const testPlan: TestPlan = !maxEffortReady ? 'none' : knowsHowToDose ? 'test20' : 'ramp';

  // (provisional) Fumar (aunque sea ocasional) o alcohol semanal o más.
  const baseFirst = !!i && (i.smoking !== 'no' || i.alcohol !== 'rarely');

  let stress: Level3 = i?.stress ?? 'medium';
  if (i && i.alcohol !== 'rarely') stress = bump(stress); // Joe: con alcohol asume estrés alto
  if (i && (i.sleepHours < SHORT_SLEEP_H || i.sleepQuality === 'poor')) stress = bump(stress);
  if (i && i.alcohol === 'frequent') stress = 'high';
  const poorSleep = !!i && (i.sleepHours < SHORT_SLEEP_H || i.sleepQuality === 'poor');
  const start = poorSleep || stress === 'high' ? 'conservative' : 'normal';

  return {
    healthFirst,
    maxEffortReady,
    notReadyReasons: reasons,
    testPlan,
    baseFirst,
    start,
    stressAdjusted: stress,
    teachRpe: !!i && i.rpeLiteracy !== 'yes',
  };
}
