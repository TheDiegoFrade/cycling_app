// Semanas de todos — docs/coach-view/mockups/Semanas.dc.html (paso 6c).
// #/coach-weeks: una fila por atleta y una columna por día. Tocar una
// sesión abre un panel para cambiarla por otra de la biblioteca, moverla
// de día, ajustar ±5%, copiarla a otros atletas o quitarla; "+" agrega en
// un día vacío. Nada llega al atleta hasta que se publica su fila. El
// guardado y la publicación son los mismos del editor de una semana
// (sync/athlete-week.ts).
import { TEMPLATE_KIND_LABELS, routineFromTemplate, workoutFromBikeTemplate } from '../../core/coach-templates';
import type { SessionTemplate } from '../../core/coach-templates';
import { addDaysKey, editedItem, itemDate, itemName, localDateKey, movedItem, scaleIntensity, weekDays, weekStartOf, workoutFromTemplate } from '../../core/plan-week';
import type { PlanWeekItem } from '../../core/plan-week';
import { validateWorkout } from '../../core/validator';
import { estimateWorkout } from '../../core/workout-estimate';
import { WORKOUT_TEMPLATES, findTemplate } from '../../core/workout-templates';
import { AthleteWeek } from '../../sync/athlete-week';
import { listCoachAthletes } from '../../sync/coach-athletes';
import type { CoachAthlete } from '../../sync/coach-athletes';
import { listTemplates } from '../../sync/session-templates';
import { athleteName, errorMessage } from '../coach-ui';
import { appState } from '../state';
import { escapeHtml, renderWorkoutCover } from '../workout-cover';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const INTENSITY_STEP = 5;

interface Row {
  athlete: CoachAthlete;
  week: AthleteWeek | null;
  error: string;
  saving: boolean;
}

type Selection = { athleteId: string; index: number } | { athleteId: string; addDay: string };

let lastMonday: string | null = null;

function fmtDay(key: string, i: number): string {
  return `${DAY_NAMES[i]} ${Number(key.slice(8, 10))}`;
}

function fmtRange(mondayKey: string): string {
  const fmt = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };
  return `${fmt(mondayKey)} – ${fmt(addDaysKey(mondayKey, 6))}`;
}

/** Copia de un item con id nuevo (para copiarlo a otro atleta). */
function cloneItem(item: PlanWeekItem): PlanWeekItem {
  return item.workout
    ? { workout: { ...structuredClone(item.workout), id: crypto.randomUUID() }, origin: 'coach', edited: true }
    : { routine: { ...structuredClone(item.routine), id: crypto.randomUUID() }, origin: 'coach', edited: true };
}

