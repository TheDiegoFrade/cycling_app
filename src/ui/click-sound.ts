// Click vintage al tocar cualquier botón, link o chip de la app. Un solo
// listener en el documento: no hay que tocar cada pantalla. Respeta el
// volumen y el interruptor de Perfil › Sonidos.
import { beeper } from './audio';
import { appState } from './state';

const CLICKABLE = 'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="tab"], input[type="checkbox"], input[type="radio"], select, label.home-generate-radio';

export function installClickSound(): void {
  document.addEventListener(
    'click',
    (e) => {
      if (!appState.settings.clickSound || appState.settings.soundVolume <= 0) return;
      const target = (e.target as Element | null)?.closest(CLICKABLE);
      if (!target || (target as HTMLButtonElement).disabled || target.getAttribute('aria-disabled') === 'true') return;
      // El clic es un gesto del usuario: aquí el navegador sí deja crear el audio.
      beeper.setVolume(appState.settings.soundVolume);
      beeper.unlock();
      beeper.click();
    },
    true,
  );
}
