import type { Interval, Profile, Rule, RuleScope, Workout } from './types';

const CADENCE_FLOOR_REPEAT_S = 4;
const HR_CEILING_REPEAT_S = 20;
const ERG_DETACHED_TOLERANCE_S = 10;
const ERG_DETACHED_REPEAT_S = 30;
const ERG_DETACHED_THRESHOLD_PCT = 80;
const INTERVAL_LIMIT_TOLERANCE_S = 8;

/** Bloques (1-base) que NO traen su propio valor para `key` — el límite
 * global solo debe aplicar ahí; donde el bloque ya define el suyo, el global
 * se apaga solo para no competir con él (el bloque siempre gana). */
function scopeExcludingOwnOverride(intervals: readonly Interval[], key: keyof Interval): RuleScope {
  const withoutOwn = intervals.map((iv, i) => (iv[key] === undefined ? i + 1 : null)).filter((n): n is number => n !== null);
  if (withoutOwn.length === intervals.length) return 'all'; // ningún bloque lo define: igual que antes
  return { intervals: withoutOwn };
}

/** Reglas de fábrica (límites globales de perfil + ERG desenganchado): se
 * generan a partir del perfil y del workout (para saber en qué bloques ya
 * hay un límite propio y no duplicar/competir con la regla global ahí). */
export function buildFactoryRules(profile: Profile, workout: Pick<Workout, 'intervals'>): Rule[] {
  const intervals = workout.intervals;
  return [
    {
      id: 'factory-cadence-floor',
      // cadence_10s (promedio móvil) en vez de la lectura instantánea: la
      // cadencia cruda tiene ruido real del sensor (picos falsos tipo "40
      // rpm" con el pedaleo estable en 70) que disparaba esta regla decenas
      // de veces por sesión sin que la cadencia real hubiera bajado.
      when: { metric: 'cadence_10s', op: '<', value: profile.cadence_floor },
      scope: scopeExcludingOwnOverride(intervals, 'cadence_min'),
      tolerance_s: 0,
      repeat_s: CADENCE_FLOOR_REPEAT_S,
      level: 'adjust',
      message: `No bajes de ${profile.cadence_floor}`,
      detail: '{cadence_10s} rpm',
      sound: 'alarm_low',
    },
    {
      id: 'factory-hr-ceiling',
      when: { metric: 'hr', op: '>', value: profile.hr_ceiling },
      scope: scopeExcludingOwnOverride(intervals, 'hr_ceiling'),
      tolerance_s: 0,
      repeat_s: HR_CEILING_REPEAT_S,
      level: 'danger',
      message: 'Baja las pulsaciones',
      detail: '{hr} lpm',
      sound: 'alarm_desc',
    },
    {
      id: 'factory-hr-floor',
      when: { metric: 'hr', op: '<', value: profile.hr_min },
      scope: scopeExcludingOwnOverride(intervals, 'hr_min'),
      tolerance_s: 0,
      repeat_s: HR_CEILING_REPEAT_S,
      level: 'info',
      message: 'Sube el ritmo, tu pulso está bajo para este bloque',
      detail: '{hr} lpm',
      sound: 'chime',
    },
    {
      id: 'factory-cadence-ceiling',
      when: { metric: 'cadence_10s', op: '>', value: profile.cadence_max },
      scope: scopeExcludingOwnOverride(intervals, 'cadence_max'),
      tolerance_s: 0,
      repeat_s: CADENCE_FLOOR_REPEAT_S,
      level: 'adjust',
      message: 'Baja la cadencia',
      detail: '{cadence_10s} rpm',
      sound: 'alarm_low',
    },
    {
      id: 'factory-erg-detached',
      when: { metric: 'power_pct_target', op: '<', value: ERG_DETACHED_THRESHOLD_PCT },
      scope: 'all',
      tolerance_s: ERG_DETACHED_TOLERANCE_S,
      repeat_s: ERG_DETACHED_REPEAT_S,
      level: 'adjust',
      // ojo: esto es un síntoma (la potencia real quedó por debajo del
      // objetivo 10 s seguidos), no una desconexión confirmada del rodillo
      // — el mensaje no debe insinuar que el ERG "se desenganchó" cuando
      // puede ser simplemente que bajaste el ritmo.
      message: 'No estás llegando al objetivo, pedalea más rápido',
      detail: '{power_pct_target}% del objetivo',
      sound: 'alarm_low',
    },
  ];
}

/** Por cada bloque que trae su propio `cadence_min`/`cadence_max`/`hr_min`/
 * `hr_ceiling`, genera la regla correspondiente (tolerance 8 s, repeat null:
 * avisa una vez por bloque, no está pensada para insistir todo el rato). */
export function buildIntervalLimitRules(intervals: Interval[]): Rule[] {
  const rules: Rule[] = [];
  intervals.forEach((interval, i) => {
    const n = i + 1;
    if (interval.cadence_min !== undefined) {
      rules.push({
        id: `cadence-min-${n}`,
        when: { metric: 'cadence_10s', op: '<', value: interval.cadence_min },
        scope: { intervals: [n] },
        tolerance_s: INTERVAL_LIMIT_TOLERANCE_S,
        repeat_s: null,
        level: 'adjust',
        message: 'Sube la cadencia',
        detail: `{cadence_10s} rpm · mínimo ${interval.cadence_min}`,
        sound: 'alarm_low',
      });
    }
    if (interval.cadence_max !== undefined) {
      rules.push({
        id: `cadence-max-${n}`,
        when: { metric: 'cadence_10s', op: '>', value: interval.cadence_max },
        scope: { intervals: [n] },
        tolerance_s: INTERVAL_LIMIT_TOLERANCE_S,
        repeat_s: null,
        level: 'adjust',
        message: 'Baja la cadencia',
        detail: `{cadence_10s} rpm · máximo ${interval.cadence_max}`,
        sound: 'alarm_low',
      });
    }
    if (interval.hr_min !== undefined) {
      rules.push({
        id: `hr-min-${n}`,
        when: { metric: 'hr', op: '<', value: interval.hr_min },
        scope: { intervals: [n] },
        tolerance_s: 0,
        repeat_s: HR_CEILING_REPEAT_S,
        level: 'info',
        message: 'Sube el ritmo, tu pulso está bajo para este bloque',
        detail: `{hr} lpm · mínimo ${interval.hr_min}`,
        sound: 'chime',
      });
    }
    if (interval.hr_ceiling !== undefined) {
      rules.push({
        id: `hr-ceiling-${n}`,
        when: { metric: 'hr', op: '>', value: interval.hr_ceiling },
        scope: { intervals: [n] },
        tolerance_s: 0,
        repeat_s: HR_CEILING_REPEAT_S,
        level: 'danger',
        message: 'Baja las pulsaciones',
        detail: `{hr} lpm · máximo ${interval.hr_ceiling}`,
        sound: 'alarm_desc',
      });
    }
  });
  return rules;
}
