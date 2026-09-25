import type { Screen } from './router';
import { appState } from './state';

const ITEMS: { screen: Screen; label: string }[] = [
  { screen: 'home', label: 'Inicio' },
  { screen: 'connect', label: 'Conectar' },
  { screen: 'summary', label: 'Resumen' },
  { screen: 'history', label: 'Historial' },
];

const GEAR_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

/** Sin sesión iniciada no hay nada de nav que mostrar — la pantalla ES el
 * login (ver login.ts), sin distracciones. Con sesión, "Cuenta" deja de ser
 * una pestaña de texto y se reduce a un ícono discreto (⚙) — no es algo que
 * se visite seguido, así que no debe competir por atención con Inicio/
 * Conectar/Resumen/Historial. */
export function renderNav(active: Screen): string {
  if (appState.cloudEnabled && !appState.user) return '';
  const links = ITEMS.map((i) => `<a href="#/${i.screen}" class="${i.screen === active ? 'active' : ''}">${i.label}</a>`).join('');
  const gear = `<a href="#/login" class="nav-icon${active === 'login' ? ' active' : ''}" title="Cuenta">${GEAR_ICON}</a>`;
  return `<nav class="nav">${links}${gear}</nav>`;
}
