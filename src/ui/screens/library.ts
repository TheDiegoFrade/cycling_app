import { importWorkoutFile } from '../../core/workout-file-import';
import { validateRulesFile, validateWorkout } from '../../core/validator';
import { estimateWorkout } from '../../core/workout-estimate';
import type { RulesFile, Workout } from '../../core/types';
import { saveWorkout, deleteWorkout } from '../../storage/workout-store';
import { deleteWorkoutFromCloud, pushWorkoutToCloud } from '../../sync/workout-sync';
import { getRouteParam, navigate } from '../router';
import { appState } from '../state';
import { renderWorkoutCover } from '../workout-cover';

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

/** Biblioteca de workouts (antes vivía inline en Plan) — con el tiempo la
 * lista crece demasiado para verse cómoda ahí, así que tiene su propia
 * pantalla con búsqueda por título y filtro por rango de fechas agendadas. */
export function renderLibrary(container: HTMLElement): () => void {
  let search = '';
  let dateFrom = '';
  let dateTo = '';
  let rulesTargetWorkout: Workout | null = null;

  function matchesFilters(w: Workout): boolean {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom || dateTo) {
      if (!w.scheduledDate) return false;
      if (dateFrom && w.scheduledDate < dateFrom) return false;
      if (dateTo && w.scheduledDate > dateTo) return false;
    }
    return true;
  }

  function sortedFiltered(): Workout[] {
    const matched = appState.workouts.filter(matchesFilters);
    const scheduled = matched.filter((w) => w.scheduledDate).sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!));
    const unscheduled = matched.filter((w) => !w.scheduledDate);
    return [...scheduled, ...unscheduled];
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

  function renderList(): void {
    const list = container.querySelector<HTMLElement>('#library-list')!;
    const rows = sortedFiltered();
    const emptyHint = appState.workouts.length === 0 ? 'Todavía no importas ningún workout.' : 'Nada coincide con el filtro.';
    list.innerHTML = rows.map(libraryRow).join('') || `<p class="hint">${emptyHint}</p>`;
    wireList();
  }

  function wireList(): void {
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
        renderList();
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
        renderList();
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

  function wireImport(): void {
    const input = container.querySelector<HTMLInputElement>('#import-workout')!;
    const errors = container.querySelector<HTMLElement>('#library-errors')!;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const { workout, errors: errs } = await importWorkoutFile(file, appState.profile.ftp);
      errors.innerHTML = errorsHtml(errs);
      if (workout) {
        await saveWorkout(workout);
        if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
        appState.workouts = [...appState.workouts, workout];
        renderList();
      }
    });
  }

  function wireRulesInput(): void {
    container.querySelector<HTMLInputElement>('#import-rules')?.addEventListener('change', async () => {
      const input = container.querySelector<HTMLInputElement>('#import-rules')!;
      const file = input.files?.[0];
      input.value = '';
      if (!file || !rulesTargetWorkout) return;
      const { workout, errors } = await importRulesFile(file, rulesTargetWorkout);
      container.querySelector('#library-errors')!.innerHTML = errorsHtml(errors);
      if (workout) {
        await saveWorkout(workout);
        if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
        appState.workouts = appState.workouts.map((w) => (w.id === workout.id ? workout : w));
        renderList();
      }
    });
  }

  function wireFilters(): void {
    container.querySelector<HTMLInputElement>('#lib-search')?.addEventListener('input', (e) => {
      search = (e.target as HTMLInputElement).value;
      renderList();
    });
    container.querySelector<HTMLInputElement>('#lib-date-from')?.addEventListener('change', (e) => {
      dateFrom = (e.target as HTMLInputElement).value;
      renderList();
    });
    container.querySelector<HTMLInputElement>('#lib-date-to')?.addEventListener('change', (e) => {
      dateTo = (e.target as HTMLInputElement).value;
      renderList();
    });
    container.querySelector('#lib-clear-filters')?.addEventListener('click', () => {
      search = '';
      dateFrom = '';
      dateTo = '';
      render();
    });
  }

  function closeAllMenus(): void {
    container.querySelectorAll('.live-menu.on').forEach((m) => m.classList.remove('on'));
  }

  function render(): void {
    container.innerHTML = `
      <div class="screen library-screen">
        <div class="plan-head">
          <h1>Historial</h1>
          <label class="plan-import-link">Importar archivo<input type="file" id="import-workout" accept=".zwo,.mrc,.erg,.json" style="display:none"></label>
        </div>
        <div id="library-errors"></div>
        <div class="library-filters">
          <input type="search" id="lib-search" placeholder="Buscar por título…" value="${search}">
          <label class="live-col-label">Desde<input type="date" id="lib-date-from" value="${dateFrom}"></label>
          <label class="live-col-label">Hasta<input type="date" id="lib-date-to" value="${dateTo}"></label>
          <button id="lib-clear-filters" class="btn-light">Limpiar filtros</button>
        </div>
        <div id="library-list"></div>
        <input type="file" id="import-rules" accept=".json" style="display:none">
      </div>
    `;
    renderList();
    wireImport();
    wireFilters();
    wireRulesInput();
  }

  document.addEventListener('click', closeAllMenus);
  render();

  // si venimos de "Ver en Historial" desde una celda de Plan, salta directo
  // a ese workout en vez de dejar al usuario a buscarlo en la lista.
  const focusId = getRouteParam();
  if (focusId) container.querySelector(`#lib-row-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return () => {
    document.removeEventListener('click', closeAllMenus);
  };
}
