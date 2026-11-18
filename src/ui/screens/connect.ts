import { hasWebBluetooth, noBluetoothMessage } from '../../devices/ble-support';
import { ftpSourceOf, isMeasuredFtp } from '../../core/coach-profile';
import { BleTrainerAdapter } from '../../devices/ftms';
import { BleHrAdapter } from '../../devices/heart-rate';
import { BleCadenceAdapter } from '../../devices/cadence';
import { SensorOnlyTrainer } from '../../devices/sensor-only-trainer';
import { isFreeRide } from '../../core/workout-templates';
import { SimulatedHrAdapter, SimulatedTrainerAdapter } from '../../devices/simulated';
import type { CadenceAdapter, ConnectionState, HrAdapter, TrainerAdapter, TrainerReading } from '../../devices/types';
import { estimateWorkout } from '../../core/workout-estimate';
import { isTestWorkoutDoc } from '../../core/workout-zone';
import { escapeHtml, renderWorkoutCover } from '../workout-cover';
import { tokenForWorkout, tokenHtml } from '../workout-token';
import { navigate } from '../router';
import { appState } from '../state';
import type { Interval } from '../../core/types';

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Sin conectar',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  error: 'Error',
};

const hasBluetooth = hasWebBluetooth();

function fmtMinutes(totalS: number): string {
  return `${Math.round(totalS / 60)} min`;
}

/** Bloque libre que se puede hacer con ERG: necesita un % de referencia (un
 * FreeRide importado sin watts no tiene a qué watts ir). */
function ergCapableFree(iv: Interval): boolean {
  return iv.type === 'free' && (iv.power_pct > 0 || (iv.watts ?? 0) > 0);
}

function intervalBlockHtml(iv: Interval, index: number): string {
  // Bloques cortos (ej. activaciones de 8s) redondeaban a "0 min", que no
  // dice nada — segundos para menos de 1 min, minutos para el resto.
  const durationLabel = iv.duration_s < 60 ? `${iv.duration_s}s` : `${Math.round(iv.duration_s / 60)} min`;
  const power = iv.ramp_to_pct ? `${iv.power_pct}% → ${iv.ramp_to_pct}% FTP` : `${iv.power_pct}% FTP`;
  const cadence = iv.cadence_min || iv.cadence_max ? ` · cadencia ${iv.cadence_min ?? ''}${iv.cadence_min && iv.cadence_max ? '-' : ''}${iv.cadence_max ?? ''}` : '';
  return `
    <div class="workout-detail-block">
      <div class="workout-detail-block-head">
        <span class="workout-detail-block-name">${escapeHtml(iv.name || iv.type)}</span>
        <span class="live-col-label">${durationLabel}</span>
      </div>
      ${ergCapableFree(iv) ? `<button type="button" class="free-block-toggle" data-free-index="${index}" aria-pressed="false">Por sensación</button>` : ''}
      <div class="live-col-label">${power}${escapeHtml(cadence)}</div>
    </div>`;
}

/** El modo demo (simuladores) es solo para el administrador en la app con
 * nube: a la gente no le sirve y podía confundirse con una rodada real. En la
 * copia local sin nube (desarrollo) sigue disponible. */
export function canUseDemo(): boolean {
  return !appState.cloudEnabled || appState.billing?.isAdmin === true;
}

/** "Antes de empezar" — ver TORQ_DESIGN.md. Sin barra lateral. El botón
 * Empezar solo se habilita con el rodillo conectado (real) o en modo demo
 * explícito; nunca conecta un simulador por su cuenta (bug #1 del doc: antes
 * "Continuar a Entrenar" sin sensores conectaba simuladores solo y grababa
 * una sesión falsa que además se reanudaba sola). */
