// El link de un coach abierto sin sesión (#/invite/:token). Torq no tiene
// registro abierto: este link es una de las dos formas de crear una cuenta
// (la otra es la invitación desde la lista de espera). Pide el correo, el
// servidor revisa que el link siga vigente y manda el correo para crear la
// contraseña; al volver, se acepta la invitación del coach.
import { looksLikeInviteToken } from '../../core/coach-invite';
import { coachSignup } from '../../sync/invite';
import { getRouteParam } from '../router';
import { renderLogin } from './login';

export function renderInviteSignup(container: HTMLElement): void {
  const token = getRouteParam();
  if (!looksLikeInviteToken(token)) {
    container.innerHTML = `<div class="screen invite-screen"><h1>Invitación de coach</h1><p class="hint">Este link de invitación no es válido. Revisa que lo hayas copiado completo.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="screen invite-screen">
      <h1>Tu coach te invitó a Torq</h1>
      <p class="hint">Crea tu cuenta con tu correo: te mandamos un link para poner tu contraseña, y al volver aceptas la invitación de tu coach. Con coach, Torq va incluido.</p>
      <form class="panel invite-signup" id="invite-signup-form" novalidate>
        <label class="live-col-label">Correo<input type="email" id="invite-email" autocomplete="email" placeholder="tucorreo@ejemplo.com" style="width:100%"></label>
        <button type="submit" class="primary" id="invite-signup-btn" style="margin-top:12px">Crear mi cuenta</button>
        <p class="hint" id="invite-signup-status" aria-live="polite" style="margin-top:8px"></p>
      </form>
      <p class="hint" style="margin-top:14px">¿Ya tienes cuenta? <a href="#" id="invite-login">Entrar</a></p>
    </div>`;
  const form = container.querySelector<HTMLFormElement>('#invite-signup-form')!;
  const status = container.querySelector<HTMLElement>('#invite-signup-status')!;
  const btn = container.querySelector<HTMLButtonElement>('#invite-signup-btn')!;
  container.querySelector('#invite-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    // El login aquí mismo: el hash se queda en #/invite/:token, así que al
    // entrar se vuelve a pintar esta ruta, ya con sesión (aceptar invitación).
    renderLogin(container);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = container.querySelector<HTMLInputElement>('#invite-email')!.value.trim();
    btn.disabled = true;
    status.textContent = 'Enviando…';
    const res = await coachSignup(token!, email);
    btn.disabled = false;
    if (res.error === 'invalid_email') status.textContent = 'Revisa tu correo: parece que le falta algo.';
    else if (res.error === 'invite_invalid') status.textContent = 'Este link ya se usó o ya venció. Pídele a tu coach uno nuevo.';
    else if (res.error) status.textContent = 'No se pudo enviar. Intenta de nuevo en un momento.';
    else {
      form.innerHTML = `<p><strong>Listo, revisa tu correo.</strong></p><p class="hint">Te mandamos un link a ${email.replace(/[<>&"]/g, '')} para crear tu contraseña. Ábrelo en este mismo navegador.</p>`;
    }
  });
}
