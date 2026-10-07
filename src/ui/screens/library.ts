import { importWorkoutFile } from '../../core/workout-file-import';
import { validateRulesFile, validateWorkout } from '../../core/validator';
import { estimateWorkout } from '../../core/workout-estimate';
import { computeSessionAnalytics } from '../../engine/analytics';
import { COMPLETION_LABELS, NON_BIKE_KIND_LABELS, isNonBikeKind, srpeLoad } from '../../core/session-kind';
import type { NonBikeKind, SessionCompletion } from '../../core/session-kind';
import type { Interval, RulesFile, Sample, Workout } from '../../core/types';
import { saveWorkout, deleteWorkout } from '../../storage/workout-store';
import type { SessionRecord } from '../../storage/session-store';
import { deleteSession, listSessions } from '../../storage/session-store';
import { deleteSessionFromCloud, downloadSessionSamples } from '../../sync/cloud-sync';
import { deleteWorkoutFromCloud, pushWorkoutToCloud } from '../../sync/workout-sync';
import { getRouteParam, navigate } from '../router';
import { appState } from '../state';
import { escapeHtml, renderWorkoutCover } from '../workout-cover';
import { wireDatePicker } from '../date-picker';

type LibraryTab = 'library' | 'activity';

/** Mismo shape que usaba Forma para su lista de "Actividad" — unifica
 * sesiones locales (con samples) y resúmenes que solo viven en la nube. */
interface HistoryRow {
  id: string;
  workoutId: string;
  workoutName: string;
  startedAt: string;
  durationS: number;
  tss: number;
  ef: number | null;
  rpe: number | null;
  origin: 'local' | 'cloud';
  fromStrava: boolean;
  /** Perfil de potencia real de la sesión (% de FTP por tramo) — solo para
   * sesiones locales (tienen samples). Sirve para dibujar una portada
   * cuando la sesión no corresponde a ningún workout planeado en Torq (un
   * .fit importado a mano, o de Strava): ahí no hay "intervalos" que
   * mostrar, así que se grafica lo que de verdad se pedaleó. */
  powerPctBuckets: number[] | null;
  /** Para sesiones cloud-only: de dónde descargar sus samples bajo demanda
   * (ver loadActivity) para poder calcular powerPctBuckets igual que las
   * locales. null en sesiones locales (ya tienen samples) o sin .fit
   * guardado (muy viejas). */
  fitPath: string | null;
  /** Fuerza/movilidad/flexibilidad/otro registrada a mano: sin portada de
   * potencia ni TSS, se abre en Registrar en vez de Resumen. */
  nonBikeKind?: NonBikeKind;
  completion?: SessionCompletion | null;
  srpe?: number | null;
}

/** Abreviatura para el cuadro de color que sustituye a la portada. */
const KIND_SHORT: Record<NonBikeKind, string> = { strength: 'FZA', mobility: 'MOV', flexibility: 'FLX', other: 'OTRO' };

/** Fila de una sesión que no es de bici — mismas columnas, duración de reloj. */
function nonBikeRow(
  s: { id: string; workoutName: string; startedAt: string; finishedAt: string; rpe?: number | null; completion?: SessionCompletion | null },
  kind: NonBikeKind,
  origin: 'local' | 'cloud',
): HistoryRow {
  const durationS = Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
  return {
    id: s.id,
    workoutId: '',
    workoutName: s.workoutName,
    startedAt: s.startedAt,
    durationS,
    tss: 0,
    ef: null,
    rpe: s.rpe ?? null,
    origin,
    fromStrava: false,
    powerPctBuckets: null,
    fitPath: null,
    nonBikeKind: kind,
    completion: s.completion ?? null,
    srpe: srpeLoad(kind, s.completion, s.rpe, durationS / 60),
  };
}

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
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

/** Resume el perfil de potencia real en N tramos (% de FTP promedio de cada
 * tramo) — ver nota en HistoryRow.powerPctBuckets sobre para qué sirve. */
function bucketedPowerPcts(samples: readonly Sample[], ftp: number, buckets = 16): number[] {
  if (samples.length === 0 || ftp <= 0) return [];
  const bucketSize = samples.length / buckets;
  const result: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    const slice = samples.slice(start, end);
    const avgPower = slice.reduce((sum, s) => sum + s.power, 0) / slice.length;
    result.push((avgPower / ftp) * 100);
  }
  return result;
}

