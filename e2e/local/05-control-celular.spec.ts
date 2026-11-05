import { test, expect } from '@playwright/test';

/**
 * Control con el celular: la laptop muestra un QR y el celular (otra
 * pestaña) controla la sesión. Sin Supabase, en desarrollo, los dos se
 * hablan por BroadcastChannel (sync/remote.ts, 'torq.remote.local').
 */
test('el celular sube y baja la dureza de la sesión de la laptop', async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('torq.remote.local', '1');
    localStorage.setItem('torq.pinon.guides', 'off');
  });
  const laptop = await context.newPage();
  await laptop.goto('/');
  await laptop.locator('#welcome-ride').click();
  await laptop.locator('#demo-link').click();
  await expect(laptop).toHaveURL(/#\/train/);
  await laptop.locator('#menuBtn').click();
  await laptop.locator('#menuRemote').click();
  await expect(laptop.locator('#remotePairQr svg')).toBeVisible();
  const code = await laptop.evaluate(() => sessionStorage.getItem('torq-remote-code'));
  expect(code).toMatch(/^[a-z0-9]{26}$/);

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.goto(`/#/remote/${code}`);
  await expect(phone.locator('#rLinkText')).toContainText('Conectado', { timeout: 10_000 });
  await expect(laptop.locator('#remoteChip')).toHaveClass(/on/);

  const press = (sel: string) => phone.locator(sel).dispatchEvent('pointerdown', { isPrimary: true, pointerType: 'touch', bubbles: true, cancelable: true });
  // con ERG: los botones mueven la intensidad
  await press('#rHarder');
  await expect(laptop.locator('#bias')).toHaveText('105%');
  await expect(phone.locator('#rLevel')).toHaveText('105%');
  await press('#rEasier');
  await expect(laptop.locator('#bias')).toHaveText('100%');
  // sin ERG: mueven la pendiente (rodillos sin cassette)
  await laptop.locator('#erg-quick').click();
  await press('#rHarder');
  await expect(laptop.locator('#bias')).toHaveText('+0.5%');
  await expect(phone.locator('#rLevelLabel')).toHaveText('pendiente');
});

test('un enlace de control inválido no rompe nada', async ({ page }) => {
  await page.goto('/#/remote/no-sirve');
  await expect(page.locator('.remote-msg')).toContainText('Este enlace no sirve');
});