export function renderCoachWeeks(container: HTMLElement): void {
  const coachId = appState.user?.id;
  if (!coachId || !appState.coach.isCoach) {
    container.innerHTML = '<div class="screen"><h1>Semanas</h1><p class="hint">Esta sección es solo para coaches.</p></div>';
    return;
  }

  const todayKey = localDateKey(new Date());
  let monday = lastMonday ?? weekStartOf(todayKey);
  let rows: Row[] | null = null;
  let templates: SessionTemplate[] = [];
  let selected: Selection | null = null;
  let copyOpen = false;
  let message = '';
  let error = '';
  let publishingAll = false;

  const rowOf = (athleteId: string) => rows?.find((r) => r.athlete.userId === athleteId) ?? null;
  const ftpOf = (r: Row) => r.athlete.ftp ?? appState.profile.ftp;

  async function load(): Promise<void> {
    const week = monday;
    rows = null;
    selected = null;
    error = '';
    render();
    try {
      const [athletes, library] = await Promise.all([listCoachAthletes(), listTemplates(coachId!)]);
      templates = library;
      const loaded = await Promise.all(
        athletes.map(async (athlete): Promise<Row> => {
          const w = new AthleteWeek(coachId!, athlete.userId, week);
          try {
            await w.load();
            return { athlete, week: w, error: '', saving: false };
          } catch (err) {
            return { athlete, week: null, error: `No se pudo cargar: ${errorMessage(err)}`, saving: false };
          }
        }),
      );
      if (week !== monday) return; // cambió de semana mientras cargaba
      rows = loaded;
    } catch (err) {
      error = `No se pudieron cargar tus atletas: ${errorMessage(err)}`;
      rows = [];
    }
    render();
  }

  /** Aplica un cambio a la semana de un atleta y lo guarda en su borrador. */
  function change(row: Row, next: PlanWeekItem[]): void {
    if (!row.week) return;
    row.saving = true;
    row.error = '';
    const saved = row.week.change(next);
    render();
    saved
      .catch((err) => {
        row.error = `No se pudo guardar: ${errorMessage(err)}`;
      })
      .finally(() => {
        row.saving = false;
        render();
      });
  }

  function statusPill(r: Row): string {
    const w = r.week;
    if (!w) return '<span class="coach-pill coach-pill-danger">Error</span>';
    if (w.draft) {
      const onlyAi = w.items.some((i) => i.origin === 'ai') && !w.items.some((i) => i.origin === 'coach' || i.edited);
      return onlyAi ? '<span class="coach-pill coach-pill-caution">Propuesta de IA</span>' : '<span class="coach-pill coach-pill-accent">Editada · sin publicar</span>';
    }
    if (w.publishedAt) return '<span class="coach-pill coach-pill-success">Publicada</span>';
    return '<span class="coach-pill">Sin cambios</span>';
  }

  function chipHtml(r: Row, item: PlanWeekItem, index: number): string {
    const isSel = selected !== null && 'index' in selected && selected.athleteId === r.athlete.userId && selected.index === index;
    const mine = item.origin === 'coach' || item.edited;
    const label = `${athleteName(r.athlete)}: ${itemName(item)}`;
    if (item.routine) {
      return `<button type="button" class="weeks-chip kind-${item.routine.kind}${isSel ? ' on' : ''}${mine ? ' mine' : ''}" data-sel-athlete="${r.athlete.userId}" data-sel-index="${index}" aria-pressed="${isSel}" aria-label="${escapeHtml(label)}">
        <span class="week-routine-kind">${TEMPLATE_KIND_LABELS[item.routine.kind]}</span>
        <span class="weeks-chip-name">${escapeHtml(item.routine.name)}</span>
      </button>`;
    }
    const est = estimateWorkout(item.workout.intervals, ftpOf(r));
    return `<button type="button" class="weeks-chip${isSel ? ' on' : ''}${mine ? ' mine' : ''}${item.origin === 'ai' ? ' ai' : ''}" data-sel-athlete="${r.athlete.userId}" data-sel-index="${index}" aria-pressed="${isSel}" aria-label="${escapeHtml(label)}">
      ${renderWorkoutCover(item.workout.intervals, 'sm')}
      <span class="weeks-chip-name">${escapeHtml(item.workout.name)}</span>
      <span class="hint">${est.tss ?? '—'} TSS</span>
    </button>`;
  }

  function rowHtml(r: Row, days: string[]): string {
    const w = r.week;
    const tss = w ? w.items.reduce((s, i) => s + (i.workout ? (estimateWorkout(i.workout.intervals, ftpOf(r)).tss ?? 0) : 0), 0) : 0;
    const cells = days
      .map((day) => {
        const dayItems = (w?.items ?? []).map((item, index) => ({ item, index })).filter((x) => itemDate(x.item) === day);
        const addSel = selected !== null && 'addDay' in selected && selected.athleteId === r.athlete.userId && selected.addDay === day;
        return `<div class="weeks-cell${day === todayKey ? ' today' : ''}">
          ${dayItems.map((x) => chipHtml(r, x.item, x.index)).join('')}
          ${w ? `<button type="button" class="weeks-add${addSel ? ' on' : ''}" data-add-athlete="${r.athlete.userId}" data-add-day="${day}" aria-label="Agregar sesión el ${day}">+</button>` : ''}
        </div>`;
      })
      .join('');
    return `
      <div class="weeks-row${w?.draft ? ' pending' : ''}">
        <div class="weeks-athlete">
          <a href="#/coach-week/${r.athlete.userId}">${escapeHtml(athleteName(r.athlete))}</a>
          ${statusPill(r)}
          <span class="hint">${Math.round(tss)} TSS de bici${r.saving ? ' · guardando…' : ''}</span>
          ${r.error ? `<span class="weeks-error">${escapeHtml(r.error)}</span>` : ''}
          ${w?.draft ? `<button type="button" class="weeks-publish" data-publish="${r.athlete.userId}"${publishingAll ? ' disabled' : ''}>Publicar</button>` : ''}
        </div>
        ${cells}
      </div>`;
  }

  function templateOptions(): string {
    const lib = templates
      .map((t) => `<option value="lib:${t.id}">${escapeHtml(t.name)} · ${TEMPLATE_KIND_LABELS[t.kind]}</option>`)
      .join('');
    const torq = WORKOUT_TEMPLATES.map((t) => `<option value="torq:${t.id}">${escapeHtml(t.name)} ${t.defaultMinutes} min</option>`).join('');
    return `${lib ? `<optgroup label="Mi biblioteca">${lib}</optgroup>` : ''}<optgroup label="Plantillas de Torq">${torq}</optgroup>`;
  }

  /** Item nuevo (copia) desde el valor de un <select> de plantillas. */
  function itemFromChoice(value: string, dateKey: string): PlanWeekItem | null {
    const [source, id] = value.split(':');
    if (source === 'lib') {
      const t = templates.find((x) => x.id === id);
      if (!t) return null;
      return t.kind === 'bike'
        ? { workout: workoutFromBikeTemplate(t, dateKey), origin: 'coach', edited: true }
        : { routine: routineFromTemplate(t, dateKey), origin: 'coach', edited: true };
    }
    const t = findTemplate(id);
    return t ? { workout: workoutFromTemplate(t, t.defaultMinutes, dateKey), origin: 'coach', edited: true } : null;
  }

  function panelHtml(days: string[]): string {
    if (!selected) {
      return `<aside class="panel weeks-panel"><p class="hint">Toca una sesión para cambiarla, moverla, ajustarla o copiarla a otros atletas, o "+" para agregar una. Cada cambio queda en borrador hasta que publiques la fila de ese atleta.</p></aside>`;
    }
    const r = rowOf(selected.athleteId);
    if (!r?.week) return '';
    if ('addDay' in selected) {
      const i = days.indexOf(selected.addDay);
      return `
        <aside class="panel weeks-panel" aria-label="Agregar sesión">
          <span class="live-col-label">Agregar</span>
          <strong>${escapeHtml(athleteName(r.athlete))} · ${fmtDay(selected.addDay, i)}</strong>
          <label>Plantilla<select id="weeks-add-choice">${templateOptions()}</select></label>
          <div class="row-actions" style="margin:0"><button type="button" class="primary" id="weeks-add-confirm">Agregar</button><button type="button" id="weeks-close">Cerrar</button></div>
        </aside>`;
    }
    const item = r.week.items[selected.index];
    if (!item) return '';
    const day = itemDate(item) ?? monday;
    const est = item.workout ? estimateWorkout(item.workout.intervals, ftpOf(r)) : null;
    const others = (rows ?? []).filter((x) => x.athlete.userId !== r.athlete.userId && x.week);
    return `
      <aside class="panel weeks-panel" aria-label="Editar sesión">
        <span class="live-col-label">Editando</span>
        <strong>${escapeHtml(athleteName(r.athlete))} · ${fmtDay(day, days.indexOf(day))}</strong>
        <span class="weeks-panel-name num">${escapeHtml(itemName(item))}</span>
        ${est ? `<span class="hint">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS</span>` : ''}
        <label>Cambiar por<select id="weeks-replace"><option value="">— Elige una plantilla —</option>${templateOptions()}</select></label>
        <label>Mover a<select id="weeks-move">${days.map((d, i) => `<option value="${d}"${d === day ? ' selected' : ''}>${fmtDay(d, i)}</option>`).join('')}</select></label>
        ${
          item.workout
            ? `<div class="weeks-intensity"><span class="live-col-label">Intensidad</span><button type="button" data-weeks-intensity="-${INTENSITY_STEP}" aria-label="Bajar ${INTENSITY_STEP}%">−${INTENSITY_STEP}%</button><button type="button" data-weeks-intensity="${INTENSITY_STEP}" aria-label="Subir ${INTENSITY_STEP}%">+${INTENSITY_STEP}%</button></div>`
            : ''
        }
        ${
          copyOpen
            ? `<fieldset class="weeks-copy"><legend class="live-col-label">Copiar el mismo día a</legend>
                ${others.length ? others.map((o) => `<label class="weeks-copy-opt"><input type="checkbox" value="${o.athlete.userId}">${escapeHtml(athleteName(o.athlete))}</label>`).join('') : '<span class="hint">No tienes otros atletas.</span>'}
                <div class="row-actions" style="margin:0"><button type="button" class="primary" id="weeks-copy-confirm"${others.length ? '' : ' disabled'}>Copiar</button><button type="button" id="weeks-copy-cancel">Cancelar</button></div>
              </fieldset>`
            : ''
        }
        <div class="row-actions" style="margin:0">
          ${copyOpen ? '' : '<button type="button" id="weeks-copy-open">Copiar a otros atletas</button>'}
          <button type="button" id="weeks-remove" class="week-remove">Quitar</button>
          <button type="button" id="weeks-close">Cerrar</button>
        </div>
      </aside>`;
  }

  function render(): void {
    const days = weekDays(monday);
    const pending = (rows ?? []).filter((r) => r.week?.draft);
    let body: string;
    if (error) body = `<div class="error-box">${escapeHtml(error)}</div>`;
    else if (rows === null) body = '<p class="hint">Cargando las semanas de tus atletas…</p>';
    else if (rows.length === 0) body = '<div class="panel coach-empty"><p>Todavía no tienes atletas vinculados.</p><a href="#/coach-invite" class="coach-btn coach-btn-primary">Invitar atleta</a></div>';
    else
      body = `
        <div class="weeks-layout">
          <div class="weeks-grid-wrap">
            <div class="weeks-grid">
              <div class="weeks-row weeks-head"><span class="live-col-label">Atleta</span>${days.map((d, i) => `<span class="live-col-label${d === todayKey ? ' weeks-today-label' : ''}">${fmtDay(d, i)}</span>`).join('')}</div>
              ${rows.map((r) => rowHtml(r, days)).join('')}
            </div>
          </div>
          ${panelHtml(days)}
        </div>`;

    container.innerHTML = `
      <div class="screen coach-screen weeks-screen">
        <header class="coach-head">
          <div>
            <div class="weeks-nav">
              <button type="button" id="weeks-prev" aria-label="Semana anterior">‹</button>
              <h1>Semana del ${fmtRange(monday)}</h1>
              <button type="button" id="weeks-next" aria-label="Semana siguiente">›</button>
              <button type="button" id="weeks-today">Esta semana</button>
            </div>
            <span class="hint">Todos tus atletas en una pantalla. Nada llega a un atleta hasta que publicas su fila.</span>
          </div>
          ${rows && rows.length ? `<button type="button" class="btn-light" id="weeks-publish-all"${pending.length && !publishingAll ? '' : ' disabled'}>${publishingAll ? 'Publicando…' : pending.length ? `Publicar ${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'}` : 'Todo publicado'}</button>` : ''}
        </header>
        ${message ? `<p class="hint">${escapeHtml(message)}</p>` : ''}
        ${body}
      </div>`;
    wire();
  }

  function goTo(next: string): void {
    monday = next;
    lastMonday = next;
    message = '';
    void load();
  }

  function invalidWorkouts(r: Row): string[] {
    return (r.week?.items ?? []).flatMap((i) => {
      if (!i.workout) return [];
      const v = validateWorkout(i.workout);
      return v.valid ? [] : [`${i.workout.name}: ${v.errors.join(', ')}`];
    });
  }

  async function publishRow(r: Row): Promise<boolean> {
    if (!r.week?.draft) return true;
    const invalid = invalidWorkouts(r);
    if (invalid.length) {
      r.error = `Hay entrenamientos con errores: ${invalid.join(' · ')}`;
      return false;
    }
    try {
      await r.week.publish();
      r.error = '';
      return true;
    } catch (err) {
      r.error = errorMessage(err);
      return false;
    }
  }

  function wire(): void {
    container.querySelector('#weeks-prev')?.addEventListener('click', () => goTo(addDaysKey(monday, -7)));
    container.querySelector('#weeks-next')?.addEventListener('click', () => goTo(addDaysKey(monday, 7)));
    container.querySelector('#weeks-today')?.addEventListener('click', () => goTo(weekStartOf(todayKey)));

    container.querySelectorAll<HTMLButtonElement>('[data-sel-athlete]').forEach((btn) =>
      btn.addEventListener('click', () => {
        selected = { athleteId: btn.dataset.selAthlete!, index: Number(btn.dataset.selIndex) };
        copyOpen = false;
        render();
      }),
    );
    container.querySelectorAll<HTMLButtonElement>('[data-add-athlete]').forEach((btn) =>
      btn.addEventListener('click', () => {
        selected = { athleteId: btn.dataset.addAthlete!, addDay: btn.dataset.addDay! };
        copyOpen = false;
        render();
      }),
    );
    container.querySelectorAll('#weeks-close').forEach((b) =>
      b.addEventListener('click', () => {
        selected = null;
        render();
      }),
    );

    const sel = selected;
    const r = sel ? rowOf(sel.athleteId) : null;
    if (sel && r?.week) {
      const w = r.week;
      if ('addDay' in sel) {
        container.querySelector('#weeks-add-confirm')?.addEventListener('click', () => {
          const choice = container.querySelector<HTMLSelectElement>('#weeks-add-choice')?.value ?? '';
          const item = itemFromChoice(choice, sel.addDay);
          if (!item) return;
          selected = null;
          change(r, [...w.items, item]);
        });
      } else {
        const item = w.items[sel.index];
        const replaceAt = (next: PlanWeekItem) => change(r, w.items.map((x, i) => (i === sel.index ? next : x)));
        container.querySelector<HTMLSelectElement>('#weeks-replace')?.addEventListener('change', (e) => {
          const value = (e.target as HTMLSelectElement).value;
          const next = value && item ? itemFromChoice(value, itemDate(item) ?? monday) : null;
          if (next) replaceAt(next);
        });
        container.querySelector<HTMLSelectElement>('#weeks-move')?.addEventListener('change', (e) => {
          if (item) replaceAt(movedItem(item, (e.target as HTMLSelectElement).value));
        });
        container.querySelectorAll<HTMLButtonElement>('[data-weeks-intensity]').forEach((b) =>
          b.addEventListener('click', () => {
            if (item?.workout) replaceAt(editedItem(item, scaleIntensity(item.workout, Number(b.dataset.weeksIntensity))));
          }),
        );
        container.querySelector('#weeks-remove')?.addEventListener('click', () => {
          if (!item || !window.confirm(`¿Quitar "${itemName(item)}" de la semana de ${athleteName(r.athlete)}?`)) return;
          selected = null;
          change(r, w.items.filter((_, i) => i !== sel.index));
        });
        container.querySelector('#weeks-copy-open')?.addEventListener('click', () => {
          copyOpen = true;
          render();
        });
        container.querySelector('#weeks-copy-cancel')?.addEventListener('click', () => {
          copyOpen = false;
          render();
        });
        container.querySelector('#weeks-copy-confirm')?.addEventListener('click', () => {
          if (!item) return;
          const targets = [...container.querySelectorAll<HTMLInputElement>('.weeks-copy input:checked')].map((i) => i.value);
          targets.forEach((id) => {
            const target = rowOf(id);
            if (target?.week) change(target, [...target.week.items, cloneItem(item)]);
          });
          copyOpen = false;
          message = targets.length ? `Copiado a ${targets.length} ${targets.length === 1 ? 'atleta' : 'atletas'} (queda en su borrador).` : '';
          render();
        });
      }
    }

    container.querySelectorAll<HTMLButtonElement>('[data-publish]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const row = rowOf(btn.dataset.publish!);
        if (!row || !window.confirm(`¿Publicar la semana de ${athleteName(row.athlete)}? La verá en su Plan.`)) return;
        row.saving = true;
        render();
        await publishRow(row);
        row.saving = false;
        if (selected?.athleteId === row.athlete.userId) selected = null;
        render();
      }),
    );

    container.querySelector('#weeks-publish-all')?.addEventListener('click', async () => {
      const pending = (rows ?? []).filter((x) => x.week?.draft);
      if (!pending.length || !window.confirm(`¿Publicar las semanas de ${pending.length} ${pending.length === 1 ? 'atleta' : 'atletas'}? Cada quien las verá en su Plan.`)) return;
      publishingAll = true;
      selected = null;
      render();
      let ok = 0;
      for (const row of pending) if (await publishRow(row)) ok++;
      publishingAll = false;
      message = ok === pending.length ? (ok === 1 ? 'Semana publicada.' : `Publicadas ${ok} semanas.`) : `Publicadas ${ok} de ${pending.length}; revisa las filas con error.`;
      render();
    });
  }

  void load();
}
