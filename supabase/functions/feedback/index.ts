// «Mandar comentario» desde la app: se guarda en la tabla feedback (sin el
// correo: si se borra la cuenta, queda anónimo) y llega al correo de soporte
// (secreto SUPPORT_EMAIL), con «Responder a» la persona.
// Sin SUPPORT_EMAIL se guarda igual y se avisa en el log.
//
// body: { kind, message, screen?, device? }  → la persona (su JWT)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { sendEmail } from '../_shared/mailer.ts';
import { FEEDBACK_DAILY_LIMIT, FEEDBACK_KIND_LABELS, parseFeedback } from '../_shared/core.gen.js';
import { buildFeedbackEmail } from './email.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    // core.gen.js es JS: los tipos se declaran aquí (ver src/core/feedback.ts)
    const parsed = parseFeedback(await req.json().catch(() => null)) as
      | { ok: true; value: { kind: 'problem' | 'idea' | 'like' | 'other'; message: string; screen: string | null; device: string | null } }
      | { ok: false; error: string };
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const fb = parsed.value;
    const labels = FEEDBACK_KIND_LABELS as Record<string, string>;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
    if ((count ?? 0) >= FEEDBACK_DAILY_LIMIT) return json({ error: 'Ya mandaste varios comentarios hoy. Gracias: mañana puedes mandar más.' }, 429);

    const [{ data: user }, { data: profile }, { data: plan }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from('profiles').select('name').eq('user_id', userId).maybeSingle(),
      admin.from('training_plans').select('goal').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    ]);
    const email = user?.user?.email ?? '';
    const { data: row, error } = await admin
      .from('feedback')
      .insert({ user_id: userId, kind: fb.kind, message: fb.message, screen: fb.screen, device: fb.device } as never)
      .select('id')
      .single();
    if (error) throw new Error(`no se pudo guardar: ${error.message}`);

    const to = Deno.env.get('SUPPORT_EMAIL');
    if (!to) {
      console.error('[feedback] falta SUPPORT_EMAIL: el comentario quedó guardado sin correo');
      return json({ ok: true });
    }
    const mail = buildFeedbackEmail({
      kindLabel: labels[fb.kind],
      message: fb.message,
      name: (profile as { name?: string | null } | null)?.name ?? null,
      email,
      screen: fb.screen,
      device: fb.device,
      when: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' }),
      plan: (plan as { goal?: string | null } | null)?.goal ?? null,
    });
    const sent = await sendEmail({ to, ...mail, ...(email ? { replyTo: email } : {}) });
    if (sent.ok) await admin.from('feedback').update({ emailed_at: new Date().toISOString() } as never).eq('id', (row as { id: number }).id);
    else console.error('[feedback] correo', sent.error);
    return json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, /sesi[oó]n|token|jwt/i.test(msg) ? 401 : 500);
  }
});
