// Panel «Platica con Piñón» (se carga al tocar el botón, ver
// pinon-chat-launcher.ts). Tres capas, y solo la última cuesta:
//  1. Botones: respuesta local con tus datos (core/pinon-chat.ts).
//  2. Texto que se parece a un botón, o que pide un cambio: igual, local.
//  3. Lo demás va a pinon-chat (Haiku); la respuesta se guarda en caché del
//     navegador por día y datos, así repetir la pregunta no vuelve a cobrar.
// Piñón solo opina: nada de aquí escribe en el plan.
import { PINON_MAX_CHARS, PINON_QUICK, localAnswer, matchIntent, pinonCacheKey } from '../core/pinon-chat';
import type { PinonChatData, PinonIntent, PinonReply, PinonReplyAction } from '../core/pinon-chat';
import { PINON_HISTORY_TURNS } from '../core/pinon-chat-request';
import type { PinonTurn } from '../core/pinon-chat-request';
import { askPinon } from '../sync/pinon-chat';
import { buildPinonChatData } from './pinon-context';
import { pinonFigureHtml, setPinonPose } from './pinon';
import { appState } from './state';

interface ChatMessage {
  role: 'user' | 'pinon';
  text: string;
  action?: PinonReplyAction;
}

const LOG_KEY = 'torq.pinon.chat.log';
const CACHE_KEY = 'torq.pinon.chat.cache';
const LOG_MAX = 40;
const GREETING = 'Hola, aquí ando. Pregúntame lo que quieras de tu entrenamiento, o toca un botón.';

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento: el chat sigue, solo no se recuerda
  }
}

function localKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** La conversación de hoy (mañana empieza en blanco). */
function loadLog(): ChatMessage[] {
  const saved = lsGet<{ date: string; messages: ChatMessage[] }>(LOG_KEY);
  return saved && saved.date === localKey() ? saved.messages : [];
}
function saveLog(messages: ChatMessage[]): void {
  lsSet(LOG_KEY, { date: localKey(), messages: messages.slice(-LOG_MAX) });
}

function cachedReply(key: string): string | null {
  return lsGet<Record<string, string>>(CACHE_KEY)?.[key] ?? null;
}
function cacheReply(key: string, reply: string): void {
  const today = key.split(':')[0];
  const cache = lsGet<Record<string, string>>(CACHE_KEY) ?? {};
  // solo se guarda lo de hoy: lo de otros días ya no puede volver a servir
  const kept = Object.fromEntries(Object.entries(cache).filter(([k]) => k.startsWith(`${today}:`)));
  lsSet(CACHE_KEY, { ...kept, [key]: reply });
}

/** Si el chat abierto no está disponible para esta cuenta, ya no se intenta
 * hasta recargar la app. */
let aiUnavailable = false;

const ERROR_TEXT = {
  not_available: 'Por ahora el chat abierto todavía no está disponible para tu cuenta. Los botones sí funcionan.',
  daily_limit: 'Ya platicamos mucho hoy. Mañana seguimos; los botones funcionan siempre.',
  offline: 'Sin conexión no puedo pensar respuestas nuevas. Los botones funcionan sin internet.',
  no_account: 'Para preguntas abiertas necesito que entres con tu cuenta de Torq. Los botones sí funcionan aquí.',
  subscription_required: 'Las preguntas abiertas vienen con Torq Coach IA. Los botones sí funcionan siempre.',
  failed: 'Se me trabó la cadena. Intenta otra vez en un momento.',
} as const;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function dayOfYear(d = new Date()): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

let panel: HTMLElement | null = null;
let onCloseCb: (() => void) | null = null;

export function isPinonChatOpen(): boolean {
  return panel !== null;
}

export function closePinonChat(returnFocus = true): void {
  if (!panel) return;
  panel.remove();
  panel = null;
  document.removeEventListener('keydown', onKey, true);
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
  if (returnFocus) document.querySelector<HTMLElement>('.pinon-chat-launcher')?.focus();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && panel) {
    e.stopPropagation();
    closePinonChat();
  }
}

/** Abre el panel. `onClose` avisa al botón para que vuelva a aparecer.
 * `onNavigate` = se tocó una acción que lleva a otra pantalla del chat
 * (el panel se vuelve a abrir allá). */
