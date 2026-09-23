export type Screen = 'home' | 'connect' | 'train' | 'summary' | 'history' | 'limits';

const SCREENS: readonly Screen[] = ['home', 'connect', 'train', 'summary', 'history', 'limits'];

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
