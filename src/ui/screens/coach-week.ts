// Semana de un atleta — editor del coach (docs/coach-view/mockups/Semana.dc.html,
// paso 6a: cambios a mano). #/coach-week/:athleteId. El borrador parte de lo
// que el atleta ya tiene agendado; cada cambio se guarda en plan_weeks y el
// atleta no ve nada hasta que el coach publica. Los cambios a mano valen en
// cualquier día, pasado o futuro (la IA del coach, paso 6b, solo tocará
// días futuros).
import { estimateWorkout } from '../../core/workout-estimate';
import { WORKOUT_TEMPLATES, findTemplate } from '../../core/workout-templates';
import { editedItem, itemDate, itemId, itemName, itemsFromWorkouts, localDateKey, movedItem, scaleIntensity, weekDays, weekStartOf, addDaysKey, workoutFromTemplate } from '../../core/plan-week';
import { TEMPLATE_KIND_LABELS, routineFromTemplate, routineSummary, workoutFromBikeTemplate } from '../../core/coach-templates';
import type { SessionTemplate } from '../../core/coach-templates';
import { listTemplates } from '../../sync/session-templates';
import type { PlanWeekItem } from '../../core/plan-week';
import { validateWorkout } from '../../core/validator';
import { listCoachAthletes } from '../../sync/coach-athletes';
import type { CoachAthlete } from '../../sync/coach-athletes';
import { createDraft, discardDraft, fetchAthleteWeekWorkouts, fetchDraft, fetchLastPublishedAt, fetchPlannedRoutines, publishDraft, saveDraftItems } from '../../sync/plan-weeks';
import type { PlanWeekDraft } from '../../sync/plan-weeks';
import { athleteName } from '../coach-ui';
import { getRouteParam } from '../router';
import { appState } from '../state';
import { escapeHtml, renderWorkoutCover } from '../workout-cover';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const INTENSITY_STEP = 5;

/** Última semana vista por atleta, para que volver a la pantalla no la
 * regrese siempre a la semana actual. */
const lastWeekByAthlete = new Map<string, string>();

function fmtDayNum(key: string): string {
  return String(Number(key.slice(8, 10)));
}

function fmtRange(mondayKey: string): string {
  const fmt = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };
  return `${fmt(mondayKey)} – ${fmt(addDaysKey(mondayKey, 6))}`;
}

