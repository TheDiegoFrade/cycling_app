import { isSupabaseConfigured, supabase } from '../../supabase/client';
import { disconnectStrava, getStravaConnection, isStravaConfigured, redirectToStravaAuthorize } from '../../sync/strava';
import type { StravaConnection } from '../../sync/strava';
import { startAmbientTrack, toggleAmbientTrack } from '../ambient-audio';
import { renderNav } from '../nav';
import { appState } from '../state';

function renderLoginGate(container: HTMLElement, client: NonNullable<typeof supabase>): void {
  container.innerHTML = `
    <div class="hero" style="min-height:100vh">
      <div class="entry-pill">
        <div class="brand">🚴 <span>TORQ</span></div>
        <div class="tag">Entrena sin mirar la pantalla.</div>
        <button type="button" class="ghost-btn" id="entry-toggle">Entrar</button>
        <div class="entry-fields" id="entry-fields">
          <label>Correo<input type="email" id="login-email" placeholder="tucorreo@ejemplo.com"></label>
          <label>Contraseña<input type="password" id="login-password"></label>
          <button class="primary" id="login-password-btn">Entrar</button>
          <div id="login-result"></div>
        </div>
      </div>
      <button type="button" class="music-toggle" id="music-toggle" title="Still Corners – The Trip" hidden>🔈</button>
    </div>
  `;

  const pill = container.querySelector<HTMLElement>('.entry-pill')!;
  const toggleBtn = container.querySelector<HTMLButtonElement>('#entry-toggle')!;
  const fields = container.querySelector<HTMLElement>('#entry-fields')!;
  const musicToggle = container.querySelector<HTMLButtonElement>('#music-toggle')!;

  toggleBtn.addEventListener('click', () => {
    pill.classList.add('active');
    fields.classList.add('open');
    toggleBtn.hidden = true;
    container.querySelector<HTMLInputElement>('#login-email')?.focus();
    void startAmbientTrack()
      .then(() => {
        musicToggle.hidden = false;
      })
      .catch(() => {
        // si el navegador bloquea el autoplay, el usuario igual puede
        // entrar sin música — no es una función crítica.
      });
  });

  musicToggle.addEventListener('click', async () => {
    const playing = await toggleAmbientTrack();
    musicToggle.textContent = playing ? '🔈' : '🔇';
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
}

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

  if (!appState.user) {
    renderLoginGate(container, client);
    return;
  }

  let stravaConnection: StravaConnection | null | 'loading' = 'loading';

  function paint(): void {
    const user = appState.user!;
    container.innerHTML = `
      <div class="screen">
        ${renderNav('login')}
        <h1>Cuenta</h1>
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
