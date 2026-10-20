import { test, expect, user } from '../support/ux';
import type { Ux } from '../support/ux';
import type { Page } from '@playwright/test';
import type { MockSupabase } from '../support/mock-supabase';
import { ask, openChat, tapQuick } from '../support/flows';
import { seedProfile, seedWorkout } from '../support/seed';

/**
 * Hablar con Piñón: llegar rápido, respuestas objetivas y siempre un camino
 * para seguir. Metas duras: ≤ 3 clics de abrir la app a hablar con Piñón;
 * respuestas de los botones al instante y sin gastar IA.
 */

type Who = 'nueva' | 'con-entreno';
const AI_REPLY = 'Hoy toca sweet spot: 3 bloques a ritmo firme pero sostenible. Si te sientes bien, cúmplelo tal cual; si no, baja a Z2.';

async function enter(page: Page, backend: MockSupabase, who: Who, ux?: Ux): Promise<void> {
  const u = user(who === 'nueva' ? 'ana' : 'beto');
  backend.users.push(u);
  if (who === 'con-entreno') {
    seedProfile(backend, u, 'beto');
    seedWorkout(backend, u, { template: 'sweet_spot', minutes: 60, name: 'Sweet spot 3×10' });
  }
  backend.functions.set('pinon-chat', () => ({ body: { reply: AI_REPLY }, delayMs: 300 }));
  await backend.seedSession(page, u);
  await page.addInitScript(() => localStorage.setItem('torq.pinon.guides', 'off'));
  await page.goto('/#/home');
  await expect(page.locator('.home-screen')).toBeVisible();
  ux?.note('App abierta con sesión');
}

const chat = (page: Page) => page.locator('aside.pinon-chat');

test.describe('Llegar a Piñón', () => {
  for (const screen of ['home', 'plan', 'form', 'library', 'profile', 'session'] as const) {
    test(`desde ${screen}: ≤ 3 clics para empezar a hablar`, async ({ page, backend, ux }) => {
      await enter(page, backend, 'con-entreno');
      await page.goto(`/#/${screen}`);
      await page.waitForTimeout(400);
      const launcher = page.locator('.pinon-chat-launcher');
      if (!(await launcher.isVisible())) {
        // la persona busca a Piñón: lo más probable es volver a Inicio
        ux.read(`No ve a Piñón en ${screen}`);
        ux.finding('UX-PIN-1', `En «${screen}» no hay botón de Piñón.`);
        await ux.click(page.locator('.sidebar-link', { hasText: 'Inicio' }), 'Ir a Inicio');
      }
      await openChat(page, ux);
      await expect(chat(page).locator('input[name=q]')).toBeFocused();
      const m = ux.milestone('chat');
      expect(m.clicks).toBeLessThanOrEqual(3);
    });
  }

  test('el chat se ve completo y el saludo dice qué puede hacer Piñón', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    await openChat(page, ux);
    await ux.shot('10-chat-abierto');
    const first = chat(page).locator('.pinon-chat-msg.pinon').first();
    await expect(first).toContainText(/pregúntame|botón/i);
    await expect(chat(page).locator('.pinon-chat-quick [data-intent]')).toHaveCount(6);
    await expect(chat(page)).toContainText('Solo opino');
  });
});

