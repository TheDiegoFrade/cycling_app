import { test, expect, user } from '../support/ux';
import { bubbleText } from '../support/flows';
import { seedActivePlan, seedProfile, seedWorkout } from '../support/seed';

/**
 * Persona que vuelve con su plan: abrir la app y estar rodando sin pensar.
 * Meta dura: ≤ 5 clics de abrir la app a estar pedaleando.
 */

test('Beto vuelve con entreno hoy: Inicio → conectar rodillo en 1 clic', async ({ page, backend, ux }) => {
  const u = user('beto');
  backend.users.push(u);
  seedProfile(backend, u, 'beto');
  seedActivePlan(backend, u, 'Bajar 5 min mi tiempo en el XC estatal');
  seedWorkout(backend, u, { template: 'threshold', minutes: 60, name: 'Umbral 4×8' });
  await backend.seedSession(page, u);
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  await page.goto('/');
  await expect(page.locator('.home-scene')).toContainText('Umbral 4×8');
  await ux.shot('30-inicio-hoy-toca');
  await ux.click(page.locator('.home-ride-btn').first(), 'Empezar a rodar');
  await expect(page).toHaveURL(/#\/prepare/);
  await expect(page.locator('#trainer-connect')).toBeVisible();
  await ux.shot('31-antes-de-empezar');
  // con rodillo real: conectar (1) + elegir en el diálogo del navegador (1) + Empezar (1)
  const m = ux.milestone('prepare');
  expect(m.clicks + 3, 'clics totales con rodillo real').toBeLessThanOrEqual(5);
});

test('Beto vuelve tras 6 días sin rodar: Piñón lo recibe sin regañar', async ({ page, backend, ux }) => {
  const u = user('beto');
  backend.users.push(u);
  seedProfile(backend, u, 'beto');
  seedWorkout(backend, u, { template: 'z2', minutes: 45, name: 'Base Z2 · 45 min' });
  const started = new Date(Date.now() - 6 * 86_400_000);
  backend.table('sessions').push({
    id: 's-1',
    user_id: u.id,
    workout_name: 'Base Z2',
    started_at: started.toISOString(),
    finished_at: new Date(started.getTime() + 45 * 60_000).toISOString(),
    ftp: 265,
    training_stress_score: 40,
    source: 'torq',
  });
  await backend.seedSession(page, u);
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  await page.goto('/');
  const bubble = page.locator('.pinon-bubble-layer');
  await bubble.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  if (await bubble.isVisible()) {
    const text = await bubbleText(page);
    await ux.shot('32-bienvenida-de-regreso');
    expect(text).not.toMatch(/flojo|perezos|abandon/i);
  } else {
    ux.finding('UX-REG', 'No apareció la burbuja de «bienvenido de vuelta» tras 6 días sin rodar.');
  }
});
