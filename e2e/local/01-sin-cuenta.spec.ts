import { test, expect } from '../support/ux';
import { bubbleText, dismissGuide, openChat, tapQuick } from '../support/flows';

/**
 * Sin cuenta (despliegue sin nube o persona que solo quiere rodar): abrir y
 * pedalear. Meta dura: ≤ 5 clics de abrir la app a estar rodando.
 */

test('abrir la app por primera vez y rodar en modo demo: ≤ 5 clics', async ({ page, ux }) => {
  await page.goto('/');
  await expect(page.locator('.home-screen')).toBeVisible();
  await dismissGuide(page, ux);
  await ux.click(page.locator('#welcome-ride'), 'Rodar 30 min suave ahora');
  await expect(page).toHaveURL(/#\/prepare/);
  await ux.click(page.locator('#demo-link'), 'Probar sin rodillo');
  await expect(page).toHaveURL(/#\/train/);
  // el simulador pedalea a ~90 rpm: arranca solo
  await expect(page.locator('#btnMain')).toHaveText(/Pausar/, { timeout: 15_000 });
  await ux.shot('41-rodando-demo');
  const m = ux.milestone('rodando');
  expect(m.clicks).toBeLessThanOrEqual(5);
});

test('primera vez sin cuenta: bienvenida con un solo camino (rodar), sin promesas de coach', async ({ page, ux }) => {
  await page.goto('/');
  const welcome = page.locator('.home-welcome');
  await expect(welcome).toBeVisible();
  await expect(page.locator('#welcome-ride')).toBeVisible();
  await expect(page.locator('#welcome-plan')).toHaveCount(0);
  await expect(welcome).not.toContainText('coach');
  await ux.shot('40-local-primera-vez');
});

test('ya con algo agendado, la guía de Inicio describe lo que sí hay en pantalla', async ({ page, ux }) => {
  // en la bienvenida de primera vez la guía no sale (Piñón ya está ahí)
  await page.goto('/');
  // genera la rodada de hoy desde la bienvenida: deja de ser «primera vez»
  await page.locator('#welcome-ride').click();
  await expect(page).toHaveURL(/#\/prepare/);
  await page.goto('/#/home');
  await page.reload();
  const text = await bubbleText(page);
  if (/Empezar a rodar/.test(text)) await expect(page.locator('.home-ride-btn[data-ride-id]').first()).toBeVisible();
  void ux;
});

test('después de la demo, volver a «Antes de empezar» no graba una sesión falsa', async ({ page, ux }) => {
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  await page.goto('/');
  await ux.click(page.locator('#welcome-ride'), 'Rodar 30 min suave ahora');
  await ux.click(page.locator('#demo-link'), 'Probar sin rodillo');
  await expect(page.locator('#btnMain')).toHaveText(/Pausar/, { timeout: 15_000 });
  // sale de la demo y vuelve a preparar el mismo workout
  await page.goto('/#/home');
  await page.goto('/#/prepare');
  // sin rodillo conectado de verdad, «Empezar» debe seguir apagado
  await expect(page.locator('#continue')).toBeDisabled();
});

test('chat sin cuenta: los botones contestan y la pregunta libre explica por qué no hay IA (no «sin conexión»)', async ({ page, ux }) => {
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  await page.goto('/');
  await openChat(page, ux);
  const local = await tapQuick(page, ux, 'Dame ánimo');
  expect(local.length).toBeGreaterThan(10);
  const chat = page.locator('aside.pinon-chat');
  await ux.fill(chat.locator('input[name=q]'), '¿Cuánto debo calentar?', 'Pregunta libre');
  await ux.click(chat.locator('.pinon-chat-send'), 'Enviar');
  const last = chat.locator('.pinon-chat-msg.pinon:not(.typing)').last();
  await expect(last).not.toHaveText(/aquí ando/);
  await ux.shot('42-local-chat-libre', chat);
  await expect(last).not.toContainText('Sin conexión');
});

test('Piñón sin cuenta y sin plan no receta «descansar»: propone empezar', async ({ page, ux }) => {
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  await page.goto('/');
  await openChat(page, ux);
  const answer = await tapQuick(page, ux, '¿Qué toca hoy?');
  expect(answer).not.toMatch(/toca descansar/);
  await expect(page.locator('aside.pinon-chat .pinon-chat-msg.pinon').last().locator('.pinon-chat-action')).toBeVisible();
});

test('sin cuenta, lo que creas sobrevive a recargar la página', async ({ page, ux }) => {
  await page.goto('/');
  await ux.click(page.locator('#welcome-ride'), 'Rodar 30 min suave ahora');
  await expect(page).toHaveURL(/#\/prepare/);
  await page.reload();
  await page.goto('/#/plan');
  await page.reload();
  await expect(page.locator('body')).toContainText('Z2 aeróbico · 30 min');
});
