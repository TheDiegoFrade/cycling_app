// Hover (y toque en el celular) para las gráficas: una línea vertical, un
// punto por serie y una etiqueta con los valores del punto más cercano.
// Las gráficas de canvas llaman a bindChartHover al terminar de dibujar
// (también al redibujar por resize, así la geometría siempre está al día);
// las de barras en HTML solo ponen `data-tip` y installDomTips las atiende.

export interface ChartHoverGeometry {
  /** Cuántos puntos hay (índices 0..count-1). */
  count: number;
  /** Índice más cercano a una x en px CSS, relativa al canvas. */
  indexAt(x: number): number;
  /** x en px CSS del punto i. */
  xOf(i: number): number;
  /** Un punto por serie con valor en i (y en px CSS). */
  dots(i: number): { y: number; color: string }[];
  /** Contenido de la etiqueta (HTML ya escapado). */
  html(i: number): string;
}

/** indexAt para puntos repartidos parejo entre `pad` y `width - pad`. */
export function evenIndexAt(x: number, count: number, width: number, pad: number): number {
  if (count <= 1) return 0;
  const f = (x - pad) / Math.max(1, width - 2 * pad);
  return Math.max(0, Math.min(count - 1, Math.round(f * (count - 1))));
}

/** Índice del valor más cercano a `target` en un arreglo ordenado. */
export function nearestSorted(values: readonly number[], target: number): number {
  let lo = 0;
  let hi = values.length - 1;
  if (hi <= 0) return 0;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid;
    else hi = mid;
  }
  return target - values[lo] <= values[hi] - target ? lo : hi;
}

const geometries = new WeakMap<HTMLCanvasElement, ChartHoverGeometry>();
const bound = new WeakSet<HTMLCanvasElement>();

export function bindChartHover(canvas: HTMLCanvasElement, geometry: ChartHoverGeometry): void {
  geometries.set(canvas, geometry);
  if (bound.has(canvas) || !canvas.parentElement) return;
  bound.add(canvas);

  const wrap = document.createElement('div');
  wrap.className = 'chart-hover-wrap';
  canvas.replaceWith(wrap);
  wrap.appendChild(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'chart-hover-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<div class="chart-hover-line"></div><div class="chart-hover-dots"></div><div class="chart-hover-tip"></div>';
  wrap.appendChild(overlay);
  const line = overlay.querySelector<HTMLElement>('.chart-hover-line')!;
  const dotsEl = overlay.querySelector<HTMLElement>('.chart-hover-dots')!;
  const tip = overlay.querySelector<HTMLElement>('.chart-hover-tip')!;

  const hide = (): void => {
    overlay.hidden = true;
  };
  const show = (clientX: number): void => {
    const geo = geometries.get(canvas);
    if (!geo || geo.count === 0) return hide();
    const rect = canvas.getBoundingClientRect();
    const i = geo.indexAt(clientX - rect.left);
    const x = geo.xOf(i);
    overlay.hidden = false;
    line.style.left = `${x}px`;
    dotsEl.innerHTML = geo
      .dots(i)
      .map((d) => `<span class="chart-hover-dot" style="left:${x}px;top:${d.y}px;background:${d.color}"></span>`)
      .join('');
    tip.innerHTML = geo.html(i);
    // a la derecha del cursor; si no cabe, a la izquierda
    const tipW = tip.offsetWidth;
    const left = x + 12 + tipW > rect.width ? Math.max(0, x - 12 - tipW) : x + 12;
    tip.style.left = `${left}px`;
  };

  canvas.addEventListener('pointermove', (e) => show(e.clientX));
  canvas.addEventListener('pointerdown', (e) => show(e.clientX));
  // con el dedo, pointerleave llega justo al soltar: la etiqueta se queda
  // hasta que se toque otra parte de la pantalla
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') hide();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!wrap.isConnected) return;
    if (!wrap.contains(e.target as Node)) hide();
  });
}

/** Etiqueta flotante para cualquier elemento con `data-tip` (barras de
 * zona, días de la semana, bloques de un workout). Se instala una sola vez
 * para toda la app. */
export function installDomTips(): void {
  const tip = document.createElement('div');
  tip.className = 'chart-tip-float';
  tip.hidden = true;
  document.body.appendChild(tip);
  let current: HTMLElement | null = null;

  const showFor = (el: HTMLElement): void => {
    current = el;
    tip.innerHTML = el.dataset.tip ?? '';
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = (): void => {
    current = null;
    tip.hidden = true;
  };
  const tipTarget = (e: Event): HTMLElement | null => (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = tipTarget(e);
    if (el && el !== current) showFor(el);
    else if (!el && current) hide();
  });
  document.addEventListener('pointerdown', (e) => {
    const el = tipTarget(e);
    if (e.pointerType === 'touch' && el) showFor(el);
    else if (!el) hide();
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('hashchange', hide);
}

export function tipRow(label: string, value: string, color?: string): string {
  const swatch = color ? `<span class="chart-tip-swatch" style="background:${color}"></span>` : '';
  return `<div class="chart-tip-row">${swatch}<span>${label}</span><strong>${value}</strong></div>`;
}

export function tipTitle(text: string): string {
  return `<div class="chart-tip-title">${text}</div>`;
}

export function fmtClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** "30 s" / "2 min 30 s" / "45 min" / "1 h 05 min". */
export function fmtMinutes(totalS: number): string {
  const secs = Math.round(Math.max(0, totalS));
  if (secs < 60) return `${secs} s`;
  if (secs < 600 && secs % 60) return `${Math.floor(secs / 60)} min ${secs % 60} s`;
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}
