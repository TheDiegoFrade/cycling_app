import { buildCompletedSessionFromFit } from '../../core/completed-session-import';
import { importWorkoutFile } from '../../core/workout-file-import';
import type { Workout } from '../../core/types';
import { saveWorkout } from '../../storage/workout-store';
import { listSessions, saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { pushSessionToCloud } from '../../sync/cloud-sync';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface CompletedEntry {
  id: string;
  name: string;
  startedAt: string;
  origin: 'local' | 'cloud';
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Recorta el texto que se muestra en un chip del calendario — un nombre
 * largo (típico en archivos .fit con nombres crípticos del dispositivo) no
 * debe estirar la fila entera del mes; el nombre completo sigue disponible
 * en el `title` (tooltip) de cada chip. */
function truncateChipLabel(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function errorsHtml(errors: string[]): string {
  if (errors.length === 0) return '';
  return `<div class="error-box"><strong>${errors.length} error(es):</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
}

export function renderCalendar(container: HTMLElement): void {
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let pendingScheduleDate: string | null = null;
  let pendingDoneDate: string | null = null;
  let localSessions: SessionRecord[] = [];
  const localSessionById = new Map<string, SessionRecord>();

  function paint(): void {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayKey = toDateKey(today);

    const byDate = new Map<string, Workout[]>();
    appState.workouts.forEach((w) => {
      if (!w.scheduledDate) return;
      const list = byDate.get(w.scheduledDate) ?? [];
      list.push(w);
      byDate.set(w.scheduledDate, list);
    });

    const localIds = new Set(localSessions.map((s) => s.id));
    const completedEntries: CompletedEntry[] = [
      ...localSessions.map((s): CompletedEntry => ({ id: s.id, name: s.workoutName, startedAt: s.startedAt, origin: 'local' })),
      ...appState.cloudSessions
        .filter((s) => !localIds.has(s.id))
        .map((s): CompletedEntry => ({ id: s.id, name: s.workoutName, startedAt: s.startedAt, origin: 'cloud' })),
    ];
    const completedByDate = new Map<string, CompletedEntry[]>();
    completedEntries.forEach((e) => {
      const key = e.startedAt.slice(0, 10);
      const list = completedByDate.get(key) ?? [];
      list.push(e);
      completedByDate.set(key, list);
    });

    const cells: string[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push('<div class="cal-cell empty"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = toDateKey(new Date(viewYear, viewMonth, day));
      const dayWorkouts = byDate.get(dateKey) ?? [];
      const dayCompleted = completedByDate.get(dateKey) ?? [];
      cells.push(`
        <div class="cal-cell${dateKey === todayKey ? ' today' : ''}">
          <div class="cal-daynum">
            <span>${day}</span>
            <span class="cal-add-group">
              <button class="cal-add" data-add-pending-date="${dateKey}" title="Agregar pendiente (.zwo/.mrc/.erg/.workout.json)">+</button>
              <button class="cal-add cal-add-done" data-add-done-date="${dateKey}" title="Agregar completado (.fit)">✓</button>
            </span>
          </div>
          ${dayWorkouts
            .map(
              (w) => `
            <div class="cal-chip-wrap">
              <button class="cal-chip" data-workout-id="${w.id}" title="${w.name} — Entrenar">${truncateChipLabel(w.name)}</button>
              <button class="cal-chip-remove" data-unschedule-id="${w.id}" title="Quitar del calendario">×</button>
            </div>`,
            )
            .join('')}
          ${dayCompleted
            .map((e) =>
              e.origin === 'local'
                ? `<button class="cal-chip cal-chip-done" data-view-session-id="${e.id}" title="${e.name} — Ver sesión">✅ ${truncateChipLabel(e.name)}</button>`
                : `<div class="cal-chip cal-chip-done cal-chip-readonly" title="${e.name} — grabada en otro dispositivo, solo resumen en Historial">✅ ${truncateChipLabel(e.name)}</div>`,
            )
            .join('')}
        </div>
      `);
    }

    const unscheduled = appState.workouts.filter((w) => !w.scheduledDate);

    container.innerHTML = `
      <div class="screen">
        ${renderNav('calendar')}
        <h1>Calendario</h1>
        <p class="hint">"+" agrega un workout pendiente para entrenar; "✓" registra uno ya completado (.fit) en esa fecha.</p>
        <div class="row-actions" style="align-items:center;margin:16px 0">
          <button id="cal-prev">← Anterior</button>
          <h2 style="margin:0">${MONTH_NAMES[viewMonth]} ${viewYear}</h2>
          <button id="cal-next">Siguiente →</button>
        </div>
        <div id="cal-import-errors"></div>
        <div class="cal-grid">
          ${DAY_LABELS.map((d) => `<div class="cal-cell head">${d}</div>`).join('')}
          ${cells.join('')}
        </div>

        <h2 style="margin-top:28px">Sin fecha</h2>
        <p class="hint">Workouts en tu biblioteca que todavía no agendaste.</p>
        ${
          unscheduled.length === 0
            ? '<p class="hint">Todos tus workouts ya tienen fecha.</p>'
            : `<div class="list">
              ${unscheduled
                .map(
                  (w) => `
                <div class="list-item" data-workout-id="${w.id}">
                  <div>${w.name}</div>
                  <div class="row-actions">
                    <input type="date" data-schedule-id="${w.id}">
                  </div>
                </div>`,
                )
                .join('')}
            </div>`
        }
        <input type="file" id="cal-import-pending-file" accept=".zwo,.mrc,.erg,.json" style="display:none">
        <input type="file" id="cal-import-done-file" accept=".fit" style="display:none">
      </div>
    `;

    container.querySelector('#cal-prev')?.addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      paint();
    });
    container.querySelector('#cal-next')?.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      paint();
    });

    container.querySelectorAll<HTMLButtonElement>('.cal-chip[data-workout-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.selectedWorkoutId = btn.dataset.workoutId ?? null;
        navigate('connect');
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-view-session-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const session = localSessionById.get(btn.dataset.viewSessionId!);
        if (!session) return;
        appState.lastSession = session;
        navigate('summary');
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-unschedule-id]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.unscheduleId!;
        const workout = appState.workouts.find((w) => w.id === id);
        if (!workout) return;
        const updated: Workout = { ...workout };
        delete updated.scheduledDate;
        await saveWorkout(updated);
        appState.workouts = appState.workouts.map((w) => (w.id === id ? updated : w));
        paint();
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-schedule-id]').forEach((input) => {
      input.addEventListener('change', async () => {
        const id = input.dataset.scheduleId!;
        const workout = appState.workouts.find((w) => w.id === id);
        if (!workout || !input.value) return;
        const updated: Workout = { ...workout, scheduledDate: input.value };
        await saveWorkout(updated);
        appState.workouts = appState.workouts.map((w) => (w.id === id ? updated : w));
        paint();
      });
    });

    const pendingFileInput = container.querySelector<HTMLInputElement>('#cal-import-pending-file')!;
    const doneFileInput = container.querySelector<HTMLInputElement>('#cal-import-done-file')!;
    const importErrors = container.querySelector<HTMLElement>('#cal-import-errors')!;

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
      if (!file || !scheduledDate) return;
      const { workout, errors } = await importWorkoutFile(file, appState.profile.ftp);
      importErrors.innerHTML = errorsHtml(errors);
      if (workout) {
        workout.scheduledDate = scheduledDate;
        await saveWorkout(workout);
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
        localSessions = [...localSessions, session];
        localSessionById.set(session.id, session);
        paint();
      }
    });
  }

  paint();
  void listSessions().then((sessions) => {
    localSessions = sessions;
    sessions.forEach((s) => localSessionById.set(s.id, s));
    paint();
  });
}
