// Botón fijo de Piñón (abajo a la derecha) en Inicio, Plan, Forma e
// Historial. El panel del chat se carga al tocarlo (import dinámico). El
// panel sobrevive a repintar la pantalla y a pasar entre esas pantallas
// (p. ej. «Ver mi plan» desde el chat); en cualquier otra se cierra.
import type { Screen } from './router';
import { pinonFigureHtml } from './pinon';

export const CHAT_SCREENS: readonly Screen[] = ['home', 'plan', 'form', 'library'];

let chatModule: typeof import('./pinon-chat') | null = null;
let routeWatch = false;

const launcher = () => document.querySelector<HTMLButtonElement>('.pinon-chat-launcher');

function screenOfHash(): string {
  return location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
}

async function openChat(): Promise<void> {
  chatModule ??= await import('./pinon-chat');
  const btn = launcher();
  if (btn) btn.hidden = true;
  chatModule.openPinonChat({
    onClose: () => {
      const b = launcher();
      if (b) b.hidden = false;
    },
  });
}

/** Llamar al pintar cada pantalla; devuelve el cleanup del router. */
export function mountPinonChat(screen: Screen): () => void {
  if (!routeWatch) {
    routeWatch = true;
    window.addEventListener('hashchange', () => {
      if (!(CHAT_SCREENS as readonly string[]).includes(screenOfHash())) chatModule?.closePinonChat(false);
    });
  }
  if (!CHAT_SCREENS.includes(screen)) return () => {};
  launcher()?.remove();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pinon-chat-launcher';
  btn.setAttribute('aria-label', 'Platica con Piñón');
  btn.title = 'Platica con Piñón';
  btn.innerHTML = pinonFigureHtml('base', 64);
  btn.hidden = chatModule?.isPinonChatOpen() ?? false;
  btn.addEventListener('click', () => void openChat());
  document.body.appendChild(btn);
  return () => btn.remove();
}
