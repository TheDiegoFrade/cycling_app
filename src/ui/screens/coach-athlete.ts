// Análisis de un atleta — docs/coach-view/mockups/Atleta.dc.html, solo
// lectura (#/coach-athlete/:id). Lo que depende de pasos posteriores ("Lo
// que detectó la IA", revisión mensual, notas, plan vs. realizado contra
// plan_weeks) todavía no aparece; la gráfica semanal muestra el TSS hecho y
// las sesiones de fuerza/movilidad de cada semana.
import { athletePmc, sessionDateKey, summarizeAthlete, weeklyLoads } from '../../core/coach-metrics';
import type { AthleteSummary, CoachSessionRow, WeekLoad } from '../../core/coach-metrics';
import { COACH_TIER_LABELS } from '../../core/coach-invite';
import { COMPLETION_LABELS, NON_BIKE_KIND_LABELS, isNonBikeKind } from '../../core/session-kind';
import { listAthleteSessions, listCoachAthletes } from '../../sync/coach-athletes';
import type { CoachAthlete } from '../../sync/coach-athletes';
import {
  COACH_DETAIL_DAYS,
  alertPillHtml,
  athleteName,
  avatarHtml,
  disciplineLabel,
  fmtSigned,
  sinceIso,
  sourceLabel,
  todayUtcKey,
  tsbColor,
} from '../coach-ui';
import { getRouteParam } from '../router';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';
import { drawFitnessFatigueChart } from './history';

const CHART_WEEKS = 12;
const LOAD_WEEKS = 8;
const RECENT_SESSIONS = 15;

