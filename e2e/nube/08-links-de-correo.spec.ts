import { test, expect, user } from '../support/ux';
import { devices, type Page, type Request } from '@playwright/test';
import type { MockSupabase } from '../support/mock-supabase';

/**
 * Links de los correos de Supabase (ver docs/cobro-y-registro.md):
 * invitación (lista de espera / coach) y «¿Olvidaste tu contraseña?».
 * El token se canjea solo al guardar la contraseña: abrir el link y cerrar
 * la ventana no lo gasta, y el de recuperación sirve en cualquier
 * dispositivo (token_hash, no el code_verifier de PKCE).
 */

const INVITE = '/?signup=1&next=home&token_hash=tok123&type=invite';
const RECOVERY = '/?reset=1&token_hash=rec123&type=recovery';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };

/** Cuerpos de las llamadas a /auth/v1/verify (para ver el type). */
function verifyBodies(page: Page): Record<string, unknown>[] {
  const seen: Record<string, unknown>[] = [];
  page.on('request', (r: Request) => {
    if (r.url().includes('/auth/v1/verify') && r.method() === 'POST') seen.push(r.postDataJSON());
  });
  return seen;
}

function invited(backend: MockSupabase) {
  const u = user('nuevo', 'nuevo@correo.com');
  backend.users.push(u);
  backend.invitedEmail = u.email;
  return u;
}

