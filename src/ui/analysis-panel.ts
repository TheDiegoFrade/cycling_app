// Sección "Análisis" de Forma y de la ficha del atleta en la vista del coach:
// lo que mira un coach por ventana (1 semana a 6 meses) — curva de potencia
// contra la ventana anterior, picos con su calidad, desacople potencia-pulso,
// tiempo a umbral, fuerza en la bici, volumen y tiempo hasta la fatiga.
// Los números salen de engine/analysis-window.ts; aquí solo se dibujan.
import { ANALYSIS_WINDOWS, analysisWindow, minutesAt } from '../engine/analysis-window';
import type { AnalysisWindow, CurvePoint } from '../engine/analysis-window';
import type { StatePlanned, StateSession } from '../engine/athlete-state';
import type { PeakQuality } from '../engine/session-metrics';
import type { HrvStatus, WellnessSummary } from '../engine/wellness';
import { ZONE_NAMES } from '../core/zones';
import { bindChartHover, nearestSorted, tipRow, tipTitle } from './chart-hover';

export interface AnalysisData {
  sessions: StateSession[];
  planned: StatePlanned[];
  todayKey: string;
  ftp: number;
  /** Clave para recordar la ventana elegida en este navegador. */
  storageKey: string;
  /** VFC/pulso en reposo/sueño (intervals.icu). No depende de la ventana:
   * siempre es la última semana contra los últimos 60 días. */
  wellness?: WellnessSummary | null;
}

const HRV_STATUS_LABELS: Record<HrvStatus, string> = {
  low: '↓ por debajo de su normal',
  normal: 'dentro de su normal',
  high: '↑ por encima de su normal',
};

