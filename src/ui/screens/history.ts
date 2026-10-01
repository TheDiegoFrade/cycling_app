import { formLabel, suggestToday } from '../../engine/coaching';
import { computeSessionAnalytics } from '../../engine/analytics';
import { computePmc, futureTssEntries } from '../../engine/pmc';
import { computeWeeklyStreak, computeWeeklyVolumeTrend } from '../../engine/streaks';
import { buildAchievementInput, evaluateAchievements } from '../../engine/achievements';
import { isLiveRecorded } from '../../core/session-origin';
import { estimateWorkout } from '../../core/workout-estimate';
import { findTemplate } from '../../core/workout-templates';
import type { Workout } from '../../core/types';
import type { SessionRecord } from '../../storage/session-store';
import { listSessions } from '../../storage/session-store';
import { saveWorkout } from '../../storage/workout-store';
import { refresh } from '../router';
import { appState } from '../state';
import { backfillPowerRecords, getPowerRecords } from '../../sync/cloud-sync';
import type { PowerRecords } from '../../sync/cloud-sync';
import { pushWorkoutToCloud } from '../../sync/workout-sync';
import { markAchievementsSeen } from '../achievement-toast';

const CHART_WEEKS = 6;

interface HistoryRow {
  id: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: string;
  durationS: number;
  tss: number;
  ef: number | null;
  rpe: number | null;
  origin: 'local' | 'cloud';
  fromStrava: boolean;
  ftp: number;
  avgCadence: number | null;
}

/** Si esta sesión cuenta para rachas/récords/logros — ver
 * core/session-origin.ts. `fromStrava` ya es un booleano derivado acá, así
 * que se adapta a lo que isLiveRecorded espera sin guardar el id crudo. */
function isRowLiveRecorded(r: HistoryRow): boolean {
  return isLiveRecorded({ workoutId: r.workoutId, stravaActivityId: r.fromStrava ? 0 : null });
}

interface PowerBest {
  watts: number;
  dateKey: string;
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
    ftp: session.ftp,
    // computeSessionAnalytics no filtra ceros de cadencia como sí hace con
    // pulso — una sesión sin sensor de cadencia daría avgCadence=0, que
    // ensuciaría la tendencia con una caída falsa si no se trata como "sin
    // dato" igual que la nube (avg_cadence nulo de verdad).
    avgCadence: a.avgCadence > 0 ? a.avgCadence : null,
  };
}

function cloudRow(s: (typeof appState.cloudSessions)[number]): HistoryRow {
  return {
    id: s.id,
    workoutId: s.workoutId,
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
    ftp: s.ftp,
    avgCadence: s.avgCadence,
  };
}

