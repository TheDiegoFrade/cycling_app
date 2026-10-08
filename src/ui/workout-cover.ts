import type { Interval } from '../core/types';
import { powerZone, powerPctToHeightPct } from '../core/zones';
import { fmtMinutes, tipRow, tipTitle } from './chart-hover';

export type WorkoutCoverSize = 'lg' | 'md' | 'sm';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Portada de un workout: una barra por bloque, coloreada y con la altura de
 * su zona — ver TORQ_DESIGN.md, "Componente clave: portada de workout".
 * Un solo componente reutilizable en los 3 tamaños que pide el doc: grande
 * (Inicio, Antes de empezar), mediano (biblioteca en Inicio), pequeño (filas
 * de Plan/Forma, días del calendario). Color por zona (categoría), altura
 * continua por %FTP real (powerPctToHeightPct) — dos bloques de la misma
 * zona a distinta potencia (ej. Z2 a 110W vs 120W) ya no se ven como la
 * misma barra. */
export function renderWorkoutCover(intervals: readonly Interval[], size: WorkoutCoverSize = 'md', title?: string): string {
  const bars = intervals
    .map((iv) => {
      const zone = powerZone(iv.power_pct);
      const pct = iv.ramp_to_pct !== undefined ? `${Math.round(iv.power_pct)}→${Math.round(iv.ramp_to_pct)}%` : `${Math.round(iv.power_pct)}%`;
      const tip = tipTitle(escapeHtml(iv.name)) + tipRow('Duración', fmtMinutes(iv.duration_s), `var(--z${zone})`) + tipRow('FTP', pct);
      return `<div class="workout-cover-bar" style="height:${powerPctToHeightPct(iv.power_pct)}%;background:var(--z${zone})" data-tip="${escapeHtml(tip)}"></div>`;
    })
    .join('');
  const label = title ? ` title="${escapeHtml(title)}"` : '';
  return `<div class="workout-cover workout-cover-${size}"${label}>${bars}</div>`;
}
