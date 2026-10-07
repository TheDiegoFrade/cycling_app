// La "hoja" del reporte mensual (docs/coach-view/mockups/Revision.html).
// La usan el coach (screens/coach-review.ts, con edición) y el atleta
// (screens/review.ts, solo lectura). Es clara a propósito: se lee igual en
// la app, impresa como PDF y, más adelante, en un correo.
import type { DayStatus, MonthlyReport, ReviewFinding, ReviewGoal, ReviewVerdict } from '../core/monthly-report';
import { INTENSITY_LABELS, MAX_FINDINGS, MAX_GOALS, VERDICT_LABELS, monthLabel, monthName, shiftMonth } from '../core/monthly-report';
import { NON_BIKE_KIND_LABELS } from '../core/session-kind';
import { sourceLabel } from './coach-ui';
import { escapeHtml } from './workout-cover';

export interface SheetContent {
  verdict: ReviewVerdict | null;
  coachMessage: string;
  findings: ReviewFinding[];
  goals: ReviewGoal[];
}

export interface SheetData {
  report: MonthlyReport;
  athleteName: string;
  coachName: string | null;
  discipline: string | null;
  ftp: number | null;
  weightKg: number | null;
  goal: string | null;
  content: SheetContent;
  publishedAt: string | null;
  editable: boolean;
}

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtDate(key: string, withYear = false): string {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
function fmtDuration(s: number): string {
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
function signed(n: number, digits = 0): string {
  const v = digits ? nf1.format(Math.abs(n)) : nf.format(Math.abs(Math.round(n)));
  return n > 0 ? `+${v}` : n < 0 ? `−${v}` : v;
}
function delta(n: number | null, unit: string, digits = 0, neutral = false): string {
  if (n === null || !Number.isFinite(n)) return '<div class="rpt-delta flat">sin comparación</div>';
  const r = digits ? Math.round(n * 10) / 10 : Math.round(n);
  if (r === 0) return '<div class="rpt-delta flat">igual</div>';
  const v = digits ? nf1.format(Math.abs(r)) : nf.format(Math.abs(r));
  return `<div class="rpt-delta ${neutral ? 'flat' : r > 0 ? 'up' : 'down'}">${r > 0 ? '▲' : '▼'} ${v}${unit}</div>`;
}
function tsbZone(tsb: number): string {
  if (tsb > 5) return 'Fresca';
  if (tsb >= -10) return 'Transición';
  if (tsb >= -30) return 'Zona productiva';
  return 'Fatiga alta';
}
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function sec(num: number, title: string, hint: string, body: string, label = title): string {
  return `
    <section class="rpt-sec" aria-label="${escapeHtml(label)}">
      <div class="rpt-sec-head"><h2><span class="rpt-sec-num">${String(num).padStart(2, '0')}</span>${title}</h2><span class="rpt-hint">${hint}</span></div>
      ${body}
    </section>`;
}

// ---------- Gráficas (SVG en texto) ----------

const AX = 'font-family="Archivo, sans-serif" font-size="11" fill="#6b7380"';

function pmcSvg(r: MonthlyReport): string {
  const pts = r.pmc;
  if (pts.length < 2) return '<p class="rpt-empty">Todavía no hay sesiones de bici suficientes para la gráfica.</p>';
  const W = 820, L = 40, R = 765, top = 14, bot = 196, mid = 226;
  const n = pts.length;
  const x = (i: number) => L + (i / (n - 1)) * (R - L);
  const maxLoad = Math.max(60, ...pts.map((p) => Math.max(p.ctl, p.atl))) * 1.1;
  const step = maxLoad > 120 ? 50 : maxLoad > 60 ? 40 : 20;
  const top10 = Math.ceil(maxLoad / step) * step;
  const yL = (v: number) => bot - (v / top10) * (bot - top);
  const maxTss = Math.max(100, ...r.dailyTss.values());
  const yB = (v: number) => bot - (v / maxTss) * (bot - top) * 0.6;
  const tsbs = pts.map((p) => p.tsb);
  const tsbScale = 26 / Math.max(15, ...tsbs.map(Math.abs));
  const yT = (v: number) => mid - v * tsbScale;
  const parts: string[] = [];
  for (let v = 0; v <= top10; v += step) parts.push(`<line x1="${L}" x2="${R}" y1="${yL(v)}" y2="${yL(v)}" stroke="#eef0f3"/><text ${AX} x="${L - 8}" y="${yL(v) + 4}" text-anchor="end">${v}</text>`);
  const m0 = pts.findIndex((p) => p.dateKey >= r.startKey);
  if (m0 >= 0) {
    parts.push(`<rect x="${x(m0)}" y="${top}" width="${R - x(m0)}" height="${bot - top}" fill="#f4f7fd"/>`);
    parts.push(`<text ${AX} x="${x(m0) + 6}" y="${top + 13}" font-weight="600" fill="#2f6fe0">${monthName(r.monthKey).replace(/^./, (c) => c.toUpperCase())}</text>`);
  }
  pts.forEach((p, i) => {
    const t = r.dailyTss.get(p.dateKey) ?? 0;
    if (t > 0) parts.push(`<rect x="${x(i) - 3.5}" y="${yB(t)}" width="7" height="${bot - yB(t)}" fill="#dfe3ea" rx="1"/>`);
  });
  const line = (vals: number[], y: (v: number) => number, color: string, w: number) =>
    `<polyline points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round"/>`;
  parts.push(line(pts.map((p) => p.atl), yL, '#e0532f', 1.6));
  parts.push(line(pts.map((p) => p.ctl), yL, '#2f6fe0', 2.6));
  parts.push(`<line x1="${L}" x2="${R}" y1="${yT(0)}" y2="${yT(0)}" stroke="#c9ced6" stroke-dasharray="3 3"/><text ${AX} x="${L - 8}" y="${yT(0) + 4}" text-anchor="end">TSB 0</text>`);
  parts.push(line(tsbs, yT, '#e0a92f', 1.8));
  const last = pts[n - 1];
  parts.push(`<text ${AX} x="${R + 4}" y="${yL(last.ctl) + 4}" fill="#2f6fe0" font-weight="600">CTL ${Math.round(last.ctl)}</text>`);
  [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1].forEach((i) =>
    parts.push(`<text ${AX} x="${x(i)}" y="254" text-anchor="middle">${fmtDate(pts[i].dateKey)}</text>`),
  );
  return `<svg class="rpt-chart" viewBox="0 0 ${W} 262" role="img" aria-label="Gráfica de Fitness, Fatiga y Forma">${parts.join('')}</svg>
    <div class="rpt-legend">
      <span><i style="background:#2f6fe0"></i>Fitness (CTL)</span><span><i style="background:#e0532f"></i>Fatiga (ATL)</span>
      <span><i style="background:#e0a92f"></i>Forma (TSB)</span><span><i class="box" style="background:#dfe3ea"></i>TSS diario</span>
    </div>`;
}

function weeksSvg(r: MonthlyReport): string {
  const L = 40, R = 395, top = 18, bot = 190;
  const max = Math.max(100, ...r.weeks.map((w) => Math.max(w.plannedTss, w.doneTss))) * 1.12;
  const step = max > 800 ? 300 : max > 400 ? 200 : 100;
  const y = (v: number) => bot - (v / max) * (bot - top);
  const bw = (R - L) / r.weeks.length;
  const parts: string[] = [];
  for (let v = 0; v <= max; v += step) parts.push(`<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="#eef0f3"/><text ${AX} x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  r.weeks.forEach((w, i) => {
    const cx = L + bw * i + bw / 2;
    const half = Math.min(22, bw * 0.38);
    if (w.plannedTss > 0) parts.push(`<rect x="${cx - half}" y="${y(w.plannedTss)}" width="${half * 2}" height="${bot - y(w.plannedTss)}" fill="#dfe3ea" rx="2"/>`);
    const low = w.plannedTss > 0 && w.doneTss < w.plannedTss * 0.85;
    if (w.doneTss > 0) parts.push(`<rect x="${cx - half * 0.6}" y="${y(w.doneTss)}" width="${half * 1.2}" height="${bot - y(w.doneTss)}" fill="${low ? '#e0a92f' : '#2f6fe0'}" rx="2"/>`);
    parts.push(`<text ${AX} x="${cx}" y="206" text-anchor="middle">${w.label}</text>`);
    if (w.plannedTss > 0) parts.push(`<text ${AX} x="${cx}" y="${Math.min(y(w.plannedTss), y(w.doneTss)) - 5}" text-anchor="middle" fill="#3c424d" font-weight="600">${Math.round((w.doneTss / w.plannedTss) * 100)}%</text>`);
  });
  return `<svg class="rpt-chart" viewBox="0 0 400 214" role="img" aria-label="TSS planeado contra realizado por semana">${parts.join('')}</svg>
    <div class="rpt-legend"><span><i class="box" style="background:#dfe3ea"></i>Planeado</span><span><i class="box" style="background:#2f6fe0"></i>Hecho</span><span><i class="box" style="background:#e0a92f"></i>Menos de 85 %</span></div>`;
}

const DAY_CLASS: Record<DayStatus, string> = { done: 'done', part: 'part', miss: 'miss', extra: 'extra', rest: '', future: 'future' };

function calendarHtml(r: MonthlyReport): string {
  const first = r.days[0]?.dateKey ?? r.startKey;
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
  const cells = [
    ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="rpt-dow">${d}</div>`),
    ...Array.from({ length: dow }, () => '<div class="rpt-d off"></div>'),
    ...r.days.map((d) => `<div class="rpt-d ${DAY_CLASS[d.status]}" title="${fmtDate(d.dateKey)}">${Number(d.dateKey.slice(8))}${d.tss ? `<b>${d.tss}</b>` : ''}</div>`),
  ];
  return `<div class="rpt-cal">${cells.join('')}</div>
    <div class="rpt-legend">
      <span><i class="box" style="background:#d5f2e4"></i>Completa</span><span><i class="box" style="background:#fff0c7"></i>Parcial</span>
      <span><i class="box" style="background:#fde0dd"></i>Faltó</span><span><i class="box" style="background:#e1ebfd"></i>Extra</span>
    </div>`;
}

function aerobicSvg(r: MonthlyReport): string {
  const weeks = r.aerobic;
  const dec = weeks.map((w) => w.decouplingPct);
  const ef = weeks.map((w) => w.ef);
  if (!dec.some((v) => v !== null) && !ef.some((v) => v !== null)) return '<p class="rpt-empty">Sin rodadas largas y parejas (≥ 1 h, IF ≤ 0.80) con pulso este mes.</p>';
  const L = 36, R = 335, top = 12, bot = 170;
  const x = (i: number) => (weeks.length === 1 ? (L + R) / 2 : L + (i / (weeks.length - 1)) * (R - L));
  const decMax = Math.max(8, ...dec.filter((v): v is number => v !== null).map((v) => Math.ceil(v / 2) * 2));
  const yD = (v: number) => bot - (Math.max(0, v) / decMax) * (bot - top);
  const efVals = ef.filter((v): v is number => v !== null);
  const efMin = Math.min(...efVals) - 0.05, efMax = Math.max(...efVals) + 0.05;
  const yE = (v: number) => bot - ((v - efMin) / (efMax - efMin || 1)) * (bot - top);
  const parts: string[] = [];
  for (let v = 0; v <= decMax; v += 2) parts.push(`<line x1="${L}" x2="${R}" y1="${yD(v)}" y2="${yD(v)}" stroke="#eef0f3"/><text ${AX} x="${L - 6}" y="${yD(v) + 4}" text-anchor="end">${v}%</text>`);
  parts.push(`<rect x="${L}" y="${yD(5)}" width="${R - L}" height="${yD(0) - yD(5)}" fill="#149a62" opacity="0.06"/><text ${AX} x="${R - 2}" y="${yD(5) + 12}" text-anchor="end" fill="#149a62">meta</text>`);
  const series = (vals: (number | null)[], y: (v: number) => number, color: string, label: (v: number) => string, dy: number) => {
    const idx = vals.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
    if (!idx.length) return;
    if (idx.length > 1) parts.push(`<polyline points="${idx.map((i) => `${x(i)},${y(vals[i]!)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2"/>`);
    idx.forEach((i) => parts.push(`<circle cx="${x(i)}" cy="${y(vals[i]!)}" r="3.2" fill="#fff" stroke="${color}" stroke-width="2"/>`));
    const lastI = idx[idx.length - 1];
    parts.push(`<text ${AX} x="${x(lastI) + 7}" y="${y(vals[lastI]!) + dy}" fill="${color}" font-weight="600">${label(vals[lastI]!)}</text>`);
  };
  series(dec, yD, '#e0532f', (v) => `${nf1.format(v)}%`, -6);
  if (efVals.length) series(ef, yE, '#2f6fe0', (v) => `EF ${v.toFixed(2)}`, 14);
  weeks.forEach((w, i) => parts.push(`<text ${AX} x="${x(i)}" y="190" text-anchor="middle">${w.label}</text>`));
  return `<svg class="rpt-chart" viewBox="0 0 400 200" role="img" aria-label="Desacople y factor de eficiencia por semana">${parts.join('')}</svg>
    <div class="rpt-legend"><span><i style="background:#e0532f"></i>Desacople Pw:HR (meta &lt; 5 %)</span><span><i style="background:#2f6fe0"></i>Factor de eficiencia</span></div>`;
}

// ---------- Secciones ----------

function coachNoteHtml(d: SheetData): string {
  const c = d.content;
  if (d.editable) {
    return `
      <div class="rpt-coach-note rpt-editing">
        <div class="rpt-bar"></div>
        <div>
          <label class="rpt-field">Cómo fue el mes
            <select data-rv="verdict">
              ${(Object.keys(VERDICT_LABELS) as ReviewVerdict[]).map((v) => `<option value="${v}"${c.verdict === v ? ' selected' : ''}>${VERDICT_LABELS[v]}</option>`).join('')}
            </select>
          </label>
          <h2>Mensaje de tu coach</h2>
          <textarea data-rv="message" rows="7" maxlength="4000" placeholder="Qué pasó este mes, qué te gustó, qué hay que mejorar y por qué. Es lo primero que leerá tu atleta. Deja una línea en blanco entre párrafos.">${escapeHtml(c.coachMessage)}</textarea>
        </div>
      </div>`;
  }
  if (!c.coachMessage.trim()) return '';
  const tone = c.verdict === 'off_track' ? 'bad' : c.verdict === 'attention' ? 'warn' : 'good';
  return `
    <div class="rpt-coach-note">
      <div class="rpt-bar"></div>
      <div>
        ${c.verdict ? `<span class="rpt-verdict ${tone}">${VERDICT_LABELS[c.verdict]}</span>` : ''}
        <h2>Mensaje de tu coach</h2>
        ${paragraphs(c.coachMessage)}
        <span class="rpt-sign">— ${escapeHtml(d.coachName ?? 'Tu coach')}${d.publishedAt ? `, ${fmtDate(d.publishedAt, true)}` : ''}</span>
      </div>
    </div>`;
}

function kpisHtml(r: MonthlyReport): string {
  const k = r.kpis;
  const tssPct = k.tssPrev > 0 ? ((k.tss - k.tssPrev) / k.tssPrev) * 100 : null;
  const tile = (lbl: string, val: string, d: string) => `<div class="rpt-kpi"><div class="rpt-lbl">${lbl}</div><div class="rpt-val">${val}</div>${d}</div>`;
  return `<div class="rpt-kpis">
    ${tile('Horas de bici', `${nf1.format(k.hours)}<small>h</small>`, delta(k.hours - k.hoursPrev, ' h', 1, true))}
    ${tile('Carga (TSS)', nf.format(k.tss), delta(tssPct, ' %', 0, true))}
    ${tile('Cumplimiento', k.compliancePct === null ? '—' : `${k.compliancePct}<small>%</small>`, k.compliancePct === null ? '<div class="rpt-delta flat">sin plan agendado</div>' : `<div class="rpt-delta flat">${k.doneCount} de ${k.plannedCount}</div>`)}
    ${tile('Fitness (CTL)', nf.format(k.ctlEnd), `<div class="rpt-delta ${Math.round(k.ctlEnd - k.ctlStart) > 0 ? 'up' : Math.round(k.ctlEnd - k.ctlStart) < 0 ? 'down' : 'flat'}">${signed(k.ctlEnd - k.ctlStart)} desde ${nf.format(k.ctlStart)}</div>`)}
    ${tile('FTP', k.ftp ? `${nf.format(k.ftp)}<small>W</small>` : '—', k.ftp && k.ftpPrev ? delta(k.ftp - k.ftpPrev, ' W') : '<div class="rpt-delta flat">sin comparación</div>')}
    ${tile('Forma (TSB) al cierre', signed(k.tsbEnd), `<div class="rpt-delta flat">${tsbZone(k.tsbEnd)}</div>`)}
  </div>`;
}

function bestsHtml(r: MonthlyReport, weightKg: number | null): string {
  if (!r.bests.some((b) => b.month || b.prev)) return '<p class="rpt-empty">Sin datos de potencia este mes.</p>';
  const w = (v: number | null) => (v ? `${nf.format(v)} W` : '—');
  const wkg = (v: number | null) => (v && weightKg ? (v / weightKg).toFixed(1) : '—');
  return `<div class="rpt-tbl-wrap"><table class="rpt-table">
    <thead><tr><th>Duración</th><th class="num">${monthName(r.monthKey).replace(/^./, (c) => c.toUpperCase())}</th>${weightKg ? '<th class="num">W/kg</th>' : ''}<th class="num">${monthName(shiftMonth(r.monthKey, -1)).replace(/^./, (c) => c.toUpperCase())}</th><th class="num">Cambio</th><th class="num">Mejor 90 días</th></tr></thead>
    <tbody>${r.bests
      .map((b) => {
        const ch = b.month && b.prev ? Math.round(b.month - b.prev) : null;
        const top = b.month !== null && b.best90 !== null && b.month >= b.best90;
        return `<tr><td>${b.label}</td><td class="num"><b>${w(b.month)}</b></td>${weightKg ? `<td class="num">${wkg(b.month)}</td>` : ''}<td class="num">${w(b.prev)}</td><td class="num ${ch === null || ch === 0 ? 'flat' : ch > 0 ? 'up' : 'down'}">${ch === null ? '—' : ch > 0 ? `▲ ${ch} W` : ch < 0 ? `▼ ${Math.abs(ch)} W` : 'igual'}</td><td class="num">${w(b.best90)}${top ? ' ★' : ''}</td></tr>`;
      })
      .join('')}</tbody></table></div>`;
}

const BUCKET_COLORS = ['#9aa3af', '#2f6fe0', '#14a3a0', '#e0a92f', '#e0532f'];

function intensityHtml(r: MonthlyReport): string {
  const total = r.intensity.reduce((s, i) => s + i.hours, 0);
  if (total === 0) return '<p class="rpt-empty">Sin sesiones con potencia este mes.</p>';
  const max = Math.max(...r.intensity.map((i) => i.hours));
  const easy = ((r.intensity[0].hours + r.intensity[1].hours) / total) * 100;
  const hard = ((r.intensity[3].hours + r.intensity[4].hours) / total) * 100;
  return `${r.intensity
    .map((i, k) => `<div class="rpt-hbar"><span>${INTENSITY_LABELS[i.bucket]}</span><div class="rpt-track"><div class="rpt-fill" style="width:${(i.hours / max) * 100}%;background:${BUCKET_COLORS[k]}"></div></div><span class="rpt-v">${nf1.format(i.hours)} h</span></div>`)
    .join('')}
    <p class="rpt-why">${Math.round(easy)} % suave o de resistencia y ${Math.round(hard)} % de umbral para arriba. Según el IF de cada sesión.${r.hoursWithoutPower > 0.05 ? ` ${nf1.format(r.hoursWithoutPower)} h sin datos de potencia.` : ''}</p>`;
}

function keySessionsHtml(r: MonthlyReport): string {
  if (!r.keySessions.length) return '<p class="rpt-empty">Sin sesiones de bici este mes.</p>';
  const n = (v: number | null, f: (x: number) => string) => (v === null ? '—' : f(v));
  return `<div class="rpt-tbl-wrap"><table class="rpt-table">
    <thead><tr><th>Fecha</th><th>Sesión</th><th class="num">Duración</th><th class="num">NP</th><th class="num">IF</th><th class="num">TSS</th><th class="num">RPE</th><th>Por qué</th></tr></thead>
    <tbody>${r.keySessions
      .map(
        (s) => `<tr><td>${fmtDate(s.dateKey)}</td><td><b>${escapeHtml(s.name)}</b><br><span class="rpt-sub">${sourceLabel(s.source)}</span></td><td class="num">${fmtDuration(s.durationS)}</td>
          <td class="num">${n(s.np, (v) => `${Math.round(v)} W`)}</td><td class="num">${n(s.intensityFactor, (v) => v.toFixed(2))}</td><td class="num">${n(s.tss, (v) => String(Math.round(v)))}</td><td class="num">${n(s.rpe, String)}</td><td>${escapeHtml(s.note)}</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
}

const TONE_ICON: Record<ReviewFinding['tone'], string> = { good: '✓', warn: '!', bad: '!' };

function findingsHtml(d: SheetData): string {
  const list = d.content.findings;
  if (d.editable) {
    return `
      <div class="rpt-edit-list">
        ${list
          .map(
            (f, i) => `
          <div class="rpt-edit-row">
            <select data-rv-finding="${i}" data-field="tone" aria-label="Tipo">
              <option value="good"${f.tone === 'good' ? ' selected' : ''}>✓ Bien</option>
              <option value="warn"${f.tone === 'warn' ? ' selected' : ''}>! A cuidar</option>
              <option value="bad"${f.tone === 'bad' ? ' selected' : ''}>! Importante</option>
            </select>
            <div class="rpt-edit-fields">
              <input data-rv-finding="${i}" data-field="title" value="${escapeHtml(f.title)}" maxlength="140" placeholder="Título" aria-label="Título del hallazgo">
              <textarea data-rv-finding="${i}" data-field="body" rows="2" maxlength="600" placeholder="Qué muestran los datos" aria-label="Detalle del hallazgo">${escapeHtml(f.body)}</textarea>
            </div>
            <button type="button" class="rpt-x" data-rv-remove-finding="${i}" aria-label="Quitar hallazgo">×</button>
          </div>`,
          )
          .join('')}
        <div class="rpt-edit-actions">
          ${list.length < MAX_FINDINGS ? '<button type="button" id="rv-add-finding">Agregar hallazgo</button>' : ''}
          <button type="button" id="rv-suggest">Volver a las sugerencias de los datos</button>
        </div>
      </div>`;
  }
  if (!list.length) return '<p class="rpt-empty">Sin hallazgos este mes.</p>';
  return `<ul class="rpt-findings">${list
    .map((f) => `<li><span class="rpt-ico ${f.tone}">${TONE_ICON[f.tone]}</span><span>${f.title ? `<b>${escapeHtml(f.title)}</b> ` : ''}${escapeHtml(f.body)}</span></li>`)
    .join('')}</ul>`;
}

function routinesHtml(r: MonthlyReport): string {
  const tiles = r.routines.map(
    (rc) =>
      `<div class="rpt-kpi"><div class="rpt-lbl">${NON_BIKE_KIND_LABELS[rc.kind]}</div><div class="rpt-val">${rc.done}${rc.planned ? `<small>/ ${rc.planned}</small>` : ''}</div>${
        rc.planned ? `<div class="rpt-delta ${rc.done >= rc.planned ? 'up' : 'down'}">${rc.done >= rc.planned ? 'Completo' : `${rc.planned - rc.done} sin hacer`}</div>` : '<div class="rpt-delta flat">sin agendar</div>'
      }</div>`,
  );
  tiles.push(`<div class="rpt-kpi"><div class="rpt-lbl">Carga sRPE</div><div class="rpt-val">${nf.format(r.srpeTotal)}</div><div class="rpt-delta flat">RPE × minutos</div></div>`);
  return `<div class="rpt-kpis">${tiles.join('')}</div>`;
}

function goalsHtml(d: SheetData, next: string): string {
  const list = d.content.goals;
  if (d.editable) {
    return `
      <div class="rpt-edit-list">
        ${list
          .map(
            (g, i) => `
          <div class="rpt-edit-row">
            <span class="rpt-goal-n">${i + 1}</span>
            <div class="rpt-edit-fields">
              <input data-rv-goal="${i}" data-field="title" value="${escapeHtml(g.title)}" maxlength="140" placeholder="Objetivo (ej. Fuerza los martes)" aria-label="Objetivo">
              <input data-rv-goal="${i}" data-field="detail" value="${escapeHtml(g.detail)}" maxlength="400" placeholder="Cómo lo medimos o por qué" aria-label="Detalle del objetivo">
            </div>
            <button type="button" class="rpt-x" data-rv-remove-goal="${i}" aria-label="Quitar objetivo">×</button>
          </div>`,
          )
          .join('')}
        ${list.length < MAX_GOALS ? `<div class="rpt-edit-actions"><button type="button" id="rv-add-goal">Agregar objetivo para ${next}</button></div>` : ''}
      </div>`;
  }
  if (!list.length) return '';
  return `<div class="rpt-goals">${list.map((g, i) => `<div class="rpt-goal"><span class="rpt-goal-n">${i + 1}</span><div><b>${escapeHtml(g.title)}</b>${g.detail ? `<span>${escapeHtml(g.detail)}</span>` : ''}</div></div>`).join('')}</div>`;
}

export function renderReportSheet(d: SheetData): string {
  const r = d.report;
  const next = monthName(shiftMonth(r.monthKey, 1));
  const prev = monthName(shiftMonth(r.monthKey, -1));
  const title = monthName(r.monthKey).replace(/^./, (c) => c.toUpperCase());
  let num = 0;
  const sections: string[] = [];
  const add = (title: string, hint: string, body: string) => body && sections.push(sec(++num, title, hint, body));

  add('Resumen del mes', `vs. ${prev}${r.inProgress ? ' (mismos días)' : ''}`, kpisHtml(r));
  add(
    'Fitness, fatiga y forma',
    'últimos 60 días',
    `<p class="rpt-why">Fitness (CTL) es tu carga promedio de 6 semanas; Fatiga (ATL), la de la última semana. Forma (TSB) es la diferencia: entre −10 y −30 construyes; arriba de +5 llegas fresco a una carrera.</p>${pmcSvg(r)}`,
  );
  const pair = (a: string, b: string) => `<div class="rpt-two">${a}${b}</div>`;
  const s3 = sec(++num, 'Volumen por semana', 'TSS planeado vs. hecho', weeksSvg(r));
  const s4 = sec(++num, 'Cumplimiento', r.kpis.plannedCount ? `${r.kpis.doneCount} de ${r.kpis.plannedCount} sesiones` : 'sin plan agendado', calendarHtml(r));
  sections.push(pair(s3, s4));
  add('Mejores potencias', 'Torq, archivos .fit e intervals.icu · sin Strava', `<p class="rpt-why">Tu mejor esfuerzo del mes en cada duración. Si sube el de 20 min, sube tu FTP; si sube el de 1 min, mejoras en ataques y repechos.</p>${bestsHtml(r, d.weightKg)}`);
  const s6 = sec(++num, 'Distribución de intensidad', 'horas por tipo de sesión', intensityHtml(r));
  const s7 = sec(++num, 'Base aeróbica', 'rodadas largas y parejas', `<p class="rpt-why">Si el pulso sube menos en la segunda mitad (desacople bajo) y produces más watts por latido (EF), tu base aeróbica mejora.</p>${aerobicSvg(r)}`);
  sections.push(pair(s6, s7));
  add('Sesiones clave', 'las que más dicen del mes', keySessionsHtml(r));
  add('Lo que muestran los datos', d.editable ? 'sugeridos por los datos · edítalos' : 'revisado por tu coach', findingsHtml(d));
  if (r.routines.length || r.srpeTotal > 0) add('Fuerza y movilidad', 'medidas con sRPE (RPE × minutos)', routinesHtml(r));
  const goals = goalsHtml(d, next);
  if (goals) add(`Enfoque para ${next}`, 'lo que acordamos', goals);

  const tags = [d.discipline, d.ftp ? `FTP ${nf.format(d.ftp)} W${d.weightKg ? ` · ${(d.ftp / d.weightKg).toFixed(1)} W/kg` : ''}` : null].filter(Boolean).map((t) => `<span class="rpt-tag">${escapeHtml(t!)}</span>`);
  if (d.goal) tags.push(`<span class="rpt-tag goal">Objetivo: ${escapeHtml(d.goal)}</span>`);

  return `
    <article class="report-sheet${d.editable ? ' editable' : ''}" aria-label="Reporte mensual de ${escapeHtml(d.athleteName)}">
      <header class="rpt-head">
        <div class="rpt-brand">TORQ<small>Reporte de entrenamiento</small></div>
        <div class="rpt-meta">
          <span>Deportista: <b>${escapeHtml(d.athleteName)}</b></span>
          ${d.coachName ? `<span>Coach: <b>${escapeHtml(d.coachName)}</b></span>` : ''}
          <span>Periodo: ${fmtDate(r.startKey)} – ${fmtDate(r.endKey, true)}${r.inProgress ? ' · en curso' : ''}</span>
        </div>
      </header>
      <h1 class="rpt-title">Reporte mensual · ${title}</h1>
      <div class="rpt-subtitle">${monthLabel(r.monthKey).replace(/^./, (c) => c.toUpperCase())}${r.inProgress ? ` · datos hasta el ${fmtDate(r.endKey)}` : ''}</div>
      ${tags.length ? `<div class="rpt-tags">${tags.join('')}</div>` : ''}
      ${coachNoteHtml(d)}
      ${sections.join('')}
      <footer class="rpt-foot">
        <span>Datos de Torq, archivos .fit, intervals.icu y sesiones registradas. Las actividades de Strava no se incluyen.</span>
        <span>${d.publishedAt ? `Publicado el ${fmtDate(d.publishedAt, true)}` : 'Borrador · sin publicar'}</span>
      </footer>
    </article>`;
}
