// Correo al equipo cuando alguien se apunta a la lista de espera. Sin imports a
// propósito: Deno lo usa en la función y vitest lo prueba desde src/
// (src/core/waitlist-notify.test.ts).

export interface WaitlistEmailData {
  email: string;
  name: string | null;
  discipline: string | null;
  /** Hora en CDMX, ya formateada. */
  when: string;
  /** Cuántos siguen esperando invitación (incluida esta persona). */
  pending: number;
  appUrl: string;
}

const DISCIPLINES: Record<string, string> = { road: 'Ruta', mountain: 'Montaña / XC', gravel: 'Gravel', other: 'Otra' };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export function buildWaitlistEmail(d: WaitlistEmailData): { subject: string; html: string; text: string } {
  const who = d.name?.trim() || d.email;
  const subject = `[Torq] ${who} se apuntó a la lista de espera`;
  const adminUrl = `${d.appUrl}/#/admin`;
  const pendingText = d.pending === 1 ? '1 persona espera invitación' : `${d.pending} personas esperan invitación`;
  const rows: [string, string | null][] = [
    ['Correo', d.email],
    ['Nombre', d.name?.trim() || null],
    ['Rueda', d.discipline ? (DISCIPLINES[d.discipline] ?? d.discipline) : null],
    ['Cuándo', d.when],
  ];
  const details = rows.filter(([, v]) => v);
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#e9ebef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;">
  <tr><td style="padding:20px 24px 8px;${FONT}">
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7380;">Lista de espera</div>
    <div style="font-size:20px;font-weight:700;color:#0f1115;margin-top:4px;">${escapeHtml(who)} quiere entrar a Torq</div>
  </td></tr>
  <tr><td style="padding:8px 24px 4px;${FONT}">
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#3c424d;">
      ${details.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#6b7380;">${k}</td><td style="padding:3px 0;">${escapeHtml(v!)}</td></tr>`).join('')}
    </table>
    <div style="margin-top:12px;font-size:13px;color:#6b7380;">${pendingText}.</div>
  </td></tr>
  <tr><td style="padding:18px 24px 24px;${FONT}">
    <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:12px 22px;background:#0f1115;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;${FONT}">Abrir lista de espera</a>
  </td></tr>
</table>
</body></html>`;
  const text = [`${who} quiere entrar a Torq`, '', ...details.map(([k, v]) => `${k}: ${v}`), '', `${pendingText}.`, '', `Invitar: ${adminUrl}`].join('\n');
  return { subject, html, text };
}
