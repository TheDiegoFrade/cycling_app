import { buildCompletedSessionFromFit } from '../../core/completed-session-import';
import { computeSessionAnalytics } from '../../engine/analytics';
import { computePmc } from '../../engine/pmc';
import type { SessionRecord } from '../../storage/session-store';
import { deleteSession, listSessions, saveSession } from '../../storage/session-store';
import { navigate, refresh } from '../router';
import { appState } from '../state';
import { deleteSessionFromCloud, pushSessionToCloud } from '../../sync/cloud-sync';
import { importStravaActivity, isStravaConfigured, listStravaActivities } from '../../sync/strava';
import { renderWorkoutCover } from '../workout-cover';

const STRAVA_IMPORT_WINDOW_DAYS = 60;
const CHART_WEEKS = 6;

interface HistoryRow {
  id: string;
  workoutId: string;
  workoutName: string;
  startedAt: string;
  durationS: number;
  tss: number;
  ef: number | null;
  rpe: number | null;
  origin: 'local' | 'cloud';
  fromStrava: boolean;
}

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fecha local en español (es-MX) — nunca el formato estadounidense del
 * navegador (ver TORQ_DESIGN.md, bug de formato de fecha). */
function fmtDateEsMx(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function analyticsOf(session: SessionRecord) {
  const profile = { ...appState.profile, ftp: session.ftp };
  return computeSessionAnalytics(session.samples, profile);
}

function localRow(session: SessionRecord): HistoryRow {
  const a = analyticsOf(session);
  return {
    id: session.id,
    workoutId: session.workoutId,
    workoutName: session.workoutName,
    startedAt: session.startedAt,
    durationS: session.samples.length,
    tss: a.trainingStressScore ?? 0,
    ef: a.efficiencyFactor,
    rpe: session.rpe ?? null,
    origin: 'local',
    fromStrava: session.stravaActivityId !== undefined,
  };
}

function cloudRow(s: (typeof appState.cloudSessions)[number]): HistoryRow {
  return {
    id: s.id,
    workoutId: '',
    workoutName: s.workoutName,
    startedAt: s.startedAt,
    // aproximado (fin - inicio de reloj): la nube no guarda samples, así que
    // no sabemos el tiempo "corriendo" exacto si hubo pausas largas.
    durationS: Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000),
    tss: s.trainingStressScore ?? 0,
    ef: s.efficiencyFactor,
    rpe: s.rpe,
    origin: 'cloud',
    fromStrava: s.stravaActivityId !== null,
  };
}

function formInterpretation(tsb: number): string {
  if (tsb > 5) return 'Estás fresco y con buena base. Buen momento para meter intensidad esta semana.';
  if (tsb < -10) return 'Traes fatiga acumulada — considera un día suave o de descanso.';
  return 'Carga equilibrada entre esfuerzo y descanso. Sigue como vas.';
}

/** El color del número debe confirmar la lectura de formInterpretation, no
 * contradecirla — un -5 en azul "positivo" se ve alarmante junto a un
 * mensaje tranquilo. Mismos cortes que formInterpretation. */
function formaColor(tsb: number): string {
  if (tsb > 5) return 'var(--accent)';
  if (tsb < -10) return 'var(--danger-text)';
  return 'var(--text)';
}

