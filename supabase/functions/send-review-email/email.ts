// Correo del reporte mensual (vista del coach, paso 7c). Sin imports a
// propósito: Deno lo usa en la función y vitest lo prueba desde src/.
// HTML de correo "a la antigua" (tablas y estilos en línea) porque Gmail y
// Outlook ignoran <style> y no muestran SVG: por eso el correo es un
// resumen y el botón lleva al reporte completo en la app.

export interface EmailKpi {
  label: string;
  value: string;
  delta: string;
}

export interface ReviewEmailData {
  athleteName: string;
  coachName: string;
  monthKey: string; // "2026-09"
  verdict: 'on_track' | 'attention' | 'off_track' | null;
  message: string;
  findings: { tone: 'good' | 'warn' | 'bad'; title: string; body: string }[];
  goals: { title: string; detail: string }[];
  kpis: EmailKpi[];
  reviewUrl: string;
  /** Modo de prueba: a quién le habría llegado. */
  testIntendedFor?: string | null;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const VERDICTS = {
  on_track: { label: 'Mes bien encaminado', color: '#149a62' },
  attention: { label: 'Hay que ajustar algunas cosas', color: '#c98a00' },
  off_track: { label: 'Mes complicado', color: '#c8372d' },
} as const;
const TONES = { good: { icon: '✓', color: '#149a62' }, warn: { icon: '!', color: '#c98a00' }, bad: { icon: '!', color: '#c8372d' } } as const;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function monthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const name = MONTHS[m - 1] ?? monthKey;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

function paragraphs(text: string, style: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export function buildReviewEmail(d: ReviewEmailData): { subject: string; html: string; text: string } {
  const month = monthTitle(d.monthKey);
  const subject = `Tu reporte de ${month.toLowerCase()} · ${d.coachName}`;
  const verdict = d.verdict ? VERDICTS[d.verdict] : null;

  const kpiCells = d.kpis
    .map(
      (k) => `<td width="${Math.floor(100 / Math.min(3, d.kpis.length))}%" valign="top" style="padding:12px 14px;border:1px solid #e3e6eb;${FONT}">
        <div style="font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#6b7380;">${escapeHtml(k.label)}</div>
        <div style="font-size:24px;font-weight:600;color:#0f1115;line-height:1.2;margin-top:2px;">${escapeHtml(k.value)}</div>
        <div style="font-size:12px;color:#6b7380;">${escapeHtml(k.delta)}</div>
      </td>`,
    );
  const kpiRows: string[] = [];
  for (let i = 0; i < kpiCells.length; i += 3) kpiRows.push(`<tr>${kpiCells.slice(i, i + 3).join('')}</tr>`);

  const section = (title: string, body: string) =>
    body
      ? `<tr><td style="padding:26px 32px 0;${FONT}">
          <div style="font-size:18px;font-weight:600;color:#0f1115;border-bottom:1px solid #e3e6eb;padding-bottom:6px;margin-bottom:12px;">${title}</div>
          ${body}
        </td></tr>`
      : '';

  const findings = d.findings
    .map((f) => {
      const t = TONES[f.tone] ?? TONES.warn;
      return `<tr>
        <td width="30" valign="top" style="padding:0 0 10px;"><div style="width:22px;height:22px;border-radius:11px;background:${t.color};color:#ffffff;font-size:12px;font-weight:700;line-height:22px;text-align:center;${FONT}">${t.icon}</div></td>
        <td valign="top" style="padding:1px 0 10px;font-size:14px;line-height:1.45;color:#3c424d;${FONT}">${f.title ? `<strong style="color:#0f1115;">${escapeHtml(f.title)}</strong> ` : ''}${escapeHtml(f.body)}</td>
      </tr>`;
    })
    .join('');

  const goals = d.goals
    .map(
      (g, i) => `<tr>
        <td width="30" valign="top" style="padding:0 0 10px;font-size:22px;font-weight:700;color:#2f6fe0;line-height:1;${FONT}">${i + 1}</td>
        <td valign="top" style="padding:0 0 10px;font-size:14px;line-height:1.45;color:#0f1115;${FONT}"><strong>${escapeHtml(g.title)}</strong>${g.detail ? `<br><span style="color:#6b7380;font-size:13px;">${escapeHtml(g.detail)}</span>` : ''}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#e9ebef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9ebef;"><tr><td align="center" style="padding:24px 12px;">
  ${
    d.testIntendedFor
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;"><tr><td style="padding:10px 14px;margin-bottom:10px;background:#fff8e6;border:1px solid #c98a00;border-radius:6px;font-size:13px;color:#7a5600;${FONT}">Modo de prueba: este correo iba para <strong>${escapeHtml(d.testIntendedFor)}</strong>. Solo tú lo recibes mientras esté en prueba.</td></tr><tr><td height="10"></td></tr></table>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:6px;">
    <tr><td style="padding:28px 32px 16px;border-bottom:2px solid #0f1115;${FONT}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="${FONT}"><div style="font-size:22px;font-weight:700;letter-spacing:.06em;color:#0f1115;">TORQ</div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7380;">Reporte de entrenamiento</div></td>
        <td align="right" style="font-size:13px;color:#3c424d;${FONT}">${escapeHtml(d.athleteName)}<br>Coach: ${escapeHtml(d.coachName)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 32px 0;${FONT}">
      <div style="font-size:30px;font-weight:700;color:#0f1115;line-height:1.1;">Reporte mensual · ${escapeHtml(month)}</div>
      ${verdict ? `<div style="margin-top:12px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${verdict.color};">● ${verdict.label}</div>` : ''}
    </td></tr>
    <tr><td style="padding:16px 32px 0;${FONT}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="4" style="background:#2f6fe0;border-radius:2px;"></td>
        <td style="padding-left:16px;${FONT}">
          <div style="font-size:17px;font-weight:600;color:#0f1115;margin-bottom:6px;">Mensaje de tu coach</div>
          ${paragraphs(d.message, `margin:0 0 10px;font-size:15px;line-height:1.5;color:#3c424d;${FONT}`)}
          <div style="font-size:13px;color:#6b7380;">— ${escapeHtml(d.coachName)}</div>
        </td>
      </tr></table>
    </td></tr>
    ${section('Tu mes en números', kpiRows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${kpiRows.join('')}</table>` : '')}
    ${section('Lo que muestran los datos', findings ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${findings}</table>` : '')}
    ${section('Enfoque para el próximo mes', goals ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${goals}</table>` : '')}
    <tr><td align="center" style="padding:28px 32px 8px;${FONT}">
      <a href="${escapeHtml(d.reviewUrl)}" style="display:inline-block;padding:13px 26px;background:#0f1115;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;${FONT}">Ver reporte completo</a>
      <div style="font-size:12px;color:#6b7380;margin-top:8px;">Gráficas de fitness y forma, cumplimiento, mejores potencias y más.</div>
    </td></tr>
    <tr><td style="padding:18px 32px 26px;border-top:1px solid #e3e6eb;font-size:11px;line-height:1.5;color:#6b7380;${FONT}">
      Recibes este correo porque ${escapeHtml(d.coachName)} publicó tu revisión mensual en Torq. Si respondes, le llega a tu coach. Las actividades de Strava no se incluyen.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    `TORQ · Reporte mensual · ${month}`,
    verdict ? verdict.label : '',
    d.testIntendedFor ? `(Modo de prueba: este correo iba para ${d.testIntendedFor})` : '',
    '',
    d.message.trim(),
    `— ${d.coachName}`,
    '',
    d.kpis.length ? 'Tu mes en números' : '',
    ...d.kpis.map((k) => `- ${k.label}: ${k.value} (${k.delta})`),
    '',
    d.findings.length ? 'Lo que muestran los datos' : '',
    ...d.findings.map((f) => `- ${f.title} ${f.body}`.trim()),
    '',
    d.goals.length ? 'Enfoque para el próximo mes' : '',
    ...d.goals.map((g, i) => `${i + 1}. ${g.title}${g.detail ? ` — ${g.detail}` : ''}`),
    '',
    `Ver reporte completo: ${d.reviewUrl}`,
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');

  return { subject, html, text };
}

/** Valida y recorta los números que manda el cliente (ya formateados). */
export function cleanKpis(raw: unknown): EmailKpi[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((k): k is Record<string, unknown> => !!k && typeof k === 'object')
    .map((k) => ({ label: String(k.label ?? '').slice(0, 30), value: String(k.value ?? '').slice(0, 20), delta: String(k.delta ?? '').slice(0, 40) }))
    .filter((k) => k.label && k.value)
    .slice(0, 6);
}
