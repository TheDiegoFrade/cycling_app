// Registro solo con invitación. Torq no tiene registro abierto: una cuenta
// nueva nace de un correo de invitación (auth.admin.inviteUserByEmail), que
// manda alguno de estos dos caminos:
//  - waitlist_list / waitlist_invite (solo administradores): la lista de
//    espera y el botón «Invitar» de la pantalla de administración.
//  - coach_signup (sin sesión): quien abre el link de su coach y todavía no
//    tiene cuenta. Solo funciona con un link de coach vigente y sin usar.
// En los dos casos el correo trae al link de Torq, donde la persona crea su
// contraseña (ver src/ui/invite-signup.ts) y acepta los términos.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { ADMIN_USER_IDS } from '../_shared/coach-access.ts';
import { appUrl as appUrlFromEnv } from '../_shared/mailer.ts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** A dónde lleva el correo. La plantilla «Invite user» de Supabase debe ser
 * `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite` (ver
 * docs/cobro-y-registro.md): así la app canjea el token sin chocar con el
 * router por hash. `next` = a dónde ir después de crear la contraseña. */
function signupUrl(appUrl: string, next: string): string {
  return `${appUrl}/?signup=1&next=${encodeURIComponent(next)}`;
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const appUrl = appUrlFromEnv();
    const action = body?.action;

    if (action === 'coach_signup') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      const token = String(body?.token ?? '');
      if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);
      const { data: inv } = await admin
        .from('coach_invites')
        .select('id, used_by, expires_at')
        .eq('token_hash', await sha256Hex(token))
        .maybeSingle();
      if (!inv || inv.used_by || new Date(inv.expires_at) <= new Date()) return json({ error: 'invite_invalid' }, 400);
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: signupUrl(appUrl, `invite.${token}`) });
      // Si ya tiene cuenta, no se dice: se le pide entrar con su contraseña.
      if (error && !/already|registered|exists/i.test(error.message)) throw error;
      return json({ ok: true });
    }

    // Lo demás es solo para administradores.
    const userId = await getUserId(req);
    if (!ADMIN_USER_IDS.has(userId)) return json({ error: 'forbidden' }, 403);

    if (action === 'waitlist_list') {
      const { data, error } = await admin.from('waitlist').select('id, email, name, discipline, created_at, invited_at').order('created_at', { ascending: true }).limit(500);
      if (error) throw error;
      return json({ rows: data });
    }

    if (action === 'waitlist_invite') {
      const { data: row } = await admin.from('waitlist').select('id, email').eq('id', body?.id).maybeSingle();
      if (!row) return json({ error: 'not_found' }, 404);
      const { error } = await admin.auth.admin.inviteUserByEmail(row.email, { redirectTo: signupUrl(appUrl, 'home') });
      if (error && !/already|registered|exists/i.test(error.message)) throw error;
      await admin.from('waitlist').update({ invited_at: new Date().toISOString() }).eq('id', row.id);
      return json({ ok: true, alreadyHadAccount: !!error });
    }

    return json({ error: 'acción desconocida' }, 400);
  } catch (err) {
    console.error('[invite]', err);
    return json({ error: 'no se pudo completar; intenta de nuevo en un momento' }, 500);
  }
});
