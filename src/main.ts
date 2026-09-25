import './ui/styles.css';
import { registerScreen, startRouter } from './ui/router';
import { renderConnect } from './ui/screens/connect';
import { renderHistory } from './ui/screens/history';
import { renderHome } from './ui/screens/home';
import { renderLimits } from './ui/screens/limits';
import { renderLogin } from './ui/screens/login';
import { renderSummary } from './ui/screens/summary';
import { renderTrain } from './ui/screens/train';
import { appState } from './ui/state';

registerScreen('home', renderHome);
registerScreen('connect', renderConnect);
registerScreen('train', renderTrain);
registerScreen('summary', renderSummary);
registerScreen('history', renderHistory);
registerScreen('limits', renderLimits);
registerScreen('login', renderLogin);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<div class="screen"><p class="hint">Cargando…</p></div>';

appState.boot().then(() => {
  startRouter(app);
});
