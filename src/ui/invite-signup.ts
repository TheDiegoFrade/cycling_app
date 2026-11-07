// Al volver del correo de invitación (lista de espera o link de coach). La
// plantilla «Invite user» de Supabase manda a
// `<app>/?signup=1&next=…&token_hash=…&type=invite` (ver
// docs/cobro-y-registro.md). Se pide la contraseña y, solo al guardarla, se
// canjea el token: si la persona cierra la ventana antes, el link del correo
// sigue sirviendo (antes se gastaba al abrirlo y quedaba sin contraseña).
// Después sigue a donde corresponda: la invitación del coach, la solicitud
// para ser coach o Inicio.
import { supabase } from '../supabase/client';
import { linkErrorText, passwordSaveErrorText } from '../core/auth-link';
import { showNotice, showPasswordModal } from './password-modal';
import { navigate } from './router';

function clearParams(): void {
  history.replaceState(null, '', location.pathname + location.hash);
}

/** A dónde ir después de crear la contraseña. */
export function nextRoute(next: string | null): { screen: 'invite' | 'coach-apply'; token: string } | { screen: 'home' } {
  const m = /^(invite|coach-apply)\.([A-Za-z0-9_-]{43})$/.exec(next ?? '');
  return m ? { screen: m[1] as 'invite' | 'coach-apply', token: m[2] } : { screen: 'home' };
}

export async function maybeCompleteSignup(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (!params.has('signup') || !supabase) return;
  const client = supabase;
  const tokenHash = params.get('token_hash');
  const next = nextRoute(params.get('next'));
  clearParams();
  if (!tokenHash || params.get('type') !== 'invite') {
    showNotice('signup-notice', 'Link incompleto', linkErrorText('invite', {}));
    return;
  }
  let verified = false;
  showPasswordModal({
    id: 'signup',
    title: 'Te damos la bienvenida a Torq',
    intro: 'Crea tu contraseña para entrar desde cualquier dispositivo.',
    submitLabel: 'Crear contraseña',
    save: async (password) => {
      // Una sola vez: si la contraseña falla (p. ej. muy débil), el token ya
      // se canjeó y hay sesión; se reintenta solo la contraseña.
      if (!verified) {
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
        if (error) return { text: linkErrorText('invite', error), fatal: true };
        verified = true;
      }
      const { error } = await client.auth.updateUser({ password });
      return error ? { text: passwordSaveErrorText(error) } : null;
    },
    onDone: () => (next.screen === 'home' ? navigate('home') : navigate(next.screen, next.token)),
  });
}
