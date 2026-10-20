// Al volver del correo de invitación (lista de espera o link de coach). La
// plantilla «Invite user» de Supabase manda a
// `<app>/?signup=1&next=…&token_hash=…&type=invite` (ver
// docs/cobro-y-registro.md). Se canjea el token, se pide la contraseña y se
// sigue a donde corresponda: la invitación del coach o Inicio.
import { supabase } from '../supabase/client';
import { navigate } from './router';

function clearParams(): void {
  history.replaceState(null, '', location.pathname + location.hash);
}

/** A dónde ir después de crear la contraseña. */
export function nextRoute(next: string | null): { screen: 'invite'; token: string } | { screen: 'home' } {
  const m = /^invite\.([A-Za-z0-9_-]{43})$/.exec(next ?? '');
  return m ? { screen: 'invite', token: m[1] } : { screen: 'home' };
}

export async function maybeCompleteSignup(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (!params.has('signup') || !supabase) return;
  const client = supabase;
  const tokenHash = params.get('token_hash');
  const next = nextRoute(params.get('next'));
  clearParams();
  if (!tokenHash || params.get('type') !== 'invite') return;
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
  if (error) {
    window.alert('Este link de invitación ya se usó o venció. Si ya creaste tu contraseña, entra con ella; si no, pide otra invitación.');
    return;
  }
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="modal-backdrop" id="signup-backdrop">
      <form class="panel" id="signup-form" style="max-width:380px;margin:auto" novalidate>
        <h2 class="perfil-h2" style="margin:0 0 8px">Te damos la bienvenida a Torq</h2>
        <p class="hint" style="margin:0 0 10px">Crea tu contraseña para entrar desde cualquier dispositivo.</p>
        <label class="live-col-label">Contraseña<input type="password" id="signup-pw-1" autocomplete="new-password" style="width:100%"></label>
        <label class="live-col-label" style="margin-top:8px;display:block">Repítela<input type="password" id="signup-pw-2" autocomplete="new-password" style="width:100%"></label>
        <button class="primary" type="submit" style="margin-top:12px">Crear contraseña</button>
        <p class="hint" id="signup-status" aria-live="polite" style="margin-top:8px"></p>
      </form>
    </div>`,
  );
  const form = document.getElementById('signup-form') as HTMLFormElement;
  const status = form.querySelector<HTMLElement>('#signup-status')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = form.querySelector<HTMLInputElement>('#signup-pw-1')!.value;
    const b = form.querySelector<HTMLInputElement>('#signup-pw-2')!.value;
    if (a.length < 8) return void (status.textContent = 'Usa al menos 8 caracteres.');
    if (a !== b) return void (status.textContent = 'Las dos no coinciden.');
    status.textContent = 'Guardando…';
    const { error: pwError } = await client.auth.updateUser({ password: a });
    if (pwError) return void (status.textContent = 'No se pudo guardar. Intenta con otra contraseña.');
    document.getElementById('signup-backdrop')?.remove();
    if (next.screen === 'invite') navigate('invite', next.token);
    else navigate('home');
  });
}
