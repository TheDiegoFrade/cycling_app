import { test, expect, user } from '../support/ux';
import type { Page } from '@playwright/test';
import type { MockSupabase, MockUser } from '../support/mock-supabase';
import { seedProfile } from '../support/seed';

/**
 * Ser coach en Torq: solo por invitación y con solicitud aprobada. Nadie se
 * registra como coach, y un coach no puede repartir lugares sin límite para
 * que otros usen la IA sin pagar (máximo de atletas, default 20).
 */

const ADMIN = { ai: true, reason: 'comp', subscription: null, priceMxn: 399, billingReady: true, isAdmin: true };
const TOKEN = 'c'.repeat(43);

const ANSWERS = {
  fullName: 'Mariana Ruiz',
  phone: '55 8765 4321',
  city: 'Guadalajara',
  yearsCoaching: 6,
  certifications: 'USA Cycling Nivel 2',
  disciplines: ['road', 'triathlon'],
  currentAthletes: 12,
  methodology: 'Empiezo con un test de 20 min, armo bloques de 3 semanas de carga y 1 de descarga y reviso cada lunes lo que rodó para ajustar.',
  links: 'instagram.com/mariana.coach',
  references: 'Club Ciclista Tapatío',
  truthful: true,
  responsible: true,
  adult: true,
};

async function enter(page: Page, backend: MockSupabase, id = 'ana', email?: string): Promise<MockUser> {
  const u = user(id, email);
  backend.users.push(u);
  seedProfile(backend, u, 'ana');
  await backend.seedSession(page, u);
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  return u;
}

const calls = (backend: MockSupabase, action: string) =>
  backend.fnCalls('coach-apply').map((c) => c.body as Record<string, unknown>).filter((b) => b.action === action);

