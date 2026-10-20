import { test, expect, user } from '../support/ux';
import type { Page } from '@playwright/test';
import type { MockSupabase } from '../support/mock-supabase';
import { NOVATA, fillOnboarding } from '../support/flows';
import { seedActivePlan, seedProfile, seedWorkout, todayKey } from '../support/seed';

/**
 * Crear el plan con el coach IA. Lo que importa: que el camino sea corto y
 * claro, que la espera se sienta acompañada, y que un error no tire a la
 * basura lo que la persona ya contestó.
 */

const COACH_NOTE = 'Arrancamos con 3 semanas de base: rodadas suaves para construir fondo y la semana 2 hacemos un test corto para fijar tus zonas.';

function coachOk(backend: MockSupabase, u: { id: string }, delayMs = 2000) {
  backend.functions.set('coach-chat', (body) => {
    if (body?.mode !== 'create_plan') return { status: 400, body: { error: 'modo no simulado' } };
    // lo que haría el servidor: plan activo + workouts agendados
    seedActivePlan(backend, u as never, body.context.goal);
    seedWorkout(backend, u as never, { template: 'z2', minutes: 45, date: todayKey(1), name: 'Base Z2 · 45 min' });
    return { body: { result: { coachNote: COACH_NOTE, nextTest: null } }, delayMs };
  });
}

async function enterAs(page: Page, backend: MockSupabase, id: string, withProfile: boolean) {
  const u = user(id);
  backend.users.push(u);
  if (withProfile) seedProfile(backend, u, 'ana');
  await backend.seedSession(page, u);
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  return u;
}

