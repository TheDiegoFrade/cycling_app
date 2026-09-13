import { computeSessionAnalytics } from '../../engine/analytics';
import { computePmc } from '../../engine/pmc';
import type { SessionRecord } from '../../storage/session-store';
import { listSessions } from '../../storage/session-store';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function dateKeyOf(session: SessionRecord): string {
  return session.startedAt.slice(0, 10);
}

function tssOf(session: SessionRecord): number {
  const profile = { ftp: session.ftp, hr_max: 190, cadence_floor: 70, hr_ceiling: 180 };
  return computeSessionAnalytics(session.samples, profile).trainingStressScore ?? 0;
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

  listSessions().then((sessions) => {
    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="screen">
          ${renderNav('history')}
          <h1>Historial</h1>
          <p class="hint">Todavía no hay sesiones guardadas.</p>
        </div>
      `;
      return;
    }

    const sorted = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const pmc = computePmc(sorted.map((s) => ({ dateKey: dateKeyOf(s), tss: tssOf(s) })));
    const latest = pmc[pmc.length - 1];

    container.innerHTML = `
      <div class="screen">
        ${renderNav('history')}
        <h1>Historial</h1>
        <p class="hint">${sessions.length} sesión(es) grabada(s) en esta pestaña.</p>

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

        <h2>Sesiones</h2>
        <div class="list">
          ${sorted
            .map(
              (s) => `
            <div class="list-item" data-session-id="${s.id}">
              <div>
                <div>${s.workoutName}</div>
                <div class="meta">${new Date(s.startedAt).toLocaleDateString()} · ${fmt(s.samples.length)} · TSS ${Math.round(tssOf(s))}</div>
              </div>
              <button data-action="view" data-session-id="${s.id}">Ver</button>
            </div>`,
            )
            .join('')}
        </div>
      </div>
    `;

    drawPmcChart(container.querySelector('#pmc')!, pmc);

    container.querySelectorAll<HTMLButtonElement>('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const session = sorted.find((s) => s.id === btn.dataset.sessionId);
        if (!session) return;
        appState.lastSession = session;
        navigate('summary');
      });
    });
  });
}
