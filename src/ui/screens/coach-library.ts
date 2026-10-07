// Biblioteca del coach (vista del coach, paso 5) — #/coach-library. Sus
// plantillas de bici (importadas de .zwo/.mrc/.erg/.json o armadas bloque
// por bloque) y de fuerza/movilidad/flexibilidad (ejercicios con dosis y
// link a video). De aquí elige al agregar entrenamientos en la semana de
// un atleta (screens/coach-week.ts).
import {
  MAX_EXERCISES,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS,
  bikePayloadFromWorkout,
  isRoutineKind,
  personalWorkoutFromBikeTemplate,
  routineSummary,
  safeVideoUrl,
  validateBikeTemplate,
  validateRoutineTemplate,
} from '../../core/coach-templates';
import type { BikePayload, RoutinePayload, SessionTemplate, TemplateKind } from '../../core/coach-templates';
import { INTERVAL_TYPES } from '../../core/types';
import type { Interval, IntervalType } from '../../core/types';
import { estimateWorkout } from '../../core/workout-estimate';
import { importWorkoutFile } from '../../core/workout-file-import';
import { deleteTemplate, listTemplates, saveTemplate } from '../../sync/session-templates';
import { appState } from '../state';
import { navigate } from '../router';
import { saveWorkout } from '../../storage/workout-store';
import { pushWorkoutToCloud } from '../../sync/workout-sync';
import { escapeHtml, renderWorkoutCover } from '../workout-cover';

const INTERVAL_TYPE_LABELS: Record<IntervalType, string> = {
  warmup: 'Calentamiento',
  steady: 'Estable',
  interval: 'Intervalo',
  recovery: 'Recuperación',
  cooldown: 'Vuelta a la calma',
  free: 'Libre',
};

interface Draft {
  id?: string;
  name: string;
  kind: TemplateKind;
  bike: BikePayload;
  routine: RoutinePayload;
}

function emptyDraft(kind: TemplateKind): Draft {
  return {
    name: '',
    kind,
    bike: { intervals: [{ name: 'Calentamiento', type: 'warmup', duration_s: 600, power_pct: 50, ramp_to_pct: 70 }] },
    routine: { exercises: [{ name: '', dose: '' }] },
  };
}

function draftFrom(t: SessionTemplate): Draft {
  const base = emptyDraft(t.kind);
  return t.kind === 'bike'
    ? { ...base, id: t.id, name: t.name, bike: structuredClone(t.payload) }
    : { ...base, id: t.id, name: t.name, routine: structuredClone(t.payload) };
}

