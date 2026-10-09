// Correos que manda el coach de IA al atleta SIN coach humano: la carta del
// plan (con PDF, ver plan-pdf.ts) al crear el plan y un resumen corto en cada
// weekly_eval. Sin imports a propósito: Deno lo usa en la función y vitest lo
// prueba desde src/. Mismo estilo que send-review-email/email.ts (tablas y
// estilos en línea: Gmail y Outlook ignoran <style>).

export interface ReportWorkout {
  date: string; // YYYY-MM-DD
  name: string;
  minutes: number;
  erg: 'on' | 'off' | 'mixed';
  isTest: boolean;
  intent: string;
}

export interface ReportWeek {
  weekNumber: number; // 1 = la de arranque (como lo cuenta el atleta)
  workouts: ReportWorkout[];
}

export interface ReportTest {
  weekNumber: number;
  type: 'ramp' | 'test20';
  reason: string;
}

export interface PlanReportData {
  athleteName: string | null;
  planName: string;
  goal: string;
  startDate: string; // YYYY-MM-DD
  days: string[]; // mon, tue…
  hoursPerWeek: number;
  coachNote: string;
  why: { title: string; body: string }[];
  closing: string;
  blocks: { name: string; weeks: number; focus: string; targetHoursPerWeek: number }[];
  weeks: ReportWeek[];
  nextTest: ReportTest | null;
  appUrl: string;
  /** Modo de prueba: a quién le habría llegado. */
  testIntendedFor?: string | null;
}

export type WeeklyDecision = 'progress' | 'maintain' | 'reduce' | 'insert_recovery';

export interface WeeklyReportData {
  athleteName: string | null;
  decision: WeeklyDecision;
  reasoning: string;
  questions: string[]; // contradictionFlag / recurringPatternFlag que no vinieron null
  lastWeek: { plannedTSS: number; actualTSS: number; completed: number; missed: number } | null;
  nextWeek: ReportWeek;
  nextTest: ReportTest | null;
  ftp: { action: 'keep' | 'change'; suggested: number | null } | null;
  appUrl: string;
  testIntendedFor?: string | null;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DAY_LABELS: Record<string, string> = { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' };

export const DECISIONS: Record<WeeklyDecision, { label: string; color: string }> = {
  progress: { label: 'Subimos un paso', color: '#149a62' },
  maintain: { label: 'Mantenemos la carga', color: '#2f6fe0' },
  reduce: { label: 'Bajamos un poco', color: '#c98a00' },
  insert_recovery: { label: 'Semana de recuperación', color: '#c98a00' },
};

export const TEST_LABELS = { ramp: 'Test de rampa', test20: 'Test de 20 minutos' } as const;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "vie 9 oct" */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "9 de octubre" */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} de ${MONTHS_LONG[d.getUTCMonth()]}`;
}

export function dayList(days: string[]): string {
  const names = days.map((d) => DAY_LABELS[d] ?? d);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : (names[0] ?? '');
}

export function ergLabel(w: Pick<ReportWorkout, 'erg' | 'isTest'>): string {
  if (w.isTest) return 'Test';
  return w.erg === 'on' ? 'ERG' : w.erg === 'mixed' ? 'Mixto' : 'Sensación';
}

function weekMinutes(w: ReportWeek): number {
  return w.workouts.reduce((s, x) => s + x.minutes, 0);
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function paragraphs(text: string, style: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function section(title: string, body: string): string {
  return body
    ? `<tr><td style="padding:24px 32px 0;${FONT}">
        <div style="font-size:17px;font-weight:600;color:#0f1115;border-bottom:1px solid #e3e6eb;padding-bottom:6px;margin-bottom:10px;">${title}</div>
        ${body}
      </td></tr>`
    : '';
}

function weekTable(week: ReportWeek): string {
  const rows = week.workouts
    .map(
      (w) => `<tr>
        <td valign="top" style="padding:8px 10px 8px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7380;white-space:nowrap;${FONT}">${escapeHtml(shortDate(w.date))}</td>
        <td valign="top" style="padding:8px 10px 8px 0;border-bottom:1px solid #eef0f3;font-size:14px;color:#0f1115;${FONT}">${w.isTest ? '<strong style="color:#2f6fe0;">' : '<strong>'}${escapeHtml(w.name)}</strong></td>
        <td valign="top" align="right" style="padding:8px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#3c424d;white-space:nowrap;${FONT}">${w.minutes} min · ${ergLabel(w)}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
}

