export type Screen = 'home' | 'plan' | 'prepare' | 'train' | 'session' | 'form' | 'profile' | 'limits' | 'login';

const SCREENS: readonly Screen[] = ['home', 'plan', 'prepare', 'train', 'session', 'form', 'profile', 'limits', 'login'];

/** Rutas viejas → nuevas, ver TORQ_DESIGN.md ("Rutas: de la app actual a la
 * nueva"). Cualquier hash viejo se reescribe al nuevo antes de resolver la
 * pantalla, así los enlaces/bookmarks existentes no se rompen. */
const LEGACY_REDIRECTS: Record<string, Screen> = {
  calendar: 'plan',
  connect: 'prepare',
  summary: 'session',
  history: 'form',
};

type RenderFn = (container: HTMLElement) => (() => void) | void;

const routes = new Map<Screen, RenderFn>();
let container: HTMLElement | null = null;
let currentCleanup: (() => void) | void;
/** Segundo segmento del hash (p. ej. el `:id` de `#/session/:id`) — todavía
 * no lo consume ninguna pantalla (eso es la Fase 9, Resumen), pero la ruta
 * ya queda lista para leerlo. */
let currentParam: string | null = null;

export function registerScreen(name: Screen, render: RenderFn): void {
  routes.set(name, render);
}

export function navigate(screen: Screen, param?: string): void {
  location.hash = param ? `#/${screen}/${param}` : `#/${screen}`;
}

export function getRouteParam(): string | null {
  return currentParam;
}

function resolveHash(): { screen: Screen; param: string | null } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [first, second] = raw.split('/');
  const legacy = LEGACY_REDIRECTS[first];
  if (legacy) return { screen: legacy, param: null };
  if ((SCREENS as readonly string[]).includes(first)) return { screen: first as Screen, param: second ?? null };
  return { screen: 'home', param: null };
}

function renderCurrent(): void {
  if (!container) return;
  if (currentCleanup) currentCleanup();
  container.innerHTML = '';
  const { screen, param } = resolveHash();
  currentParam = param;
  // si el hash venía en formato viejo (o sin param en uno nuevo con :id),
  // lo normalizamos en la barra de direcciones sin disparar otro renderizado
  // (replaceState no dispara hashchange).
  const normalized = param ? `#/${screen}/${param}` : `#/${screen}`;
  if (location.hash !== normalized) history.replaceState(null, '', normalized);
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