export function openPinonChat(opts: { onClose?: () => void; onNavigate?: () => void } = {}): void {
  if (panel) return;
  onCloseCb = opts.onClose ?? null;
  const messages = loadLog();
  if (messages.length === 0) messages.push({ role: 'pinon', text: GREETING });

  panel = document.createElement('aside');
  panel.className = 'pinon-chat';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Platica con Piñón');
  panel.innerHTML = `
    <header class="pinon-chat-head">
      ${pinonFigureHtml('base', 52)}
      <div class="pinon-chat-title"><b>Piñón</b><span>Solo opino: tu plan lo cambia tu coach.</span></div>
      <button type="button" class="pinon-chat-close" aria-label="Cerrar">×</button>
    </header>
    <div class="pinon-chat-log" aria-live="polite"></div>
    <div class="pinon-chat-quick">${PINON_QUICK.map((q) => `<button type="button" data-intent="${q.intent}">${q.label}</button>`).join('')}</div>
    <form class="pinon-chat-form" autocomplete="off">
      <input type="text" name="q" maxlength="${PINON_MAX_CHARS}" placeholder="Pregúntale algo a Piñón…" aria-label="Tu pregunta para Piñón">
      <button type="submit" class="pinon-chat-send" aria-label="Enviar">Enviar</button>
      <span class="pinon-chat-count" aria-hidden="true">0/${PINON_MAX_CHARS}</span>
    </form>`;
  document.body.appendChild(panel);
  document.addEventListener('keydown', onKey, true);

  const log = panel.querySelector<HTMLElement>('.pinon-chat-log')!;
  const fig = panel.querySelector<HTMLElement>('.pinon')!;
  const input = panel.querySelector<HTMLInputElement>('input')!;
  const count = panel.querySelector<HTMLElement>('.pinon-chat-count')!;
  const sendBtn = panel.querySelector<HTMLButtonElement>('.pinon-chat-send')!;
  let busy = false;

  const paint = () => {
    log.innerHTML = messages
      .map(
        (m, i) =>
          `<div class="pinon-chat-msg ${m.role}"><p>${escapeHtml(m.text)}</p>${
            m.action ? `<a class="pinon-chat-action" href="${escapeHtml(m.action.href)}" data-msg="${i}">${escapeHtml(m.action.label)}</a>` : ''
          }</div>`,
      )
      .join('');
    if (busy) log.insertAdjacentHTML('beforeend', '<div class="pinon-chat-msg pinon typing" aria-label="Piñón está escribiendo"><p><i></i><i></i><i></i></p></div>');
    log.scrollTop = log.scrollHeight;
  };
  const push = (m: ChatMessage) => {
    messages.push(m);
    saveLog(messages.filter((x) => x.text !== GREETING));
    paint();
  };
  const setBusy = (on: boolean) => {
    busy = on;
    sendBtn.disabled = on;
    panel?.querySelectorAll<HTMLButtonElement>('[data-intent]').forEach((b) => (b.disabled = on));
    setPinonPose(fig, on ? 'habla' : 'base');
    paint();
  };

  const reply = (r: PinonReply) => push({ role: 'pinon', text: r.text, ...(r.action ? { action: r.action } : {}) });

  async function answerLocal(intent: PinonIntent): Promise<void> {
    const data = await buildPinonChatData();
    reply(localAnswer(intent, data, dayOfYear()));
  }

  async function ask(text: string): Promise<void> {
    push({ role: 'user', text });
    const intent = matchIntent(text);
    if (intent) return answerLocal(intent);
    if (aiUnavailable) return reply({ text: ERROR_TEXT.subscription_required, action: { label: 'Conocer Torq Coach IA', href: '#/profile' } });
    setBusy(true);
    try {
      const data: PinonChatData = await buildPinonChatData();
      const key = pinonCacheKey(text, data);
      const cached = cachedReply(key);
      if (cached) return reply({ text: cached });
      // la conversación previa, sin el saludo ni la pregunta que se acaba de agregar
      const history: PinonTurn[] = messages
        .slice(0, -1)
        .filter((m) => m.text !== GREETING)
        .slice(-PINON_HISTORY_TURNS)
        .map((m) => ({ role: m.role, text: m.text }));
      const res = await askPinon(text, history, data);
      if ('reply' in res) {
        cacheReply(key, res.reply);
        reply({ text: res.reply });
      } else {
        if (res.error === 'not_available' || res.error === 'subscription_required') aiUnavailable = true;
        reply(res.error === 'subscription_required' ? { text: ERROR_TEXT.subscription_required, action: { label: 'Conocer Torq Coach IA', href: '#/profile' } } : { text: ERROR_TEXT[res.error] });
      }
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  panel.querySelector('.pinon-chat-close')!.addEventListener('click', () => closePinonChat());
  panel.querySelector('.pinon-chat-quick')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-intent]');
    if (!btn || busy) return;
    push({ role: 'user', text: btn.textContent ?? '' });
    void answerLocal(btn.dataset.intent as PinonIntent);
  });
  input.addEventListener('input', () => (count.textContent = `${input.value.length}/${PINON_MAX_CHARS}`));
  panel.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, PINON_MAX_CHARS);
    if (!text || busy) return;
    input.value = '';
    count.textContent = `0/${PINON_MAX_CHARS}`;
    void ask(text);
  });
  log.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('.pinon-chat-action');
    if (!a) return;
    if (a.getAttribute('href') === '#/prepare') {
      // Empezar a rodar: mismo flujo que el botón de Inicio, y sin panel encima
      const today = appState.workouts.find((w) => w.scheduledDate === localKey());
      if (today) appState.selectedWorkoutId = today.id;
      closePinonChat(false);
    } else {
      opts.onNavigate?.();
    }
  });

  paint();
  input.focus();
}
