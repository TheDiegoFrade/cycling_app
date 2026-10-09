import './ui/styles.css';
import type { Screen } from './ui/router';
import { refresh, registerScreen, startRouter } from './ui/router';
import { withSidebar } from './ui/sidebar';
import { renderCalendar } from './ui/screens/calendar';
import { renderConnect } from './ui/screens/connect';
import { renderForma } from './ui/screens/history';
import { renderHome } from './ui/screens/home';
import { renderLibrary } from './ui/screens/library';
import { renderLimits } from './ui/screens/limits';
import { renderLogin } from './ui/screens/login';
import { renderLogSession } from './ui/screens/log-session';
import { renderAcceptInvite } from './ui/screens/accept-invite';
import { renderCoachInvite } from './ui/screens/coach-invite';
import { renderCoachAthletes } from './ui/screens/coach-athletes';
import { renderCoachAthlete } from './ui/screens/coach-athlete';
import { renderCoachWeek } from './ui/screens/coach-week';
import { renderCoachLibrary } from './ui/screens/coach-library';
import { renderCoachWeeks } from './ui/screens/coach-weeks';
import { renderCoachReview } from './ui/screens/coach-review';
import { renderReview } from './ui/screens/review';
import { renderCoachSession } from './ui/screens/coach-session';
import { renderPerfil } from './ui/screens/perfil';
import { renderSummary } from './ui/screens/summary';
import { renderTrain } from './ui/screens/train';
import { appState } from './ui/state';
import { stopAmbientTrack } from './ui/ambient-audio';
import { handleStravaRedirect } from './sync/strava';
import { installDomTips } from './ui/chart-hover';
import { maybeShowPasswordReset } from './ui/password-reset';

type RenderFn = (container: HTMLElement) => (() => void) | void;

/** Si hay Supabase configurado y nadie inició sesión, cualquier pantalla
 * (menos "Cuenta") se reemplaza por el login — la app es privada, no un
 * sitio público que cualquiera puede usar sin cuenta. */
function guarded(render: RenderFn): RenderFn {
  return (container) => (appState.cloudEnabled && !appState.user ? renderLogin(container) : render(container));
}

// Home, Plan, Historial, Forma y Perfil viven detrás de la barra lateral fija
// (ver TORQ_DESIGN.md, "Navegación"); Prepare/Sesión en vivo/Login no la usan.
const SCREENS_TO_GUARD: [Screen, RenderFn][] = [
  ['home', withSidebar('home', renderHome)],
  ['plan', withSidebar('plan', renderCalendar)],
  ['library', withSidebar('library', renderLibrary)],
  ['prepare', renderConnect],
  ['train', renderTrain],
  ['session', withSidebar(null, renderSummary)],
  ['form', withSidebar('form', renderForma)],
  ['profile', withSidebar('profile', renderPerfil)],
  ['limits', renderLimits],
  // Registrar fuerza/movilidad (#/log, #/log/:id) — se llega desde Plan.
  ['log', withSidebar('plan', renderLogSession)],
  // Vista del coach: el atleta abre #/invite/:token; el coach invita desde
  // #/coach-invite (solo cuentas con profiles.is_coach).
  ['invite', withSidebar(null, renderAcceptInvite)],
  ['coach-invite', withSidebar('coach-invite', renderCoachInvite)],
  ['coach-athletes', withSidebar('coach-athletes', renderCoachAthletes)],
  ['coach-athlete', withSidebar('coach-athletes', renderCoachAthlete)],
  ['coach-week', withSidebar('coach-athletes', renderCoachWeek)],
  ['coach-library', withSidebar('coach-library', renderCoachLibrary)],
  ['coach-weeks', withSidebar('coach-weeks', renderCoachWeeks)],
  // Revisión mensual: el coach en #/coach-review/:atleta/:mes; el atleta ve
  // las publicadas en #/review (se llega desde Perfil).
  ['coach-review', withSidebar('coach-athletes', renderCoachReview)],
  ['review', withSidebar('profile', renderReview)],
  // Detalle de una sesión de un atleta, con descarga del .fit.
  ['coach-session', withSidebar('coach-athletes', renderCoachSession)],
];

SCREENS_TO_GUARD.forEach(([screen, render]) => registerScreen(screen, guarded(render)));
registerScreen('login', renderLogin); // nunca bloqueada: si no, nadie podría iniciar sesión

installDomTips();
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<div class="screen"><p class="hint">Cargando…</p></div>';

appState.boot().then(async () => {
  startRouter(app);
  // recalcula qué pantalla mostrar en cuanto cambia el login (entrar, salir,
  // sesión restaurada) — sin esto, tras iniciar sesión seguiríamos viendo el
  // formulario de login hasta el siguiente cambio de hash.
  appState.onAuthChange(() => {
    if (appState.user) stopAmbientTrack(); // la música es solo del login, no de la app
    refresh();
  });

  // si venimos de que Strava nos mandó de vuelta con ?code=..., ya hay
  // sesión de Supabase (boot() terminó) para poder llamar a la Edge
  // Function que hace el intercambio de tokens.
  await handleStravaRedirect();
  refresh();
  // Volvimos del link de "olvidé mi contraseña": pide la nueva.
  maybeShowPasswordReset();
});
