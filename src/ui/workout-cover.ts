import type { Interval } from '../core/types';
import { powerZone, ZONE_HEIGHT_PCT } from '../core/zones';

export type WorkoutCoverSize = 'lg' | 'md' | 'sm';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Portada de un workout: una barra por bloque, coloreada y con la altura de
 * su zona — ver TORQ_DESIGN.md, "Componente clave: portada de workout".
 * Un solo componente reutilizable en los 3 tamaños que pide el doc: grande
 * (Inicio, Antes de empezar), mediano (biblioteca en Inicio), pequeño (filas
 * de Plan/Forma, días del calendario). Reutiliza el mismo perfil de bloques
 * (intervalos → zona → color/altura) que ya usa la gráfica de Sesión en
 * vivo (ver train.ts), solo que acá la altura es la de la zona, no la del
 * % de FTP crudo — así los bloques se leen igual de claro aunque el workout
 * no tenga picos muy altos. */
export function renderWorkoutCover(intervals: readonly Interval[], size: WorkoutCoverSize = 'md', title?: string): string {
  const bars = intervals
    .map((iv) => {
      const zone = powerZone(iv.power_pct);
      return `<div class="workout-cover-bar" style="height:${ZONE_HEIGHT_PCT[zone]}%;background:var(--z${zone})"></div>`;
    })
    .join('');
  const label = title ? ` title="${escapeHtml(title)}"` : '';
  return `<div class="workout-cover workout-cover-${size}"${label}>${bars}</div>`;
}