test.describe('Ser coach: solo por invitación', () => {
  test('admin invita a un coach por correo (y ve el link por si no llega)', async ({ page, backend, ux }) => {
    await enter(page, backend, 'diego');
    backend.billingStatus = ADMIN;
    backend.functions.set('coach-apply', (body) =>
      body?.action === 'admin_list'
        ? { body: { applications: [], coaches: [] } }
        : body?.action === 'admin_invite'
          ? { body: { ok: true, link: `https://ridetorq.app/#/coach-apply/${TOKEN}`, emailed: true } }
          : { status: 400, body: { error: 'x' } },
    );
    await page.goto('/#/home');
    await ux.click(page.locator('.sidebar-link', { hasText: 'Coaches' }), 'Coaches');
    await ux.fill(page.locator('#admin-coach-email'), 'mariana@correo.com', 'Correo');
    await ux.click(page.locator('#admin-coach-invite-btn'), 'Invitar');
    await expect(page.locator('#admin-status')).toHaveText('Invitación enviada a mariana@correo.com.');
    await expect(page.locator('#admin-coach-link')).toContainText(`#/coach-apply/${TOKEN}`);
    expect(calls(backend, 'admin_invite')[0]).toMatchObject({ email: 'mariana@correo.com', maxAthletes: 20 });
    const m = ux.milestone('invitar-coach');
    expect(m.interactions).toBeLessThanOrEqual(3);
    await ux.shot('76-admin-invitar-coach');
  });

  test('la persona invitada llena su solicitud: no deja mandar con huecos', async ({ page, backend, ux }) => {
    await enter(page, backend, 'mariana', 'mariana@correo.com');
    backend.functions.set('coach-apply', (body) =>
      body?.action === 'preview' ? { body: { status: 'invited', answers: null } } : body?.action === 'submit' ? { body: { ok: true, status: 'submitted' } } : { status: 400, body: {} },
    );
    await page.goto(`/#/coach-apply/${TOKEN}`);
    await expect(page.locator('#coach-apply-form')).toBeVisible();
    await ux.click(page.locator('#coach-apply-submit'), 'Mandar vacía');
    await expect(page.locator('#coach-apply-status')).toHaveText('Faltan 12 datos.');
    await expect(page.locator('[data-error="methodology"]')).toContainText('al menos 80');
    expect(calls(backend, 'submit')).toHaveLength(0);
    await ux.shot('77-solicitud-coach-faltan');

    await ux.fill(page.locator('#ca-fullName'), ANSWERS.fullName, 'Nombre');
    await ux.fill(page.locator('#ca-phone'), ANSWERS.phone, 'Teléfono');
    await ux.fill(page.locator('#ca-city'), ANSWERS.city, 'Ciudad');
    await ux.fill(page.locator('#ca-yearsCoaching'), String(ANSWERS.yearsCoaching), 'Años');
    await ux.fill(page.locator('#ca-currentAthletes'), String(ANSWERS.currentAthletes), 'Atletas hoy');
    await ux.fill(page.locator('#ca-certifications'), ANSWERS.certifications, 'Certificaciones');
    await ux.click(page.locator('[data-discipline="road"]'), 'Ruta');
    await ux.click(page.locator('[data-discipline="triathlon"]'), 'Triatlón');
    await ux.fill(page.locator('#ca-methodology'), ANSWERS.methodology, 'Metodología');
    await ux.fill(page.locator('#ca-links'), ANSWERS.links, 'Su trabajo');
    await ux.fill(page.locator('#ca-references'), ANSWERS.references, 'Referencia');
    await ux.click(page.locator('#ca-truthful'), 'Verdadera');
    await ux.click(page.locator('#ca-responsible'), 'Responsable');
    await ux.click(page.locator('#ca-adult'), '18+');
    await ux.click(page.locator('#coach-apply-submit'), 'Mandar');
    await expect(page.locator('#coach-apply-done')).toContainText('Recibimos tu solicitud');
    expect(calls(backend, 'submit')[0]).toMatchObject({ token: TOKEN, answers: ANSWERS });
    ux.metrics['esfuerzo-solicitud-coach'] = ux.milestone('solicitud').interactions;
    await ux.shot('78-solicitud-coach-recibida');
  });

  test('la invitación no sirve con otra cuenta (no se puede pasar el link)', async ({ page, backend }) => {
    await enter(page, backend, 'amigo', 'amigo@correo.com');
    backend.functions.set('coach-apply', () => ({ body: { status: 'wrong_email', email: 'm•••@correo.com' } }));
    await page.goto(`/#/coach-apply/${TOKEN}`);
    await expect(page.locator('.coach-apply-screen')).toContainText('Esta invitación es para otra cuenta (m•••@correo.com)');
    await expect(page.locator('#coach-apply-form')).toHaveCount(0);
  });

  test('sin invitación no hay forma de volverse coach', async ({ page, backend }) => {
    await enter(page, backend);
    backend.functions.set('coach-apply', () => ({ body: { status: 'invalid' } }));
    await page.goto(`/#/coach-apply/${'z'.repeat(43)}`);
    await expect(page.locator('.coach-apply-screen')).toContainText('necesitas una invitación');
    await page.goto('/#/admin/coaches');
    await expect(page.locator('body')).toContainText('solo para administradores');
    await page.goto('/#/coach-invite');
    await expect(page.locator('body')).toContainText('solo para coaches');
  });

  test('admin revisa la solicitud y aprueba con un máximo de atletas', async ({ page, backend, ux }) => {
    await enter(page, backend, 'diego');
    backend.billingStatus = ADMIN;
    const apps = [
      { id: 'a1', email: 'mariana@correo.com', status: 'submitted', invited_at: '2026-10-18T10:00:00Z', expires_at: '2026-11-01T10:00:00Z', user_id: 'u-mariana', answers: ANSWERS, submitted_at: '2026-10-19T10:00:00Z', reviewed_at: null, review_note: null, max_athletes: 20 },
    ];
    const coaches = [{ userId: 'u-joe', name: 'Joe Hernández', email: 'joe@correo.com', athletes: 20, maxAthletes: 20, viaApplication: false }];
    backend.functions.set('coach-apply', (body) => {
      if (body?.action === 'admin_list') return { body: { applications: apps, coaches } };
      if (body?.action === 'admin_review') {
        apps[0].status = body.decision === 'approve' ? 'approved' : 'rejected';
        coaches.push({ userId: 'u-mariana', name: 'Mariana Ruiz', email: 'mariana@correo.com', athletes: 0, maxAthletes: body.maxAthletes, viaApplication: true });
        return { body: { ok: true } };
      }
      return { status: 400, body: {} };
    });
    await page.goto('/#/admin/coaches');
    const card = page.locator('[data-app="a1"]');
    await expect(card).toContainText('Por revisar');
    await expect(card).toContainText('USA Cycling Nivel 2');
    await expect(page.locator('[data-coach="u-joe"] .admin-full')).toHaveText('20 de 20');
    await ux.shot('79-admin-revisar-coach');
    await ux.fill(card.locator('[data-max="a1"]'), '15', 'Máximo 15');
    await ux.click(card.locator('[data-approve="a1"]'), 'Aprobar');
    await expect(page.locator('#admin-status')).toHaveText('Aprobado: ya es coach.');
    expect(calls(backend, 'admin_review')[0]).toMatchObject({ id: 'a1', decision: 'approve', maxAthletes: 15 });
    await expect(page.locator('[data-coach="u-mariana"]')).toContainText('0 de 15');
  });

  test('quitar como coach pide confirmación y dice a cuántos atletas afecta', async ({ page, backend, ux }) => {
    await enter(page, backend, 'diego');
    backend.billingStatus = ADMIN;
    let coaches = [{ userId: 'u-x', name: 'Coach X', email: 'x@correo.com', athletes: 3, maxAthletes: 20, viaApplication: true }];
    backend.functions.set('coach-apply', (body) => {
      if (body?.action === 'admin_list') return { body: { applications: [], coaches } };
      if (body?.action === 'admin_revoke') {
        coaches = [];
        return { body: { ok: true, endedLinks: 3 } };
      }
      return { status: 400, body: {} };
    });
    await page.goto('/#/admin/coaches');
    await ux.click(page.locator('[data-revoke="u-x"]'), 'Quitar como coach');
    await expect(page.locator('[data-revoke-yes]')).toContainText('3 atletas pierden su coach');
    expect(calls(backend, 'admin_revoke')).toHaveLength(0);
    await ux.click(page.locator('[data-revoke-yes]'), 'Sí, quitar');
    await expect(page.locator('#admin-status')).toHaveText('Ya no es coach. Se terminaron 3 vínculos.');
    await expect(page.locator('[data-coach]')).toHaveCount(0);
  });
});

