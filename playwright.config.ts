import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de UX de punta a punta (ver docs/evaluaciones/2026-10-20-ux-flujos.md).
 * Dos copias de la app:
 * - local (5173): sin Supabase, como corre sin cuenta.
 * - nube (5174): `--mode e2e`, Supabase apuntado a un servidor falso que cada
 *   test controla (e2e/support/mock-supabase.ts) — login, Piñón y coach IA sin red.
 */
const chromium = { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 }, locale: 'es-MX', timezoneId: 'America/Mexico_City' };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  // las mediciones de tiempo (respuestas «al instante») no aguantan más carga
  workers: 3,
  reporter: [['list'], ['json', { outputFile: 'e2e/.out/results.json' }]],
  outputDir: 'e2e/.out/artifacts',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'local', testMatch: /local\/.*\.spec\.ts/, use: { ...chromium, baseURL: 'http://localhost:5173' } },
    { name: 'nube', testMatch: /nube\/.*\.spec\.ts/, use: { ...chromium, baseURL: 'http://localhost:5174' } },
  ],
  webServer: [
    { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
    { command: 'npx vite --port 5174 --strictPort --mode e2e', url: 'http://localhost:5174', reuseExistingServer: true },
  ],
});
