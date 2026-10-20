// Coaches (solo administradores, #/admin/coaches). Ser coach en Torq es solo
// por invitación: aquí se invita por correo, se revisan las solicitudes
// (aprobar con un máximo de atletas, o rechazar) y se ve cuántos atletas
// tiene cada coach. «Quitar como coach» termina sus vínculos: sus atletas
// dejan de tener la IA incluida.
import { DEFAULT_MAX_ATHLETES, MAX_ATHLETES_LIMIT } from '../../core/coach-application';
import type { CoachApplicationAnswers } from '../../core/coach-application';
import { adminInviteCoach, adminListCoaches, adminReviewApplication, adminRevokeCoach } from '../../sync/coach-apply';
import type { ApplicationRow, CoachRow } from '../../sync/coach-apply';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS_LABEL: Record<ApplicationRow['status'], string> = {
  invited: 'Invitado, sin llenar',
  submitted: 'Por revisar',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  revoked: 'Permiso quitado',
};

const DISCIPLINE: Record<string, string> = { road: 'Ruta', mountain: 'Montaña', gravel: 'Gravel', track: 'Pista', triathlon: 'Triatlón' };

function answersHtml(a: CoachApplicationAnswers): string {
  const row = (k: string, v: string) => `<dt>${k}</dt><dd>${escapeHtml(v || '—')}</dd>`;
  return `<dl class="admin-answers">
    ${row('Nombre', a.fullName)}${row('Teléfono', a.phone)}${row('Ciudad', a.city)}
    ${row('Años como coach', String(a.yearsCoaching))}${row('Atletas hoy', String(a.currentAthletes))}
    ${row('Certificaciones', a.certifications)}${row('Disciplinas', a.disciplines.map((d) => DISCIPLINE[d] ?? d).join(', '))}
    ${row('Cómo entrena', a.methodology)}${row('Su trabajo', a.links)}${row('Referencia', a.references)}
  </dl>`;
}

