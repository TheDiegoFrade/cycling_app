import { test, expect, user } from '../support/ux';
import type { Page } from '@playwright/test';
import type { MockSupabase, MockUser } from '../support/mock-supabase';
import { seedProfile } from '../support/seed';

/**
 * Cobro y registro (modo de prueba, Stripe simulado):
 * términos antes de todo, precio antes del cuestionario, suscribirse y
 * volver del pago, cancelar, volver a suscribirse, actualizar la tarjeta en
 * la gracia, atletas con coach sin cobro, lista de espera y ventas del mes
 * para administradores y registro solo con invitación.
 */

const NONE = { ai: false, reason: 'none', subscription: null, priceMxn: 329, trialDays: 7, billingReady: true, isAdmin: false };
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function enter(page: Page, backend: MockSupabase, id = 'ana', withProfile = true): Promise<MockUser> {
  const u = user(id);
  backend.users.push(u);
  if (withProfile) seedProfile(backend, u, 'ana');
  await backend.seedSession(page, u);
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  return u;
}

test.describe('Términos antes de empezar', () => {
  test('sin aceptar no se usa la app; dos casillas y queda la evidencia', async ({ page, backend, ux }) => {
    backend.autoAcceptTerms = false;
    const u = await enter(page, backend, 'ana', false);
    await page.goto('/#/plan');
    await expect(page.locator('.terms-screen')).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await ux.shot('71-terminos');
    const submit = page.locator('#terms-submit');
    await expect(submit).toBeDisabled();
    await ux.click(page.locator('#terms-accept'), 'Acepto términos');
    await expect(submit).toBeDisabled();
    // el aviso de privacidad se puede leer desde ahí
    await ux.click(page.locator('#terms-privacy'), 'Aviso de privacidad');
    await expect(page.locator('#privacy-backdrop')).toContainText('Datos de salud');
    await ux.click(page.locator('#privacy-close'), 'Cerrar aviso');
    await ux.click(page.locator('#terms-health'), 'Autorizo datos de salud');
    await ux.click(submit, 'Aceptar');
    await expect(page.locator('.terms-screen')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/plan/);
    const rows = backend.table('legal_acceptances');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: u.id, doc: 'torq', consents: { terms: true, health_data: true, adult: true } });
    expect(String(rows[0].text_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(rows[0].version)).toMatch(/^2026-/);
    expect(ux.interactions).toBeLessThanOrEqual(5);
  });

  test('«Ahora no» cierra la sesión', async ({ page, backend, ux }) => {
    backend.autoAcceptTerms = false;
    await enter(page, backend, 'ana', false);
    await page.goto('/#/home');
    await ux.click(page.locator('#terms-signout'), 'Ahora no');
    await expect(page.locator('#entry-toggle')).toBeVisible();
  });

  test('menor de 18: el cuestionario no deja seguir', async ({ page, backend, ux }) => {
    await enter(page, backend, 'ana', false);
    await page.goto('/#/home');
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan');
    const m = page.locator('#onboarding-modal');
    await m.locator('#ob-sex .ob-chip', { hasText: 'Mujer' }).click();
    await m.locator('[role=spinbutton][aria-label="Día"]').focus();
    await page.keyboard.type('01032012', { delay: 30 });
    await m.locator('#ob-weight').fill('50');
    await m.locator('#ob-height').fill('155');
    // pasa el paso 1 (está completo) pero al guardar lo regresa con el aviso
    await m.locator('#onboarding-next').click();
    for (let n = 2; n <= 9; n++) await m.locator('.ob-step-dot[data-go="' + n + '"]').count();
    await m.evaluate((el) => (el.querySelector('#onboarding-submit') as HTMLElement).click());
    await expect(page.locator('#onboarding-status')).toContainText('solo para mayores de 18');
  });
});

