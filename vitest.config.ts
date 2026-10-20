import { configDefaults, defineConfig } from 'vitest/config';

// e2e/ son pruebas de Playwright (npm run test:ux), no de Vitest.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
