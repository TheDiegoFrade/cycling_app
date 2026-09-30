import { BleTrainerAdapter } from '../../devices/ftms';
import { BleHrAdapter } from '../../devices/heart-rate';
import { SimulatedHrAdapter, SimulatedTrainerAdapter } from '../../devices/simulated';
import type { ConnectionState, HrAdapter, TrainerAdapter, TrainerReading } from '../../devices/types';
import { estimateWorkout } from '../../core/workout-estimate';
import { renderWorkoutCover } from '../workout-cover';
import { navigate } from '../router';
import { appState } from '../state';

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Sin conectar',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  error: 'Error',
};

const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

function fmtMinutes(totalS: number): string {
  return `${Math.round(totalS / 60)} min`;
}

/** "Antes de empezar" — ver TORQ_DESIGN.md. Sin barra lateral. El botón
 * Empezar solo se habilita con el rodillo conectado (real) o en modo demo
 * explícito; nunca conecta un simulador por su cuenta (bug #1 del doc: antes
 * "Continuar a Entrenar" sin sensores conectaba simuladores solo y grababa
 * una sesión falsa que además se reanudaba sola). */
export function renderConnect(container: HTMLElement): void {
  appState.demoSession = false;
  const workout = appState.selectedWorkout;

  if (!workout) {
    container.innerHTML = `
      <div class="screen">
        <a href="#/home" class="back-link">← Volver a Inicio</a>
        <h1>Antes de empezar</h1>
        <p class="hint">Elige un workout en Inicio o en Plan primero.</p>
      </div>`;
    return;
  }

  const estimate = estimateWorkout(workout.intervals, appState.profile.ftp);
  const [wattsLow, wattsHigh] = estimate.wattsRange;
  const wattsLabel = wattsLow === wattsHigh ? `${wattsLow} W` : `${wattsLow}–${wattsHigh} W`;

  container.innerHTML = `
    <div class="prepare">
      <a href="#/home" class="back-link">← Volver a Inicio</a>
      <div class="prepare-grid">
        <div class="prepare-left">
          ${renderWorkoutCover(workout.intervals, 'lg')}
          <div class="prepare-heading">
            <div class="live-col-label">Vas a entrenar</div>
            <div class="prepare-title">${workout.name}</div>
          </div>
          <div class="prepare-stats">
            <div><div class="prepare-stat-num num">${fmtMinutes(estimate.durationS)}</div><div class="live-col-label">duración</div></div>
            <div><div class="prepare-stat-num num">${estimate.tss ?? '—'}</div><div class="live-col-label">TSS estimado</div></div>
            <div><div class="prepare-stat-num num">${wattsLabel}</div><div class="live-col-label">en los bloques, con FTP ${appState.profile.ftp}</div></div>
          </div>
          <div class="row-actions">
            <a href="#/limits" class="prepare-link">Editar límites por bloque</a>
            <a href="#/plan" class="prepare-link">Cambiar workout</a>
          </div>
        </div>
        <div class="prepare-right">
          <div class="prepare-subtitle">Antes de empezar</div>
          <div class="panel prepare-sensor">
            <div class="prepare-sensor-head"><div class="prepare-sensor-name">Rodillo</div><div id="trainer-state" class="prepare-sensor-status">${STATE_LABEL.disconnected}</div></div>
            <div class="prepare-sensor-reading" id="trainer-reading"><span><b class="num">0</b> W</span><span><b class="num">0</b> rpm</span></div>
            <div class="row-actions">
              <button id="trainer-connect" ${hasBluetooth ? '' : 'disabled title="este navegador no soporta Web Bluetooth"'}>Conectar por Bluetooth</button>
            </div>
            <div id="trainer-error"></div>
          </div>
          <div class="panel prepare-sensor">
            <div class="prepare-sensor-head"><div class="prepare-sensor-name">Banda de pulso</div><div class="prepare-sensor-status">Opcional · <span id="hr-state">${STATE_LABEL.disconnected}</span></div></div>
            <button id="hr-connect" ${hasBluetooth ? '' : 'disabled title="este navegador no soporta Web Bluetooth"'}>Buscar banda</button>
            <div id="hr-error"></div>
          </div>
          <button class="prepare-start" id="continue" disabled>▶ Empezar</button>
          <div class="prepare-hint">Arranca en cuanto pedaleas. Espacio para pausar.</div>
          <a href="#" id="demo-link" class="prepare-demo-link">Probar sin rodillo (modo demo, no se graba)</a>
        </div>
      </div>
    </div>
  `;

  function updateStartButton(): void {
    const btn = container.querySelector<HTMLButtonElement>('#continue')!;
    btn.disabled = appState.trainer?.state !== 'connected';
  }

  wireSensor<TrainerAdapter, TrainerReading>('trainer', appState.trainer, {
    connectBtn: 'trainer-connect',
    dot: null,
    stateEl: 'trainer-state',
    readingEl: 'trainer-reading',
    errorEl: 'trainer-error',
    makeReal: () => new BleTrainerAdapter(),
    formatReading: (r) => `<span><b class="num">${r.power}</b> W</span><span><b class="num">${r.cadence}</b> rpm</span>`,
    onReady: (a) => {
      appState.trainer = a;
      updateStartButton();
    },
    onState: updateStartButton,
  });

  wireSensor<HrAdapter, number>('hr', appState.hr, {
    connectBtn: 'hr-connect',
    dot: null,
    stateEl: 'hr-state',
    readingEl: null,
    errorEl: 'hr-error',
    makeReal: () => new BleHrAdapter(),
    formatReading: () => '',
    onReady: (a) => {
      appState.hr = a;
    },
  });

  updateStartButton();

  container.querySelector<HTMLButtonElement>('#continue')?.addEventListener('click', () => navigate('train'));

  // Modo demo explícito: el único lugar donde se conectan simuladores. Se
  // marca `appState.demoSession` para que Entrenar sepa que esta sesión no
  // se debe grabar (ver train.ts `finish()`).
  container.querySelector<HTMLAnchorElement>('#demo-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    appState.demoSession = true;
    if (!appState.trainer) appState.trainer = new SimulatedTrainerAdapter();
    if (!appState.hr) appState.hr = new SimulatedHrAdapter();
    if (appState.trainer.state === 'disconnected') appState.trainer.connect();
    if (appState.hr.state === 'disconnected') appState.hr.connect();
    navigate('train');
  });
}