test.describe('Precio y suscripción', () => {
  test('sin acceso: suscribirse, volver del pago y quedar activo', async ({ page, backend, ux }) => {
    await enter(page, backend);
    backend.billingStatus = { ...NONE };
    backend.functions.set('billing', (body) => {
      if (body?.action === 'subscribe') {
        // Stripe Checkout cobra (o empieza la prueba) y nos avisa (webhook): el acceso cambia
        backend.billingStatus = { ai: true, reason: 'subscription', subscription: { status: 'authorized', price_mxn: 329, paid_until: future(30), grace_until: null }, priceMxn: 329, billingReady: true, isAdmin: false };
        return { body: { initPoint: '/?billing=return#/profile', priceMxn: 329 } };
      }
      if (body?.action === 'cancel') {
        backend.billingStatus = { ...(backend.billingStatus as object), subscription: { status: 'cancelled', price_mxn: 329, paid_until: future(30), grace_until: null } };
        return { body: { ok: true } };
      }
      return { body: backend.billingStatus };
    });
    await page.goto('/#/plan');
    const card = page.locator('#coach-slot [data-pricing]');
    // un solo precio, la prueba de 7 días y cuándo es el primer cobro
    await expect(card.locator('.pricing-amount')).toHaveText('$329 al mes 7 días de prueba');
    await expect(card).toContainText('el primer cobro es al terminar los 7 días de prueba');
    await expect(card).not.toContainText('fundador');
    await expect(card).not.toContainText('Mercado Pago');
    await expect(card.locator('[data-subscribe]')).toHaveText('Suscribirme');
    await ux.click(card.locator('[data-subscribe]'), 'Suscribirme');
    await expect(page).toHaveURL(/#\/profile/);
    await expect(page.locator('.billing-toast')).toContainText('ya tienes Torq Coach IA');
    await expect(page.locator('.perfil-panel[data-pricing]')).toContainText('$329 al mes');
    await ux.shot('72-perfil-suscrito', page.locator('.perfil-panel[data-pricing]'));
    // cancelar: dos pasos y explica qué pasa
    await ux.click(page.locator('#subscription-cancel'), 'Cancelar suscripción');
    await expect(page.locator('#subscription-cancel-status')).toContainText('Conservas el coach IA');
    await ux.click(page.locator('#subscription-cancel'), 'Sí, cancelar');
    await expect(page.locator('.perfil-panel[data-pricing]')).toContainText('Cancelaste tu suscripción');
    expect(backend.fnCalls('billing').map((c) => (c.body as { action?: string })?.action)).toEqual(expect.arrayContaining(['subscribe', 'cancel']));
  });

  test('canceló y regresa antes de que termine lo pagado: conserva su precio', async ({ page, backend, ux }) => {
    await enter(page, backend);
    backend.billingStatus = { ai: true, reason: 'subscription', subscription: { status: 'cancelled', price_mxn: 329, paid_until: future(12), grace_until: null }, priceMxn: 329, trialDays: 0, billingReady: true, isAdmin: false };
    backend.functions.set('billing', (body) => {
      if (body?.action === 'subscribe') {
        // se reactiva la misma suscripción en Stripe (sin Checkout ni cobro nuevo)
        backend.billingStatus = { ...(backend.billingStatus as object), subscription: { status: 'authorized', price_mxn: 329, paid_until: future(12), grace_until: null } };
        return { body: { initPoint: '/?billing=return#/profile', priceMxn: 329 } };
      }
      return { body: backend.billingStatus };
    });
    await page.goto('/#/profile');
    const panel = page.locator('.perfil-panel[data-pricing]');
    await ux.click(panel.locator('[data-subscribe]'), 'Volver a suscribirme · $329 al mes');
    await expect(page.locator('.billing-toast')).toContainText('ya tienes Torq Coach IA');
    await expect(panel.locator('#subscription-cancel')).toBeVisible();
  });

  test('cobro sin configurar: el botón se apaga y lo dice', async ({ page, backend, ux }) => {
    await enter(page, backend);
    backend.billingStatus = { ...NONE, billingReady: false };
    await page.goto('/#/plan');
    await expect(page.locator('#coach-slot [data-subscribe]')).toBeDisabled();
    await expect(page.locator('#coach-slot')).toContainText('todavía no está activo');
    void ux;
  });

  test('cobro rechazado: días de gracia y cómo arreglarlo', async ({ page, backend, ux }) => {
    await enter(page, backend);
    backend.billingStatus = { ai: true, reason: 'grace', subscription: { status: 'authorized', price_mxn: 329, paid_until: future(-2), grace_until: future(5) }, priceMxn: 329, billingReady: true, isAdmin: false };
    await page.goto('/#/profile');
    const panel = page.locator('.perfil-panel[data-pricing]');
    await expect(panel).toContainText('No pudimos cobrar tu mes');
    await expect(panel).not.toContainText('Mercado Pago');
    // «Actualizar tarjeta» abre el portal de Stripe
    backend.functions.set('billing', (body) => (body?.action === 'portal' ? { body: { url: '/?portal=stripe#/profile' } } : { body: backend.billingStatus }));
    await ux.click(panel.locator('#billing-portal'), 'Actualizar tarjeta');
    await expect(page).toHaveURL(/portal=stripe/);
    expect(backend.fnCalls('billing').map((c) => (c.body as { action?: string })?.action)).toContain('portal');
  });

  test('Piñón sin acceso: la pregunta abierta explica y ofrece el plan', async ({ page, backend, ux }) => {
    await enter(page, backend);
    backend.billingStatus = { ...NONE };
    backend.functions.set('pinon-chat', () => ({ status: 403, body: { error: 'subscription_required' } }));
    await page.goto('/#/home');
    await page.locator('.pinon-chat-launcher').click();
    const chat = page.locator('aside.pinon-chat');
    await chat.locator('input[name=q]').fill('¿Cuánto calentar antes de una carrera?');
    await chat.locator('.pinon-chat-send').click();
    const last = chat.locator('.pinon-chat-msg.pinon:not(.typing)').last();
    await expect(last).toContainText('vienen con Torq Coach IA');
    await expect(last.locator('.pinon-chat-action')).toHaveText('Conocer Torq Coach IA');
    void ux;
  });
});

test.describe('Con coach, Torq va incluido', () => {
  test('el atleta de un coach no ve precios, y el plan es «de» su coach', async ({ page, backend, ux }) => {
    await enter(page, backend);
    backend.billingStatus = { ai: true, reason: 'coached', subscription: null, priceMxn: 329, billingReady: true, isAdmin: false };
    backend.rpcs.set('my_coach', () => [{ coach_name: 'Joe Hernández', tier: 'todo', started_at: new Date().toISOString() }]);
    await page.goto('/#/plan');
    await expect(page.locator('.plan-coach-brand')).toHaveText('Plan de Joe Hernández');
    await expect(page.locator('[data-pricing] [data-subscribe]')).toHaveCount(0);
    await ux.shot('73-plan-de-joe');
    await page.goto('/#/profile');
    await expect(page.locator('.perfil-panel[data-pricing]')).toContainText('Torq va incluido por tu coach Joe Hernández');
    await expect(page.locator('[data-subscribe]')).toHaveCount(0);
  });
});

test.describe('Registro solo con invitación', () => {
  test('administrador: lista de espera e invitar en 1 clic', async ({ page, backend, ux }) => {
    await enter(page, backend, 'diego');
    backend.billingStatus = { ai: true, reason: 'comp', subscription: null, priceMxn: 329, billingReady: true, isAdmin: true };
    const rows = [
      { id: 'w1', email: 'luis@correo.com', name: 'Luis', discipline: 'gravel', created_at: '2026-10-18T10:00:00Z', invited_at: null },
      { id: 'w2', email: 'sofi@correo.com', name: null, discipline: null, created_at: '2026-10-19T10:00:00Z', invited_at: '2026-10-19T12:00:00Z' },
    ];
    backend.functions.set('invite', (body) =>
      body?.action === 'waitlist_list' ? { body: { rows } } : body?.action === 'waitlist_invite' ? { body: { ok: true, alreadyHadAccount: false } } : { status: 400, body: { error: 'x' } },
    );
    await page.goto('/#/home');
    await ux.click(page.locator('.sidebar-link', { hasText: 'Lista de espera' }), 'Lista de espera');
    await expect(page.locator('.admin-screen')).toContainText('2 en la lista · 1 sin invitar');
    await ux.shot('74-admin-lista-de-espera');
    await ux.click(page.locator('[data-invite="w1"]'), 'Invitar');
    await expect(page.locator('#admin-status')).toHaveText('Invitación enviada.');
    await expect(page.locator('[data-invite]')).toHaveCount(0);
    expect(backend.fnCalls('invite').some((c) => (c.body as { action?: string; id?: string }).action === 'waitlist_invite' && (c.body as { id?: string }).id === 'w1')).toBe(true);
  });

  test('administrador: ventas del mes para la factura global', async ({ page, backend, ux }) => {
    await enter(page, backend, 'diego');
    backend.billingStatus = { ai: true, reason: 'comp', subscription: null, priceMxn: 329, billingReady: true, isAdmin: true };
    const rows = [
      { stripe_invoice_id: 'in_1', stripe_charge_id: 'ch_1', paid_at: '2026-10-03T18:00:00Z', total_cents: 32900, base_cents: 28362, iva_cents: 4538, card_funding: 'credit', cfdi_uuid: null },
      { stripe_invoice_id: 'in_2', stripe_charge_id: 'ch_2', paid_at: '2026-10-20T18:00:00Z', total_cents: 32900, base_cents: 28362, iva_cents: 4538, card_funding: 'debit', cfdi_uuid: null },
    ];
    backend.functions.set('billing', (body) => {
      if (body?.action === 'sales') return { body: { month: body.month, rows } };
      if (body?.action === 'sales_set_cfdi') {
        rows.forEach((r) => (r.cfdi_uuid = body.uuid as never));
        return { body: { ok: true, updated: rows.length } };
      }
      return { body: backend.billingStatus };
    });
    await page.goto('/#/home');
    await ux.click(page.locator('.sidebar-link', { hasText: 'Ventas del mes' }), 'Ventas del mes');
    const screen = page.locator('.admin-screen');
    await expect(screen.locator('tfoot')).toContainText('2 cobros');
    await expect(screen.locator('tfoot')).toContainText('567.24'); // base
    await expect(screen.locator('tfoot')).toContainText('90.76'); // IVA
    const download = page.waitForEvent('download');
    await ux.click(screen.locator('#sales-csv'), 'Descargar CSV');
    expect((await download).suggestedFilename()).toMatch(/^torq-ventas-\d{4}-\d{2}\.csv$/);
    await screen.locator('#sales-uuid').fill('6F2B1A3C-1234-4ABC-9DEF-0123456789AB');
    await ux.click(screen.locator('#sales-uuid-save'), 'Guardar UUID');
    await expect(page.locator('.admin-screen')).toContainText('Todos los cobros de este mes ya tienen CFDI');
  });

  test('quien no es administrador no ve la lista', async ({ page, backend }) => {
    await enter(page, backend);
    await page.goto('/#/admin');
    await expect(page.locator('body')).toContainText('solo para administradores');
    await expect(page.locator('.sidebar-link', { hasText: 'Lista de espera' })).toHaveCount(0);
  });

  test('atleta sin cuenta abre el link de su coach: crea su cuenta y acepta la invitación', async ({ page, backend, ux }) => {
    const token = 'a'.repeat(43);
    const nuevo = user('nuevo', 'nuevo@correo.com');
    backend.users.push(nuevo);
    backend.invitedEmail = nuevo.email;
    backend.functions.set('invite', (body) => (body?.action === 'coach_signup' && body.token === token ? { body: { ok: true } } : { status: 400, body: { error: 'invite_invalid' } }));
    backend.rpcs.set('preview_coach_invite', () => [{ status: 'valid', coach_name: 'Joe Hernández', tier: 'todo', expires_at: future(5) }]);
    await page.goto(`/#/invite/${token}`);
    await expect(page.locator('.invite-screen h1')).toHaveText('Tu coach te invitó a Torq');
    await ux.shot('75-invitacion-sin-cuenta');
    await ux.fill(page.locator('#invite-email'), nuevo.email, 'Correo');
    await ux.click(page.locator('#invite-signup-btn'), 'Crear mi cuenta');
    await expect(page.locator('#invite-signup-form')).toContainText('revisa tu correo');
    // vuelve del correo (plantilla «Invite user»)
    await page.goto(`/?signup=1&next=invite.${token}&token_hash=tok123&type=invite`);
    const form = page.locator('#signup-form');
    await expect(form).toContainText('Te damos la bienvenida a Torq');
    await ux.fill(form.locator('#signup-pw-1'), 'contraseña-larga', 'Contraseña');
    await ux.fill(form.locator('#signup-pw-2'), 'contraseña-larga', 'Repetir');
    await ux.click(form.locator('button[type=submit]'), 'Crear contraseña');
    await expect(page).toHaveURL(new RegExp(`#/invite/${token}`));
    await expect(page.locator('body')).toContainText('Joe Hernández quiere ser tu coach en Torq');
    expect(backend.calls.some((c) => c.name === 'verify')).toBe(true);
    expect(backend.calls.some((c) => c.name === 'update_user')).toBe(true);
  });

  test('link de coach vencido: lo dice en español', async ({ page, backend, ux }) => {
    const token = 'b'.repeat(43);
    backend.functions.set('invite', () => ({ status: 400, body: { error: 'invite_invalid' } }));
    await page.goto(`/#/invite/${token}`);
    await ux.fill(page.locator('#invite-email'), 'x@correo.com', 'Correo');
    await ux.click(page.locator('#invite-signup-btn'), 'Crear mi cuenta');
    await expect(page.locator('#invite-signup-status')).toContainText('ya se usó o ya venció');
  });
});
