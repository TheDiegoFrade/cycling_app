// Correo a soporte con un comentario de la app. Sin imports a propósito: Deno
// lo usa en la función y vitest lo prueba desde src/ (src/core/feedback.test.ts).

export interface FeedbackEmailData {
  kindLabel: string;
  message: string;
  name: string | null;
  email: string;
  screen: string | null;
  device: string | null;
  /** Hora en CDMX, ya formateada. */
  when: string;
  plan: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export function buildFeedbackEmail(d: FeedbackEmailData): { subject: string; html: string; text: string } {
  const who = d.name?.trim() || d.email;
  const preview = d.message.replace(/\s+/g, ' ').slice(0, 60);
  const subject = `[Torq] ${d.kindLabel}: ${preview}${d.message.length > 60 ? '…' : ''}`;
  const rows: [string, string | null][] = [
    ['De', `${who} <${d.email}>`],
    ['Pantalla', d.screen],
    ['Dispositivo', d.device],
    ['Plan', d.plan],
    ['Cuándo', d.when],
  ];
  const details = rows.filter(([, v]) => v);
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#e9ebef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;">
  <tr><td style="padding:20px 24px 8px;${FONT}">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7380;">Comentario desde la app</div>
    <div style="font-size:20px;font-weight:700;color:#0f1115;margin-top:4px;">${escapeHtml(d.kindLabel)}</div>
  </td></tr>
  <tr><td style="padding:8px 24px 16px;${FONT}">
    <div style="padding:14px 16px;background:#f4f6f8;border-left:4px solid #d9530b;border-radius:4px;font-size:15px;line-height:1.5;color:#1c2033;white-space:pre-wrap;">${escapeHtml(d.message)}</div>
  </td></tr>
  <tr><td style="padding:0 24px 20px;${FONT}">
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;color:#3c424d;">
      ${details.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7380;">${k}</td><td style="padding:2px 0;">${escapeHtml(v!)}</td></tr>`).join('')}
    </table>
    <div style="margin-top:12px;font-size:12px;color:#6b7380;">Responde a este correo y le llega directo a ${escapeHtml(who)}.</div>
  </td></tr>
</table>
</body></html>`;
  const text = [`${d.kindLabel}`, '', d.message, '', ...details.map(([k, v]) => `${k}: ${v}`), '', `Responde a este correo y le llega directo a ${who}.`].join('\n');
  return { subject, html, text };
}
