import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { MockUser } from './mock-supabase';
import type { Ux } from './ux';

/** Perfil que llena una persona en el cuestionario (solo lo mínimo
 * obligatorio, como lo haría alguien con prisa). */
export interface Persona {
  sex: 'Hombre' | 'Mujer' | 'Otro';
  /** dd/mm/aaaa tal como lo teclea. */
  birth: string;
  weight: string;
  height: string;
  experience: 'Nunca con estructura' | 'Ya entreno, pero no en Torq' | 'Entreno regular';
  fitness: 'Apenas arranco' | 'Activo, pero no en bici' | 'Ya ando en bici seguido';
  years: string;
  structuredYears: string;
  recentTraining: 'Poco o nada' | 'Rodadas suaves' | 'Con intensidad';
  discipline: 'Montaña / XC' | 'Ruta' | 'Gravel' | 'Otra';
  /** null = marca «No sé mi FTP todavía». */
  ftp: string | null;
  hrMax: string | null;
  sleepHours: string;
  bestResult: string;
}

export const NOVATA: Persona = {
  sex: 'Mujer',
  birth: '15031992',
  weight: '68',
  height: '165',
  experience: 'Nunca con estructura',
  fitness: 'Apenas arranco',
  years: '0',
  structuredYears: '0',
  recentTraining: 'Poco o nada',
  discipline: 'Ruta',
  ftp: null,
  hrMax: null,
  sleepHours: '7',
  bestResult: 'ninguno todavía',
};

export const EXPERIMENTADO: Persona = {
  sex: 'Hombre',
  birth: '02081985',
  weight: '74',
  height: '178',
  experience: 'Entreno regular',
  fitness: 'Ya ando en bici seguido',
  years: '12',
  structuredYears: '6',
  recentTraining: 'Con intensidad',
  discipline: 'Montaña / XC',
  ftp: '265',
  hrMax: '186',
  sleepHours: '7',
  bestResult: 'Podio en un XC estatal',
};

export async function login(page: Page, ux: Ux, u: MockUser, password = u.password ?? 'secreta'): Promise<void> {
  await page.goto('/');
  await ux.click(page.locator('#entry-toggle'), 'Entrar (abrir campos)');
  await ux.fill(page.locator('#login-email'), u.email, 'Correo');
  await ux.fill(page.locator('#login-password'), password, 'Contraseña');
  await ux.click(page.locator('#login-password-btn'), 'Entrar');
}

/** Llena el cuestionario con lo mínimo obligatorio y guarda. Devuelve los
 * intentos de «Guardar» que necesitó (más de 1 = la validación lo regresó). */
