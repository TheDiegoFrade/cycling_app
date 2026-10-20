// «Antes de empezar»: términos con aceptación de riesgos y consentimiento
// para datos de salud. Con nube y sesión, nadie usa la app sin aceptar la
// versión vigente (main.ts la pone en lugar de cualquier pantalla). Dos
// casillas y un botón: el consentimiento de salud va aparte porque la ley lo
// pide expreso. Ver docs/legal/.
import { MIN_AGE } from '../core/access';
import { PRIVACY_TEXT } from '../core/privacy-text';
import { TERMS_IS_DRAFT, TERMS_TEXT, TERMS_VERSION } from '../core/terms-text';
import { acceptTerms } from '../sync/legal';
import { legalHtml } from './legal-markdown';
import { pinonFigureHtml } from './pinon';
import { appState } from './state';

export function renderTermsGate(container: HTMLElement, onAccepted: () => void): void {
  container.innerHTML = `
    <div class="screen terms-screen">
      <div class="terms-head">
        ${pinonFigureHtml('habla', 56)}
        <div>
          <h1>Antes de empezar</h1>
          <p class="hint">Lee y acepta cómo funciona Torq. Es una sola vez (y otra vez solo si cambian estos términos).</p>
        </div>
      </div>
      ${TERMS_IS_DRAFT ? '<p class="terms-draft">Modo de prueba: este texto es un borrador y todavía lo revisa un abogado.</p>' : ''}
      <article class="panel terms-text" tabindex="0" aria-label="Términos de uso y aceptación de riesgos">${legalHtml(TERMS_TEXT)}</article>
      <label class="terms-check"><input type="checkbox" id="terms-accept"> <span>Tengo ${MIN_AGE} años o más, leí y acepto los <strong>Términos de uso y aceptación de riesgos</strong>.</span></label>
      <label class="terms-check"><input type="checkbox" id="terms-health"> <span>Autorizo el uso de mis <strong>datos de salud</strong> para armar y ajustar mi plan, según el <a href="#" id="terms-privacy">Aviso de privacidad</a>.</span></label>
      <div class="row-actions">
        <button class="primary" id="terms-submit" disabled>Aceptar</button>
        <button class="btn-light" id="terms-signout">Ahora no (cerrar sesión)</button>
      </div>
      <p class="hint" id="terms-status" aria-live="polite"></p>
    </div>`;

  const accept = container.querySelector<HTMLInputElement>('#terms-accept')!;
  const health = container.querySelector<HTMLInputElement>('#terms-health')!;
  const submit = container.querySelector<HTMLButtonElement>('#terms-submit')!;
  const status = container.querySelector<HTMLElement>('#terms-status')!;
  const sync = () => (submit.disabled = !(accept.checked && health.checked));
  accept.addEventListener('change', sync);
  health.addEventListener('change', sync);

  container.querySelector('#terms-privacy')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="modal-backdrop" id="privacy-backdrop"><div class="panel terms-privacy" role="dialog" aria-label="Aviso de privacidad">
        <div class="plan-create-head"><h2 class="perfil-h2" style="margin:0">Aviso de privacidad</h2><button class="plan-create-close" id="privacy-close" aria-label="Cerrar">✕</button></div>
        <div class="terms-text">${legalHtml(PRIVACY_TEXT)}</div>
      </div></div>`,
    );
    const close = () => document.getElementById('privacy-backdrop')?.remove();
    document.getElementById('privacy-close')?.addEventListener('click', close);
  });

  container.querySelector('#terms-signout')?.addEventListener('click', () => void appState.signOut());

  submit.addEventListener('click', async () => {
    if (!appState.user) return;
    submit.disabled = true;
    status.textContent = 'Guardando…';
    const error = await acceptTerms(appState.user.id, TERMS_VERSION, TERMS_TEXT, { terms: true, health_data: true, adult: true });
    if (error) {
      status.textContent = error;
      sync();
      return;
    }
    appState.termsAccepted = true;
    onAccepted();
  });
}
