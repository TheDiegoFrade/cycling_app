// Panel para que el coach apruebe un correo a su atleta: comentario
// obligatorio (va al inicio del correo) y como máximo 2 envíos. Lo usan la
// revisión mensual, la semana y la ficha del atleta (bienvenida del plan).
import { escapeHtml } from './workout-cover';

export const EMAIL_MAX_SENDS = 2;
export const EMAIL_COMMENT_MAX = 600;

/** Estado que guarda cada pantalla (sobrevive a sus re-render). */
export interface EmailApproval {
  open: boolean;
  comment: string;
  sending: boolean;
  remaining: number;
  lastSentAt: string | null;
}

export function newEmailApproval(remaining: number, lastSentAt: string | null = null): EmailApproval {
  return { open: false, comment: '', sending: false, remaining, lastSentAt };
}

const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Botón que abre el panel; "Enviada 2 de 2" cuando ya no quedan. */
export function emailButtonHtml(id: string, s: EmailApproval, label = 'Enviar por correo'): string {
  if (s.remaining <= 0) return `<button type="button" id="${id}-open" disabled>Enviado ${EMAIL_MAX_SENDS} de ${EMAIL_MAX_SENDS}</button>`;
  const used = EMAIL_MAX_SENDS - s.remaining;
  const text = used ? `Reenviar por correo (queda ${s.remaining})` : label;
  return `<button type="button" class="btn-light" id="${id}-open"${s.sending ? ' disabled' : ''}>${s.sending ? 'Enviando…' : text}</button>`;
}

/** Panel con el comentario; vacío si está cerrado. */
export function emailPanelHtml(id: string, s: EmailApproval, what: string): string {
  if (!s.open || s.remaining <= 0) return '';
  return `<section class="panel coach-card" aria-label="Enviar por correo">
    <h2 class="perfil-h2" style="margin:0">Enviar ${escapeHtml(what)} por correo</h2>
    <span class="hint">Tu comentario va al inicio del correo, firmado por ti. Puedes enviarlo ${EMAIL_MAX_SENDS} veces como máximo${
      s.remaining < EMAIL_MAX_SENDS ? `; te queda ${s.remaining}` : ''
    }.${s.lastSentAt ? ` Último envío: ${fmt(s.lastSentAt)}.` : ''}</span>
    <textarea id="${id}-comment" rows="4" maxlength="${EMAIL_COMMENT_MAX}" placeholder="Ej.: Esta semana cuida el sueño antes del test; si el sábado no puedes, muévelo al domingo." style="width:100%;resize:vertical;font-family:inherit">${escapeHtml(s.comment)}</textarea>
    <div class="coach-head-actions">
      <button type="button" class="btn-light" id="${id}-send"${s.sending || s.comment.trim().length < 3 ? ' disabled' : ''}>${s.sending ? 'Enviando…' : 'Enviar'}</button>
      <button type="button" id="${id}-cancel"${s.sending ? ' disabled' : ''}>Cancelar</button>
    </div>
  </section>`;
}

/** Conecta botón y panel. `rerender` repinta la pantalla; `send` hace el envío. */
export function wireEmailApproval(root: ParentNode, id: string, s: EmailApproval, rerender: () => void, send: (comment: string) => Promise<void>): void {
  root.querySelector(`#${id}-open`)?.addEventListener('click', () => {
    s.open = !s.open;
    rerender();
    root.querySelector<HTMLTextAreaElement>(`#${id}-comment`)?.focus();
  });
  root.querySelector(`#${id}-cancel`)?.addEventListener('click', () => {
    s.open = false;
    rerender();
  });
  const area = root.querySelector<HTMLTextAreaElement>(`#${id}-comment`);
  area?.addEventListener('input', () => {
    s.comment = area.value;
    const btn = root.querySelector<HTMLButtonElement>(`#${id}-send`);
    if (btn) btn.disabled = s.sending || s.comment.trim().length < 3;
  });
  root.querySelector(`#${id}-send`)?.addEventListener('click', () => {
    const comment = s.comment.trim();
    if (comment.length < 3 || s.sending) return;
    void send(comment);
  });
}
