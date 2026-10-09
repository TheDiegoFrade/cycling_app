// Cuestionario inicial de coaching — llena el Perfil persistente (no es
// específico de un plan). Se dispara antes de "Crear mi plan" si el perfil
// todavía no tiene lo mínimo, y también se puede abrir libremente para
// completarlo o actualizarlo después. Al guardar, SIEMPRE se fusiona sobre
// appState.profile existente (mutación de campos + persistProfile()), igual
// que ya hace Perfil — nunca se reemplaza el objeto completo.
import type { Profile } from '../core/types';
import { ftpSourceOf, isMeasuredFtp, withFtp } from '../core/coach-profile';
import { appState } from './state';
import { buildCompletedSessionFromFit } from '../core/completed-session-import';
import { saveSession } from '../storage/session-store';
import { pushSessionToCloud } from '../sync/cloud-sync';

/** Lo mínimo para que create_plan tenga con qué trabajar — el resto de los
 * campos del cuestionario son enriquecimiento opcional, no bloquean nada. */
export function isCoachProfileComplete(profile: Profile): boolean {
  return (
    profile.experienceLevel !== undefined &&
    profile.generalFitnessLevel !== undefined &&
    profile.discipline !== undefined &&
    profile.ridesOutside !== undefined
  );
}

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

function sectionHtml(n: number, title: string, body: string): string {
  return `<section class="ob-section"><h3 class="ob-section-title"><span class="ob-section-num">${n}</span>${title}</h3>${body}</section>`;
}