function fmtMin(seconds: number): string {
  const m = seconds / 60;
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

function numOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function renderCoachLibrary(container: HTMLElement): void {
  const coachId = appState.user?.id;
  if (!coachId || !appState.coach.isCoach) {
    container.innerHTML = '<div class="screen"><h1>Biblioteca</h1><p class="hint">Esta sección es solo para coaches.</p></div>';
    return;
  }

  let templates: SessionTemplate[] | null = null;
  let filter: TemplateKind | 'all' = 'all';
  let editing: Draft | null = null;
  let errors: string[] = [];
  let message = '';
  let busy = false;

  function listHtml(): string {
    if (templates === null) return '<p class="hint">Cargando…</p>';
    const visible = templates.filter((t) => filter === 'all' || t.kind === filter);
    if (templates.length === 0)
      return '<div class="panel coach-empty"><p>Todavía no tienes plantillas.</p><p class="hint">Crea una nueva o importa un archivo .zwo, .mrc, .erg o .json de bici.</p></div>';
    if (visible.length === 0) return '<p class="hint">No tienes plantillas de este tipo.</p>';
    return `<div class="library-list">${visible
      .map((t) => {
        const meta =
          t.kind === 'bike'
            ? (() => {
                const est = estimateWorkout(t.payload.intervals, appState.profile.ftp);
                return `${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS · ${t.payload.intervals.length} bloques`;
              })()
            : routineSummary(t.payload);
        return `
          <div class="library-row kind-${t.kind}">
            ${t.kind === 'bike' ? renderWorkoutCover(t.payload.intervals, 'sm') : `<div class="forma-row-kind kind-${t.kind} num">${TEMPLATE_KIND_LABELS[t.kind].slice(0, 3).toUpperCase()}</div>`}
            <div class="library-row-info">
              <div class="week-item-name">${escapeHtml(t.name)}</div>
              <div class="hint">${TEMPLATE_KIND_LABELS[t.kind]} · ${escapeHtml(meta)}</div>
            </div>
            <div class="row-actions" style="margin:0">
              ${t.kind === 'bike' ? `<button type="button" data-train="${t.id}" title="Copiarla a tus entrenamientos y entrenarla tú">Entrenar</button>` : ''}
              <button type="button" data-edit="${t.id}">Editar</button>
              <button type="button" data-duplicate="${t.id}">Duplicar</button>
              <button type="button" data-delete="${t.id}" class="week-remove">Borrar</button>
            </div>
          </div>`;
      })
      .join('')}</div>`;
  }

  function bikeEditorHtml(d: Draft): string {
    const est = estimateWorkout(d.bike.intervals, appState.profile.ftp);
    const rows = d.bike.intervals
      .map(
        (iv, i) => `
        <div class="block-row">
          <select data-b="${i}" data-f="type" aria-label="Tipo de bloque">${INTERVAL_TYPES.map((t) => `<option value="${t}"${t === iv.type ? ' selected' : ''}>${INTERVAL_TYPE_LABELS[t]}</option>`).join('')}</select>
          <input type="text" data-b="${i}" data-f="name" value="${escapeHtml(iv.name)}" placeholder="Nombre" aria-label="Nombre del bloque">
          <label class="block-num">Min<input type="number" min="0.1" step="0.5" data-b="${i}" data-f="min" value="${fmtMin(iv.duration_s)}"></label>
          <label class="block-num">% FTP<input type="number" min="0" max="300" data-b="${i}" data-f="pct" value="${iv.power_pct}"></label>
          <label class="block-num">Rampa a<input type="number" min="0" max="300" data-b="${i}" data-f="ramp" value="${iv.ramp_to_pct ?? ''}" placeholder="—"></label>
          <div class="block-actions">
            <button type="button" data-b-up="${i}" aria-label="Subir bloque"${i === 0 ? ' disabled' : ''}>↑</button>
            <button type="button" data-b-down="${i}" aria-label="Bajar bloque"${i === d.bike.intervals.length - 1 ? ' disabled' : ''}>↓</button>
            <button type="button" data-b-del="${i}" aria-label="Quitar bloque" class="week-remove">✕</button>
          </div>
        </div>`,
      )
      .join('');
    return `
      <label>Descripción (opcional)<textarea id="tpl-desc" rows="2" maxlength="500">${escapeHtml(d.bike.description ?? '')}</textarea></label>
      <div class="block-preview">${d.bike.intervals.length ? renderWorkoutCover(d.bike.intervals, 'sm') : ''}<span class="hint">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS (con tu FTP)</span></div>
      ${
        d.bike.comments?.length
          ? `<div class="tpl-comments"><span class="hint">Trae ${d.bike.comments.length} ${d.bike.comments.length === 1 ? 'mensaje' : 'mensajes'} del archivo, que aparecen durante el entrenamiento. Si cambias los bloques y ya no cuadran, quítalos.</span><button type="button" id="tpl-clear-comments">Quitar mensajes</button></div>`
          : ''
      }
      <div class="block-list">${rows}</div>
      <div class="row-actions" style="margin:0"><button type="button" id="tpl-add-block">+ Bloque</button></div>`;
  }

  function routineEditorHtml(d: Draft): string {
    const p = d.routine;
    const rows = p.exercises
      .map(
        (e, i) => `
        <div class="block-row">
          <input type="text" data-e="${i}" data-f="name" value="${escapeHtml(e.name)}" placeholder="Ejercicio (ej. Peso muerto rumano)" aria-label="Ejercicio">
          <input type="text" data-e="${i}" data-f="dose" value="${escapeHtml(e.dose)}" placeholder="Dosis (ej. 3 × 8)" aria-label="Dosis">
          <input type="url" data-e="${i}" data-f="video" value="${escapeHtml(e.videoUrl ?? '')}" placeholder="Link a video (https://…)" aria-label="Link a video">
          <div class="block-actions">
            <button type="button" data-e-up="${i}" aria-label="Subir ejercicio"${i === 0 ? ' disabled' : ''}>↑</button>
            <button type="button" data-e-down="${i}" aria-label="Bajar ejercicio"${i === p.exercises.length - 1 ? ' disabled' : ''}>↓</button>
            <button type="button" data-e-del="${i}" aria-label="Quitar ejercicio" class="week-remove">✕</button>
          </div>
        </div>`,
      )
      .join('');
    return `
      <label>Descripción (opcional)<textarea id="tpl-desc" rows="2" maxlength="500">${escapeHtml(p.description ?? '')}</textarea></label>
      <div class="log-row">
        <label>Duración (min)<input type="number" id="tpl-duration" min="1" max="600" value="${p.durationMin ?? ''}" placeholder="45"></label>
        <label>RPE objetivo<input type="number" id="tpl-rpe" min="1" max="10" value="${p.targetRpe ?? ''}" placeholder="6"></label>
      </div>
      <div class="block-list">${rows}</div>
      <div class="row-actions" style="margin:0"><button type="button" id="tpl-add-exercise"${p.exercises.length >= MAX_EXERCISES ? ' disabled' : ''}>+ Ejercicio</button></div>
      <label>Nota para el atleta (opcional)<textarea id="tpl-note" rows="2" maxlength="500" placeholder="Ej. si la rodilla molesta en la zancada, cámbiala por puente de glúteo">${escapeHtml(p.note ?? '')}</textarea></label>`;
  }

  function editorHtml(d: Draft): string {
    const kindChoices = (d.kind === 'bike' ? (['bike'] as TemplateKind[]) : TEMPLATE_KINDS.filter(isRoutineKind))
      .map((k) => `<button type="button" class="log-choice${k === d.kind ? ' on' : ''}" data-kind-choice="${k}">${TEMPLATE_KIND_LABELS[k]}</button>`)
      .join('');
    return `
      <section class="panel coach-card tpl-editor kind-${d.kind}" aria-label="Editar plantilla">
        <div class="coach-card-head">
          <h2 class="perfil-h2" style="margin:0">${d.id ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
          <button type="button" id="tpl-cancel">Cancelar</button>
        </div>
        <div class="log-choices">${kindChoices}</div>
        <label>Nombre<input type="text" id="tpl-name" maxlength="80" value="${escapeHtml(d.name)}" placeholder="${d.kind === 'bike' ? 'Ej. Sweet spot 3×15' : 'Ej. Fuerza · tren inferior'}"></label>
        ${d.kind === 'bike' ? bikeEditorHtml(d) : routineEditorHtml(d)}
        ${errors.length ? `<div class="error-box"><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
        <div class="row-actions" style="margin:0"><button type="button" class="btn-light" id="tpl-save"${busy ? ' disabled' : ''}>${busy ? 'Guardando…' : 'Guardar plantilla'}</button></div>
      </section>`;
  }

  function render(): void {
    const counts = new Map<TemplateKind | 'all', number>([['all', templates?.length ?? 0]]);
    templates?.forEach((t) => counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1));
    container.innerHTML = `
      <div class="screen coach-screen">
        <header class="coach-head">
          <div><h1>Biblioteca</h1><span class="hint">Tus plantillas para armar las semanas de tus atletas.</span></div>
          ${
            editing
              ? ''
              : `<div class="coach-head-actions">
            <label class="coach-btn" style="cursor:pointer">Importar archivo de bici<input type="file" id="tpl-import" accept=".zwo,.mrc,.erg,.json" style="display:none"></label>
            <button type="button" class="coach-btn" data-new="bike">Nueva de bici</button>
            <button type="button" class="coach-btn coach-btn-primary" data-new="strength">Nueva de fuerza/movilidad</button>
          </div>`
          }
        </header>
        ${message ? `<p class="hint">${escapeHtml(message)}</p>` : ''}
        ${
          editing
            ? editorHtml(editing)
            : `
        <div class="coach-filters" role="group" aria-label="Filtrar por tipo">
          ${(['all', ...TEMPLATE_KINDS] as const)
            .map((k) => `<button type="button" class="log-choice${filter === k ? ' on' : ''}" data-filter="${k}">${k === 'all' ? 'Todas' : TEMPLATE_KIND_LABELS[k]} · ${counts.get(k) ?? 0}</button>`)
            .join('')}
        </div>
        ${errors.length && !editing ? `<div class="error-box"><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
        ${listHtml()}`
        }
      </div>`;
    wire();
  }

  /** Lee los inputs del editor al borrador antes de re-renderizar. */
  function readEditor(): void {
    if (!editing) return;
    const d = editing;
    d.name = container.querySelector<HTMLInputElement>('#tpl-name')?.value ?? d.name;
    const desc = container.querySelector<HTMLTextAreaElement>('#tpl-desc')?.value.trim();
    if (d.kind === 'bike') {
      d.bike.description = desc || undefined;
      container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-b]').forEach((el) => {
        const iv = d.bike.intervals[Number(el.dataset.b)];
        if (!iv) return;
        const v = el.value;
        if (el.dataset.f === 'type') iv.type = v as IntervalType;
        else if (el.dataset.f === 'name') iv.name = v;
        else if (el.dataset.f === 'min') iv.duration_s = Math.round((numOrUndefined(v) ?? 0) * 60);
        else if (el.dataset.f === 'pct') iv.power_pct = numOrUndefined(v) ?? 0;
        else if (el.dataset.f === 'ramp') {
          const r = numOrUndefined(v);
          if (r === undefined) delete iv.ramp_to_pct;
          else iv.ramp_to_pct = r;
        }
      });
    } else {
      const p = d.routine;
      p.description = desc || undefined;
      p.durationMin = numOrUndefined(container.querySelector<HTMLInputElement>('#tpl-duration')?.value ?? '');
      p.targetRpe = numOrUndefined(container.querySelector<HTMLInputElement>('#tpl-rpe')?.value ?? '');
      p.note = container.querySelector<HTMLTextAreaElement>('#tpl-note')?.value.trim() || undefined;
      container.querySelectorAll<HTMLInputElement>('[data-e]').forEach((el) => {
        const e = p.exercises[Number(el.dataset.e)];
        if (!e) return;
        if (el.dataset.f === 'name') e.name = el.value;
        else if (el.dataset.f === 'dose') e.dose = el.value;
        else if (el.dataset.f === 'video') e.videoUrl = el.value.trim() || undefined;
      });
    }
  }

  function edit(fn: (d: Draft) => void): void {
    readEditor();
    if (editing) fn(editing);
    errors = [];
    render();
  }

  function move<T>(list: T[], i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  }

  async function reload(): Promise<void> {
    try {
      templates = await listTemplates(coachId!);
    } catch (err) {
      errors = [`No se pudo cargar tu biblioteca: ${err instanceof Error ? err.message : String(err)}`];
      templates = [];
    }
  }

  function wire(): void {
    container.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) =>
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter as typeof filter;
        render();
      }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-new]').forEach((btn) =>
      btn.addEventListener('click', () => {
        editing = emptyDraft(btn.dataset.new as TemplateKind);
        errors = [];
        message = '';
        render();
      }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-edit], [data-duplicate]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const t = templates?.find((x) => x.id === (btn.dataset.edit ?? btn.dataset.duplicate));
        if (!t) return;
        editing = draftFrom(t);
        if (btn.dataset.duplicate) {
          delete editing.id;
          editing.name = `${t.name} (copia)`.slice(0, 80);
        }
        errors = [];
        message = '';
        render();
      }),
    );
    // El coach también entrena: copia la plantilla a SUS entrenamientos (sin
    // fecha, como cualquier importado) y lo lleva a Antes de empezar.
    container.querySelectorAll<HTMLButtonElement>('[data-train]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const t = templates?.find((x) => x.id === btn.dataset.train);
        if (!t || t.kind !== 'bike') return;
        const workout = personalWorkoutFromBikeTemplate(t);
        await saveWorkout(workout);
        if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
        appState.workouts = [...appState.workouts, workout];
        appState.selectedWorkoutId = workout.id;
        navigate('prepare');
      }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const t = templates?.find((x) => x.id === btn.dataset.delete);
        if (!t || !window.confirm(`¿Borrar la plantilla "${t.name}"? Lo que ya agendaste con ella no cambia.`)) return;
        try {
          await deleteTemplate(coachId!, t.id);
          message = 'Plantilla borrada.';
        } catch (err) {
          errors = [`No se pudo borrar: ${err instanceof Error ? err.message : String(err)}`];
        }
        await reload();
        render();
      }),
    );

    container.querySelector<HTMLInputElement>('#tpl-import')?.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const { workout, errors: errs } = await importWorkoutFile(file, appState.profile.ftp);
      if (!workout) {
        errors = errs.length ? errs : ['No se pudo leer ese archivo.'];
        render();
        return;
      }
      // abre el editor ya lleno: el coach revisa el nombre y guarda
      editing = { ...emptyDraft('bike'), name: workout.name.slice(0, 80), bike: bikePayloadFromWorkout(workout) };
      errors = [];
      message = `Importado de ${file.name}. Revisa y guarda.`;
      render();
    });

    if (!editing) return;

    container.querySelector('#tpl-cancel')?.addEventListener('click', () => {
      editing = null;
      errors = [];
      render();
    });
    container.querySelectorAll<HTMLButtonElement>('[data-kind-choice]').forEach((btn) =>
      btn.addEventListener('click', () => edit((d) => (d.kind = btn.dataset.kindChoice as TemplateKind))),
    );
    container.querySelector('#tpl-add-block')?.addEventListener('click', () =>
      edit((d) => {
        const last = d.bike.intervals[d.bike.intervals.length - 1];
        const next: Interval = { name: 'Bloque', type: 'steady', duration_s: 600, power_pct: last?.ramp_to_pct ?? last?.power_pct ?? 65 };
        d.bike.intervals.push(next);
      }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-b-up]').forEach((b) => b.addEventListener('click', () => edit((d) => move(d.bike.intervals, Number(b.dataset.bUp), -1))));
    container.querySelectorAll<HTMLButtonElement>('[data-b-down]').forEach((b) => b.addEventListener('click', () => edit((d) => move(d.bike.intervals, Number(b.dataset.bDown), 1))));
    container.querySelectorAll<HTMLButtonElement>('[data-b-del]').forEach((b) => b.addEventListener('click', () => edit((d) => d.bike.intervals.splice(Number(b.dataset.bDel), 1))));
    container.querySelector('#tpl-clear-comments')?.addEventListener('click', () => edit((d) => delete d.bike.comments));
    container.querySelector('#tpl-add-exercise')?.addEventListener('click', () => edit((d) => d.routine.exercises.push({ name: '', dose: '' })));
    container.querySelectorAll<HTMLButtonElement>('[data-e-up]').forEach((b) => b.addEventListener('click', () => edit((d) => move(d.routine.exercises, Number(b.dataset.eUp), -1))));
    container.querySelectorAll<HTMLButtonElement>('[data-e-down]').forEach((b) => b.addEventListener('click', () => edit((d) => move(d.routine.exercises, Number(b.dataset.eDown), 1))));
    container.querySelectorAll<HTMLButtonElement>('[data-e-del]').forEach((b) => b.addEventListener('click', () => edit((d) => d.routine.exercises.splice(Number(b.dataset.eDel), 1))));
    // la vista previa de bici (portada, minutos, TSS) se actualiza al salir
    // de cada campo, sin re-renderizar (no pierde el foco al tabular)
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-b]').forEach((el) =>
      el.addEventListener('change', () => {
        readEditor();
        const preview = container.querySelector('.block-preview');
        if (!preview || !editing) return;
        const est = estimateWorkout(editing.bike.intervals, appState.profile.ftp);
        preview.innerHTML = `${editing.bike.intervals.length ? renderWorkoutCover(editing.bike.intervals, 'sm') : ''}<span class="hint">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS (con tu FTP)</span>`;
      }),
    );

    container.querySelector('#tpl-save')?.addEventListener('click', async () => {
      readEditor();
      const d = editing!;
      const name = d.name.trim();
      let payload: BikePayload | RoutinePayload;
      if (d.kind === 'bike') {
        payload = d.bike;
        errors = validateBikeTemplate(name, payload);
      } else {
        // ejercicios totalmente vacíos se ignoran (el renglón de arranque)
        const exercises = d.routine.exercises
          .filter((e) => e.name.trim() || e.dose.trim() || e.videoUrl)
          .map((e) => ({ name: e.name.trim(), dose: e.dose.trim(), ...(e.videoUrl ? { videoUrl: safeVideoUrl(e.videoUrl) ?? e.videoUrl } : {}) }));
        payload = { ...d.routine, exercises };
        errors = validateRoutineTemplate(name, payload);
      }
      if (errors.length) {
        render();
        return;
      }
      busy = true;
      render();
      try {
        await saveTemplate(coachId!, { id: d.id, name, kind: d.kind, payload });
        message = d.id ? 'Plantilla actualizada.' : 'Plantilla guardada.';
        editing = null;
        filter = 'all';
        await reload();
      } catch (err) {
        errors = [`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`];
      }
      busy = false;
      render();
    });
  }

  render();
  void reload().then(render);
}
