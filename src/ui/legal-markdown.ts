// Markdown mínimo para mostrar los textos legales (src/core/terms-text.ts,
// privacy-text.ts): títulos ##, listas, tablas simples, negritas y párrafos.
// El texto es nuestro (no lo escribe el usuario), pero igual se escapa.
import { escapeHtml } from './workout-cover';

const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

export function legalHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let table: string[][] | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const closeTable = () => {
    if (!table) return;
    const [head, ...rows] = table.filter((r) => !r.every((c) => /^-+$/.test(c.trim())));
    out.push(`<table class="legal-table"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    table = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (/^\|.*\|$/.test(line.trim())) {
      closeList();
      (table ??= []).push(line.trim().slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    closeTable();
    const h = /^#{2,3} (.+)/.exec(line);
    const ul = /^\s*- (.+)/.exec(line);
    const ol = /^\s*\d+\. (.+)/.exec(line);
    if (h) {
      closeList();
      out.push(`<h3>${inline(h[1])}</h3>`);
    } else if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (line.trim()) {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    } else closeList();
  }
  closeList();
  closeTable();
  return out.join('');
}
