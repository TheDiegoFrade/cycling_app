/** Si una sesión cuenta como "lograda con Torq" para efectos de rachas,
 * récords y logros — las importadas (Strava o un .fit subido a mano) no
 * cuentan, porque pudieron grabarse con otra bici/potenciómetro o ser de
 * antes de usar la app; el modelo de Fitness/Fatiga (PMC) y la tendencia de
 * EF sí las siguen contando, ahí importa la carga real sin importar el
 * origen. `workoutId` ausente o `null` (sesiones de antes de agregar esta
 * columna en la nube) se trata como "en vivo" — nunca le quitamos un récord
 * ya ganado a alguien por una migración de esquema. */
export function isLiveRecorded(row: { workoutId?: string | null; stravaActivityId?: number | null }): boolean {
  if (row.stravaActivityId != null) return false;
  if (row.workoutId === 'fit-import') return false;
  return true;
}