const PEAK_LABELS: Record<string, string> = { s5: '5 s', s30: '30 s', m1: '1 min', m5: '5 min', m8: '8 min', m20: '20 min', m60: '60 min' };
const QUALITY_LABELS: Record<PeakQuality, string> = { max_effort: 'máximo', erg_fixed: 'con ERG fijo', incidental: 'casual' };
const PREV_COLOR = '#5a6272'; // mismo gris que "Fatiga" en la gráfica de Forma

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function fmtDay(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function readWindow(key: string): number {
  try {
    const v = Number(localStorage.getItem(key));
    return ANALYSIS_WINDOWS.some((w) => w.days === v) ? v : 28;
  } catch {
    return 28;
  }
}

function saveWindow(key: string, days: number): void {
  try {
    localStorage.setItem(key, String(days));
  } catch {
    // sin storage: se queda la elección solo por ahora
  }
}

function tile(label: string, value: string, sub = ''): string {
  return `<div class="forma-record-tile"><div class="forma-record-value">${value}</div><div class="live-col-label">${label}</div>${sub ? `<div class="hint">${sub}</div>` : ''}</div>`;
}

function peakTile(p: CurvePoint): string {
  if (p.watts === null) return tile(PEAK_LABELS[p.key], '—', 'sin probar');
  const delta = p.prevWatts ? Math.round(((p.watts - p.prevWatts) / p.prevWatts) * 100) : null;
  const deltaTxt = delta !== null && delta !== 0 ? ` · ${delta > 0 ? '+' : ''}${delta} % vs. antes` : '';
  return tile(PEAK_LABELS[p.key], `${p.watts} W`, `${fmtDay(p.dateKey!)} · ${QUALITY_LABELS[p.quality!]}${deltaTxt}`);
}

function wellnessHtml(w: WellnessSummary): string {
  const tiles = [
    w.hrv7d !== null
      ? tile(
          'VFC en reposo',
          `${w.hrv7d} ms`,
          [w.hrvBaseline60d !== null ? `normal ${w.hrvBaseline60d} ms` : 'juntando línea base', w.hrvStatus ? HRV_STATUS_LABELS[w.hrvStatus] : '']
            .filter(Boolean)
            .join(' · '),
        )
      : '',
    w.restingHr7d !== null
      ? tile('Pulso en reposo', `${w.restingHr7d} lpm`, w.restingHrBaseline60d !== null ? `normal ${w.restingHrBaseline60d} lpm` : 'juntando línea base')
      : '',
    w.sleepH7d !== null ? tile('Sueño', `${w.sleepH7d} h`, 'promedio por noche') : '',
  ].join('');
  if (!tiles) return '';
  return `
    <h3 class="perfil-h2" style="margin-top:4px;font-size:18px">Recuperación</h3>
    <div class="panel forma-records-grid">${tiles}</div>
    <p class="hint" style="margin:6px 0 16px">Última semana contra los últimos 60 días, de intervals.icu. Cuenta la tendencia, no una noche.</p>`;
}

function bodyHtml(a: AnalysisWindow, ftp: number): string {
  const st = a.state;
  const weeks = a.days / 7;
  const cp = st.cp ?? null;
  const fatigue = cp
    ? [ftp, Math.round(ftp * 1.1)]
        .map((w) => ({ w, min: minutesAt(w, cp) }))
        .filter((x) => x.min !== null)
        .map((x) => `a ${x.w} W ≈ ${x.min} min`)
        .join(' · ')
    : '';
  const maxHours = Math.max(0.1, ...a.weeks.map((w) => w.hours));
  const labelEvery = Math.ceil(a.weeks.length / 5); // en 6 meses, una fecha de cada 6 barras: caben en el celular
  const zoneTotal = st.zoneHours ? st.zoneHours.reduce((x, y) => x + y, 0) : 0;
  const peaks = a.curve.filter((p) => p.key !== 's5');

  return `
    <div class="panel">
      <div class="analysis-legend">
        <span class="analysis-legend-item"><span class="analysis-swatch is-line" style="background:var(--accent)"></span>Esta ventana</span>
        <span class="analysis-legend-item"><span class="analysis-swatch is-dashed" style="border-color:${PREV_COLOR}"></span>Ventana anterior</span>
        <span class="analysis-legend-item"><span class="analysis-swatch" style="background:var(--accent)"></span>Máximo</span>
        <span class="analysis-legend-item"><span class="analysis-swatch is-ring"></span>Con ERG o casual</span>
      </div>
      <canvas class="analysis-curve" style="width:100%;height:200px;display:block"></canvas>
      <p class="hint" style="margin:6px 0 0">Mejor potencia sostenida por duración. Un pico con ERG fijo o casual no fue un máximo: no lo leas como pérdida de forma.</p>
    </div>

    <div class="panel forma-records-grid" style="margin-top:12px">${peaks.map(peakTile).join('')}</div>

    <div class="panel forma-records-grid" style="margin-top:12px">
      ${tile('Volumen', `${(st.hours / weeks).toFixed(1)} h/sem`, `${Math.round(st.tss / weeks)} TSS/sem${st.kJ !== null ? ` · ${Math.round(st.kJ / weeks)} kJ/sem` : ''}`)}
      ${st.compliancePct !== null ? tile('Cumplimiento', `${st.compliancePct} %`, 'de lo agendado') : ''}
      ${st.threshold ? tile('Tiempo a umbral', `${st.threshold.longestMin} min`, `bloque más largo · ${st.threshold.weeklyMin} min/sem a ≥ 95 % FTP`) : ''}
      ${st.lowCadenceMinPerWeek !== null ? tile('Fuerza en la bici', `${st.lowCadenceMinPerWeek} min/sem`, 'a < 70 rpm con > 80 % FTP') : ''}
      ${tile(
        'Base aeróbica',
        st.aerobic ? `${st.aerobic.decouplingPct} %` : '—',
        st.aerobic ? `desacople (mediana de ${st.aerobic.n}) · EF ${st.aerobic.ef}` : 'faltan 3 rodadas estables para compararlo',
      )}
      ${cp ? tile('Potencia crítica', `${cp.cpW} W`, `W′ ${cp.wPrimeKJ} kJ${fatigue ? ` · ${fatigue}` : ''}`) : ''}
    </div>

    ${
      a.decoupling.length >= 2
        ? `<h3 class="perfil-h2" style="margin-top:20px;font-size:18px">Desacople potencia-pulso</h3>
      <div class="panel">
        <canvas class="analysis-decoupling" style="width:100%;height:140px;display:block"></canvas>
        <p class="hint" style="margin:6px 0 0">Solo rodadas estables (45 min o más, parejas, de fondo). Debajo de 5 % = buena base aeróbica; si sube, falta base o hay fatiga.</p>
      </div>`
        : ''
    }

    <h3 class="perfil-h2" style="margin-top:20px;font-size:18px">Volumen por semana</h3>
    <div class="panel">
      <div class="analysis-bars">
        ${a.weeks
          .map(
            (w, i) =>
              `<div class="analysis-bar-col" data-tip="${tipTitle(`Semana del ${fmtDay(w.mondayKey)}`).replace(/"/g, '&quot;')}${tipRow('Horas', `${w.hours} h`).replace(/"/g, '&quot;')}${tipRow('TSS', String(w.tss)).replace(/"/g, '&quot;')}${w.kJ !== null ? tipRow('kJ', String(w.kJ)).replace(/"/g, '&quot;') : ''}"><div class="analysis-bar" style="height:${Math.max(2, (w.hours / maxHours) * 100)}%"></div><span class="analysis-bar-label">${i % labelEvery === 0 ? fmtDay(w.mondayKey) : '&nbsp;'}</span></div>`,
          )
          .join('')}
      </div>
      ${
        st.zoneHours && zoneTotal > 0
          ? `<div class="live-col-label" style="margin-top:14px">Tiempo por zona de potencia</div>
        <div class="analysis-zones">
          ${st.zoneHours
            .map((h, i) =>
              h > 0
                ? `<div class="analysis-zone" style="flex:${h};background:var(--z${i + 1})" data-tip="${tipRow(`Z${i + 1} ${ZONE_NAMES[(i + 1) as 1]}`, `${h} h · ${Math.round((h / zoneTotal) * 100)} %`).replace(/"/g, '&quot;')}"></div>`
                : '',
            )
            .join('')}
        </div>
        <div class="analysis-zone-legend">${st.zoneHours
          .map((h, i) => (h > 0 ? `<span class="analysis-legend-item"><span class="analysis-swatch" style="background:var(--z${i + 1})"></span>Z${i + 1} ${Math.round((h / zoneTotal) * 100)} %</span>` : ''))
          .join('')}</div>`
          : ''
      }
    </div>`;
}

function setupCanvas(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, rect.width, rect.height);
  return { g, w: rect.width, h: rect.height };
}