export async function fillOnboarding(page: Page, ux: Ux, p: Persona): Promise<void> {
  const m = page.locator('#onboarding-modal');
  await expect(m).toBeVisible();
  const chip = (group: string, text: string) => m.locator(`#${group} .ob-chip`, { hasText: text }).first();
  const option = (group: string, text: string) => m.locator(`#${group} .ob-option`, { hasText: text });
  const toggle = (id: string) => m.locator(`label.ob-toggle:has(#${id})`);
  // las preguntas hay que leerlas antes de contestarlas
  await ux.readText(m.locator('.ob-body'), 'Leer el cuestionario');

  // 1. Sobre ti
  await ux.click(m.locator('#ob-sex .ob-chip', { hasText: p.sex }), `Sexo: ${p.sex}`);
  // Clic en el campo abre el calendario; quien teclea la fecha entra con Tab.
  await m.locator('[role=spinbutton][aria-label="Día"]').focus();
  await page.keyboard.type(p.birth, { delay: 30 });
  await page.keyboard.press('Escape').catch(() => {});
  ux.fills++;
  ux.note('Fecha de nacimiento (teclado)');
  await ux.fill(m.locator('#ob-weight'), p.weight, 'Peso');
  await ux.fill(m.locator('#ob-height'), p.height, 'Altura');
  // 2. Salud
  await ux.click(chip('ob-conditions', 'Ninguna'), 'Condiciones: Ninguna');
  await ux.click(chip('ob-medication', 'No'), 'Medicamento: No');
  await ux.click(chip('ob-recent-injury', 'No'), 'Lesión reciente: No');
  await ux.click(chip('ob-injury-limits', 'No'), 'Lesión limita: No');
  await ux.click(toggle('ob-no-injuries'), 'No tengo lesiones');
  // 3. Hábitos
  await ux.click(chip('ob-smoking', 'No'), 'Fuma: No');
  await ux.click(chip('ob-alcohol', 'Nunca o rara vez'), 'Alcohol');
  await ux.click(chip('ob-stress', 'Medio'), 'Estrés');
  await ux.fill(m.locator('#ob-sleep-hours'), p.sleepHours, 'Horas de sueño');
  await ux.click(chip('ob-sleep-quality', 'Bien'), 'Calidad de sueño');
  // 4. Experiencia
  await ux.click(option('ob-experience', p.experience), `Experiencia: ${p.experience}`);
  await ux.click(option('ob-fitness', p.fitness), `Actividad: ${p.fitness}`);
  await ux.fill(m.locator('#ob-years'), p.years, 'Años en bici');
  await ux.fill(m.locator('#ob-structured-years'), p.structuredYears, 'Años con estructura');
  await ux.click(chip('ob-recent-training', p.recentTraining), 'Últimas 4 semanas');
  await ux.click(chip('ob-rpe', 'Más o menos'), 'RPE');
  await ux.click(chip('ob-max-effort', 'No'), 'Esfuerzos máximos');
  // 5. Bici
  await ux.click(m.locator('#ob-discipline .ob-chip', { hasText: p.discipline }), `Disciplina: ${p.discipline}`);
  // 6. Números
  if (p.ftp) await ux.fill(m.locator('#ob-ftp'), p.ftp, 'FTP');
  else await ux.click(toggle('ob-no-ftp'), 'No sé mi FTP');
  if (p.hrMax) await ux.fill(m.locator('#ob-hrmax'), p.hrMax, 'Pulso máx');
  else await ux.click(toggle('ob-no-hrmax'), 'No sé pulso máx');
  await ux.click(toggle('ob-no-resting-hr'), 'No sé pulso en reposo');
  // 7. Otras actividades
  await ux.click(toggle('ob-no-other'), 'No hago otra actividad');
  // 8. Metas
  await ux.fill(m.locator('#ob-best-result'), p.bestResult, 'Mejor resultado');
  await ux.click(m.locator('#onboarding-submit'), 'Guardar');
  await expect(page.locator('#onboarding-modal')).toBeHidden();
}

export async function openChat(page: Page, ux: Ux): Promise<void> {
  await ux.click(page.locator('.pinon-chat-launcher'), 'Abrir chat de Piñón');
  await expect(page.locator('aside.pinon-chat')).toBeVisible();
}

/** Escribe y manda una pregunta; espera a que Piñón conteste algo. */
export async function ask(page: Page, ux: Ux, text: string): Promise<string> {
  const chat = page.locator('aside.pinon-chat');
  const before = await chat.locator('.pinon-chat-msg.pinon:not(.typing)').count();
  await ux.fill(chat.locator('input[name=q]'), text, `Pregunta: ${text}`);
  await ux.click(chat.locator('.pinon-chat-send'), 'Enviar');
  await expect(chat.locator('.pinon-chat-msg.pinon:not(.typing)')).toHaveCount(before + 1, { timeout: 20_000 });
  return chat.locator('.pinon-chat-msg.pinon:not(.typing)').last().innerText();
}

export async function tapQuick(page: Page, ux: Ux, label: string): Promise<string> {
  const chat = page.locator('aside.pinon-chat');
  const before = await chat.locator('.pinon-chat-msg.pinon:not(.typing)').count();
  await ux.click(chat.locator('.pinon-chat-quick button, .pinon-chat-quick [data-intent]', { hasText: label }).first(), `Botón: ${label}`);
  await expect(chat.locator('.pinon-chat-msg.pinon:not(.typing)')).toHaveCount(before + 1, { timeout: 10_000 });
  return chat.locator('.pinon-chat-msg.pinon:not(.typing)').last().innerText();
}

/** Cierra la guía de primera vez de Piñón si está abierta (como haría la
 * persona: «Entendido»). No cuenta si no apareció. */
export async function dismissGuide(page: Page, ux: Ux): Promise<boolean> {
  const bubble = page.locator('.pinon-bubble-layer');
  try {
    await bubble.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    return false;
  }
  ux.read('Guía de Piñón');
  await ux.click(bubble.locator('.pinon-btn-primary'), 'Guía: Entendido');
  return true;
}

/** Texto completo de la burbuja de Piñón: aparece letra por letra, así que
 * se espera a que deje de crecer. */
export async function bubbleText(page: Page): Promise<string> {
  const bubble = page.locator('.pinon-bubble-layer');
  await bubble.waitFor({ state: 'visible', timeout: 5000 });
  let prev = '';
  for (let i = 0; i < 20; i++) {
    const now = await bubble.innerText();
    if (now === prev) return now;
    prev = now;
    await page.waitForTimeout(250);
  }
  return prev;
}
