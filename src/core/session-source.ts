/** De dónde llegó una sesión — misma lista que el check de `sessions.source`
 * en supabase/schema.sql. Es la llave de la regla de Strava: los términos de
 * su API prohíben usar sus datos en modelos de IA y mostrarlos a otras
 * personas (ver docs/coach-view/README.md), así que todo lo que arme
 * contexto para el coach de IA filtra con isAiEligibleSource.
 *  - torq: grabada en vivo con la app.
 *  - fit_upload: .fit subido a mano (Garmin/Wahoo/Zwift/etc.).
 *  - intervals: llegó de intervals.icu (todavía no hay importación).
 *  - strava: importada de Strava.
 *  - manual: registrada a mano sin archivo (todavía no existe). */
export type SessionSource = 'torq' | 'fit_upload' | 'intervals' | 'strava' | 'manual';

export const SESSION_SOURCES: readonly SessionSource[] = ['torq', 'fit_upload', 'intervals', 'strava', 'manual'];

interface SessionOriginFields {
  source?: SessionSource | null;
  workoutId?: string | null;
  stravaActivityId?: number | null;
}

/** Fuente de una sesión. Strava gana siempre: si trae id de actividad de
 * Strava (o el workoutId que pone sync/strava.ts), es 'strava' aunque
 * `source` diga otra cosa — mismo criterio que el trigger
 * sessions_set_source en schema.sql. Sesiones guardadas antes de que
 * existiera `source` se deducen de workoutId ('fit-import' = .fit subido a
 * mano, cualquier otro = grabada en vivo). */
export function sessionSourceOf(s: SessionOriginFields): SessionSource {
  if ((s.stravaActivityId !== undefined && s.stravaActivityId !== null) || s.workoutId === 'strava-import') return 'strava';
  if (s.source) return s.source;
  return s.workoutId === 'fit-import' ? 'fit_upload' : 'torq';
}

/** ¿Puede esta sesión entrar al contexto del coach de IA? */
export function isAiEligibleSource(source: SessionSource): boolean {
  return source !== 'strava';
}

/** Atajo: deduce la fuente y dice si puede entrar al contexto de la IA. */
export function isAiEligibleSession(s: SessionOriginFields): boolean {
  return isAiEligibleSource(sessionSourceOf(s));
}
