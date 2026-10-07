import { buildCompletedSessionFromFit } from '../../core/completed-session-import';
import { importWorkoutFile } from '../../core/workout-file-import';
import { validateWorkout } from '../../core/validator';
import { WORKOUT_TEMPLATES, findTemplate } from '../../core/workout-templates';
import { estimateWorkout } from '../../core/workout-estimate';
import type { Sample, Workout } from '../../core/types';
import { powerZone, powerPctToHeightPct } from '../../core/zones';
import { saveWorkout } from '../../storage/workout-store';
import { listSessions, saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { computeSessionAnalytics } from '../../engine/analytics';
import { downloadSessionSamples, pushSessionToCloud } from '../../sync/cloud-sync';
import type { CloudSessionSummary } from '../../sync/cloud-sync';
import { importStravaActivity, isStravaConfigured, listStravaActivities } from '../../sync/strava';
import { pushWorkoutToCloud } from '../../sync/workout-sync';
import { refresh } from '../router';
import { appState } from '../state';
import { escapeHtml, renderWorkoutCover } from '../workout-cover';
import { wireDatePicker } from '../date-picker';
import { renderCoachSection } from '../coach';
import { isSupabaseConfigured } from '../../supabase/client';
import { isCoachProfileComplete, openOnboardingForm } from '../onboarding';

const STRAVA_IMPORT_WINDOW_DAYS = 60;
// Tope de entrenamientos (agendados + completados, combinados) que puede
// mostrar un mismo día — ver wireDragAndDrop y "+ Crear nuevo".
const MAX_PER_DAY = 2;
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_WEEKDAY_HEADER = [1, 2, 3, 4, 5, 6, 0].map((i) => DAY_NAMES[i]); // lunes primero, solo para el header de la vista de mes
const MONTH_NAMES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTH_NAMES_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

type ViewMode = 'week' | 'month';

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  const mondayOffset = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - mondayOffset);
  return s;
}

/** Todos los días a dibujar en la vista de mes: semanas completas (lunes a
 * domingo) que cubren el mes — incluye días de los meses vecinos para no
 * dejar semanas a medias, mismo criterio que cualquier calendario mensual. */
function monthGridDays(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(firstOfMonth);
  const gridEndExclusive = startOfWeek(lastOfMonth);
  gridEndExclusive.setDate(gridEndExclusive.getDate() + 7);
  const days: Date[] = [];
  for (let d = new Date(gridStart); d < gridEndExclusive; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

function fmtDayShort(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
}

function fmtRange(start: Date, end: Date): string {
  return `${start.getDate()} ${MONTH_NAMES_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES_SHORT[end.getMonth()]}`;
}

function fmtMonthLabel(d: Date): string {
  return `${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtHours(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${m < 10 ? '0' : ''}${m}`;
}

/** Lo mínimo para marcar un día como "Hecho" en la semana — sirve tanto
 * para una sesión local completa (con samples) como para un resumen que
 * solo vive en la nube (grabado en otro dispositivo, ver sync/cloud-sync). */
interface CalendarDone {
  workoutName: string;
  durationS: number;
  tss: number;
  /** Gráfico tipo workout-cover reconstruido de los samples REALES de la
   * sesión (no de un plan) — solo disponible para sesiones locales, que son
   * las que traen samples completos. Sin esto, un día completado (importado
   * o grabado) se veía como texto plano al lado de los días agendados, que
   * sí muestran su cover — ver reportHtml en weekCellHtml/monthCellHtml. */
  coverHtml?: string;
  /** Id real de la sesión local (storage/session-store) — solo presente si
   * existe localmente, nunca para resúmenes que solo viven en la nube. Sin
   * esto no hay forma de mover la sesión de día (no hay qué actualizar). */
  sessionId?: string;
  /** Id de la sesión en `sessions` (nube) — solo para resúmenes cloud-only,
   * así loadVisibleCloudCovers sabe cuál entrada de un día con varias
   * actualizar cuando resuelve su cover real. */
  cloudSessionId?: string;
  /** true si vino de importar una actividad de Strava — esas nunca se
   * pueden arrastrar a otro día, Strava es la fuente real de su fecha, no
   * Torq (ver wireDragAndDrop). */
  isStrava?: boolean;
}

/** Mismo lenguaje visual que renderWorkoutCover (barras por zona), pero a
 * partir de potencia YA GRABADA en vez de un plan: agrupa los samples en
 * tramos y colorea cada uno según su zona de potencia promedio. */
function renderSessionCover(samples: readonly Sample[], ftp: number): string {
  if (samples.length === 0 || ftp <= 0) return '';
  const BARS = 10;
  const chunkSize = Math.max(1, Math.ceil(samples.length / BARS));
  const bars: string[] = [];
  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.slice(i, i + chunkSize);
    const avgPower = chunk.reduce((sum, s) => sum + s.power, 0) / chunk.length;
    const avgPct = (avgPower / ftp) * 100;
    const zone = powerZone(avgPct);
    bars.push(`<div class="workout-cover-bar" style="height:${powerPctToHeightPct(avgPct)}%;background:var(--z${zone})"></div>`);
  }
  return `<div class="workout-cover workout-cover-sm">${bars.join('')}</div>`;
}

function localToCalendarDone(s: SessionRecord): CalendarDone {
  const a = computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp });
  return {
    workoutName: s.workoutName,
    durationS: s.samples.length,
    tss: a.trainingStressScore ?? 0,
    coverHtml: renderSessionCover(s.samples, s.ftp),
    sessionId: s.id,
    isStrava: s.stravaActivityId !== undefined,
  };
}

