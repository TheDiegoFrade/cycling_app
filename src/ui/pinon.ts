// Piñón, la mascota del coach de IA (docs/rediseno/PINON.md). Todo vive aquí;
// las pantallas solo lo llaman. No llama a la IA ni a Supabase: el consejo se
// arma con lo que la app ya sabe (pinon-context.ts, que se carga al hacer
// clic). Nunca en train, prepare, login, limits, invite ni coach-*, ni con un
// modal abierto. Con «reducir movimiento» nada se anima.
import type { Screen } from './router';
import type { WorkoutZone } from '../core/workout-zone';

export type PinonPose = 'base' | 'habla' | 'motiva';

const SRC = {
  base: '/brand/pinon/base.webp',
  parpadeo: '/brand/pinon/parpadeo.webp',
  habla: '/brand/pinon/habla.webp',
  motiva: '/brand/pinon/motiva.webp',
  asoma: '/brand/pinon/asoma.webp',
} as const;

/** Pantallas del atleta donde se puede asomar. */
export const PEEK_SCREENS: readonly Screen[] = ['home', 'plan', 'form', 'library'];
export const PEEK_PROBABILITY = 0.4;
export const MAX_PEEKS_PER_DAY = 4;
export const PEEK_SETTING_KEY = 'torq.pinon.peek';
const peeksKey = (dateKey: string) => `torq.pinon.peeks.${dateKey}`;
const motivaKey = (weekKey: string) => `torq.pinon.motiva.${weekKey}`;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const noHover = (): boolean => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // modo privado o almacenamiento lleno: Piñón se puede repetir, no es grave
  }
}

function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Lógica pura (pinon.test.ts) ─────────────────────────────────────────────

/** ¿Toca asomarse en este render? */
export function shouldPeek(screen: Screen, peeksToday: number, enabled: boolean, rand: number): boolean {
  return enabled && PEEK_SCREENS.includes(screen) && peeksToday < MAX_PEEKS_PER_DAY && rand < PEEK_PROBABILITY;
}

/** ¿Celebrar la semana cerrada? Solo una vez por semana y con algo planeado. */
export function shouldCelebrateWeek(done: number, planned: number, alreadyCelebrated: boolean): boolean {
  return !alreadyCelebrated && planned > 0 && done >= planned;
}

export interface PinonTipContext {
  todayWorkout?: { name: string; minutes: number; zone: WorkoutZone | null };
  weekDone: number;
  weekPlanned: number;
  tsb?: number;
  hasPlan: boolean;
  isRestDay: boolean;
  /** Tiene coach humano: Piñón solo anima, nunca sugiere cambiar el plan. */
  humanCoach?: boolean;
  /** Para rotar los consejos genéricos (p. ej. el día del año). */
  seed?: number;
}

export interface PinonAction {
  label: string;
  href: string;
  /** Qué hacer antes de navegar (elegir el workout, abrir Crear plan). */
  onSelect?: () => void;
}

export type PinonTipAction = 'ride' | 'plan' | 'create';
export interface PinonTip {
  text: string;
  action?: { label: string; href: string; kind: PinonTipAction };
}

const ZONE_LINE: Record<WorkoutZone, string> = {
  fondo: 'Suave y parejo, que puedas platicar.',
  tempo: 'Ritmo firme pero cómodo.',
  'sweet spot': 'Bloques firmes: respira y sostén.',
  umbral: 'Duro y parejo, sin salir disparado.',
  VO2: 'Cortos e intensos; recupera bien entre bloques.',
  test: 'Calienta bien y dosifica desde el inicio.',
};

const GENERIC_TIPS = [
  'Pon el ventilador de frente antes de subirte: en rodillo no hay aire que te enfríe.',
  'Ten tu botella a la mano y toma un trago cada 15 minutos.',
  'Si la cadencia baja de 80, suelta un cambio y deja que las piernas giren.',
  'Una toalla en el manubrio salva tu bici del sudor.',
];

const MAX_TIP = 120;