/** Curva de potencia: duración en escala logarítmica (5 s a 60 min). */
function drawCurve(canvas: HTMLCanvasElement, curve: CurvePoint[]): void {
  const c = setupCanvas(canvas);
  if (!c) return;
  const { g, w, h } = c;
  const accent = cssVar('--accent', '#3d8bff');
  const muted = cssVar('--text-muted', '#8b93a1');
  const grid = cssVar('--border', '#1c1f25');
  const surface = cssVar('--surface', '#15171b');
  const padL = 40;
  const padR = 24;
  const padT = 10;
  const padB = 22;
  const values = curve.flatMap((p) => [p.watts, p.prevWatts]).filter((v): v is number => v !== null);
  if (values.length === 0) return;
  // eje en múltiplos limpios (50, 100, 200 W…)
  const rawStep = (Math.max(...values) - Math.min(...values) * 0.85) / 3;
  const step = [25, 50, 100, 200, 250, 500].find((x) => x >= rawStep) ?? 500;
  const min = Math.floor((Math.min(...values) * 0.9) / step) * step;
  const max = Math.ceil((Math.max(...values) * 1.05) / step) * step;
  const lx = (s: number) => Math.log(s);
  const X = (s: number) => padL + ((lx(s) - lx(curve[0].seconds)) / (lx(curve[curve.length - 1].seconds) - lx(curve[0].seconds))) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (h - padT - padB);

  // rejilla recesiva y ejes con texto en tinta de texto, no de serie
  g.font = '11px Archivo, sans-serif';
  g.fillStyle = muted;
  g.strokeStyle = grid;
  g.lineWidth = 1;
  for (let v = min; v <= max; v += step) {
    const y = Y(v);
    g.beginPath();
    g.moveTo(padL, y);
    g.lineTo(w - padR, y);
    g.stroke();
    g.textAlign = 'right';
    g.fillText(`${Math.round(v)}`, padL - 6, y + 4);
  }
  // etiquetas de duración: se salta las que no caben (en el celular 30 s y
  // 1 min, o 5 y 8 min, quedan casi juntas)
  g.textAlign = 'center';
  const labelOf = (p: CurvePoint) => PEAK_LABELS[p.key].replace(' ', '');
  const last = curve[curve.length - 1];
  const lastX = X(last.seconds);
  const room = (label: string) => g.measureText(label).width + 8;
  let lastLabelX = -Infinity;
  for (const p of curve.slice(0, -1)) {
    const x = X(p.seconds);
    if (x - lastLabelX < room(labelOf(p)) || lastX - x < room(labelOf(last))) continue;
    g.fillText(labelOf(p), x, h - 6);
    lastLabelX = x;
  }
  g.fillText(labelOf(last), lastX, h - 6); // 60 min siempre

  const line = (get: (p: CurvePoint) => number | null, color: string, dashed: boolean) => {
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.setLineDash(dashed ? [5, 4] : []);
    g.beginPath();
    let started = false;
    for (const p of curve) {
      const v = get(p);
      if (v === null) {
        started = false;
        continue;
      }
      started ? g.lineTo(X(p.seconds), Y(v)) : g.moveTo(X(p.seconds), Y(v));
      started = true;
    }
    g.stroke();
    g.setLineDash([]);
  };
  line((p) => p.prevWatts, PREV_COLOR, true);
  line((p) => p.watts, accent, false);
  for (const p of curve) {
    if (p.watts === null) continue;
    g.beginPath();
    g.arc(X(p.seconds), Y(p.watts), 4.5, 0, Math.PI * 2);
    g.fillStyle = surface; // anillo de superficie para separar del trazo
    g.fill();
    g.beginPath();
    g.arc(X(p.seconds), Y(p.watts), 3.5, 0, Math.PI * 2);
    if (p.quality === 'max_effort') {
      g.fillStyle = accent;
      g.fill();
    } else {
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.stroke();
    }
  }

  const xs = curve.map((p) => X(p.seconds));
  bindChartHover(canvas, {
    count: curve.length,
    indexAt: (x) => nearestSorted(xs, x),
    xOf: (i) => xs[i],
    dots: (i) => [
      ...(curve[i].watts !== null ? [{ y: Y(curve[i].watts!), color: accent }] : []),
      ...(curve[i].prevWatts !== null ? [{ y: Y(curve[i].prevWatts!), color: PREV_COLOR }] : []),
    ],
    html: (i) => {
      const p = curve[i];
      return (
        tipTitle(PEAK_LABELS[p.key]) +
        (p.watts !== null ? tipRow(`${fmtDay(p.dateKey!)} · ${QUALITY_LABELS[p.quality!]}`, `${p.watts} W`, accent) : tipRow('Esta ventana', 'sin probar')) +
        (p.prevWatts !== null ? tipRow('Ventana anterior', `${p.prevWatts} W`, PREV_COLOR) : '')
      );
    },
  });
}

