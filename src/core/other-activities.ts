// Otras actividades que el atleta hace además de la bici (correr, gym,
// crossfit…). Las declara en el cuestionario; el coach IA las agenda junto a
// la bici y las cuenta en el desgaste, porque una semana pesada de crossfit
// explica cansancio que la bici sola no explica.
import type { NonBikeKind } from './session-kind';
import { NON_BIKE_KIND_LABELS } from './session-kind';

export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAY_CODES: readonly DayCode[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_SHORT_LABELS: Record<DayCode, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

export interface OtherActivity {
  kind: NonBikeKind;
  /** Solo en perfiles viejos; el cuestionario ya no lo pide (el coach solo
   * necesita el tipo, no el deporte exacto). */
  name?: string;
  perWeek: number;
  minutes: number;
  /** Días en que la hace normalmente; vacío = no tiene días fijos. */
  days: DayCode[];
}

export const OTHER_ACTIVITY_LIMITS = { perWeek: [1, 7], minutes: [10, 300] } as const;

/** Los tipos que ofrece el cuestionario: genéricos a propósito, al coach le
 * basta saber qué tipo de carga es. */
export const QUESTIONNAIRE_KINDS: readonly NonBikeKind[] = ['strength', 'running', 'crossfit', 'swimming', 'mobility', 'other'];
export const QUESTIONNAIRE_KIND_LABELS: Partial<Record<NonBikeKind, string>> = {
  strength: 'Gym / fuerza',
  running: 'Correr',
  crossfit: 'Crossfit / funcional',
  swimming: 'Natación',
  mobility: 'Yoga / movilidad',
  other: 'Otro deporte',
};

/** Qué le falta a una actividad declarada; null si está completa. */
export function otherActivityError(a: OtherActivity): string | null {
  const label = activityLabel(a);
  if (!Number.isInteger(a.perWeek) || a.perWeek < OTHER_ACTIVITY_LIMITS.perWeek[0] || a.perWeek > OTHER_ACTIVITY_LIMITS.perWeek[1]) {
    return `Escribe cuántas veces por semana haces ${label.toLowerCase()} (de 1 a 7).`;
  }
  if (!Number.isFinite(a.minutes) || a.minutes < OTHER_ACTIVITY_LIMITS.minutes[0] || a.minutes > OTHER_ACTIVITY_LIMITS.minutes[1]) {
    return `Escribe cuántos minutos dura cada sesión de ${label.toLowerCase()} (de 10 a 300).`;
  }
  if (a.days.length > a.perWeek) return `Marcaste más días que veces por semana en ${label.toLowerCase()}.`;
  return null;
}

export function activityLabel(a: Pick<OtherActivity, 'kind'>): string {
  return QUESTIONNAIRE_KIND_LABELS[a.kind] ?? NON_BIKE_KIND_LABELS[a.kind];
}

/** "Crossfit 2×/semana de 50 min (lun, jue)" — para mostrarle al atleta. */
export function describeOtherActivity(a: OtherActivity): string {
  const days = a.days.length ? ` (${a.days.map((d) => DAY_SHORT_LABELS[d].toLowerCase()).join(', ')})` : '';
  return `${activityLabel(a)} ${a.perWeek}×/semana de ${a.minutes} min${days}`;
}
