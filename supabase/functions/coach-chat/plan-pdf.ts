// PDF de la carta del plan (create_plan, atleta sin coach humano). Lo arma el
// código con lo que decidió el coach: la explicación (`report`), los bloques,
// las semanas concretas y el test. A4, Helvetica (WinAnsi: acentos y ñ sí,
// emojis y flechas no — ver `clean`).
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { TEST_LABELS, dayList, ergLabel, hoursLabel, longDate, shortDate, testDateOf, type PlanReportData } from './report-email.ts';

const W = 595.28;
const H = 841.89;
const M = 48; // margen
const INK = rgb(0.06, 0.067, 0.082);
const BODY = rgb(0.235, 0.259, 0.302);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.89, 0.9, 0.92);
const BLUE = rgb(0.184, 0.435, 0.878);
const SOFT = rgb(0.953, 0.965, 0.988);
const BLOCK_COLORS = [rgb(0.184, 0.435, 0.878), rgb(0.078, 0.604, 0.384), rgb(0.788, 0.541, 0), rgb(0.784, 0.216, 0.176), rgb(0.42, 0.33, 0.75)];

const REPLACE: Record<string, string> = { '→': '->', '≈': '~', '≥': '>=', '≤': '<=', '−': '-', '‑': '-', ' ': ' ', ' ': ' ', '✓': '-', '💪': '' };

class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(
    private doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }

  /** Quita lo que Helvetica (WinAnsi) no puede dibujar. */
  clean(s: string): string {
    let out = '';
    for (const ch of s.replace(/\r/g, '')) {
      const r = REPLACE[ch];
      if (r !== undefined) {
        out += r;
        continue;
      }
      try {
        this.regular.widthOfTextAtSize(ch, 10);
        out += ch;
      } catch {
        // carácter fuera de WinAnsi: se omite
      }
    }
    return out;
  }

  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.pageNo++;
    this.y = H - M;
    this.page.drawText(this.clean(this.footer), { x: M, y: 24, size: 8, font: this.regular, color: MUTED });
    this.page.drawText(String(this.pageNo), { x: W - M - 6, y: 24, size: 8, font: this.regular, color: MUTED });
  }

  ensure(h: number) {
    if (this.y - h < M + 10) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of this.clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Párrafo con salto de página por línea. */
  text(text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; width?: number; leading?: number; after?: number } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? this.regular;
    const x = opts.x ?? M;
    const width = opts.width ?? W - M - x;
    const leading = opts.leading ?? size * 1.45;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(leading);
      this.y -= leading;
      this.page.drawText(line, { x, y: this.y + (leading - size) / 2, size, font, color: opts.color ?? BODY });
    }
    this.y -= opts.after ?? 0;
  }

  heading(title: string) {
    this.ensure(60);
    this.y -= 26;
    this.page.drawText(this.clean(title), { x: M, y: this.y, size: 14, font: this.bold, color: INK });
    this.y -= 8;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.8, color: RULE });
    this.y -= 6;
  }
}

