// Aviso al equipo cuando alguien se apunta a la lista de espera, para no
// tardar en invitar. Lo llama el trigger `waitlist_notify` de la tabla
// waitlist (pg_net, ver supabase/schema.sql) con el header x-cron-secret =
// secreto CRON_SECRET; no recibe sesión de usuario (--no-verify-jwt).
// El correo va a SUPPORT_EMAIL (el buzón del equipo) y marca
// waitlist.notified_at para saber que salió.
//
// body: { id }  → id de la fila nueva de waitlist
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { appUrl, sendEmail, supportEmail } from '../_shared/mailer.ts';
import { buildWaitlistEmail } from './email.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'no autorizado' }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? '');
    if (!id) return json({ error: 'falta id' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: row, error } = await admin.from('waitlist').select('id, email, name, discipline, created_at, notified_at').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.notified_at) return json({ ok: true, already: true });

    const to = supportEmail();
    if (!to) {
      console.error('[waitlist-notify] falta SUPPORT_EMAIL: no hay a quién avisar');
      return json({ error: 'sin SUPPORT_EMAIL' }, 500);
    }
    const { count } = await admin.from('waitlist').select('id', { count: 'exact', head: true }).is('invited_at', null);
    const mail = buildWaitlistEmail({
      email: row.email,
      name: row.name,
      discipline: row.discipline,
      when: new Date(row.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' }),
      pending: count ?? 1,
      appUrl: appUrl(),
    });
    // «Responder a» la persona: contestar el aviso le escribe directo.
    const sent = await sendEmail({ to, ...mail, replyTo: row.email });
    if (!sent.ok) {
      console.error('[waitlist-notify] correo', sent.error);
      return json({ error: 'no se pudo mandar' }, 502);
    }
    await admin.from('waitlist').update({ notified_at: new Date().toISOString() }).eq('id', row.id);
    return json({ ok: true });
  } catch (err) {
    console.error('[waitlist-notify]', err);
    return json({ error: 'error' }, 500);
  }
});
