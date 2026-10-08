// Detalle de una sesión de un atleta para su coach (#/coach-session/:atleta/:sesión).
// Lo mismo que ve el atleta en su resumen —gráfica, zonas, curva de
// potencia, plan contra real— reconstruido desde el .fit en la nube, más el
// botón para descargar ese .fit y analizarlo en otra herramienta (WKO5,
// Golden Cheetah…). Las sesiones de Strava no llegan aquí: RLS no deja que
// el coach las lea, ni la fila ni el archivo.
import { computeSessionAnalytics } from '../../engine/analytics';
import type { Interval } from '../../core/types';
import { COMPLETION_LABELS, NON_BIKE_KIND_LABELS, isNonBikeKind } from '../../core/session-kind';
import { fetchAthleteSession, fetchAthleteWorkout, listCoachAthletes } from '../../sync/coach-athletes';
import type { CoachAthlete } from '../../sync/coach-athletes';
import { downloadFitBlob, downloadSessionSamples } from '../../sync/cloud-sync';
import type { CloudSessionSummary } from '../../sync/cloud-sync';
import { fitFileName } from '../../core/file-names';
import { athleteName, errorMessage, sourceLabel } from '../coach-ui';
import { getRouteParam } from '../router';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';
import { drawSessionGraph, planVsRealRows, zoneBars } from './summary';
import type { Sample } from '../../core/types';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
}