test.describe('Un coach no reparte lugares sin límite', () => {
  test('el coach ve cuántos lugares le quedan y un aviso al llegar al máximo', async ({ page, backend, ux }) => {
    const u = await enter(page, backend, 'joe', 'joe@correo.com');
    backend.table('profiles')[0].is_coach = true;
    for (let i = 0; i < 20; i++) backend.table('coach_athletes').push({ id: `l${i}`, coach_id: u.id, athlete_id: `a${i}`, status: 'active', tier: 'todo' });
    backend.rpcs.set('my_coach_seats', () => [{ used: 20, seat_limit: 20 }]);
    await page.goto('/#/coach-invite');
    await expect(page.locator('#invite-seats')).toHaveText('20 de 20 atletas');
    await expect(page.locator('.invite-screen .error-box')).toContainText('Llegaste a tu máximo de 20 atletas');
    await ux.shot('80-coach-al-maximo');
  });

  test('el atleta que abre un link de un coach lleno ve por qué no puede', async ({ page, backend }) => {
    await enter(page, backend);
    backend.rpcs.set('preview_coach_invite', () => [{ status: 'valid', coach_name: 'Joe Hernández', tier: 'todo', expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString() }]);
    backend.rpcs.set('accept_coach_invite', () => {
      throw Object.assign(new Error('Tu coach llegó a su máximo de atletas en Torq. Pídele que escriba a Torq.'), { status: 400 });
    });
    await page.goto(`/#/invite/${'d'.repeat(43)}`);
    await page.locator('button', { hasText: /Aceptar/ }).first().click();
    await expect(page.locator('.error-box')).toContainText('llegó a su máximo de atletas');
  });
});