/** El consejo de Piñón según el estado del atleta (PINON.md §6). Puro. */
export function pinonTip(ctx: PinonTipContext): PinonTip {
  if (ctx.todayWorkout) {
    const { minutes, zone } = ctx.todayWorkout;
    const line = zone ? ZONE_LINE[zone] : 'A rodar con calma.';
    let name = ctx.todayWorkout.name.trim();
    const build = (n: string, withLine: boolean) => `Hoy toca ${n}, ${minutes} min.${withLine ? ` ${line}` : ''}`;
    let text = build(name, true);
    if (text.length > MAX_TIP) text = build(name, false);
    if (text.length > MAX_TIP) {
      name = `${name.slice(0, Math.max(8, name.length - (text.length - MAX_TIP) - 1)).trimEnd()}…`;
      text = build(name, false);
    }
    return { text, action: { label: 'Empezar a rodar', href: '#/prepare', kind: 'ride' } };
  }
  if (ctx.weekPlanned > 0 && ctx.weekPlanned - ctx.weekDone === 1) {
    return {
      text: `Llevas ${ctx.weekDone} de ${ctx.weekPlanned}. Una más y cierras la semana.`,
      action: { label: 'Ver mi plan', href: '#/plan', kind: 'plan' },
    };
  }
  if (typeof ctx.tsb === 'number' && ctx.tsb < -20) {
    // Con coach humano no se toca el plan: solo se cuida al atleta.
    return {
      text: ctx.humanCoach
        ? 'Vienes cargado. Duerme bien y come rico, que el cuerpo también entrena cuando para.'
        : 'Vienes cargado. Hoy suave o descanso, que el cuerpo también entrena cuando para.',
    };
  }
  if (ctx.isRestDay) return { text: 'Hoy descansas. Mañana rodamos con piernas frescas.' };
  if (!ctx.hasPlan && !ctx.humanCoach) {
    return {
      text: '¿Armamos tu plan? Te pregunto cuatro cosas y listo.',
      action: { label: 'Crear plan', href: '#/plan', kind: 'create' },
    };
  }
  const i = Math.abs(Math.floor(ctx.seed ?? 0)) % GENERIC_TIPS.length;
  return { text: GENERIC_TIPS[i] };
}

// ── Figura y parpadeo ───────────────────────────────────────────────────────

/** <span class="pinon pinon--{pose}"><img></span>. Decorativo (alt=""): el
 * texto del mensaje ya está al lado. `size` = altura en px; el ancho sale solo. */
export function pinonFigureHtml(pose: PinonPose, size: number): string {
  const blink = pose === 'base' ? ' data-blink' : '';
  const lazy = pose === 'base' ? '' : ' loading="lazy"';
  return `<span class="pinon pinon--${pose}"${blink} aria-hidden="true" style="--pinon-h:${size}px"><img src="${SRC[pose]}" alt="" height="${size}"${lazy} decoding="async"></span>`;
}

/** Cambia la pose de una figura ya pintada. */
export function setPinonPose(fig: Element, pose: PinonPose): void {
  const img = fig.querySelector('img');
  if (!img) return;
  fig.classList.remove('pinon--base', 'pinon--habla', 'pinon--motiva');
  fig.classList.add(`pinon--${pose}`);
  if (pose === 'base') fig.setAttribute('data-blink', '');
  else fig.removeAttribute('data-blink');
  img.src = SRC[pose];
}

/** Piñón «habla» ~1.5 s y vuelve a quieto (burbuja del coach recién llegada). */
export function pinonSpeak(fig: Element | null, ms = 1500): void {
  if (!fig) return;
  if (reducedMotion()) return;
  setPinonPose(fig, 'habla');
  window.setTimeout(() => setPinonPose(fig, 'base'), ms);
}

let blinkStarted = false;

/** Un solo temporizador para todos: cada 3–5 s las figuras quietas visibles
 * cierran los ojos 140 ms. Idempotente. */
export function startPinonBlink(): void {
  if (blinkStarted || typeof window === 'undefined') return;
  blinkStarted = true;
  const pre = new Image();
  pre.src = SRC.parpadeo; // precarga: que el primer parpadeo no parpadee de verdad
  if (reducedMotion()) return;
  const loop = () => {
    window.setTimeout(() => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('.pinon[data-blink] img')].filter((img) => img.getClientRects().length > 0);
      imgs.forEach((img) => (img.src = SRC.parpadeo));
      window.setTimeout(() => {
        imgs.forEach((img) => {
          if (img.closest('.pinon[data-blink]')) img.src = SRC.base;
        });
        loop();
      }, 140);
    }, 3000 + Math.random() * 2000);
  };
  loop();
}

