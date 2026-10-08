import { BleHrAdapter } from '../devices/heart-rate';
import { BleTrainerAdapter } from '../devices/ftms';
import { hasWebBluetooth, noBluetoothMessage } from '../devices/ble-support';
import type { ConnectionState, HrAdapter, TrainerAdapter } from '../devices/types';
import type { Screen } from './router';
import { appState } from './state';
import { escapeHtml } from './workout-cover';

/** Las secciones que viven en la barra lateral (ver TORQ_DESIGN.md,
 * "Navegación"). Sesión en vivo y Antes de empezar no la usan. */
export type SidebarScreen = 'home' | 'plan' | 'library' | 'form' | 'profile' | 'coach-invite' | 'coach-athletes' | 'coach-library' | 'coach-weeks';

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
 * AGREGAN a las del atleta: el coach también entrena con la app. */
const COACH_ITEMS: typeof ITEMS = [
  {
    screen: 'coach-athletes',
    route: 'coach-athletes',
    label: 'Atletas',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.7 0 4.5 1.6 4.5 4.5"/></svg>',
  },
  {
    screen: 'coach-weeks',
    route: 'coach-weeks',
    label: 'Semanas',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M3 15h18M9 9v12M15 9v12"/></svg>',
  },
  {
    screen: 'coach-library',
    route: 'coach-library',
    label: 'Biblioteca',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6M8 11h6"/></svg>',
  },
  {
    screen: 'coach-invite',
    route: 'coach-invite',
    label: 'Invitar atleta',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M19 8v6M16 11h6"/></svg>',
  },
];

/** Misma inicial que el círculo de Inicio y Perfil (la del correo). */
function profileInitial(): string {
  return (appState.user?.email ?? '?').charAt(0).toUpperCase();
}

function profileName(): string {
  if (appState.profile.name) return appState.profile.name;
  return appState.user?.email?.split('@')[0] ?? 'Tu perfil';
}

function sidebarHtml(active: SidebarScreen | null): string {
  const linkHtml = (i: (typeof ITEMS)[number]) => `
    <a href="#/${i.route}" class="sidebar-link${i.screen === active ? ' active' : ''}">${i.icon}${i.label}</a>`;
  const links =
    ITEMS.map(linkHtml).join('') +
    (appState.coach.isCoach ? `<div class="sidebar-group-title">Coach</div>${COACH_ITEMS.map(linkHtml).join('')}` : '');
  return `
    <nav class="sidebar" id="app-sidebar">
      <div class="sidebar-brand">TORQ<button type="button" class="drawer-close" id="drawer-close" aria-label="Cerrar menú">✕</button></div>
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
      <a href="#/profile" class="sidebar-profile${active === 'profile' ? ' active' : ''}" aria-label="Ir a tu perfil">
        <span class="perfil-avatar sidebar-avatar" aria-hidden="true">${escapeHtml(profileInitial())}</span>
        <span class="sidebar-profile-text"><span class="sidebar-profile-name">${escapeHtml(profileName())}</span><span class="sidebar-sensors-title">Ver perfil</span></span>
      </a>
    </nav>
    <div class="main-content" id="main-slot"></div>
    ${tabbarHtml(active)}
    <div class="drawer-backdrop" id="drawer-backdrop"></div>
  `;
}

const MORE_ICON =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>';

/** Celular: barra de pestañas abajo con lo más usado; "Más" abre la barra
 * lateral como panel deslizable (resto de secciones, sensores y perfil). El
 * coach tiene Atletas y Semanas a un toque para ajustar planes desde el
 * celular. */
function tabbarHtml(active: SidebarScreen | null): string {
  const byScreen = (screen: SidebarScreen) => [...ITEMS, ...COACH_ITEMS].find((i) => i.screen === screen)!;
  const tabs = (appState.coach.isCoach ? (['home', 'plan', 'coach-athletes', 'coach-weeks'] as const) : (['home', 'plan', 'library', 'form'] as const)).map(byScreen);
  const inTabs = tabs.some((t) => t.screen === active);
  return `
    <nav class="tabbar" aria-label="Navegación principal">
      ${tabs
        .map((t) => `<a href="#/${t.route}" class="tabbar-item${t.screen === active ? ' active' : ''}"${t.screen === active ? ' aria-current="page"' : ''}>${t.icon}<span>${t.label}</span></a>`)
        .join('')}
      <button type="button" class="tabbar-item${!inTabs && active ? ' active' : ''}" id="tabbar-more" aria-expanded="false" aria-controls="app-sidebar">${MORE_ICON}<span>Más</span></button>
    </nav>`;
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
    if (!hasWebBluetooth()) {
      window.alert(noBluetoothMessage());
      return;
    }
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

    const moreBtn = shell.querySelector<HTMLButtonElement>('#tabbar-more');
    const setDrawer = (open: boolean) => {
      shell.classList.toggle('drawer-open', open);
      moreBtn?.setAttribute('aria-expanded', String(open));
    };
    moreBtn?.addEventListener('click', () => setDrawer(!shell.classList.contains('drawer-open')));
    shell.querySelector('#drawer-backdrop')?.addEventListener('click', () => setDrawer(false));
    shell.querySelector('#drawer-close')?.addEventListener('click', () => setDrawer(false));
    shell.querySelectorAll('.sidebar a').forEach((a) => a.addEventListener('click', () => setDrawer(false)));

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
