// Correo del check-in del domingo: «cierra tu semana con el coach». Sin
// imports a propósito: Deno lo usa en la función y vitest lo prueba desde
// src/ (src/core/checkin-email.test.ts). HTML de correo "a la antigua"
// (tablas y estilos en línea) porque Gmail y Outlook ignoran <style>.

export interface CheckinEmailData {
  athleteName: string;
  /** Semana que termina (1 = la primera del plan). */
  week: number;
  /** La siguiente todavía no tiene entrenamientos: se arma al evaluar. */
  nextEmpty: boolean;
  /** Entrenamientos que tenía la semana y cuántos hizo (null = no se sabe). */
  planned: number | null;
  done: number | null;
  evalUrl: string;
  /** Modo de prueba: a quién le habría llegado. */
  testIntendedFor?: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

/** «Hiciste 3 de 4 entrenamientos» (o nada si no se sabe). */
export function checkinTally(planned: number | null, done: number | null): string {
  if (planned == null || done == null || planned <= 0) return '';
  const d = Math.min(done, planned);
  if (d === planned) return `Hiciste los ${planned} entrenamientos de la semana.`;
  if (d === 0) return `Esta semana no registraste entrenamientos (tenías ${planned}). No pasa nada: cuéntale al coach qué pasó y se ajusta.`;
  return `Hiciste ${d} de ${planned} entrenamientos.`;
}

export function buildCheckinEmail(d: CheckinEmailData): { subject: string; html: string; text: string } {
  const next = d.week + 1;
  // Semana siguiente vacía: hace falta evaluar para que exista. Ya armada:
  // es opcional, solo si algo no le late (el coach se adapta a la persona).
  const subject = d.nextEmpty ? `Arma tu semana ${next}: cuéntale al coach cómo te fue` : `Tu semana ${next} ya está lista. ¿Cómo te fue la ${d.week}?`;
  const tally = checkinTally(d.planned, d.done);
  const lead = d.nextEmpty
    ? `Terminó tu semana ${d.week}. Tu semana ${next} todavía no tiene entrenamientos: el coach la arma con lo que le cuentes.`
    : `Tu semana ${next} ya está lista. ¿Cómo te fue la semana ${d.week}? Si algo no te late (la carga, los días, cómo te sentiste), cuéntale al coach y la ajusta. Si todo va bien, no tienes que hacer nada.`;
  const tips = [
    'Dime la verdad, no hay respuesta incorrecta: si te faltó energía o ganas, con eso ajusto.',
    '¿Viajas o no tendrás bici esta semana? Dímelo en la evaluación y te pongo fuerza en casa o caminar.',
    ...(d.nextEmpty ? ['Si hoy no puedes, hazlo en cuanto puedas: cada día que pasa es un día menos para armar tu semana.'] : []),
  ];
  const footer = 'Recibes este correo porque entrenas con el coach de Torq: cada domingo te preguntamos cómo te fue la semana. Torq funciona en Google Chrome en computadora.';

  const p = (text: string, extra = '') => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#3c424d;${FONT}${extra}">${escapeHtml(text)}</p>`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#e9ebef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9ebef;"><tr><td align="center" style="padding:24px 12px;">
  ${
    d.testIntendedFor
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="padding:10px 14px;background:#fff8e6;border:1px solid #c98a00;border-radius:6px;font-size:13px;color:#7a5600;${FONT}">Modo de prueba: este correo iba para <strong>${escapeHtml(d.testIntendedFor)}</strong>.</td></tr><tr><td height="10"></td></tr></table>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:6px;">
    <tr><td style="padding:24px 28px 14px;border-bottom:2px solid #0f1115;${FONT}">
      <div style="font-size:22px;font-weight:700;letter-spacing:.06em;color:#0f1115;">TORQ</div>
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7380;">Tu semana con el coach</div>
    </td></tr>
    <tr><td style="padding:22px 28px 0;${FONT}">
      ${p(`Hola, ${d.athleteName}.`)}
      ${p(lead)}
      ${tally ? p(tally, 'font-weight:600;color:#0f1115;') : ''}
    </td></tr>
    <tr><td align="left" style="padding:6px 28px 18px;">
      <a href="${escapeHtml(d.evalUrl)}" style="display:inline-block;padding:12px 22px;background:#2f6fe0;color:#ffffff;border-radius:6px;font-size:15px;font-weight:600;text-decoration:none;${FONT}">Evaluar mi semana</a>
      <div style="margin-top:8px;font-size:13px;color:#6b7380;${FONT}">Tarda unos 30 segundos.</div>
    </td></tr>
    <tr><td style="padding:0 28px 8px;${FONT}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${tips.map((t) => `<tr><td width="18" valign="top" style="padding:0 0 8px;font-size:14px;color:#2f6fe0;${FONT}">•</td><td valign="top" style="padding:0 0 8px;font-size:14px;line-height:1.45;color:#3c424d;${FONT}">${escapeHtml(t)}</td></tr>`).join('')}
      </table>
    </td></tr>
    <tr><td style="padding:14px 28px 22px;border-top:1px solid #e3e6eb;font-size:12px;line-height:1.45;color:#6b7380;${FONT}">${escapeHtml(footer)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    ...(d.testIntendedFor ? [`[Modo de prueba: iba para ${d.testIntendedFor}]`, ''] : []),
    `Hola, ${d.athleteName}.`,
    '',
    lead,
    ...(tally ? ['', tally] : []),
    '',
    `Evaluar mi semana (tarda unos 30 segundos): ${d.evalUrl}`,
    '',
    ...tips.map((t) => `- ${t}`),
    '',
    footer,
  ].join('\n');
  return { subject, html, text };
}
