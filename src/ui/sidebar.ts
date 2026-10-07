import { BleHrAdapter } from '../devices/heart-rate';
import { BleTrainerAdapter } from '../devices/ftms';
import type { ConnectionState, HrAdapter, TrainerAdapter } from '../devices/types';
import type { Screen } from './router';
import { appState } from './state';
import { escapeHtml } from './workout-cover';

/** Las secciones que viven en la barra lateral (ver TORQ_DESIGN.md,
 * "Navegación"). Sesión en vivo y Antes de empezar no la usan. */
export type SidebarScreen = 'home' | 'plan' | 'library' | 'form' | 'profile' | 'coach-invite' | 'coach-athletes';

const ITEMS: { screen: SidebarScreen; route: Screen; label: string; icon: string }[] = [
  {
    screen: 'home',
    route: 'home',
    label: 'Inicio',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  },
  {
    screen: 'plan',
    route: 'plan',
    label: 'Plan',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
  },
  {
    screen: 'library',
    route: 'library',
    label: 'Historial',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h12"/></svg>',
  },
  {
    screen: 'form',
    route: 'form',
    label: 'Forma',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
  },
  {
    screen: 'profile',
    route: 'profile',
    label: 'Perfil',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  },
];

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Sin conectar',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  error: 'Error',
};

/** Solo para cuentas con profiles.is_coach (ver sync/coach-link). Se
 * AGREGAN a las del atleta: el coach también entrena con la app. Semanas y
 * Biblioteca llegan en los siguientes pasos de docs/coach-view/README.md. */
const COACH_ITEMS: typeof ITEMS = [
  {
    screen: 'coach-athletes',
    route: 'coach-athletes',
    label: 'Atletas',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.7 0 4.5 1.6 4.5 4.5"/></svg>',
  },
  {
    screen: 'coach-invite',
    route: 'coach-invite',
    label: 'Invitar atleta',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M19 8v6M16 11h6"/></svg>',
  },
];

function sidebarHtml(active: SidebarScreen | null): string {
  const linkHtml = (i: (typeof ITEMS)[number]) => `
    <a href="#/${i.route}" class="sidebar-link${i.screen === active ? ' active' : ''}">${i.icon}${i.label}</a>`;
  const links =
    ITEMS.map(linkHtml).join('') +
    (appState.coach.isCoach ? `<div class="sidebar-group-title">Coach</div>${COACH_ITEMS.map(linkHtml).join('')}` : '');
  return `
    <nav class="sidebar">
      <div class="sidebar-brand">TORQ</div>
      <div class="sidebar-links">${links}</div>
      ${
        appState.coach.myCoach
          ? `<a href="#/profile" class="sidebar-coach-card"><span class="sidebar-sensors-title">Tu coach</span><span>${escapeHtml(appState.coach.myCoach.coachName ?? 'Tu coach')}</span></a>`
          : ''
      }
      <div class="sidebar-sensors">
        <div class="sidebar-sensors-title">Sensores</div>
        <button type="button" class="sidebar-sensor-row" id="sidebar-trainer-row">
          <span>Rodillo</span>
          <span class="sidebar-sensor-state"><span class="status-dot" id="sidebar-trainer-dot"></span><span id="sidebar-trainer-state">${STATE_LABEL.disconnected}</span></span>
        </button>
        <button type="button" class="sidebar-sensor-row" id="sidebar-hr-row">
          <span>Pulso</span>
          <span class="sidebar-sensor-state"><span class="status-dot" id="sidebar-hr-dot"></span><span id="sidebar-hr-state">${STATE_LABEL.disconnected}</span></span>
        </button>
      </div>
    </nav>
    <div class="main-content" id="main-slot"></div>
  `;
}

function wireSensorRow(
  kind: 'trainer' | 'hr',
  rowId: string,
  stateElId: string,
  dotId: string,
  container: HTMLElement,
): () => void {
  const row = container.querySelector<HTMLButtonElement>(`#${rowId}`)!;
  const stateEl = container.querySelector<HTMLElement>(`#${stateElId}`)!;
  const dot = container.querySelector<HTMLElement>(`#${dotId}`)!;
  let unsub: (() => void) | null = null;

  function paint(state: ConnectionState): void {
    dot.className = `status-dot ${state}`;
    stateEl.textContent = STATE_LABEL[state];
  }

  function attach(): void {
    const adapter = kind === 'trainer' ? appState.trainer : appState.hr;
    if (!adapter) return;
    paint(adapter.state);
    unsub?.();
    unsub = adapter.onStateChange(paint);
  }

  attach();

  row.addEventListener('click', () => {
    const current = kind === 'trainer' ? appState.trainer : appState.hr;
    if (current && (current.state === 'connected' || current.state === 'connecting' || current.state === 'reconnecting')) return;
    const adapter: TrainerAdapter | HrAdapter = kind === 'trainer' ? new BleTrainerAdapter() : new BleHrAdapter();
    if (kind === 'trainer') appState.trainer = adapter as TrainerAdapter;
    else appState.hr = adapter as HrAdapter;
    attach();
    adapter.connect().catch((err: unknown) => {
      paint('error');
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('User cancelled')) console.error(`[sidebar] ${kind}`, err);
    });
  });

  return () => unsub?.();
}

/** Envuelve una pantalla con la barra lateral fija (wordmark, Inicio/Plan/
 * Historial/Forma/Perfil, tarjeta de Sensores). La pantalla envuelta sigue recibiendo
 * su propio contenedor y controla su contenido exactamente igual que antes;
 * esto solo reemplaza la nav de texto que cada pantalla pintaba por su
 * cuenta. No aparece en Sesión en vivo ni en Antes de empezar. */
export function withSidebar(
  active: SidebarScreen | null,
  render: (main: HTMLElement) => (() => void) | void,
): (container: HTMLElement) => () => void {
  return (container: HTMLElement) => {
    container.innerHTML = `<div class="app-shell">${sidebarHtml(active)}</div>`;
    const shell = container.querySelector<HTMLElement>('.app-shell')!;
    const mainSlot = shell.querySelector<HTMLElement>('#main-slot')!;

    const unsubTrainer = wireSensorRow('trainer', 'sidebar-trainer-row', 'sidebar-trainer-state', 'sidebar-trainer-dot', shell);
    const unsubHr = wireSensorRow('hr', 'sidebar-hr-row', 'sidebar-hr-state', 'sidebar-hr-dot', shell);
    const innerCleanup = render(mainSlot);

    return () => {
      unsubTrainer();
      unsubHr();
      if (innerCleanup) innerCleanup();
    };
  };
}