export async function buildPlanPdf(d: PlanReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Plan de entrenamiento: ${d.planName}`);
  doc.setAuthor('Coach Torq');
  doc.setCreator('Torq');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, regular, bold, `Torq · ${d.planName}`);

  // ── Portada: banda oscura con el nombre del plan ─────────────────────────
  const bandH = 150;
  w.page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: INK });
  w.page.drawText('TORQ', { x: M, y: H - 46, size: 18, font: bold, color: rgb(1, 1, 1) });
  w.page.drawText('PLAN DE ENTRENAMIENTO', { x: M, y: H - 62, size: 8, font: regular, color: rgb(0.7, 0.73, 0.78) });
  const titleLines = w.wrap(d.planName, bold, 24, W - 2 * M).slice(0, 2);
  titleLines.forEach((line, i) => w.page.drawText(line, { x: M, y: H - 98 - i * 28, size: 24, font: bold, color: rgb(1, 1, 1) }));
  if (d.athleteName) {
    const name = w.clean(d.athleteName);
    w.page.drawText(name, { x: W - M - regular.widthOfTextAtSize(name, 10), y: H - 46, size: 10, font: regular, color: rgb(0.85, 0.87, 0.9) });
  }
  w.y = H - bandH - 14;

  // Ficha: arranque, días, horas, meta
  const facts: [string, string][] = [
    ['Arranca', longDate(d.startDate)],
    ['Días', dayList(d.days)],
    ['Disponibilidad', `hasta ${d.hoursPerWeek} h por semana`],
  ];
  const colW = (W - 2 * M) / facts.length;
  w.y -= 22;
  facts.forEach(([label, value], i) => {
    w.page.drawText(label.toUpperCase(), { x: M + i * colW, y: w.y + 12, size: 7.5, font: regular, color: MUTED });
    const lines = w.wrap(value, bold, 10.5, colW - 10).slice(0, 2);
    lines.forEach((line, j) => w.page.drawText(line, { x: M + i * colW, y: w.y - j * 13, size: 10.5, font: bold, color: INK }));
  });
  w.y -= 26;
  if (d.goal) {
    w.text(`Tu meta: ${d.goal}`, { size: 10, color: MUTED, after: 2 });
  }

  // ── Mensaje del coach ────────────────────────────────────────────────────
  w.heading('Mensaje de tu coach');
  const noteTop = w.y;
  w.text(d.coachNote, { x: M + 14, size: 11, leading: 16 });
  if (w.y < noteTop) w.page.drawRectangle({ x: M, y: w.y, width: 3, height: Math.min(noteTop - w.y, noteTop - M), color: BLUE });

  // ── Por qué este plan ────────────────────────────────────────────────────
  if (d.why.length) {
    w.heading('Por qué armé tu plan así');
    d.why.forEach((item, i) => {
      w.ensure(50);
      w.y -= 6;
      const top = w.y;
      w.page.drawCircle({ x: M + 9, y: top - 9, size: 9, color: BLUE });
      const n = String(i + 1);
      w.page.drawText(n, { x: M + 9 - bold.widthOfTextAtSize(n, 10) / 2, y: top - 12.5, size: 10, font: bold, color: rgb(1, 1, 1) });
      w.text(item.title, { x: M + 28, size: 11.5, font: bold, color: INK, leading: 17 });
      w.text(item.body, { x: M + 28, size: 10.5, after: 4 });
    });
  }

  // ── El camino: bloques ───────────────────────────────────────────────────
  if (d.blocks.length) {
    w.heading('El camino');
    const total = d.blocks.reduce((s, b) => s + b.weeks, 0);
    w.ensure(40);
    w.y -= 22;
    let x = M;
    const full = W - 2 * M;
    d.blocks.forEach((b, i) => {
      const bw = (b.weeks / total) * full;
      w.page.drawRectangle({ x, y: w.y, width: Math.max(bw - 3, 2), height: 16, color: BLOCK_COLORS[i % BLOCK_COLORS.length] });
      const label = `${b.weeks} sem`;
      if (regular.widthOfTextAtSize(label, 8) < bw - 8) w.page.drawText(label, { x: x + 5, y: w.y + 5, size: 8, font: bold, color: rgb(1, 1, 1) });
      x += bw;
    });
    w.y -= 8;
    w.text(`${total} semanas en ${d.blocks.length} ${d.blocks.length === 1 ? 'bloque' : 'bloques'}. Aquí está el primero completo; los demás se arman con cómo respondas.`, {
      size: 9,
      color: MUTED,
      after: 4,
    });
    d.blocks.forEach((b, i) => {
      w.ensure(40);
      w.y -= 6;
      w.page.drawRectangle({ x: M, y: w.y - 11, width: 8, height: 8, color: BLOCK_COLORS[i % BLOCK_COLORS.length] });
      w.text(`${b.name} · ${b.weeks} ${b.weeks === 1 ? 'semana' : 'semanas'} · ~${b.targetHoursPerWeek} h/sem`, { x: M + 16, size: 10.5, font: bold, color: INK, leading: 15 });
      w.text(b.focus, { x: M + 16, size: 10 });
    });
  }

  // ── Semanas concretas ────────────────────────────────────────────────────
  for (const week of d.weeks) {
    const mins = week.workouts.reduce((s, x) => s + x.minutes, 0);
    w.heading(`Semana ${week.weekNumber} · ${hoursLabel(mins)}`);
    for (const wo of week.workouts) {
      const intentLines = w.wrap(wo.intent, regular, 9.5, W - 2 * M - 110);
      w.ensure(22 + intentLines.length * 13);
      w.y -= 6;
      if (wo.isTest) w.page.drawRectangle({ x: M - 6, y: w.y - 20 - intentLines.length * 13, width: W - 2 * M + 12, height: 24 + intentLines.length * 13, color: SOFT });
      w.page.drawText(w.clean(shortDate(wo.date)), { x: M, y: w.y - 13, size: 9.5, font: regular, color: MUTED });
      w.page.drawText(w.clean(wo.name), { x: M + 70, y: w.y - 13, size: 11, font: bold, color: wo.isTest ? BLUE : INK });
      const meta = `${wo.minutes} min · ${ergLabel(wo)}`;
      w.page.drawText(meta, { x: W - M - regular.widthOfTextAtSize(meta, 9.5), y: w.y - 13, size: 9.5, font: regular, color: BODY });
      w.y -= 18;
      for (const line of intentLines) {
        w.y -= 13;
        w.page.drawText(line, { x: M + 70, y: w.y + 2, size: 9.5, font: regular, color: BODY });
      }
      w.y -= 4;
      w.page.drawLine({ start: { x: M + 70, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.5, color: RULE });
    }
  }

  // ── Test ─────────────────────────────────────────────────────────────────
  if (d.nextTest) {
    w.heading('Cuándo medimos');
    const date = testDateOf(d.weeks, d.nextTest);
    w.text(`${TEST_LABELS[d.nextTest.type]} · semana ${d.nextTest.weekNumber}${date ? ` (${shortDate(date)})` : ''}`, { size: 11, font: bold, color: INK, leading: 16 });
    w.text(d.nextTest.reason, { after: 2 });
    w.text('El número que salga es tu FTP: ponlo en tu perfil y desde ahí las zonas van en watts.', { size: 9.5, color: MUTED });
  }

  // ── Cierre ───────────────────────────────────────────────────────────────
  const closingLines = w.wrap(d.closing, regular, 11, W - 2 * M - 32);
  const boxH = 66 + closingLines.length * 16;
  w.ensure(boxH + 30);
  w.y -= 24;
  w.page.drawRectangle({ x: M, y: w.y - boxH, width: W - 2 * M, height: boxH, color: INK });
  w.page.drawText('Nos vemos en el camino', { x: M + 16, y: w.y - 24, size: 13, font: bold, color: rgb(1, 1, 1) });
  closingLines.forEach((line, i) => w.page.drawText(line, { x: M + 16, y: w.y - 44 - i * 16, size: 11, font: regular, color: rgb(0.88, 0.9, 0.93) }));
  w.page.drawText('- Tu coach Torq', { x: M + 16, y: w.y - boxH + 14, size: 9.5, font: regular, color: rgb(0.7, 0.73, 0.78) });
  w.y -= boxH;

  return await doc.save();
}

/** Base64 para el adjunto de Resend. */
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
