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
  /** Nombre libre cuando kind = 'other' ("fútbol", "yoga"…), opcional en los demás. */
  name?: string;
  perWeek: number;
  minutes: number;
  /** Días en que la hace normalmente; vacío = no tiene días fijos. */
  days: DayCode[];
}

export const OTHER_ACTIVITY_LIMITS = { perWeek: [1, 7], minutes: [10, 300] } as const;

/** Qué le falta a una actividad declarada; null si está completa. */
export function otherActivityError(a: OtherActivity): string | null {
  const label = activityLabel(a);
  if (a.kind === 'other' && !a.name?.trim()) return 'Escribe qué actividad es la que marcaste como «Otra».';
  if (!Number.isInteger(a.perWeek) || a.perWeek < OTHER_ACTIVITY_LIMITS.perWeek[0] || a.perWeek > OTHER_ACTIVITY_LIMITS.perWeek[1]) {
    return `Escribe cuántas veces por semana haces ${label.toLowerCase()} (de 1 a 7).`;
  }
  if (!Number.isFinite(a.minutes) || a.minutes < OTHER_ACTIVITY_LIMITS.minutes[0] || a.minutes > OTHER_ACTIVITY_LIMITS.minutes[1]) {
    return `Escribe cuántos minutos dura cada sesión de ${label.toLowerCase()} (de 10 a 300).`;
  }
  if (a.days.length > a.perWeek) return `Marcaste más días que veces por semana en ${label.toLowerCase()}.`;
  return null;
}

export function activityLabel(a: Pick<OtherActivity, 'kind' | 'name'>): string {
  return a.name?.trim() || NON_BIKE_KIND_LABELS[a.kind];
}

/** "Crossfit 2×/semana de 50 min (lun, jue)" — para mostrarle al atleta. */
export function describeOtherActivity(a: OtherActivity): string {
  const days = a.days.length ? ` (${a.days.map((d) => DAY_SHORT_LABELS[d].toLowerCase()).join(', ')})` : '';
  return `${activityLabel(a)} ${a.perWeek}×/semana de ${a.minutes} min${days}`;
}
