import './ui/styles.css';
import type { Screen } from './ui/router';
import { refresh, registerScreen, startRouter } from './ui/router';
import { renderConnect } from './ui/screens/connect';
import { renderHistory } from './ui/screens/history';
import { renderHome } from './ui/screens/home';
import { renderLimits } from './ui/screens/limits';
import { renderLogin } from './ui/screens/login';
import { renderSummary } from './ui/screens/summary';
import { renderTrain } from './ui/screens/train';
import { appState } from './ui/state';
import { handleStravaRedirect } from './sync/strava';

type RenderFn = (container: HTMLElement) => (() => void) | void;

/** Si hay Supabase configurado y nadie inició sesión, cualquier pantalla
 * (menos "Cuenta") se reemplaza por el login — la app es privada, no un
 * sitio público que cualquiera puede usar sin cuenta. */
function guarded(render: RenderFn): RenderFn {
  return (container) => (appState.cloudEnabled && !appState.user ? renderLogin(container) : render(container));
}

const SCREENS_TO_GUARD: [Screen, RenderFn][] = [
  ['home', renderHome],
  ['connect', renderConnect],
  ['train', renderTrain],
  ['summary', renderSummary],
  ['history', renderHistory],
  ['limits', renderLimits],
];

SCREENS_TO_GUARD.forEach(([screen, render]) => registerScreen(screen, guarded(render)));
registerScreen('login', renderLogin); // nunca bloqueada: si no, nadie podría iniciar sesión

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<div class="screen"><p class="hint">Cargando…</p></div>';

appState.boot().then(async () => {
  startRouter(app);
  // recalcula qué pantalla mostrar en cuanto cambia el login (entrar, salir,
  // sesión restaurada) — sin esto, tras iniciar sesión seguiríamos viendo el
  // formulario de login hasta el siguiente cambio de hash.
  appState.onAuthChange(() => refresh());

  // si venimos de que Strava nos mandó de vuelta con ?code=..., ya hay
  // sesión de Supabase (boot() terminó) para poder llamar a la Edge
  // Function que hace el intercambio de tokens.
  await handleStravaRedirect();
  refresh();
});
