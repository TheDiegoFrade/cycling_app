import type { Screen } from './router';
import { appState } from './state';

const ITEMS: { screen: Screen; label: string }[] = [
  { screen: 'home', label: 'Inicio' },
  { screen: 'plan', label: 'Plan' },
  { screen: 'form', label: 'Forma' },
];

const GEAR_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

/** Nav de respaldo para pantallas que todavía no tienen barra lateral propia
 * (hoy: Límites — ver TORQ_DESIGN.md, ese editor se integra a Plan en la
 * Fase 8). Home/Plan/Forma/Perfil ya usan la barra lateral (ver sidebar.ts)
 * y no llaman a esto. */
export function renderNav(active: Screen): string {
  if (appState.cloudEnabled && !appState.user) return '';
  const links = ITEMS.map((i) => `<a href="#/${i.screen}" class="${i.screen === active ? 'active' : ''}">${i.label}</a>`).join('');
  const gear = `<a href="#/profile" class="nav-icon${active === 'profile' ? ' active' : ''}" title="Perfil">${GEAR_ICON}</a>`;
  return `<nav class="nav">${links}${gear}</nav>`;
}
