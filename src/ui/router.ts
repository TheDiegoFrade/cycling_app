export type Screen = 'home' | 'connect' | 'train' | 'summary' | 'history' | 'limits' | 'login';

const SCREENS: readonly Screen[] = ['home', 'connect', 'train', 'summary', 'history', 'limits', 'login'];

type RenderFn = (container: HTMLElement) => (() => void) | void;

const routes = new Map<Screen, RenderFn>();
let container: HTMLElement | null = null;
let currentCleanup: (() => void) | void;

export function registerScreen(name: Screen, render: RenderFn): void {
  routes.set(name, render);
}

export function navigate(screen: Screen): void {
  location.hash = `#/${screen}`;
}

function screenFromHash(): Screen {
  const candidate = location.hash.replace(/^#\/?/, '') as Screen;
  return SCREENS.includes(candidate) ? candidate : 'home';
}

function renderCurrent(): void {
  if (!container) return;
  if (currentCleanup) currentCleanup();
  container.innerHTML = '';
  const screen = screenFromHash();
  currentCleanup = routes.get(screen)?.(container);
}

export function startRouter(root: HTMLElement): void {
  container = root;
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}

/** Vuelve a renderizar la pantalla actual sin cambiar el hash — para cuando
 * algo fuera de la navegación normal cambia lo que debería verse (p. ej. el
 * estado de login, ver main.ts). */
export function refresh(): void {
  renderCurrent();
}
