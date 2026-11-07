// Recorrido de Piñón la primera vez: señala cada sección de la app y explica
// cómo se entrena y qué se puede hacer con el celular. Sale solo en la
// bienvenida de Inicio (cuenta nueva), una sola vez; se salta en cualquier
// momento y se repite desde Perfil. Los pasos (texto y a qué apuntan) son
// lógica pura y se prueban en pinon-tour.test.ts; abajo, el DOM.
import { byGender } from '../core/gender';
import type { Gender } from '../core/gender';
import { areGuidesOff, markGuidesSeen, pinonFigureHtml } from './pinon';
import { escapeHtml } from './workout-cover';

export interface TourStep {
  id: string;
  title: string;
  text: string;
  /** Selectores de lo que se resalta, en orden: el primero visible gana
   * (barra lateral en computadora, barra de abajo en celular). Vacío: al centro. */
  targets: string[];
  /** Ícono grande en la tarjeta cuando no hay nada que señalar. */
  icon?: string;
}

export interface TourContext {
  name?: string | null;
  gender?: Gender;
  /** Con coach humano el plan lo arma su coach, no el de IA. */
  humanCoach?: boolean;
}

const nav = (route: string) => [`.sidebar-link[href="#/${route}"]`, `.tabbar-item[href="#/${route}"]`];

/** Los pasos del recorrido, en el tono de la persona. */
export function tourSteps(ctx: TourContext = {}): TourStep[] {
  const fresh = byGender(ctx.gender, 'llegas fresco', 'llegas fresca', 'llegas con piernas frescas');
  const hello = ctx.name?.trim() ? `¡Hola, ${ctx.name.trim()}!` : '¡Hola!';
  return [
    {
      id: 'intro',
      title: hello,
      text: 'Soy Piñón. Te enseño Torq en un minuto: dónde está cada cosa, cómo se entrena y qué puedes hacer con tu celular. Puedes saltarlo cuando quieras.',
      targets: [],
      icon: '👋',
    },
    {
      id: 'home',
      title: 'Inicio',
      text: 'Tu punto de partida: lo que toca hoy, cómo va tu semana y el botón para empezar a rodar.',
      targets: nav('home'),
    },
    {
      id: 'plan',
      title: 'Plan',
      text: ctx.humanCoach
        ? 'La semana que te arma tu coach. ¿Ese día no puedes? Arrastra el entreno a otro. ¿Sin ganas? Quítalo y dile por qué.'
        : 'Tu calendario. ¿Ese día no puedes? Arrastra el entreno a otro. ¿Sin ganas? Quítalo y dime por qué. Cada domingo evalúas tu semana y armo la siguiente.',
      targets: nav('plan'),
    },
    {
      id: 'library',
      title: 'Historial',
      text: 'Todo lo que ruedas queda aquí. Toca una sesión para ver tu potencia y tu pulso, y ponerle qué tan duro se sintió.',
      targets: nav('library'),
    },
    {
      id: 'form',
      title: 'Forma',
      text: `Cómo vienes: Fitness es tu base y Fatiga el cansancio que traes. Si la Forma es positiva, ${fresh}.`,
      targets: nav('form'),
    },
    {
      id: 'ride',
      title: 'Cómo se entrena',
      text: 'Abre Torq en Google Chrome en tu compu y enciende tu rodillo: se conecta por Bluetooth en un paso, igual que tu banda de pulso si tienes. Luego eliges tu entreno y a rodar.',
      // computadora: el bloque de Sensores; en celular no hay, va al centro
      targets: ['.sidebar-sensors'],
      icon: '🚴',
    },
    {
      id: 'erg',
      title: 'Tú solo pedaleas',
      text: 'Durante la sesión el rodillo pone la resistencia solo (modo ERG). ¿Se siente muy duro o muy fácil? Súbele o bájale con + y −.',
      targets: [],
      icon: '＋ −',
    },
    {
      id: 'phone',
      title: 'Tu celular, control remoto',
      text: 'Al rodar, toca 📱 y escanea el código con tu celular. Desde la bici subes o bajas la intensidad, pausas y ves tu tiempo, sin tocar la compu.',
      targets: [],
      icon: '📱',
    },
    {
      id: 'pinon',
      title: 'Aquí estoy',
      text: 'Tócame cuando quieras y pregúntame lo que sea: qué toca hoy, qué es el FTP o cómo te fue.',
      targets: ['.pinon-chat-launcher'],
    },
    {
      id: 'profile',
      title: 'Perfil',
      text: 'Tu FTP, tu pulso, los sonidos y mis guías. Desde ahí puedes repetir este recorrido cuando quieras.',
      targets: ['.sidebar-profile', '#tabbar-more'],
    },
  ];
}

export const TOUR_DONE_KEY = 'torq.pinon.tour';

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
    /* sin storage: sale una vez por visita */
  }
}

export function tourSeen(): boolean {
  return lsGet(TOUR_DONE_KEY) === '1';
}

/** Perfil pidió repetirlo: sale la próxima vez que se pinte Inicio. */
let replayRequested = false;
export function requestPinonTour(): void {
  replayRequested = true;
}
export function takeTourReplay(): boolean {
  const r = replayRequested;
  replayRequested = false;
  return r;
}

function visibleTarget(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden') return el;
    }
  }
  return null;
}

