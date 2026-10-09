// Cuestionario inicial de coaching — llena el Perfil persistente (no es
// específico de un plan). Se dispara antes de "Crear mi plan" si el perfil
// todavía no tiene lo mínimo, y también se puede abrir libremente para
// completarlo o actualizarlo después. Al guardar, SIEMPRE se fusiona sobre
// appState.profile existente (mutación de campos + persistProfile()), igual
// que ya hace Perfil — nunca se reemplaza el objeto completo.
import type { Profile } from '../core/types';
import { coachProfileError, ftpSourceOf, isMeasuredFtp, withFtp } from '../core/coach-profile';
import { DAY_CODES, DAY_SHORT_LABELS } from '../core/other-activities';
import type { OtherActivity } from '../core/other-activities';
import { NON_BIKE_KINDS, NON_BIKE_KIND_LABELS } from '../core/session-kind';
import type { NonBikeKind } from '../core/session-kind';
import { appState } from './state';
import { wireDatePicker } from './date-picker';
import { buildCompletedSessionFromFit } from '../core/completed-session-import';
import { saveSession } from '../storage/session-store';
import { pushSessionToCloud } from '../sync/cloud-sync';

/** Todo el cuestionario es obligatorio para crear un plan (menos los .fit):
 * ver coachProfileError. */
export function isCoachProfileComplete(profile: Profile): boolean {
  return coachProfileError(profile) === null;
}

/** Lo que el atleta escribe cuando marca que no tiene lesiones. */
const NO_INJURIES = 'Ninguna';

function esc(v: string | number | undefined | null): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Una opción grande (título + explicación) de una pregunta de selección única. */
function optionHtml(attr: string, value: string, on: boolean, title: string, desc: string): string {
  return `<button type="button" class="ob-option${on ? ' on' : ''}" ${attr}="${value}" aria-pressed="${on}">
    <span class="ob-option-title">${title}</span><span class="ob-option-desc">${desc}</span>
  </button>`;
}

/** Interruptor: checkbox real (oculto) + el dibujo del switch, para que la
 * lógica siga leyendo `.checked`. */
/** FTP del cuestionario: con "No sé mi FTP" un número escrito es
 * provisional; sin número se queda el que había (default o provisional). Sin
 * la casilla, el número es suyo. */
function ftpFromForm(p: Profile, typed: number, unknown: boolean): Profile {
  const hasNumber = Number.isFinite(typed) && typed > 0;
  if (unknown) {
    if (hasNumber) return withFtp(p, typed, 'provisional');
    const source = ftpSourceOf(p) === 'provisional' ? 'provisional' : 'default';
    return { ...p, ftpSource: source, ftpConfirmed: false };
  }
  return hasNumber ? withFtp(p, typed, 'manual') : { ...p, ftpSource: 'manual', ftpConfirmed: true };
}

function toggleHtml(id: string, checked: boolean, title: string, desc = '', extraAttrs = ''): string {
  return `<label class="ob-toggle" ${extraAttrs}>
    <span class="ob-toggle-text"><span class="ob-toggle-title">${title}</span>${desc ? `<span class="ob-toggle-desc">${desc}</span>` : ''}</span>
    <input type="checkbox" id="${id}" class="ob-switch-input" ${checked ? 'checked' : ''}>
    <span class="ob-switch" aria-hidden="true"></span>
  </label>`;
}

const OTHER_NAME_PLACEHOLDER: Record<NonBikeKind, string> = {
  strength: 'Ej. pierna y core, tren superior',
  running: 'Ej. rodaje suave, series',
  crossfit: 'Ej. WOD, halterofilia',
  swimming: 'Ej. técnica, fondo',
  mobility: 'Ej. yoga, estiramientos',
  flexibility: 'Ej. yoga, estiramientos',
  other: 'Ej. fútbol, yoga, box',
};

