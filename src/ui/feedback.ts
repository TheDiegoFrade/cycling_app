// «Mandar comentario»: un problema, una idea o algo que le gustó. Llega al
// correo de soporte con la pantalla y el dispositivo, para poder reproducirlo.
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABELS, FEEDBACK_MAX_CHARS, describeDevice } from '../core/feedback';
import type { FeedbackKind } from '../core/feedback';
import { sendFeedback } from '../sync/feedback';
import { escapeHtml } from './workout-cover';

export function openFeedbackDialog(kind: FeedbackKind = 'problem'): void {
  document.querySelector('#feedback-backdrop')?.remove();
  // la pantalla de donde viene (al abrir, antes de cualquier cambio de hash)
  const screen = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  const prevFocus = document.activeElement as HTMLElement | null;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'feedback-backdrop';
  backdrop.innerHTML = `
    <form class="panel plan-coach-modal feedback-modal" id="feedback-form" role="dialog" aria-modal="true" aria-labelledby="feedback-title" novalidate>
      <h2 id="feedback-title">Mandar comentario</h2>
      <p class="hint">Lo leemos todo. Si algo no funciona, cuéntanos qué hacías y qué pasó.</p>
      <div class="feedback-kinds" role="radiogroup" aria-label="Tipo de comentario">
        ${FEEDBACK_KINDS.map((k) => `<button type="button" class="ob-chip${k === kind ? ' on' : ''}" role="radio" aria-checked="${k === kind}" data-kind="${k}">${escapeHtml(FEEDBACK_KIND_LABELS[k])}</button>`).join('')}
      </div>
      <label class="feedback-label" for="feedback-message">Tu comentario</label>
      <textarea id="feedback-message" rows="5" maxlength="${FEEDBACK_MAX_CHARS}" placeholder="Ej. al conectar el rodillo se quedó en «Buscando…»"></textarea>
      <div id="feedback-result" aria-live="polite"></div>
      <div class="row-actions">
        <button type="submit" class="primary" id="feedback-send">Mandar</button>
        <button type="button" id="feedback-cancel">Cancelar</button>
      </div>
    </form>`;
  document.body.appendChild(backdrop);
  const form = backdrop.querySelector<HTMLFormElement>('#feedback-form')!;
  const textarea = backdrop.querySelector<HTMLTextAreaElement>('#feedback-message')!;
  const result = backdrop.querySelector<HTMLElement>('#feedback-result')!;
  const sendBtn = backdrop.querySelector<HTMLButtonElement>('#feedback-send')!;
  let current: FeedbackKind = kind;

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (prevFocus?.isConnected) prevFocus.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('#feedback-cancel')!.addEventListener('click', close);
  backdrop.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      current = b.dataset.kind as FeedbackKind;
      backdrop.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
    }),
  );
  textarea.addEventListener('input', () => {
    if (result.querySelector('.error-box')) result.innerHTML = '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = textarea.value.trim();
    if (message.length < 3) {
      result.innerHTML = '<div class="error-box">Escribe tu comentario.</div>';
      textarea.focus();
      return;
    }
    sendBtn.disabled = true;
    result.innerHTML = '<p class="hint">Mandando…</p>';
    try {
      const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      await sendFeedback({ kind: current, message, screen, device: describeDevice(navigator.userAgent, touch, innerWidth) });
      form.innerHTML = `
        <h2 id="feedback-title">¡Gracias! 🙌</h2>
        <p>Nos llegó tu comentario. Si necesitas respuesta, te escribimos a tu correo.</p>
        <div class="row-actions"><button type="button" class="primary" id="feedback-done">Listo</button></div>`;
      const done = form.querySelector<HTMLButtonElement>('#feedback-done')!;
      done.addEventListener('click', close);
      done.focus();
    } catch (err) {
      sendBtn.disabled = false;
      result.innerHTML = `<div class="error-box">${escapeHtml(err instanceof Error ? err.message : 'No se pudo mandar.')}</div>`;
    }
  });
  textarea.focus();
}