test.describe('Crear mi plan', () => {
  test('perfil completo: de Inicio a plan creado en ≤ 8 interacciones', async ({ page, backend, ux }) => {
    const u = await enterAs(page, backend, 'ana', true);
    coachOk(backend, u);
    await page.goto('/#/home');
    await ux.click(page.locator('.sidebar-link', { hasText: 'Plan' }), 'Ir a Plan');
    await ux.click(page.locator('#coach-open-create'), 'Crear mi plan');
    await ux.shot('20-crear-plan-modal');
    await ux.fill(page.locator('#coach-goal'), 'Quiero rodar 100 km en noviembre sin sufrir', 'Meta');
    await ux.click(page.locator('#coach-days [data-day=tue]'), 'Martes');
    await ux.click(page.locator('#coach-days [data-day=thu]'), 'Jueves');
    await ux.click(page.locator('#coach-days [data-day=sat]'), 'Sábado');
    await ux.click(page.locator('#coach-submit'), 'Crear plan');
    await expect(page.locator('#coach-status')).not.toBeEmpty();
    await ux.shot('21-crear-plan-pensando', page.locator('#coach-modal'));
    await expect(page.locator('.coach-bubble-text')).toContainText('3 semanas de base', { timeout: 10_000 });
    await ux.shot('22-crear-plan-listo', page.locator('#coach-modal'));
    await ux.click(page.locator('#coach-done'), 'Entendido');
    const m = ux.milestone('plan');
    expect(m.interactions).toBeLessThanOrEqual(8);
    // la persona ve su plan: el siguiente entreno aparece
    await expect(page.locator('body')).toContainText('Base Z2');
    // jerga en lo que ve mientras espera
    const call = backend.fnCalls('coach-chat')[0].body as { context: { availability: { days: string[] } } };
    expect(call.context.availability.days).toEqual(['tue', 'thu', 'sat']);
  });

  test('los días disponibles se distinguen (martes ≠ miércoles)', async ({ page, backend, ux }) => {
    const u = await enterAs(page, backend, 'ana', true);
    coachOk(backend, u);
    await page.goto('/#/plan');
    await ux.click(page.locator('#coach-open-create'), 'Crear mi plan');
    const labels = await page.locator('#coach-days .plan-chip').allInnerTexts();
    expect(new Set(labels).size, `etiquetas: ${labels.join(' ')}`).toBe(labels.length);
  });

  test('mientras piensa no muestra siglas técnicas (CTL/ATL/TSB)', async ({ page, backend, ux }) => {
    const u = await enterAs(page, backend, 'ana', true);
    coachOk(backend, u, 14_000);
    await page.goto('/#/plan');
    await ux.click(page.locator('#coach-open-create'), 'Crear mi plan');
    await ux.fill(page.locator('#coach-goal'), 'Bajar de peso y sentirme mejor', 'Meta');
    await ux.click(page.locator('#coach-days [data-day=mon]'), 'Lunes');
    await ux.click(page.locator('#coach-submit'), 'Crear plan');
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(await page.locator('#coach-status').innerText());
      await page.waitForTimeout(1000);
    }
    ux.metrics['mensajes-espera'] = [...seen].join(' | ');
    expect([...seen].filter((s) => /\b(CTL|ATL|TSB)\b/.test(s))).toEqual([]);
  });

  test('perfil incompleto: el cuestionario se abre en medio y al guardar sigue directo a «Crear tu plan»', async ({ page, backend, ux }) => {
    const u = await enterAs(page, backend, 'ana', false);
    coachOk(backend, u);
    await page.goto('/#/plan');
    await ux.click(page.locator('#coach-open-create'), 'Crear mi plan');
    await expect(page.locator('#onboarding-skip')).toHaveCount(0);
    await fillOnboarding(page, ux, NOVATA);
    await expect(page.locator('#coach-modal')).toBeVisible();
    const m = ux.milestone('modal-plan');
    ux.metrics['interacciones-hasta-poder-pedir-plan'] = m.interactions;
  });

  test('cuenta sin acceso al coach: ve el precio ANTES de pedirle el cuestionario', async ({ page, backend, ux }) => {
    await enterAs(page, backend, 'carla', false);
    backend.billingStatus = { ai: false, reason: 'none', subscription: null, priceMxn: 299, founderUntil: '2026-12-30', billingReady: true, isAdmin: false };
    await page.goto('/#/plan');
    // en lugar de «Crear mi plan» (que abriría 29 preguntas), el precio
    await expect(page.locator('#coach-slot [data-pricing]')).toBeVisible();
    await expect(page.locator('#coach-slot')).toContainText('$299');
    // fundadores: los primeros 60 días, y se dice hasta cuándo
    await expect(page.locator('#coach-slot .pricing-founder')).toHaveText('Precio de fundador hasta el 30 de diciembre · normal $399');
    await expect(page.locator('#coach-open-create')).toHaveCount(0);
    await ux.shot('70-plan-sin-acceso-precio');
  });

  test('cuenta sin acceso: cuánto esfuerzo cuesta enterarse (antes: ~4 min)', async ({ page, backend, ux }) => {
    await enterAs(page, backend, 'carla', false);
    backend.billingStatus = { ai: false, reason: 'none', subscription: null, priceMxn: 399, billingReady: true, isAdmin: false };
    await page.goto('/#/home');
    await ux.click(page.locator('#welcome-plan'), 'Armar mi plan con el coach');
    await expect(page.locator('#pricing-backdrop [data-pricing]')).toBeVisible();
    await expect(page.locator('#onboarding-modal')).toHaveCount(0);
    const m = ux.milestone('precio');
    expect(m.interactions, 'interacciones hasta ver el precio').toBeLessThanOrEqual(1);
    expect(backend.fnCalls('coach-chat')).toHaveLength(0);
  });

  for (const c of [
    { name: 'servidor caído (502)', status: 502, body: { error: 'el coach armó algo que no cumple las reglas, intenta de nuevo' } },
    { name: 'error sin cuerpo (500)', status: 500, body: 'Internal Server Error' },
  ]) {
    test(`${c.name}: mensaje en español y se puede reintentar sin re-escribir`, async ({ page, backend, ux }) => {
      const u = await enterAs(page, backend, 'ana', true);
      backend.functions.set('coach-chat', () => ({ status: c.status, body: c.body }));
      await page.goto('/#/plan');
      await ux.click(page.locator('#coach-open-create'), 'Crear mi plan');
      await ux.fill(page.locator('#coach-goal'), 'Mejorar mi FTP para la temporada', 'Meta');
      await ux.click(page.locator('#coach-days [data-day=wed]'), 'Miércoles');
      await ux.click(page.locator('#coach-submit'), 'Crear plan');
      await expect(page.locator('#coach-status')).toContainText('No se pudo crear el plan', { timeout: 10_000 });
      await ux.shot(`24-coach-error-${c.status}`, page.locator('#coach-modal'));
      expect(await ux.englishIn(page.locator('#coach-status')), 'error en inglés').toEqual([]);
      await expect(page.locator('#coach-goal')).toHaveValue('Mejorar mi FTP para la temporada');
      await expect(page.locator('#coach-submit')).toBeEnabled();
      // reintento exitoso
      coachOk(backend, u, 300);
      await ux.click(page.locator('#coach-submit'), 'Reintentar');
      await expect(page.locator('.coach-bubble-text')).toBeVisible({ timeout: 10_000 });
    });
  }

  test('doble clic en «Crear plan» manda una sola petición (no gasta 2 de 3 del mes)', async ({ page, backend, ux }) => {
    const u = await enterAs(page, backend, 'ana', true);
    coachOk(backend, u, 1500);
    await page.goto('/#/plan');
    await ux.click(page.locator('#coach-open-create'), 'Crear mi plan');
    await ux.fill(page.locator('#coach-goal'), 'Rodar más constante', 'Meta');
    await ux.click(page.locator('#coach-days [data-day=fri]'), 'Viernes');
    await page.locator('#coach-submit').dblclick();
    await expect(page.locator('.coach-bubble-text')).toBeVisible({ timeout: 10_000 });
    expect(backend.fnCalls('coach-chat')).toHaveLength(1);
  });
});

test.describe('Con plan activo', () => {
  test('Plan muestra la meta y acciones claras; Inicio dice qué toca hoy', async ({ page, backend, ux }) => {
    const u = await enterAs(page, backend, 'ana', true);
    seedActivePlan(backend, u);
    seedWorkout(backend, u, { template: 'z2', minutes: 45, name: 'Base Z2 · 45 min' });
    await page.goto('/#/plan');
    await expect(page.locator('#coach-slot')).toContainText('100 km');
    await ux.shot('25-plan-activo');
    await ux.click(page.locator('.sidebar-link', { hasText: 'Inicio' }), 'Ir a Inicio');
    await expect(page.locator('.home-ride-btn')).toBeVisible();
    await ux.shot('26-inicio-con-entreno');
  });
});
