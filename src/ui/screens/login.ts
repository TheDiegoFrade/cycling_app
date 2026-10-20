import { isSupabaseConfigured, supabase } from '../../supabase/client';
import { subscribeAmbientState, toggleAmbientTrack } from '../ambient-audio';
import { navigate } from '../router';
import { appState } from '../state';
import { requestPasswordReset } from '../password-reset';
import { joinWaitlist } from '../../sync/waitlist';

/** Supabase contesta en inglés ("Invalid login credentials"…): a la persona
 * se le dice en español qué pasó y qué hacer. */
export function loginErrorText(error: { message: string; code?: string; status?: number }): string {
  const m = `${error.code ?? ''} ${error.message}`.toLowerCase();
  if (m.includes('invalid_credentials') || m.includes('invalid login')) return 'Correo o contraseña incorrectos. Revísalos o toca «¿Olvidaste tu contraseña?».';
  if (m.includes('email_not_confirmed') || m.includes('not confirmed')) return 'Todavía no confirmas tu correo: abre el link que te mandamos y vuelve a entrar.';
  if (m.includes('rate') || error.status === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.';
  if (m.includes('fetch') || m.includes('network')) return 'No hay conexión con el servidor. Revisa tu internet y vuelve a intentar.';
  return 'No se pudo entrar. Intenta de nuevo en un momento.';
}

function renderLoginGate(container: HTMLElement, client: NonNullable<typeof supabase>): void {
  container.innerHTML = `
    <div class="hero${appState.settings.heroCharacter === 'woman' ? ' hero-woman' : ''}" style="min-height:100vh">
      <div class="entry-pill">
        <div class="brand"><img class="brand-logo" src="/brand/logo-torq.webp" alt="torq" width="150" height="70"></div>
        <div class="tag">Entrena sin mirar la pantalla.</div>
        <button type="button" class="ghost-btn" id="entry-toggle">Entrar</button>
        <form class="entry-fields" id="entry-fields" novalidate>
          <label>Correo<input type="email" id="login-email" placeholder="tucorreo@ejemplo.com" autocomplete="email"></label>
          <label>Contraseña<input type="password" id="login-password" autocomplete="current-password"></label>
          <button type="submit" class="primary" id="login-password-btn">Entrar</button>
          <a href="#" class="hint" id="login-forgot" style="display:block;margin-top:8px">¿Olvidaste tu contraseña?</a>
          <div id="login-result" aria-live="polite"></div>
        </form>
        <button type="button" class="ghost-btn waitlist-toggle" id="waitlist-toggle">¿Sin cuenta? Únete a la lista de espera</button>
        <form class="entry-fields" id="waitlist-form" novalidate>
          <p class="waitlist-intro">Torq es por invitación. Déjanos tu correo y te escribimos en cuanto haya lugar.</p>
          <label>Correo<input type="email" id="waitlist-email" placeholder="tucorreo@ejemplo.com" autocomplete="email"></label>
          <label>Nombre <span class="hint">(opcional)</span><input type="text" id="waitlist-name" maxlength="80" autocomplete="given-name"></label>
          <label>¿Qué ruedas? <span class="hint">(opcional)</span>
            <select id="waitlist-discipline">
              <option value="">—</option>
              <option value="road">Ruta</option>
              <option value="mountain">Montaña / XC</option>
              <option value="gravel">Gravel</option>
              <option value="other">Otra</option>
            </select>
          </label>
          <button type="submit" class="primary" id="waitlist-btn">Apuntarme</button>
          <div id="waitlist-result" aria-live="polite"></div>
        </form>
      </div>
      <button type="button" class="music-toggle" id="music-toggle" title="Still Corners – The Trip (click para reproducir)">🔇</button>
      <button type="button" class="hero-toggle" id="hero-toggle" title="Cambiar apariencia">${appState.settings.heroCharacter === 'woman' ? '🚴‍♀️' : '🚴‍♂️'}</button>
      <div class="track-credit">🎵 "The Trip" — Still Corners</div>
    </div>
  `;

  container.querySelector('#hero-toggle')?.addEventListener('click', () => {
    appState.settings = { ...appState.settings, heroCharacter: appState.settings.heroCharacter === 'woman' ? 'man' : 'woman' };
    appState.persistSettings();
    renderLoginGate(container, client);
  });

  const pill = container.querySelector<HTMLElement>('.entry-pill')!;
  const toggleBtn = container.querySelector<HTMLButtonElement>('#entry-toggle')!;
  const fields = container.querySelector<HTMLElement>('#entry-fields')!;
  const musicToggle = container.querySelector<HTMLButtonElement>('#music-toggle')!;

  const waitlistToggle = container.querySelector<HTMLButtonElement>('#waitlist-toggle')!;
  const waitlistForm = container.querySelector<HTMLFormElement>('#waitlist-form')!;
  /** Muestra el login o la lista de espera (uno a la vez). */
  const show = (which: 'login' | 'waitlist') => {
    pill.classList.add('active');
    fields.classList.toggle('open', which === 'login');
    waitlistForm.classList.toggle('open', which === 'waitlist');
    toggleBtn.hidden = which === 'login';
    toggleBtn.textContent = which === 'waitlist' ? 'Ya tengo cuenta: entrar' : 'Entrar';
    waitlistToggle.hidden = which === 'waitlist';
    container.querySelector<HTMLInputElement>(which === 'login' ? '#login-email' : '#waitlist-email')?.focus();
  };
  toggleBtn.addEventListener('click', () => show('login'));
  waitlistToggle.addEventListener('click', () => show('waitlist'));
  waitlistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = container.querySelector<HTMLElement>('#waitlist-result')!;
    const btn = container.querySelector<HTMLButtonElement>('#waitlist-btn')!;
    btn.disabled = true;
    resultEl.innerHTML = '<p class="hint">Enviando…</p>';
    const res = await joinWaitlist(
      container.querySelector<HTMLInputElement>('#waitlist-email')!.value,
      container.querySelector<HTMLInputElement>('#waitlist-name')!.value,
      container.querySelector<HTMLSelectElement>('#waitlist-discipline')!.value,
    );
    btn.disabled = false;
    if (res === 'ok') {
      waitlistForm.querySelectorAll('label, #waitlist-btn, .waitlist-intro').forEach((el) => ((el as HTMLElement).hidden = true));
      resultEl.innerHTML = '<p class="waitlist-done">Listo, ya estás en la lista. Te escribimos a ese correo cuando haya lugar.</p>';
    } else {
      resultEl.innerHTML = `<div class="error-box">${res === 'invalid_email' ? 'Revisa tu correo: parece que le falta algo.' : 'No se pudo guardar. Intenta de nuevo en un momento.'}</div>`;
    }
  });

  // control de música totalmente aparte del login: nadie debería tener que
  // escucharla si no quiere, así que arranca solo si tocas este ícono. El
  // texto del ícono sigue el estado real del player (no lo que asumimos),
  // para no decir "sonando" si YouTube se quedó pegado en buffering.
  subscribeAmbientState((isPlaying) => {
    musicToggle.textContent = isPlaying ? '🔈' : '🔇';
  });
  musicToggle.addEventListener('click', () => {
    void toggleAmbientTrack();
  });

  container.querySelector('#login-forgot')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const resultEl = container.querySelector<HTMLElement>('#login-result')!;
    const email = container.querySelector<HTMLInputElement>('#login-email')!.value.trim();
    if (!email) {
      resultEl.innerHTML = '<div class="error-box">Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?».</div>';
      return;
    }
    resultEl.innerHTML = '<p class="hint">Enviando…</p>';
    const error = await requestPasswordReset(email);
    resultEl.innerHTML = error
      ? `<div class="error-box">${error}</div>`
      : '<p class="hint">Si ese correo tiene cuenta, te llegó un link para poner una contraseña nueva. Ábrelo en este mismo navegador.</p>';
  });

  // <form>: Enter en cualquier campo también entra, como en cualquier login.
  fields.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = container.querySelector<HTMLInputElement>('#login-email')!;
    const passwordInput = container.querySelector<HTMLInputElement>('#login-password')!;
    const resultEl = container.querySelector<HTMLElement>('#login-result')!;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      resultEl.innerHTML = '<div class="error-box">Escribe correo y contraseña.</div>';
      return;
    }
    resultEl.innerHTML = '<p class="hint">Entrando…</p>';
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) resultEl.innerHTML = `<div class="error-box">${loginErrorText(error)}</div>`;
    // si no hay error, el refresh global (appState.onAuthChange) ya se
    // encarga de mostrar la app — no hace falta repintar acá.
  });
}

/** `#/login` queda solo para iniciar sesión (ver TORQ_DESIGN.md) — todo lo
 * demás que antes vivía acá (apariencia, contraseña, Strava) se movió a
 * Perfil. Si ya hay sesión (o no hay nube configurada, así que no hay nada
 * que iniciar) esto solo manda a Inicio. */
export function renderLogin(container: HTMLElement): (() => void) | void {
  if (!isSupabaseConfigured() || !supabase) {
    navigate('home');
    return;
  }
  if (appState.user) {
    navigate('home');
    return;
  }
  renderLoginGate(container, supabase);
}
