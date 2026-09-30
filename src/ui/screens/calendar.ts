import { buildCompletedSessionFromFit } from '../../core/completed-session-import';
import { importWorkoutFile } from '../../core/workout-file-import';
import { validateRulesFile, validateWorkout } from '../../core/validator';
import { WORKOUT_TEMPLATES, findTemplate } from '../../core/workout-templates';
import { estimateWorkout } from '../../core/workout-estimate';
import type { RulesFile, Workout } from '../../core/types';
import { saveWorkout, deleteWorkout } from '../../storage/workout-store';
import { listSessions, saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { computeSessionAnalytics } from '../../engine/analytics';
import { pushSessionToCloud } from '../../sync/cloud-sync';
import type { CloudSessionSummary } from '../../sync/cloud-sync';
import { deleteWorkoutFromCloud, pushWorkoutToCloud } from '../../sync/workout-sync';
import { navigate } from '../router';
import { appState } from '../state';
import { renderWorkoutCover } from '../workout-cover';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

function fmtDayShort(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}`;
}

function fmtRange(start: Date, end: Date): string {
  return `${start.getDate()} ${MONTH_NAMES_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES_SHORT[end.getMonth()]}`;
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
}

function localToCalendarDone(s: SessionRecord): CalendarDone {
  const a = computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp });
  return { workoutName: s.workoutName, durationS: s.samples.length, tss: a.trainingStressScore ?? 0 };
}

function cloudToCalendarDone(s: CloudSessionSummary): CalendarDone {
  const durationS = Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
  return { workoutName: s.workoutName, durationS, tss: s.trainingStressScore ?? 0 };
}

function errorsHtml(errors: string[]): string {
  if (errors.length === 0) return '';
  return `<div class="error-box"><strong>${errors.length} error(es):</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
}

async function importRulesFile(file: File, target: Workout): Promise<{ workout?: Workout; errors: string[] }> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { errors: [`"${file.name}" no es JSON válido.`] };
  }
  const result = validateRulesFile(raw);
  if (!result.valid) return { errors: result.errors };
  const rulesFile = raw as RulesFile;
  const merged: Workout = {
    ...target,
    countdown: rulesFile.countdown ?? target.countdown,
    comments: [...(target.comments ?? []), ...(rulesFile.comments ?? [])],
    rules: [...(target.rules ?? []), ...(rulesFile.rules ?? [])],
  };
  const workoutResult = validateWorkout(merged);
  return workoutResult.valid ? { workout: merged, errors: [] } : { errors: workoutResult.errors };
}

