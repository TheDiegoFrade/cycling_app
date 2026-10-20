// Lista de espera (solo administradores: ADMIN_USER_IDS en
// supabase/functions/_shared/coach-access.ts). «Invitar» manda el correo para
// crear la cuenta; Torq no tiene registro abierto.
import { inviteFromWaitlist, listWaitlist } from '../../sync/invite';
import type { WaitlistRow } from '../../sync/invite';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

const DISCIPLINE: Record<string, string> = { road: 'Ruta', mountain: 'Montaña / XC', gravel: 'Gravel', other: 'Otra' };
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export function renderAdminWaitlist(container: HTMLElement): void {
  if (!appState.billing?.isAdmin) {
    container.innerHTML = '<div class="screen"><h1>Lista de espera</h1><p class="hint">Esta sección es solo para administradores.</p></div>';
    return;
  }
  container.innerHTML = '<div class="screen admin-screen"><h1>Lista de espera</h1><p class="hint">Cargando…</p></div>';
  void listWaitlist().then((res) => {
    if (!container.isConnected) return;
    if (res.error || !res.data) {
      container.querySelector('.hint')!.textContent = 'No se pudo cargar la lista. Intenta de nuevo en un momento.';
      return;
    }
    paint(res.data.rows);
  });

  function rowHtml(r: WaitlistRow): string {
    return `<tr data-id="${escapeHtml(r.id)}">
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(r.name ?? '—')}</td>
      <td>${escapeHtml(DISCIPLINE[r.discipline ?? ''] ?? '—')}</td>
      <td>${fmt(r.created_at)}</td>
      <td>${r.invited_at ? `Invitado el ${fmt(r.invited_at)}` : `<button class="btn-light" data-invite="${escapeHtml(r.id)}">Invitar</button>`}</td>
    </tr>`;
  }

  function paint(rows: WaitlistRow[]): void {
    const pending = rows.filter((r) => !r.invited_at).length;
    container.innerHTML = `
      <div class="screen admin-screen">
        <h1>Lista de espera</h1>
        <p class="hint">${rows.length} en la lista · ${pending} sin invitar. «Invitar» le manda un correo para crear su cuenta.</p>
        ${
          rows.length
            ? `<div class="panel" style="overflow-x:auto"><table class="legal-table admin-table">
                <thead><tr><th>Correo</th><th>Nombre</th><th>Rueda</th><th>Se apuntó</th><th></th></tr></thead>
                <tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`
            : '<p class="hint">Todavía nadie se ha apuntado.</p>'
        }
        <p class="hint" id="admin-status" aria-live="polite"></p>
      </div>`;
    container.querySelectorAll<HTMLButtonElement>('[data-invite]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Invitando…';
        const res = await inviteFromWaitlist(btn.dataset.invite!);
        const status = container.querySelector<HTMLElement>('#admin-status')!;
        if (res.error) {
          btn.disabled = false;
          btn.textContent = 'Invitar';
          status.textContent = 'No se pudo invitar. Intenta de nuevo.';
          return;
        }
        const row = rows.find((r) => r.id === btn.dataset.invite);
        if (row) row.invited_at = new Date().toISOString();
        paint(rows);
        container.querySelector<HTMLElement>('#admin-status')!.textContent = res.data?.alreadyHadAccount ? 'Ya tenía cuenta: puede entrar con su contraseña.' : 'Invitación enviada.';
      });
    });
  }
}
