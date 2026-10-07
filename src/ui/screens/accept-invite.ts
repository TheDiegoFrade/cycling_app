// Aceptar invitación — lado del atleta de
// docs/coach-view/mockups/Invitar.dc.html. Se llega con #/invite/:token
// (el link que comparte el coach). Si no hay sesión, el login la pide
// primero y luego regresa aquí solo (el hash se conserva).
import { COACH_TIER_LABELS, looksLikeInviteToken } from '../../core/coach-invite';
import { acceptInvite, previewInvite } from '../../sync/coach-link';
import type { InvitePreview } from '../../sync/coach-link';
import { getRouteParam, navigate } from '../router';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CROSS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function list(items: string[], icon: string): string {
  return items.map((t) => `<div class="invite-li">${icon}<span>${t}</span></div>`).join('');
}

export function renderAcceptInvite(container: HTMLElement): void {
  const token = getRouteParam();

  function shell(body: string): void {
    container.innerHTML = `<div class="screen invite-screen"><h1>Invitación de coach</h1>${body}</div>`;
  }

  function dead(text: string): void {
    shell(`<p class="hint">${text}</p><div class="row-actions"><a href="#/home">Ir a Inicio</a></div>`);
  }

  if (!looksLikeInviteToken(token)) {
    dead('Este link de invitación no es válido. Revisa que lo hayas copiado completo.');
    return;
  }

  function renderPreview(p: Exclude<InvitePreview, { status: 'invalid' }>, error = '', busy = false): void {
    const coach = escapeHtml(p.coachName ?? 'Tu coach');
    const already = appState.coach.myCoach;
    shell(`
      <section class="panel invite-card invite-accept">
        <h2 class="invite-title">${coach} quiere ser tu coach en Torq</h2>
        <span class="invite-pill">Plan: ${COACH_TIER_LABELS[p.tier]}</span>
        <div class="invite-columns">
          <div>
            <div class="live-col-label">${coach} podrá</div>
            ${list(
              [
                'Ver tus sesiones, métricas, RPE y notas',
                'Ver tu perfil de entrenamiento: FTP, zonas, objetivo y lesiones que registres',
                'Proponer y publicar tus semanas de entrenamiento',
                'Comentar tus sesiones y hacer tu revisión mensual',
              ],
              CHECK,
            )}
          </div>
          <div>
            <div class="live-col-label">${coach} no verá</div>
            ${list(['Actividades que llegan a Torq por Strava', 'Tu correo, tu fecha de nacimiento ni tu contraseña', 'Nada de lo que hagas después de desvincularte'], CROSS)}
          </div>
        </div>
        <div class="invite-note">
          <strong>Para que ${coach} vea tus rodadas de exterior</strong>
          <span>Conecta tu Garmin o Wahoo directo a intervals.icu (no a través de Strava). Lo que llega por Strava solo lo puedes ver tú.</span>
        </div>
        ${already ? `<div class="error-box">Ya tienes coach (${escapeHtml(already.coachName ?? 'sin nombre')}). Desvincúlate desde Perfil antes de aceptar otro.</div>` : ''}
        ${error ? `<div class="error-box">${escapeHtml(error)}</div>` : ''}
        <div class="row-actions" style="margin:0">
          <button type="button" class="primary" id="invite-accept"${busy || already ? ' disabled' : ''}>${busy ? 'Aceptando…' : `Aceptar a ${coach} como coach`}</button>
          <button type="button" id="invite-later">Ahora no</button>
        </div>
        <span class="hint">Puedes desvincularte cuando quieras desde Perfil; ${coach} deja de ver tus datos en ese momento.</span>
      </section>`);

    container.querySelector('#invite-later')?.addEventListener('click', () => navigate('home'));
    container.querySelector('#invite-accept')?.addEventListener('click', async () => {
      renderPreview(p, '', true);
      try {
        const myCoach = await acceptInvite(token!);
        appState.coach = { ...appState.coach, myCoach };
        shell(`
          <section class="panel invite-card">
            <h2 class="invite-title">Listo: ${escapeHtml(myCoach.coachName ?? 'tu coach')} ya es tu coach</h2>
            <p class="hint">Plan: ${COACH_TIER_LABELS[myCoach.tier]}. Puedes ver o terminar el vínculo en Perfil.</p>
            <div class="row-actions" style="margin:0"><a href="#/home" class="btn-light invite-done">Ir a Inicio</a></div>
          </section>`);
      } catch (err) {
        renderPreview(p, err instanceof Error ? err.message : String(err));
      }
    });
  }

  shell('<p class="hint">Revisando la invitación…</p>');
  previewInvite(token)
    .then((p) => {
      if (getRouteParam() !== token) return; // navegó a otra parte mientras cargaba
      if (p.status === 'valid') renderPreview(p);
      else if (p.status === 'invalid') dead('Este link de invitación no existe. Pídele a tu coach que te mande uno nuevo.');
      else if (p.status === 'used') dead('Este link ya se usó. Si no fuiste tú, pídele a tu coach uno nuevo.');
      else if (p.status === 'expired') dead('Este link ya venció. Pídele a tu coach uno nuevo.');
      else dead('Este es tu propio link de invitación — compártelo con tu atleta.');
    })
    .catch((err) => dead(`No se pudo revisar la invitación: ${escapeHtml(err instanceof Error ? err.message : String(err))}`));
}