export function renderCalendar(container: HTMLElement): () => void {
  const today = new Date();
  const todayKey = toDateKey(today);
  let weekStart = startOfWeek(today);
  let completedByDate = new Map<string, CalendarDone>();
  let pendingScheduleDate: string | null = null;
  let pendingDoneDate: string | null = null;
  let rulesTargetWorkout: Workout | null = null;

  function paint(): void {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const days: string[] = [];
    let plannedS = 0;
    let plannedTss = 0;
    let doneS = 0;
    let doneTss = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const key = toDateKey(d);
      const isToday = key === todayKey;
      const scheduled = appState.workouts.find((w) => w.scheduledDate === key);
      const completed = completedByDate.get(key);
      const est = scheduled ? estimateWorkout(scheduled.intervals, appState.profile.ftp) : null;
      if (est) {
        plannedS += est.durationS;
        plannedTss += est.tss ?? 0;
      }
      if (completed) {
        doneS += completed.durationS;
        doneTss += completed.tss;
      }

      days.push(`
        <div class="plan-day${isToday ? ' today' : ''}${completed ? ' done' : ''}">
          <div class="plan-day-head"><span class="${isToday ? 'plan-day-today-label' : ''}">${fmtDayShort(d)}</span><span class="live-col-label">${completed ? 'Hecho' : isToday ? 'Hoy' : ''}</span></div>
          ${
            scheduled
              ? `
            <button class="plan-day-cover" data-workout-id="${scheduled.id}" title="${scheduled.name} — Editar en biblioteca">${renderWorkoutCover(scheduled.intervals, 'sm')}</button>
            <div class="plan-day-name">${scheduled.name}</div>
            <div class="live-col-label">${est ? `${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS` : ''}</div>
          `
              : completed
                ? `
            <div class="plan-day-name">${completed.workoutName}</div>
            <div class="live-col-label">completado</div>
          `
                : `<button class="plan-day-add" data-add-pending-date="${key}">+ Agregar</button>`
          }
          <div class="plan-day-actions">
            <button class="plan-day-mini-add" data-add-pending-date="${key}" title="Agregar pendiente">+</button>
            <button class="plan-day-mini-add" data-add-done-date="${key}" title="Agregar completado (.fit)">✓</button>
          </div>
        </div>`);
    }

    const unscheduled = appState.workouts.filter((w) => !w.scheduledDate);
    const scheduled = appState.workouts.filter((w) => w.scheduledDate);

    container.innerHTML = `
      <div class="screen plan-screen">
        <div class="plan-head">
          <h1>Plan</h1>
          <div class="row-actions" style="align-items:center;margin:0">
            <button id="plan-today">Hoy</button>
            <button id="plan-prev" aria-label="Semana anterior">‹</button>
            <span class="live-col-label" style="width:150px;text-align:center;display:inline-block">${fmtRange(weekStart, weekEnd)}</span>
            <button id="plan-next" aria-label="Semana siguiente">›</button>
          </div>
        </div>
        <div id="plan-import-errors"></div>
        <div class="plan-week-grid">${days.join('')}</div>
        <div class="plan-totals">
          <span>Semana: <b>${fmtHours(doneS)}</b> de ${fmtHours(plannedS)} h</span>
          <span>TSS: <b>${Math.round(doneTss)}</b> de ${Math.round(plannedTss)}</span>
        </div>

        <div class="plan-bottom">
          <div class="plan-library">
            <div class="plan-library-head"><h2 class="perfil-h2" style="margin:0">Biblioteca</h2><label class="plan-import-link">Importar archivo<input type="file" id="import-workout" accept=".zwo,.mrc,.erg,.json" style="display:none"></label></div>
            <div id="library-list">${[...scheduled, ...unscheduled].map(libraryRow).join('') || '<p class="hint">Todavía no importas ningún workout.</p>'}</div>
          </div>

          <div class="panel plan-generate">
            <h2 class="perfil-h2" style="margin:0">Generar workout</h2>
            <div class="plan-chip-row" id="gen-chips">
              ${WORKOUT_TEMPLATES.map((t, i) => `<button class="plan-chip${i === 0 ? ' on' : ''}" data-template="${t.id}">${t.name}</button>`).join('')}
            </div>
            <label class="live-col-label">Duración<input type="number" id="gen-minutes" value="${WORKOUT_TEMPLATES[0].defaultMinutes}" min="${WORKOUT_TEMPLATES[0].minMinutes}" max="${WORKOUT_TEMPLATES[0].maxMinutes}"></label>
            <p class="hint" id="gen-description">${WORKOUT_TEMPLATES[0].description}</p>
            <button class="btn-light" id="gen-create">Generar y guardar</button>
            <div id="gen-errors"></div>
          </div>
        </div>

        <input type="file" id="import-done-file" accept=".fit" style="display:none">
        <input type="file" id="import-rules" accept=".json" style="display:none">
      </div>
    `;

    wireDayButtons();
    wireLibrary();
    wireGenerate();
    wireRulesInput();

    container.querySelector('#plan-today')?.addEventListener('click', () => {
      weekStart = startOfWeek(new Date());
      paint();
    });
    container.querySelector('#plan-prev')?.addEventListener('click', () => {
      weekStart.setDate(weekStart.getDate() - 7);
      paint();
    });
    container.querySelector('#plan-next')?.addEventListener('click', () => {
      weekStart.setDate(weekStart.getDate() + 7);
      paint();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-workout-id].plan-day-cover').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById(`lib-row-${btn.dataset.workoutId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function libraryRow(w: Workout): string {
    const est = estimateWorkout(w.intervals, appState.profile.ftp);
    const meta = `${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS · ${w.scheduledDate ? `agendado ${w.scheduledDate}` : 'sin fecha'}`;
    return `
      <div class="plan-lib-row" id="lib-row-${w.id}" data-workout-id="${w.id}">
        ${renderWorkoutCover(w.intervals, 'sm')}
        <div class="plan-lib-info">
          <div style="font-weight:500">${w.name}</div>
          <div class="live-col-label">${meta}</div>
        </div>
        <input type="date" class="plan-lib-date" data-schedule-id="${w.id}" value="${w.scheduledDate ?? ''}" title="Agendar">
        <a href="#/prepare" class="prepare-link plan-lib-train" data-train-id="${w.id}">Entrenar</a>
        <div class="plan-lib-menu-wrap">
          <button class="live-menu-btn plan-lib-menu-btn" data-menu-for="${w.id}" aria-label="Más opciones">⋯</button>
          <div class="live-menu" id="menu-${w.id}">
            <button class="live-menu-item" data-action="limits" data-workout-id="${w.id}">Editar límites</button>
            <button class="live-menu-item" data-action="apply-rules" data-workout-id="${w.id}">+ reglas</button>
            <div class="live-menu-divider"></div>
            <button class="live-menu-item danger" data-action="delete" data-workout-id="${w.id}">Borrar</button>
          </div>
        </div>
      </div>`;
  }

  function refreshLibrary(): void {
    const scheduled = appState.workouts.filter((w) => w.scheduledDate);
    const unscheduled = appState.workouts.filter((w) => !w.scheduledDate);
    const list = container.querySelector<HTMLElement>('#library-list')!;
    list.innerHTML = [...scheduled, ...unscheduled].map(libraryRow).join('') || '<p class="hint">Todavía no importas ningún workout.</p>';
    wireLibrary();
  }

  function wireDayButtons(): void {
    const pendingFileInput = container.querySelector<HTMLInputElement>('#import-workout')!;
    const doneFileInput = container.querySelector<HTMLInputElement>('#import-done-file')!;
    const importErrors = container.querySelector<HTMLElement>('#plan-import-errors')!;

    container.querySelectorAll<HTMLButtonElement>('[data-add-pending-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingScheduleDate = btn.dataset.addPendingDate ?? null;
        importErrors.innerHTML = '';
        pendingFileInput.click();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-add-done-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingDoneDate = btn.dataset.addDoneDate ?? null;
        importErrors.innerHTML = '';
        doneFileInput.click();
      });
    });

    pendingFileInput.addEventListener('change', async () => {
      const file = pendingFileInput.files?.[0];
      pendingFileInput.value = '';
      const scheduledDate = pendingScheduleDate;
      pendingScheduleDate = null;
      if (!file) return;
      const { workout, errors } = await importWorkoutFile(file, appState.profile.ftp);
      importErrors.innerHTML = errorsHtml(errors);
      if (workout) {
        if (scheduledDate) workout.scheduledDate = scheduledDate;
        await saveWorkout(workout);
        if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
        appState.workouts = [...appState.workouts, workout];
        paint();
      }
    });

    doneFileInput.addEventListener('change', async () => {
      const file = doneFileInput.files?.[0];
      doneFileInput.value = '';
      const dateKey = pendingDoneDate;
      pendingDoneDate = null;
      if (!file || !dateKey) return;
      const { session, errors } = await buildCompletedSessionFromFit(file, appState.profile, dateKey);
      importErrors.innerHTML = errorsHtml(errors);
      if (session) {
        await saveSession(session);
        if (appState.user) void pushSessionToCloud(session, appState.profile, appState.user.id);
        completedByDate.set(dateKey, localToCalendarDone(session));
        paint();
      }
    });
  }

  function wireLibrary(): void {
    container.querySelectorAll<HTMLInputElement>('[data-schedule-id]').forEach((input) => {
      input.addEventListener('change', async () => {
        const id = input.dataset.scheduleId!;
        const workout = appState.workouts.find((w) => w.id === id);
        if (!workout) return;
        const updated: Workout = { ...workout };
        if (input.value) updated.scheduledDate = input.value;
        else delete updated.scheduledDate;
        await saveWorkout(updated);
        if (appState.user) void pushWorkoutToCloud(updated, appState.user.id);
        appState.workouts = appState.workouts.map((w) => (w.id === id ? updated : w));
        paint();
      });
    });

    container.querySelectorAll<HTMLAnchorElement>('[data-train-id]').forEach((a) => {
      a.addEventListener('click', () => {
        appState.selectedWorkoutId = a.dataset.trainId ?? null;
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-menu-for]').forEach((btn) => {
      const menu = container.querySelector<HTMLElement>(`#menu-${btn.dataset.menuFor}`)!;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = menu.classList.contains('on');
        container.querySelectorAll('.live-menu.on').forEach((m) => m.classList.remove('on'));
        if (!wasOpen) menu.classList.add('on');
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-action="limits"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.selectedWorkoutId = btn.dataset.workoutId ?? null;
        navigate('limits');
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.workoutId!;
        const w = appState.workouts.find((x) => x.id === id);
        if (!w) return;
        if (!window.confirm(`¿Borrar "${w.name}"? No se puede deshacer.`)) return;
        await deleteWorkout(id);
        if (appState.user) void deleteWorkoutFromCloud(id, appState.user.id);
        appState.workouts = appState.workouts.filter((x) => x.id !== id);
        paint();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="apply-rules"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = appState.workouts.find((w) => w.id === btn.dataset.workoutId);
        if (!target) return;
        rulesTargetWorkout = target;
        container.querySelector<HTMLInputElement>('#import-rules')?.click();
      });
    });
  }

  function closeAllMenus(): void {
    container.querySelectorAll('.live-menu.on').forEach((m) => m.classList.remove('on'));
  }

  function wireGenerate(): void {
    const chips = container.querySelectorAll<HTMLButtonElement>('.plan-chip');
    const minutesInput = container.querySelector<HTMLInputElement>('#gen-minutes')!;
    const description = container.querySelector<HTMLElement>('#gen-description')!;
    const genErrors = container.querySelector<HTMLElement>('#gen-errors')!;

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

    container.querySelector('#gen-create')?.addEventListener('click', async () => {
      const activeChip = container.querySelector<HTMLButtonElement>('.plan-chip.on');
      const t = findTemplate(activeChip?.dataset.template ?? WORKOUT_TEMPLATES[0].id);
      if (!t) return;
      const minutes = Math.round(Number(minutesInput.value));
      if (!Number.isFinite(minutes) || minutes < t.minMinutes || minutes > t.maxMinutes) {
        genErrors.innerHTML = errorsHtml([`Minutos fuera de rango para "${t.name}": entre ${t.minMinutes} y ${t.maxMinutes}.`]);
        return;
      }
      const now = new Date();
      const workout: Workout = {
        format_version: 1,
        id: crypto.randomUUID(),
        name: `${t.name} · ${minutes} min · ${now.getDate()} ${MONTH_NAMES_SHORT[now.getMonth()]}`,
        intervals: t.build(minutes),
        created_at: now.toISOString(),
      };
      const result = validateWorkout(workout);
      genErrors.innerHTML = errorsHtml(result.errors);
      if (result.valid) {
        await saveWorkout(workout);
        if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
        appState.workouts = [...appState.workouts, workout];
        refreshLibrary();
      }
    });
  }

  const rulesInput = () => container.querySelector<HTMLInputElement>('#import-rules');
  function wireRulesInput(): void {
    rulesInput()?.addEventListener('change', async () => {
      const input = rulesInput()!;
      const file = input.files?.[0];
      input.value = '';
      if (!file || !rulesTargetWorkout) return;
      const { workout, errors } = await importRulesFile(file, rulesTargetWorkout);
      container.querySelector('#plan-import-errors')!.innerHTML = errorsHtml(errors);
      if (workout) {
        await saveWorkout(workout);
        if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
        appState.workouts = appState.workouts.map((w) => (w.id === workout.id ? workout : w));
        refreshLibrary();
      }
    });
  }

  document.addEventListener('click', closeAllMenus);
  paint();
  void listSessions().then((sessions) => {
    completedByDate = new Map(sessions.map((s) => [s.startedAt.slice(0, 10), localToCalendarDone(s)]));
    // sesiones que solo viven en la nube (grabadas en otro dispositivo) —
    // sin esto, esos días nunca se marcan "Hecho" aunque sí aparezcan en Forma.
    const localIds = new Set(sessions.map((s) => s.id));
    appState.cloudSessions
      .filter((s) => !localIds.has(s.id))
      .forEach((s) => {
        const key = s.startedAt.slice(0, 10);
        if (!completedByDate.has(key)) completedByDate.set(key, cloudToCalendarDone(s));
      });
    paint();
  });

  return () => {
    document.removeEventListener('click', closeAllMenus);
  };
}
