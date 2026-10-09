// Empaqueta src/core/edge-entry.ts para las Edge Functions (ver ese archivo).
// Uso: npm run build:edge. Con --check no escribe: falla si el archivo no está al día.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

export const OUT = 'supabase/functions/_shared/core.gen.js';
const BANNER = '// GENERADO por scripts/build-edge.mjs desde src/core/edge-entry.ts. No lo edites: corre `npm run build:edge`.';

export async function bundle() {
  const res = await build({
    entryPoints: ['src/core/edge-entry.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    banner: { js: BANNER },
    logLevel: 'silent',
  });
  return res.outputFiles[0].text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await bundle();
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== code) {
      console.error(`${OUT} no está al día: corre npm run build:edge`);
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, code);
    console.log(`escrito ${OUT} (${(code.length / 1024).toFixed(1)} KB)`);
  }
}