/** Desacople por rodada estable, con la banda de "buena base" (< 5 %). */
function drawDecoupling(canvas: HTMLCanvasElement, points: { dateKey: string; pct: number }[]): void {
  const c = setupCanvas(canvas);
  if (!c) return;
  const { g, w, h } = c;
  const accent = cssVar('--accent', '#3d8bff');
  const muted = cssVar('--text-muted', '#8b93a1');
  const padL = 34;
  const padR = 12;
  const padT = 8;
  const padB = 8;
  const max = Math.max(10, ...points.map((p) => p.pct + 1));
  const min = Math.min(0, ...points.map((p) => p.pct - 1));
  const X = (i: number) => padL + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);

  g.fillStyle = 'rgba(34, 197, 139, 0.10)'; // --success, apenas visible
  g.fillRect(padL, Y(5), w - padL - padR, Y(Math.max(min, 0)) - Y(5));
  g.font = '11px Archivo, sans-serif';
  g.fillStyle = muted;
  g.textAlign = 'right';
  for (const v of [0, 5, 10]) if (v >= min && v <= max) g.fillText(`${v} %`, padL - 6, Y(v) + 4);

  g.strokeStyle = accent;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.beginPath();
  points.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.pct)) : g.moveTo(X(i), Y(p.pct))));
  g.stroke();
  g.fillStyle = accent;
  points.forEach((p, i) => {
    g.beginPath();
    g.arc(X(i), Y(p.pct), 4, 0, Math.PI * 2);
    g.fill();
  });

  const xs = points.map((_, i) => X(i));
  bindChartHover(canvas, {
    count: points.length,
    indexAt: (x) => nearestSorted(xs, x),
    xOf: (i) => xs[i],
    dots: (i) => [{ y: Y(points[i].pct), color: accent }],
    html: (i) => tipTitle(fmtDay(points[i].dateKey)) + tipRow('Desacople', `${points[i].pct} %`, accent),
  });
}