function shell(opts: { subject: string; kicker: string; athleteName: string | null; testIntendedFor?: string | null; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#e9ebef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9ebef;"><tr><td align="center" style="padding:24px 12px;">
  ${
    opts.testIntendedFor
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;"><tr><td style="padding:10px 14px;background:#fff8e6;border:1px solid #c98a00;border-radius:6px;font-size:13px;color:#7a5600;${FONT}">Modo de prueba: este correo iba para <strong>${escapeHtml(opts.testIntendedFor)}</strong>. Solo tú lo recibes mientras esté en prueba.</td></tr><tr><td height="10"></td></tr></table>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:6px;">
    <tr><td style="padding:24px 32px 14px;border-bottom:2px solid #0f1115;${FONT}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="${FONT}"><div style="font-size:22px;font-weight:700;letter-spacing:.06em;color:#0f1115;">TORQ</div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7380;">${escapeHtml(opts.kicker)}</div></td>
        <td align="right" style="font-size:13px;color:#3c424d;${FONT}">${escapeHtml(opts.athleteName ?? '')}<br>Coach Torq</td>
      </tr></table>
    </td></tr>
    ${opts.body}
    <tr><td style="padding:18px 32px 26px;border-top:1px solid #e3e6eb;font-size:11px;line-height:1.5;color:#6b7380;${FONT}">${opts.footer}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function button(href: string, label: string, note: string): string {
  return `<tr><td align="center" style="padding:26px 32px 8px;${FONT}">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;background:#0f1115;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;${FONT}">${label}</a>
    ${note ? `<div style="font-size:12px;color:#6b7380;margin-top:8px;">${note}</div>` : ''}
  </td></tr>`;
}

function compactText(lines: string[]): string {
  return lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n').trim();
}

/** Correo que acompaña al PDF del plan: corto, el detalle va en el PDF. */
export function buildPlanEmail(d: PlanReportData): { subject: string; html: string; text: string } {
  const subject = `Tu plan está listo: ${d.planName}`;
  const first = d.weeks[0];
  const testLine = d.nextTest
    ? `${TEST_LABELS[d.nextTest.type]} en tu semana ${d.nextTest.weekNumber}${testDateOf(d.weeks, d.nextTest) ? ` (${shortDate(testDateOf(d.weeks, d.nextTest)!)})` : ''}.`
    : '';
  const body = `
    <tr><td style="padding:22px 32px 0;${FONT}">
      <div style="font-size:28px;font-weight:700;color:#0f1115;line-height:1.15;">${escapeHtml(d.planName)}</div>
      <div style="margin-top:8px;font-size:13px;color:#6b7380;">Arranca el ${escapeHtml(longDate(d.startDate))} · ${escapeHtml(dayList(d.days))} · hasta ${d.hoursPerWeek} h por semana</div>
    </td></tr>
    <tr><td style="padding:16px 32px 0;${FONT}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="4" style="background:#2f6fe0;border-radius:2px;"></td>
        <td style="padding-left:16px;${FONT}">
          ${paragraphs(d.coachNote, `margin:0 0 10px;font-size:15px;line-height:1.5;color:#3c424d;${FONT}`)}
        </td>
      </tr></table>
    </td></tr>
    ${first ? section(`Tu primera semana · ${hoursLabel(weekMinutes(first))}`, weekTable(first)) : ''}
    ${testLine ? section('Cuándo medimos', `<p style="margin:0;font-size:14px;line-height:1.5;color:#3c424d;${FONT}"><strong>${escapeHtml(testLine)}</strong> ${escapeHtml(d.nextTest!.reason)}</p>`) : ''}
    <tr><td style="padding:22px 32px 0;${FONT}">
      <div style="padding:14px 16px;background:#f3f6fc;border-radius:6px;font-size:14px;line-height:1.5;color:#3c424d;">
        <strong style="color:#0f1115;">En el PDF adjunto</strong> te explico por qué armé el plan así, el camino completo por bloques y tus primeras semanas sesión por sesión.
      </div>
    </td></tr>
    ${button(d.appUrl, 'Abrir mi plan', '')}`;
  const html = shell({
    subject,
    kicker: 'Tu plan de entrenamiento',
    athleteName: d.athleteName,
    testIntendedFor: d.testIntendedFor,
    body,
    footer: 'Recibes este correo porque creaste un plan con el coach de Torq. Las actividades de Strava no se usan en el coach.',
  });
  const text = compactText([
    `TORQ · ${d.planName}`,
    d.testIntendedFor ? `(Modo de prueba: este correo iba para ${d.testIntendedFor})` : '',
    `Arranca el ${longDate(d.startDate)} · ${dayList(d.days)} · hasta ${d.hoursPerWeek} h por semana`,
    '',
    d.coachNote.trim(),
    '',
    first ? `Tu primera semana (${hoursLabel(weekMinutes(first))})` : '',
    ...(first?.workouts ?? []).map((w) => `- ${shortDate(w.date)}: ${w.name} · ${w.minutes} min · ${ergLabel(w)}`),
    '',
    testLine ? `Cuándo medimos: ${testLine} ${d.nextTest!.reason}` : '',
    '',
    'En el PDF adjunto te explico por qué armé el plan así, el camino por bloques y tus primeras semanas.',
    `Abrir mi plan: ${d.appUrl}`,
  ]);
  return { subject, html, text };
}

/** Fecha del workout de test dentro de las semanas que ya están armadas. */
export function testDateOf(weeks: ReportWeek[], test: ReportTest): string | null {
  const week = weeks.find((w) => w.weekNumber === test.weekNumber);
  return week?.workouts.find((w) => w.isTest)?.date ?? null;
}

/** Resumen corto de cada evaluación semanal. */
export function buildWeeklyEmail(d: WeeklyReportData): { subject: string; html: string; text: string } {
  const decision = DECISIONS[d.decision];
  const subject = `Tu semana ${d.nextWeek.weekNumber}: ${decision.label.toLowerCase()}`;
  const pct = d.lastWeek && d.lastWeek.plannedTSS > 0 ? Math.round((d.lastWeek.actualTSS / d.lastWeek.plannedTSS) * 100) : null;
  const lastWeekLine = d.lastWeek
    ? `${d.lastWeek.completed} de ${d.lastWeek.completed + d.lastWeek.missed} sesiones${pct !== null ? ` · ${pct} % de la carga planeada` : ''}`
    : '';
  const testDate = d.nextTest ? testDateOf([d.nextWeek], d.nextTest) : null;
  const testLine = d.nextTest
    ? testDate
      ? `${TEST_LABELS[d.nextTest.type]} esta semana: ${shortDate(testDate)}. Los dos días anteriores, solo rodadas suaves o descanso.`
      : `${TEST_LABELS[d.nextTest.type]} previsto para tu semana ${d.nextTest.weekNumber}.`
    : '';
  const ftpLine = d.ftp?.action === 'change' && d.ftp.suggested ? `Pon ${d.ftp.suggested} W como FTP en tu perfil.` : '';
  const body = `
    <tr><td style="padding:22px 32px 0;${FONT}">
      <div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${decision.color};">● ${decision.label}</div>
      <div style="margin-top:6px;font-size:26px;font-weight:700;color:#0f1115;line-height:1.15;">Tu semana ${d.nextWeek.weekNumber}</div>
      ${lastWeekLine ? `<div style="margin-top:6px;font-size:13px;color:#6b7380;">La semana pasada: ${escapeHtml(lastWeekLine)}</div>` : ''}
    </td></tr>
    <tr><td style="padding:14px 32px 0;${FONT}">
      ${paragraphs(d.reasoning, `margin:0 0 10px;font-size:15px;line-height:1.5;color:#3c424d;${FONT}`)}
    </td></tr>
    ${ftpLine ? section('Tu FTP', `<p style="margin:0;font-size:14px;color:#0f1115;${FONT}"><strong>${escapeHtml(ftpLine)}</strong></p>`) : ''}
    ${section(`Lo que viene · ${hoursLabel(weekMinutes(d.nextWeek))}`, weekTable(d.nextWeek))}
    ${testLine ? section('Test', `<p style="margin:0;font-size:14px;line-height:1.5;color:#3c424d;${FONT}">${escapeHtml(testLine)}</p>`) : ''}
    ${
      d.questions.length
        ? section(
            'Cuéntame en tu nota',
            d.questions.map((q) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#3c424d;${FONT}">${escapeHtml(q)}</p>`).join(''),
          )
        : ''
    }
    ${button(d.appUrl, 'Ver mi semana', '')}`;
  const html = shell({
    subject,
    kicker: 'Evaluación semanal',
    athleteName: d.athleteName,
    testIntendedFor: d.testIntendedFor,
    body,
    footer: 'Recibes este correo porque evaluaste tu semana con el coach de Torq. Las actividades de Strava no se usan en el coach.',
  });
  const text = compactText([
    `TORQ · Tu semana ${d.nextWeek.weekNumber} · ${decision.label}`,
    d.testIntendedFor ? `(Modo de prueba: este correo iba para ${d.testIntendedFor})` : '',
    lastWeekLine ? `La semana pasada: ${lastWeekLine}` : '',
    '',
    d.reasoning.trim(),
    '',
    ftpLine,
    `Lo que viene (${hoursLabel(weekMinutes(d.nextWeek))})`,
    ...d.nextWeek.workouts.map((w) => `- ${shortDate(w.date)}: ${w.name} · ${w.minutes} min · ${ergLabel(w)}`),
    '',
    testLine,
    ...(d.questions.length ? ['', 'Cuéntame en tu nota:', ...d.questions.map((q) => `- ${q}`)] : []),
    '',
    `Ver mi semana: ${d.appUrl}`,
  ]);
  return { subject, html, text };
}
