// Editor de bloques de un workout de bici (tipo, nombre, minutos, % FTP,
// rampa; subir/bajar/quitar/agregar). Lo comparten la biblioteca del coach
// (plantillas) y la semana de un atleta (editar un workout ya agendado).
// Los botones y campos llevan data-b*; quien lo usa decide cuándo
// re-renderizar.
import { INTERVAL_TYPES } from '../core/types';
import type { Interval, IntervalType } from '../core/types';
import { estimateWorkout } from '../core/workout-estimate';
import { escapeHtml, renderWorkoutCover } from './workout-cover';

export const INTERVAL_TYPE_LABELS: Record<IntervalType, string> = {
  warmup: 'Calentamiento',
  steady: 'Estable',
  interval: 'Intervalo',
  recovery: 'Recuperación',
  cooldown: 'Vuelta a la calma',
  free: 'Libre',
};

function fmtMin(seconds: number): string {
  const m = seconds / 60;
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

export function numOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Portada + minutos + TSS (se actualiza sola al editar, ver wire). */
export function blockPreviewHtml(intervals: readonly Interval[], ftp: number): string {
  const est = estimateWorkout(intervals, ftp);
  return `${intervals.length ? renderWorkoutCover(intervals, 'sm') : ''}<span class="hint">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS (con tu FTP)</span>`;
}

/** Lista de bloques editable + botón "+ Bloque". */
export function intervalRowsHtml(intervals: readonly Interval[]): string {
  const rows = intervals
    .map(
      (iv, i) => `
        <div class="block-row">
          <select data-b="${i}" data-f="type" aria-label="Tipo de bloque">${INTERVAL_TYPES.map((t) => `<option value="${t}"${t === iv.type ? ' selected' : ''}>${INTERVAL_TYPE_LABELS[t]}</option>`).join('')}</select>
          <input type="text" data-b="${i}" data-f="name" value="${escapeHtml(iv.name)}" placeholder="Nombre" aria-label="Nombre del bloque">
          <label class="block-num">Min<input type="number" min="0.1" step="0.5" data-b="${i}" data-f="min" value="${fmtMin(iv.duration_s)}"></label>
          <label class="block-num">% FTP<input type="number" min="0" max="300" data-b="${i}" data-f="pct" value="${iv.power_pct}"></label>
          <label class="block-num">Rampa a<input type="number" min="0" max="300" data-b="${i}" data-f="ramp" value="${iv.ramp_to_pct ?? ''}" placeholder="—"></label>
          <div class="block-actions">
            <button type="button" data-b-up="${i}" aria-label="Subir bloque"${i === 0 ? ' disabled' : ''}>↑</button>
            <button type="button" data-b-down="${i}" aria-label="Bajar bloque"${i === intervals.length - 1 ? ' disabled' : ''}>↓</button>
            <button type="button" data-b-del="${i}" aria-label="Quitar bloque" class="week-remove">✕</button>
          </div>
        </div>`,
    )
    .join('');
  return `<div class="block-list">${rows}</div>
      <div class="row-actions" style="margin:0"><button type="button" data-b-add>+ Bloque</button></div>`;
}

/** Copia lo escrito en los campos a `intervals` (los muta). */
export function readIntervalInputs(root: ParentNode, intervals: Interval[]): void {
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-b]').forEach((el) => {
    const iv = intervals[Number(el.dataset.b)];
    if (!iv) return;
    const v = el.value;
    if (el.dataset.f === 'type') iv.type = v as IntervalType;
    else if (el.dataset.f === 'name') iv.name = v;
    else if (el.dataset.f === 'min') iv.duration_s = Math.round((numOrUndefined(v) ?? 0) * 60);
    else if (el.dataset.f === 'pct') iv.power_pct = numOrUndefined(v) ?? 0;
    else if (el.dataset.f === 'ramp') {
      const r = numOrUndefined(v);
      if (r === undefined) delete iv.ramp_to_pct;
      else iv.ramp_to_pct = r;
    }
  });
}

function move<T>(list: T[], i: number, delta: number): void {
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/**
 * Conecta los botones de bloques. `edit(fn)` debe leer los campos, aplicar
 * `fn` a los intervalos y re-renderizar; `onValue` corre al salir de un
 * campo (para la vista previa, sin re-renderizar ni perder el foco).
 */
export function wireIntervalEditor(root: ParentNode, edit: (fn: (intervals: Interval[]) => void) => void, onValue: () => void): void {
  root.querySelector('[data-b-add]')?.addEventListener('click', () =>
    edit((list) => {
      const last = list[list.length - 1];
      list.push({ name: 'Bloque', type: 'steady', duration_s: 600, power_pct: last?.ramp_to_pct ?? last?.power_pct ?? 65 });
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-b-up]').forEach((b) => b.addEventListener('click', () => edit((list) => move(list, Number(b.dataset.bUp), -1))));
  root.querySelectorAll<HTMLButtonElement>('[data-b-down]').forEach((b) => b.addEventListener('click', () => edit((list) => move(list, Number(b.dataset.bDown), 1))));
  root.querySelectorAll<HTMLButtonElement>('[data-b-del]').forEach((b) => b.addEventListener('click', () => edit((list) => list.splice(Number(b.dataset.bDel), 1))));
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-b]').forEach((el) => el.addEventListener('change', onValue));
}
