// Junta lo que dejaron las pruebas de UX (e2e/.out) en una tabla Markdown.
// Uso: node e2e/report.mjs [carpeta .out] [archivo de salida] [título]
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] ?? 'e2e/.out';
const target = process.argv[3] ?? 'docs/evaluaciones/2026-10-20-ux/resultados.md';
const title = process.argv[4] ?? 'Resultados de las pruebas de UX';

const results = JSON.parse(fs.readFileSync(path.join(outDir, 'results.json'), 'utf8'));
const journeys = new Map();
const jdir = path.join(outDir, 'journeys');
if (fs.existsSync(jdir)) {
  for (const f of fs.readdirSync(jdir)) {
    const j = JSON.parse(fs.readFileSync(path.join(jdir, f), 'utf8'));
    journeys.set(`${j.project}|${j.test}`, j);
  }
}

const rows = [];
function walk(suite, trail) {
  const here = suite.title && !suite.title.endsWith('.ts') ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const r = t.results.at(-1);
      const name = [...here, spec.title].join(' › ');
      const expectedFail = t.expectedStatus === 'failed';
      const status =
        t.status === 'expected' ? (expectedFail ? 'deuda' : 'pasa') : t.status === 'flaky' ? 'inestable' : t.status === 'skipped' ? 'omitida' : 'FALLA';
      const j = journeys.get(`${t.projectName}|${name}`);
      const firstError = r?.errors?.[0]?.message?.replace(/\x1b\[[0-9;]*m/g, '').split('\n').find((l) => l.trim()) ?? '';
      rows.push({ project: t.projectName, file: spec.file, name, status, j, error: status === 'FALLA' ? firstError.trim().slice(0, 140) : '' });
    }
  }
  for (const s of suite.suites ?? []) walk(s, here);
}
for (const s of results.suites) walk(s, []);

const count = (st) => rows.filter((r) => r.status === st).length;
const esc = (s) => String(s).replace(/\|/g, '\\|');
let md = `# ${title}\n\n`;
md += `Generado por \`npm run test:ux:report\` el ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.\n\n`;
md += `**${rows.length} pruebas:** ${count('pasa')} pasan · ${count('FALLA')} fallan · ${count('deuda')} deuda conocida (se espera que fallen) · ${count('inestable')} inestables.\n\n`;
md += `«Clics» y «campos» son lo que hizo la persona simulada; «esfuerzo» estima los segundos humanos (2.5 s por clic, 5 s por campo, 3 s por pausa a leer y 200 palabras/min en textos largos).\n\n`;

for (const file of [...new Set(rows.map((r) => r.file))]) {
  md += `## ${file}\n\n| Proyecto | Prueba | Resultado | Clics | Campos | Esfuerzo | Nota |\n|---|---|---|---:|---:|---:|---|\n`;
  for (const r of rows.filter((x) => x.file === file)) {
    const note = r.error || (r.j?.findings ?? []).map((f) => `${f.id}: ${f.text}`).join(' ') || '';
    md += `| ${r.project} | ${esc(r.name)} | ${r.status} | ${r.j?.clicks ?? ''} | ${r.j?.fills ?? ''} | ${r.j ? `${r.j.humanSeconds} s` : ''} | ${esc(note)} |\n`;
  }
  md += '\n';
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, md);
console.log(`${target}: ${rows.length} pruebas (${count('pasa')} pasan, ${count('FALLA')} fallan, ${count('deuda')} deuda)`);
