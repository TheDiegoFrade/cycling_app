// Envío de correo con Resend (secreto RESEND_API_KEY). Lo usan coach-chat
// (carta del plan y evaluación semanal) y puede usarlo send-review-email.

/**
 * Modo de prueba: mientras no sea null, TODO correo llega aquí (con "[Prueba]"
 * en el asunto) en vez de al atleta. Apagado: el dominio mail.ridetorq.app
 * está verificado en Resend y REPORT_EMAIL_FROM es coach@mail.ridetorq.app.
 */
export const EMAIL_TEST_RECIPIENT: string | null = null;

const DEFAULT_FROM = 'Torq <onboarding@resend.dev>';
export const DEFAULT_APP_URL = 'https://cycling-app.dpcfrade.workers.dev';

export function appUrl(): string {
  return (Deno.env.get('APP_URL') ?? DEFAULT_APP_URL).replace(/\/+$/, '');
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[]; // content en base64
}

/** Manda un correo. Nunca lanza: regresa el error para que el llamador lo registre. */
export async function sendEmail(e: OutgoingEmail): Promise<{ ok: true; sentTo: string } | { ok: false; error: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { ok: false, error: 'falta configurar RESEND_API_KEY en Supabase' };
  const to = EMAIL_TEST_RECIPIENT ?? e.to;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('REPORT_EMAIL_FROM') ?? DEFAULT_FROM,
        to: [to],
        subject: EMAIL_TEST_RECIPIENT ? `[Prueba] ${e.subject}` : e.subject,
        html: e.html,
        text: e.text,
        ...(e.replyTo ? { reply_to: e.replyTo } : {}),
        ...(e.attachments?.length ? { attachments: e.attachments } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: `Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true, sentTo: to };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