function fmtDuration(row: CoachSessionRow): string {
  const min = Math.round(Math.max(0, Date.parse(row.finishedAt) - Date.parse(row.startedAt)) / 60000);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

function fmtDay(row: CoachSessionRow): string {
  return new Date(`${sessionDateKey(row)}T00:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function fmtShortDate(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function pillsHtml(a: CoachAthlete): string {
  const pills = [
    COACH_TIER_LABELS[a.tier],
    disciplineLabel(a),
    a.ftp ? `FTP ${a.ftp} W${a.ftpConfirmed ? '' : ' · sin confirmar'}` : null,
    a.hrMax ? `Pulso máx. ${a.hrMax}${a.hrMaxConfirmed ? '' : ' · sin confirmar'}` : null,
    a.goal ? `Objetivo: ${a.goal}` : null,
  ].filter((p): p is string => Boolean(p));
  return pills.map((p) => `<span class="coach-pill">${escapeHtml(p)}</span>`).join('');
}

function kpisHtml(s: AthleteSummary): string {
  const kpis = [
    { label: 'Fitness (CTL)', value: String(Math.round(s.ctl)), sub: s.ctlDelta7 === null ? 'Sin historia suficiente' : `${fmtSigned(s.ctlDelta7)} en 7 días`, color: 'var(--accent)' },
    { label: 'Fatiga (ATL)', value: String(Math.round(s.atl)), sub: 'Carga de los últimos ~7 días', color: 'var(--z5)' },
    { label: 'Forma (TSB)', value: fmtSigned(s.tsb), sub: s.tsb <= -20 ? 'Fatiga alta' : s.tsb >= 10 ? 'Muy fresco' : 'En rango', color: tsbColor(s.tsb) },
    { label: 'Sesiones 4 semanas', value: String(s.bikeSessions28d), sub: `de bici${s.nonBikeSessions28d ? ` · +${s.nonBikeSessions28d} fuerza/mov.` : ''}`, color: 'var(--text)' },
    { label: 'Horas por semana', value: s.hoursPerWeek28d.toFixed(1), sub: 'Bici, promedio 4 semanas', color: 'var(--text)' },
  ];
  return kpis
    .map(
      (k) => `
      <div class="coach-tile">
        <span class="live-col-label">${k.label}</span>
        <span class="coach-tile-value num" style="color:${k.color}">${k.value}</span>
        <span class="hint">${k.sub}</span>
      </div>`,
    )
    .join('');
}

function weeksHtml(weeks: WeekLoad[]): string {
  const max = Math.max(1, ...weeks.map((w) => w.tss));
  return weeks
    .map(
      (w) => `
      <div class="coach-week">
        <span class="num coach-week-tss">${Math.round(w.tss)}</span>
        <div class="coach-week-track"><div class="coach-week-bar" style="height:${Math.max(w.tss > 0 ? 4 : 0, Math.round((w.tss / max) * 100))}%"></div></div>
        <div class="coach-week-dots">${w.nonBike.map((k) => `<span class="coach-dot kind-${k}" title="${NON_BIKE_KIND_LABELS[k]}"></span>`).join('')}</div>
        <span class="hint">${fmtShortDate(w.mondayKey)}</span>
      </div>`,
    )
    .join('');
}

function sessionRowHtml(r: CoachSessionRow): string {
  const nonBike = isNonBikeKind(r.kind) ? r.kind : null;
  const skipped = r.completion === 'skipped';
  const load = nonBike
    ? r.srpeLoad !== null
      ? `<span class="num coach-num">${Math.round(r.srpeLoad)}</span> <span class="hint">sRPE</span>`
      : '—'
    : r.tss !== null
      ? `<span class="num coach-num">${Math.round(r.tss)}</span> <span class="hint">TSS</span>`
      : '—';
  const status = r.completion ? COMPLETION_LABELS[r.completion] : 'Hecha';
  return `
    <tr${skipped ? ' class="coach-row-muted"' : ''}>
      <td>${fmtDay(r)}</td>
      <td><span class="coach-session-name"><span class="coach-dot ${nonBike ? `kind-${nonBike}` : 'coach-dot-bike'}"></span>${escapeHtml(r.workoutName)}</span></td>
      <td>${skipped ? '—' : fmtDuration(r)}</td>
      <td>${skipped ? '—' : load}</td>
      <td>${r.rpe ?? '—'}</td>
      <td>${sourceLabel(r.source)}</td>
      <td><span class="coach-pill${r.completion === 'skipped' ? ' coach-pill-danger' : r.completion === 'partial' ? ' coach-pill-caution' : ''}">${status}</span></td>
    </tr>`;
}

export function renderCoachAthlete(container: HTMLElement): () => void {
  const athleteId = getRouteParam();
  let resizeHandler: (() => void) | null = null;
  const cleanup = () => {
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  };

  function shell(body: string): void {
    container.innerHTML = `<div class="screen coach-screen"><a href="#/coach-athletes" class="back-link">← Atletas</a>${body}</div>`;
  }

  if (!appState.user || !appState.coach.isCoach) {
    shell('<p class="hint">Esta sección es solo para coaches.</p>');
    return cleanup;
  }
  if (!athleteId) {
    shell('<p class="hint">Falta el atleta.</p>');
    return cleanup;
  }

  shell('<p class="hint">Cargando…</p>');
  const todayKey = todayUtcKey();

  void (async () => {
    try {
      // La vista solo trae atletas con vínculo activo de ESTE coach: si el
      // id no está, no es (o dejó de ser) su atleta.
      const athlete = (await listCoachAthletes()).find((a) => a.userId === athleteId);
      if (getRouteParam() !== athleteId) return;
      if (!athlete) {
        shell('<p class="hint">Este atleta no está vinculado contigo (o se desvinculó).</p>');
        return;
      }
      const rows = await listAthleteSessions([athleteId], sinceIso(COACH_DETAIL_DAYS));
      if (getRouteParam() !== athleteId) return;

      const summary = summarizeAthlete(rows, todayKey, athlete.ftpConfirmed);
      const pmc = athletePmc(rows, todayKey).slice(-CHART_WEEKS * 7);
      const weeks = weeklyLoads(rows, todayKey, LOAD_WEEKS);
      const recent = rows.slice(0, RECENT_SESSIONS);

      shell(`
        <header class="coach-head">
          <div class="coach-athlete-head">
            ${avatarHtml(athlete)}
            <div>
              <h1>${escapeHtml(athleteName(athlete))}</h1>
              <div class="coach-pills">${pillsHtml(athlete)}${summary.alerts.map(alertPillHtml).join('')}</div>
            </div>
          </div>
          <div class="coach-head-actions"><a href="#/coach-week/${athlete.userId}" class="coach-btn coach-btn-primary">Ajustar semana</a></div>
        </header>
        ${athlete.injuries ? `<div class="panel coach-injuries"><span class="live-col-label">Lesiones o molestias que registró</span><span>${escapeHtml(athlete.injuries)}</span></div>` : ''}

        <section class="coach-tiles coach-tiles-5" aria-label="Indicadores">${kpisHtml(summary)}</section>

        <section class="panel coach-card" aria-label="Fitness y fatiga">
          <div class="coach-card-head">
            <h2 class="perfil-h2" style="margin:0">Fitness y fatiga · ${CHART_WEEKS} semanas</h2>
            <div class="forma-chart-legend" style="margin:0">
              <span class="coach-legend"><span class="coach-legend-swatch" style="background:var(--accent)"></span>Fitness (CTL)</span>
              <span class="coach-legend"><span class="coach-legend-swatch" style="background:#5a6272"></span>Fatiga (ATL)</span>
            </div>
          </div>
          ${pmc.length >= 2 ? '<canvas id="coach-pmc" style="width:100%;height:220px;display:block"></canvas>' : '<p class="hint">Todavía no hay sesiones de bici suficientes para la gráfica.</p>'}
        </section>

        <section class="panel coach-card" aria-label="Carga por semana">
          <div class="coach-card-head">
            <h2 class="perfil-h2" style="margin:0">Carga por semana</h2>
            <span class="hint">Barra = TSS de bici · puntos = sesiones de fuerza/movilidad</span>
          </div>
          <div class="coach-weeks">${weeksHtml(weeks)}</div>
        </section>

        <section class="panel coach-card" aria-label="Sesiones recientes">
          <h2 class="perfil-h2" style="margin:0">Sesiones recientes</h2>
          ${
            recent.length
              ? `<div class="coach-table-wrap"><table class="coach-table">
                  <thead><tr><th scope="col">Día</th><th scope="col">Sesión</th><th scope="col">Duración</th><th scope="col">Carga</th><th scope="col">RPE</th><th scope="col">Fuente</th><th scope="col">Estado</th></tr></thead>
                  <tbody>${recent.map(sessionRowHtml).join('')}</tbody>
                </table></div>`
              : '<p class="hint">Sin sesiones en los últimos meses.</p>'
          }
          <span class="hint">La carga de fuerza y movilidad se mide como RPE × minutos y se muestra aparte: no se suma al TSS de la bici. Lo que llega por Strava no se muestra.</span>
        </section>`);

      const canvas = container.querySelector<HTMLCanvasElement>('#coach-pmc');
      if (canvas) {
        drawFitnessFatigueChart(canvas, pmc);
        resizeHandler = () => drawFitnessFatigueChart(canvas, pmc);
        window.addEventListener('resize', resizeHandler);
      }
    } catch (err) {
      shell(`<div class="error-box">No se pudo cargar el atleta: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`);
    }
  })();

  return cleanup;
}