/** En Inicio: la primera vez (bienvenida de cuenta nueva) o si Perfil pidió
 * repetirlo, abre el recorrido. Devuelve cleanup. */
export function schedulePinonTour(root: HTMLElement, ctx: TourContext): () => void {
  const replay = takeTourReplay();
  if (!replay && (tourSeen() || areGuidesOff())) return () => {};
  const t = window.setTimeout(() => {
    if (!root.isConnected || document.querySelector('.modal-backdrop, .ob-modal, .pinon-tour, .pinon-chat')) return;
    if (!replay && !root.querySelector('.home-welcome')) return; // solo cuentas nuevas
    startPinonTour(ctx);
  }, 700);
  return () => window.clearTimeout(t);
}

/** Abre el recorrido. `onEnd` corre al terminar o saltarlo. */
export function startPinonTour(ctx: TourContext, onEnd?: () => void): void {
  document.querySelector('.pinon-tour')?.remove();
  document.querySelector('.pinon-bubble-layer')?.remove();
  lsSet(TOUR_DONE_KEY, '1');
  // ya explicó cada pantalla: sus guías de una frase no se repiten
  markGuidesSeen();
  const steps = tourSteps(ctx);
  let i = 0;
  const prevFocus = document.activeElement as HTMLElement | null;

  const layer = document.createElement('div');
  layer.className = 'pinon-tour';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', 'Recorrido de Piñón');
  layer.innerHTML = `
    <div class="pinon-tour-spot" aria-hidden="true"></div>
    <div class="pinon-tour-card">
      <div class="pinon-tour-head">
        ${pinonFigureHtml('habla', 64)}
        <div>
          <span class="pinon-tour-count" id="pinon-tour-count"></span>
          <h2 class="pinon-tour-title" id="pinon-tour-title"></h2>
        </div>
      </div>
      <div class="pinon-tour-icon" id="pinon-tour-icon" aria-hidden="true"></div>
      <p class="pinon-tour-text" id="pinon-tour-text" aria-live="polite"></p>
      <div class="pinon-tour-actions">
        <button type="button" class="pinon-tour-skip" id="pinon-tour-skip">Saltar</button>
        <span class="pinon-tour-spacer"></span>
        <button type="button" class="pinon-tour-back" id="pinon-tour-back">Atrás</button>
        <button type="button" class="pinon-tour-next" id="pinon-tour-next">Siguiente</button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  const spot = layer.querySelector<HTMLElement>('.pinon-tour-spot')!;
  const card = layer.querySelector<HTMLElement>('.pinon-tour-card')!;
  const nextBtn = layer.querySelector<HTMLButtonElement>('#pinon-tour-next')!;
  const backBtn = layer.querySelector<HTMLButtonElement>('#pinon-tour-back')!;

  const place = () => {
    const step = steps[i];
    const target = visibleTarget(step.targets);
    layer.dataset.step = step.id;
    layer.classList.toggle('no-target', !target);
    card.style.left = card.style.top = card.style.right = card.style.bottom = '';
    card.classList.remove('at-top', 'at-bottom');
    if (!target) {
      spot.hidden = true;
      return;
    }
    target.scrollIntoView({ block: 'nearest' });
    const r = target.getBoundingClientRect();
    const pad = 6;
    spot.hidden = false;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const narrow = innerWidth < 640;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    if (!narrow && r.right + 24 + cw < innerWidth) {
      // a la derecha de lo señalado (barra lateral)
      card.style.left = `${r.right + 24}px`;
      card.style.top = `${Math.max(16, Math.min(innerHeight - ch - 16, r.top + r.height / 2 - ch / 2))}px`;
    } else if (r.top + r.height / 2 > innerHeight / 2) {
      card.classList.add('at-bottom');
      card.style.bottom = `${Math.max(16, innerHeight - r.top + 14)}px`;
    } else {
      card.classList.add('at-top');
      card.style.top = `${Math.min(innerHeight - ch - 16, r.bottom + 14)}px`;
    }
  };

  const paint = () => {
    const step = steps[i];
    layer.querySelector('#pinon-tour-count')!.textContent = `${i + 1} de ${steps.length}`;
    layer.querySelector('#pinon-tour-title')!.textContent = step.title;
    layer.querySelector('#pinon-tour-text')!.textContent = step.text;
    const icon = layer.querySelector<HTMLElement>('#pinon-tour-icon')!;
    icon.hidden = !step.icon || !!visibleTarget(step.targets);
    icon.innerHTML = step.icon ? escapeHtml(step.icon) : '';
    backBtn.hidden = i === 0;
    nextBtn.textContent = i === steps.length - 1 ? '¡Listo!' : i === 0 ? 'Empezar' : 'Siguiente';
    place();
    nextBtn.focus();
  };

  const end = () => {
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('hashchange', end);
    layer.remove();
    if (prevFocus?.isConnected) prevFocus.focus();
    onEnd?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      end();
    } else if (e.key === 'ArrowRight') nextBtn.click();
    else if (e.key === 'ArrowLeft' && i > 0) backBtn.click();
  };
  nextBtn.addEventListener('click', () => {
    if (i === steps.length - 1) return end();
    i++;
    paint();
  });
  backBtn.addEventListener('click', () => {
    if (i === 0) return;
    i--;
    paint();
  });
  layer.querySelector('#pinon-tour-skip')!.addEventListener('click', end);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  window.addEventListener('hashchange', end);
  paint();
}