test.describe('links de correo', () => {
  test('invitación: abrir el link no lo gasta; se canjea al crear la contraseña', async ({ page, backend, ux }) => {
    invited(backend);
    const verifies = verifyBodies(page);
    await page.goto(INVITE);
    const form = page.locator('#signup-form');
    await expect(form).toContainText('Te damos la bienvenida a Torq');
    await expect(page).toHaveURL(/\/#?\/?/); // el token ya no queda en la barra de direcciones
    expect(page.url()).not.toContain('token_hash');
    await page.waitForTimeout(300);
    expect(verifies).toHaveLength(0);
    await ux.shot('81-invitacion-crear-contrasena');
    await ux.fill(form.locator('#signup-pw-1'), 'contraseña-larga', 'Contraseña');
    await ux.fill(form.locator('#signup-pw-2'), 'contraseña-larga', 'Repetir');
    await ux.click(form.locator('button[type=submit]'), 'Crear contraseña');
    await expect(page.locator('#signup-backdrop')).toHaveCount(0);
    expect(verifies).toEqual([expect.objectContaining({ type: 'invite', token_hash: 'tok123' })]);
    expect(backend.calls.some((c) => c.name === 'update_user')).toBe(true);
    await expect(page).toHaveURL(/#\/home/);
  });

  test('invitación: cerrar sin crear la contraseña deja el link vivo', async ({ page, backend }) => {
    invited(backend);
    const verifies = verifyBodies(page);
    await page.goto(INVITE);
    await expect(page.locator('#signup-form')).toBeVisible();
    await page.goto('/'); // cierra / se va
    await page.goto(INVITE); // vuelve a abrir el correo
    await expect(page.locator('#signup-form')).toBeVisible();
    expect(verifies).toHaveLength(0);
  });

  test('invitación: contraseña corta, que no coincide o débil; reintenta sin volver a canjear', async ({ page, backend }) => {
    invited(backend);
    const verifies = verifyBodies(page);
    await page.goto(INVITE);
    const form = page.locator('#signup-form');
    const status = form.locator('#signup-status');
    await form.locator('#signup-pw-1').fill('1234567');
    await form.locator('#signup-pw-2').fill('1234567');
    await form.locator('button[type=submit]').click();
    await expect(status).toHaveText('Usa al menos 8 caracteres.');
    await form.locator('#signup-pw-1').fill('12345678');
    await form.locator('#signup-pw-2').fill('12345679');
    await form.locator('button[type=submit]').click();
    await expect(status).toHaveText('Las dos no coinciden.');
    expect(verifies).toHaveLength(0);
    let weak = true;
    await page.route('http://supabase.test/auth/v1/user**', (r) =>
      r.request().method() === 'PUT' && weak
        ? ((weak = false), r.fulfill({ status: 422, headers: cors, body: JSON.stringify({ code: 422, error_code: 'weak_password', msg: 'Password is known to be weak and easy to guess' }) }))
        : r.fallback(),
    );
    await form.locator('#signup-pw-1').fill('password');
    await form.locator('#signup-pw-2').fill('password');
    await form.locator('button[type=submit]').click();
    await expect(status).toContainText('muy fácil de adivinar');
    await form.locator('#signup-pw-1').fill('contraseña-larga');
    await form.locator('#signup-pw-2').fill('contraseña-larga');
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#signup-backdrop')).toHaveCount(0);
    expect(verifies).toHaveLength(1);
  });

  test('invitación usada o vencida: lo dice en la app, cuánto dura y qué hacer', async ({ page, backend, ux }) => {
    invited(backend);
    page.on('dialog', () => {
      throw new Error('no debe usar alert()');
    });
    await page.route('http://supabase.test/auth/v1/verify**', (r) =>
      r.fulfill({ status: 403, headers: cors, body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }) }),
    );
    await page.goto(INVITE);
    const form = page.locator('#signup-form');
    await form.locator('#signup-pw-1').fill('contraseña-larga');
    await form.locator('#signup-pw-2').fill('contraseña-larga');
    await form.locator('button[type=submit]').click();
    await expect(form).toContainText('ya se usó o venció (dura 24 horas)');
    await expect(form.locator('#signup-pw-1')).toHaveCount(0);
    await ux.shot('82-invitacion-vencida');
    await form.getByRole('button', { name: 'Entendido' }).click();
    await expect(page.locator('#signup-backdrop')).toHaveCount(0);
  });

  test('recuperación (link nuevo): sirve sin sesión previa, en cualquier navegador', async ({ page, backend, ux }) => {
    invited(backend);
    const verifies = verifyBodies(page);
    await page.goto(RECOVERY);
    const form = page.locator('#pw-reset-form');
    await expect(form).toContainText('Nueva contraseña');
    expect(verifies).toHaveLength(0);
    await ux.fill(form.locator('#pw-reset-pw-1'), 'contraseña-nueva', 'Contraseña');
    await ux.fill(form.locator('#pw-reset-pw-2'), 'contraseña-nueva', 'Repetir');
    await ux.click(form.locator('button[type=submit]'), 'Guardar');
    await expect(page.locator('#pw-reset-done-backdrop')).toContainText('Guardamos tu contraseña nueva');
    expect(verifies).toEqual([expect.objectContaining({ type: 'recovery', token_hash: 'rec123' })]);
    expect(backend.calls.some((c) => c.name === 'update_user')).toBe(true);
    await ux.shot('83-recuperacion-lista');
  });

  test('recuperación (link viejo con ?code) en otro navegador: aviso claro, sin alert()', async ({ page }) => {
    page.on('dialog', () => {
      throw new Error('no debe usar alert()');
    });
    await page.goto('/?reset=1&code=11111111-2222-3333-4444-555555555555');
    const notice = page.locator('#pw-reset-notice-backdrop');
    await expect(notice).toContainText('Este link ya no sirve');
    await expect(notice).toContainText('otro navegador');
    await notice.getByRole('button', { name: 'Entendido' }).click();
    await expect(notice).toHaveCount(0);
  });

  test('pedir otro correo de recuperación muy seguido: lo explica', async ({ page }) => {
    await page.route('http://supabase.test/auth/v1/recover**', (r) =>
      r.fulfill({ status: 429, headers: cors, body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 58 seconds.' }) }),
    );
    await page.goto('/');
    await page.locator('#entry-toggle').click();
    await page.locator('#login-email').fill('nuevo@correo.com');
    await page.locator('#login-forgot').click();
    await expect(page.locator('#login-result')).toContainText('Ya te mandamos un correo hace un momento');
  });
});

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
test.describe('links de correo en el celular', () => {
  test.use(iphone);
  test('invitación abierta en el celular: el formulario cabe y funciona', async ({ page, backend, ux }) => {
    invited(backend);
    await page.goto(INVITE);
    const form = page.locator('#signup-form');
    await expect(form).toBeVisible();
    const box = (await form.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await ux.shot('84-invitacion-celular');
    await form.locator('#signup-pw-1').fill('contraseña-larga');
    await form.locator('#signup-pw-2').fill('contraseña-larga');
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#signup-backdrop')).toHaveCount(0);
  });
});
