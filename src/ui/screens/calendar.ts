import { importWorkoutFile } from '../../core/workout-file-import';
import type { Workout } from '../../core/types';
import { saveWorkout } from '../../storage/workout-store';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

    const cells: string[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push('<div class="cal-cell empty"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = toDateKey(new Date(viewYear, viewMonth, day));
      const dayWorkouts = byDate.get(dateKey) ?? [];
      cells.push(`
        <div class="cal-cell${dateKey === todayKey ? ' today' : ''}">
          <div class="cal-daynum"><span>${day}</span><button class="cal-add" data-add-date="${dateKey}" title="Agregar workout este día">+</button></div>
          ${dayWorkouts
            .map(
              (w) => `
            <div class="cal-chip-wrap">
              <button class="cal-chip" data-workout-id="${w.id}" title="Entrenar">${w.name}</button>
              <button class="cal-chip-remove" data-unschedule-id="${w.id}" title="Quitar del calendario">×</button>
            </div>`,
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
        <p class="hint">Toca el "+" de un día para importar un workout (.zwo/.mrc/.erg/.workout.json) directo a esa fecha.</p>
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
        <input type="file" id="cal-import-file" accept=".zwo,.mrc,.erg,.json" style="display:none">
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

    container.querySelectorAll<HTMLButtonElement>('.cal-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.selectedWorkoutId = btn.dataset.workoutId ?? null;
        navigate('connect');
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

    const fileInput = container.querySelector<HTMLInputElement>('#cal-import-file')!;
    const importErrors = container.querySelector<HTMLElement>('#cal-import-errors')!;

    container.querySelectorAll<HTMLButtonElement>('[data-add-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingScheduleDate = btn.dataset.addDate ?? null;
        importErrors.innerHTML = '';
        fileInput.click();
      });
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
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
  }

  paint();
}