function fmtDuration(s: CloudSessionSummary): string {
  const min = Math.round(Math.max(0, Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

function metric(label: string, value: string, sub = ''): string {
  return `<div class="panel summary-metric"><div class="live-col-label">${label}</div><div class="prepare-stat-num num">${value}</div><div class="summary-metric-sub">${sub}</div></div>`;
}

const n0 = (v: number | null | undefined, unit = '') => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v)}${unit}`);
const n1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1));

export function renderCoachSession(container: HTMLElement): () => void {
  const routeParam = getRouteParam();
  const [athleteId, sessionId] = (routeParam ?? '').split('/');
  let disposed = false;
  let resize: (() => void) | null = null;
  const stale = () => disposed || getRouteParam() !== routeParam;

  function shell(body: string, athlete: CoachAthlete | null = null): void {
    container.innerHTML = `<div class="screen coach-screen summary-screen"><a href="#/coach-athlete/${escapeHtml(athleteId ?? '')}" class="back-link">← ${athlete ? escapeHtml(athleteName(athlete)) : 'Atleta'}</a>${body}</div>`;
  }

  if (!appState.user || !appState.coach.isCoach) {
    shell('<p class="hint">Esta sección es solo para coaches.</p>');
    return () => {};
  }
  if (!athleteId || !sessionId) {
    shell('<p class="hint">Falta la sesión.</p>');
    return () => {};
  }

  shell('<p class="hint">Cargando la sesión…</p>');

  void (async () => {
    try {
      const [athlete, session] = await Promise.all([
        listCoachAthletes().then((list) => list.find((a) => a.userId === athleteId) ?? null),
        fetchAthleteSession(athleteId, sessionId),
      ]);
      if (stale()) return;
      if (!athlete) {
        shell('<p class="hint">Este atleta no está vinculado contigo (o se desvinculó).</p>');
        return;
      }
      if (!session) {
        shell('<p class="hint">No se encontró la sesión. Las actividades que llegan por Strava no se pueden ver aquí.</p>', athlete);
        return;
      }
      const [samples, workout] = await Promise.all([
        session.fitPath ? downloadSessionSamples(session.fitPath) : Promise.resolve(null),
        fetchAthleteWorkout(athleteId, session.workoutId),
      ]);
      if (stale()) return;
      render(athlete, session, samples && samples.length > 1 ? samples : null, workout?.intervals ?? null);
    } catch (err) {
      shell(`<div class="error-box">No se pudo cargar la sesión: ${escapeHtml(errorMessage(err))}</div>`);
    }
  })();

  function render(athlete: CoachAthlete, s: CloudSessionSummary, samples: Sample[] | null, intervals: Interval[] | null): void {
    const nonBike = isNonBikeKind(s.kind) ? s.kind : null;
    const profile = { ...appState.profile, ftp: s.ftp, hr_max: athlete.hrMax ?? appState.profile.hr_max };
    const a = samples ? computeSessionAnalytics(samples, profile) : null;
    const status = s.completion ? COMPLETION_LABELS[s.completion] : 'Hecha';
    const tags = [
      sourceLabel(s.source),
      nonBike ? NON_BIKE_KIND_LABELS[nonBike] : `FTP ${s.ftp} W`,
      status,
      fmtDuration(s),
    ];

    const metrics = a
      ? [
          metric('Potencia normalizada', n0(a.normalizedPower, ' W')),
          metric('Carga (TSS)', n0(a.trainingStressScore)),
          metric('Intensidad (IF)', a.intensityFactor !== null ? a.intensityFactor.toFixed(2) : '—', `FTP ${s.ftp} W`),
          metric('Variability Index', n1(a.variabilityIndex)),
          metric('Efficiency Factor', a.efficiencyFactor !== null ? a.efficiencyFactor.toFixed(2) : '—'),
          metric('Desacople', a.hrDriftPct !== null ? `${a.hrDriftPct > 0 ? '+' : ''}${n1(a.hrDriftPct)}%` : '—', a.hrDriftPct !== null && a.hrDriftPct < 5 ? 'Buena base aeróbica' : ''),
        ]
      : [
          metric('Potencia normalizada', n0(s.normalizedPower, ' W')),
          metric('Carga', nonBike ? n0(s.srpeLoad) : n0(s.trainingStressScore), nonBike ? 'sRPE (RPE × min)' : 'TSS'),
          metric('Intensidad (IF)', s.intensityFactor != null ? s.intensityFactor.toFixed(2) : '—'),
          metric('Variability Index', n1(s.variabilityIndex)),
          metric('Efficiency Factor', s.efficiencyFactor != null ? s.efficiencyFactor.toFixed(2) : '—'),
          metric('Desacople', s.hrDriftPct != null ? `${s.hrDriftPct > 0 ? '+' : ''}${n1(s.hrDriftPct)}%` : '—'),
        ];

    shell(
      `
      <div class="summary-head">
        <div>
          <div class="hint">${escapeHtml(athleteName(athlete))} · ${fmtDate(s.startedAt)}</div>
          <h1 style="margin:4px 0 0">${escapeHtml(s.workoutName)}</h1>
          <div class="coach-pills" style="margin-top:8px">${tags.map((t) => `<span class="coach-pill">${escapeHtml(t)}</span>`).join('')}</div>
        </div>
        <div class="row-actions" style="margin:0">
          ${s.fitPath ? '<button type="button" class="btn-light" id="cs-download">Descargar .fit</button>' : ''}
        </div>
      </div>
      <div id="cs-download-status" class="hint" aria-live="polite"></div>

      ${
        s.rpe || s.note
          ? `<div class="panel summary-rpe-card">
              ${s.rpe ? `<div class="perfil-h2" style="font-size:22px">Cómo se sintió: <span class="num">${s.rpe}/10</span></div>` : ''}
              ${s.note ? `<p style="margin:8px 0 0">“${escapeHtml(s.note)}”</p>` : ''}
            </div>`
          : ''
      }

      ${
        a
          ? `<div class="panel">
              <div class="legend" style="position:static;display:flex;gap:20px;flex-wrap:wrap;margin-bottom:8px;font-size:13px">
                <span><i style="background:rgba(242,244,247,.9);display:inline-block;width:18px;height:3px;margin-right:6px"></i>Potencia avg <b class="num">${n0(a.avgPower)}</b> · máx <b class="num">${n0(a.maxPower)}</b> W</span>
                <span><i style="background:var(--z2);display:inline-block;width:18px;height:3px;margin-right:6px"></i>Cadencia avg <b class="num">${n0(a.avgCadence)}</b> · máx <b class="num">${n0(a.maxCadence)}</b> rpm</span>
                <span><i style="background:#ff4d4d;display:inline-block;width:18px;height:3px;margin-right:6px"></i>Pulso avg <b class="num">${n0(a.avgHr)}</b> · máx <b class="num">${n0(a.maxHr)}</b> lpm</span>
              </div>
              <canvas id="cs-graph" style="width:100%;height:240px;display:block"></canvas>
              ${intervals ? '<div class="hint" style="margin-top:4px">Fondo: bloques planeados</div>' : ''}
              <div style="margin-top:14px"><div class="live-col-label" style="margin-bottom:6px">Tiempo por zona — Potencia</div>${zoneBars(a.powerZoneSeconds)}</div>
              ${a.hrZoneSeconds.length ? `<div style="margin-top:14px"><div class="live-col-label" style="margin-bottom:6px">Tiempo por zona — Pulso</div>${zoneBars(a.hrZoneSeconds)}</div>` : ''}
            </div>`
          : `<div class="panel"><p class="hint" style="margin:0">${
              nonBike ? 'Sesión registrada a mano: no tiene datos segundo a segundo.' : s.fitPath ? 'No se pudo leer el archivo de esta sesión; abajo está el resumen.' : 'Esta sesión no tiene archivo .fit; abajo está el resumen.'
            }</p></div>`
      }

      <div class="summary-metrics-grid">${metrics.join('')}</div>

      ${
        a && a.powerCurve.length
          ? `<div class="panel">
              <div class="perfil-h2" style="font-size:22px;margin-bottom:10px">Curva de potencia</div>
              <div class="row-actions" style="margin:0">${a.powerCurve
                .map(
                  (p) =>
                    `<div class="panel summary-metric" style="min-width:90px"><div class="live-col-label">${p.windowS < 60 ? `${p.windowS}s` : `${p.windowS / 60}min`}</div><div class="prepare-stat-num num" style="font-size:28px">${p.watts}<span style="font-size:14px;color:var(--text-muted)"> W</span></div></div>`,
                )
                .join('')}</div>
            </div>`
          : ''
      }

      ${
        samples && intervals
          ? `<div class="panel">
              <div class="perfil-h2" style="font-size:22px;margin-bottom:10px">Plan contra real</div>
              ${planVsRealRows(samples, s.ftp, intervals)}
            </div>`
          : ''
      }
      `,
      athlete,
    );

    const canvas = container.querySelector<HTMLCanvasElement>('#cs-graph');
    if (canvas && samples) {
      const draw = () => drawSessionGraph(canvas, samples, s.ftp, intervals);
      draw();
      resize = draw;
      window.addEventListener('resize', draw);
    }

    container.querySelector('#cs-download')?.addEventListener('click', async () => {
      const statusEl = container.querySelector<HTMLElement>('#cs-download-status');
      if (!s.fitPath) return;
      if (statusEl) statusEl.textContent = 'Descargando…';
      try {
        const blob = await downloadFitBlob(s.fitPath);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fitFileName(athleteName(athlete), s.startedAt, s.workoutName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (statusEl) statusEl.textContent = '';
      } catch (err) {
        if (statusEl) statusEl.textContent = `No se pudo descargar: ${errorMessage(err)}`;
      }
    });
  }

  return () => {
    disposed = true;
    if (resize) window.removeEventListener('resize', resize);
  };
}