function modalHtml(p: Profile): string {
  const ftpMeasured = isMeasuredFtp(ftpSourceOf(p));
  const editing = isCoachProfileComplete(p);
  const experience = p.experienceLevel ?? 'experienced';
  const fitness = p.generalFitnessLevel ?? 'active_other_sport';
  const discipline = p.discipline ?? 'mountain';
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
                <span class="ob-input-unit"><input type="number" id="ob-years" value="${esc(p.yearsRiding ?? 0)}" min="0" max="60" inputmode="numeric"><span>años</span></span>
              </label>
              <label class="ob-field">Años entrenando con potencia o estructura
                <span class="ob-input-unit"><input type="number" id="ob-structured-years" value="${esc(p.structuredTrainingYears ?? 0)}" min="0" max="60" inputmode="numeric"><span>años</span></span>
              </label>
            </div>`,
          )}

          ${sectionHtml(
            2,
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
            3,
            'Tus números',
            `<div class="ob-grid">
              <div class="ob-field">
                <label for="ob-ftp" id="ob-ftp-label">${ftpMeasured ? 'FTP actual' : 'FTP provisional (opcional)'}</label>
                <span class="ob-input-unit"><input type="number" id="ob-ftp" value="${ftpMeasured || ftpSourceOf(p) === 'provisional' ? esc(p.ftp) : ''}" placeholder="${ftpMeasured ? 'Ej. 200' : 'Si no, el coach te propone uno'}" inputmode="numeric"><span>W</span></span>
                ${toggleHtml('ob-no-ftp', !ftpMeasured, 'No sé mi FTP todavía', 'Puedes escribir uno provisional: el coach lo toma como punto de partida, no como medición.')}
              </div>
              <div class="ob-field">
                <label for="ob-hrmax">Pulso máximo</label>
                <span class="ob-input-unit"><input type="number" id="ob-hrmax" value="${p.hrMaxConfirmed ? esc(p.hr_max) : ''}" placeholder="Ej. 185" inputmode="numeric" ${p.hrMaxConfirmed ? '' : 'disabled'}><span>lpm</span></span>
                ${toggleHtml('ob-no-hrmax', !p.hrMaxConfirmed, 'No sé mi pulso máximo')}
              </div>
            </div>
            <p class="ob-note">No pasa nada si no los sabes: el plan arranca con un protocolo para calibrarlos con seguridad.</p>`,
          )}

          ${sectionHtml(
            4,
            'Metas y salud',
            `<div class="ob-toggles">
              ${toggleHtml('ob-competes', !!p.competes, 'Compito o quiero competir')}
            </div>
            <label class="ob-field" id="ob-category-label" style="display:${p.competes ? 'flex' : 'none'}">Categoría
              <input type="text" id="ob-category" value="${esc(p.category)}" placeholder="Ej. Experto 30-39, Élite, Cat 2">
            </label>
            <label class="ob-field"><span>Mejor resultado o logro reciente <span class="ob-optional">opcional</span></span>
              <input type="text" id="ob-best-result" value="${esc(p.recentBestResult)}" placeholder="Ej. terminé mi primer XC local">
            </label>
            <label class="ob-field"><span>Lesiones o limitaciones actuales <span class="ob-optional">opcional</span></span>
              <textarea id="ob-injuries" rows="3" placeholder="Ej. molestia en rodilla izquierda, evitar sentadilla profunda">${esc(p.injuries)}</textarea>
            </label>`,
          )}

          ${sectionHtml(
            5,
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
  let experienceLevel: Profile['experienceLevel'] = p.experienceLevel ?? 'experienced';
  let generalFitnessLevel: Profile['generalFitnessLevel'] = p.generalFitnessLevel ?? 'active_other_sport';
  let discipline: Profile['discipline'] = p.discipline ?? 'mountain';

  if (!allowSkip) backdrop.querySelector('#onboarding-skip')?.remove();

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

  const ftpInput = backdrop.querySelector<HTMLInputElement>('#ob-ftp')!;
  const noFtpCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-ftp')!;
  const ftpLabel = backdrop.querySelector<HTMLElement>('#ob-ftp-label')!;
  noFtpCheckbox.addEventListener('change', () => {
    ftpLabel.textContent = noFtpCheckbox.checked ? 'FTP provisional (opcional)' : 'FTP actual';
  });
  const hrMaxInput = backdrop.querySelector<HTMLInputElement>('#ob-hrmax')!;
  const noHrMaxCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-hrmax')!;
  noHrMaxCheckbox.addEventListener('change', () => {
    hrMaxInput.disabled = noHrMaxCheckbox.checked;
    if (noHrMaxCheckbox.checked) hrMaxInput.value = '';
  });

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
    const yearsRiding = Number(backdrop.querySelector<HTMLInputElement>('#ob-years')!.value) || 0;
    const structuredTrainingYears = Number(backdrop.querySelector<HTMLInputElement>('#ob-structured-years')!.value) || 0;
    const competes = competesCheckbox.checked;
    const category = competes ? backdrop.querySelector<HTMLInputElement>('#ob-category')!.value.trim() || undefined : undefined;
    const ridesOutside = ridesOutsideCheckbox.checked;
    const hasOutdoorPowerMeter = ridesOutside ? backdrop.querySelector<HTMLInputElement>('#ob-outdoor-power')!.checked : undefined;
    const injuries = backdrop.querySelector<HTMLTextAreaElement>('#ob-injuries')!.value.trim() || undefined;
    const recentBestResult = backdrop.querySelector<HTMLInputElement>('#ob-best-result')!.value.trim() || undefined;
    const hrMaxConfirmed = !noHrMaxCheckbox.checked;

    // Fusión explícita sobre el perfil existente — nunca reemplazar el
    // objeto completo (ver memoria: podría borrar FTP/pulso ya guardados).
    appState.profile = {
      ...appState.profile,
      experienceLevel,
      generalFitnessLevel,
      discipline,
      yearsRiding,
      structuredTrainingYears,
      competes,
      category,
      ridesOutside,
      hasOutdoorPowerMeter,
      injuries,
      recentBestResult,
      hrMaxConfirmed,
      hr_max: hrMaxConfirmed ? Number(hrMaxInput.value) || appState.profile.hr_max : appState.profile.hr_max,
    };
    appState.profile = ftpFromForm(appState.profile, Number(ftpInput.value), noFtpCheckbox.checked);
    status.textContent = 'Guardando…';
    await appState.persistProfile();
    close();
    onComplete();
  });
}
