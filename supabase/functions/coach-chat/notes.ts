// Expediente del atleta (athlete_notes): qué puede escribir la IA. Sin
// imports a propósito (lo prueba vitest, ver notes.test.ts).
//
// Si la IA reescribe su propio expediente semana a semana, un error se queda
// pegado y se repite. Frenos: el texto tiene tope, y lo que escribió un
// coach nunca se pierde — la versión de la IA tiene que conservarlo tal cual.

export const NOTES_MAX_CHARS = 1200;
/** Sin coach humano, la IA propone el expediente cada tantas evaluaciones. */
export const NOTES_EVERY_WEEKLY_EVALS = 4;

export interface StoredNotes {
  body: string;
  updatedBy: 'coach' | 'ai';
}

/** El texto que se guarda, o null si la propuesta no se acepta. */
export function acceptAiNotes(proposed: string | null | undefined, existing: StoredNotes | null): string | null {
  const next = (proposed ?? '').trim();
  if (!next || next.length > NOTES_MAX_CHARS) return null;
  if (existing && next === existing.body.trim()) return null;
  if (existing?.updatedBy === 'coach' && existing.body.trim() && !next.includes(existing.body.trim())) return null;
  return next;
}

/** ¿Le toca a esta evaluación semanal proponer el expediente? `previousEvals`
 * cuenta las evaluaciones ya hechas (sin la actual). */
export function notesDueOnWeeklyEval(previousEvals: number, hasHumanCoach: boolean): boolean {
  return !hasHumanCoach && (previousEvals + 1) % NOTES_EVERY_WEEKLY_EVALS === 0;
}
