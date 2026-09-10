import { BleTrainerAdapter } from '../../devices/ftms';
import { BleHrAdapter } from '../../devices/heart-rate';
import { SimulatedHrAdapter, SimulatedTrainerAdapter } from '../../devices/simulated';
import type { ConnectionState, HrAdapter, TrainerAdapter, TrainerReading } from '../../devices/types';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: 'desconectado',
  connecting: 'conectando…',
  connected: 'conectado',
  reconnecting: 'reconectando…',
  error: 'error',
};

const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export function renderConnect(container: HTMLElement): void {
  container.innerHTML = `
    <div class="screen">
      ${renderNav('connect')}
      <h1>Conectar</h1>
      <p class="hint">Verifica las lecturas antes de empezar. Si un sensor se cae durante la sesión, la grabación sigue igual.</p>

      <h2>Rodillo (FTMS)</h2>
      <div class="panel">
        <div><span class="status-dot" id="trainer-dot"></span><span id="trainer-state">${STATE_LABEL.disconnected}</span></div>
        <div class="row-actions">
          <button id="trainer-connect" ${hasBluetooth ? '' : 'disabled title="este navegador no soporta Web Bluetooth"'}>Conectar por Bluetooth</button>
          <button id="trainer-sim">Usar simulador</button>
        </div>
        <div class="hint" id="trainer-reading" style="margin-top:10px">— W · — rpm</div>
        <div id="trainer-error"></div>
      </div>

      <h2>Banda de pulso</h2>
      <div class="panel">
        <div><span class="status-dot" id="hr-dot"></span><span id="hr-state">${STATE_LABEL.disconnected}</span></div>
        <div class="row-actions">
          <button id="hr-connect" ${hasBluetooth ? '' : 'disabled title="este navegador no soporta Web Bluetooth"'}>Conectar por Bluetooth</button>
          <button id="hr-sim">Usar simulador</button>
        </div>
        <div class="hint" id="hr-reading" style="margin-top:10px">— lpm</div>
        <div id="hr-error"></div>
      </div>

      ${!hasBluetooth ? '<div class="callout">Este navegador no expone Web Bluetooth (necesitas Chrome de escritorio sobre HTTPS o localhost). Puedes seguir con el simulador.</div>' : ''}

      <div class="row-actions" style="margin-top:24px">
        <button class="primary" id="continue" ${appState.selectedWorkout ? '' : 'disabled'}>Continuar a Entrenar</button>
      </div>
      ${appState.selectedWorkout ? '' : '<p class="hint">Elige un workout en Inicio primero.</p>'}
    </div>
  `;

  wireSensor<TrainerAdapter, TrainerReading>('trainer', appState.trainer, {
    connectBtn: 'trainer-connect',
    simBtn: 'trainer-sim',
    dot: 'trainer-dot',
    stateEl: 'trainer-state',
    readingEl: 'trainer-reading',
    errorEl: 'trainer-error',
    makeReal: () => new BleTrainerAdapter(),
    makeSim: () => new SimulatedTrainerAdapter(),
    formatReading: (r) => `${r.power} W · ${r.cadence} rpm`,
    onReady: (a) => {
      appState.trainer = a;
    },
  });

  wireSensor<HrAdapter, number>('hr', appState.hr, {
    connectBtn: 'hr-connect',
    simBtn: 'hr-sim',
    dot: 'hr-dot',
    stateEl: 'hr-state',
    readingEl: 'hr-reading',
    errorEl: 'hr-error',
    makeReal: () => new BleHrAdapter(),
    makeSim: () => new SimulatedHrAdapter(),
    formatReading: (hr) => `${hr} lpm`,
    onReady: (a) => {
      appState.hr = a;
    },
  });

  container.querySelector<HTMLButtonElement>('#continue')?.addEventListener('click', () => navigate('train'));
}

interface SensorWiring<A extends TrainerAdapter | HrAdapter, R> {
  connectBtn: string;
  simBtn: string;
  dot: string;
  stateEl: string;
  readingEl: string;
  errorEl: string;
  makeReal: () => A;
  makeSim: () => A;
  formatReading: (r: R) => string;
  onReady: (adapter: A) => void;
}

function wireSensor<A extends TrainerAdapter | HrAdapter, R>(
  kind: 'trainer' | 'hr',
  existing: A | null,
  cfg: SensorWiring<A, R>,
): void {
  const dot = document.getElementById(cfg.dot)!;
  const stateEl = document.getElementById(cfg.stateEl)!;
  const readingEl = document.getElementById(cfg.readingEl)!;
  const errorEl = document.getElementById(cfg.errorEl)!;

  function paint(state: ConnectionState): void {
    dot.className = `status-dot ${state}`;
    stateEl.textContent = STATE_LABEL[state];
  }

  function attach(adapter: A): void {
    paint(adapter.state);
    errorEl.innerHTML = '';
    adapter.onStateChange(paint);
    if (kind === 'trainer') {
      (adapter as TrainerAdapter).onReading((r) => (readingEl.textContent = cfg.formatReading(r as R)));
    } else {
      (adapter as HrAdapter).onReading((hr) => (readingEl.textContent = cfg.formatReading(hr as R)));
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

  document.getElementById(cfg.simBtn)?.addEventListener('click', () => {
    const adapter = cfg.makeSim();
    attach(adapter);
    adapter.connect();
  });
}