export function renderConnect(container: HTMLElement): void {
  appState.demoSession = false;
  appState.ergFreeBlocks = new Set();
  // Los simuladores solo existen para la demo: si quedaron conectados de una
  // demo anterior, «Empezar» se habilitaba y grababa la rodada simulada como
  // sesión real. Volver aquí los suelta.
  if (appState.trainer instanceof SimulatedTrainerAdapter) {
    appState.trainer.disconnect();
    appState.trainer = null;
  }
  // El «rodillo» de la rodada libre tampoco se reusa: se arma de nuevo al
  // darle Empezar, con lo que esté conectado en ese momento.
  if (appState.trainer instanceof SensorOnlyTrainer) {
    appState.trainer.disconnect();
    appState.trainer = null;
  }
  if (appState.hr instanceof SimulatedHrAdapter) {
    appState.hr.disconnect();
    appState.hr = null;
  }
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

  // Bloques libres: la persona decide antes de empezar, bloque por bloque,
  // si los hace por sensación (el ERG se suelta y ella regula) o con ERG. En
  // un test se recomienda por sensación: con ERG fijo no mide su FTP.
  // Rodada libre (Workout.mode): sin rodillo inteligente ni ERG; el rodillo
  // y los sensores son opcionales, basta con uno para empezar.
  const freeRide = isFreeRide(workout);
  const hasFreeBlocks = !freeRide && workout.intervals.some(ergCapableFree) && workout.protocol !== 'rpe_ramp';
  const isTest = isTestWorkoutDoc(workout);
  const freeChoiceHtml = hasFreeBlocks
    ? `
          <div class="panel prepare-free-choice">
            <div class="prepare-sensor-name">Bloques libres</div>
            <p class="hint">Por sensación, el ERG se suelta y tú regulas la potencia. Con ERG, el bloque va a sus watts con tu FTP de perfil (${appState.profile.ftp} W). Toca cada bloque en la lista para cambiarlo.${isTest ? ' Es un test: por sensación mide bien tu FTP.' : ''}</p>
            <div class="row-actions">
              <button type="button" id="free-all-sense">Todos por sensación</button>
              <button type="button" id="free-all-erg">Todos con ERG</button>
            </div>
          </div>`
    : '';

  const estimate = estimateWorkout(workout.intervals, appState.profile.ftp);
  const [wattsLow, wattsHigh] = estimate.wattsRange;
  const wattsLabel = wattsLow === wattsHigh ? `${wattsLow} W` : `${wattsLow}–${wattsHigh} W`;

  container.innerHTML = `
    <div class="prepare">
      <a href="#/home" class="back-link">← Volver a Inicio</a>
      <div class="prepare-grid">
        <div class="prepare-left">
          ${freeRide ? '' : renderWorkoutCover(workout.intervals, 'lg')}
          <div class="prepare-heading">
            <div class="prepare-heading-top">
              <div class="prepare-kicker">Vas a entrenar</div>
              ${tokenHtml(tokenForWorkout(workout), 84, 'bob')}
            </div>
            <div class="prepare-title">${escapeHtml(workout.name)}</div>
          </div>
          <div class="prepare-stats">
            <div><div class="prepare-stat-num num">${fmtMinutes(estimate.durationS)}</div><div class="live-col-label">duración${freeRide ? ' (puedes terminar antes)' : ''}</div></div>
            ${freeRide ? '' : `<div><div class="prepare-stat-num num">${estimate.tss ?? '—'}</div><div class="live-col-label">TSS estimado</div></div>
            <div><div class="prepare-stat-num num">${wattsLabel}</div><div class="live-col-label">en los bloques, con FTP ${appState.profile.ftp}${isMeasuredFtp(ftpSourceOf(appState.profile)) ? '' : ' (aproximado: lo afinamos con tu test)'}</div></div>${isMeasuredFtp(ftpSourceOf(appState.profile)) ? '' : `<p class="hint prepare-ftp-hint" id="prepare-ftp-hint">¿Muy duro o muy suave? Súbele o bájale con + / − durante la sesión (también desde tu celular), o cambia tu FTP en Perfil.</p>`}`}
          </div>
          ${
            freeRide
              ? `<p class="hint" style="margin-top:10px">Sin objetivos ni ERG: rueda a tu ritmo. Se graba lo que conectes.</p>`
              : `<div class="workout-detail-blocks" style="margin-top:10px">
            ${workout.intervals.map((iv, i) => intervalBlockHtml(iv, i)).join('')}
          </div>`
          }
          ${workout.description ? `<div class="perfil-h2" style="margin-top:10px;font-size:15px">Sobre este entrenamiento</div><p class="hint prepare-description">${escapeHtml(workout.description)}</p>` : ''}
          <div class="row-actions">
            <a href="#/limits" class="prepare-link">Editar límites por bloque</a>
            <a href="#/plan" class="prepare-link">Cambiar workout</a>
          </div>
        </div>
        <div class="prepare-right">
          <div class="prepare-subtitle">Antes de empezar</div>
          ${hasBluetooth ? '' : `<div class="panel prepare-no-ble" role="status">${noBluetoothMessage()}</div>`}
          <div class="panel prepare-sensor">
            <span class="prepare-sensor-obj disconnected" id="trainer-dot" aria-hidden="true" style="background-image:url('/brand/obj-trainer.webp')"></span>
            <div class="prepare-sensor-body">
              <div class="prepare-sensor-head"><div class="prepare-sensor-name">Rodillo${freeRide ? ' <span class="prepare-sensor-opt">· opcional</span>' : ''}</div><div class="prepare-sensor-status"><span id="trainer-state">${STATE_LABEL.disconnected}</span></div></div>
              <div class="prepare-sensor-reading" id="trainer-reading"><span><b class="num">0</b> W</span><span><b class="num">0</b> rpm</span></div>
              <div class="row-actions">
                <button id="trainer-connect" ${hasBluetooth ? '' : 'disabled title="este navegador no soporta Web Bluetooth"'}>Conectar por Bluetooth</button>
              </div>
              ${freeRide ? '<p class="hint prepare-sensor-note">Solo si es un rodillo inteligente: también graba tu potencia, sin ERG.</p>' : ''}
              <div id="trainer-error"></div>
            </div>
          </div>
          <div class="panel prepare-sensor">
            <span class="prepare-sensor-obj disconnected" id="hr-dot" aria-hidden="true" style="background-image:url('/brand/obj-hr.webp')"></span>
            <div class="prepare-sensor-body">
              <div class="prepare-sensor-head"><div class="prepare-sensor-name">Banda de pulso <span class="prepare-sensor-opt">· opcional</span></div><div class="prepare-sensor-status"><span id="hr-state">${STATE_LABEL.disconnected}</span></div></div>
              <div class="row-actions">
                <button id="hr-connect" ${hasBluetooth ? '' : 'disabled title="este navegador no soporta Web Bluetooth"'}>Buscar banda</button>
              </div>
              <div id="hr-error"></div>
            </div>
          </div>
          ${
            freeRide
              ? `<div class="panel prepare-sensor">
            <span class="prepare-sensor-obj disconnected" id="cadence-dot" aria-hidden="true" style="background-image:url('/brand/obj-trainer.webp')"></span>
            <div class="prepare-sensor-body">
              <div class="prepare-sensor-head"><div class="prepare-sensor-name">Sensor de cadencia <span class="prepare-sensor-opt">· opcional</span></div><div class="prepare-sensor-status"><span id="cadence-state">${STATE_LABEL.disconnected}</span></div></div>
              <div class="prepare-sensor-reading" id="cadence-reading"><span><b class="num">0</b> rpm</span></div>
              <div class="row-actions">
                <button id="cadence-connect" ${hasBluetooth ? '' : 'disabled title="este navegador no soporta Web Bluetooth"'}>Buscar sensor</button>
              </div>
              <p class="hint prepare-sensor-note">Para una bici o un rodillo sin Bluetooth: el sensor que va en la biela.</p>
              <div id="cadence-error"></div>
            </div>
          </div>`
              : ''
          }
          ${freeChoiceHtml}
          <button class="prepare-start" id="continue" disabled>▶ Empezar</button>
          ${
            !freeRide && !isTest && workout.protocol !== 'rpe_ramp'
              ? `<button type="button" class="prepare-no-trainer" id="no-trainer">Hacer sin rodillo</button>
          <p class="hint prepare-no-trainer-hint">Afuera o en un rodillo sin Bluetooth: solo con tu banda de pulso (o sin nada). Te mostramos los watts de cada bloque como guía, pero no se miden ni se graban.</p>`
              : ''
          }
          <div class="prepare-hint">${freeRide ? 'No necesitas rodillo: conecta tu banda de pulso o tu sensor de cadencia si los tienes. Sin sensor de cadencia ni rodillo, arranca y pausa con el botón: no se pausa sola.' : 'Arranca en cuanto pedaleas.'} Espacio para pausar. En el celular, deja Torq abierto durante la sesión: si cambias de app, el rodillo se puede desconectar.</div>
          ${canUseDemo() ? '<a href="#" id="demo-link" class="prepare-demo-link">Probar sin rodillo (modo demo, no se graba)</a>' : ''}
        </div>
      </div>
    </div>
  `;

  function updateStartButton(): void {
    const btn = container.querySelector<HTMLButtonElement>('#continue')!;
    const trainerReady = appState.trainer?.state === 'connected';
    // La rodada libre no necesita nada conectado: se puede rodar solo con el
    // reloj de la sesión y conectar lo que haya.
    btn.disabled = freeRide ? false : !trainerReady;
  }

  wireSensor<TrainerAdapter, TrainerReading>('trainer', appState.trainer, {
    connectBtn: 'trainer-connect',
    dot: 'trainer-dot',
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
    dot: 'hr-dot',
    stateEl: 'hr-state',
    readingEl: null,
    errorEl: 'hr-error',
    makeReal: () => new BleHrAdapter(),
    formatReading: () => '',
    onReady: (a) => {
      appState.hr = a;
      updateStartButton();
    },
    onState: updateStartButton,
  });

  if (freeRide) {
    wireSensor<CadenceAdapter, number>('cadence', appState.cadence, {
      connectBtn: 'cadence-connect',
      dot: 'cadence-dot',
      stateEl: 'cadence-state',
      readingEl: 'cadence-reading',
      errorEl: 'cadence-error',
      makeReal: () => new BleCadenceAdapter(),
      formatReading: (rpm) => `<span><b class="num">${rpm}</b> rpm</span>`,
      onReady: (a) => {
        appState.cadence = a;
        updateStartButton();
      },
      onState: updateStartButton,
    });
  }

  updateStartButton();

  // Toggle por bloque libre: «Por sensación» ↔ «ERG».
  const toggles = Array.from(container.querySelectorAll<HTMLButtonElement>('.free-block-toggle'));
  function paintFreeToggles(): void {
    for (const btn of toggles) {
      const erg = appState.ergFreeBlocks.has(Number(btn.dataset.freeIndex));
      btn.textContent = erg ? '⚡ ERG' : 'Por sensación';
      btn.classList.toggle('is-erg', erg);
      btn.setAttribute('aria-pressed', String(erg));
    }
  }
  if (!hasFreeBlocks) toggles.forEach((btn) => btn.remove());
  for (const btn of toggles) {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.freeIndex);
      if (appState.ergFreeBlocks.has(i)) appState.ergFreeBlocks.delete(i);
      else appState.ergFreeBlocks.add(i);
      paintFreeToggles();
    });
  }
  container.querySelector('#free-all-sense')?.addEventListener('click', () => {
    appState.ergFreeBlocks.clear();
    paintFreeToggles();
  });
  container.querySelector('#free-all-erg')?.addEventListener('click', () => {
    toggles.forEach((btn) => appState.ergFreeBlocks.add(Number(btn.dataset.freeIndex)));
    paintFreeToggles();
  });

  container.querySelector<HTMLButtonElement>('#continue')?.addEventListener('click', () => {
    // Rodada libre sin rodillo conectado: un «rodillo» que solo pasa la
    // cadencia del sensor (si hay) y no controla nada.
    if (freeRide && appState.trainer?.state !== 'connected') {
      appState.trainer?.disconnect();
      appState.trainer = new SensorOnlyTrainer(appState.cadence?.state === 'connected' ? appState.cadence : null);
    }
    navigate('train');
  });

  // Cualquier workout sin rodillo: mismo «rodillo» que la rodada libre; los
  // watts quedan de guía en Entrenar.
  container.querySelector<HTMLButtonElement>('#no-trainer')?.addEventListener('click', () => {
    if (appState.trainer && !(appState.trainer instanceof SensorOnlyTrainer)) appState.trainer.disconnect();
    appState.trainer = new SensorOnlyTrainer(appState.cadence?.state === 'connected' ? appState.cadence : null);
    navigate('train');
  });

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

