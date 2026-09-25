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
          </div>`
            : `
          <p class="hint">Inicia sesión con tu correo para guardar tu historial en la nube y verlo desde cualquier dispositivo. Sin contraseña — te mandamos un link.</p>
          <div class="panel">
            <label>Correo<input type="email" id="login-email" placeholder="tucorreo@ejemplo.com"></label>
            <div class="row-actions" style="margin-top:10px">
              <button class="primary" id="login-send">Enviar link mágico</button>
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