interface SensorWiring<A extends TrainerAdapter | HrAdapter, R> {
  connectBtn: string;
  dot: string | null;
  stateEl: string;
  readingEl: string | null;
  errorEl: string;
  makeReal: () => A;
  formatReading: (r: R) => string;
  onReady: (adapter: A) => void;
  onState?: (state: ConnectionState) => void;
}

function wireSensor<A extends TrainerAdapter | HrAdapter, R>(
  kind: 'trainer' | 'hr',
  existing: A | null,
  cfg: SensorWiring<A, R>,
): void {
  const dot = cfg.dot ? document.getElementById(cfg.dot) : null;
  const stateEl = document.getElementById(cfg.stateEl)!;
  const readingEl = cfg.readingEl ? document.getElementById(cfg.readingEl) : null;
  const errorEl = document.getElementById(cfg.errorEl)!;

  function paint(state: ConnectionState): void {
    if (dot) dot.className = `status-dot ${state}`;
    stateEl.textContent = STATE_LABEL[state];
    cfg.onState?.(state);
  }

  function attach(adapter: A): void {
    paint(adapter.state);
    errorEl.innerHTML = '';
    adapter.onStateChange(paint);
    if (readingEl) {
      if (kind === 'trainer') {
        (adapter as TrainerAdapter).onReading((r) => (readingEl.innerHTML = cfg.formatReading(r as R)));
      } else {
        (adapter as HrAdapter).onReading((hr) => (readingEl.innerHTML = cfg.formatReading(hr as R)));
      }
    }
    cfg.onReady(adapter);
  }

  if (existing) attach(existing);

  document.getElementById(cfg.connectBtn)?.addEventListener('click', () => {
    const adapter = cfg.makeReal();
    attach(adapter);
    adapter.connect().catch((err: unknown) => {
      paint('error');
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      // NotFoundError con este texto = el usuario cerró el selector de Chrome sin elegir nada
      if (message.includes('User cancelled')) return;
      errorEl.innerHTML = `<div class="error-box">${message}</div>`;
    });
  });
}
