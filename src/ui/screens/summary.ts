import { computeSessionAnalytics } from '../../engine/analytics';
import { encodeFitActivity } from '../../export/fit';
import { uploadActivityFit } from '../../export/intervals-icu';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';
import { saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';

const RPE_LABELS: Record<number, string> = {
  1: 'muy, muy fácil',
  2: 'fácil',
  3: 'moderado',
  4: 'algo duro',
  5: 'duro',
  6: 'duro+',
  7: 'muy duro',
  8: 'muy duro+',
  9: 'extremo',
  10: 'máximo',
};

function fmt1(n: number): string {
  return n.toFixed(1);
}

function profileForSession(session: SessionRecord) {
  return { ...appState.profile, ftp: session.ftp };
}

const ZONE_COLOR_VARS = ['--z1', '--z2', '--z3', '--z4', '--z5', '--z6'];

function metricCard(label: string, value: string, sub?: string): string {
  return `<div class="card"><div class="label">${label}</div><div class="row"><div class="v num" style="font-size:44px">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}

function zoneBars(zones: { zone: number; seconds: number }[]): string {
  const total = zones.reduce((a, z) => a + z.seconds, 0) || 1;
  return zones
    .map((z) => {
      const pct = Math.round((z.seconds / total) * 100);
      return `
        <div class="toggle-row">
          <span>Z${z.zone}</span>
          <div style="flex:1;margin:0 12px;background:#1b2027;border-radius:4px;overflow:hidden;height:18px">
            <div style="width:${pct}%;height:100%;background:var(${ZONE_COLOR_VARS[z.zone - 1] ?? '--z1'})"></div>
          </div>
          <span class="meta">${fmt(z.seconds)} · ${pct}%</span>
        </div>`;
    })
    .join('');
}

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function downloadFit(): void {
  const session = appState.lastSession;
  if (!session) return;
  const bytes = encodeFitActivity(new Date(session.startedAt), session.samples, profileForSession(session));
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
  const analytics = computeSessionAnalytics(session.samples, profileForSession(session));

  container.innerHTML = `
    <div class="screen">
      ${renderNav('summary')}
      <h1>${session.workoutName}</h1>
      <p class="hint">${new Date(session.startedAt).toLocaleString()} · duración ${fmt(duration)}</p>

      <div class="panel"><canvas id="g" style="width:100%;height:160px;display:block"></canvas></div>

      <h2>Métricas</h2>
      <div class="nums" style="grid-template-columns:repeat(6,1fr)">
        ${metricCard('Potencia normalizada', `${Math.round(analytics.normalizedPower)}`, 'W')}
        ${metricCard('Intensity Factor', analytics.intensityFactor !== null ? fmt1(analytics.intensityFactor) : '—')}
        ${metricCard('TSS', analytics.trainingStressScore !== null ? String(Math.round(analytics.trainingStressScore)) : '—')}
        ${metricCard('Variability Index', fmt1(analytics.variabilityIndex))}
        ${metricCard('Efficiency Factor', analytics.efficiencyFactor !== null ? fmt1(analytics.efficiencyFactor) : '—')}
        ${metricCard('Desacople Pw:HR', analytics.hrDriftPct !== null ? `${analytics.hrDriftPct > 0 ? '+' : ''}${fmt1(analytics.hrDriftPct)}%` : '—')}
      </div>
      <p class="hint">Desacople Pw:HR: compara potencia/pulso entre la 1ª y 2ª mitad de la rodada. Menor a 5% suele indicar buena base aeróbica; solo aplica a sesiones largas y parejas (10+ min). Requiere pulso en ambas mitades.</p>
      <div class="panel" style="margin-top:10px">
        <div class="grid-form">
          <div><span class="label">Potencia</span><div>avg <b class="num">${Math.round(analytics.avgPower)}</b> W · máx <b class="num">${Math.round(analytics.maxPower)}</b> W</div></div>
          <div><span class="label">Cadencia</span><div>avg <b class="num">${Math.round(analytics.avgCadence)}</b> · máx <b class="num">${Math.round(analytics.maxCadence)}</b> rpm</div></div>
          <div><span class="label">Pulso</span><div>avg <b class="num">${Math.round(analytics.avgHr)}</b> · máx <b class="num">${Math.round(analytics.maxHr)}</b> lpm</div></div>
        </div>
      </div>

      <h2>Curva de potencia</h2>
      <div class="panel">
        ${
          analytics.powerCurve.length
            ? `<div class="row-actions">${analytics.powerCurve.map((p) => `<div class="card" style="min-width:90px"><div class="label">${p.windowS < 60 ? `${p.windowS}s` : `${p.windowS / 60}min`}</div><div class="v num" style="font-size:32px">${p.watts}<span style="font-size:16px;color:var(--muted)"> W</span></div></div>`).join('')}</div>`
            : '<p class="hint">Sesión muy corta para calcular la curva de potencia.</p>'
        }
      </div>

      <h2>Tiempo en zona</h2>
      <div class="panel">
        <div class="label" style="margin-bottom:6px">Potencia</div>
        ${zoneBars(analytics.powerZoneSeconds)}
        ${
          analytics.hrZoneSeconds.length
            ? `<div class="label" style="margin:14px 0 6px">Pulso</div>${zoneBars(analytics.hrZoneSeconds)}`
            : ''
        }
      </div>

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

      <h2>¿Cómo te sentiste?</h2>
      <div class="panel">
        <div class="grid-form">
          <label>RPE (esfuerzo percibido)
            <select id="rpe-select">
              <option value="">—</option>
              ${Array.from({ length: 10 }, (_, i) => i + 1)
                .map((v) => `<option value="${v}" ${session.rpe === v ? 'selected' : ''}>${v} — ${RPE_LABELS[v]}</option>`)
                .join('')}
            </select>
          </label>
        </div>
        <label style="display:block;margin-top:10px">Notas<textarea id="session-note" rows="3" style="width:100%" placeholder="¿Cómo lo sentiste? ¿Algo que el coach debería saber?">${session.note ?? ''}</textarea></label>
        <div class="row-actions" style="margin-top:10px"><button id="save-feedback">Guardar</button></div>
        <div id="feedback-result"></div>
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

  const feedbackResult = container.querySelector<HTMLElement>('#feedback-result')!;
  container.querySelector('#save-feedback')?.addEventListener('click', async () => {
    const rpeRaw = container.querySelector<HTMLSelectElement>('#rpe-select')!.value;
    const note = container.querySelector<HTMLTextAreaElement>('#session-note')!.value.trim();
    session.rpe = rpeRaw ? Number(rpeRaw) : undefined;
    session.note = note || undefined;
    await saveSession(session);
    appState.lastSession = session;
    feedbackResult.innerHTML = '<p class="hint">Guardado.</p>';
  });

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
      const bytes = encodeFitActivity(new Date(session.startedAt), session.samples, profileForSession(session));
      await uploadActivityFit({ athleteId, apiKey }, bytes, `${session.workoutName}.fit`);
      resultEl.innerHTML = '<p class="hint">Subido. Revisa tu cuenta de intervals.icu para confirmar.</p>';
    } catch (err) {
      resultEl.innerHTML = `<div class="error-box">Falló la subida: ${err instanceof Error ? err.message : String(err)}</div>`;
    }
  });
}
