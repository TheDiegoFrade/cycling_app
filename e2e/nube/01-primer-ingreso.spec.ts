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

  test('la entrada dice que Torq es para Google Chrome en computadora', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#entry-browser')).toHaveText('Torq está hecho para Google Chrome en computadora.');
    await expect(page.locator('#entry-browser')).not.toHaveClass(/warn/);
  });

  test('en un navegador sin Bluetooth (Safari, Firefox) se avisa desde la entrada y en Inicio', async ({ page, backend, ux }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as unknown as { bluetooth?: unknown }).bluetooth;
    });
    const ana = user('ana');
    backend.users.push(ana);
    await page.goto('/');
    await expect(page.locator('#entry-browser')).toHaveClass(/warn/);
    await expect(page.locator('#entry-browser')).toContainText('Google Chrome en tu computadora');
    await login(page, ux, ana);
    const banner = page.locator('#browser-banner');
    await expect(banner).toContainText('Usa Google Chrome en tu computadora.');
    await ux.click(banner.locator('#browser-banner-close'), 'Entendido');
    await expect(banner).toHaveCount(0);
    // cerrado: no vuelve a salir en esta sesión
    await page.goto('/#/plan');
    await page.goto('/#/home');
    await expect(page.locator('.home-screen')).toBeVisible();
    await expect(page.locator('#browser-banner')).toHaveCount(0);
  });

  test('en Edge (tiene Bluetooth, pero no es Chrome) también recomienda Chrome', async ({ page, backend, ux }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0' });
    });
    const ana = user('ana');
    backend.users.push(ana);
    await page.goto('/');
    await expect(page.locator('#entry-browser')).toContainText('probado en Google Chrome');
    await login(page, ux, ana);
    await expect(page.locator('#browser-banner')).toContainText('Usa Google Chrome en tu computadora.');
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

  test('otra cuenta en el mismo navegador: tras «Cerrar sesión» en Perfil entra a su bienvenida, con las guías de Piñón', async ({ page, backend, ux }) => {
    const ana = user('ana');
    const beto = user('beto');
    backend.users.push(ana, beto);
    await login(page, ux, ana);
    await expect(page.locator('.home-screen')).toBeVisible();
    // Ana ya vio la guía de Plan y platicó con Piñón en este navegador
    await page.evaluate(() => {
      localStorage.setItem('torq.pinon.guide.plan', '1');
      localStorage.setItem('torq.pinon.chat.log', '[{"from":"user","text":"hola"}]');
    });
    await page.goto('/#/profile');
    await ux.click(page.locator('#signout'), 'Cerrar sesión');
    await expect(page.locator('#entry-toggle')).toBeVisible();
    await expect(page).toHaveURL(/#\/home$/);
    await ux.click(page.locator('#entry-toggle'), 'Entrar (abrir campos)');
    await ux.fill(page.locator('#login-email'), beto.email, 'Correo');
    await ux.fill(page.locator('#login-password'), 'secreta', 'Contraseña');
    await ux.click(page.locator('#login-password-btn'), 'Entrar');
    await expect(page.locator('.home-welcome')).toBeVisible();
    await expect(page).toHaveURL(/#\/home$/);
    const left = await page.evaluate(() => [localStorage.getItem('torq.pinon.guide.plan'), localStorage.getItem('torq.pinon.chat.log')]);
    expect(left, 'lo de Ana no se queda para Beto').toEqual([null, null]);
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
  test('la primera pantalla da la bienvenida por nombre, con Piñón y dos caminos claros', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    const welcome = page.locator('.home-welcome');
    await expect(welcome).toBeVisible();
    // sin sexo en el perfil todavía: forma neutra, no «Bienvenido»
    await expect(welcome).toContainText('Te damos la bienvenida, Ana');
    await expect(welcome.locator('.pinon')).toBeVisible();
    await expect(page.locator('#welcome-plan')).toBeVisible();
    await expect(page.locator('#welcome-ride')).toBeVisible();
    // la bienvenida ya trae a Piñón: no se encima la guía ni el aviso del cuestionario
    await page.waitForTimeout(2000);
    await expect(page.locator('.pinon-bubble-layer')).toHaveCount(0);
    await expect(page.locator('#home-open-onboarding')).toHaveCount(0);
    await ux.shot('03-bienvenida');
  });

  test('«Rodar 30 min suave ahora»: de la bienvenida a «Antes de empezar» en 1 clic', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    const before = ux.milestone('inicio');
    await ux.click(page.locator('#welcome-ride'), 'Rodar 30 min suave ahora');
    await expect(page).toHaveURL(/#\/prepare/);
    await expect(page.locator('body')).toContainText('Z2 aeróbico · 30 min');
    expect(ux.clicks - before.clicks).toBe(1);
    await expect.poll(() => backend.table('workouts').length).toBe(1);
  });

  test('las guías se pueden apagar en 1 clic y no vuelven', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await page.goto('/#/form');
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
      await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
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

  // Decisión de producto (20-oct): todas las preguntas son necesarias y no se
  // acorta. Lo que se exige es que sea guiado y ameno; el esfuerzo se mide y
  // se reporta (~4 min), sin meta de tiempo.
  test('guiado por Piñón: un paso a la vez, con progreso y ≤ 8 preguntas por pantalla', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    const start = ux.milestone('antes');
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    const m = page.locator('#onboarding-modal');
    await expect(m.locator('.ob-section:visible')).toHaveCount(1);
    await expect(m.locator('#ob-guide-text')).toContainText('Hola');
    await expect(m.locator('.ob-step-dot[aria-current="step"]')).toHaveText('1');
    await ux.shot('07-cuestionario-paso-1', m);
    // cuántas preguntas tiene cada paso (grupos de opciones + campos visibles)
    const perStep: number[] = [];
    for (let n = 1; n <= 8; n++) {
      const sec = m.locator(`.ob-section[data-step="${n}"]`);
      perStep.push(await sec.evaluate((el) => {
        el.removeAttribute('hidden');
        const count = el.querySelectorAll('.ob-chips, .ob-options, input:not([type=checkbox]):not([type=file]), textarea, .ob-toggle').length;
        el.setAttribute('hidden', '');
        return count;
      }));
    }
    await m.locator('.ob-section[data-step="1"]').evaluate((el) => el.removeAttribute('hidden'));
    ux.metrics['preguntas-por-paso'] = perStep.join(' · ');
    expect(Math.max(...perStep), `preguntas por paso: ${perStep.join(', ')}`).toBeLessThanOrEqual(8);
    await page.locator('#onboarding-close').click();
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan (de nuevo)');
    await fillOnboarding(page, ux, NOVATA);
    const end = ux.milestone('despues');
    ux.metrics['cuestionario.segundos'] = end.humanSeconds - start.humanSeconds;
  });

  test('Piñón cambia de tono al elegir el sexo y «Atrás» conserva lo contestado', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    const m = page.locator('#onboarding-modal');
    await ux.click(m.locator('#ob-sex .ob-chip', { hasText: 'Mujer' }), 'Sexo');
    await m.locator('[role=spinbutton][aria-label="Día"]').focus();
    await page.keyboard.type('15031992', { delay: 30 });
    await ux.fill(m.locator('#ob-weight'), '68', 'Peso');
    await ux.fill(m.locator('#ob-height'), '165', 'Altura');
    for (let n = 1; n < 8; n++) {
      // salta rápido al paso 8 contestando lo mínimo de cada paso
      if (n > 1) await m.evaluate((el, step) => {
        const sec = el.querySelector(`.ob-section[data-step="${step}"]`)!;
        sec.querySelectorAll('.ob-chips, .ob-options').forEach((g) => (g.querySelector('.ob-chip, .ob-option') as HTMLElement | null)?.click());
        sec.querySelectorAll<HTMLInputElement>('input[type=number]:not(:disabled)').forEach((i) => { if (!i.closest('label')?.querySelector('.ob-optional')) { i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
        sec.querySelectorAll<HTMLInputElement>('#ob-no-ftp, #ob-no-hrmax, #ob-no-resting-hr').forEach((c) => { if (!c.checked) c.click(); });
      }, n);
      await m.locator('#onboarding-next').click();
    }
    await expect(m.locator('#ob-guide-text')).toContainText('¿Lista? Último paso.');
    await ux.shot('08-cuestionario-paso-8', m);
    // volver al paso 1 por los puntitos: lo contestado sigue ahí
    await m.locator('.ob-step-dot[data-go="1"]').click();
    await expect(m.locator('#ob-weight')).toHaveValue('68');
    await expect(m.locator('#ob-sex .ob-chip.on')).toHaveText('Mujer');
  });

  test('si lo cierra a la mitad, al volver sigue donde se quedó con lo contestado', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    const m = page.locator('#onboarding-modal');
    await ux.click(m.locator('#ob-sex .ob-chip', { hasText: 'Mujer' }), 'Sexo');
    await m.locator('[role=spinbutton][aria-label="Día"]').focus();
    await page.keyboard.type('15031992', { delay: 30 });
    await ux.fill(m.locator('#ob-weight'), '68', 'Peso');
    await ux.fill(m.locator('#ob-height'), '165', 'Altura');
    await ux.click(m.locator('#onboarding-next'), 'Siguiente');
    // Salud: «No» a las dos de lesiones ya cuenta como sin lesiones
    await ux.click(m.locator('#ob-conditions .ob-chip', { hasText: 'Ninguna' }), 'Ninguna');
    await ux.click(m.locator('#ob-medication .ob-chip', { hasText: 'No' }), 'Medicamento');
    await ux.click(m.locator('#ob-recent-injury .ob-chip', { hasText: 'No' }), 'Lesión reciente');
    await ux.click(m.locator('#ob-injury-limits .ob-chip', { hasText: 'No' }), 'Lesión hoy');
    await expect(m.locator('#ob-injuries-box')).toBeHidden();
    await ux.click(m.locator('#onboarding-next'), 'Siguiente');
    await expect(m.locator('.ob-section[data-step="3"]')).toBeVisible();
    // del paso 2 en adelante el encabezado es compacto
    await expect(m).toHaveClass(/ob-compact/);
    await page.waitForTimeout(400);
    await ux.click(m.locator('#onboarding-close'), 'Cerrar a la mitad');
    await expect(m).toHaveCount(0);
    // vuelve: sigue en el paso 3, con lo contestado
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan (otra vez)');
    await expect(page.locator('.ob-section[data-step="3"]')).toBeVisible();
    await expect(page.locator('#onboarding-status')).toHaveText('Seguimos donde te quedaste.');
    await page.locator('.ob-step-dot[data-go="1"]').click();
    await expect(page.locator('#ob-weight')).toHaveValue('68');
    await expect(page.locator('#ob-sex .ob-chip.on')).toHaveText('Mujer');
    await expect(page.locator('#ob-birth-date')).toHaveValue('1992-03-15');
    await page.locator('.ob-step-dot[data-go="2"]').click();
    await expect(page.locator('#ob-injury-limits .ob-chip.on')).toHaveText('No');
    await expect(page.locator('#ob-no-injuries')).toBeChecked();
  });

  test('otras actividades: «Sí» muestra la primera fila; «No, solo bici» la quita', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    const m = page.locator('#onboarding-modal');
    await m.locator('.ob-section[data-step="7"]').evaluate((el) => el.removeAttribute('hidden'));
    await ux.click(m.locator('#ob-other-any .ob-chip', { hasText: 'Sí' }), 'Sí');
    await expect(m.locator('.ob-other-row')).toHaveCount(1);
    await expect(m.locator('#ob-no-other')).not.toBeChecked();
    await ux.click(m.locator('#ob-other-any .ob-chip', { hasText: 'No, solo bici' }), 'No');
    await expect(m.locator('.ob-other-row')).toHaveCount(0);
    await expect(m.locator('#ob-other-box')).toBeHidden();
    await expect(m.locator('#ob-no-other')).toBeChecked();
  });

  test('Tus números: Piñón explica el FTP y, si no lo sabe, cuánto usa y cómo ajustarlo', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    const m = page.locator('#onboarding-modal');
    // Ana: mujer, 68 kg, apenas arranca → ~100 W
    await ux.click(m.locator('#ob-sex .ob-chip', { hasText: 'Mujer' }), 'Sexo');
    await m.locator('[role=spinbutton][aria-label="Día"]').focus();
    await page.keyboard.type('15031992', { delay: 30 });
    await ux.fill(m.locator('#ob-weight'), '68', 'Peso');
    await ux.fill(m.locator('#ob-height'), '165', 'Altura');
    await m.evaluate((el) => {
      (el.querySelector('#ob-fitness [data-level="sedentary"]') as HTMLElement).click();
      (el.querySelector('#ob-experience [data-level="new_to_cycling"]') as HTMLElement).click();
    });
    await m.evaluate((el) => {
      el.querySelectorAll<HTMLElement>('.ob-step-dot').forEach((d) => ((d as HTMLButtonElement).disabled = false));
      (el.querySelector('.ob-step-dot[data-go="6"]') as HTMLElement).click();
    });
    await expect(m.locator('#ob-guide-text')).toContainText('El FTP es la potencia (en watts) que podrías sostener más o menos una hora');
    await expect(m.locator('#ob-ftp-help')).toBeHidden();
    await ux.click(m.locator('label.ob-toggle:has(#ob-no-ftp)'), 'No sé mi FTP');
    await expect(m.locator('#ob-ftp-help')).toContainText('Arrancas con unos 100 W');
    await ux.shot('09-cuestionario-ftp', m);
  });

  test('si falta un dato, lo señala en el campo (no solo un texto al pie)', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    const m = page.locator('#onboarding-modal');
    await ux.click(m.locator('#ob-sex .ob-chip', { hasText: 'Mujer' }), 'Sexo');
    await ux.click(m.locator('#onboarding-next'), 'Siguiente (incompleto)');
    await expect(page.locator('#onboarding-status')).not.toBeEmpty();
    await ux.shot('06-cuestionario-falta-dato');
    // El campo que falta queda marcado y a la vista.
    const flagged = m.locator('[aria-invalid="true"], .ob-missing');
    await expect(flagged.first()).toBeVisible();
    await expect(flagged.first()).toBeInViewport();
  });

  test('«Saltar por ahora» no te deja atorada: la app sigue usable y el camino al plan sigue ahí', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await dismissGuide(page, ux);
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    await ux.click(page.locator('#onboarding-skip'), 'Saltar por ahora');
    await expect(page.locator('#onboarding-modal')).toHaveCount(0);
    await expect(page.locator('#welcome-plan')).toBeVisible();
    await expect(page.locator('#gen-create')).toBeEnabled();
  });
});

