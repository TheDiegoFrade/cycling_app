/** Qué tipo de sesión es — misma lista que el check de `sessions.kind` en
 * supabase/schema.sql (ver docs/coach-view/README.md). Solo se entrena
 * ciclismo, pero el atleta también registra fuerza/movilidad/flexibilidad.
 * `undefined`/null = sesión de bici de la que no sabemos si fue en interior
 * o exterior (un .fit subido a mano, o una sesión de antes de esta columna):
 * se trata como bici en todo. */
export type SessionKind = 'bike_indoor' | 'bike_outdoor' | 'strength' | 'mobility' | 'flexibility' | 'running' | 'crossfit' | 'swimming' | 'other';

/** Los que se registran a mano en Registrar (screens/log-session.ts) y se
 * miden con sRPE en vez de TSS. Correr, crossfit y natación son las otras
 * actividades que el atleta declara en el cuestionario (cuentan en su
 * desgaste aunque no sean bici). */
export type NonBikeKind = 'strength' | 'mobility' | 'flexibility' | 'running' | 'crossfit' | 'swimming' | 'other';
export const NON_BIKE_KINDS: readonly NonBikeKind[] = ['strength', 'running', 'crossfit', 'swimming', 'mobility', 'flexibility', 'other'];

export const NON_BIKE_KIND_LABELS: Record<NonBikeKind, string> = {
  strength: 'Fuerza',
  mobility: 'Movilidad',
  flexibility: 'Flexibilidad',
  running: 'Correr',
  crossfit: 'Crossfit',
  swimming: 'Natación',
  other: 'Otro',
};

/** ¿La completó? Mismo check que `sessions.completion`. Las sesiones de
 * bici grabadas o importadas no lo traen (undefined): se asumen hechas. */
export type SessionCompletion = 'complete' | 'partial' | 'skipped';
export const SESSION_COMPLETIONS: readonly SessionCompletion[] = ['complete', 'partial', 'skipped'];

export const COMPLETION_LABELS: Record<SessionCompletion, string> = {
  complete: 'Completa',
  partial: 'Parcial',
  skipped: 'No la hice',
};

export function isNonBikeKind(kind: SessionKind | null | undefined): kind is NonBikeKind {
  return kind !== null && kind !== undefined && (NON_BIKE_KINDS as readonly string[]).includes(kind);
}

/** ¿Cuenta para las métricas de bici (TSS, CTL/ATL/TSB, potencia, EF,
 * rachas, logros)? Fuerza y movilidad van en su propia línea con sRPE y
 * nunca se suman al TSS — son escalas distintas (ver README, "Carga de
 * fuerza y movilidad"). */
export function isBikeSession(s: { kind?: SessionKind | null }): boolean {
  return !isNonBikeKind(s.kind);
}

/** ¿Se entrenó de verdad? Un registro "No la hice" existe (para que el
 * coach vea que se saltó) pero no cuenta como día entrenado. */
export function wasTrained(s: { completion?: SessionCompletion | null }): boolean {
  return s.completion !== 'skipped';
}

/** Carga sRPE = RPE (1–10) × minutos. Solo para sesiones que no son de
 * bici y que sí se hicieron; null en cualquier otro caso (nunca 0
 * inventado). */
export function srpeLoad(kind: SessionKind | null | undefined, completion: SessionCompletion | null | undefined, rpe: number | null | undefined, durationMin: number): number | null {
  if (!isNonBikeKind(kind) || completion === 'skipped') return null;
  if (!rpe || rpe < 1 || rpe > 10 || !(durationMin > 0)) return null;
  return Math.round(rpe * durationMin);
}
