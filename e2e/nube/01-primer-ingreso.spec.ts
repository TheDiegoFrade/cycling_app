import { test, expect, user } from '../support/ux';
import { EXPERIMENTADO, NOVATA, bubbleText, dismissGuide, fillOnboarding, login } from '../support/flows';

/**
 * Primer ingreso: ¿es fácil entrar y te sientes bienvenido?
 * Personas: Ana (novata, sin FTP) y Beto (experimentado, sabe sus números).
 * Metas duras (acordadas con producto): onboarding ≤ 90 s de esfuerzo humano.
 */

test.describe('Entrar a la app', () => {
  test('login con correo y contraseña: 4 interacciones y se ve tu nombre', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await page.goto('/');
    await ux.shot('01-login');
    await login(page, ux, ana);
    await expect(page.locator('.home-screen')).toBeVisible();
    const m = ux.milestone('login');
    expect(m.interactions, 'clics + campos hasta ver Inicio').toBeLessThanOrEqual(4);
    await expect(page.locator('.home-scene-hello')).toContainText('Ana');
  });

  test('Enter en la contraseña inicia sesión (no obliga a buscar el botón)', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await page.goto('/');
    await ux.click(page.locator('#entry-toggle'), 'Entrar (abrir campos)');
    await ux.fill(page.locator('#login-email'), ana.email, 'Correo');
    await ux.fill(page.locator('#login-password'), 'secreta', 'Contraseña');
    await page.keyboard.press('Enter');
    await expect(page.locator('.home-screen')).toBeVisible({ timeout: 5000 });
  });

  test('contraseña equivocada: el error está en español y dice qué hacer', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana, 'otra-cosa');
    const box = page.locator('#login-result .error-box');
    await expect(box).toBeVisible();
    await ux.shot('02-login-error', page.locator('.entry-pill'));
    expect(await ux.englishIn(box), 'textos en inglés').toEqual([]);
    await expect(box).toContainText(/contraseña/i);
  });

  test('campos vacíos: avisa sin llamar al servidor', async ({ page, backend, ux }) => {
    await page.goto('/');
    await ux.click(page.locator('#entry-toggle'), 'Entrar (abrir campos)');
    await ux.click(page.locator('#login-password-btn'), 'Entrar');
    await expect(page.locator('#login-result')).toContainText('Escribe correo y contraseña');
    expect(backend.calls.filter((c) => c.name === 'login')).toHaveLength(0);
  });

  test('un link profundo sin sesión muestra el login y, al entrar, vuelve a esa pantalla', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await page.goto('/#/form');
    await expect(page.locator('#entry-toggle')).toBeVisible();
    await ux.click(page.locator('#entry-toggle'), 'Entrar (abrir campos)');
    await ux.fill(page.locator('#login-email'), ana.email, 'Correo');
    await ux.fill(page.locator('#login-password'), 'secreta', 'Contraseña');
    await ux.click(page.locator('#login-password-btn'), 'Entrar');
    await expect(page).toHaveURL(/#\/form/);
    await expect(page.locator('#entry-toggle')).toBeHidden();
  });
});

test.describe('Bienvenida', () => {
  test('la primera pantalla saluda por nombre, dice qué falta y la guía de Piñón no promete un botón que no existe', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    const guide = page.locator('.pinon-bubble-layer');
    await expect(guide).toBeVisible({ timeout: 5000 });
    // Para alguien nuevo no hay nada agendado: la guía no debe decir «Empezar a rodar»
    // si ese botón no está en pantalla.
    const guideText = await bubbleText(page);
    await ux.shot('03-bienvenida');
    const hasRideButton = await page.locator('.home-ride-btn[data-ride-id]').count();
    if (/Empezar a rodar/.test(guideText)) expect(hasRideButton, 'la guía menciona «Empezar a rodar» y el botón no existe').toBeGreaterThan(0);
    await expect(page.locator('#home-open-onboarding')).toBeVisible();
  });

  test('las guías se pueden apagar en 1 clic y no vuelven', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await expect(page.locator('.pinon-bubble-layer')).toBeVisible({ timeout: 5000 });
    await ux.click(page.locator('.pinon-btn-later'), 'No mostrar más guías');
    await page.goto('/#/plan');
    await page.waitForTimeout(2000);
    await expect(page.locator('.pinon-bubble-layer')).toHaveCount(0);
  });
});

