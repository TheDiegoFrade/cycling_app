// Invitar atleta — lado del coach de docs/coach-view/mockups/Invitar.dc.html.
// Solo para cuentas con profiles.is_coach. El link es de un solo uso y vence
// en INVITE_TTL_DAYS; la base guarda solo el hash del token, así que el link
// solo se puede copiar justo después de crearlo.
import { COACH_TIERS, COACH_TIER_LABELS, INVITE_TTL_DAYS, inviteLink } from '../../core/coach-invite';
import type { CoachTier } from '../../core/coach-invite';
import { cancelInvite, countActiveAthletes, createInvite, listPendingInvites } from '../../sync/coach-link';
import type { PendingInvite } from '../../sync/coach-link';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function daysAgoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Creado hoy';
  return days === 1 ? 'Creado ayer' : `Creado hace ${days} días`;
}

export function renderCoachInvite(container: HTMLElement): void {
  const user = appState.user;
  if (!user || !appState.coach.isCoach) {
    container.innerHTML = `
      <div class="screen">
        <h1>Invitar atleta</h1>
        <p class="hint">Esta sección es solo para coaches.</p>
      </div>`;
    return;
  }
  const coachId = user.id;

  let tier: CoachTier = 'revision';
  let link: string | null = null;
  let pending: PendingInvite[] | null = null; // null mientras carga
  let athletes: number | null = null;
  let message = '';
  let busy = false;

  function pendingHtml(): string {
    if (pending === null) return '<p class="hint">Cargando…</p>';
    if (pending.length === 0) return '<p class="hint">No tienes links sin usar.</p>';
    return pending
      .map(
        (p) => `
        <div class="invite-pending-row">
          <div>
            <div>Link sin usar · ${COACH_TIER_LABELS[p.tier]}</div>
            <div class="live-col-label">${daysAgoLabel(p.createdAt)} · vence ${fmtDate(p.expiresAt)}</div>
          </div>
          <button type="button" data-cancel="${p.id}">Cancelar</button>
        </div>`,
      )
      .join('');
  }

  function render(): void {
    const canShare = typeof navigator.share === 'function';
    container.innerHTML = `
      <div class="screen invite-screen">
        <div class="plan-head">
          <h1>Invitar atleta</h1>
          ${athletes !== null ? `<span class="live-col-label">${athletes === 1 ? '1 atleta vinculado' : `${athletes} atletas vinculados`}</span>` : ''}
        </div>
        <p class="hint">Comparte el link con tu atleta. Al abrirlo ve qué podrás ver de su entrenamiento y decide si te acepta como coach.</p>

        <section class="panel invite-card">
          <label>Plan que tendrá el atleta
            <select id="invite-tier">
              ${COACH_TIERS.map((t) => `<option value="${t}"${t === tier ? ' selected' : ''}>${COACH_TIER_LABELS[t]}</option>`).join('')}
            </select>
          </label>
          ${
            link
              ? `
          <div class="invite-link-box">
            <span class="live-col-label">Link de invitación · vence en ${INVITE_TTL_DAYS} días, un solo uso</span>
            <div class="invite-link-row">
              <input type="text" id="invite-link" readonly value="${escapeHtml(link)}">
              <button type="button" class="primary" id="invite-copy">Copiar link</button>
              ${canShare ? '<button type="button" id="invite-share">Compartir</button>' : ''}
            </div>
            <span class="hint">Cópialo ahora: por seguridad no se guarda y no se puede volver a mostrar. Si lo pierdes, cancela este y crea otro.</span>
          </div>
          <button type="button" id="invite-create"${busy ? ' disabled' : ''}>Crear otro link</button>`
              : `<button type="button" class="primary" id="invite-create"${busy ? ' disabled' : ''}>${busy ? 'Creando…' : 'Crear link de invitación'}</button>`
          }
          ${message ? `<p class="hint" id="invite-message">${escapeHtml(message)}</p>` : ''}
        </section>

        <section class="panel invite-card">
          <h2 class="perfil-h2" style="margin:0">Invitaciones pendientes</h2>
          <div id="invite-pending">${pendingHtml()}</div>
        </section>
      </div>`;
    wire();
  }

  function wire(): void {
    container.querySelector<HTMLSelectElement>('#invite-tier')?.addEventListener('change', (e) => {
      tier = (e.target as HTMLSelectElement).value as CoachTier;
    });

    container.querySelector('#invite-create')?.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      message = '';
      render();
      try {
        const token = await createInvite(coachId, tier);
        link = inviteLink(location.origin, token);
        await loadPending();
      } catch (err) {
        message = `No se pudo crear el link: ${err instanceof Error ? err.message : String(err)}`;
      }
      busy = false;
      render();
    });

    container.querySelector('#invite-copy')?.addEventListener('click', async () => {
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        message = 'Link copiado.';
      } catch {
        container.querySelector<HTMLInputElement>('#invite-link')?.select();
        message = 'No se pudo copiar solo — ya quedó seleccionado, cópialo a mano.';
      }
      render();
    });

    container.querySelector('#invite-share')?.addEventListener('click', () => {
      if (!link) return;
      void navigator.share({ title: 'Torq', text: 'Te invito a entrenar conmigo en Torq', url: link }).catch(() => {});
    });

    container.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('¿Cancelar este link? Quien lo tenga ya no podrá usarlo.')) return;
        try {
          await cancelInvite(btn.dataset.cancel!);
          await loadPending();
        } catch (err) {
          message = `No se pudo cancelar: ${err instanceof Error ? err.message : String(err)}`;
        }
        render();
      });
    });
  }

  async function loadPending(): Promise<void> {
    try {
      [pending, athletes] = await Promise.all([listPendingInvites(coachId), countActiveAthletes(coachId)]);
    } catch (err) {
      pending = [];
      message = `No se pudieron cargar tus invitaciones: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  render();
  void loadPending().then(render);
}
