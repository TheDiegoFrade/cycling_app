import { encodeFitActivity } from '../../export/fit';
import { uploadActivityFit } from '../../export/intervals-icu';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function downloadFit(): void {
  const session = appState.lastSession;
  if (!session) return;
  const bytes = encodeFitActivity(new Date(session.startedAt), session.samples);
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.workoutName.replace(/[^\w-]+/g, '_')}.fit`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function drawSummaryGraph(canvas: HTMLCanvasElement): void {
  const session = appState.lastSession;
  if (!session || session.samples.length < 2) return;
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
  const total = session.samples[session.samples.length - 1].t || 1;
  const X = (t: number) => pad + (t / total) * (w - 2 * pad);
  const line = (key: 'power' | 'cadence' | 'hr', min: number, max: number, color: string) => {
    g.beginPath();
    g.strokeStyle = color;
    g.lineWidth = 2;
    session.samples.forEach((s, j) => {
      const x = X(s.t);
      const y = h - pad - ((s[key] - min) / (max - min)) * (h - 2 * pad);
      j ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  };
  g.clearRect(0, 0, w, h);
  line('power', 0, session.ftp * 1.3, 'rgba(255,255,255,.5)');
  line('cadence', 60, 110, '#4f9bd9');
  line('hr', 80, 190, '#e5322d');
}

export function renderSummary(container: HTMLElement): void {
  const session = appState.lastSession;

  if (!session) {
    container.innerHTML = `
      <div class="screen">
        ${renderNav('summary')}
        <h1>Resumen</h1>
        <p class="hint">Todavía no hay ninguna sesión grabada en esta pestaña.</p>
        <button id="go-home">Ir a Inicio</button>
      </div>`;
    container.querySelector('#go-home')?.addEventListener('click', () => navigate('home'));
    return;
  }

  const duration = session.samples.length;

  container.innerHTML = `
    <div class="screen">
      ${renderNav('summary')}
      <h1>${session.workoutName}</h1>
      <p class="hint">${new Date(session.startedAt).toLocaleString()} · duración ${fmt(duration)}</p>

      <div class="panel"><canvas id="g" style="width:100%;height:160px;display:block"></canvas></div>

      <h2>Alertas disparadas (${session.alerts.length})</h2>
      <div class="panel">
        ${
          session.alerts.length
            ? `<div class="list">${session.alerts
                .map((a) => `<div class="list-item"><span>${fmt(a.t)} · ${a.message}</span><span class="meta">${a.level}</span></div>`)
                .join('')}</div>`
            : '<p class="hint">Ninguna — todo dentro de los límites.</p>'
        }
      </div>

      <h2>Ajustes de intensidad (${session.intensityChanges.length})</h2>
      <div class="panel">
        ${
          session.intensityChanges.length
            ? `<div class="list">${session.intensityChanges.map((c) => `<div class="list-item"><span>${fmt(c.t)}</span><span class="meta">${c.pct}%</span></div>`).join('')}</div>`
            : '<p class="hint">Ninguno — corriste al 100% todo el tiempo.</p>'
        }
      </div>

      <h2>Exportar</h2>
      <div class="panel">
        <div class="row-actions">
          <button class="primary" id="download-fit">Descargar .fit</button>
        </div>
        <div class="callout" style="margin-top:14px">
          Subida a intervals.icu: mecanismo sin verificar contra la API real (necesita tu Athlete ID y API key).
        </div>
        <div class="grid-form" style="margin-top:10px">
          <label>Athlete ID<input id="icu-athlete" value="${appState.settings.intervalsIcu?.athleteId ?? ''}" placeholder="i12345"></label>
          <label>API key<input id="icu-key" type="password" value="${appState.settings.intervalsIcu?.apiKey ?? ''}"></label>
        </div>
        <div class="row-actions">
          <button id="icu-upload">Subir a intervals.icu</button>
        </div>
        <div id="icu-result"></div>
      </div>

      <div class="row-actions" style="margin-top:20px">
        <button id="go-home">Volver a Inicio</button>
      </div>
    </div>
  `;

  drawSummaryGraph(container.querySelector('#g')!);

  container.querySelector('#download-fit')?.addEventListener('click', downloadFit);
  container.querySelector('#go-home')?.addEventListener('click', () => navigate('home'));

  const resultEl = container.querySelector<HTMLElement>('#icu-result')!;
  container.querySelector('#icu-upload')?.addEventListener('click', async () => {
    const athleteId = container.querySelector<HTMLInputElement>('#icu-athlete')!.value.trim();
    const apiKey = container.querySelector<HTMLInputElement>('#icu-key')!.value.trim();
    if (!athleteId || !apiKey) {
      resultEl.innerHTML = '<div class="error-box">Falta Athlete ID o API key.</div>';
      return;
    }
    appState.settings = { ...appState.settings, intervalsIcu: { athleteId, apiKey } };
    appState.persistSettings();
    resultEl.innerHTML = '<p class="hint">Subiendo…</p>';
    try {
      const bytes = encodeFitActivity(new Date(session.startedAt), session.samples);
      await uploadActivityFit({ athleteId, apiKey }, bytes, `${session.workoutName}.fit`);
      resultEl.innerHTML = '<p class="hint">Subido. Revisa tu cuenta de intervals.icu para confirmar.</p>';
    } catch (err) {
      resultEl.innerHTML = `<div class="error-box">Falló la subida: ${err instanceof Error ? err.message : String(err)}</div>`;
    }
  });
}
