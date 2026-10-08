/** Nombre legible para descargar el .fit de una sesión:
 * "2026-09-27_ana-ramirez_umbral-3x12.fit" (sin acentos ni espacios, para
 * que cualquier herramienta lo abra sin problema). */
export function fitFileName(athlete: string, startedAt: string, workoutName: string): string {
  const slug = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sesion';
  return `${startedAt.slice(0, 10)}_${slug(athlete)}_${slug(workoutName)}.fit`;
}
