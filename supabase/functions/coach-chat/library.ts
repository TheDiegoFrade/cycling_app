// coach_week: lo que la IA tomó de la biblioteca del coach. Sin imports a
// propósito (lo prueba vitest, ver library.test.ts).
//  - Copia exacta (`libraryChange` vacío o sin intervalos): nombre e
//    intervalos salen de la plantilla guardada, nunca de lo que la IA
//    reescribió; la descripción también si la IA no escribió una.
//  - Ajustado: se respetan sus intervalos y se devuelve el porqué para que
//    el coach lo revise (y lo edite si no le convence).
//  - Un id que no está en la biblioteca (inventado o ajeno) se trata como
//    workout nuevo; si además no trae intervalos, se descarta.

export interface CoachWeekWorkout {
  name: string;
  description: string;
  intervals: unknown[];
  targetTSS: number;
  dayOfWeek: string;
  fromLibraryId: string | null;
  libraryChange: string | null;
}

export interface LibraryTemplate {
  name: string;
  payload: { intervals: unknown[]; description?: string };
}

export interface ResolvedWorkout {
  name: string;
  description: string;
  intervals: unknown[];
  targetTSS: number;
  dayOfWeek: string;
  fromLibrary: { templateId: string; change: string | null } | null;
}

export function resolveFromLibrary(workouts: readonly CoachWeekWorkout[], templates: ReadonlyMap<string, LibraryTemplate>): ResolvedWorkout[] {
  const out: ResolvedWorkout[] = [];
  for (const w of workouts) {
    const base = { name: w.name, description: w.description, intervals: w.intervals, targetTSS: w.targetTSS, dayOfWeek: w.dayOfWeek };
    const t = w.fromLibraryId ? templates.get(w.fromLibraryId) : undefined;
    if (!t || !w.fromLibraryId) {
      if (w.intervals.length > 0) out.push({ ...base, fromLibrary: null });
      continue;
    }
    const change = w.libraryChange?.trim() ?? '';
    if (!change || w.intervals.length === 0) {
      out.push({
        ...base,
        name: t.name,
        intervals: t.payload.intervals,
        description: w.description.trim() || t.payload.description || '',
        fromLibrary: { templateId: w.fromLibraryId, change: null },
      });
    } else {
      out.push({ ...base, fromLibrary: { templateId: w.fromLibraryId, change } });
    }
  }
  return out;
}
