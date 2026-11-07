// Recuperar contraseña. "¿Olvidaste tu contraseña?" manda el correo con
// resetPasswordForEmail. La plantilla «Reset password» de Supabase manda a
// `<app>/?reset=1&token_hash=…&type=recovery` (ver docs/cobro-y-registro.md):
// la app pide la contraseña nueva y solo al guardarla canjea el token con
// verifyOtp. Así sirve en cualquier navegador o dispositivo (no depende del
// code_verifier de PKCE guardado donde se pidió) y los escáneres de links de
// Gmail/Outlook no lo gastan.
//
// Links viejos (`?reset=1&code=…`, PKCE): supabase-js canjea el code al
// arrancar; solo funcionan en el navegador donde se pidieron.
import { supabase } from '../supabase/client';
import { linkErrorText, passwordSaveErrorText, resetRequestErrorText } from '../core/auth-link';
import { showNotice, showPasswordModal } from './password-modal';
import { appState } from './state';

const RESET_PARAM = 'reset';

/** Manda el correo de recuperación. Regresa el error (texto) o null. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return 'la nube no está configurada';
  const redirectTo = `${location.origin}${location.pathname}?${RESET_PARAM}=1`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  // el mensaje de Supabase viene en inglés: a la persona, en español
  return error ? resetRequestErrorText(error) : null;
}

/** ¿Venimos del link de recuperación? (lo usa también handleStravaRedirect
 * para no confundir el `?code=` de Supabase con el de Strava). */
export function isPasswordResetReturn(): boolean {
  return new URLSearchParams(location.search).has(RESET_PARAM);
}

function clearResetParams(): void {
  history.replaceState(null, '', location.pathname + location.hash);
}

/** Si la app abrió desde el link de recuperación, pide la contraseña nueva. */
export function maybeShowPasswordReset(): void {
  if (!isPasswordResetReturn() || !supabase) return;
  const client = supabase;
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get('token_hash');
  const isNewLink = !!tokenHash && params.get('type') === 'recovery';
  clearResetParams();

  if (!isNewLink && !appState.user) {
    // Link viejo que no se pudo canjear: vencido, usado u otro navegador.
    showNotice(
      'pw-reset-notice',
      'Este link ya no sirve',
      'El link para cambiar tu contraseña venció, ya se usó o se abrió en otro navegador. Pide otro desde «¿Olvidaste tu contraseña?».',
    );
    return;
  }
  let verified = !isNewLink;
  showPasswordModal({
    id: 'pw-reset',
    title: 'Nueva contraseña',
    intro: appState.user?.email && !isNewLink ? `Para ${appState.user.email}.` : 'Escribe tu contraseña nueva para Torq.',
    submitLabel: 'Guardar',
    save: async (password) => {
      if (!verified) {
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash!, type: 'recovery' });
        if (error) return { text: linkErrorText('recovery', error), fatal: true };
        verified = true;
      }
      const { error } = await client.auth.updateUser({ password });
      return error ? { text: passwordSaveErrorText(error) } : null;
    },
    onDone: () => showNotice('pw-reset-done', 'Listo', 'Guardamos tu contraseña nueva. Úsala para entrar desde cualquier dispositivo.'),
  });
}