/** Pinta la sección completa dentro de `root` (con su selector de ventana). */
/** Dibuja el panel. `setWellness` lo repinta cuando llega el bienestar
 * (viene de la nube y no vale la pena frenar el resto por él). */
export function renderAnalysisPanel(root: HTMLElement, data: AnalysisData): { setWellness(w: WellnessSummary | null): void } {
  let days = readWindow(data.storageKey);
  let wellness = data.wellness ?? null;
  const paint = (): void => {
    const a = analysisWindow(data.sessions, data.planned, data.todayKey, days);
    root.innerHTML = `
      ${wellness ? wellnessHtml(wellness) : ''}
      <div class="plan-chip-row analysis-chips" role="tablist" aria-label="Ventana de análisis">
        ${ANALYSIS_WINDOWS.map((wd) => `<button type="button" role="tab" class="plan-chip${wd.days === days ? ' on' : ''}" aria-selected="${wd.days === days}" data-days="${wd.days}">${wd.label}</button>`).join('')}
      </div>
      ${a.state.sessions === 0 ? '<div class="panel"><p class="hint">No hay sesiones de bici en esta ventana.</p></div>' : bodyHtml(a, data.ftp)}`;
    root.querySelectorAll<HTMLButtonElement>('[data-days]').forEach((b) =>
      b.addEventListener('click', () => {
        days = Number(b.dataset.days);
        saveWindow(data.storageKey, days);
        paint();
      }),
    );
    if (a.state.sessions === 0) return;
    const curveCanvas = root.querySelector<HTMLCanvasElement>('.analysis-curve');
    if (curveCanvas) drawCurve(curveCanvas, a.curve);
    const decCanvas = root.querySelector<HTMLCanvasElement>('.analysis-decoupling');
    if (decCanvas) drawDecoupling(decCanvas, a.decoupling);
  };
  paint();
  return {
    setWellness(w) {
      wellness = w;
      paint();
    },
  };
}
