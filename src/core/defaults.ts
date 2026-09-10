import type { Interval, Profile, Rule } from './types';

const CADENCE_FLOOR_REPEAT_S = 4;
const HR_CEILING_REPEAT_S = 20;
const ERG_DETACHED_TOLERANCE_S = 10;
const ERG_DETACHED_REPEAT_S = 30;
const ERG_DETACHED_THRESHOLD_PCT = 80;
const CADENCE_MIN_TOLERANCE_S = 8;

/** Reglas de fábrica (piso de cadencia, techo de pulso, ERG desenganchado):
 * se generan a partir del perfil y son reglas normales para el mismo motor. */
export function buildFactoryRules(profile: Profile): Rule[] {
  return [
    {
      id: 'factory-cadence-floor',
      when: { metric: 'cadence', op: '<', value: profile.cadence_floor },
      scope: 'all',
      tolerance_s: 0,
      repeat_s: CADENCE_FLOOR_REPEAT_S,
      level: 'adjust',
      message: `No bajes de ${profile.cadence_floor}`,
      detail: '{cadence} rpm',
      sound: 'alarm_low',
    },
    {
      id: 'factory-hr-ceiling',
      when: { metric: 'hr', op: '>', value: profile.hr_ceiling },
      scope: 'all',
      tolerance_s: 0,
      repeat_s: HR_CEILING_REPEAT_S,
      level: 'danger',
      message: 'Baja las pulsaciones',
      detail: '{hr} lpm',
      sound: 'alarm_desc',
    },
    {
      id: 'factory-erg-detached',
      when: { metric: 'power_pct_target', op: '<', value: ERG_DETACHED_THRESHOLD_PCT },
      scope: 'all',
      tolerance_s: ERG_DETACHED_TOLERANCE_S,
      repeat_s: ERG_DETACHED_REPEAT_S,
      level: 'adjust',
      message: 'El ERG se desenganchó, pedalea más rápido',
      sound: 'alarm_low',
    },
  ];
}

/** Si un bloque trae `cadence_min`, se genera automáticamente una regla de ese
 * bloque (tolerance 8 s, repeat null). */
export function buildCadenceMinRules(intervals: Interval[]): Rule[] {
  const rules: Rule[] = [];
  intervals.forEach((interval, i) => {
    if (interval.cadence_min === undefined) return;
    rules.push({
      id: `cadence-min-${i + 1}`,
      when: { metric: 'cadence', op: '<', value: interval.cadence_min },
      scope: { intervals: [i + 1] },
      tolerance_s: CADENCE_MIN_TOLERANCE_S,
      repeat_s: null,
      level: 'adjust',
      message: 'Sube la cadencia',
      detail: `{cadence} rpm · mínimo ${interval.cadence_min}`,
      sound: 'alarm_low',
    });
  });
  return rules;
}
