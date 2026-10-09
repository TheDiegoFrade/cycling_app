import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// supabase/functions/_shared/core.gen.js es src/core empaquetado para Deno: si
// alguien cambia src/core sin correr `npm run build:edge`, el reporte mensual
// sin coach calcularía con la versión vieja.
describe('core.gen.js', () => {
  it('está al día con src/core', () => {
    expect(() => execFileSync('node', ['scripts/build-edge.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
