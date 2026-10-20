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
  await ux.shot('40-local-primera-vez');
  await ux.click(page.locator('#gen-create'), 'Generar y entrenar');
  await expect(page).toHaveURL(/#\/prepare/);
  await ux.click(page.locator('#demo-link'), 'Probar sin rodillo');
  await expect(page).toHaveURL(/#\/train/);
  // el simulador pedalea a ~90 rpm: arranca solo
  await expect(page.locator('#btnMain')).toHaveText(/Pausar/, { timeout: 15_000 });
  await ux.shot('41-rodando-demo');
  const m = ux.milestone('rodando');
  expect(m.clicks).toBeLessThanOrEqual(5);
});

test('la guía de Inicio describe lo que sí hay en pantalla', async ({ page, ux }) => {
  await page.goto('/');
  const text = await bubbleText(page);
  if (/Empezar a rodar/.test(text)) await expect(page.locator('.home-ride-btn[data-ride-id]')).toBeVisible();
  void ux;
});

test('después de la demo, volver a «Antes de empezar» no graba una sesión falsa', async ({ page, ux }) => {
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  await page.goto('/');
  await ux.click(page.locator('#gen-create'), 'Generar y entrenar');
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
