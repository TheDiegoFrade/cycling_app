import { computeSessionAnalytics } from '../../engine/analytics';
import { buildPlan, targetWattsAt } from '../../engine/plan';
import { powerZone } from '../../core/zones';
import { encodeFitActivity } from '../../export/fit';
import { uploadActivityFit } from '../../export/intervals-icu';
import { navigate } from '../router';
import { appState } from '../state';
import { saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { isStravaConfigured, uploadSessionToStrava } from '../../sync/strava';
import { downloadSessionSamples } from '../../sync/cloud-sync';
import type { CloudSessionSummary } from '../../sync/cloud-sync';
import { checkAndCelebrateAchievements } from '../achievement-toast';

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

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function profileForSession(session: SessionRecord) {
  return { ...appState.profile, ftp: session.ftp };
}

/** Fecha local en español (es-MX) — nunca el formato estadounidense del
 * navegador. Ver TORQ_DESIGN.md, bug de formato de fecha. */
function fmtDateEsMx(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${time}`;
}

function zoneBars(zones: { zone: number; seconds: number }[]): string {
  const total = zones.reduce((a, z) => a + z.seconds, 0) || 1;
  return `<div class="home-week-zonebar" style="height:12px">${zones
    .filter((z) => z.seconds > 0)
    .map((z) => `<div style="width:${(z.seconds / total) * 100}%;background:var(--z${z.zone})"></div>`)
    .join('')}</div>`;
}

// Antes leía appState.lastSession en vez de recibir la sesión que de
// verdad se está mostrando — eso es null por definición cuando el resumen
// viene de una sesión reconstruida de la nube (ver renderSummary: esa rama
// SOLO corre si appState.lastSession ya es falsy), así que el botón no
// hacía nada en silencio para cualquier sesión que no fuera la recién
// terminada en este mismo dispositivo. Encontrado en producción.
function downloadFit(session: SessionRecord): void {
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

/** Dibuja potencia + pulso (nunca cadencia, ver TORQ_DESIGN.md) con los
 * bloques planeados de fondo en color de zona — solo si el workout original
 * sigue en la biblioteca (una sesión importada de Strava/.fit no tiene uno). */
function drawSummaryGraph(canvas: HTMLCanvasElement, session: SessionRecord): void {
  if (session.samples.length < 2) return;
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
  g.clearRect(0, 0, w, h);

  const originalWorkout = appState.workouts.find((wo) => wo.id === session.workoutId);
  if (originalWorkout) {
    const plan = buildPlan(originalWorkout.intervals);
    originalWorkout.intervals.forEach((iv, i) => {
      const zone = powerZone(iv.power_pct);
      g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(`--z${zone}`).trim();
      g.globalAlpha = 0.22;
      g.fillRect(X(plan.segStart[i]), pad, X(plan.segStart[i] + iv.duration_s) - X(plan.segStart[i]), h - 2 * pad);
    });
    g.globalAlpha = 1;
  }

  const line = (key: 'power' | 'hr', min: number, max: number, color: string) => {
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
  line('power', 0, session.ftp * 1.3, 'rgba(242,244,247,.9)');
  line('hr', 80, 190, '#ff4d4d');

  g.strokeStyle = 'rgba(242,244,247,.15)';
  g.beginPath();
  g.moveTo(pad, h - pad);
  g.lineTo(w - pad, h - pad);
  g.stroke();
}

function metricCard(label: string, value: string, sub: string): string {
  return `<div class="panel summary-metric"><div class="live-col-label">${label}</div><div class="prepare-stat-num num">${value}</div><div class="summary-metric-sub">${sub}</div></div>`;
}

/** Plan contra real por bloque — solo si el workout original sigue en la
 * biblioteca (útil para saber qué tan cerca del objetivo fue cada bloque). */
function planVsRealHtml(session: SessionRecord): string {
  const originalWorkout = appState.workouts.find((w) => w.id === session.workoutId);
  if (!originalWorkout) return '<p class="hint">El workout original ya no está en tu biblioteca.</p>';
  const plan = buildPlan(originalWorkout.intervals);
  return originalWorkout.intervals
    .map((iv, i) => {
      const segStart = plan.segStart[i];
      const segSamples = session.samples.filter((s) => s.t >= segStart && s.t < segStart + iv.duration_s);
      if (segSamples.length === 0) return '';
      const avgActual = segSamples.reduce((a, s) => a + s.power, 0) / segSamples.length;
      const avgTarget =
        segSamples.reduce((a, s) => a + targetWattsAt(plan, s.t, session.ftp, 1), 0) / segSamples.length;
      const pct = avgTarget > 0 ? Math.round((avgActual / avgTarget) * 100) : 0;
      const pctColor = pct >= 97 && pct <= 103 ? 'var(--success)' : pct >= 90 ? 'var(--z4)' : 'var(--danger-text)';
      return `<div class="summary-block-row"><span>Bloque ${i + 1} — ${iv.name}</span><span>${Math.round(avgActual)} W · <span style="color:${pctColor}">${pct}%</span></span></div>`;
    })
    .join('');
}

function groupedAlertsHtml(session: SessionRecord): string {
  if (session.alerts.length === 0) return '<p class="hint">Ninguna — todo dentro de los límites.</p>';
  const counts = new Map<string, number>();
  session.alerts.forEach((a) => counts.set(a.message, (counts.get(a.message) ?? 0) + 1));
  const summaryRows = Array.from(counts.entries())
    .map(([message, count]) => `<div class="summary-block-row"><span>${message}</span><span>${count} ${count === 1 ? 'vez' : 'veces'}</span></div>`)
    .join('');
  const detailRows = session.alerts
    .map((a) => `<div class="summary-block-row"><span>${fmt(a.t)} · ${a.message}</span><span class="hint">${a.level}</span></div>`)
    .join('');
  return `${summaryRows}<div class="hint" style="margin:10px 0 4px">Detalle</div>${detailRows}`;
}

function intensityChangesHtml(session: SessionRecord): string {
  if (session.intensityChanges.length === 0) return '<p class="hint">Ninguno — corriste al 100% todo el tiempo.</p>';
  return session.intensityChanges.map((c) => `<div class="summary-block-row"><span>${fmt(c.t)}</span><span>${c.pct}%</span></div>`).join('');
}

/** Resumen reducido para una sesión que solo vive en la nube (grabada en
 * otro dispositivo) — la tabla `sessions` de Supabase solo guarda agregados,
 * no los samples segundo a segundo, así que no hay gráfica, curva de
 * potencia, zonas, avisos ni ajustes de intensidad que mostrar aquí. */
function renderCloudOnlySummary(container: HTMLElement, s: CloudSessionSummary): void {
  container.innerHTML = `
    <div class="screen summary-screen">
      <div class="summary-head">
        <div>
          <div class="hint">${fmtDateEsMx(s.startedAt)}</div>
          <h1 style="margin:4px 0 0">${s.workoutName}, completo</h1>
          <p class="hint" style="margin-top:4px">☁ Sincronizada desde otro dispositivo — solo hay resumen, no el detalle segundo a segundo.</p>
        </div>
      </div>

      <div class="panel">
        <div class="legend" style="position:static;display:flex;gap:20px;flex-wrap:wrap;font-size:13px">
          <span>Potencia avg <b class="num">${s.avgPower !== null ? Math.round(s.avgPower) : '—'}</b> · máx <b class="num">${s.maxPower !== null ? Math.round(s.maxPower) : '—'}</b> W</span>
          <span>Cadencia avg <b class="num">${s.avgCadence !== null ? Math.round(s.avgCadence) : '—'}</b> · máx <b class="num">${s.maxCadence !== null ? Math.round(s.maxCadence) : '—'}</b> rpm</span>
          <span>Pulso avg <b class="num">${s.avgHr !== null ? Math.round(s.avgHr) : '—'}</b> · máx <b class="num">${s.maxHr !== null ? Math.round(s.maxHr) : '—'}</b> lpm</span>
        </div>
      </div>

      <div class="summary-metrics-grid">
        ${metricCard('Potencia normalizada', s.normalizedPower !== null ? `${Math.round(s.normalizedPower)} W` : '—', '')}
        ${metricCard('Carga (TSS)', s.trainingStressScore !== null ? String(Math.round(s.trainingStressScore)) : '—', '')}
        ${metricCard('Intensidad (IF)', s.intensityFactor !== null ? fmt1(s.intensityFactor) : '—', 'de tu FTP')}
        ${metricCard('Variability Index', s.variabilityIndex !== null ? fmt1(s.variabilityIndex) : '—', '')}
        ${metricCard('Efficiency Factor', s.efficiencyFactor !== null ? s.efficiencyFactor.toFixed(2) : '—', '')}
        ${metricCard('Desacople', s.hrDriftPct !== null ? `${s.hrDriftPct > 0 ? '+' : ''}${fmt1(s.hrDriftPct)}%` : '—', '')}
      </div>

      ${
        s.rpe || s.note
          ? `<div class="panel summary-rpe-card">
              ${s.rpe ? `<div class="perfil-h2" style="font-size:22px">¿Qué tan duro se sintió? <span class="num">${s.rpe}/10</span></div>` : ''}
              ${s.note ? `<p class="hint" style="margin-top:8px">${s.note}</p>` : ''}
            </div>`
          : ''
      }
    </div>
  `;
}

function renderFullSummary(container: HTMLElement, session: SessionRecord, cloudNote?: string): void {
  const analytics = computeSessionAnalytics(session.samples, profileForSession(session));

  container.innerHTML = `
    <div class="screen summary-screen">
      <div class="summary-head">
        <div>
          <div class="hint">${fmtDateEsMx(session.startedAt)}</div>
          <h1 style="margin:4px 0 0">${session.workoutName}, completo</h1>
          ${cloudNote ? `<p class="hint" style="margin-top:4px">${cloudNote}</p>` : ''}
        </div>
        <div class="row-actions" style="margin:0">
          ${isStravaConfigured() ? '<button class="btn-light" id="strava-upload">Subir a Strava</button>' : ''}
          <button id="download-fit">Descargar .fit</button>
        </div>
      </div>
      ${isStravaConfigured() ? '<div id="strava-upload-result"></div>' : ''}

      <div class="panel summary-rpe-card">
        <div class="perfil-h2" style="font-size:22px">¿Qué tan duro se sintió?</div>
        <div class="summary-rpe-scale" id="rpe-scale">
          ${Array.from({ length: 10 }, (_, i) => i + 1)
            .map((v) => `<button class="summary-rpe-btn${session.rpe === v ? ' on' : ''}" data-rpe="${v}" title="${RPE_LABELS[v]}">${v}</button>`)
            .join('')}
        </div>
        <input id="session-note" placeholder="Notas para ti o tu coach" value="${session.note ?? ''}">
      </div>

      <div class="panel">
        <div class="legend" style="position:static;display:flex;gap:20px;flex-wrap:wrap;margin-bottom:8px;font-size:13px">
          <span><i style="background:rgba(242,244,247,.9);display:inline-block;width:18px;height:3px;margin-right:6px"></i>Potencia avg <b class="num">${Math.round(analytics.avgPower)}</b> · máx <b class="num">${Math.round(analytics.maxPower)}</b> W</span>
          <span><i style="background:var(--z2);display:inline-block;width:18px;height:3px;margin-right:6px"></i>Cadencia avg <b class="num">${Math.round(analytics.avgCadence)}</b> · máx <b class="num">${Math.round(analytics.maxCadence)}</b> rpm</span>
          <span><i style="background:#ff4d4d;display:inline-block;width:18px;height:3px;margin-right:6px"></i>Pulso avg <b class="num">${Math.round(analytics.avgHr)}</b> · máx <b class="num">${Math.round(analytics.maxHr)}</b> lpm</span>
        </div>
        <canvas id="g" style="width:100%;height:220px;display:block"></canvas>
        <div class="hint" style="margin-top:4px">Fondo: bloques planeados</div>
        <div style="margin-top:14px">
          <div class="live-col-label" style="margin-bottom:6px">Tiempo por zona — Potencia</div>
          ${zoneBars(analytics.powerZoneSeconds)}
        </div>
        ${
          analytics.hrZoneSeconds.length
            ? `<div style="margin-top:14px">
                <div class="live-col-label" style="margin-bottom:6px">Tiempo por zona — Pulso</div>
                ${zoneBars(analytics.hrZoneSeconds)}
              </div>`
            : ''
        }
      </div>

      <div class="summary-metrics-grid">
        ${metricCard('Potencia normalizada', `${Math.round(analytics.normalizedPower)} W`, '')}
        ${metricCard('Carga (TSS)', analytics.trainingStressScore !== null ? String(Math.round(analytics.trainingStressScore)) : '—', '')}
        ${metricCard('Intensidad (IF)', analytics.intensityFactor !== null ? fmt1(analytics.intensityFactor) : '—', 'de tu FTP')}
        ${metricCard('Variability Index', fmt1(analytics.variabilityIndex), '')}
        ${metricCard('Efficiency Factor', analytics.efficiencyFactor !== null ? analytics.efficiencyFactor.toFixed(2) : '—', '')}
        ${metricCard(
          'Desacople',
          analytics.hrDriftPct !== null ? `${analytics.hrDriftPct > 0 ? '+' : ''}${fmt1(analytics.hrDriftPct)}%` : '—',
          analytics.hrDriftPct !== null && analytics.hrDriftPct < 5 ? 'Buena base aeróbica' : '',
        )}
      </div>

      <div class="panel">
        <div class="perfil-h2" style="font-size:22px;margin-bottom:10px">Curva de potencia</div>
        ${
          analytics.powerCurve.length
            ? `<div class="row-actions" style="margin:0">${analytics.powerCurve
                .map(
                  (p) =>
                    `<div class="panel summary-metric" style="min-width:90px"><div class="live-col-label">${p.windowS < 60 ? `${p.windowS}s` : `${p.windowS / 60}min`}</div><div class="prepare-stat-num num" style="font-size:28px">${p.watts}<span style="font-size:14px;color:var(--text-muted)"> W</span></div></div>`,
                )
                .join('')}</div>`
            : '<p class="hint">Sesión muy corta para calcular la curva de potencia.</p>'
        }
      </div>

      <div class="panel">
        <div class="perfil-h2" style="font-size:22px;margin-bottom:10px">Plan contra real</div>
        ${planVsRealHtml(session)}
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="perfil-h2" style="font-size:22px;margin-bottom:10px">Avisos (${session.alerts.length})</div>
        ${groupedAlertsHtml(session)}
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="perfil-h2" style="font-size:22px;margin-bottom:10px">Ajustes de intensidad (${session.intensityChanges.length})</div>
        ${intensityChangesHtml(session)}
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="perfil-h2" style="font-size:22px;margin-bottom:10px">Subir a intervals.icu</div>
        ${
          appState.settings.intervalsIcu
            ? `<div class="row-actions"><button id="icu-upload">Subir</button></div><div id="icu-result"></div>`
            : `<p class="hint">Conecta tu Athlete ID y API key en <a href="#/profile">Perfil</a> primero.</p>`
        }
      </div>
    </div>
  `;

  drawSummaryGraph(container.querySelector('#g')!, session);

  container.querySelector('#download-fit')?.addEventListener('click', () => downloadFit(session));

  const stravaResultEl = container.querySelector<HTMLElement>('#strava-upload-result');
  container.querySelector('#strava-upload')?.addEventListener('click', async () => {
    if (!stravaResultEl) return;
    stravaResultEl.innerHTML = '<p class="hint">Subiendo…</p>';
    try {
      await uploadSessionToStrava(session, profileForSession(session));
      stravaResultEl.innerHTML = '<p class="hint">Enviado — Strava tarda un momento en procesarla, revisa tu perfil ahí.</p>';
    } catch (err) {
      stravaResultEl.innerHTML = `<div class="error-box">${err instanceof Error ? err.message : String(err)}</div>`;
    }
  });

  async function saveFeedback(): Promise<void> {
    const note = container.querySelector<HTMLInputElement>('#session-note')!.value.trim();
    session!.note = note || undefined;
    await saveSession(session!);
    appState.lastSession = session;
  }

  container.querySelectorAll<HTMLButtonElement>('[data-rpe]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      session.rpe = Number(btn.dataset.rpe);
      container.querySelectorAll('[data-rpe]').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      await saveFeedback();
    });
  });
  container.querySelector('#session-note')?.addEventListener('change', saveFeedback);

  const icuResultEl = container.querySelector<HTMLElement>('#icu-result');
  container.querySelector('#icu-upload')?.addEventListener('click', async () => {
    const creds = appState.settings.intervalsIcu;
    if (!creds || !icuResultEl) return;
    icuResultEl.innerHTML = '<p class="hint">Subiendo…</p>';
    try {
      const bytes = encodeFitActivity(new Date(session.startedAt), session.samples, profileForSession(session));
      await uploadActivityFit(creds, bytes, `${session.workoutName}.fit`);
      icuResultEl.innerHTML = '<p class="hint">Subido. Revisa tu cuenta de intervals.icu para confirmar.</p>';
    } catch (err) {
      icuResultEl.innerHTML = `<div class="error-box">Falló la subida: ${err instanceof Error ? err.message : String(err)}</div>`;
    }
  });
}

/** Arma un SessionRecord "de mentiras" a partir de samples reconstruidos del
 * .fit en la nube — sirve para reusar toda la vista de detalle tal cual.
 * alerts/intensityChanges quedan vacíos a propósito: eso solo lo calcula el
 * motor de reglas en vivo, en el dispositivo que grabó la sesión, y nunca se
 * sube a la nube (ver sync/cloud-sync.ts). */
function toSyntheticSession(s: CloudSessionSummary, samples: SessionRecord['samples']): SessionRecord {
  return {
    id: s.id,
    workoutId: '',
    workoutName: s.workoutName,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    ftp: s.ftp,
    samples,
    alerts: [],
    intensityChanges: [],
    rpe: s.rpe ?? undefined,
    note: s.note ?? undefined,
    stravaActivityId: s.stravaActivityId ?? undefined,
    source: s.source,
    kind: s.kind ?? undefined,
    completion: s.completion ?? undefined,
    plannedItemId: s.plannedItemId ?? undefined,
  };
}

const CLOUD_RECONSTRUCTED_NOTE =
  '☁ Reconstruida desde tu copia en la nube — los avisos y ajustes de intensidad de esa sesión no se sincronizan entre dispositivos, así que no aparecen aquí.';

export function renderSummary(container: HTMLElement): void {
  // se consume de inmediato (no solo se lee): si el usuario navega fuera y
  // vuelve a ver esta misma sesión desde Historial más tarde, no debe
  // volver a disparar una celebración de logros "nuevos".
  const justFinished = appState.justFinishedSession;
  appState.justFinishedSession = false;
  if (justFinished) void checkAndCelebrateAchievements();

  const session = appState.lastSession;
  const cloudSession = appState.lastCloudSession;

  if (session) {
    renderFullSummary(container, session);
    return;
  }

  if (cloudSession) {
    container.innerHTML = `
      <div class="screen">
        <h1>Resumen</h1>
        <p class="hint">Cargando detalle…</p>
      </div>`;
    void downloadSessionSamples(cloudSession.fitPath ?? '').then((samples) => {
      if (appState.lastCloudSession !== cloudSession) return; // navegó a otra sesión mientras cargaba
      if (samples && samples.length > 1) {
        renderFullSummary(container, toSyntheticSession(cloudSession, samples), CLOUD_RECONSTRUCTED_NOTE);
      } else {
        renderCloudOnlySummary(container, cloudSession);
      }
    });
    return;
  }

  container.innerHTML = `
    <div class="screen">
      <h1>Resumen</h1>
      <p class="hint">Todavía no hay ninguna sesión para mostrar.</p>
      <button id="go-home">Ir a Inicio</button>
    </div>`;
  container.querySelector('#go-home')?.addEventListener('click', () => navigate('home'));
}
