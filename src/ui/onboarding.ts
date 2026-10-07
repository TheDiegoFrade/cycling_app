// Cuestionario inicial de coaching — llena el Perfil persistente (no es
// específico de un plan). Se dispara antes de "Crear mi plan" si el perfil
// todavía no tiene lo mínimo, y también se puede abrir libremente para
// completarlo o actualizarlo después. Al guardar, SIEMPRE se fusiona sobre
// appState.profile existente (mutación de campos + persistProfile()), igual
// que ya hace Perfil — nunca se reemplaza el objeto completo.
import type { Profile } from '../core/types';
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

function modalHtml(p: Profile): string {
  return `
    <div class="modal-backdrop" id="onboarding-backdrop">
      <div class="panel plan-coach-modal" id="onboarding-modal" style="max-width:480px">
        <div class="plan-create-head">
          <h2 class="perfil-h2" style="margin:0">Antes de tu plan — cuéntanos de ti</h2>
          <button class="plan-create-close" id="onboarding-close" aria-label="Cerrar">✕</button>
        </div>
        <p class="hint">Esto se guarda en tu perfil y no se vuelve a preguntar — solo la primera vez.</p>

        <label class="live-col-label" style="margin-top:12px;display:block">¿Qué tan nuevo eres entrenando con estructura?</label>
        <div class="plan-chip-row" id="ob-experience">
          <button class="plan-chip${p.experienceLevel === 'new_to_cycling' ? ' on' : ''}" data-level="new_to_cycling">Nunca he entrenado con estructura</button>
          <button class="plan-chip${p.experienceLevel === 'returning_or_new_to_app' ? ' on' : ''}" data-level="returning_or_new_to_app">Ya entreno, pero no en Torq</button>
          <button class="plan-chip${!p.experienceLevel || p.experienceLevel === 'experienced' ? ' on' : ''}" data-level="experienced">Entreno regular, conozco mis números</button>
        </div>

        <label class="live-col-label" style="margin-top:12px;display:block">¿Qué tan activo has estado (en lo que sea) los últimos meses?</label>
        <div class="plan-chip-row" id="ob-fitness">
          <button class="plan-chip${p.generalFitnessLevel === 'sedentary' ? ' on' : ''}" data-level="sedentary">Sedentario, apenas arranco</button>
          <button class="plan-chip${!p.generalFitnessLevel || p.generalFitnessLevel === 'active_other_sport' ? ' on' : ''}" data-level="active_other_sport">Activo, pero no en bici</button>
          <button class="plan-chip${p.generalFitnessLevel === 'active_cyclist' ? ' on' : ''}" data-level="active_cyclist">Ya ando en bici seguido</button>
        </div>

        <label class="live-col-label" style="margin-top:12px;display:block">Disciplina</label>
        <div class="plan-chip-row" id="ob-discipline">
          <button class="plan-chip${!p.discipline || p.discipline === 'mountain' ? ' on' : ''}" data-discipline="mountain">Montaña / XC</button>
          <button class="plan-chip${p.discipline === 'road' ? ' on' : ''}" data-discipline="road">Ruta</button>
          <button class="plan-chip${p.discipline === 'gravel' ? ' on' : ''}" data-discipline="gravel">Gravel</button>
          <button class="plan-chip${p.discipline === 'other' ? ' on' : ''}" data-discipline="other">Otra</button>
        </div>

        <div class="row-actions" style="margin-top:12px">
          <label class="live-col-label" style="flex:1">Años dándole a la bici
            <input type="number" id="ob-years" value="${p.yearsRiding ?? 0}" min="0" max="60" style="width:100%">
          </label>
          <label class="live-col-label" style="flex:1">Años entrenando con potencia/estructura
            <input type="number" id="ob-structured-years" value="${p.structuredTrainingYears ?? 0}" min="0" max="60" style="width:100%">
          </label>
        </div>

        <label class="live-col-label" style="margin-top:12px;display:block">
          <input type="checkbox" id="ob-competes" style="width:auto;margin-right:6px" ${p.competes ? 'checked' : ''}>Compito o quiero competir
        </label>
        <label class="live-col-label" id="ob-category-label" style="margin-top:4px;display:${p.competes ? 'block' : 'none'}">Categoría
          <input type="text" id="ob-category" value="${p.category ?? ''}" placeholder="Ej. Experto 30-39, Elite, Cat 2" style="width:100%">
        </label>

        <label class="live-col-label" style="margin-top:12px;display:block">
          <input type="checkbox" id="ob-rides-outside" style="width:auto;margin-right:6px" ${p.ridesOutside ? 'checked' : ''}>Salgo a rodar afuera, al menos a veces
        </label>
        <label class="live-col-label" id="ob-outdoor-power-label" style="margin-top:4px;display:${p.ridesOutside ? 'block' : 'none'}">
          <input type="checkbox" id="ob-outdoor-power" style="width:auto;margin-right:6px" ${p.hasOutdoorPowerMeter ? 'checked' : ''}>Tengo medidor de potencia afuera
        </label>

        <label class="live-col-label" style="margin-top:12px;display:block">Lesiones o limitaciones actuales (opcional)
          <textarea id="ob-injuries" rows="2" style="width:100%;resize:vertical;font-family:inherit">${p.injuries ?? ''}</textarea>
        </label>

        <label class="live-col-label" style="margin-top:12px;display:block">Mejor resultado/logro reciente (opcional)
          <input type="text" id="ob-best-result" value="${p.recentBestResult ?? ''}" placeholder="Ej. terminé mi primer XC local" style="width:100%">
        </label>

        <div class="row-actions" style="margin-top:12px">
          <label class="live-col-label" style="flex:1">FTP actual (W)
            <input type="number" id="ob-ftp" value="${p.ftpConfirmed ? p.ftp : ''}" placeholder="Ej. 200" style="width:100%" ${p.ftpConfirmed ? '' : 'disabled'}>
          </label>
          <label class="live-col-label" style="flex:1">Pulso máximo (lpm)
            <input type="number" id="ob-hrmax" value="${p.hrMaxConfirmed ? p.hr_max : ''}" placeholder="Ej. 185" style="width:100%" ${p.hrMaxConfirmed ? '' : 'disabled'}>
          </label>
        </div>
        <label class="live-col-label" style="margin-top:4px;display:block">
          <input type="checkbox" id="ob-no-ftp" style="width:auto;margin-right:6px" ${p.ftpConfirmed ? '' : 'checked'}>No sé mi FTP todavía
        </label>
        <label class="live-col-label" style="margin-top:4px;display:block">
          <input type="checkbox" id="ob-no-hrmax" style="width:auto;margin-right:6px" ${p.hrMaxConfirmed ? '' : 'checked'}>No sé mi pulso máximo
        </label>
        <p class="hint" style="margin-top:4px">No pasa nada si no los sabes — el coach arma un protocolo para calibrarlos con seguridad.</p>

        <label class="live-col-label" style="margin-top:12px;display:block">¿Entrenaste en otro lado las últimas 1-2 semanas? (opcional)</label>
        <p class="hint">Sube tus archivos .fit — así el coach arranca con tu condición real en vez de a ciegas.</p>
        <label class="plan-import-link">Elegir archivos .fit<input type="file" id="ob-fit-files" accept=".fit" multiple style="display:none"></label>
        <p class="hint" id="ob-fit-status" style="margin-top:4px"></p>

        <button class="btn-light" id="onboarding-submit" style="margin-top:16px">Guardar</button>
        <button class="plan-create-close" id="onboarding-skip" style="margin-top:8px;width:100%">Saltar por ahora</button>
        <p class="hint" id="onboarding-status" style="margin-top:8px"></p>
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

  backdrop.querySelectorAll<HTMLButtonElement>('#ob-experience .plan-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-experience .plan-chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      experienceLevel = chip.dataset.level as typeof experienceLevel;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-fitness .plan-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-fitness .plan-chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      generalFitnessLevel = chip.dataset.level as typeof generalFitnessLevel;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-discipline .plan-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-discipline .plan-chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      discipline = chip.dataset.discipline as typeof discipline;
    });
  });

  const competesCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-competes')!;
  const categoryLabel = backdrop.querySelector<HTMLElement>('#ob-category-label')!;
  competesCheckbox.addEventListener('change', () => {
    categoryLabel.style.display = competesCheckbox.checked ? 'block' : 'none';
  });

  const ridesOutsideCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-rides-outside')!;
  const outdoorPowerLabel = backdrop.querySelector<HTMLElement>('#ob-outdoor-power-label')!;
  ridesOutsideCheckbox.addEventListener('change', () => {
    outdoorPowerLabel.style.display = ridesOutsideCheckbox.checked ? 'block' : 'none';
  });

  const ftpInput = backdrop.querySelector<HTMLInputElement>('#ob-ftp')!;
  const noFtpCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-ftp')!;
  noFtpCheckbox.addEventListener('change', () => {
    ftpInput.disabled = noFtpCheckbox.checked;
    if (noFtpCheckbox.checked) ftpInput.value = '';
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
    const ftpConfirmed = !noFtpCheckbox.checked;
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
      ftpConfirmed,
      hrMaxConfirmed,
      ftp: ftpConfirmed ? Number(ftpInput.value) || appState.profile.ftp : appState.profile.ftp,
      hr_max: hrMaxConfirmed ? Number(hrMaxInput.value) || appState.profile.hr_max : appState.profile.hr_max,
    };
    status.textContent = 'Guardando…';
    await appState.persistProfile();
    close();
    onComplete();
  });
}
