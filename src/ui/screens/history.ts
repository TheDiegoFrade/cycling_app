import { computeSessionAnalytics } from '../../engine/analytics';
import { computePmc } from '../../engine/pmc';
import type { SessionRecord } from '../../storage/session-store';
import { deleteSession, listSessions } from '../../storage/session-store';
import { renderNav } from '../nav';
import { navigate, refresh } from '../router';
import { appState } from '../state';
import { deleteSessionFromCloud } from '../../sync/cloud-sync';
import { importStravaActivity, isStravaConfigured, listStravaActivities } from '../../sync/strava';

const STRAVA_IMPORT_WINDOW_DAYS = 60;

/** Una fila de la lista/tendencias: local (con samples, "Ver" funciona) o
 * solo-nube (grabada en otro dispositivo, resumen nada más — ver
 * sync/cloud-sync.ts sobre por qué no hay samples ahí). */
interface HistoryRow {
  id: string;
  workoutName: string;
  startedAt: string;
  durationS: number;
  tss: number;
  ef: number | null;
  rpe: number | null;
  origin: 'local' | 'cloud';
}

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function analyticsOf(session: SessionRecord) {
  const profile = { ftp: session.ftp, hr_max: 190, cadence_floor: 70, hr_ceiling: 180, hr_min: 0, cadence_max: 999 };
  return computeSessionAnalytics(session.samples, profile);
}

function localRow(session: SessionRecord): HistoryRow {
  const a = analyticsOf(session);
  return {
    id: session.id,
    workoutName: session.workoutName,
    startedAt: session.startedAt,
    durationS: session.samples.length,
    tss: a.trainingStressScore ?? 0,
    ef: a.efficiencyFactor,
    rpe: session.rpe ?? null,
    origin: 'local',
  };
}

function cloudRow(s: (typeof appState.cloudSessions)[number]): HistoryRow {
  return {
    id: s.id,
    workoutName: s.workoutName,
    startedAt: s.startedAt,
    // aproximado (fin - inicio de reloj): la nube no guarda samples, así que
    // no sabemos el tiempo "corriendo" exacto si hubo pausas largas.
    durationS: Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000),
    tss: s.trainingStressScore ?? 0,
    ef: s.efficiencyFactor,
    rpe: s.rpe,
    origin: 'cloud',
  };
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
  const Y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);

  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#6fcf97';
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
    g.fillStyle = '#6fcf97';
    g.arc(X(i), Y(p.ef), 2.5, 0, Math.PI * 2);
    g.fill();
  });
}

function drawPmcChart(canvas: HTMLCanvasElement, points: ReturnType<typeof computePmc>): void {
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
  const topPad = 10;

  const allValues = points.flatMap((p) => [p.ctl, p.atl, p.tsb]);
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);
  const X = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const Y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - topPad - pad);

  g.clearRect(0, 0, w, h);

  // línea de TSB = 0 como referencia
  g.strokeStyle = '#232830';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(pad, Y(0));
  g.lineTo(w - pad, Y(0));
  g.stroke();

  const line = (key: 'ctl' | 'atl' | 'tsb', color: string, lw: number) => {
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
  line('tsb', 'rgba(255,255,255,.35)', 1.5);
  line('atl', '#e5322d', 2);
  line('ctl', '#4f9bd9', 2.5);
}