export function renderAdminCoaches(container: HTMLElement): void {
  if (!appState.billing?.isAdmin) {
    container.innerHTML = '<div class="screen"><h1>Coaches</h1><p class="hint">Esta sección es solo para administradores.</p></div>';
    return;
  }
  let apps: ApplicationRow[] = [];
  let coaches: CoachRow[] = [];
  let status = '';
  let lastLink: string | null = null;
  let confirmRevoke: string | null = null;

  container.innerHTML = '<div class="screen admin-screen"><h1>Coaches</h1><p class="hint">Cargando…</p></div>';
  const load = () =>
    adminListCoaches().then((res) => {
      if (!container.isConnected) return;
      if (res.error || !res.data) {
        container.querySelector('.hint')!.textContent = 'No se pudo cargar. Intenta de nuevo en un momento.';
        return;
      }
      apps = res.data.applications;
      coaches = res.data.coaches;
      paint();
    });
  void load();

  function appHtml(a: ApplicationRow): string {
    const review =
      a.status === 'submitted'
        ? `<div class="admin-review">
            <label class="admin-inline">Máximo de atletas <input type="number" min="1" max="${MAX_ATHLETES_LIMIT}" value="${a.max_athletes}" data-max="${a.id}"></label>
            <button class="primary" data-approve="${a.id}">Aprobar</button>
            <button class="btn-light" data-reject="${a.id}">Rechazar</button>
          </div>`
        : '';
    return `<div class="panel admin-app" data-app="${a.id}">
      <div class="admin-app-head"><b>${escapeHtml(a.answers?.fullName || a.email)}</b> · ${escapeHtml(a.email)} · <span class="admin-status-pill" data-status="${a.status}">${STATUS_LABEL[a.status]}</span></div>
      <div class="live-col-label">Invitado el ${fmt(a.invited_at)}${a.submitted_at ? ` · la mandó el ${fmt(a.submitted_at)}` : a.status === 'invited' ? ` · vence ${fmt(a.expires_at)}` : ''}</div>
      ${a.answers ? answersHtml(a.answers) : ''}
      ${review}
    </div>`;
  }

  function coachHtml(c: CoachRow): string {
    const full = c.athletes >= c.maxAthletes;
    const action =
      confirmRevoke === c.userId
        ? `<button class="danger" data-revoke-yes="${c.userId}">Sí, quitar (${c.athletes} atletas pierden su coach)</button> <button class="btn-light" data-revoke-no>No</button>`
        : `<button class="btn-light" data-revoke="${c.userId}">Quitar como coach</button>`;
    return `<tr data-coach="${c.userId}">
      <td>${escapeHtml(c.name ?? '—')}</td><td>${escapeHtml(c.email ?? '—')}</td>
      <td${full ? ' class="admin-full"' : ''}>${c.athletes} de ${c.maxAthletes}</td>
      <td>${c.viaApplication ? 'Solicitud' : 'Alta manual'}</td>
      <td>${action}</td></tr>`;
  }

  function paint(): void {
    const pending = apps.filter((a) => a.status === 'submitted');
    const others = apps.filter((a) => a.status !== 'submitted');
    container.innerHTML = `
      <div class="screen admin-screen">
        <h1>Coaches</h1>
        <p class="hint">Ser coach en Torq es solo por invitación. Invita por correo; la persona llena su solicitud y aquí la apruebas o rechazas. Sus atletas usan la IA gratis, hasta su máximo.</p>
        <form class="panel admin-invite-coach" id="admin-coach-invite" novalidate>
          <h2 class="perfil-h2">Invitar a un coach</h2>
          <div class="admin-invite-row">
            <label>Correo<input type="email" id="admin-coach-email" placeholder="coach@correo.com" autocomplete="off"></label>
            <label>Máximo de atletas<input type="number" id="admin-coach-max" min="1" max="${MAX_ATHLETES_LIMIT}" value="${DEFAULT_MAX_ATHLETES}"></label>
            <button class="primary" type="submit" id="admin-coach-invite-btn">Invitar</button>
          </div>
          ${lastLink ? `<p class="live-col-label">Link de la solicitud (por si el correo no llega): <code id="admin-coach-link">${escapeHtml(lastLink)}</code></p>` : ''}
        </form>
        <p class="hint" id="admin-status" aria-live="polite">${escapeHtml(status)}</p>
        <h2 class="perfil-h2">Por revisar (${pending.length})</h2>
        ${pending.length ? pending.map(appHtml).join('') : '<p class="hint">No hay solicitudes por revisar.</p>'}
        <h2 class="perfil-h2">Coaches activos (${coaches.length})</h2>
        ${
          coaches.length
            ? `<div class="panel" style="overflow-x:auto"><table class="legal-table admin-table">
                <thead><tr><th>Nombre</th><th>Correo</th><th>Atletas</th><th>Alta</th><th></th></tr></thead>
                <tbody>${coaches.map(coachHtml).join('')}</tbody></table></div>`
            : '<p class="hint">Todavía no hay coaches.</p>'
        }
        ${others.length ? `<h2 class="perfil-h2">Historial de invitaciones</h2>${others.map(appHtml).join('')}` : ''}
      </div>`;
    wire();
  }

  function wire(): void {
    const say = (t: string) => {
      status = t;
      const el = container.querySelector<HTMLElement>('#admin-status');
      if (el) el.textContent = t;
    };
    container.querySelector<HTMLFormElement>('#admin-coach-invite')!.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = container.querySelector<HTMLInputElement>('#admin-coach-email')!.value.trim();
      const max = Number(container.querySelector<HTMLInputElement>('#admin-coach-max')!.value);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('Escribe un correo válido.');
      const btn = container.querySelector<HTMLButtonElement>('#admin-coach-invite-btn')!;
      btn.disabled = true;
      say('Invitando…');
      const res = await adminInviteCoach(email, max);
      btn.disabled = false;
      if (res.error || !res.data) return say('No se pudo invitar. Intenta de nuevo.');
      lastLink = res.data.link;
      status = res.data.emailed ? `Invitación enviada a ${email}.` : `No se pudo mandar el correo a ${email}: comparte el link.`;
      await load();
    });
    container.querySelectorAll<HTMLButtonElement>('[data-approve], [data-reject]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.approve ?? btn.dataset.reject!;
        const approve = !!btn.dataset.approve;
        const max = Number(container.querySelector<HTMLInputElement>(`[data-max="${id}"]`)?.value);
        btn.disabled = true;
        const res = await adminReviewApplication(id, approve ? 'approve' : 'reject', approve ? { maxAthletes: max } : {});
        if (res.error) {
          btn.disabled = false;
          return say('No se pudo guardar. Intenta de nuevo.');
        }
        status = approve ? 'Aprobado: ya es coach.' : 'Solicitud rechazada.';
        await load();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach((btn) =>
      btn.addEventListener('click', () => {
        confirmRevoke = btn.dataset.revoke!;
        paint();
      }),
    );
    container.querySelector('[data-revoke-no]')?.addEventListener('click', () => {
      confirmRevoke = null;
      paint();
    });
    container.querySelector<HTMLButtonElement>('[data-revoke-yes]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      const res = await adminRevokeCoach(btn.dataset.revokeYes!);
      confirmRevoke = null;
      if (res.error) {
        paint();
        return say('No se pudo quitar. Intenta de nuevo.');
      }
      status = `Ya no es coach. Se terminaron ${res.data?.endedLinks ?? 0} vínculos.`;
      await load();
    });
  }
}