function cloudToCalendarDone(s: CloudSessionSummary): CalendarDone {
  const durationS = Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
  return { workoutName: s.workoutName, durationS, tss: s.trainingStressScore ?? 0, cloudSessionId: s.id };
}

function errorsHtml(errors: string[]): string {
  if (errors.length === 0) return '';
  return `<div class="error-box"><strong>${errors.length} error(es):</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
}

export function renderCalendar(container: HTMLElement): () => void {
  const today = new Date();
  const todayKey = toDateKey(today);
  let viewMode: ViewMode = 'week';
  let weekStart = startOfWeek(today);
  let monthAnchor = new Date(today.getFullYear(), today.getMonth(), 1);
  // Hasta MAX_PER_DAY entradas por día (ver wireDragAndDrop) — por eso es
  // un arreglo y no un solo valor como antes.
  let completedByDate = new Map<string, CalendarDone[]>();
  /** SessionRecord real por id — completedByDate solo trae el resumen
   * derivado (CalendarDone), pero mover una sesión de día (drag-and-drop)
   * necesita mutar y volver a guardar el registro real. */
  let sessionsById = new Map<string, SessionRecord>();
  /** Resumen crudo (con fitPath) de las sesiones que solo viven en la nube,
   * indexado por fecha — completedByDate ya no trae lo necesario para pedir
   * el .fit, así que esto es lo que usa loadVisibleCloudCovers para saber
   * a cuáles pedirles el cover de verdad en vez de dejarlas en texto plano.
   * Arreglo por si un día tiene más de una sesión cloud-only. */
  let cloudOnlyByDate = new Map<string, CloudSessionSummary[]>();
  /** Evita re-pedir el .fit de una fecha ya intentada (con o sin éxito) cada
   * vez que se repinta — paint() llama a loadVisibleCloudCovers en cada
   * render, incluido el que dispara la propia descarga al terminar. */
  const cloudCoverAttempted = new Set<string>();
  /** Fecha para la que se está mostrando el panel "Crear nuevo" (plantillas),
   * null si está cerrado — un solo panel compartido por semana y mes en vez
   * de uno por celda, ver createPanelHtml/wireCreatePanel. */
  let createDate: string | null = null;
  /** Id del workout cuyo detalle (nombre + descripción + stats) se muestra
   * en el panel flotante, null si está cerrado — ver workoutDetailHtml. */
  let detailWorkoutId: string | null = null;

  function intervalBlockHtml(iv: Workout['intervals'][number]): string {
    // Bloques cortos (ej. activaciones de 8s) redondeaban a "0 min", que no
    // dice nada — segundos para menos de 1 min, minutos para el resto.
    const durationLabel = iv.duration_s < 60 ? `${iv.duration_s}s` : `${Math.round(iv.duration_s / 60)} min`;
    const power = iv.ramp_to_pct ? `${iv.power_pct}% → ${iv.ramp_to_pct}% FTP` : `${iv.power_pct}% FTP`;
    const cadence = iv.cadence_min || iv.cadence_max ? ` · cadencia ${iv.cadence_min ?? ''}${iv.cadence_min && iv.cadence_max ? '-' : ''}${iv.cadence_max ?? ''}` : '';
    return `
      <div class="workout-detail-block">
        <div class="workout-detail-block-head">
          <span class="workout-detail-block-name">${escapeHtml(iv.name || iv.type)}</span>
          <span class="live-col-label">${durationLabel}</span>
        </div>
        <div class="live-col-label">${power}${escapeHtml(cadence)}</div>
      </div>`;
  }

  function workoutDetailHtml(): string {
    if (!detailWorkoutId) return '';
    const w = appState.workouts.find((x) => x.id === detailWorkoutId);
    if (!w) return '';
    const est = estimateWorkout(w.intervals, appState.profile.ftp);
    return `
      <div class="modal-backdrop" id="workout-detail-backdrop">
        <div class="panel plan-coach-modal" id="workout-detail-panel">
          <div class="plan-create-head">
            <h2 class="perfil-h2" style="margin:0">${escapeHtml(w.name)}</h2>
            <button class="plan-create-close" id="workout-detail-close" aria-label="Cerrar">✕</button>
          </div>
          <div class="live-col-label">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS</div>
          <div class="workout-detail-blocks" style="margin-top:12px">
            ${w.intervals.map(intervalBlockHtml).join('')}
          </div>
          <div class="perfil-h2" style="margin-top:14px;font-size:15px">Sobre este entrenamiento</div>
          ${w.description ? `<p class="hint" style="margin-top:4px">${escapeHtml(w.description)}</p>` : '<p class="hint" style="margin-top:4px">Sin notas adicionales para este entrenamiento.</p>'}
        </div>
      </div>`;
  }

  function createPanelHtml(): string {
    if (!createDate) return '';
    const d = new Date(`${createDate}T00:00:00`);
    return `
      <div class="panel plan-create-panel" id="plan-create-panel">
        <div class="plan-create-head">
          <h2 class="perfil-h2" style="margin:0">Crear nuevo — ${fmtDayShort(d)}</h2>
          <button class="plan-create-close" id="plan-create-close" aria-label="Cerrar">✕</button>
        </div>
        <div class="plan-chip-row" id="create-chips">
          ${WORKOUT_TEMPLATES.map((t, i) => `<button class="plan-chip${i === 0 ? ' on' : ''}" data-template="${t.id}">${t.name}</button>`).join('')}
        </div>
        <label class="live-col-label">Duración<input type="number" id="create-minutes" value="${WORKOUT_TEMPLATES[0].defaultMinutes}" min="${WORKOUT_TEMPLATES[0].minMinutes}" max="${WORKOUT_TEMPLATES[0].maxMinutes}"></label>
        <p class="hint" id="create-description">${WORKOUT_TEMPLATES[0].description}</p>
        <button class="btn-light" id="create-submit">Crear</button>
        <div id="create-errors"></div>
        <div class="plan-create-divider"><span>o</span></div>
        <label class="plan-import-link">Importar archivo (.zwo, .mrc, .erg)<input type="file" id="create-import" accept=".zwo,.mrc,.erg,.json" style="display:none"></label>
      </div>`;
  }

  type DayEntry = { kind: 'scheduled'; workout: Workout } | { kind: 'completed'; done: CalendarDone };

  function dayEntries(scheduledList: Workout[], completedList: CalendarDone[]): DayEntry[] {
    return [
      ...scheduledList.map((workout): DayEntry => ({ kind: 'scheduled', workout })),
      ...completedList.map((done): DayEntry => ({ kind: 'completed', done })),
    ];
  }

  /** Atributos drag — solo agendados (siempre movibles) y completados
   * locales que NO vengan de Strava (esa es su fuente real de fecha, ver
   * wireDragAndDrop). Sesiones cloud-only tampoco: no hay registro local
   * que mutar. */
  function dragAttrs(entry: DayEntry): string {
    if (entry.kind === 'scheduled') return `draggable="true" data-drag-kind="workout" data-drag-id="${entry.workout.id}"`;
    const c = entry.done;
    if (!c.sessionId || c.isStrava) return '';
    return `draggable="true" data-drag-kind="session" data-drag-id="${c.sessionId}"`;
  }

  function weekCellHtml(d: Date, key: string, isToday: boolean, scheduledList: Workout[], completedList: CalendarDone[]): string {
    const entries = dayEntries(scheduledList, completedList);
    const anyCompleted = completedList.length > 0;
    const entryHtml = (entry: DayEntry): string => {
      if (entry.kind === 'scheduled') {
        const w = entry.workout;
        const est = estimateWorkout(w.intervals, appState.profile.ftp);
        return `
          <div class="plan-day-entry" ${dragAttrs(entry)}>
            <button class="plan-day-cover" data-workout-id="${w.id}" title="${escapeHtml(w.name)} — Ver detalle">${renderWorkoutCover(w.intervals, 'sm')}</button>
            <div class="plan-day-name">${escapeHtml(w.name)}</div>
            <div class="live-col-label">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS</div>
          </div>`;
      }
      const c = entry.done;
      return `
        <div class="plan-day-entry" ${dragAttrs(entry)}${c.isStrava ? ' title="Viene de Strava — su fecha no se puede mover aquí"' : ''}>
          ${c.coverHtml ? `<div class="plan-day-cover">${c.coverHtml}</div>` : ''}
          <div class="plan-day-name">${escapeHtml(c.workoutName)}</div>
          <div class="live-col-label">completado${c.isStrava ? ' · Strava' : ''}</div>
        </div>`;
    };
    const body = entries.length > 0 ? entries.map(entryHtml).join('') : `<button class="plan-day-add" data-create-date="${key}">+ Crear nuevo</button>`;
    const miniActions =
      entries.length > 0 && entries.length < MAX_PER_DAY
        ? `<div class="plan-day-actions"><button class="plan-day-mini-add" data-create-date="${key}" title="Agregar otro">+</button></div>`
        : '';
    return `
      <div class="plan-day${isToday ? ' today' : ''}${anyCompleted ? ' done' : ''}" data-drop-date="${key}">
        <div class="plan-day-head"><span class="${isToday ? 'plan-day-today-label' : ''}">${fmtDayShort(d)}</span><span class="live-col-label">${anyCompleted ? 'Hecho' : isToday ? 'Hoy' : ''}</span></div>
        ${body}
        ${miniActions}
      </div>`;
  }

  function monthCellHtml(d: Date, key: string, isToday: boolean, inCurrentMonth: boolean, scheduledList: Workout[], completedList: CalendarDone[]): string {
    const entries = dayEntries(scheduledList, completedList);
    const anyCompleted = completedList.length > 0;
    const entryHtml = (entry: DayEntry): string => {
      if (entry.kind === 'scheduled') {
        const w = entry.workout;
        return `<button class="plan-month-cover" data-workout-id="${w.id}" ${dragAttrs(entry)} title="${escapeHtml(w.name)} — Ver detalle">${renderWorkoutCover(w.intervals, 'sm')}</button>`;
      }
      const c = entry.done;
      return c.coverHtml
        ? `<div class="plan-month-cover" ${dragAttrs(entry)} title="${escapeHtml(c.workoutName)}">${c.coverHtml}</div>`
        : `<div class="plan-month-done-label" ${dragAttrs(entry)} title="${escapeHtml(c.workoutName)}">${escapeHtml(c.workoutName)}</div>`;
    };
    const body =
      entries.length > 0
        ? `<div class="plan-month-entries">${entries.map(entryHtml).join('')}</div>`
        : `<button class="plan-month-add" data-create-date="${key}" title="Crear nuevo" aria-label="Crear nuevo">+</button>`;
    return `
      <div class="plan-month-day${isToday ? ' today' : ''}${anyCompleted ? ' done' : ''}${inCurrentMonth ? '' : ' outside'}" data-drop-date="${key}">
        <div class="plan-month-daynum">${d.getDate()}</div>
        ${body}
      </div>`;
  }

  /** Pide el .fit de las sesiones cloud-only que se ven en el rango actual
   * (semana o mes) para reconstruir su cover real — nunca de TODO el
   * historial, solo lo visible, para no descargar de más. Al resolver cada
   * una, actualiza completedByDate y vuelve a pintar. */
  function loadVisibleCloudCovers(days: Date[]): void {
    days.forEach((d) => {
      const key = toDateKey(d);
      if (cloudCoverAttempted.has(key)) return;
      const summaries = cloudOnlyByDate.get(key) ?? [];
      if (summaries.length === 0) return;
      cloudCoverAttempted.add(key);
      summaries.forEach((summary) => {
        if (!summary.fitPath) return;
        void downloadSessionSamples(summary.fitPath).then((samples) => {
          if (!samples || samples.length === 0) return;
          const existing = completedByDate.get(key);
          if (!existing) return;
          completedByDate.set(
            key,
            existing.map((e) => (e.cloudSessionId === summary.id ? { ...e, coverHtml: renderSessionCover(samples, summary.ftp) } : e)),
          );
          paint();
        });
      });
    });
  }

  function paint(): void {
    const isMonth = viewMode === 'month';
    const days = isMonth ? monthGridDays(monthAnchor) : Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));

    let plannedS = 0;
    let plannedTss = 0;
    let doneS = 0;
    let doneTss = 0;

    const cellsHtml = days
      .map((d) => {
        const key = toDateKey(d);
        const isToday = key === todayKey;
        const inCurrentMonth = !isMonth || d.getMonth() === monthAnchor.getMonth();
        const scheduledList = appState.workouts.filter((w) => w.scheduledDate === key);
        const completedList = completedByDate.get(key) ?? [];
        if (!isMonth || inCurrentMonth) {
          scheduledList.forEach((w) => {
            const est = estimateWorkout(w.intervals, appState.profile.ftp);
            plannedS += est.durationS;
            plannedTss += est.tss ?? 0;
          });
          completedList.forEach((c) => {
            doneS += c.durationS;
            doneTss += c.tss;
          });
        }
        return isMonth
          ? monthCellHtml(d, key, isToday, inCurrentMonth, scheduledList, completedList)
          : weekCellHtml(d, key, isToday, scheduledList, completedList);
      })
      .join('');

    loadVisibleCloudCovers(days);

    const rangeLabel = isMonth ? fmtMonthLabel(monthAnchor) : fmtRange(days[0], days[6]);
    const totalsLabel = isMonth ? 'Mes' : 'Semana';

    const needsOnboarding = isSupabaseConfigured() && !!appState.user && !isCoachProfileComplete(appState.profile);

    container.innerHTML = `
      <div class="screen plan-screen">
        ${
          needsOnboarding
            ? `<div class="recovery-banner">
                <p><strong>Te falta el cuestionario del coach</strong> — lo necesitas para que el coach pueda crear tu plan de entrenamiento.</p>
                <div class="row-actions"><button class="primary" id="plan-open-onboarding">Contestarlo ahora</button></div>
              </div>`
            : ''
        }
        <div id="coach-slot"></div>
        <div class="plan-head">
          <h1>Plan</h1>
          <div class="row-actions" style="align-items:center;margin:0;flex-wrap:wrap">
            <div class="plan-view-toggle">
              <button class="plan-view-btn${!isMonth ? ' on' : ''}" id="view-week">Semana</button>
              <button class="plan-view-btn${isMonth ? ' on' : ''}" id="view-month">Mes</button>
            </div>
            <button id="plan-today">Hoy</button>
            <button id="plan-prev" aria-label="Anterior">‹</button>
            <span class="live-col-label" style="width:170px;text-align:center;display:inline-block">${rangeLabel}</span>
            <button id="plan-next" aria-label="Siguiente">›</button>
          </div>
        </div>
        <div id="plan-import-errors"></div>
        ${isMonth ? `<div class="plan-month-weekdays">${MONTH_WEEKDAY_HEADER.map((n) => `<div>${n}</div>`).join('')}</div>` : ''}
        <div class="${isMonth ? 'plan-month-grid' : 'plan-week-grid'}">${cellsHtml}</div>
        <div class="plan-totals">
          <span>${totalsLabel}: <b>${fmtHours(doneS)}</b> de ${fmtHours(plannedS)} h</span>
          <span>TSS: <b>${Math.round(doneTss)}</b> de ${Math.round(plannedTss)}</span>
        </div>

        ${createPanelHtml()}
        ${workoutDetailHtml()}

        <div class="panel plan-manual-done">
          <h2 class="perfil-h2" style="margin:0">Agregar entrenamiento completado</h2>
          ${
            isStravaConfigured()
              ? `<div class="plan-chip-row" id="import-method-chips" style="margin-top:12px">
                  <button class="plan-chip on" data-method="manual">Archivo .fit</button>
                  <button class="plan-chip" data-method="strava">Strava</button>
                </div>`
              : ''
          }
          <div id="import-method-manual" style="margin-top:12px">
            <div class="row-actions" style="align-items:center">
              <label class="live-col-label">Fecha<input type="date" id="manual-done-date" value="${todayKey}"></label>
              <button id="manual-done-trigger">Elegir archivo .fit</button>
            </div>
          </div>
          ${
            isStravaConfigured()
              ? `<div id="import-method-strava" style="display:none;margin-top:12px">
                  <button id="strava-import">Importar de Strava</button>
                  <p class="hint" id="strava-import-result" style="margin-top:8px">Trae tus rodadas de los últimos ${STRAVA_IMPORT_WINDOW_DAYS} días (necesitas tener Strava conectado en Perfil).</p>
                </div>`
              : ''
          }
        </div>

        <input type="file" id="import-done-file" accept=".fit" style="display:none">
      </div>
    `;

    wireDayButtons();
    wireCreatePanel();
    wireDragAndDrop();
    renderCoachSection(container, paint);
    container.querySelector('#plan-open-onboarding')?.addEventListener('click', () => {
      openOnboardingForm(() => paint(), true);
    });

    container.querySelector('#view-week')?.addEventListener('click', () => {
      if (viewMode === 'week') return;
      viewMode = 'week';
      paint();
    });
    container.querySelector('#view-month')?.addEventListener('click', () => {
      if (viewMode === 'month') return;
      viewMode = 'month';
      paint();
    });
    container.querySelector('#plan-today')?.addEventListener('click', () => {
      weekStart = startOfWeek(new Date());
      monthAnchor = new Date(today.getFullYear(), today.getMonth(), 1);
      paint();
    });
    container.querySelector('#plan-prev')?.addEventListener('click', () => {
      if (viewMode === 'month') monthAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1);
      else weekStart.setDate(weekStart.getDate() - 7);
      paint();
    });
    container.querySelector('#plan-next')?.addEventListener('click', () => {
      if (viewMode === 'month') monthAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
      else weekStart.setDate(weekStart.getDate() + 7);
      paint();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-workout-id].plan-day-cover, [data-workout-id].plan-month-cover').forEach((btn) => {
      btn.addEventListener('click', () => {
        detailWorkoutId = btn.dataset.workoutId!;
        paint();
      });
    });

    const detailBackdrop = container.querySelector<HTMLElement>('#workout-detail-backdrop');
    detailBackdrop?.querySelector('#workout-detail-close')?.addEventListener('click', () => {
      detailWorkoutId = null;
      paint();
    });
    detailBackdrop?.addEventListener('click', (e) => {
      if (e.target === detailBackdrop) {
        detailWorkoutId = null;
        paint();
      }
    });
  }

  function wireCreatePanel(): void {
    const panel = container.querySelector<HTMLElement>('#plan-create-panel');
    if (!panel || !createDate) return;
    const chips = panel.querySelectorAll<HTMLButtonElement>('.plan-chip');
    const minutesInput = panel.querySelector<HTMLInputElement>('#create-minutes')!;
    const description = panel.querySelector<HTMLElement>('#create-description')!;
    const createErrors = panel.querySelector<HTMLElement>('#create-errors')!;

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        const t = findTemplate(chip.dataset.template!);
        if (!t) return;
        minutesInput.min = String(t.minMinutes);
        minutesInput.max = String(t.maxMinutes);
        minutesInput.value = String(t.defaultMinutes);
        description.textContent = t.description;
      });
    });

    panel.querySelector('#create-submit')?.addEventListener('click', async () => {
      const date = createDate;
      if (!date) return;
      const existingCount = appState.workouts.filter((w) => w.scheduledDate === date).length + (completedByDate.get(date)?.length ?? 0);
      if (existingCount >= MAX_PER_DAY) {
        createErrors.innerHTML = errorsHtml([`Ese día ya tiene ${MAX_PER_DAY} entrenamientos — elige otra fecha.`]);
        return;
      }
      const activeChip = panel.querySelector<HTMLButtonElement>('.plan-chip.on');
      const t = findTemplate(activeChip?.dataset.template ?? WORKOUT_TEMPLATES[0].id);
      if (!t) return;
      const minutes = Math.round(Number(minutesInput.value));
      if (!Number.isFinite(minutes) || minutes < t.minMinutes || minutes > t.maxMinutes) {
        createErrors.innerHTML = errorsHtml([`Minutos fuera de rango para "${t.name}": entre ${t.minMinutes} y ${t.maxMinutes}.`]);
        return;
      }
      const dateObj = new Date(`${date}T00:00:00`);
      const workout: Workout = {
        format_version: 1,
        id: crypto.randomUUID(),
        name: `${t.name} · ${minutes} min · ${dateObj.getDate()} ${MONTH_NAMES_SHORT[dateObj.getMonth()]}`,
        intervals: t.build(minutes),
        created_at: new Date().toISOString(),
        scheduledDate: date,
      };
      const result = validateWorkout(workout);
      createErrors.innerHTML = errorsHtml(result.errors);
      if (!result.valid) return;
      await saveWorkout(workout);
      if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
      appState.workouts = [...appState.workouts, workout];
      createDate = null;
      paint();
    });

    panel.querySelector<HTMLInputElement>('#create-import')?.addEventListener('change', async (e) => {
      const input = e.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      const date = createDate;
      if (!file || !date) return;
      const existingCount = appState.workouts.filter((w) => w.scheduledDate === date).length + (completedByDate.get(date)?.length ?? 0);
      if (existingCount >= MAX_PER_DAY) {
        createErrors.innerHTML = errorsHtml([`Ese día ya tiene ${MAX_PER_DAY} entrenamientos — elige otra fecha.`]);
        return;
      }
      const { workout: imported, errors } = await importWorkoutFile(file, appState.profile.ftp);
      createErrors.innerHTML = errorsHtml(errors);
      if (!imported) return;
      const workout: Workout = { ...imported, scheduledDate: date };
      await saveWorkout(workout);
      if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
      appState.workouts = [...appState.workouts, workout];
      createDate = null;
      paint();
    });

    panel.querySelector('#plan-create-close')?.addEventListener('click', () => {
      createDate = null;
      paint();
    });
  }

  /** Arrastrar un workout agendado o una sesión local no-Strava a otro día.
   * Agendados: siempre movibles (es un plan futuro). Completados: solo si
   * son locales y no vienen de Strava — esa es su fuente real de fecha, ver
   * dragAttrs. Tope de MAX_PER_DAY por día, igual para ambos tipos. */
  function wireDragAndDrop(): void {
    let dragPayload: { kind: 'workout' | 'session'; id: string } | null = null;
    const importErrors = container.querySelector<HTMLElement>('#plan-import-errors');

    function showDropError(message: string): void {
      if (!importErrors) return;
      importErrors.innerHTML = errorsHtml([message]);
      setTimeout(() => {
        if (importErrors.innerHTML.includes(escapeHtml(message))) importErrors.innerHTML = '';
      }, 3000);
    }

    container.querySelectorAll<HTMLElement>('[data-drag-kind]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        dragPayload = { kind: el.dataset.dragKind as 'workout' | 'session', id: el.dataset.dragId! };
        e.dataTransfer?.setData('text/plain', el.dataset.dragId!);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        dragPayload = null;
        el.classList.remove('dragging');
      });
    });

    container.querySelectorAll<HTMLElement>('[data-drop-date]').forEach((cell) => {
      cell.addEventListener('dragover', (e) => {
        if (!dragPayload) return;
        e.preventDefault();
        cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        const payload = dragPayload;
        dragPayload = null;
        if (!payload) return;
        const targetKey = cell.dataset.dropDate!;
        void handleDrop(payload, targetKey, showDropError);
      });
    });
  }

  async function handleDrop(payload: { kind: 'workout' | 'session'; id: string }, targetKey: string, onError: (message: string) => void): Promise<void> {
    const existingCount = appState.workouts.filter((w) => w.scheduledDate === targetKey).length + (completedByDate.get(targetKey)?.length ?? 0);

    if (payload.kind === 'workout') {
      const w = appState.workouts.find((x) => x.id === payload.id);
      if (!w || w.scheduledDate === targetKey) return;
      if (existingCount >= MAX_PER_DAY) {
        onError(`Ese día ya tiene ${MAX_PER_DAY} entrenamientos — muévelo a otro día o quita uno primero.`);
        return;
      }
      w.scheduledDate = targetKey;
      appState.workouts = [...appState.workouts];
      await saveWorkout(w);
      if (appState.user) void pushWorkoutToCloud(w, appState.user.id);
      paint();
      return;
    }

    // Sesión completada local (no-Strava, ya filtrado por dragAttrs) — se
    // desplaza preservando la hora del día y la duración real, solo cambia
    // la fecha de calendario.
    const record = sessionsById.get(payload.id);
    if (!record) return;
    const currentKey = toDateKey(new Date(record.startedAt));
    if (currentKey === targetKey) return;
    if (existingCount >= MAX_PER_DAY) {
      onError(`Ese día ya tiene ${MAX_PER_DAY} entrenamientos — muévelo a otro día o quita uno primero.`);
      return;
    }
    const deltaMs = new Date(`${targetKey}T00:00:00`).getTime() - new Date(`${currentKey}T00:00:00`).getTime();
    record.startedAt = new Date(new Date(record.startedAt).getTime() + deltaMs).toISOString();
    record.finishedAt = new Date(new Date(record.finishedAt).getTime() + deltaMs).toISOString();
    await saveSession(record);
    if (appState.user) void pushSessionToCloud(record, appState.profile, appState.user.id);

    completedByDate.set(
      currentKey,
      (completedByDate.get(currentKey) ?? []).filter((c) => c.sessionId !== payload.id),
    );
    completedByDate.set(targetKey, [...(completedByDate.get(targetKey) ?? []), localToCalendarDone(record)]);
    paint();
  }

  function wireDayButtons(): void {
    const doneFileInput = container.querySelector<HTMLInputElement>('#import-done-file')!;
    const importErrors = container.querySelector<HTMLElement>('#plan-import-errors')!;
    const manualDoneDate = container.querySelector<HTMLInputElement>('#manual-done-date');
    if (manualDoneDate) wireDatePicker(manualDoneDate);

    container.querySelectorAll<HTMLButtonElement>('[data-create-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        createDate = btn.dataset.createDate ?? null;
        paint();
        container.querySelector('#plan-create-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    container.querySelector('#manual-done-trigger')?.addEventListener('click', () => {
      doneFileInput.click();
    });

    doneFileInput.addEventListener('change', async () => {
      const file = doneFileInput.files?.[0];
      doneFileInput.value = '';
      const dateKey = container.querySelector<HTMLInputElement>('#manual-done-date')?.value || todayKey;
      if (!file) return;
      const existingCount = appState.workouts.filter((w) => w.scheduledDate === dateKey).length + (completedByDate.get(dateKey)?.length ?? 0);
      if (existingCount >= MAX_PER_DAY) {
        importErrors.innerHTML = errorsHtml([`Ese día ya tiene ${MAX_PER_DAY} entrenamientos — elige otra fecha.`]);
        return;
      }
      const { session, errors } = await buildCompletedSessionFromFit(file, appState.profile, dateKey);
      importErrors.innerHTML = errorsHtml(errors);
      if (session) {
        await saveSession(session);
        if (appState.user) void pushSessionToCloud(session, appState.profile, appState.user.id);
        sessionsById.set(session.id, session);
        completedByDate.set(dateKey, [...(completedByDate.get(dateKey) ?? []), localToCalendarDone(session)]);
        paint();
      }
    });

    container.querySelectorAll<HTMLButtonElement>('#import-method-chips .plan-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('#import-method-chips .plan-chip').forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        const method = chip.dataset.method;
        container.querySelector<HTMLElement>('#import-method-manual')!.style.display = method === 'manual' ? '' : 'none';
        container.querySelector<HTMLElement>('#import-method-strava')!.style.display = method === 'strava' ? '' : 'none';
      });
    });

    container.querySelector('#strava-import')?.addEventListener('click', async () => {
      const resultEl = container.querySelector<HTMLElement>('#strava-import-result');
      if (!resultEl) return;
      resultEl.textContent = 'Buscando actividades nuevas…';
      try {
        const localSessions = await listSessions();
        const known = new Set<number>();
        localSessions.forEach((s) => s.stravaActivityId !== undefined && known.add(s.stravaActivityId));
        appState.cloudSessions.forEach((s) => s.stravaActivityId !== null && known.add(s.stravaActivityId!));

        const afterUnixS = Math.floor(Date.now() / 1000) - STRAVA_IMPORT_WINDOW_DAYS * 24 * 3600;
        const activities = await listStravaActivities(afterUnixS);
        const pending = activities.filter((a) => !known.has(a.id));

        if (pending.length === 0) {
          resultEl.textContent = 'No hay rodadas nuevas que importar.';
          return;
        }
        for (let i = 0; i < pending.length; i++) {
          resultEl.textContent = `Importando ${i + 1} de ${pending.length}: ${pending[i].name}…`;
          await importStravaActivity(pending[i], appState.profile, appState.user?.id ?? null);
        }
        refresh();
      } catch (err) {
        resultEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
  }

  paint();
  void listSessions().then((sessions) => {
    // toDateKey(new Date(startedAt)), NO startedAt.slice(0,10): un
    // .slice() lee la fecha en UTC, y una sesión grabada tarde en la noche
    // en una timezone detrás de UTC (México incluida) cae en el día
    // siguiente en UTC — se marcaba "hecho" un día después del real. Las
    // celdas del calendario sí están indexadas por fecha local (toDateKey
    // más abajo en paint()), así que la fecha del "hecho" debe calcularse
    // igual para que coincidan.
    completedByDate = new Map();
    sessionsById = new Map();
    sessions.forEach((s) => {
      const key = toDateKey(new Date(s.startedAt));
      completedByDate.set(key, [...(completedByDate.get(key) ?? []), localToCalendarDone(s)]);
      sessionsById.set(s.id, s);
    });
    // sesiones que solo viven en la nube (grabadas en otro dispositivo) —
    // sin esto, esos días nunca se marcan "Hecho" aunque sí aparezcan en Forma.
    // Se agregan (no reemplazan) a lo que ya haya ese día — un día puede
    // tener una sesión local Y una cloud-only a la vez.
    const localIds = new Set(sessions.map((s) => s.id));
    appState.cloudSessions
      .filter((s) => !localIds.has(s.id))
      .forEach((s) => {
        const key = toDateKey(new Date(s.startedAt));
        completedByDate.set(key, [...(completedByDate.get(key) ?? []), cloudToCalendarDone(s)]);
        cloudOnlyByDate.set(key, [...(cloudOnlyByDate.get(key) ?? []), s]);
      });
    paint();
  });

  return () => {};
}