function formInterpretation(tsb: number): string {
  if (tsb > 5) return 'Estás fresco y con buena base. Buen momento para meter intensidad esta semana.';
  if (tsb < -10)
    return 'Traes una carga de entrenamiento alta — eso es lo que construye forma. Un día suave hoy te la deja lista para seguir sumando.';
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

/** Dibuja CTL/ATL con dos tramos: sólido para lo real (0..todayIndex),
 * punteado y semitransparente para la proyección (todayIndex..fin) — ver
 * futureTssEntries en engine/pmc.ts para cómo se calcula esa proyección.
 * Sin `todayIndex` (o si es el último punto) dibuja todo sólido, igual que
 * antes de este cambio. */
function drawFitnessFatigueChart(canvas: HTMLCanvasElement, points: ReturnType<typeof computePmc>, todayIndex?: number): void {
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

  const splitAt = todayIndex !== undefined ? Math.max(0, Math.min(points.length - 1, todayIndex)) : points.length - 1;

  const line = (key: 'ctl' | 'atl', color: string, lw: number) => {
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.lineJoin = 'round';

    g.setLineDash([]);
    g.globalAlpha = 1;
    g.beginPath();
    for (let i = 0; i <= splitAt; i++) {
      const x = X(i);
      const y = Y(points[i][key]);
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();

    if (splitAt < points.length - 1) {
      g.setLineDash([6, 5]);
      g.globalAlpha = 0.55;
      g.beginPath();
      for (let i = splitAt; i < points.length; i++) {
        const x = X(i);
        const y = Y(points[i][key]);
        i === splitAt ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
  };
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3d8bff';
  line('atl', '#5a6272', 2);
  line('ctl', accent, 3.5);

  if (splitAt > 0 && splitAt < points.length - 1) {
    const x = X(splitAt);
    g.strokeStyle = 'rgba(242,244,247,.18)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, pad);
    g.lineTo(x, h - pad);
    g.stroke();
    g.fillStyle = 'rgba(242,244,247,.45)';
    g.font = '10px sans-serif';
    g.fillText('hoy', x + 4, pad + 10);
  }
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

/** Mejor pico de potencia (1/5/20 min) de las sesiones locales — se usa como
 * piso cuando no hay nube configurada, y como red de seguridad junto al
 * histórico de Supabase (getPowerRecords) por si una sesión local reciente
 * todavía no terminó de sincronizarse. */
function localPowerBests(localSessions: SessionRecord[]): Record<'best1min' | 'best5min' | 'best20min', PowerBest | null> {
  const result: Record<'best1min' | 'best5min' | 'best20min', PowerBest | null> = { best1min: null, best5min: null, best20min: null };
  const windows: [keyof typeof result, number][] = [
    ['best1min', 60],
    ['best5min', 300],
    ['best20min', 1200],
  ];
  localSessions.forEach((s) => {
    const a = analyticsOf(s);
    const dateKey = s.startedAt.slice(0, 10);
    windows.forEach(([key, windowS]) => {
      const watts = a.powerCurve.find((p) => p.windowS === windowS)?.watts ?? null;
      if (watts === null) return;
      const current = result[key];
      if (!current || watts > current.watts) result[key] = { watts, dateKey };
    });
  });
  return result;
}

function bestOf(local: PowerBest | null, cloud: PowerBest | null): PowerBest | null {
  if (cloud && (!local || cloud.watts >= local.watts)) return cloud;
  return local;
}

function isWithinDays(dateKey: string, todayKey: string, days: number): boolean {
  const diff = (new Date(`${todayKey}T00:00:00Z`).getTime() - new Date(`${dateKey}T00:00:00Z`).getTime()) / 86400000;
  return diff >= 0 && diff <= days;
}

function recordTileHtml(label: string, value: string, subtitle: string, isNew: boolean): string {
  return `
    <div class="forma-record-tile">
      <div class="forma-record-value">${value}${isNew ? ' <span class="forma-record-badge" title="Nuevo récord en los últimos 7 días">🏆</span>' : ''}</div>
      <div class="live-col-label">${label}</div>
      ${subtitle ? `<div class="hint">${subtitle}</div>` : ''}
    </div>`;
}

/** Promedio de EF reciente (últimos 7 días con dato) vs. hace ~8 semanas —
 * null si no hay suficiente historia todavía en ninguna de las dos
 * ventanas (evita mostrar una "tendencia" basada en 1-2 sesiones sueltas). */
function efTrendPct(efPoints: { dateKey: string; ef: number }[], todayKey: string): number | null {
  if (efPoints.length < 4) return null;
  const todayMs = new Date(`${todayKey}T00:00:00Z`).getTime();
  const ageDays = (dateKey: string) => (todayMs - new Date(`${dateKey}T00:00:00Z`).getTime()) / 86400000;
  const recent = efPoints.filter((p) => ageDays(p.dateKey) <= 7);
  const prior = efPoints.filter((p) => ageDays(p.dateKey) >= 49 && ageDays(p.dateKey) <= 63);
  if (recent.length === 0 || prior.length === 0) return null;
  const avg = (points: { ef: number }[]) => points.reduce((s, p) => s + p.ef, 0) / points.length;
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);
  if (priorAvg === 0) return null;
  return ((recentAvg - priorAvg) / priorAvg) * 100;
}

/** Mismo cálculo que efTrendPct con cadencia en vez de EF — se deja como
 * función separada en vez de generalizar una de 12 líneas con un solo caso
 * de reuso más. */
function cadenceTrendPct(cadencePoints: { dateKey: string; cadence: number }[], todayKey: string): number | null {
  if (cadencePoints.length < 4) return null;
  const todayMs = new Date(`${todayKey}T00:00:00Z`).getTime();
  const ageDays = (dateKey: string) => (todayMs - new Date(`${dateKey}T00:00:00Z`).getTime()) / 86400000;
  const recent = cadencePoints.filter((p) => ageDays(p.dateKey) <= 7);
  const prior = cadencePoints.filter((p) => ageDays(p.dateKey) >= 49 && ageDays(p.dateKey) <= 63);
  if (recent.length === 0 || prior.length === 0) return null;
  const avg = (points: { cadence: number }[]) => points.reduce((s, p) => s + p.cadence, 0) / points.length;
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);
  if (priorAvg === 0) return null;
  return ((recentAvg - priorAvg) / priorAvg) * 100;
}

export function renderForma(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="screen">
      <h1>Forma</h1>
      <p class="hint">Cargando…</p>
    </div>
  `;

  const todayKey = toDateKey(new Date());

  Promise.all([listSessions(), appState.user ? getPowerRecords(appState.user.id) : Promise.resolve<PowerRecords | null>(null)]).then(
    ([localSessions, cloudPowerRecords]) => {
      const localById = new Map(localSessions.map((s) => [s.id, s]));
      const rows: HistoryRow[] = [
        ...localSessions.map(localRow),
        ...appState.cloudSessions.filter((s) => !localById.has(s.id)).map(cloudRow),
      ];

      if (rows.length === 0) {
        container.innerHTML = `
          <div class="screen forma-screen">
            <h1>Tu forma</h1>
            <p class="hint">Todavía no hay sesiones guardadas — tu Fitness/Fatiga/Forma aparece aquí en cuanto completes la primera. Si ya entrenaste fuera de la app, puedes agregarlo desde <a href="#/plan">Plan</a>.</p>
          </div>
        `;
        return;
      }

      const sorted = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

      const realEntries = sorted.map((r) => ({ dateKey: r.startedAt.slice(0, 10), tss: r.tss }));
      const futureEntries = futureTssEntries(appState.workouts, appState.profile.ftp, todayKey);
      const pmcFull = computePmc([...realEntries, ...futureEntries]);
      const todayIndexInFull = pmcFull.findIndex((p) => p.dateKey === todayKey);
      const latest = todayIndexInFull >= 0 ? pmcFull[todayIndexInFull] : pmcFull[pmcFull.length - 1];
      const chartStart = Math.max(0, todayIndexInFull - CHART_WEEKS * 7);
      const pmcChart = pmcFull.slice(chartStart);
      const todayIndexInChart = todayIndexInFull - chartStart;
      const hasProjection = todayIndexInFull >= 0 && todayIndexInFull < pmcFull.length - 1;

      const efPoints = [...sorted]
        .reverse()
        .map((r) => ({ dateKey: r.startedAt.slice(0, 10), ef: r.ef }))
        .filter((p): p is { dateKey: string; ef: number } => p.ef !== null);

      // tarjeta "hoy": qué entrenar según la forma actual, y si ya hay algo
      // agendado para hoy en Plan, para no contradecirlo.
      const suggestion = suggestToday(latest.tsb, new Date().getDay());
      const template = findTemplate(suggestion.templateId);
      const todayWorkout = appState.workouts.find((w) => w.scheduledDate === todayKey);
      const suggestedEstimate = template ? estimateWorkout(template.build(template.defaultMinutes), appState.profile.ftp) : null;
      const matchesSuggestion = Boolean(todayWorkout && template && todayWorkout.name.startsWith(template.name));

      // tendencias: Fitness de esta semana vs. hace 7 días, EF reciente vs.
      // hace ~8 semanas — null cuando no hay suficiente historia todavía.
      const weekAgoIdx = todayIndexInFull - 7;
      const ctlWeekDelta = todayIndexInFull >= 0 && weekAgoIdx >= 0 ? latest.ctl - pmcFull[weekAgoIdx].ctl : null;
      const efTrend = efTrendPct(efPoints, todayKey);

      // rachas, récords, logros y progreso solo cuentan sesiones grabadas en
      // vivo con la app — una importada de Strava o un .fit subido a mano no
      // es "tu récord en Torq" (ver core/session-origin.ts). El PMC y la
      // tendencia de EF de arriba sí siguen usando `sorted` completo: ahí
      // importa la carga real que absorbió el cuerpo, venga de donde venga.
      const liveSorted = sorted.filter(isRowLiveRecorded);
      const streak = computeWeeklyStreak(liveSorted.map((r) => r.startedAt.slice(0, 10)), todayKey);
      const bestTssRow = liveSorted.reduce<HistoryRow | null>((best, r) => (!best || r.tss > best.tss ? r : best), null);
      const longestRow = liveSorted.reduce<HistoryRow | null>((best, r) => (!best || r.durationS > best.durationS ? r : best), null);
      const withEf = liveSorted.filter((r): r is HistoryRow & { ef: number } => r.ef !== null);
      const bestEfRow = withEf.length ? withEf.reduce((best, r) => (r.ef > best.ef ? r : best)) : null;

      const achievementInput = buildAchievementInput(liveSorted, streak, appState.profile.ftp);
      const achievementResults = evaluateAchievements(achievementInput);

      const oldestFtpRow = [...liveSorted].reverse().find((r) => r.ftp > 0) ?? null;
      const ftpDeltaW = oldestFtpRow && oldestFtpRow.ftp !== appState.profile.ftp ? appState.profile.ftp - oldestFtpRow.ftp : null;
      const cadencePoints = [...liveSorted]
        .reverse()
        .map((r) => ({ dateKey: r.startedAt.slice(0, 10), cadence: r.avgCadence }))
        .filter((p): p is { dateKey: string; cadence: number } => p.cadence !== null);
      const cadenceTrend = cadenceTrendPct(cadencePoints, todayKey);
      const volumeTrend = computeWeeklyVolumeTrend(liveSorted, todayKey);
      const volumeDeltaPct =
        volumeTrend.priorHoursPerWeek > 0 ? ((volumeTrend.recentHoursPerWeek - volumeTrend.priorHoursPerWeek) / volumeTrend.priorHoursPerWeek) * 100 : null;

      const local = localPowerBests(localSessions.filter((s) => isLiveRecorded({ workoutId: s.workoutId, stravaActivityId: s.stravaActivityId ?? null })));
      const best1min = bestOf(local.best1min, cloudPowerRecords?.best1min ?? null);
      const best5min = bestOf(local.best5min, cloudPowerRecords?.best5min ?? null);
      const best20min = bestOf(local.best20min, cloudPowerRecords?.best20min ?? null);

      container.innerHTML = `
      <div class="screen forma-screen">
        <div class="forma-today-card" style="border-color:${formaColor(latest.tsb)}">
          <div class="live-col-label">Hoy</div>
          <p class="forma-today-message">${formInterpretation(latest.tsb)}</p>
          ${
            todayWorkout
              ? `<div class="forma-today-scheduled">
                  <span class="live-col-label">Ya tienes agendado</span>
                  <div class="forma-today-scheduled-name">${todayWorkout.name}</div>
                  ${matchesSuggestion ? '<span class="forma-today-badge">Coincide con lo que tu forma pide hoy</span>' : ''}
                </div>`
              : template && suggestedEstimate
                ? `<div class="forma-today-suggest-row">
                    <div>
                      <div class="forma-today-suggest-name">${template.name}</div>
                      <div class="hint">${template.description} · ~${suggestedEstimate.tss ?? '—'} TSS · ${template.defaultMinutes} min</div>
                    </div>
                    <button class="btn-light" id="forma-schedule-today">Agendar hoy</button>
                  </div>`
                : ''
          }
        </div>

        <div class="forma-top">
          <div class="forma-left">
            <div class="forma-numbers">
              <div><div class="forma-num num">${Math.round(latest.ctl)}</div><div class="live-col-label">Fitness</div></div>
              <div><div class="forma-num num" style="color:var(--text-muted)">${Math.round(latest.atl)}</div><div class="live-col-label">Fatiga</div></div>
              <div>
                <div class="forma-num forma-num-label num" style="color:${formaColor(latest.tsb)}">${formLabel(latest.tsb)}</div>
                <div class="live-col-label">Forma <span class="forma-num-sub">(${latest.tsb > 0 ? '+' : ''}${Math.round(latest.tsb)})</span></div>
              </div>
            </div>
            ${
              ctlWeekDelta !== null || efTrend !== null
                ? `<div class="forma-trend-row">
                    ${
                      ctlWeekDelta !== null
                        ? `<div class="forma-trend-item"><span class="forma-trend-arrow ${ctlWeekDelta >= 0 ? 'up' : 'down'}">${ctlWeekDelta >= 0 ? '▲' : '▼'}</span>Fitness ${ctlWeekDelta >= 0 ? '+' : ''}${ctlWeekDelta.toFixed(1)} esta semana</div>`
                        : ''
                    }
                    ${
                      efTrend !== null
                        ? `<div class="forma-trend-item"><span class="forma-trend-arrow ${efTrend >= 0 ? 'up' : 'down'}">${efTrend >= 0 ? '▲' : '▼'}</span>Eficiencia aeróbica ${efTrend >= 0 ? '+' : ''}${efTrend.toFixed(0)}% en 8 semanas</div>`
                        : ''
                    }
                  </div>`
                : ''
            }
            <div class="panel forma-chart-panel">
              <div class="forma-chart-legend">
                <span class="home-legend-item"><span class="home-legend-dot" style="width:18px;height:3px;border-radius:2px;background:var(--accent)"></span>Fitness</span>
                <span class="home-legend-item"><span class="home-legend-dot" style="width:18px;height:3px;border-radius:2px;background:#5a6272"></span>Fatiga</span>
                <span class="live-col-label" style="margin-left:auto">Últimas ${CHART_WEEKS} semanas${hasProjection ? ' + proyección' : ''}</span>
              </div>
              <canvas id="pmc" style="width:100%;height:220px;display:block"></canvas>
              ${hasProjection ? '<p class="hint" style="margin:6px 0 0">La línea punteada proyecta tu Fitness/Fatiga a partir de lo que ya tienes agendado en Plan (días sin nada agendado cuentan como descanso).</p>' : ''}
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

        <h2 class="perfil-h2" style="margin-top:28px">Rachas y récords</h2>
        <div class="panel forma-records">
          <div class="forma-streak">
            <div class="forma-num num">${streak.currentWeeks}</div>
            <div class="live-col-label">semana${streak.currentWeeks === 1 ? '' : 's'} seguida${streak.currentWeeks === 1 ? '' : 's'} entrenando</div>
            ${streak.currentWeeks > 1 && streak.currentWeeks === streak.bestWeeks ? '<p class="hint">🔥 ¡Tu racha más larga hasta ahora!</p>' : ''}
          </div>
          <div class="forma-records-grid">
            ${bestTssRow ? recordTileHtml('Mayor TSS en una sesión', String(Math.round(bestTssRow.tss)), fmtDateEsMx(bestTssRow.startedAt), false) : ''}
            ${longestRow ? recordTileHtml('Sesión más larga', fmt(longestRow.durationS), fmtDateEsMx(longestRow.startedAt), false) : ''}
            ${bestEfRow ? recordTileHtml('Mejor eficiencia (EF)', bestEfRow.ef.toFixed(2), fmtDateEsMx(bestEfRow.startedAt), false) : ''}
            ${best1min ? recordTileHtml('Mejor 1 min', `${Math.round(best1min.watts)} W`, fmtDateEsMx(best1min.dateKey), isWithinDays(best1min.dateKey, todayKey, 7)) : ''}
            ${best5min ? recordTileHtml('Mejor 5 min', `${Math.round(best5min.watts)} W`, fmtDateEsMx(best5min.dateKey), isWithinDays(best5min.dateKey, todayKey, 7)) : ''}
            ${best20min ? recordTileHtml('Mejor 20 min', `${Math.round(best20min.watts)} W`, fmtDateEsMx(best20min.dateKey), isWithinDays(best20min.dateKey, todayKey, 7)) : ''}
          </div>
          ${
            appState.cloudEnabled && appState.user
              ? `<div class="row-actions" style="margin-top:12px"><button id="forma-backfill-power">Recalcular picos históricos</button><span class="hint" id="forma-backfill-result"></span></div>`
              : ''
          }
        </div>

        <h2 class="perfil-h2" style="margin-top:28px">Tu progreso</h2>
        <div class="panel forma-records-grid">
          ${recordTileHtml(
            'FTP actual',
            `${appState.profile.ftp} W`,
            ftpDeltaW !== null
              ? ftpDeltaW > 0
                ? `+${ftpDeltaW} W desde tu primer registro — tu umbral subió`
                : ftpDeltaW < 0
                  ? `${ftpDeltaW} W desde tu primer registro`
                  : 'Igual que en tu primer registro'
              : '',
            false,
          )}
          ${
            cadenceTrend !== null
              ? recordTileHtml(
                  'Cadencia promedio',
                  `${Math.round(cadencePoints[cadencePoints.length - 1].cadence)} rpm`,
                  `${cadenceTrend >= 0 ? '+' : ''}${cadenceTrend.toFixed(0)}% en 8 semanas`,
                  false,
                )
              : ''
          }
          ${recordTileHtml(
            'Volumen semanal',
            `${volumeTrend.recentHoursPerWeek.toFixed(1)} h/sem`,
            volumeDeltaPct !== null
              ? `${volumeDeltaPct >= 0 ? '+' : ''}${volumeDeltaPct.toFixed(0)}% vs. las 4 semanas previas`
              : 'Promedio de las últimas 4 semanas',
            false,
          )}
        </div>

        <h2 class="perfil-h2" style="margin-top:28px">Logros</h2>
        <div class="panel forma-achievements-grid">
          ${achievementResults
            .map(
              ({ achievement, earned }) => `
            <div class="forma-achievement-tile${earned ? ' is-earned' : ' is-locked'}">
              <div class="forma-achievement-icon">${achievement.icon}</div>
              <div class="forma-achievement-title">${achievement.title}</div>
              <div class="hint">${achievement.description}</div>
            </div>`,
            )
            .join('')}
        </div>
      </div>
    `;

      drawFitnessFatigueChart(container.querySelector('#pmc')!, pmcChart, todayIndexInChart);
      const efCanvas = container.querySelector<HTMLCanvasElement>('#ef');
      if (efCanvas) drawEfChart(efCanvas, efPoints);

      // marca en silencio (sin celebrar) los logros que ya se tenían antes de
      // que existiera esta sección — así si alguien abre Forma antes de su
      // próximo entrenamiento, no le explota una celebración de varios logros
      // "nuevos" a la vez la primera vez que esto esté desplegado.
      markAchievementsSeen(achievementResults.filter((r) => r.earned).map((r) => r.achievement.id));

      container.querySelector('#forma-schedule-today')?.addEventListener('click', async () => {
        if (!template) return;
        const workout: Workout = {
          format_version: 1,
          id: crypto.randomUUID(),
          name: `${template.name} · sugerido por Forma`,
          intervals: template.build(template.defaultMinutes),
          created_at: new Date().toISOString(),
          scheduledDate: todayKey,
        };
        await saveWorkout(workout);
        if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
        appState.workouts = [...appState.workouts, workout];
        refresh();
      });

      container.querySelector('#forma-backfill-power')?.addEventListener('click', async (e) => {
        if (!appState.user) return;
        const btn = e.currentTarget as HTMLButtonElement;
        const resultEl = container.querySelector<HTMLElement>('#forma-backfill-result')!;
        btn.disabled = true;
        const updated = await backfillPowerRecords(appState.user.id, (done, total) => {
          resultEl.textContent = `Procesando ${done} de ${total}…`;
        });
        resultEl.textContent = updated > 0 ? `${updated} sesión(es) actualizadas.` : 'Nada que actualizar.';
        if (updated > 0) refresh();
        else btn.disabled = false;
      });
    },
  );

  return () => {};
}