interface SensorWiring<A extends TrainerAdapter | HrAdapter | CadenceAdapter, R> {
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

function wireSensor<A extends TrainerAdapter | HrAdapter | CadenceAdapter, R>(
  kind: 'trainer' | 'hr' | 'cadence',
  existing: A | null,
  cfg: SensorWiring<A, R>,
): void {
  const dot = cfg.dot ? document.getElementById(cfg.dot) : null;
  const stateEl = document.getElementById(cfg.stateEl)!;
  const readingEl = cfg.readingEl ? document.getElementById(cfg.readingEl) : null;
  const errorEl = document.getElementById(cfg.errorEl)!;

  function paint(state: ConnectionState): void {
    // El objeto 3D del sensor: gris sin conectar; conectado, a color, con
    // .bob y halo verde en su tarjeta.
    if (dot) {
      dot.className = `prepare-sensor-obj ${state}${state === 'connected' ? ' bob' : ''}`;
      dot.closest('.prepare-sensor')?.classList.toggle('is-connected', state === 'connected');
    }
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
        (adapter as HrAdapter | CadenceAdapter).onReading((v) => (readingEl.innerHTML = cfg.formatReading(v as R)));
      }
    }
    cfg.onReady(adapter);
  }

  if (existing) attach(existing);
  let current: A | null = existing;

  document.getElementById(cfg.connectBtn)?.addEventListener('click', () => {
    // Soltar el intento anterior antes de abrir uno nuevo: si no, el viejo
    // seguía reintentando por su cuenta contra el mismo rodillo y los dos se
    // pisaban («GATT operation failed for unknown reason»).
    current?.disconnect();
    const adapter = cfg.makeReal();
    current = adapter;
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
