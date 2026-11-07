// Ventana para crear o cambiar la contraseña desde un link de correo, y avisos
// sin `alert()`. La usan invite-signup.ts y password-reset.ts.
import { passwordProblem, PASSWORD_MIN } from '../core/auth-link';
import { escapeHtml } from './workout-cover';

export interface PasswordModalOptions {
  id: string;
  title: string;
  intro: string;
  submitLabel: string;
  /** Guarda la contraseña. Regresa null si salió bien, o el texto del error.
   * `fatal`: el link ya no sirve, se quita el formulario y queda el aviso. */
  save: (password: string) => Promise<null | { text: string; fatal?: boolean }>;
  onDone: () => void;
}

export function showPasswordModal(o: PasswordModalOptions): void {
  document.getElementById(`${o.id}-backdrop`)?.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="modal-backdrop" id="${o.id}-backdrop">
      <form class="panel" id="${o.id}-form" style="max-width:380px;margin:auto" novalidate>
        <h2 class="perfil-h2" style="margin:0 0 8px">${escapeHtml(o.title)}</h2>
        <p class="hint" style="margin:0 0 10px">${escapeHtml(o.intro)}</p>
        <div id="${o.id}-fields">
          <label class="live-col-label">Contraseña<input type="password" id="${o.id}-pw-1" autocomplete="new-password" placeholder="mínimo ${PASSWORD_MIN} caracteres" style="width:100%"></label>
          <label class="live-col-label" style="margin-top:8px;display:block">Repítela<input type="password" id="${o.id}-pw-2" autocomplete="new-password" style="width:100%"></label>
          <button class="primary" type="submit" style="margin-top:12px">${escapeHtml(o.submitLabel)}</button>
        </div>
        <p class="hint" id="${o.id}-status" aria-live="polite" style="margin-top:8px"></p>
      </form>
    </div>`,
  );
  const backdrop = document.getElementById(`${o.id}-backdrop`)!;
  const form = backdrop.querySelector<HTMLFormElement>('form')!;
  const fields = form.querySelector<HTMLElement>(`#${o.id}-fields`)!;
  const status = form.querySelector<HTMLElement>(`#${o.id}-status`)!;
  const btn = fields.querySelector<HTMLButtonElement>('button')!;
  form.querySelector<HTMLInputElement>(`#${o.id}-pw-1`)?.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = form.querySelector<HTMLInputElement>(`#${o.id}-pw-1`)!.value;
    const b = form.querySelector<HTMLInputElement>(`#${o.id}-pw-2`)!.value;
    const problem = passwordProblem(a, b);
    if (problem) return void (status.textContent = problem);
    status.textContent = 'Guardando…';
    btn.disabled = true;
    const err = await o.save(a);
    btn.disabled = false;
    if (!err) {
      backdrop.remove();
      o.onDone();
      return;
    }
    status.textContent = err.text;
    if (err.fatal) {
      fields.remove();
      addCloseButton(form, () => backdrop.remove());
    }
  });
}

/** Aviso en la app (en lugar de `alert()`), con un botón para cerrarlo. */
export function showNotice(id: string, title: string, text: string): void {
  document.getElementById(`${id}-backdrop`)?.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="modal-backdrop" id="${id}-backdrop">
      <div class="panel" role="alertdialog" aria-labelledby="${id}-title" style="max-width:380px;margin:auto">
        <h2 class="perfil-h2" id="${id}-title" style="margin:0 0 8px">${escapeHtml(title)}</h2>
        <p class="hint" id="${id}-text" style="margin:0">${escapeHtml(text)}</p>
      </div>
    </div>`,
  );
  const backdrop = document.getElementById(`${id}-backdrop`)!;
  addCloseButton(backdrop.querySelector<HTMLElement>('.panel')!, () => backdrop.remove());
}

function addCloseButton(parent: HTMLElement, close: () => void): void {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'primary';
  b.textContent = 'Entendido';
  b.style.marginTop = '12px';
  b.addEventListener('click', close);
  parent.appendChild(b);
  b.focus();
}
