// Ser coach en Torq: solo por invitación y con solicitud aprobada. Nadie se
// registra como coach ni se vuelve coach desde la app (profiles.is_coach lo
// protege un trigger; ver supabase/schema.sql, coach_applications).
//  - admin_invite / admin_list / admin_review / admin_revoke (solo
//    administradores, ADMIN_USER_IDS): invitar por correo, ver solicitudes y
//    coaches, aprobar con un máximo de atletas, rechazar o quitar el permiso.
//  - preview / submit (con sesión): quien recibió la invitación la abre con
//    la cuenta de ESE correo y llena la solicitud.
// Al aprobar se enciende is_coach (con la service role). Al quitar el permiso
// se terminan sus vínculos: sus atletas dejan de ver al coach y de tener la
// IA incluida.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { ADMIN_USER_IDS } from '../_shared/coach-access.ts';
import { appUrl as appUrlFromEnv, sendEmail } from '../_shared/mailer.ts';
import { clampMaxAthletes, normalizeCoachApplication, validateCoachApplication } from '../_shared/core.gen.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INVITE_DAYS = 14;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 32 bytes al azar en base64url (43 caracteres), como los links de coach. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const userId = await getUserId(req).catch(() => null);
    if (!userId) return json({ error: 'sin sesión' }, 401);

    if (action === 'preview' || action === 'submit') {
      const token = String(body?.token ?? '');
      const { data: app } = await admin
        .from('coach_applications')
        .select('id, email, status, expires_at, user_id, answers')
        .eq('token_hash', await sha256Hex(token))
        .maybeSingle();
      if (!app) return json({ status: 'invalid' });
      const { data: u } = await admin.auth.admin.getUserById(userId);
      const myEmail = (u?.user?.email ?? '').toLowerCase();
      // La invitación es para un correo: no se puede pasar a otra cuenta.
      if (app.email.toLowerCase() !== myEmail || (app.user_id && app.user_id !== userId)) {
        return json({ status: 'wrong_email', email: app.email.replace(/^(.).*(@.*)$/, '$1•••$2') });
      }
      const expired = app.status === 'invited' && new Date(app.expires_at) <= new Date();
      if (action === 'preview') return json({ status: expired ? 'expired' : app.status, answers: app.answers ?? null });

      // submit: se puede mandar o corregir mientras nadie la ha revisado.
      if (expired) return json({ error: 'expired' }, 400);
      if (app.status !== 'invited' && app.status !== 'submitted') return json({ error: 'already_reviewed' }, 409);
      const answers = normalizeCoachApplication(body?.answers ?? {});
      const errors = validateCoachApplication(answers);
      if (Object.keys(errors).length) return json({ error: 'invalid', errors }, 400);
      const { error } = await admin
        .from('coach_applications')
        .update({ user_id: userId, status: 'submitted', answers, submitted_at: new Date().toISOString() })
        .eq('id', app.id);
      if (error) throw error;
      return json({ ok: true, status: 'submitted' });
    }

    // Lo demás es solo para administradores.
    if (!ADMIN_USER_IDS.has(userId)) return json({ error: 'forbidden' }, 403);

    if (action === 'admin_invite') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);
      const token = newToken();
      const { error } = await admin.from('coach_applications').insert({
        email,
        token_hash: await sha256Hex(token),
        invited_by: userId,
        expires_at: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(),
        max_athletes: clampMaxAthletes(body?.maxAthletes),
      });
      if (error) throw error;
      const appUrl = appUrlFromEnv();
      const link = `${appUrl}/#/coach-apply/${token}`;
      // Sin cuenta: el correo de invitación de Supabase (crea la cuenta y
      // sigue a la solicitud). Con cuenta: un correo con el link.
      const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl}/?signup=1&next=${encodeURIComponent(`coach-apply.${token}`)}`,
      });
      let emailed = !invErr;
      if (invErr) {
        if (!/already|registered|exists/i.test(invErr.message)) throw invErr;
        const sent = await sendEmail({
          to: email,
          subject: 'Te invitamos a ser coach en Torq',
          text: `Te invitamos a ser coach en Torq. Entra con tu cuenta (${email}) y llena tu solicitud: ${link}\nEl link vence en ${INVITE_DAYS} días.`,
          html: `<p>Te invitamos a ser coach en Torq.</p><p>Entra con tu cuenta (<b>${esc(email)}</b>) y llena tu solicitud:</p><p><a href="${esc(link)}">Llenar mi solicitud</a></p><p>El link vence en ${INVITE_DAYS} días.</p>`,
        });
        emailed = sent.ok;
        if (!sent.ok) console.error('[coach-apply] correo', sent.error);
      }
      // El link también se le muestra al administrador, por si el correo no llega.
      return json({ ok: true, link, emailed });
    }

    if (action === 'admin_list') {
      const { data: apps, error } = await admin
        .from('coach_applications')
        .select('id, email, status, invited_at, expires_at, user_id, answers, submitted_at, reviewed_at, review_note, max_athletes')
        .order('invited_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const { data: coachRows, error: cErr } = await admin.from('profiles').select('user_id, name').eq('is_coach', true);
      if (cErr) throw cErr;
      const { data: links, error: lErr } = await admin.from('coach_athletes').select('coach_id').eq('status', 'active');
      if (lErr) throw lErr;
      const coaches = await Promise.all(
        (coachRows ?? []).map(async (c) => {
          const approved = (apps ?? []).find((a) => a.user_id === c.user_id && a.status === 'approved');
          const { data: u } = await admin.auth.admin.getUserById(c.user_id);
          return {
            userId: c.user_id,
            name: c.name ?? null,
            email: u?.user?.email ?? null,
            athletes: (links ?? []).filter((l) => l.coach_id === c.user_id).length,
            maxAthletes: approved?.max_athletes ?? 20,
            viaApplication: !!approved,
          };
        }),
      );
      return json({ applications: apps ?? [], coaches });
    }

    if (action === 'admin_review') {
      const decision = body?.decision;
      if (decision !== 'approve' && decision !== 'reject') return json({ error: 'decisión inválida' }, 400);
      const { data: app } = await admin.from('coach_applications').select('id, status, user_id').eq('id', body?.id).maybeSingle();
      if (!app) return json({ error: 'not_found' }, 404);
      if (app.status !== 'submitted' || !app.user_id) return json({ error: 'not_submitted' }, 409);
      const now = new Date().toISOString();
      const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) || null : null;
      if (decision === 'approve') {
        const { error: pErr } = await admin.from('profiles').upsert({ user_id: app.user_id, is_coach: true }, { onConflict: 'user_id' });
        if (pErr) throw pErr;
      }
      const { error } = await admin
        .from('coach_applications')
        .update({
          status: decision === 'approve' ? 'approved' : 'rejected',
          reviewed_by: userId,
          reviewed_at: now,
          review_note: note,
          ...(decision === 'approve' ? { max_athletes: clampMaxAthletes(body?.maxAthletes) } : {}),
        })
        .eq('id', app.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'admin_revoke') {
      const coachId = String(body?.userId ?? '');
      if (!coachId) return json({ error: 'falta userId' }, 400);
      const now = new Date().toISOString();
      const { error: pErr } = await admin.from('profiles').update({ is_coach: false }).eq('user_id', coachId);
      if (pErr) throw pErr;
      await admin.from('coach_applications').update({ status: 'revoked', reviewed_by: userId, reviewed_at: now }).eq('user_id', coachId).eq('status', 'approved');
      const { data: ended, error: lErr } = await admin
        .from('coach_athletes')
        .update({ status: 'ended', ended_at: now })
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .select('id');
      if (lErr) throw lErr;
      // Links sin usar: ya no sirven (accept_coach_invite también lo revisa).
      await admin.from('coach_invites').delete().eq('coach_id', coachId).is('used_by', null);
      return json({ ok: true, endedLinks: (ended ?? []).length });
    }

    return json({ error: 'acción desconocida' }, 400);
  } catch (err) {
    console.error('[coach-apply]', err);
    return json({ error: 'no se pudo completar; intenta de nuevo en un momento' }, 500);
  }
});