test.describe('Botones rápidos: al instante, con datos, sin gastar IA', () => {
  const QUICK = ['¿Qué toca hoy?', '¿Cómo voy esta semana?', '¿Cómo está mi forma?', '¿Para qué sirve el entreno de hoy?', 'Dame ánimo'] as const;
  for (const who of ['nueva', 'con-entreno'] as const) {
    for (const label of QUICK) {
      test(`${who} · «${label}»`, async ({ page, backend, ux }) => {
        await enter(page, backend, who);
        await openChat(page, ux);
        const t0 = Date.now();
        const answer = await tapQuick(page, ux, label);
        const ms = Date.now() - t0;
        ux.metrics['respuesta.ms'] = ms;
        ux.metrics['respuesta.chars'] = answer.length;
        expect(ms, 'respuesta local').toBeLessThan(1500);
        expect(backend.fnCalls('pinon-chat'), 'los botones no gastan IA').toHaveLength(0);
        expect(answer.length, 'respuesta corta y al grano').toBeLessThanOrEqual(320);
        expect(answer.trim().length).toBeGreaterThan(10);
        expect(await ux.englishIn(chat(page))).toEqual([]);
        expect(await ux.jargonIn(chat(page).locator('.pinon-chat-msg.pinon').last()), 'siglas sin explicar').toEqual([]);
      });
    }
  }

  test('con-entreno · «¿Qué toca hoy?» lleva a rodar en 1 clic más', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    await openChat(page, ux);
    const answer = await tapQuick(page, ux, '¿Qué toca hoy?');
    expect(answer).toContain('Sweet spot');
    const action = chat(page).locator('.pinon-chat-msg.pinon').last().locator('.pinon-chat-action');
    await expect(action).toBeVisible();
    await ux.shot('11-chat-que-toca-hoy', chat(page));
    await ux.click(action, `Acción: ${await action.innerText()}`);
    await expect(page).toHaveURL(/#\/(prepare|plan)/);
    const m = ux.milestone('rodar');
    expect(m.clicks).toBeLessThanOrEqual(3);
  });

  test('nueva · «¿Qué toca hoy?» sin nada agendado ofrece un siguiente paso', async ({ page, backend, ux }) => {
    await enter(page, backend, 'nueva');
    await openChat(page, ux);
    await tapQuick(page, ux, '¿Qué toca hoy?');
    await ux.shot('12-chat-nada-agendado', chat(page));
    await expect(chat(page).locator('.pinon-chat-msg.pinon').last().locator('.pinon-chat-action')).toBeVisible();
  });

  test('el botón de cansancio habla en neutro (no da por hecho el género)', async ({ page, backend, ux }) => {
    await enter(page, backend, 'nueva');
    await openChat(page, ux);
    const labels = await chat(page).locator('.pinon-chat-quick [data-intent]').allInnerTexts();
    expect(labels.filter((l) => /cansad[oa]\b/i.test(l))).toEqual([]);
  });
});

test.describe('Preguntas abiertas (IA)', () => {
  test('pregunta libre: indicador de «escribiendo», 1 llamada con contexto, respuesta visible', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    backend.functions.set('pinon-chat', () => ({ body: { reply: AI_REPLY }, delayMs: 1500 }));
    await openChat(page, ux);
    await ux.fill(chat(page).locator('input[name=q]'), '¿Conviene comer algo antes de los bloques de hoy?', 'Pregunta libre');
    await ux.click(chat(page).locator('.pinon-chat-send'), 'Enviar');
    await expect(chat(page).locator('.pinon-chat-msg.typing')).toBeVisible();
    await expect(chat(page).locator('.pinon-chat-send')).toBeDisabled();
    await ux.shot('13-chat-escribiendo', chat(page));
    await expect(chat(page).locator('.pinon-chat-msg.pinon').last()).toContainText('sweet spot');
    const calls = backend.fnCalls('pinon-chat');
    expect(calls).toHaveLength(1);
    const body = calls[0].body as { message: string; context: { today?: { name: string } } };
    expect(body.context.today?.name).toContain('Sweet spot');
    await ux.shot('14-chat-respuesta-ia', chat(page));
  });

  test('la misma pregunta dos veces no vuelve a gastar IA (caché)', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    await openChat(page, ux);
    await ask(page, ux, '¿Qué cadencia me conviene en los bloques?');
    await ask(page, ux, '¿Qué cadencia me conviene en los bloques?');
    expect(backend.fnCalls('pinon-chat')).toHaveLength(1);
  });

  test('pedir un cambio de plan: lo contesta sin IA y manda a quien sí lo cambia', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    await openChat(page, ux);
    const answer = await ask(page, ux, '¿Puedes cambiarme el entreno de hoy por uno más corto?');
    expect(backend.fnCalls('pinon-chat')).toHaveLength(0);
    expect(answer).toMatch(/coach|plan/i);
  });

  test('doble clic en Enviar manda una sola pregunta', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    backend.functions.set('pinon-chat', () => ({ body: { reply: AI_REPLY }, delayMs: 800 }));
    await openChat(page, ux);
    await ux.fill(chat(page).locator('input[name=q]'), '¿Cómo respiro en los bloques duros?', 'Pregunta');
    await chat(page).locator('.pinon-chat-send').dblclick();
    await expect(chat(page).locator('.pinon-chat-msg.pinon').last()).toContainText('sweet spot');
    expect(backend.fnCalls('pinon-chat')).toHaveLength(1);
    await expect(chat(page).locator('.pinon-chat-msg.user')).toHaveCount(1);
  });

  test('el límite de 200 caracteres se ve antes de chocar con él', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    await openChat(page, ux);
    await chat(page).locator('input[name=q]').fill('a'.repeat(250));
    await expect(chat(page).locator('.pinon-chat-count')).toHaveText('200/200');
  });
});