test.describe('Cuestionario inicial', () => {
  for (const [name, persona] of [
    ['Ana (novata, sin FTP)', NOVATA],
    ['Beto (experimentado)', EXPERIMENTADO],
  ] as const) {
    test(`${name}: lo completa y queda claro qué sigue`, async ({ page, backend, ux }) => {
      const u = user(name.startsWith('Ana') ? 'ana' : 'beto');
      backend.users.push(u);
      await login(page, ux, u);
      await dismissGuide(page, ux);
      const start = ux.milestone('antes-cuestionario');
      await ux.click(page.locator('#home-open-onboarding'), 'Contestarlo ahora');
      await ux.shot(`04-cuestionario-${u.id}`);
      await fillOnboarding(page, ux, persona);
      const end = ux.milestone('cuestionario');
      const cost = { interactions: end.interactions - start.interactions, humanSeconds: end.humanSeconds - start.humanSeconds };
      ux.metrics['cuestionario.interacciones'] = cost.interactions;
      ux.metrics['cuestionario.segundos'] = cost.humanSeconds;
      // guardó en la nube
      await expect.poll(() => backend.table('profiles').some((r) => r.user_id === u.id && r.sex)).toBe(true);
      // Lo que sigue tiene que estar a la vista: el cuestionario es «antes de
      // tu plan», así que al guardar se abre «Crear tu plan» en Plan.
      await expect(page).toHaveURL(/#\/plan/);
      await expect(page.locator('#coach-modal')).toBeVisible();
      await expect(page.locator('#plan-open-onboarding')).toHaveCount(0);
      await ux.shot(`05-despues-cuestionario-${u.id}`);
    });
  }

  test('meta dura: el cuestionario cuesta ≤ 90 s de esfuerzo', async ({ page, backend, ux }) => {
    test.info().annotations.push({ type: 'deuda-ux', description: 'UX-05: 28 preguntas obligatorias en un solo formulario (~2.5 min). Ver documento §Cuestionario.' });
    test.fail(true, 'UX-05 conocido: el cuestionario es más largo que la meta; se documenta la propuesta en dos tiempos.');
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    const start = ux.milestone('antes');
    await ux.click(page.locator('#home-open-onboarding'), 'Contestarlo ahora');
    await fillOnboarding(page, ux, NOVATA);
    const end = ux.milestone('despues');
    expect(end.humanSeconds - start.humanSeconds).toBeLessThanOrEqual(90);
  });

  test('si falta un dato, lo señala en el campo (no solo un texto al pie)', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#home-open-onboarding'), 'Contestarlo ahora');
    const m = page.locator('#onboarding-modal');
    await ux.click(m.locator('#ob-sex .ob-chip', { hasText: 'Mujer' }), 'Sexo');
    await ux.click(m.locator('#onboarding-submit'), 'Guardar (incompleto)');
    await expect(page.locator('#onboarding-status')).not.toBeEmpty();
    await ux.shot('06-cuestionario-falta-dato');
    // El campo que falta queda marcado y a la vista.
    const flagged = m.locator('[aria-invalid="true"], .ob-missing');
    await expect(flagged.first()).toBeVisible();
    await expect(flagged.first()).toBeInViewport();
  });

  test('«Saltar por ahora» no te deja atorada: la app sigue usable y el aviso sigue ahí', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#home-open-onboarding'), 'Contestarlo ahora');
    await ux.click(page.locator('#onboarding-skip'), 'Saltar por ahora');
    await expect(page.locator('#onboarding-modal')).toHaveCount(0);
    await expect(page.locator('#home-open-onboarding')).toBeVisible();
    await expect(page.locator('#gen-create')).toBeEnabled();
  });
});
