// Recuperar contraseña. Antes no había forma: el login solo aceptaba
// contraseña y el link de recuperación del dashboard de Supabase (flujo
// implícito, token en el hash) chocaba con el router por hash y mandaba al
// login. Ahora: "¿Olvidaste tu contraseña?" manda el correo con
// resetPasswordForEmail; el link vuelve a la app con `?reset=1&code=…`
// (PKCE, como pide supabase/client.ts), supabase-js canjea el code al
// arrancar y aquí se pide la contraseña nueva.
import { supabase } from '../supabase/client';
import { appState } from './state';
import { escapeHtml } from './workout-cover';

const RESET_PARAM = 'reset';

/** Manda el correo de recuperación. Regresa el error (texto) o null. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return 'la nube no está configurada';
  const redirectTo = `${location.origin}${location.pathname}?${RESET_PARAM}=1`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return error ? error.message : null;
}

/** ¿Venimos del link de recuperación? (lo usa también handleStravaRedirect
 * para no confundir el `?code=` de Supabase con el de Strava). */
export function isPasswordResetReturn(): boolean {
  return new URLSearchParams(location.search).has(RESET_PARAM);
}

function clearResetParams(): void {
  history.replaceState(null, '', location.pathname + location.hash);
}

/** Si la app abrió desde el link de recuperación y ya hay sesión, pide la
 * contraseña nueva. Sin sesión (link vencido o usado) avisa y deja el login. */
export function maybeShowPasswordReset(): void {
  if (!isPasswordResetReturn() || !supabase) return;
  const client = supabase;
  if (!appState.user) {
    clearResetParams();
    window.alert('El link para cambiar tu contraseña ya no es válido (vence o se usa una sola vez). Pide otro desde «¿Olvidaste tu contraseña?».');
    return;
  }
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="modal-backdrop" id="pw-reset-backdrop">
      <div class="panel" style="max-width:380px;margin:auto">
        <h2 class="perfil-h2" style="margin:0 0 8px">Nueva contraseña</h2>
        <p class="hint" style="margin:0 0 10px">Para ${escapeHtml(appState.user.email || 'tu cuenta')}.</p>
        <label class="live-col-label">Contraseña nueva<input type="password" id="pw-reset-1" autocomplete="new-password" style="width:100%"></label>
        <label class="live-col-label" style="margin-top:8px;display:block">Repítela<input type="password" id="pw-reset-2" autocomplete="new-password" style="width:100%"></label>
        <button class="primary" id="pw-reset-save" style="margin-top:12px">Guardar</button>
        <p class="hint" id="pw-reset-status" style="margin-top:8px"></p>
      </div>
    </div>`,
  );
  const backdrop = document.getElementById('pw-reset-backdrop')!;
  const status = backdrop.querySelector<HTMLElement>('#pw-reset-status')!;
  backdrop.querySelector('#pw-reset-save')?.addEventListener('click', async () => {
    const a = backdrop.querySelector<HTMLInputElement>('#pw-reset-1')!.value;
    const b = backdrop.querySelector<HTMLInputElement>('#pw-reset-2')!.value;
    if (a.length < 8) {
      status.textContent = 'Usa al menos 8 caracteres.';
      return;
    }
    if (a !== b) {
      status.textContent = 'Las dos no coinciden.';
      return;
    }
    status.textContent = 'Guardando…';
    const { error } = await client.auth.updateUser({ password: a });
    if (error) {
      status.textContent = error.message;
      return;
    }
    clearResetParams();
    backdrop.remove();
  });
}