test.describe('Cuando la IA falla, la persona no se queda atorada', () => {
  const CASES = [
    { name: 'cuenta sin acceso (403)', reply: { status: 403, body: { error: 'not_available' } }, expectText: /todavía no está disponible/, retryCalls: 0 },
    { name: 'límite diario (429)', reply: { status: 429, body: { error: 'daily_limit' } }, expectText: /mañana seguimos/i, retryCalls: 1 },
    { name: 'error del servidor (500)', reply: { status: 500, body: { error: 'boom' } }, expectText: /intenta otra vez/i, retryCalls: 1 },
  ] as const;
  for (const c of CASES) {
    test(`${c.name}: mensaje en español, botones siguen funcionando`, async ({ page, backend, ux }) => {
      await enter(page, backend, 'con-entreno');
      backend.functions.set('pinon-chat', () => c.reply);
      await openChat(page, ux);
      const answer = await ask(page, ux, '¿Cuánta agua tomo en una hora de rodillo?');
      expect(answer).toMatch(c.expectText);
      expect(await ux.englishIn(chat(page))).toEqual([]);
      await ux.shot(`15-chat-error-${c.reply.status}`, chat(page));
      // los botones siguen sirviendo
      const local = await tapQuick(page, ux, '¿Qué toca hoy?');
      expect(local).toContain('Sweet spot');
      // reintentar otra pregunta
      await ask(page, ux, '¿Y si sudo mucho?');
      expect(backend.fnCalls('pinon-chat').length).toBe(1 + c.retryCalls);
    });
  }

  test('IA lenta (8 s): se ve que está pensando y llega la respuesta', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    backend.functions.set('pinon-chat', () => ({ body: { reply: AI_REPLY }, delayMs: 8000 }));
    await openChat(page, ux);
    await ux.fill(chat(page).locator('input[name=q]'), '¿Uso ventilador en el rodillo?', 'Pregunta');
    await ux.click(chat(page).locator('.pinon-chat-send'), 'Enviar');
    await page.waitForTimeout(4000);
    await expect(chat(page).locator('.pinon-chat-msg.typing')).toBeVisible();
    await expect(chat(page).locator('.pinon-chat-msg.pinon').last()).toContainText('sweet spot', { timeout: 15_000 });
  });

  test('IA colgada: a los 25 s Piñón avisa y deja seguir (no se queda «escribiendo» para siempre)', async ({ page, backend, ux }) => {
    test.setTimeout(90_000);
    await enter(page, backend, 'con-entreno');
    backend.functions.set('pinon-chat', () => ({ body: { reply: AI_REPLY }, delayMs: 60_000 }));
    await openChat(page, ux);
    await ux.fill(chat(page).locator('input[name=q]'), '¿Qué hago si me da calambre?', 'Pregunta');
    await ux.click(chat(page).locator('.pinon-chat-send'), 'Enviar');
    await expect(chat(page).locator('.pinon-chat-msg.typing')).toBeHidden({ timeout: 30_000 });
    await expect(chat(page).locator('.pinon-chat-send')).toBeEnabled();
    await expect(chat(page).locator('.pinon-chat-msg.pinon').last()).toContainText(/intenta otra vez/i);
  });
});

test.describe('Ir y volver', () => {
  test('el chat sigue abierto al pasar a Plan y la conversación se conserva al cerrarlo y abrirlo', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    await openChat(page, ux);
    await tapQuick(page, ux, '¿Cómo voy esta semana?');
    await ux.click(page.locator('.sidebar-link', { hasText: 'Plan' }), 'Ir a Plan');
    await expect(chat(page)).toBeVisible();
    await ux.click(chat(page).locator('.pinon-chat-close'), 'Cerrar chat');
    await expect(chat(page)).toHaveCount(0);
    await expect(page.locator('.pinon-chat-launcher')).toBeFocused();
    await openChat(page, ux);
    await expect(chat(page).locator('.pinon-chat-msg.user')).toHaveCount(1);
  });

  test('Esc cierra el chat y regresa el foco al botón de Piñón', async ({ page, backend, ux }) => {
    await enter(page, backend, 'con-entreno');
    await openChat(page, ux);
    await page.keyboard.press('Escape');
    await expect(chat(page)).toHaveCount(0);
    await expect(page.locator('.pinon-chat-launcher')).toBeFocused();
  });
});
