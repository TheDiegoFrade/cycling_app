import { isSupabaseConfigured, supabase } from '../../supabase/client';
import { renderNav } from '../nav';
import { appState } from '../state';

export function renderLogin(container: HTMLElement): (() => void) | void {
  if (!isSupabaseConfigured() || !supabase) {
    container.innerHTML = `
      <div class="screen">
        ${renderNav('login')}
        <h1>Cuenta</h1>
        <p class="hint">Este despliegue todavía no tiene la sincronización en la nube configurada. La app sigue funcionando 100% local mientras tanto.</p>
      </div>
    `;
    return;
  }

  const client = supabase;

  function paint(): void {
    const user = appState.user;
    container.innerHTML = `
      <div class="screen">
        ${renderNav('login')}
        <h1>Cuenta</h1>
        ${
          user
            ? `
          <p class="hint">Conectado como <b>${user.email}</b>. Tu historial se sincroniza solo entre dispositivos.</p>
          <div class="row-actions">
            <button id="signout">Cerrar sesión</button>
          </div>

          <h2>Contraseña</h2>
          <p class="hint">Créala (o cámbiala) para entrar directo la próxima vez, sin depender del correo.</p>
          <div class="panel">
            <label>Nueva contraseña<input type="password" id="set-password" placeholder="mínimo 6 caracteres"></label>
            <div class="row-actions" style="margin-top:10px">
              <button id="set-password-btn">Guardar contraseña</button>
            </div>
            <div id="password-result"></div>
          </div>`
            : `
          <p class="hint">Inicia sesión con tu correo. Si ya tienes contraseña, úsala; si no, te mandamos un link.</p>
          <div class="panel">
            <label>Correo<input type="email" id="login-email" placeholder="tucorreo@ejemplo.com"></label>
            <label>Contraseña (si ya la creaste)<input type="password" id="login-password" placeholder="opcional"></label>
            <p class="hint">¿Olvidaste tu contraseña? Dale a "Enviar link mágico" y haz click en el link que te llega al correo para iniciar sesión en Torq sin ella.</p>
            <div class="row-actions" style="margin-top:10px">
              <button class="primary" id="login-password-btn">Entrar con contraseña</button>
              <button id="login-send">Enviar link mágico</button>
            </div>
            <div id="login-result"></div>
          </div>`
        }
      </div>
    `;

    container.querySelector('#signout')?.addEventListener('click', async () => {
      // sin repintar acá: appState.signOut() dispara el refresh global (ver
      // main.ts), que vuelve a montar esta misma pantalla ya desconectada.
      await appState.signOut();
    });

    container.querySelector('#set-password-btn')?.addEventListener('click', async () => {
      const passwordInput = container.querySelector<HTMLInputElement>('#set-password')!;
      const resultEl = container.querySelector<HTMLElement>('#password-result')!;
      const password = passwordInput.value;
      if (!password) {
        resultEl.innerHTML = '<div class="error-box">Escribe una contraseña.</div>';
        return;
      }
      resultEl.innerHTML = '<p class="hint">Guardando…</p>';
      const { error } = await client.auth.updateUser({ password });
      resultEl.innerHTML = error
        ? `<div class="error-box">${error.message}</div>`
        : '<p class="hint">Listo — la próxima vez puedes entrar directo con correo y contraseña.</p>';
      if (!error) passwordInput.value = '';
    });

    container.querySelector('#login-password-btn')?.addEventListener('click', async () => {
      const emailInput = container.querySelector<HTMLInputElement>('#login-email')!;
      const passwordInput = container.querySelector<HTMLInputElement>('#login-password')!;
      const resultEl = container.querySelector<HTMLElement>('#login-result')!;
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        resultEl.innerHTML = '<div class="error-box">Escribe correo y contraseña, o usa el link mágico si no tienes una todavía.</div>';
        return;
      }
      resultEl.innerHTML = '<p class="hint">Entrando…</p>';
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) resultEl.innerHTML = `<div class="error-box">${error.message}</div>`;
      // si no hay error, el refresh global (appState.onAuthChange) ya se
      // encarga de mostrar la app — no hace falta repintar acá.
    });

    container.querySelector('#login-send')?.addEventListener('click', async () => {
      const emailInput = container.querySelector<HTMLInputElement>('#login-email')!;
      const resultEl = container.querySelector<HTMLElement>('#login-result')!;
      const email = emailInput.value.trim();
      if (!email) {
        resultEl.innerHTML = '<div class="error-box">Escribe tu correo.</div>';
        return;
      }
      resultEl.innerHTML = '<p class="hint">Enviando…</p>';
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname },
      });
      resultEl.innerHTML = error
        ? `<div class="error-box">${error.message}</div>`
        : '<p class="hint">Revisa tu correo y toca el link para entrar — vas a volver aquí ya conectado. Si dice que expiró, pide uno nuevo y tócalo rápido.</p>';
    });
  }

  // sin suscripción propia a onAuthStateChange: el refresh global (ver
  // main.ts / appState.onAuthChange) ya vuelve a montar esta pantalla
  // completa cuando cambia el login, evitando una doble suscripción/repintado.
  paint();
}
