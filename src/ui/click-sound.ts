// Sonidos de bici al tocar la app: rueda libre en los botones, cambio de
// velocidad al navegar y timbre al empezar a rodar. Un solo listener en el
// documento: no hay que tocar cada pantalla. Respeta el volumen y el
// interruptor de Perfil › Sonidos.
import { beeper } from './audio';
import { appState } from './state';

const CLICKABLE = 'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="tab"], input[type="checkbox"], input[type="radio"], select, label.home-generate-radio';

/** Empezar a rodar o entrenar: timbre. */
const RIDE = 'button.home-ride-btn, .prepare-start, button[data-train-id], #demo-link';
/** Cambiar de pantalla: el clac del cambio de velocidad. */
const NAVIGATE = 'a[href^="#/"], .sidebar-link, .tabbar-item, [role="tab"]';

export function soundFor(target: Element): 'ratchet' | 'shift' | 'bell' {
  if (target.matches(RIDE)) return 'bell';
  if (target.matches(NAVIGATE)) return 'shift';
  return 'ratchet';
}

export function installClickSound(): void {
  document.addEventListener(
    'click',
    (e) => {
      if (!appState.settings.clickSound || appState.settings.soundVolume <= 0) return;
      const target = (e.target as Element | null)?.closest(CLICKABLE);
      if (!target || (target as HTMLButtonElement).disabled || target.getAttribute('aria-disabled') === 'true') return;
      // Los botones de Perfil › Sonidos ya suenan solos: no encimar.
      if (target.matches('[data-sound], [data-bike-sound]')) return;
      // El clic es un gesto del usuario: aquí el navegador sí deja crear el audio.
      beeper.setVolume(appState.settings.soundVolume);
      beeper.unlock();
      beeper.bike(soundFor(target));
    },
    true,
  );
}