// ── Burbuja ─────────────────────────────────────────────────────────────────

let closeCurrentBubble: (() => void) | null = null;

export function closePinonBubble(): void {
  closeCurrentBubble?.();
}

/** Burbuja flotante con Piñón. Una sola a la vez; cierra con Esc, «Luego» o
 * clic fuera, y regresa el foco a donde estaba. */
export function openPinonBubble(opts: {
  pose: PinonPose;
  title: string;
  text: string;
  action?: PinonAction;
  dismissLabel?: string;
  /** A dónde regresar el foco si lo que lo tenía ya no existe. */
  returnFocus?: HTMLElement | null;
}): void {
  closePinonBubble();
  const still = reducedMotion();
  const prevFocus = document.activeElement as HTMLElement | null;

  const layer = document.createElement('div');
  layer.className = 'pinon-bubble-layer';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-label', 'Piñón te dice');
  layer.innerHTML = `
    <div class="pinon-bubble">
      <span class="pinon-bubble-title">${escapeHtml(opts.title)}</span>
      <p class="pinon-bubble-text" aria-hidden="true"></p>
      <span class="pinon-sr" aria-live="polite"></span>
      <div class="pinon-bubble-actions">
        ${opts.action ? `<a class="pinon-btn-primary" href="${escapeHtml(opts.action.href)}">${escapeHtml(opts.action.label)}</a>` : ''}
        <button type="button" class="pinon-btn-later">${escapeHtml(opts.dismissLabel ?? 'Luego')}</button>
      </div>
    </div>
    <div class="pinon-bubble-fig${still ? '' : ' pinon-float'}">${pinonFigureHtml(opts.pose === 'base' ? 'habla' : opts.pose, 150)}</div>`;
  document.body.appendChild(layer);

  const typedEl = layer.querySelector<HTMLElement>('.pinon-bubble-text')!;
  const srEl = layer.querySelector<HTMLElement>('.pinon-sr')!;
  const fig = layer.querySelector<HTMLElement>('.pinon')!;
  if (opts.pose === 'motiva' && !still) fig.classList.add('pinon-hop');
  let typer: number | undefined;

  const finishTyping = () => {
    window.clearInterval(typer);
    typedEl.textContent = opts.text;
    if (opts.pose !== 'motiva') setPinonPose(fig, 'base');
  };
  // Copia completa para lectores de pantalla; la que se va escribiendo, oculta.
  window.setTimeout(() => (srEl.textContent = opts.text), 50);
  if (still) finishTyping();
  else {
    let n = 0;
    typer = window.setInterval(() => {
      n += 2;
      typedEl.textContent = opts.text.slice(0, n);
      if (n >= opts.text.length) finishTyping();
    }, 30);
  }

  const close = () => {
    window.clearInterval(typer);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    layer.remove();
    if (closeCurrentBubble === close) closeCurrentBubble = null;
    const target = prevFocus && prevFocus.isConnected && prevFocus !== document.body ? prevFocus : opts.returnFocus;
    target?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const onOutside = (e: PointerEvent) => {
    if (!layer.contains(e.target as Node)) close();
  };
  document.addEventListener('keydown', onKey, true);
  // El clic que la abrió no debe cerrarla: se escucha desde el siguiente.
  window.setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  layer.querySelector('.pinon-btn-later')!.addEventListener('click', close);
  const primary = layer.querySelector<HTMLAnchorElement>('.pinon-btn-primary');
  primary?.addEventListener('click', () => {
    opts.action?.onSelect?.();
    close();
  });
  closeCurrentBubble = close;
  (primary ?? layer.querySelector<HTMLElement>('.pinon-btn-later'))!.focus();
}

/** Semana cerrada en Inicio: celebra una sola vez por semana. */
export function maybeCelebrateWeek(done: number, planned: number, weekKey: string): void {
  const key = motivaKey(weekKey);
  if (!shouldCelebrateWeek(done, planned, lsGet(key) === '1')) return;
  if (document.querySelector('.modal-backdrop, .ob-modal, .pinon-bubble-layer')) return;
  lsSet(key, '1');
  openPinonBubble({
    pose: 'motiva',
    title: '¡SEMANA CERRADA!',
    text: `${planned} de ${planned}. Así se construye la Forma.`,
    action: { label: 'Ver mi semana', href: '#/plan' },
    dismissLabel: 'Gracias',
  });
}

// ── Se asoma ────────────────────────────────────────────────────────────────

export function isPeekEnabled(): boolean {
  return lsGet(PEEK_SETTING_KEY) !== 'off';
}
export function setPeekEnabled(on: boolean): void {
  lsSet(PEEK_SETTING_KEY, on ? 'on' : 'off');
}
function peeksToday(): number {
  return Number(lsGet(peeksKey(localDateKey()))) || 0;
}

const BOX_W = 120;
const BOX_H = 66;
const CORNER = 28;

/** Llamar después de renderizar cada pantalla; devuelve el cleanup (el router
 * lo corre al cambiar de pantalla). */
export function schedulePinonPeek(screen: Screen, root: HTMLElement): () => void {
  if (!shouldPeek(screen, peeksToday(), isPeekEnabled(), Math.random())) return () => {};
  let hidePeek: (() => void) | null = null;
  const showTimer = window.setTimeout(() => {
    hidePeek = showPeek(root);
  }, 6000 + Math.random() * 9000);
  return () => {
    window.clearTimeout(showTimer);
    hidePeek?.();
  };
}

function pickPerch(root: HTMLElement): DOMRect | null {
  const perches = [...root.querySelectorAll<HTMLElement>('[data-pinon-perch]')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width >= 220 && r.top >= 80 && r.top <= window.innerHeight - 60 && r.width > 2 * CORNER + BOX_W);
  return perches.length ? perches[Math.floor(Math.random() * perches.length)] : null;
}

function showPeek(root: HTMLElement): (() => void) | null {
  if (!root.isConnected || document.querySelector('.modal-backdrop, .ob-modal, .pinon-bubble-layer')) return null;
  const rect = pickPerch(root);
  if (!rect) return null;
  lsSet(peeksKey(localDateKey()), String(peeksToday() + 1));

  const still = reducedMotion();
  const box = document.createElement('div');
  box.className = 'pinon-peek';
  const x = rect.left + CORNER + Math.random() * (rect.width - 2 * CORNER - BOX_W);
  box.style.left = `${Math.round(x)}px`;
  box.style.top = `${Math.round(rect.top - BOX_H)}px`;
  box.innerHTML = `<button type="button" class="pinon-peek-btn" tabindex="-1" aria-hidden="true" aria-label="Piñón se asoma. Abrir consejo"><img src="${SRC.asoma}" alt="" decoding="async"></button>`;
  document.body.appendChild(box);
  const btn = box.querySelector<HTMLButtonElement>('button')!;

  let gone = false;
  let hideTimer: number | undefined;
  let last: { x: number; y: number; t: number } | null = null;
  const center = () => {
    const r = box.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const hide = (immediate = false) => {
    if (gone) return;
    gone = true;
    window.clearTimeout(hideTimer);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    btn.classList.remove('on');
    btn.tabIndex = -1;
    btn.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => box.remove(), immediate || still ? 0 : 300);
  };
  const scheduleHide = (ms: number) => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => hide(), ms);
  };
  const onMove = (e: PointerEvent) => {
    const { cx, cy } = center();
    btn.classList.toggle('right', e.clientX > cx); // mira hacia el puntero
    const now = performance.now();
    const speed = last && now > last.t ? Math.hypot(e.clientX - last.x, e.clientY - last.y) / (now - last.t) : 0;
    last = { x: e.clientX, y: e.clientY, t: now };
    const d = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (d < 150 && speed > 1.3) {
      hide(); // tímido: si llegas rápido, se esconde
      return;
    }
    if (d < 220) scheduleHide(3200); // si te acercas despacio, se queda
  };
  const onScroll = () => hide();

  btn.addEventListener('click', () => {
    const returnTo = root.querySelector<HTMLElement>('[data-pinon-perch] a[href], [data-pinon-perch] button');
    hide(true);
    void import('./pinon-context').then(({ openPinonTip }) => openPinonTip(returnTo));
  });

  window.addEventListener('pointermove', onMove);
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onScroll);
  const appear = () => {
    btn.classList.add('on');
    btn.tabIndex = 0;
    btn.setAttribute('aria-hidden', 'false');
  };
  if (still) appear();
  else requestAnimationFrame(() => requestAnimationFrame(appear));
  scheduleHide(noHover() ? 6000 : 5000);
  return () => hide(true);
}
