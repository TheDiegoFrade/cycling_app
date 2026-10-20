import { test, expect, user } from '../support/ux';
import type { Page } from '@playwright/test';
import type { MockSupabase, MockUser } from '../support/mock-supabase';
import { bubbleText, openChat, tapQuick } from '../support/flows';
import { seedProfile } from '../support/seed';

/**
 * Decisiones de producto del 20-oct (docs/evaluaciones/2026-10-20-ux-flujos.md):
 * textos en el género del perfil, Piñón comenta cada sesión en Resumen y
 * lista de espera para quien llega sin invitación.
 */

/** Una semana muy cargada: 7 rodadas fuertes seguidas (fatiga ≫ base). */
function seedHardWeek(backend: MockSupabase, u: MockUser): void {
  for (let i = 1; i <= 7; i++) {
    const st = new Date(Date.now() - i * 86_400_000);
    backend.table('sessions').push({
      id: `s-${i}`,
      user_id: u.id,
      workout_name: 'VO2 6×3',
      started_at: st.toISOString(),
      finished_at: new Date(st.getTime() + 90 * 60_000).toISOString(),
      ftp: 220,
      training_stress_score: 150,
      intensity_factor: 0.95,
      rpe: 8,
      source: 'torq',
      completion: 'complete',
    });
  }
}

async function enter(page: Page, backend: MockSupabase, who: 'ana' | 'beto', guides = false): Promise<MockUser> {
  const u = user(who);
  backend.users.push(u);
  seedProfile(backend, u, who);
  await backend.seedSession(page, u);
  if (!guides) await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  return u;
}

test.describe('Género según el perfil', () => {
  for (const [who, expected, wrong] of [
    ['ana', 'Vienes cargada', 'cargado'],
    ['beto', 'Vienes cargado', 'cargada'],
  ] as const) {
    test(`${who}: Piñón concuerda («${expected}»)`, async ({ page, backend, ux }) => {
      const u = await enter(page, backend, who);
      seedHardWeek(backend, u);
      await page.goto('/#/home');
      await openChat(page, ux);
      const answer = await tapQuick(page, ux, '¿Cómo está mi forma?');
      expect(answer).toContain(expected);
      expect(answer).not.toContain(wrong);
      if (who === 'ana') await ux.shot('60-chat-genero-ana', page.locator('aside.pinon-chat'));
    });
  }

  test('la guía de Forma y la tarjeta de forma también concuerdan', async ({ page, backend, ux }) => {
    await enter(page, backend, 'ana', true);
    await page.goto('/#/form');
    const text = await bubbleText(page);
    expect(text).toContain('llegas fresca');
    await ux.shot('61-guia-forma-ana');
  });
});

test.describe('Piñón en el Resumen', () => {
  test('comenta la sesión en el género del perfil, ofrece el chat y la sesión abre por enlace', async ({ page, backend, ux }) => {
    const u = await enter(page, backend, 'ana');
    const st = new Date(Date.now() - 3 * 3600_000);
    backend.table('sessions').push({
      id: 's-z2',
      user_id: u.id,
      workout_name: 'Base Z2 · 60 min',
      started_at: st.toISOString(),
      finished_at: new Date(st.getTime() + 60 * 60_000).toISOString(),
      ftp: 200,
      // como la base real: las columnas sin dato vienen en null, no ausentes
      ...Object.fromEntries(['avg_power', 'max_power', 'avg_cadence', 'max_cadence', 'avg_hr', 'max_hr', 'normalized_power', 'variability_index', 'efficiency_factor', 'note', 'fit_path', 'workout_id', 'strava_activity_id', 'kind', 'srpe_load', 'planned_item_id', 'metrics'].map((k) => [k, null])),
      intensity_factor: 0.67,
      training_stress_score: 45,
      hr_drift_pct: 3.1,
      rpe: null,
      source: 'torq',
      completion: 'complete',
    });
    // el enlace directo (o recargar después de rodar) ya no deja el Resumen vacío
    await page.goto('/#/session/s-z2');
    const said = page.locator('.summary-pinon');
    await expect(said).toContainText('Bien hecha');
    await expect(page.locator('.pinon-chat-launcher')).toBeVisible();
    expect(await ux.englishIn(page.locator('.summary-screen'))).toEqual([]);
    await expect(page.locator('.summary-screen')).not.toContainText(/Variability|Efficiency/);
    await ux.shot('62-resumen-pinon');
  });
});

test.describe('Lista de espera', () => {
  test('sin invitación: se apunta en 2 campos y queda claro qué sigue', async ({ page, backend, ux }) => {
    await page.goto('/');
    await ux.click(page.locator('#waitlist-toggle'), '¿Sin cuenta? Lista de espera');
    await ux.shot('63-lista-de-espera');
    await ux.fill(page.locator('#waitlist-email'), 'Luis@Correo.com', 'Correo');
    await page.locator('#waitlist-discipline').selectOption('gravel');
    await ux.click(page.locator('#waitlist-btn'), 'Apuntarme');
    await expect(page.locator('#waitlist-result')).toContainText('ya estás en la lista');
    await expect(page.locator('#waitlist-email')).toBeHidden();
    expect(backend.table('waitlist')).toEqual([expect.objectContaining({ email: 'luis@correo.com', discipline: 'gravel' })]);
    expect(ux.interactions).toBeLessThanOrEqual(4);
  });

  test('correo mal escrito: avisa en español y no manda nada', async ({ page, backend, ux }) => {
    await page.goto('/');
    await ux.click(page.locator('#waitlist-toggle'), 'Lista de espera');
    await ux.fill(page.locator('#waitlist-email'), 'luis@', 'Correo');
    await ux.click(page.locator('#waitlist-btn'), 'Apuntarme');
    await expect(page.locator('#waitlist-result')).toContainText('Revisa tu correo');
    expect(backend.table('waitlist')).toHaveLength(0);
  });

  test('si ya estaba apuntado, la respuesta es la misma (no revela quién está)', async ({ page, backend, ux }) => {
    backend.table('waitlist');
    // el índice único de la tabla rechaza el duplicado con 23505
    await page.route('http://supabase.test/rest/v1/waitlist*', (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '23505', message: 'duplicate key value' }) }),
    );
    await page.goto('/');
    await ux.click(page.locator('#waitlist-toggle'), 'Lista de espera');
    await ux.fill(page.locator('#waitlist-email'), 'luis@correo.com', 'Correo');
    await ux.click(page.locator('#waitlist-btn'), 'Apuntarme');
    await expect(page.locator('#waitlist-result')).toContainText('ya estás en la lista');
  });

  test('desde la lista de espera se vuelve al login en 1 clic', async ({ page, ux }) => {
    await page.goto('/');
    await ux.click(page.locator('#waitlist-toggle'), 'Lista de espera');
    await ux.click(page.locator('#entry-toggle'), 'Ya tengo cuenta: entrar');
    await expect(page.locator('#login-email')).toBeFocused();
    await expect(page.locator('#waitlist-form')).not.toHaveClass(/open/);
  });
});