function localRow(session: SessionRecord): HistoryRow {
  if (isNonBikeKind(session.kind)) return nonBikeRow(session, session.kind, 'local');
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
    powerPctBuckets: bucketedPowerPcts(session.samples, session.ftp),
    fitPath: null,
  };
}

function cloudRow(s: (typeof appState.cloudSessions)[number]): HistoryRow {
  if (isNonBikeKind(s.kind)) return nonBikeRow(s, s.kind, 'cloud');
  return {
    id: s.id,
    workoutId: '',
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
    powerPctBuckets: null,
    fitPath: s.fitPath,
  };
}

function activityCoverHtml(row: HistoryRow): string {
  const workout = appState.workouts.find((w) => w.id === row.workoutId);
  if (workout) return renderWorkoutCover(workout.intervals, 'sm');
  if (row.powerPctBuckets && row.powerPctBuckets.length > 0) {
    const intervals: Interval[] = row.powerPctBuckets.map((pct) => ({ name: '', type: 'steady', duration_s: 1, power_pct: pct }));
    return renderWorkoutCover(intervals, 'sm');
  }
  return `<div class="workout-cover workout-cover-sm" style="background:var(--surface)"></div>`;
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

/** Biblioteca de workouts + Actividad (sesiones completadas) — dos pestañas
 * porque son dominios distintos con acciones distintas; combinarlos en una
 * sola lista perdía las acciones específicas de cada uno. Con el tiempo
 * ambas listas crecen demasiado para verse cómodas inline en Plan/Forma, por
 * eso viven aquí con su propio espacio (Biblioteca además con búsqueda por
 * título y filtro por rango de fechas). */
export function renderLibrary(container: HTMLElement): () => void {
  let activeTab: LibraryTab = 'library';
  let search = '';
  let dateFrom = '';
  let dateTo = '';
  let rulesTargetWorkout: Workout | null = null;
  let activityRows: HistoryRow[] | null = null; // null mientras carga

  function matchesFilters(w: Workout): boolean {
    return !search || w.name.toLowerCase().includes(search.toLowerCase());
  }

  function matchesActivityDate(r: HistoryRow): boolean {
    if (!dateFrom && !dateTo) return true;
    const day = r.startedAt.slice(0, 10);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
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

  function nonBikeRowHtml(r: HistoryRow, kind: NonBikeKind): string {
    const skipped = r.completion === 'skipped';
    const meta = skipped ? [COMPLETION_LABELS.skipped] : [r.rpe ? `RPE ${r.rpe}` : null, r.srpe !== null && r.srpe !== undefined ? `${r.srpe} sRPE` : null].filter(Boolean);
    const when = skipped ? fmtDateEsMx(r.startedAt) : `${fmtDateEsMx(r.startedAt)} · ${fmt(r.durationS)}`;
    return `
      <div class="forma-row" data-action="view" data-session-id="${r.id}" data-origin="${r.origin}" data-log="1" role="button" tabindex="0">
        <div class="forma-row-kind kind-${kind} num" aria-hidden="true">${KIND_SHORT[kind]}</div>
        <div class="forma-row-info">
          <div class="forma-row-name">${escapeHtml(r.workoutName)}</div>
          <div class="live-col-label forma-row-name">${when} · ${NON_BIKE_KIND_LABELS[kind]}${r.completion === 'partial' ? ' · parcial' : ''}</div>
        </div>
        <div class="live-col-label forma-row-meta">${meta.join(' · ')}</div>
        <button class="live-menu-item danger forma-delete" data-action="delete" data-session-id="${r.id}" data-origin="${r.origin}">Borrar</button>
      </div>`;
  }

  function activityRowHtml(r: HistoryRow): string {
    if (r.nonBikeKind) return nonBikeRowHtml(r, r.nonBikeKind);
    const meta = [`TSS ${Math.round(r.tss)}`];
    if (r.ef !== null) meta.push(`EF ${r.ef.toFixed(2)}`);
    if (r.rpe) meta.push(`RPE ${r.rpe}`);
    return `
      <div class="forma-row" data-action="view" data-session-id="${r.id}" data-origin="${r.origin}" role="button" tabindex="0">
        ${activityCoverHtml(r)}
        <div class="forma-row-info">
          <div class="forma-row-name">${r.workoutName}</div>
          <div class="live-col-label forma-row-name">${fmtDateEsMx(r.startedAt)} · ${fmt(r.durationS)} · ${r.fromStrava ? 'Strava' : 'TORQ'}${r.origin === 'cloud' ? ' · ☁ solo resumen' : ''}</div>
        </div>
        <div class="live-col-label forma-row-meta">${meta.join(' · ')}</div>
        <button class="live-menu-item danger forma-delete" data-action="delete" data-session-id="${r.id}" data-origin="${r.origin}">Borrar</button>
      </div>`;
  }

  function libraryTabHtml(): string {
    return `
      <div class="library-filters">
        <input type="search" id="lib-search" placeholder="Buscar por título…" value="${search}">
        ${search ? '<button id="lib-clear-filters" class="btn-light">Limpiar filtros</button>' : ''}
      </div>
      <div id="library-list"></div>
    `;
  }

  function activityTabHtml(): string {
    const filterRow = `
      <div class="library-filters">
        <label class="live-col-label">Desde<input type="date" id="lib-date-from" value="${dateFrom}"></label>
        <label class="live-col-label">Hasta<input type="date" id="lib-date-to" value="${dateTo}"></label>
        ${dateFrom || dateTo ? '<button id="lib-clear-filters" class="btn-light">Limpiar filtros</button>' : ''}
        <a href="#/log" class="plan-import-link" style="margin-left:auto;align-self:center">Registrar fuerza o movilidad</a>
      </div>
    `;
    if (activityRows === null) return `${filterRow}<p class="hint">Cargando…</p>`;
    const rows = activityRows.filter(matchesActivityDate);
    if (rows.length === 0) {
      const emptyHint = activityRows.length === 0 ? 'Todavía no hay sesiones guardadas.' : 'Nada coincide con el filtro.';
      return `${filterRow}<p class="hint">${emptyHint}</p>`;
    }
    return `${filterRow}<div class="forma-list">${rows.map(activityRowHtml).join('')}</div>`;
  }

  function renderList(): void {
    const list = container.querySelector<HTMLElement>('#library-list')!;
    const rows = sortedFiltered();
    const emptyHint = appState.workouts.length === 0 ? 'Todavía no importas ningún workout.' : 'Nada coincide con el filtro.';
    list.innerHTML = rows.map(libraryRow).join('') || `<p class="hint">${emptyHint}</p>`;
    wireLibraryList();
  }

  function wireLibraryList(): void {
    container.querySelectorAll<HTMLInputElement>('[data-schedule-id]').forEach((input) => {
      wireDatePicker(input);
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

  function wireActivity(): void {
    let localById = new Map<string, SessionRecord>();
    container.querySelectorAll<HTMLElement>('[data-action="view"]').forEach((el) => {
      const openSession = (): void => {
        if (el.dataset.log) {
          navigate('log', el.dataset.sessionId!);
          return;
        }
        const origin = el.dataset.origin as 'local' | 'cloud';
        if (origin === 'cloud') {
          const cloud = appState.cloudSessions.find((s) => s.id === el.dataset.sessionId);
          if (!cloud) return;
          appState.lastSession = null;
          appState.lastCloudSession = cloud;
          navigate('session');
          return;
        }
        listSessions().then((sessions) => {
          localById = new Map(sessions.map((s) => [s.id, s]));
          const session = localById.get(el.dataset.sessionId!);
          if (!session) return;
          appState.lastSession = session;
          appState.lastCloudSession = null;
          navigate('session');
        });
      };
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-action="delete"]')) return;
        openSession();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSession();
        }
      });
    });

    container.querySelectorAll<HTMLElement>('.forma-list [data-action="delete"]').forEach((el) => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = el.dataset.sessionId!;
        const origin = el.dataset.origin as 'local' | 'cloud';
        if (!window.confirm('¿Borrar esta sesión? No se puede deshacer.')) return;

        if (origin === 'local') {
          await deleteSession(id);
          // best-effort: si también estaba sincronizada, la quita de la nube
          // para que no reaparezca como "solo en la nube" después.
          if (appState.user) await deleteSessionFromCloud(id, appState.user.id);
        } else if (appState.user) {
          await deleteSessionFromCloud(id, appState.user.id);
          appState.cloudSessions = appState.cloudSessions.filter((s) => s.id !== id);
        }
        // actualiza en el propio estado del cierre (no refresh() del router,
        // que reiniciaría activeTab a "library") y repinta solo esta pantalla.
        activityRows = (activityRows ?? []).filter((r) => r.id !== id);
        render();
      });
    });
  }

  function loadActivity(): void {
    listSessions().then((localSessions) => {
      const localIds = new Set(localSessions.map((s) => s.id));
      activityRows = [...localSessions.map(localRow), ...appState.cloudSessions.filter((s) => !localIds.has(s.id)).map(cloudRow)].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      );
      if (activeTab === 'activity') render();
      enrichCloudCovers();
    });
  }

  /** Las sesiones cloud-only no traen samples (solo el resumen) — para
   * poder dibujar su portada real (ver activityCoverHtml) hay que bajar su
   * .fit y decodificarlo, igual que ya hace Inicio para "Tiempo por zona".
   * Se hace después del primer pintado para no retrasar la lista. */
  function enrichCloudCovers(): void {
    const rows = activityRows;
    if (!rows) return;
    const pending = rows.filter((r) => r.origin === 'cloud' && r.fitPath && r.powerPctBuckets === null);
    if (pending.length === 0) return;
    Promise.all(
      pending.map(async (row) => {
        const samples = await downloadSessionSamples(row.fitPath!).catch(() => null);
        if (!samples || samples.length === 0) return;
        const cloudSession = appState.cloudSessions.find((s) => s.id === row.id);
        row.powerPctBuckets = bucketedPowerPcts(samples, cloudSession?.ftp ?? appState.profile.ftp);
      }),
    ).then(() => {
      if (activeTab === 'activity' && activityRows === rows) render();
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

  function wireLibraryFilters(): void {
    container.querySelector<HTMLInputElement>('#lib-search')?.addEventListener('input', (e) => {
      search = (e.target as HTMLInputElement).value;
      renderList();
    });
    container.querySelector('#lib-clear-filters')?.addEventListener('click', () => {
      search = '';
      render();
    });
  }

  function wireActivityFilters(): void {
    const dateFromInput = container.querySelector<HTMLInputElement>('#lib-date-from');
    if (dateFromInput) wireDatePicker(dateFromInput);
    dateFromInput?.addEventListener('change', (e) => {
      dateFrom = (e.target as HTMLInputElement).value;
      render();
    });
    const dateToInput = container.querySelector<HTMLInputElement>('#lib-date-to');
    if (dateToInput) wireDatePicker(dateToInput);
    dateToInput?.addEventListener('change', (e) => {
      dateTo = (e.target as HTMLInputElement).value;
      render();
    });
    container.querySelector('#lib-clear-filters')?.addEventListener('click', () => {
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
          ${activeTab === 'library' ? `<label class="plan-import-link">Importar archivo<input type="file" id="import-workout" accept=".zwo,.mrc,.erg,.json" style="display:none"></label>` : ''}
        </div>
        <div class="plan-view-toggle" style="margin:16px 0">
          <button class="plan-view-btn${activeTab === 'library' ? ' on' : ''}" id="tab-library">Biblioteca</button>
          <button class="plan-view-btn${activeTab === 'activity' ? ' on' : ''}" id="tab-activity">Actividad</button>
        </div>
        <div id="library-errors"></div>
        ${activeTab === 'library' ? libraryTabHtml() : activityTabHtml()}
        <input type="file" id="import-rules" accept=".json" style="display:none">
      </div>
    `;

    if (activeTab === 'library') {
      renderList();
      wireImport();
      wireLibraryFilters();
    } else {
      wireActivity();
      wireActivityFilters();
    }
    wireRulesInput();

    container.querySelector('#tab-library')?.addEventListener('click', () => {
      if (activeTab === 'library') return;
      activeTab = 'library';
      render();
    });
    container.querySelector('#tab-activity')?.addEventListener('click', () => {
      if (activeTab === 'activity') return;
      activeTab = 'activity';
      render();
    });
  }

  document.addEventListener('click', closeAllMenus);
  render();
  loadActivity();

  // si venimos de "Ver en Historial" desde una celda de Plan, salta directo
  // a ese workout en vez de dejar al usuario a buscarlo en la lista (siempre
  // en la pestaña Biblioteca, que es a la que apunta ese link).
  const focusId = getRouteParam();
  if (focusId) container.querySelector(`#lib-row-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return () => {
    document.removeEventListener('click', closeAllMenus);
  };
}
