// Registrar fuerza, movilidad o flexibilidad (ver
// docs/coach-view/mockups/Registrar.dc.html). #/log registra una nueva;
// #/log/:id edita una ya registrada. Estas sesiones se miden con sRPE
// (RPE × minutos), nunca con TSS — ver core/session-kind.ts.
import { parseFitActivity } from '../../core/fit-activity-parser';
import { buildLoggedSession, validateLogSessionForm } from '../../core/logged-session';
import type { LogSessionForm } from '../../core/logged-session';
import { COMPLETION_LABELS, NON_BIKE_KINDS, NON_BIKE_KIND_LABELS, SESSION_COMPLETIONS, isNonBikeKind, srpeLoad } from '../../core/session-kind';
import type { NonBikeKind } from '../../core/session-kind';
import { deleteSession, listSessions, saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { deleteSessionFromCloud, downloadSessionSamples, pushSessionToCloud } from '../../sync/cloud-sync';
import type { CloudSessionSummary } from '../../sync/cloud-sync';
import { wireDatePicker } from '../date-picker';
import { getPreviousHash, getRouteParam, navigate } from '../router';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';
import { TEMPLATE_KIND_LABELS, safeVideoUrl } from '../../core/coach-templates';
import type { PlannedRoutine } from '../../core/coach-templates';
import { humanCoachName } from '../coach-notice';

const RPE_HINTS: Record<number, string> = {
  1: 'Muy fácil',
  2: 'Fácil',
  3: 'Ligero',
  4: 'Moderado',
  5: 'Algo duro',
  6: 'Duro',
  7: 'Muy duro',
  8: 'Intenso',
  9: 'Casi al máximo',
  10: 'Máximo',
};

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wallClockMinutes(startedAt: string, finishedAt: string): number {
  return Math.round(Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000);
}

/** La sesión a editar: local si existe (trae samples), si no se arma desde
 * el resumen de la nube — y si ese resumen tiene .fit, se bajan sus
 * samples para no perderlos al volver a guardar. */
async function loadExisting(id: string): Promise<SessionRecord | null> {
  const local = (await listSessions()).find((s) => s.id === id);
  if (local) return local;
  const cloud = appState.cloudSessions.find((s) => s.id === id);
  if (!cloud) return null;
  const samples = cloud.fitPath ? ((await downloadSessionSamples(cloud.fitPath)) ?? []) : [];
  return cloudToRecord(cloud, samples);
}

function cloudToRecord(s: CloudSessionSummary, samples: SessionRecord['samples']): SessionRecord {
  return {
    id: s.id,
    workoutId: s.workoutId ?? '',
    workoutName: s.workoutName,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    ftp: s.ftp,
    samples,
    alerts: [],
    intensityChanges: [],
    rpe: s.rpe ?? undefined,
    note: s.note ?? undefined,
    source: s.source,
    kind: s.kind ?? undefined,
    completion: s.completion ?? undefined,
    plannedItemId: s.plannedItemId ?? undefined,
  };
}

function formFrom(existing: SessionRecord | null): LogSessionForm {
  if (!existing || !isNonBikeKind(existing.kind)) {
    return { kind: 'strength', name: '', dateKey: toDateKey(new Date()), completion: 'complete', minutes: null, rpe: null, note: '', fit: null };
  }
  const kind = existing.kind;
  return {
    kind,
    name: existing.workoutName === NON_BIKE_KIND_LABELS[kind] ? '' : existing.workoutName,
    dateKey: toDateKey(new Date(existing.startedAt)),
    completion: existing.completion ?? 'complete',
    minutes: existing.completion === 'skipped' ? null : wallClockMinutes(existing.startedAt, existing.finishedAt) || null,
    rpe: existing.rpe ?? null,
    note: existing.note ?? '',
    fit: existing.samples.length > 0 ? { samples: existing.samples, startedAt: existing.startedAt } : null,
  };
}

/** La rutina que agendó el coach: ejercicios, dosis, videos y su nota
 * (lado izquierdo de docs/coach-view/mockups/Registrar.dc.html). */
function routineCardHtml(r: PlannedRoutine): string {
  const p = r.payload;
  const coach = humanCoachName();
  const pill = [TEMPLATE_KIND_LABELS[r.kind], p.durationMin ? `${p.durationMin} min` : null, p.targetRpe ? `RPE objetivo ${p.targetRpe}` : null]
    .filter(Boolean)
    .join(' · ');
  return `
    <section class="panel log-card log-routine" data-log-kind="${r.kind}" aria-label="Rutina de tu coach">
      <span class="live-col-label">${coach ? `Asignada por ${escapeHtml(coach)}` : 'Rutina asignada'}</span>
      <h2 class="perfil-h2" style="margin:0">${escapeHtml(r.name)}</h2>
      <span class="coach-pill log-routine-pill">${escapeHtml(pill)}</span>
      ${p.description ? `<p class="hint">${escapeHtml(p.description)}</p>` : ''}
      <div class="log-exercises">
        ${p.exercises
          .map((e) => {
            const url = safeVideoUrl(e.videoUrl);
            return `
          <div class="log-exercise">
            <div><div class="log-exercise-name">${escapeHtml(e.name)}</div>${e.dose ? `<div class="hint">${escapeHtml(e.dose)}</div>` : ''}</div>
            ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="log-video" aria-label="Ver video de ${escapeHtml(e.name)}">▶ Video</a>` : ''}
          </div>`;
          })
          .join('')}
      </div>
      ${p.note ? `<div class="log-coach-note">${coach ? `Nota de ${escapeHtml(coach)}` : 'Nota'}: ${escapeHtml(p.note)}</div>` : ''}
    </section>`;
}

export function renderLogSession(container: HTMLElement): void {
  const param = getRouteParam();
  // #/log/r-<id> = registrar una rutina agendada por el coach;
  // #/log/<id> = editar una sesión ya registrada.
  const routineId = param?.startsWith('r-') ? param.slice(2) : null;
  const editId = routineId ? null : param;
  let routine: PlannedRoutine | null = routineId ? (appState.plannedRoutines.find((r) => r.id === routineId) ?? null) : null;
  let existing: SessionRecord | null = null;
  let form: LogSessionForm = formFrom(null);
  let fitLabel: string | null = null;
  let errors: string[] = [];
  let saving = false;

  function choiceButtons<T extends string>(group: string, values: readonly T[], labels: Record<T, string>, selected: T): string {
    return values
      .map(
        (v) =>
          `<button type="button" role="radio" class="log-choice${v === selected ? ' on' : ''}" aria-checked="${v === selected}" data-${group}="${v}">${labels[v]}</button>`,
      )
      .join('');
  }

  function loadText(): string {
    const load = srpeLoad(form.kind, form.completion, form.rpe, form.minutes ?? 0);
    return load === null ? '—' : String(load);
  }

  function render(): void {
    const skipped = form.completion === 'skipped';
    const title = existing ? 'Editar sesión' : routine ? 'Registrar rutina' : 'Registrar fuerza o movilidad';
    container.innerHTML = `
      <div class="screen log-screen">
        <header class="log-head">
          <span class="live-col-label">${existing ? 'Registrada a mano' : 'Lo que hiciste fuera de la bici'}</span>
          <h1>${title}</h1>
        </header>

        <div class="log-layout">
        ${routine ? routineCardHtml(routine) : ''}
        <section class="panel log-card" data-log-kind="${form.kind}" aria-label="Registrar">
          <h2 class="perfil-h2" style="margin:0">¿Cómo te fue?</h2>

          <div class="log-field">
            <span class="live-col-label" id="lbl-tipo">Tipo</span>
            <div role="radiogroup" aria-labelledby="lbl-tipo" class="log-choices">
              ${choiceButtons<NonBikeKind>('kind', NON_BIKE_KINDS, NON_BIKE_KIND_LABELS, form.kind)}
            </div>
          </div>

          <div class="log-row">
            <label>Nombre (opcional)<input type="text" id="log-name" maxlength="80" placeholder="${NON_BIKE_KIND_LABELS[form.kind]}" value="${escapeHtml(form.name)}"></label>
            <label>Fecha<input type="date" id="log-date" value="${form.dateKey}"></label>
          </div>

          <div class="log-field">
            <span class="live-col-label" id="lbl-hecha">¿La completaste?</span>
            <div role="radiogroup" aria-labelledby="lbl-hecha" class="log-choices">
              ${choiceButtons('completion', SESSION_COMPLETIONS, COMPLETION_LABELS, form.completion)}
            </div>
          </div>

          ${
            skipped
              ? ''
              : `
          <label>Duración (minutos)<input type="number" id="log-minutes" min="1" max="600" inputmode="numeric" placeholder="45" value="${form.minutes ?? ''}" class="log-minutes"></label>

          <div class="log-field">
            <div class="log-rpe-head">
              <span class="live-col-label" id="lbl-rpe">Esfuerzo percibido (RPE)</span>
              <span class="hint" id="log-rpe-hint">${form.rpe ? `${form.rpe} · ${RPE_HINTS[form.rpe]}` : 'Elige del 1 al 10'}</span>
            </div>
            <div role="radiogroup" aria-labelledby="lbl-rpe" class="log-rpe-grid">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                .map((n) => `<button type="button" role="radio" class="log-rpe-btn num${form.rpe === n ? ' on' : ''}" aria-checked="${form.rpe === n}" aria-label="RPE ${n}" data-rpe="${n}">${n}</button>`)
                .join('')}
            </div>
          </div>`
          }

          <label>Nota (opcional)<textarea id="log-note" rows="2" maxlength="500" placeholder="Ej. la zancada molestó un poco, hice puente de glúteo">${escapeHtml(form.note)}</textarea></label>

          ${
            skipped
              ? ''
              : `
          <div class="log-fit">
            <span class="hint">${fitLabel ?? (form.fit ? 'Con datos del reloj (.fit)' : '¿La grabaste en tu reloj? Sube el .fit para guardar también tu pulso.')}</span>
            ${
              form.fit
                ? '<button type="button" id="log-fit-remove">Quitar .fit</button>'
                : '<button type="button" id="log-fit-trigger">Subir .fit</button>'
            }
          </div>`
          }

          ${errors.length ? `<div class="error-box"><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}

          <div class="log-footer">
            <span class="hint">Carga estimada: <span class="num log-load" id="log-load">${loadText()}</span> sRPE · se cuenta aparte del TSS de la bici</span>
            <div class="row-actions" style="margin:0">
              ${existing ? '<button type="button" id="log-delete" class="log-delete">Borrar</button>' : ''}
              <button type="button" class="btn-light" id="log-save"${saving ? ' disabled' : ''}>${saving ? 'Guardando…' : 'Guardar sesión'}</button>
            </div>
          </div>
        </section>
        </div>
        <input type="file" id="log-fit-file" accept=".fit" style="display:none">
      </div>`;
    wire();
  }

  /** Lee los inputs de texto al estado antes de re-renderizar, para no
   * perder lo escrito al tocar un botón de opción. */
  function readInputs(): void {
    const name = container.querySelector<HTMLInputElement>('#log-name');
    if (name) form.name = name.value;
    const date = container.querySelector<HTMLInputElement>('#log-date');
    if (date) form.dateKey = date.value;
    const minutes = container.querySelector<HTMLInputElement>('#log-minutes');
    if (minutes) form.minutes = minutes.value ? Number(minutes.value) : null;
    const note = container.querySelector<HTMLTextAreaElement>('#log-note');
    if (note) form.note = note.value;
  }

  function rerender(): void {
    readInputs();
    errors = []; // ya cambió algo: los errores del intento anterior pueden no aplicar
    render();
  }

  function wire(): void {
    container.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        form.kind = btn.dataset.kind as NonBikeKind;
        rerender();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-completion]').forEach((btn) => {
      btn.addEventListener('click', () => {
        form.completion = btn.dataset.completion as LogSessionForm['completion'];
        rerender();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-rpe]').forEach((btn) => {
      btn.addEventListener('click', () => {
        form.rpe = Number(btn.dataset.rpe);
        rerender();
      });
    });

    const dateInput = container.querySelector<HTMLInputElement>('#log-date');
    if (dateInput) wireDatePicker(dateInput);

    // la carga estimada se actualiza mientras escribe los minutos, sin
    // re-renderizar (perdería el foco del input).
    container.querySelector<HTMLInputElement>('#log-minutes')?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      form.minutes = value ? Number(value) : null;
      container.querySelector('#log-load')!.textContent = loadText();
    });

    const fileInput = container.querySelector<HTMLInputElement>('#log-fit-file')!;
    container.querySelector('#log-fit-trigger')?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      readInputs();
      if (!file.name.toLowerCase().endsWith('.fit')) {
        errors = [`"${file.name}" no es un archivo .fit.`];
        render();
        return;
      }
      const parsed = parseFitActivity(await file.arrayBuffer());
      if (parsed.errors.length > 0 || !parsed.startedAt || parsed.samples.length === 0) {
        errors = parsed.errors.length > 0 ? parsed.errors : ['No se pudo leer la actividad de ese archivo.'];
        render();
        return;
      }
      form.fit = { samples: parsed.samples, startedAt: parsed.startedAt };
      // la duración del reloj manda si todavía no escribió una
      if (!form.minutes) form.minutes = Math.max(1, Math.round(parsed.samples.length / 60));
      const hrs = parsed.samples.map((s) => s.hr).filter((hr) => hr > 0);
      const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
      fitLabel = `${escapeHtml(file.name)} · ${Math.round(parsed.samples.length / 60)} min${avgHr ? ` · pulso prom. ${avgHr}` : ''}`;
      errors = [];
      render();
    });
    container.querySelector('#log-fit-remove')?.addEventListener('click', () => {
      form.fit = null;
      fitLabel = null;
      rerender();
    });

    container.querySelector('#log-save')?.addEventListener('click', async () => {
      if (saving) return;
      readInputs();
      errors = validateLogSessionForm(form);
      if (errors.length > 0) {
        render();
        return;
      }
      saving = true;
      render();
      const record = buildLoggedSession(form, existing, appState.profile.ftp);
      await saveSession(record);
      if (appState.user) void pushSessionToCloud(record, appState.profile, appState.user.id);
      goBack();
    });

    container.querySelector('#log-delete')?.addEventListener('click', async () => {
      if (!existing || !window.confirm('¿Borrar esta sesión? No se puede deshacer.')) return;
      await deleteSession(existing.id);
      if (appState.user) await deleteSessionFromCloud(existing.id, appState.user.id);
      appState.cloudSessions = appState.cloudSessions.filter((s) => s.id !== existing!.id);
      goBack();
    });
  }

  /** De vuelta a donde vino (Plan o Historial); Plan si entró directo. */
  function goBack(): void {
    const previous = getPreviousHash();
    if (previous && !previous.startsWith('#/log')) location.hash = previous;
    else navigate('plan');
  }

  if (routineId) {
    if (!routine) {
      container.innerHTML = `<div class="screen"><h1>Registrar rutina</h1><p class="hint">No encontramos esa rutina. Puede que tu coach la haya cambiado: revisa tu Plan.</p><a href="#/plan">Ir a Plan</a></div>`;
      return;
    }
    const r = routine;
    // ¿ya la registró? (local o en la nube) -> abre esa sesión para editarla
    void listSessions().then((local) => {
      const logged = local.find((s) => s.plannedItemId === r.id) ?? appState.cloudSessions.find((s) => s.plannedItemId === r.id);
      if (getRouteParam() !== param) return;
      if (logged) {
        navigate('log', logged.id);
        return;
      }
      form = {
        ...formFrom(null),
        kind: r.kind,
        name: r.name === NON_BIKE_KIND_LABELS[r.kind] ? '' : r.name,
        dateKey: r.scheduledDate,
        minutes: r.payload.durationMin ?? null,
        plannedItemId: r.id,
      };
      render();
    });
    container.innerHTML = '<div class="screen"><h1>Registrar rutina</h1><p class="hint">Cargando…</p></div>';
    return;
  }

  if (!editId) {
    render();
    return;
  }

  container.innerHTML = '<div class="screen"><h1>Editar sesión</h1><p class="hint">Cargando…</p></div>';
  void loadExisting(editId).then((found) => {
    if (getRouteParam() !== editId) return; // navegó a otra parte mientras cargaba
    if (!found || !isNonBikeKind(found.kind)) {
      container.innerHTML = `
        <div class="screen">
          <h1>Editar sesión</h1>
          <p class="hint">${found ? 'Solo se pueden editar aquí las sesiones de fuerza, movilidad o flexibilidad.' : 'No encontramos esa sesión.'}</p>
          <a href="#/plan">Ir a Plan</a>
        </div>`;
      return;
    }
    existing = found;
    form = formFrom(found);
    routine = found.plannedItemId ? (appState.plannedRoutines.find((r) => r.id === found.plannedItemId) ?? null) : null;
    render();
  });
}
