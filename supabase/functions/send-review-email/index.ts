// Envía por correo una revisión mensual YA publicada (vista del coach, paso
// 7c), con Resend. Solo la puede pedir el coach de esa revisión, con vínculo
// activo con el atleta. El contenido sale de la base (monthly_reviews), no
// del cliente; lo único que manda el cliente son los números del resumen ya
// formateados (los mismos que ve en pantalla), validados y recortados.
//
// Variables de entorno (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY      obligatoria
//   REPORT_EMAIL_FROM   remitente, p. ej. "Torq <reportes@tudominio.com>"
//                       (por defecto el de pruebas de Resend)
//   APP_URL             URL de la app para el botón "Ver reporte completo"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { buildReviewEmail, cleanKpis } from './email.ts';

// MODO DE PRUEBA: mientras esto tenga un correo, TODOS los reportes llegan
// solo ahí (con un aviso de a quién iban) y ningún atleta recibe nada.
// Ponerlo en null es la forma de empezar a enviarlos a los atletas.
const TEST_RECIPIENT: string | null = 'dpcfrade@gmail.com';

// Evita reenvíos por doble clic o por accidente.
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

const DEFAULT_FROM = 'Torq <onboarding@resend.dev>';
const DEFAULT_APP_URL = 'https://cycling-app.dpcfrade.workers.dev';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // El coach SIEMPRE sale del JWT, nunca del body.
    const userId = await getUserId(req);
    const body = (await req.json()) as { reviewId?: unknown; kpis?: unknown };
    const reviewId = typeof body?.reviewId === 'string' && UUID.test(body.reviewId) ? body.reviewId : null;
    if (!reviewId) return json({ error: 'falta reviewId' }, 400);

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) return json({ error: 'falta configurar RESEND_API_KEY en Supabase' }, 500);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: review } = await admin
      .from('monthly_reviews')
      .select('id, athlete_id, coach_id, month, status, verdict, coach_message, findings, goals, coach_name, emailed_at')
      .eq('id', reviewId)
      .eq('coach_id', userId)
      .maybeSingle();
    if (!review) return json({ error: 'revisión no encontrada' }, 404);
    if (review.status !== 'published') return json({ error: 'primero publica la revisión' }, 409);

    const { data: link } = await admin
      .from('coach_athletes')
      .select('id')
      .eq('coach_id', userId)
      .eq('athlete_id', review.athlete_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) return json({ error: 'ese atleta ya no está vinculado contigo' }, 403);

    if (review.emailed_at && Date.now() - Date.parse(review.emailed_at) < RESEND_COOLDOWN_MS) {
      return json({ error: 'ya se envió hace unos minutos; espera un poco para reenviarla' }, 429);
    }

    const [{ data: athleteUser }, { data: coachUser }, { data: athleteProfile }] = await Promise.all([
      admin.auth.admin.getUserById(review.athlete_id),
      admin.auth.admin.getUserById(userId),
      admin.from('profiles').select('name').eq('user_id', review.athlete_id).maybeSingle(),
    ]);
    const athleteEmail = athleteUser?.user?.email ?? null;
    if (!athleteEmail) return json({ error: 'el atleta no tiene correo registrado' }, 422);
    const to = TEST_RECIPIENT ?? athleteEmail;

    const monthKey = String(review.month).slice(0, 7);
    const appUrl = (Deno.env.get('APP_URL') ?? DEFAULT_APP_URL).replace(/\/+$/, '');
    const email = buildReviewEmail({
      athleteName: athleteProfile?.name || athleteEmail.split('@')[0],
      coachName: review.coach_name || 'Tu coach',
      monthKey,
      verdict: review.verdict,
      message: review.coach_message ?? '',
      findings: Array.isArray(review.findings) ? review.findings : [],
      goals: Array.isArray(review.goals) ? review.goals : [],
      kpis: cleanKpis(body.kpis),
      reviewUrl: `${appUrl}/#/review/${monthKey}`,
      testIntendedFor: TEST_RECIPIENT ? athleteEmail : null,
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('REPORT_EMAIL_FROM') ?? DEFAULT_FROM,
        to: [to],
        subject: TEST_RECIPIENT ? `[Prueba] ${email.subject}` : email.subject,
        html: email.html,
        text: email.text,
        // si el atleta responde, le llega a su coach
        ...(coachUser?.user?.email ? { reply_to: coachUser.user.email } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `el servicio de correo respondió ${res.status}: ${detail.slice(0, 300)}` }, 502);
    }

    const emailedAt = new Date().toISOString();
    await admin.from('monthly_reviews').update({ emailed_at: emailedAt }).eq('id', review.id);
    // el correo del atleta no se le regresa al coach
    return json({ test: TEST_RECIPIENT !== null, sentTo: TEST_RECIPIENT ?? 'atleta', emailedAt });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