test.describe('Cuestionario en celular', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('fecha de nacimiento con el selector nativo y la primera pantalla cabe sin hacer scroll', async ({ page, backend, ux }) => {
    const ana = user('ana');
    backend.users.push(ana);
    await login(page, ux, ana);
    await page.locator('#welcome-plan').tap();
    const m = page.locator('#onboarding-modal');
    await expect(m).toBeVisible();
    // táctil: input de fecha nativo (con su teclado/rueda), no los campos segmentados
    await expect(m.locator('.date-picker')).toHaveCount(0);
    await expect(m.locator('#ob-birth-date')).toBeVisible();
    await expect(m.locator('#ob-birth-date')).toHaveAttribute('type', 'date');
    await m.locator('#ob-sex .ob-chip', { hasText: 'Mujer' }).tap();
    await m.locator('#ob-birth-date').fill('1992-03-15');
    await m.locator('#ob-weight').fill('68');
    await m.locator('#ob-height').fill('165');
    // sin scroll: Siguiente se ve completo y la página no se ensancha
    const vh = page.viewportSize()!.height;
    const next = await m.locator('#onboarding-next').boundingBox();
    expect(next!.y + next!.height).toBeLessThanOrEqual(vh);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await m.locator('#ob-weight').evaluate((el) => getComputedStyle(el).fontSize), '16px: el teclado del celular no hace zoom').toBe('16px');
    await ux.shot('09-cuestionario-celular', page.locator('body'));
    await m.locator('#onboarding-next').tap();
    await expect(m.locator('.ob-step-dot[aria-current="step"]')).toHaveText('2');
  });
});
