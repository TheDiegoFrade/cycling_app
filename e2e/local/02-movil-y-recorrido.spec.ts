import { devices } from '@playwright/test';
import { test, expect } from '../support/ux';
import { openChat } from '../support/flows';

/**
 * Recorrido de todas las pantallas del atleta: cada una tiene título, una
 * acción clara, nada en inglés, y en celular no se sale de la pantalla.
 */

const SCREENS = [
  { hash: 'home', heading: /hoy toca|Nada agendado/i },
  { hash: 'plan', heading: /Plan/ },
  { hash: 'library', heading: /Historial/ },
  { hash: 'form', heading: /Forma/ },
  { hash: 'profile', heading: /Perfil/ },
  { hash: 'prepare', heading: /Elige un workout|Antes de empezar/ },
  { hash: 'session', heading: /sesión|Resumen/i },
];

test.describe('Escritorio', () => {
  for (const s of SCREENS) {
    test(`#/${s.hash}: título, acción a la vista, sin inglés, sin errores`, async ({ page, ux, consoleErrors }) => {
      await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
      await page.goto(`/#/${s.hash}`);
      await page.waitForTimeout(600);
      await expect(page.locator('body')).toContainText(s.heading);
      // al menos una acción (botón o link) visible sin hacer scroll
      const actions = page.locator('main button:visible, main a:visible, .screen button:visible, .screen a:visible');
      expect(await actions.count()).toBeGreaterThan(0);
      expect(await ux.englishIn(), 'textos en inglés').toEqual([]);
      expect(consoleErrors, 'errores de consola').toEqual([]);
      await ux.shot(`50-pantalla-${s.hash}`);
    });
  }

  test('una ruta que no existe lleva a Inicio', async ({ page }) => {
    await page.goto('/#/no-existe');
    await expect(page.locator('.home-screen')).toBeVisible();
  });
});

test.describe('Celular (iPhone 13)', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  for (const s of SCREENS) {
    test(`#/${s.hash}: sin scroll horizontal`, async ({ page, ux }) => {
      await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
      await page.goto(`/#/${s.hash}`);
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (s.hash === 'home' || s.hash === 'plan') await ux.shot(`51-movil-${s.hash}`);
      expect(overflow, 'px que se salen a lo ancho').toBeLessThanOrEqual(1);
    });
  }

  test('Piñón: el chat se abre en 1 toque, cabe en la pantalla y no tapa la barra de abajo', async ({ page, ux }) => {
    await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
    await page.goto('/#/home');
    const launcher = page.locator('.pinon-chat-launcher');
    const tabbar = page.locator('.tabbar');
    await expect(launcher).toBeVisible();
    if (await tabbar.isVisible()) {
      const a = (await launcher.boundingBox())!;
      const b = (await tabbar.boundingBox())!;
      expect(a.y + a.height, 'Piñón encima de la barra de pestañas').toBeLessThanOrEqual(b.y + 1);
    }
    await openChat(page, ux);
    const box = (await page.locator('aside.pinon-chat').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    await expect(page.locator('aside.pinon-chat input[name=q]')).toBeInViewport();
    await ux.shot('52-movil-chat');
  });
});