function drawFitnessFatigueChart(canvas: HTMLCanvasElement, points: ReturnType<typeof computePmc>): void {
  if (points.length < 2) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;
  const pad = 10;

  const allValues = points.flatMap((p) => [p.ctl, p.atl]);
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);
  const X = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const Y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad);

  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(242,244,247,.08)';
  g.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((f) => {
    g.beginPath();
    g.moveTo(pad, pad + f * (h - 2 * pad));
    g.lineTo(w - pad, pad + f * (h - 2 * pad));
    g.stroke();
  });

  const line = (key: 'ctl' | 'atl', color: string, lw: number) => {
    g.beginPath();
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.lineJoin = 'round';
    points.forEach((p, i) => {
      const x = X(i);
      const y = Y(p[key]);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  };
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3d8bff';
  line('atl', '#5a6272', 2);
  line('ctl', accent, 3.5);
}

function drawEfChart(canvas: HTMLCanvasElement, points: { dateKey: string; ef: number }[]): void {
  if (points.length < 2) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;
  const pad = 10;

  const values = points.map((p) => p.ef);
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.05;
  const X = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const Y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad);

  g.clearRect(0, 0, w, h);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3d8bff';
  g.strokeStyle = accent;
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  g.beginPath();
  points.forEach((p, i) => {
    const x = X(i);
    const y = Y(p.ef);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
  points.forEach((p, i) => {
    g.beginPath();
    g.fillStyle = accent;
    g.arc(X(i), Y(p.ef), 2.5, 0, Math.PI * 2);
    g.fill();
  });
}

function activityCoverHtml(row: HistoryRow): string {
  const workout = appState.workouts.find((w) => w.id === row.workoutId);
  return workout ? renderWorkoutCover(workout.intervals, 'sm') : `<div class="workout-cover workout-cover-sm" style="background:var(--surface)"></div>`;
}

function importSectionHtml(): string {
  return `
    <h2 class="perfil-h2" style="margin-top:32px">Importar actividades</h2>
    ${
      isStravaConfigured()
        ? `<div class="row-actions" style="margin:0 0 8px">
            <button id="strava-import">Importar de Strava</button>
          </div>
          <p class="hint" id="strava-import-result">Trae tus rodadas de los últimos ${STRAVA_IMPORT_WINDOW_DAYS} días (necesitas tener Strava conectado en Perfil).</p>`
        : ''
    }
    <div class="panel row-actions" style="align-items:flex-end">
      <label>Fecha<input type="date" id="fit-import-date" value="${toDateKey(new Date())}"></label>
      <button id="fit-import-btn">Elegir archivo .fit</button>
      <input type="file" id="fit-import-file" accept=".fit" style="display:none">
    </div>
    <div id="fit-import-result"></div>
  `;
}

function wireImportSection(container: HTMLElement, localSessions: SessionRecord[]): void {
  const stravaResultEl = container.querySelector<HTMLElement>('#strava-import-result');
  container.querySelector('#strava-import')?.addEventListener('click', async () => {
    if (!stravaResultEl) return;
    stravaResultEl.textContent = 'Buscando actividades nuevas…';
    try {
      const known = new Set<number>();
      localSessions.forEach((s) => s.stravaActivityId !== undefined && known.add(s.stravaActivityId));
      appState.cloudSessions.forEach((s) => s.stravaActivityId !== null && known.add(s.stravaActivityId!));

      const afterUnixS = Math.floor(Date.now() / 1000) - STRAVA_IMPORT_WINDOW_DAYS * 24 * 3600;
      const activities = await listStravaActivities(afterUnixS);
      const pending = activities.filter((a) => !known.has(a.id));

      if (pending.length === 0) {
        stravaResultEl.textContent = 'No hay rodadas nuevas que importar.';
        return;
      }
      for (let i = 0; i < pending.length; i++) {
        stravaResultEl.textContent = `Importando ${i + 1} de ${pending.length}: ${pending[i].name}…`;
        await importStravaActivity(pending[i], appState.profile, appState.user?.id ?? null);
      }
      refresh();
    } catch (err) {
      stravaResultEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  const fitResultEl = container.querySelector<HTMLElement>('#fit-import-result')!;
  const fitDateInput = container.querySelector<HTMLInputElement>('#fit-import-date')!;
  const fitFileInput = container.querySelector<HTMLInputElement>('#fit-import-file')!;
  container.querySelector('#fit-import-btn')?.addEventListener('click', () => fitFileInput.click());
  fitFileInput.addEventListener('change', async () => {
    const file = fitFileInput.files?.[0];
    fitFileInput.value = '';
    if (!file) return;
    fitResultEl.innerHTML = '<p class="hint">Leyendo archivo…</p>';
    const { session, errors } = await buildCompletedSessionFromFit(file, appState.profile, fitDateInput.value || undefined);
    if (errors.length > 0) {
      fitResultEl.innerHTML = `<div class="error-box"><strong>${errors.length} error(es):</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
      return;
    }
    if (session) {
      await saveSession(session);
      if (appState.user) void pushSessionToCloud(session, appState.profile, appState.user.id);
      refresh();
    }
  });
}

export function renderForma(container: HTMLElement): void {
  container.innerHTML = `
    <div class="screen">
      <h1>Forma</h1>
      <p class="hint">Cargando…</p>
    </div>
  `;

  listSessions().then((localSessions) => {
    const localById = new Map(localSessions.map((s) => [s.id, s]));
    const rows: HistoryRow[] = [
      ...localSessions.map(localRow),
      ...appState.cloudSessions.filter((s) => !localById.has(s.id)).map(cloudRow),
    ];

    if (rows.length === 0) {
      container.innerHTML = `
        <div class="screen forma-screen">
          <h1>Tu forma</h1>
          <p class="hint">Todavía no hay sesiones guardadas — tu Fitness/Fatiga/Forma aparece aquí en cuanto completes la primera.</p>
          ${importSectionHtml()}
        </div>
      `;
      wireImportSection(container, localSessions);
      return;
    }

    const sorted = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const pmcAll = computePmc(sorted.map((r) => ({ dateKey: r.startedAt.slice(0, 10), tss: r.tss })));
    const latest = pmcAll[pmcAll.length - 1];
    const pmcChart = pmcAll.slice(-CHART_WEEKS * 7);

    const efPoints = [...sorted]
      .reverse()
      .map((r) => ({ dateKey: r.startedAt.slice(0, 10), ef: r.ef }))
      .filter((p): p is { dateKey: string; ef: number } => p.ef !== null);

    container.innerHTML = `
      <div class="screen forma-screen">
        <div class="forma-top">
          <div class="forma-left">
            <h1>Tu forma</h1>
            ${
              latest
                ? `<div class="forma-numbers">
                    <div><div class="forma-num num">${Math.round(latest.ctl)}</div><div class="live-col-label">Fitness</div></div>
                    <div><div class="forma-num num" style="color:var(--text-muted)">${Math.round(latest.atl)}</div><div class="live-col-label">Fatiga</div></div>
                    <div><div class="forma-num num" style="color:${formaColor(latest.tsb)}">${latest.tsb > 0 ? '+' : ''}${Math.round(latest.tsb)}</div><div class="live-col-label">Forma</div></div>
                  </div>
                  <p class="forma-phrase">${formInterpretation(latest.tsb)}</p>`
                : ''
            }
            <div class="panel forma-chart-panel">
              <div class="forma-chart-legend">
                <span class="home-legend-item"><span class="home-legend-dot" style="width:18px;height:3px;border-radius:2px;background:var(--accent)"></span>Fitness</span>
                <span class="home-legend-item"><span class="home-legend-dot" style="width:18px;height:3px;border-radius:2px;background:#5a6272"></span>Fatiga</span>
                <span class="live-col-label" style="margin-left:auto">Últimas ${CHART_WEEKS} semanas</span>
              </div>
              <canvas id="pmc" style="width:100%;height:220px;display:block"></canvas>
            </div>
          </div>
        </div>

        ${
          efPoints.length >= 2
            ? `<h2 class="perfil-h2" style="margin-top:28px">Tendencia de eficiencia aeróbica (EF)</h2>
        <div class="panel">
          <p class="hint">NP / pulso promedio de cada sesión — una tendencia al alza es la señal más directa de que tu base aeróbica está mejorando.</p>
          <canvas id="ef" style="width:100%;height:120px;display:block"></canvas>
        </div>`
            : ''
        }

        <h2 class="perfil-h2" style="margin-top:28px">Actividad</h2>
        <div class="forma-list">
          ${sorted
            .map((r) => {
              const meta = [`TSS ${Math.round(r.tss)}`];
              if (r.ef !== null) meta.push(`EF ${r.ef.toFixed(2)}`);
              if (r.rpe) meta.push(`RPE ${r.rpe}`);
              return `
              <div class="forma-row" data-action="view" data-session-id="${r.id}" data-origin="${r.origin}" role="button" tabindex="0">
                ${activityCoverHtml(r)}
                <div class="forma-row-info">
                  <div class="forma-row-name">${r.workoutName}</div>
                  <div class="live-col-label forma-row-name">${fmtDateEsMx(r.startedAt)} · ${fmt(r.durationS)} · ${r.fromStrava ? 'Strava' : 'TORQ'}${r.origin === 'cloud' ? ' · ☁ solo resumen' : ''}</div>
                </div>
                <div class="live-col-label forma-row-meta">${meta.join(' · ')}</div>
                <button class="live-menu-item danger forma-delete" data-action="delete" data-session-id="${r.id}" data-origin="${r.origin}">Borrar</button>
              </div>`;
            })
            .join('')}
        </div>

        ${importSectionHtml()}
      </div>
    `;

    drawFitnessFatigueChart(container.querySelector('#pmc')!, pmcChart);
    const efCanvas = container.querySelector<HTMLCanvasElement>('#ef');
    if (efCanvas) drawEfChart(efCanvas, efPoints);

    container.querySelectorAll<HTMLElement>('[data-action="view"]').forEach((el) => {
      const openSession = (): void => {
        const origin = el.dataset.origin as 'local' | 'cloud';
        if (origin === 'local') {
          const session = localById.get(el.dataset.sessionId!);
          if (!session) return;
          appState.lastSession = session;
          appState.lastCloudSession = null;
        } else {
          const cloud = appState.cloudSessions.find((s) => s.id === el.dataset.sessionId);
          if (!cloud) return;
          appState.lastSession = null;
          appState.lastCloudSession = cloud;
        }
        navigate('session');
      };
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-action="delete"]')) return;
        openSession();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSession();
        }
      });
    });

    container.querySelectorAll<HTMLElement>('[data-action="delete"]').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.sessionId!;
        const origin = el.dataset.origin as 'local' | 'cloud';
        if (!window.confirm('¿Borrar esta sesión? No se puede deshacer.')) return;

        if (origin === 'local') {
          await deleteSession(id);
          // best-effort: si también estaba sincronizada, la quita de la nube
          // para que no reaparezca como "solo en la nube" después.
          if (appState.user) await deleteSessionFromCloud(id, appState.user.id);
        } else if (appState.user) {
          await deleteSessionFromCloud(id, appState.user.id);
          appState.cloudSessions = appState.cloudSessions.filter((s) => s.id !== id);
        }
        refresh();
      });
    });

    wireImportSection(container, localSessions);
  });
}
