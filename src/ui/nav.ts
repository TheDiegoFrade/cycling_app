import type { Screen } from './router';

const ITEMS: { screen: Screen; label: string }[] = [
  { screen: 'home', label: 'Inicio' },
  { screen: 'connect', label: 'Conectar' },
  { screen: 'summary', label: 'Resumen' },
  { screen: 'history', label: 'Historial' },
];

export function renderNav(active: Screen): string {
  return `<nav class="nav">${ITEMS.map((i) => `<a href="#/${i.screen}" class="${i.screen === active ? 'active' : ''}">${i.label}</a>`).join('')}</nav>`;
}
