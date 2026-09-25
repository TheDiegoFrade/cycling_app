import { isSupabaseConfigured, supabase } from '../../supabase/client';
import { disconnectStrava, getStravaConnection, isStravaConfigured, redirectToStravaAuthorize } from '../../sync/strava';
import type { StravaConnection } from '../../sync/strava';
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
  let stravaConnection: StravaConnection | null | 'loading' = appState.user ? 'loading' : null;

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
          <p class="hint">Créala (o cámbiala) cuando quieras.</p>
          <div class="panel">
            <label>Nueva contraseña<input type="password" id="set-password" placeholder="mínimo 6 caracteres"></label>
            <div class="row-actions" style="margin-top:10px">
              <button id="set-password-btn">Guardar contraseña</button>
            </div>
            <div id="password-result"></div>
          </div>

          ${
            isStravaConfigured()
              ? `
          <h2>Strava</h2>
          <div class="panel">
            ${
              stravaConnection === 'loading'
                ? '<p class="hint">Verificando…</p>'
                : stravaConnection
                  ? `
                <p class="hint">Conectado como <b>${stravaConnection.athleteName ?? `atleta #${stravaConnection.athleteId}`}</b>. Puedes subir tus sesiones de Torq e importar tus rodadas de afuera.</p>
                <div class="row-actions"><button id="strava-disconnect">Desconectar Strava</button></div>`
                  : `
                <p class="hint">Conecta tu cuenta de Strava para subir tus sesiones e importar tus rodadas grabadas con otro dispositivo.</p>
                <div class="row-actions"><button class="primary" id="strava-connect">Conectar con Strava</button></div>`
            }
            <div id="strava-result"></div>
          </div>`
              : ''
          }`
            : `
          <p class="hint">Solo entran correos invitados por el administrador. Si olvidaste tu contraseña, pídele que te la restablezca.</p>
          <div class="panel">
            <label>Correo<input type="email" id="login-email" placeholder="tucorreo@ejemplo.com"></label>
            <label>Contraseña<input type="password" id="login-password"></label>
            <div class="row-actions" style="margin-top:10px">
              <button class="primary" id="login-password-btn">Entrar</button>
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
      resultEl.innerHTML = error ? `<div class="error-box">${error.message}</div>` : '<p class="hint">Listo.</p>';
      if (!error) passwordInput.value = '';
    });

    container.querySelector('#login-password-btn')?.addEventListener('click', async () => {
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
      if (error) resultEl.innerHTML = `<div class="error-box">${error.message}</div>`;
      // si no hay error, el refresh global (appState.onAuthChange) ya se
      // encarga de mostrar la app — no hace falta repintar acá.
    });

    container.querySelector('#strava-connect')?.addEventListener('click', () => {
      redirectToStravaAuthorize();
    });

    container.querySelector('#strava-disconnect')?.addEventListener('click', async () => {
      const resultEl = container.querySelector<HTMLElement>('#strava-result')!;
      resultEl.innerHTML = '<p class="hint">Desconectando…</p>';
      try {
        await disconnectStrava();
        stravaConnection = null;
        paint();
      } catch (err) {
        resultEl.innerHTML = `<div class="error-box">${err instanceof Error ? err.message : String(err)}</div>`;
      }
    });
  }

  async function loadStravaConnection(): Promise<void> {
    if (!appState.user || !isStravaConfigured()) return;
    stravaConnection = await getStravaConnection(appState.user.id);
    paint();
  }

  // sin suscripción propia a onAuthStateChange: el refresh global (ver
  // main.ts / appState.onAuthChange) ya vuelve a montar esta pantalla
  // completa cuando cambia el login, evitando una doble suscripción/repintado.
  paint();
  void loadStravaConnection();
}