/** Una fila de «Otras actividades»: tipo, nombre, veces, minutos y días. */
function otherActivityRowHtml(a: OtherActivity, i: number): string {
  const kinds = NON_BIKE_KINDS.map((k) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${NON_BIKE_KIND_LABELS[k]}</option>`).join('');
  const days = DAY_CODES.map(
    (d) => `<button type="button" class="ob-chip ob-chip-sm${a.days.includes(d) ? ' on' : ''}" data-day="${d}" aria-pressed="${a.days.includes(d)}">${DAY_SHORT_LABELS[d]}</button>`,
  ).join('');
  return `<div class="ob-other-row" data-i="${i}">
    <div class="ob-grid">
      <label class="ob-field">Actividad<select data-f="kind">${kinds}</select></label>
      <label class="ob-field"><span>${a.kind === 'other' ? 'Cuál' : 'Detalle <span class="ob-optional">opcional</span>'}</span><input type="text" data-f="name" maxlength="60" value="${esc(a.name)}" placeholder="${OTHER_NAME_PLACEHOLDER[a.kind]}"></label>
      <label class="ob-field">Veces por semana<input type="number" data-f="perWeek" min="1" max="7" inputmode="numeric" value="${esc(a.perWeek || '')}"></label>
      <label class="ob-field">Minutos por sesión<span class="ob-input-unit"><input type="number" data-f="minutes" min="10" max="300" inputmode="numeric" value="${esc(a.minutes || '')}"><span>min</span></span></label>
    </div>
    <p class="ob-q" style="margin-top:8px">Qué días <span class="ob-optional">si son fijos</span></p>
    <div class="ob-chips">${days}</div>
    <button type="button" class="ob-skip ob-other-remove">Quitar</button>
  </div>`;
}

function sectionHtml(n: number, title: string, body: string): string {
  return `<section class="ob-section"><h3 class="ob-section-title"><span class="ob-section-num">${n}</span>${title}</h3>${body}</section>`;
}

function modalHtml(p: Profile): string {
  const ftpMeasured = isMeasuredFtp(ftpSourceOf(p));
  const editing = isCoachProfileComplete(p);
  // Sin selección previa: cada respuesta la elige el atleta.
  const experience = p.experienceLevel;
  const fitness = p.generalFitnessLevel;
  const discipline = p.discipline;
  const noInjuries = p.injuries === NO_INJURIES;
  return `
    <div class="modal-backdrop" id="onboarding-backdrop">
      <div class="panel ob-modal" id="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <header class="ob-head">
          <div>
            <h2 class="ob-title" id="ob-title">${editing ? 'Tu perfil de entrenamiento' : 'Antes de tu plan, cuéntanos de ti'}</h2>
            <p class="ob-subtitle">Tu coach y la IA usan esto para armar y ajustar tu plan. Puedes cambiarlo cuando quieras desde Perfil.</p>
          </div>
          <button type="button" class="ob-close" id="onboarding-close" aria-label="Cerrar">✕</button>
        </header>

        <div class="ob-body">
          ${sectionHtml(
            1,
            'Sobre ti',
            `<p class="ob-q">Sexo</p>
            <div class="ob-chips" id="ob-sex">
              ${(
                [
                  ['M', 'Hombre'],
                  ['F', 'Mujer'],
                  ['other', 'Otro'],
                ] as const
              )
                .map(([v, label]) => `<button type="button" class="ob-chip${p.sex === v ? ' on' : ''}" data-sex="${v}" aria-pressed="${p.sex === v}">${label}</button>`)
                .join('')}
            </div>
            <div class="ob-grid">
              <label class="ob-field">Fecha de nacimiento
                <input type="date" id="ob-birth-date" value="${esc(p.birth_date)}">
              </label>
              <label class="ob-field">Peso
                <span class="ob-input-unit"><input type="number" id="ob-weight" value="${esc(p.weight_kg)}" min="30" max="200" step="0.1" inputmode="decimal"><span>kg</span></span>
              </label>
              <label class="ob-field">Altura
                <span class="ob-input-unit"><input type="number" id="ob-height" value="${esc(p.height_cm)}" min="100" max="230" step="1" inputmode="numeric"><span>cm</span></span>
              </label>
            </div>`,
          )}

          ${sectionHtml(
            2,
            'Tu experiencia',
            `<p class="ob-q">¿Qué tanto has entrenado con estructura?</p>
            <div class="ob-options" id="ob-experience">
              ${optionHtml('data-level', 'new_to_cycling', experience === 'new_to_cycling', 'Nunca con estructura', 'Empiezo desde cero con zonas y planes.')}
              ${optionHtml('data-level', 'returning_or_new_to_app', experience === 'returning_or_new_to_app', 'Ya entreno, pero no en Torq', 'Tengo experiencia; es mi primera vez aquí.')}
              ${optionHtml('data-level', 'experienced', experience === 'experienced', 'Entreno regular', 'Conozco mis números y uso zonas.')}
            </div>
            <p class="ob-q">¿Qué tan activo has estado los últimos meses?</p>
            <div class="ob-options" id="ob-fitness">
              ${optionHtml('data-level', 'sedentary', fitness === 'sedentary', 'Apenas arranco', 'Poca actividad física últimamente.')}
              ${optionHtml('data-level', 'active_other_sport', fitness === 'active_other_sport', 'Activo, pero no en bici', 'Corro, nado, gimnasio u otro deporte.')}
              ${optionHtml('data-level', 'active_cyclist', fitness === 'active_cyclist', 'Ya ando en bici seguido', 'Varias salidas por semana.')}
            </div>
            <div class="ob-grid">
              <label class="ob-field">Años andando en bici
                <span class="ob-input-unit"><input type="number" id="ob-years" value="${esc(p.yearsRiding)}" placeholder="0 si empiezas" min="0" max="60" inputmode="numeric"><span>años</span></span>
              </label>
              <label class="ob-field">Años entrenando con potencia o estructura
                <span class="ob-input-unit"><input type="number" id="ob-structured-years" value="${esc(p.structuredTrainingYears)}" placeholder="0 si nunca" min="0" max="60" inputmode="numeric"><span>años</span></span>
              </label>
            </div>`,
          )}

          ${sectionHtml(
            3,
            'Tu bici',
            `<p class="ob-q">Disciplina principal</p>
            <div class="ob-chips" id="ob-discipline">
              ${(
                [
                  ['mountain', 'Montaña / XC'],
                  ['road', 'Ruta'],
                  ['gravel', 'Gravel'],
                  ['other', 'Otra'],
                ] as const
              )
                .map(([v, label]) => `<button type="button" class="ob-chip${discipline === v ? ' on' : ''}" data-discipline="${v}" aria-pressed="${discipline === v}">${label}</button>`)
                .join('')}
            </div>
            <div class="ob-toggles">
              ${toggleHtml('ob-rides-outside', !!p.ridesOutside, 'Salgo a rodar afuera', 'Aunque sea de vez en cuando.')}
              ${toggleHtml('ob-outdoor-power', !!p.hasOutdoorPowerMeter, 'Tengo medidor de potencia afuera', '', `id="ob-outdoor-power-label" style="display:${p.ridesOutside ? 'flex' : 'none'}"`)}
            </div>`,
          )}

          ${sectionHtml(
            4,
            'Tus números',
            `<div class="ob-grid">
              <div class="ob-field">
                <label for="ob-ftp" id="ob-ftp-label">${ftpMeasured ? 'FTP actual' : 'FTP provisional (si tienes uno)'}</label>
                <span class="ob-input-unit"><input type="number" id="ob-ftp" value="${ftpMeasured || ftpSourceOf(p) === 'provisional' ? esc(p.ftp) : ''}" placeholder="${ftpMeasured ? 'Ej. 200' : 'Si no, el coach te propone uno'}" inputmode="numeric"><span>W</span></span>
                ${toggleHtml('ob-no-ftp', !!p.ftpSource && !ftpMeasured, 'No sé mi FTP todavía', 'Puedes escribir uno provisional: el coach lo toma como punto de partida, no como medición.')}
              </div>
              <div class="ob-field">
                <label for="ob-hrmax">Pulso máximo</label>
                <span class="ob-input-unit"><input type="number" id="ob-hrmax" value="${p.hrMaxConfirmed ? esc(p.hr_max) : ''}" placeholder="Ej. 185" inputmode="numeric" ${p.hrMaxConfirmed === false ? 'disabled' : ''}><span>lpm</span></span>
                ${toggleHtml('ob-no-hrmax', p.hrMaxConfirmed === false, 'No sé mi pulso máximo')}
              </div>
            </div>
            <p class="ob-note">No pasa nada si no los sabes: el plan arranca con un protocolo para calibrarlos con seguridad.</p>`,
          )}

          ${sectionHtml(
            5,
            'Otras actividades',
            `<p class="ob-q">¿Haces algo más además de la bici? Correr, gym, crossfit… también cansa, y tu coach lo acomoda junto a tus rodadas.</p>
            <div id="ob-other-list" class="ob-other-list"></div>
            <button type="button" class="ob-chip" id="ob-other-add">+ Agregar actividad</button>
            <div class="ob-toggles">
              ${toggleHtml('ob-no-other', p.otherActivities?.length === 0, 'No hago otra actividad además de la bici')}
            </div>`,
          )}

          ${sectionHtml(
            6,
            'Metas y salud',
            `<div class="ob-toggles">
              ${toggleHtml('ob-competes', !!p.competes, 'Compito o quiero competir')}
            </div>
            <label class="ob-field" id="ob-category-label" style="display:${p.competes ? 'flex' : 'none'}">Categoría
              <input type="text" id="ob-category" value="${esc(p.category)}" placeholder="Ej. Experto 30-39, Élite, Cat 2">
            </label>
            <label class="ob-field"><span>Mejor resultado o logro reciente</span>
              <input type="text" id="ob-best-result" value="${esc(p.recentBestResult)}" placeholder="Ej. terminé mi primer XC local, o «ninguno todavía»">
            </label>
            <label class="ob-field"><span>Lesiones o limitaciones actuales</span>
              <textarea id="ob-injuries" rows="3" placeholder="Ej. molestia en rodilla izquierda, evitar sentadilla profunda" ${noInjuries ? 'disabled' : ''}>${noInjuries ? '' : esc(p.injuries)}</textarea>
            </label>
            <div class="ob-toggles">
              ${toggleHtml('ob-no-injuries', noInjuries, 'No tengo lesiones ni limitaciones')}
            </div>`,
          )}

          ${sectionHtml(
            7,
            'Entrenamientos recientes fuera de Torq',
            `<p class="ob-note" style="margin-top:0">¿Entrenaste con otra app o dispositivo las últimas 1 o 2 semanas? Sube esos archivos .fit para que el plan arranque con contexto real. Lo que ya grabaste en Torq no hace falta. <span class="ob-optional">opcional</span></p>
            <label class="ob-upload">
              <span class="ob-upload-icon" aria-hidden="true">↑</span>
              <span><strong>Elegir archivos .fit</strong><span class="ob-toggle-desc">Puedes elegir varios a la vez.</span></span>
              <input type="file" id="ob-fit-files" accept=".fit" multiple>
            </label>
            <p class="ob-note" id="ob-fit-status" aria-live="polite"></p>`,
          )}
        </div>

        <footer class="ob-foot">
          <span class="ob-status" id="onboarding-status" aria-live="polite"></span>
          <button type="button" class="ob-skip" id="onboarding-skip">Saltar por ahora</button>
          <button type="button" class="ob-save" id="onboarding-submit">Guardar</button>
        </footer>
      </div>
    </div>`;
}

/** `allowSkip`: true en el primer aviso al llegar a la app (se puede
 * posponer); false cuando se abre porque el usuario ya intentó crear un
 * plan y hace falta esto primero — ahí no hay botón de saltar. */
export function openOnboardingForm(onComplete: () => void, allowSkip: boolean): void {
  const p = appState.profile;
  document.body.insertAdjacentHTML('beforeend', modalHtml(p));
  const backdrop = document.getElementById('onboarding-backdrop')!;
  let experienceLevel: Profile['experienceLevel'] = p.experienceLevel;
  let generalFitnessLevel: Profile['generalFitnessLevel'] = p.generalFitnessLevel;
  let discipline: Profile['discipline'] = p.discipline;
  let sex: Profile['sex'] = p.sex;

  if (!allowSkip) backdrop.querySelector('#onboarding-skip')?.remove();
  wireDatePicker(backdrop.querySelector<HTMLInputElement>('#ob-birth-date')!, { showToday: false });

  backdrop.querySelectorAll<HTMLButtonElement>('#ob-experience .ob-option').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-experience .ob-option').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      experienceLevel = chip.dataset.level as typeof experienceLevel;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-fitness .ob-option').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-fitness .ob-option').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      generalFitnessLevel = chip.dataset.level as typeof generalFitnessLevel;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-sex .ob-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-sex .ob-chip').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      sex = chip.dataset.sex as typeof sex;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-discipline .ob-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-discipline .ob-chip').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      discipline = chip.dataset.discipline as typeof discipline;
    });
  });

  const competesCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-competes')!;
  const categoryLabel = backdrop.querySelector<HTMLElement>('#ob-category-label')!;
  competesCheckbox.addEventListener('change', () => {
    categoryLabel.style.display = competesCheckbox.checked ? 'flex' : 'none';
  });

  const ridesOutsideCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-rides-outside')!;
  const outdoorPowerLabel = backdrop.querySelector<HTMLElement>('#ob-outdoor-power-label')!;
  ridesOutsideCheckbox.addEventListener('change', () => {
    outdoorPowerLabel.style.display = ridesOutsideCheckbox.checked ? 'flex' : 'none';
  });

  const noFtpCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-ftp')!;
  const ftpLabel = backdrop.querySelector<HTMLElement>('#ob-ftp-label')!;
  noFtpCheckbox.addEventListener('change', () => {
    ftpLabel.textContent = noFtpCheckbox.checked ? 'FTP provisional (si tienes uno)' : 'FTP actual';
  });
  const hrMaxInput = backdrop.querySelector<HTMLInputElement>('#ob-hrmax')!;
  const noHrMaxCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-hrmax')!;
  noHrMaxCheckbox.addEventListener('change', () => {
    hrMaxInput.disabled = noHrMaxCheckbox.checked;
    if (noHrMaxCheckbox.checked) hrMaxInput.value = '';
  });

  const injuriesInput = backdrop.querySelector<HTMLTextAreaElement>('#ob-injuries')!;
  const noInjuriesCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-injuries')!;
  noInjuriesCheckbox.addEventListener('change', () => {
    injuriesInput.disabled = noInjuriesCheckbox.checked;
    if (noInjuriesCheckbox.checked) injuriesInput.value = '';
  });

  // Otras actividades: estado en memoria, se pinta de nuevo al agregar,
  // quitar o cambiar el tipo; los campos de texto solo actualizan el estado.
  const activities: OtherActivity[] = (p.otherActivities ?? []).map((a) => ({ ...a, days: [...a.days] }));
  const otherList = backdrop.querySelector<HTMLElement>('#ob-other-list')!;
  const noOtherCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-other')!;
  const addOtherBtn = backdrop.querySelector<HTMLButtonElement>('#ob-other-add')!;
  const paintActivities = () => {
    otherList.innerHTML = activities.map(otherActivityRowHtml).join('');
    addOtherBtn.style.display = noOtherCheckbox.checked ? 'none' : '';
  };
  addOtherBtn.addEventListener('click', () => {
    activities.push({ kind: 'strength', perWeek: 0, minutes: 0, days: [] });
    paintActivities();
  });
  noOtherCheckbox.addEventListener('change', () => {
    if (noOtherCheckbox.checked) activities.length = 0;
    paintActivities();
  });
  otherList.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const i = Number(el.closest<HTMLElement>('.ob-other-row')?.dataset.i);
    const a = activities[i];
    if (!a) return;
    if (el.dataset.f === 'name') a.name = el.value;
    if (el.dataset.f === 'perWeek') a.perWeek = Number(el.value) || 0;
    if (el.dataset.f === 'minutes') a.minutes = Number(el.value) || 0;
  });
  otherList.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    if (el.dataset.f !== 'kind') return;
    const a = activities[Number(el.closest<HTMLElement>('.ob-other-row')?.dataset.i)];
    if (!a) return;
    a.kind = el.value as NonBikeKind;
    paintActivities();
  });
  otherList.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const row = el.closest<HTMLElement>('.ob-other-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    if (el.classList.contains('ob-other-remove')) {
      activities.splice(i, 1);
      paintActivities();
      return;
    }
    const day = el.closest<HTMLElement>('[data-day]')?.dataset.day as OtherActivity['days'][number] | undefined;
    if (!day) return;
    const a = activities[i];
    a.days = a.days.includes(day) ? a.days.filter((d) => d !== day) : DAY_CODES.filter((d) => d === day || a.days.includes(d));
    paintActivities();
  });
  paintActivities();

  const fitStatus = backdrop.querySelector<HTMLElement>('#ob-fit-status')!;
  backdrop.querySelector<HTMLInputElement>('#ob-fit-files')?.addEventListener('change', async (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    let imported = 0;
    const errors: string[] = [];
    for (const file of files) {
      fitStatus.textContent = `Importando ${imported + errors.length + 1} de ${files.length}…`;
      // Sin dateOverride: se queda con la fecha/hora real del archivo — a
      // diferencia de "Agregar entrenamiento completado" en Plan, aquí no
      // hay un solo día que forzar, pueden ser varias sesiones de fechas
      // distintas.
      const { session, errors: fileErrors } = await buildCompletedSessionFromFit(file, appState.profile);
      if (fileErrors.length > 0) {
        errors.push(`${file.name}: ${fileErrors.join(', ')}`);
        continue;
      }
      if (session) {
        await saveSession(session);
        if (appState.user) void pushSessionToCloud(session, appState.profile, appState.user.id);
        imported++;
      }
    }
    fitStatus.textContent = `${imported} sesión(es) importada(s).${errors.length > 0 ? ` ${errors.length} con error: ${errors.join(' · ')}` : ''}`;
  });

  const close = () => backdrop.remove();
  backdrop.querySelector('#onboarding-close')?.addEventListener('click', close);
  backdrop.querySelector('#onboarding-skip')?.addEventListener('click', close);

  backdrop.querySelector('#onboarding-submit')?.addEventListener('click', async () => {
    const status = backdrop.querySelector<HTMLElement>('#onboarding-status')!;
    const numOrUndef = (id: string) => {
      const raw = backdrop.querySelector<HTMLInputElement>(id)!.value;
      return raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    };
    const competes = competesCheckbox.checked;
    const ridesOutside = ridesOutsideCheckbox.checked;
    const hrMaxConfirmed = !noHrMaxCheckbox.checked;
    const typedFtp = numOrUndef('#ob-ftp');
    const typedHrMax = numOrUndef('#ob-hrmax');
    const ftpOrHrError = (): string | null => {
      // Sin «No sé», el número es obligatorio: antes se quedaba el 200 W / 185
      // lpm por defecto marcado como si fuera suyo.
      if (!noFtpCheckbox.checked && !(typedFtp !== undefined && typedFtp >= 50 && typedFtp <= 600)) {
        return 'Escribe tu FTP (de 50 a 600 W) o marca «No sé mi FTP todavía».';
      }
      if (hrMaxConfirmed && typedHrMax === undefined) {
        return 'Escribe tu pulso máximo o marca «No sé mi pulso máximo».';
      }
      return null;
    };

    // Fusión explícita sobre el perfil existente — nunca reemplazar el
    // objeto completo (ver memoria: podría borrar FTP/pulso ya guardados).
    const candidate = ftpFromForm(
      {
        ...appState.profile,
        sex,
        birth_date: backdrop.querySelector<HTMLInputElement>('#ob-birth-date')!.value || undefined,
        weight_kg: numOrUndef('#ob-weight'),
        height_cm: numOrUndef('#ob-height'),
        experienceLevel,
        generalFitnessLevel,
        discipline,
        yearsRiding: numOrUndef('#ob-years'),
        structuredTrainingYears: numOrUndef('#ob-structured-years'),
        competes,
        category: competes ? backdrop.querySelector<HTMLInputElement>('#ob-category')!.value.trim() || undefined : undefined,
        ridesOutside,
        hasOutdoorPowerMeter: ridesOutside ? backdrop.querySelector<HTMLInputElement>('#ob-outdoor-power')!.checked : undefined,
        injuries: noInjuriesCheckbox.checked ? NO_INJURIES : injuriesInput.value.trim() || undefined,
        recentBestResult: backdrop.querySelector<HTMLInputElement>('#ob-best-result')!.value.trim() || undefined,
        // Ni actividades ni «No hago»: sin contestar (coachProfileError lo pide).
        otherActivities: noOtherCheckbox.checked
          ? []
          : activities.length
            ? activities.map((a) => ({ ...a, name: a.name?.trim() || undefined }))
            : undefined,
        hrMaxConfirmed,
        hr_max: hrMaxConfirmed ? (typedHrMax as number) : appState.profile.hr_max,
      },
      typedFtp ?? NaN,
      noFtpCheckbox.checked,
    );
    // Mismo orden que el formulario: primero lo que va antes de «Tus
    // números», luego el FTP y el pulso escritos, luego el resto.
    const before = coachProfileError({ ...candidate, ftpSource: 'default', hrMaxConfirmed: false, competes: false, recentBestResult: '-', injuries: '-', otherActivities: [] });
    const missing = before ?? ftpOrHrError() ?? coachProfileError(candidate);
    if (missing) {
      status.textContent = missing;
      return;
    }
    appState.profile = candidate;
    status.textContent = 'Guardando…';
    await appState.persistProfile();
    close();
    onComplete();
  });
}