function fmtHM(totalS: number): string {
  const min = Math.round(totalS / 60);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

export function renderCoachWeek(container: HTMLElement): void {
  const athleteId = getRouteParam();
  const coachId = appState.user?.id;

  function shell(body: string): void {
    container.innerHTML = `<div class="screen coach-screen">${body}</div>`;
  }

  if (!coachId || !appState.coach.isCoach) {
    shell('<p class="hint">Esta sección es solo para coaches.</p>');
    return;
  }
  if (!athleteId) {
    shell('<p class="hint">Falta el atleta.</p>');
    return;
  }

  const todayKey = localDateKey(new Date());
  let monday = lastWeekByAthlete.get(athleteId) ?? weekStartOf(todayKey);
  let athlete: CoachAthlete | null = null;
  let items: PlanWeekItem[] = [];
  let baseIds: string[] = [];
  let draft: PlanWeekDraft | null = null;
  let publishedAt: string | null = null;
  let loading = true;
  let addDay: string | null = null;
  let status = '';
  let error = '';
  let busy = false;
  /** Biblioteca del coach (paso 5); null mientras carga. */
  let templates: SessionTemplate[] | null = null;
  let addTab: 'library' | 'torq' = 'library';
  /** Cola de guardados: cada cambio espera al anterior, así nunca se pisan. */
  let saving: Promise<void> = Promise.resolve();

  const ftp = () => athlete?.ftp ?? appState.profile.ftp;

  async function load(): Promise<void> {
    loading = true;
    error = '';
    status = '';
    addDay = null;
    render();
    try {
      if (!athlete) {
        athlete = (await listCoachAthletes()).find((a) => a.userId === athleteId) ?? null;
        if (!athlete) {
          shell(`<a href="#/coach-athletes" class="back-link">← Atletas</a><p class="hint">Este atleta no está vinculado contigo (o se desvinculó).</p>`);
          return;
        }
      }
      const week = monday;
      const [workouts, routines, existingDraft, lastPublished, library] = await Promise.all([
        fetchAthleteWeekWorkouts(athleteId!, week),
        fetchPlannedRoutines(athleteId!, week, addDaysKey(week, 6)),
        fetchDraft(coachId!, athleteId!, week),
        fetchLastPublishedAt(athleteId!, week),
        templates ? Promise.resolve(templates) : listTemplates(coachId!),
      ]);
      templates = library;
      if (week !== monday || getRouteParam() !== athleteId) return; // cambió de semana o de pantalla mientras cargaba
      draft = existingDraft;
      publishedAt = lastPublished;
      if (existingDraft) {
        items = existingDraft.items;
        baseIds = existingDraft.baseWorkoutIds;
      } else {
        items = itemsFromWorkouts(workouts, week, routines);
        baseIds = items.map(itemId);
      }
    } catch (err) {
      error = `No se pudo cargar la semana: ${err instanceof Error ? err.message : String(err)}`;
    }
    loading = false;
    render();
  }

  /** Aplica un cambio: crea el borrador con el primero, luego lo actualiza. */
  function change(next: PlanWeekItem[]): void {
    items = next;
    status = 'Guardando…';
    render();
    saving = saving.then(async () => {
      try {
        if (draft) await saveDraftItems(draft.id, items);
        else draft = await createDraft(coachId!, athleteId!, monday, items, baseIds);
        status = 'Borrador guardado';
      } catch (err) {
        error = `No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`;
        status = '';
      }
      render();
    });
  }

  function itemHtml(item: PlanWeekItem, index: number, day: string): string {
    const mine = item.origin === 'coach' || item.edited;
    const tag = item.origin === 'coach' ? 'Agregado por ti' : item.edited ? 'Editado por ti' : 'Del atleta';
    const moveOptions = weekDays(monday)
      .map((d, i) => `<option value="${d}"${d === day ? ' selected' : ''}>${DAY_NAMES[i]} ${fmtDayNum(d)}</option>`)
      .join('');
    const actions = `
        <div class="week-item-actions">
          <label class="week-move">Mover a<select data-move="${index}" aria-label="Mover a otro día">${moveOptions}</select></label>
          <div class="week-item-buttons">
            ${
              item.workout
                ? `<button type="button" data-intensity="${index}" data-delta="-${INTENSITY_STEP}" title="Bajar intensidad ${INTENSITY_STEP}%">−${INTENSITY_STEP}%</button>
            <button type="button" data-intensity="${index}" data-delta="${INTENSITY_STEP}" title="Subir intensidad ${INTENSITY_STEP}%">+${INTENSITY_STEP}%</button>`
                : ''
            }
            <button type="button" data-remove="${index}" class="week-remove">Quitar</button>
          </div>
        </div>`;
    const pill = `<span class="coach-pill${mine ? ' coach-pill-accent' : ''}">${tag}</span>`;
    if (item.routine) {
      const r = item.routine;
      return `
      <div class="week-item week-item-routine kind-${r.kind}${mine ? ' week-item-coach' : ''}">
        <div class="week-routine-kind">${TEMPLATE_KIND_LABELS[r.kind]}</div>
        <div class="week-item-name">${escapeHtml(r.name)}</div>
        <div class="hint">${escapeHtml(routineSummary(r.payload))}</div>
        ${pill}
        ${actions}
      </div>`;
    }
    const w = item.workout;
    const est = estimateWorkout(w.intervals, ftp());
    return `
      <div class="week-item${mine ? ' week-item-coach' : ''}">
        ${renderWorkoutCover(w.intervals, 'sm')}
        <div class="week-item-name">${escapeHtml(w.name)}</div>
        <div class="hint">${fmtHM(est.durationS)} · ${est.tss ?? '—'} TSS</div>
        ${pill}
        ${actions}
      </div>`;
  }

  function libraryHtml(): string {
    if (templates === null) return '<p class="hint">Cargando tu biblioteca…</p>';
    if (templates.length === 0)
      return '<p class="hint">Todavía no tienes plantillas. Créalas o impórtalas en <a href="#/coach-library">Biblioteca</a>, o usa las plantillas de Torq.</p>';
    return `<div class="week-library">${templates
      .map(
        (t) => `
        <button type="button" class="week-library-item kind-${t.kind}" data-add-template="${t.id}">
          <span class="week-routine-kind">${TEMPLATE_KIND_LABELS[t.kind]}</span>
          <span class="week-item-name">${escapeHtml(t.name)}</span>
          <span class="hint">${
            t.kind === 'bike'
              ? (() => {
                  const est = estimateWorkout(t.payload.intervals, ftp());
                  return `${fmtHM(est.durationS)} · ${est.tss ?? '—'} TSS`;
                })()
              : escapeHtml(routineSummary(t.payload))
          }</span>
        </button>`,
      )
      .join('')}</div>`;
  }

  function addPanelHtml(): string {
    if (!addDay) return '';
    const dayIndex = weekDays(monday).indexOf(addDay);
    const first = WORKOUT_TEMPLATES[0];
    return `
      <section class="panel coach-card" aria-label="Agregar entrenamiento" id="week-add-panel">
        <div class="coach-card-head">
          <h2 class="perfil-h2" style="margin:0">Agregar el ${DAY_NAMES[dayIndex]} ${fmtDayNum(addDay)}</h2>
          <button type="button" id="week-add-close">Cerrar</button>
        </div>
        <div class="coach-filters" role="tablist">
          <button type="button" role="tab" class="log-choice${addTab === 'library' ? ' on' : ''}" aria-selected="${addTab === 'library'}" data-add-tab="library">Mi biblioteca</button>
          <button type="button" role="tab" class="log-choice${addTab === 'torq' ? ' on' : ''}" aria-selected="${addTab === 'torq'}" data-add-tab="torq">Plantillas de Torq</button>
        </div>
        ${
          addTab === 'library'
            ? libraryHtml()
            : `
        <div class="log-row">
          <label>Plantilla<select id="week-add-template">${WORKOUT_TEMPLATES.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}</select></label>
          <label>Minutos<input type="number" id="week-add-minutes" min="${first.minMinutes}" max="${first.maxMinutes}" value="${first.defaultMinutes}"></label>
        </div>
        <p class="hint" id="week-add-desc">${escapeHtml(first.description)}</p>
        <div class="row-actions" style="margin:0"><button type="button" class="primary" id="week-add-confirm">Agregar</button></div>`
        }
      </section>`;
  }

  function render(): void {
    if (!athlete && loading) {
      shell('<p class="hint">Cargando…</p>');
      return;
    }
    const days = weekDays(monday);
    const ests = items.flatMap((i) => (i.workout ? [estimateWorkout(i.workout.intervals, ftp())] : []));
    const routineCount = items.length - ests.length;
    const totalTss = ests.reduce((s, e) => s + (e.tss ?? 0), 0);
    const totalS = ests.reduce((s, e) => s + e.durationS, 0);
    const pill = draft
      ? '<span class="coach-pill coach-pill-caution">Borrador · el atleta aún no lo ve</span>'
      : publishedAt
        ? `<span class="coach-pill">Publicada el ${new Date(publishedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · sin cambios</span>`
        : '<span class="coach-pill">Lo que el atleta tiene agendado · sin cambios</span>';

    const dayCols = days
      .map((day, i) => {
        const dayItems = items.map((item, index) => ({ item, index })).filter((x) => itemDate(x.item) === day);
        return `
          <div class="week-day${day === todayKey ? ' week-day-today' : ''}${day < todayKey ? ' week-day-past' : ''}">
            <div class="week-day-head"><span class="num">${DAY_NAMES[i]}</span><span class="hint">${fmtDayNum(day)}${day === todayKey ? ' · hoy' : ''}</span></div>
            ${dayItems.map((x) => itemHtml(x.item, x.index, day)).join('') || '<div class="week-rest">Descanso</div>'}
            <button type="button" class="week-add" data-add="${day}"${busy ? ' disabled' : ''}>+ Agregar</button>
          </div>`;
      })
      .join('');

    shell(`
      <a href="#/coach-athlete/${athleteId}" class="back-link">← ${escapeHtml(athlete ? athleteName(athlete) : 'Atleta')}</a>
      <header class="coach-head">
        <div>
          ${pill}
          <h1 style="margin-top:8px">Semana del ${fmtRange(monday)}</h1>
        </div>
        <div class="coach-head-actions">
          <button type="button" id="week-prev" aria-label="Semana anterior">‹</button>
          <button type="button" id="week-today">Esta semana</button>
          <button type="button" id="week-next" aria-label="Semana siguiente">›</button>
          ${draft ? `<button type="button" id="week-discard"${busy ? ' disabled' : ''}>Descartar cambios</button>` : ''}
          ${draft ? `<button type="button" class="btn-light" id="week-publish"${busy ? ' disabled' : ''}>${busy ? 'Publicando…' : 'Publicar semana'}</button>` : ''}
        </div>
      </header>
      ${error ? `<div class="error-box">${escapeHtml(error)}</div>` : ''}
      ${
        loading
          ? '<p class="hint">Cargando semana…</p>'
          : `
      <section class="coach-tiles" aria-label="Totales de la semana">
        <div class="coach-tile"><span class="live-col-label">TSS de bici planeado</span><span class="coach-tile-value num">${Math.round(totalTss)}</span><span class="hint">Con el FTP del atleta</span></div>
        <div class="coach-tile"><span class="live-col-label">Horas de bici</span><span class="coach-tile-value num">${(totalS / 3600).toFixed(1)}</span><span class="hint">Planeadas</span></div>
        <div class="coach-tile"><span class="live-col-label">Sesiones</span><span class="coach-tile-value num">${ests.length}${routineCount ? ` + ${routineCount}` : ''}</span><span class="hint">Bici${routineCount ? ' + fuerza/movilidad' : ''} · ${items.filter((i) => i.origin === 'coach' || i.edited).length} tuyas o editadas</span></div>
      </section>
      <div class="week-grid-wrap"><div class="week-grid">${dayCols}</div></div>
      <p class="hint" id="week-status">${escapeHtml(status || (draft ? 'Tus cambios se guardan solos en el borrador. Publica cuando esté lista para que el atleta la vea en su Plan.' : 'Cualquier cambio crea un borrador; el atleta no lo ve hasta que publiques.'))}</p>
      ${addPanelHtml()}`
      }
    `);
    wire();
  }

  function goToWeek(next: string): void {
    monday = next;
    lastWeekByAthlete.set(athleteId!, next);
    draft = null;
    void load();
  }

  function wire(): void {
    container.querySelector('#week-prev')?.addEventListener('click', () => goToWeek(addDaysKey(monday, -7)));
    container.querySelector('#week-next')?.addEventListener('click', () => goToWeek(addDaysKey(monday, 7)));
    container.querySelector('#week-today')?.addEventListener('click', () => goToWeek(weekStartOf(todayKey)));

    container.querySelectorAll<HTMLSelectElement>('[data-move]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.move);
        const next = [...items];
        next[i] = movedItem(next[i], sel.value);
        change(next);
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-intensity]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.intensity);
        const current = items[i].workout;
        if (!current) return;
        const next = [...items];
        next[i] = editedItem(next[i], scaleIntensity(current, Number(btn.dataset.delta)));
        change(next);
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.remove);
        if (!window.confirm(`¿Quitar "${itemName(items[i])}" de la semana?`)) return;
        change(items.filter((_, j) => j !== i));
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addDay = btn.dataset.add!;
        render();
        container.querySelector('#week-add-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    container.querySelector('#week-add-close')?.addEventListener('click', () => {
      addDay = null;
      render();
    });
    container.querySelectorAll<HTMLButtonElement>('[data-add-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addTab = btn.dataset.addTab as typeof addTab;
        render();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-add-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = templates?.find((x) => x.id === btn.dataset.addTemplate);
        if (!t || !addDay) return;
        const day = addDay;
        addDay = null;
        // copia de la plantilla con id nuevo: editarla después no cambia esto
        const item: PlanWeekItem =
          t.kind === 'bike' ? { workout: workoutFromBikeTemplate(t, day), origin: 'coach', edited: true } : { routine: routineFromTemplate(t, day), origin: 'coach', edited: true };
        change([...items, item]);
      });
    });
    const templateSel = container.querySelector<HTMLSelectElement>('#week-add-template');
    const minutesInput = container.querySelector<HTMLInputElement>('#week-add-minutes');
    templateSel?.addEventListener('change', () => {
      const t = findTemplate(templateSel.value);
      if (!t || !minutesInput) return;
      minutesInput.min = String(t.minMinutes);
      minutesInput.max = String(t.maxMinutes);
      minutesInput.value = String(t.defaultMinutes);
      container.querySelector('#week-add-desc')!.textContent = t.description;
    });
    container.querySelector('#week-add-confirm')?.addEventListener('click', () => {
      const t = templateSel ? findTemplate(templateSel.value) : undefined;
      if (!t || !addDay) return;
      const workout = workoutFromTemplate(t, Number(minutesInput?.value) || t.defaultMinutes, addDay);
      addDay = null;
      change([...items, { workout, origin: 'coach', edited: true }]);
    });

    container.querySelector('#week-discard')?.addEventListener('click', async () => {
      if (!draft || !window.confirm('¿Descartar los cambios de esta semana? Se vuelve a lo que el atleta tiene agendado.')) return;
      busy = true;
      render();
      try {
        await saving;
        await discardDraft(draft.id);
        draft = null;
      } catch (err) {
        error = `No se pudo descartar: ${err instanceof Error ? err.message : String(err)}`;
      }
      busy = false;
      await load();
    });

    container.querySelector('#week-publish')?.addEventListener('click', async () => {
      if (!draft) return;
      const invalid = items.flatMap((i) => {
        if (!i.workout) return [];
        const r = validateWorkout(i.workout);
        return r.valid ? [] : [`${i.workout.name}: ${r.errors.join(', ')}`];
      });
      if (invalid.length) {
        error = `Hay entrenamientos con errores: ${invalid.join(' · ')}`;
        render();
        return;
      }
      if (!window.confirm(`¿Publicar la semana del ${fmtRange(monday)}? ${athlete ? athleteName(athlete) : 'El atleta'} la verá en su Plan.`)) return;
      busy = true;
      render();
      try {
        await saving;
        await publishDraft(draft.id);
        draft = null;
        busy = false;
        await load();
        status = 'Semana publicada: el atleta ya la ve en su Plan.';
        render();
        return;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      busy = false;
      render();
    });
  }

  void load();
}