export function renderHistory(container: HTMLElement): void {
  container.innerHTML = `
    <div class="screen">
      ${renderNav('history')}
      <h1>Historial</h1>
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
        <div class="screen">
          ${renderNav('history')}
          <h1>Historial</h1>
          <p class="hint">Todavía no hay sesiones guardadas.</p>
        </div>
      `;
      return;
    }

    const sorted = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const pmc = computePmc(sorted.map((r) => ({ dateKey: r.startedAt.slice(0, 10), tss: r.tss })));
    const latest = pmc[pmc.length - 1];

    // tendencia de EF: cronológico (más viejo primero)
    const efPoints = [...sorted]
      .reverse()
      .map((r) => ({ dateKey: r.startedAt.slice(0, 10), ef: r.ef }))
      .filter((p): p is { dateKey: string; ef: number } => p.ef !== null);

    const cloudCount = rows.filter((r) => r.origin === 'cloud').length;

    container.innerHTML = `
      <div class="screen">
        ${renderNav('history')}
        <h1>Historial</h1>
        <p class="hint">${rows.length} sesión(es)${cloudCount ? ` · ${cloudCount} sincronizada(s) desde otro dispositivo` : ' grabada(s) en esta pestaña'}.</p>

        ${
          isStravaConfigured()
            ? `<div class="row-actions">
                <button id="strava-import">Importar de Strava</button>
              </div>
              <p class="hint" id="strava-import-result">Trae tus rodadas de los últimos ${STRAVA_IMPORT_WINDOW_DAYS} días (necesitas tener Strava conectado en Cuenta).</p>`
            : ''
        }

        <h2>Fitness / Fatigue / Form</h2>
        <div class="panel">
          <div class="legend" style="position:static;display:flex;gap:16px;margin-bottom:8px">
            <span><i style="background:#4f9bd9;display:inline-block;width:18px;height:3px;margin-right:6px"></i>CTL (fitness)</span>
            <span><i style="background:#e5322d;display:inline-block;width:18px;height:3px;margin-right:6px"></i>ATL (fatigue)</span>
            <span><i style="background:rgba(255,255,255,.5);display:inline-block;width:18px;height:3px;margin-right:6px"></i>TSB (form)</span>
          </div>
          <canvas id="pmc" style="width:100%;height:180px;display:block"></canvas>
          ${
            latest
              ? `<div class="grid-form" style="margin-top:12px">
                  <div><span class="label">Fitness (CTL)</span><div class="num" style="font-size:28px">${Math.round(latest.ctl)}</div></div>
                  <div><span class="label">Fatigue (ATL)</span><div class="num" style="font-size:28px">${Math.round(latest.atl)}</div></div>
                  <div><span class="label">Form (TSB)</span><div class="num" style="font-size:28px">${Math.round(latest.tsb)}</div></div>
                </div>`
              : ''
          }
        </div>

        ${
          efPoints.length >= 2
            ? `<h2>Eficiencia aeróbica (EF)</h2>
        <div class="panel">
          <p class="hint">NP / pulso promedio de cada sesión. Una tendencia al alza es la señal más directa de que tu base aeróbica está mejorando, aparte del FTP.</p>
          <canvas id="ef" style="width:100%;height:120px;display:block"></canvas>
        </div>`
            : ''
        }

        <h2>Sesiones</h2>
        <div class="list">
          ${sorted
            .map((r) => {
              const parts = [`TSS ${Math.round(r.tss)}`];
              if (r.ef !== null) parts.push(`EF ${r.ef.toFixed(2)}`);
              if (r.rpe) parts.push(`RPE ${r.rpe}`);
              if (r.origin === 'cloud') parts.push('☁ solo en la nube');
              return `
            <div class="list-item" data-session-id="${r.id}">
              <div>
                <div>${r.workoutName}</div>
                <div class="meta">${new Date(r.startedAt).toLocaleDateString()} · ${fmt(r.durationS)} · ${parts.join(' · ')}</div>
              </div>
              <div class="row-actions">
                ${r.origin === 'local' ? `<button data-action="view" data-session-id="${r.id}">Ver</button>` : ''}
                <button data-action="delete" data-session-id="${r.id}" data-origin="${r.origin}">Borrar</button>
              </div>
            </div>`;
            })
            .join('')}
        </div>
      </div>
    `;

    drawPmcChart(container.querySelector('#pmc')!, pmc);
    const efCanvas = container.querySelector<HTMLCanvasElement>('#ef');
    if (efCanvas) drawEfChart(efCanvas, efPoints);

    container.querySelectorAll<HTMLButtonElement>('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const session = localById.get(btn.dataset.sessionId!);
        if (!session) return;
        appState.lastSession = session;
        navigate('summary');
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.sessionId!;
        const origin = btn.dataset.origin as 'local' | 'cloud';
        if (!confirm('¿Borrar esta sesión? No se puede deshacer.')) return;

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
  });
}
