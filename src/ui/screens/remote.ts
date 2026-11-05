// Control remoto en el celular (#/remote/:código). Se abre escaneando el QR
// que muestra la sesión en la laptop; no pide iniciar sesión. Pensado para
// usarse arriba de la bici, apurado y con sudor: dos mitades enormes que
// reaccionan al tocar (no al soltar), confirmación con destello y vibración,
// y pausa solo manteniendo presionado para no detener un test por error.
import { REMOTE_HEARTBEAT_MS, REMOTE_STALE_MS, isRemoteCode } from '../../core/remote-protocol';
import type { RemoteCommand, RemoteState } from '../../core/remote-protocol';
import { WakeLockGuard } from '../../devices/wake-lock';
import { joinRemote } from '../../sync/remote';
import type { RemoteLinkStatus } from '../../sync/remote';
import { getRouteParam } from '../router';

const HOLD_MS = 550;

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function renderRemote(container: HTMLElement): () => void {
  const code = getRouteParam();
  document.body.classList.add('remote-body');
  if (!isRemoteCode(code)) {
    container.innerHTML = `<div class="remote-msg"><b>Este enlace no sirve</b><span>Vuelve a escanear el código que aparece en la sesión de tu compu.</span></div>`;
    return () => document.body.classList.remove('remote-body');
  }

  container.innerHTML = `
    <div class="remote" id="remote" data-ready="0">
      <header class="remote-top">
        <span class="remote-link" id="rLink"><i></i><span id="rLinkText">Conectando…</span></span>
        <span class="remote-block" id="rBlock">Esperando la sesión</span>
        <span class="remote-clock num" id="rClock"></span>
        <button class="remote-fs" id="rFs" type="button" aria-label="Pantalla completa">⤢</button>
      </header>
      <main class="remote-pad">
        <button class="remote-btn remote-easier" id="rEasier" type="button" aria-label="Más fácil">
          <svg class="remote-btn-sign" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 24h32" /></svg>
          <span class="remote-btn-text">Más fácil</span>
        </button>
        <section class="remote-center">
          <span class="remote-level num" id="rLevel">—</span>
          <span class="remote-level-label" id="rLevelLabel"></span>
          <span class="remote-target num" id="rTarget"></span>
          <button class="remote-hold" id="rToggle" type="button">
            <span class="remote-hold-fill"></span>
            <span class="remote-hold-text" id="rToggleText">Empezar</span>
          </button>
          <button class="remote-rampstop" id="rRampStop" type="button" hidden>Llegué a 8+ · terminar</button>
        </section>
        <button class="remote-btn remote-harder" id="rHarder" type="button" aria-label="Más duro">
          <svg class="remote-btn-sign" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 24h32M24 8v32" /></svg>
          <span class="remote-btn-text">Más duro</span>
        </button>
      </main>
      <div class="remote-rpe" id="rRpe" hidden>
        <div class="remote-rpe-q" id="rRpeQ"></div>
        <div class="remote-rpe-grid">
          ${Array.from({ length: 10 }, (_, i) => `<button type="button" class="remote-rpe-btn${i >= 7 ? ' hot' : ''}" data-rpe="${i + 1}">${i + 1}</button>`).join('')}
        </div>
        <div class="remote-rpe-hint">3-4 platicas · 6-7 frases cortas · 8+ pocas palabras: ahí termina</div>
      </div>
      <div class="remote-rotate">Gira tu celular para tener los botones más grandes</div>
    </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;
  const wake = new WakeLockGuard();
  void wake.acquire();

  let state: RemoteState | null = null;
  let stateAt = 0; // cuándo llegó (reloj del celular)
  let lastStateAt = 0;
  let linkStatus: RemoteLinkStatus = 'connecting';
  let nextId = 1;
  const sentAt = new Map<number, number>();
  let latencyMs: number | null = null;

  const link = joinRemote(code, onState, (s) => {
    linkStatus = s;
    if (s === 'online') send({ kind: 'hello', id: nextId++ });
    paintLink();
  });
  if (!link) {
    container.innerHTML = `<div class="remote-msg"><b>Sin conexión</b><span>Esta versión de Torq no tiene servidor configurado.</span></div>`;
    return () => document.body.classList.remove('remote-body');
  }

  function send(cmd: RemoteCommand): void {
    sentAt.set(cmd.id, performance.now());
    if (sentAt.size > 50) sentAt.delete(sentAt.keys().next().value!);
    link!.send(cmd);
  }

  function onState(s: RemoteState): void {
    state = s;
    stateAt = performance.now();
    lastStateAt = stateAt;
    if (s.ackId !== null && sentAt.has(s.ackId)) {
      latencyMs = Math.round(stateAt - sentAt.get(s.ackId)!);
      sentAt.delete(s.ackId);
    }
    paint();
  }

  function laptopAlive(): boolean {
    return lastStateAt > 0 && performance.now() - lastStateAt < REMOTE_STALE_MS;
  }

  function paintLink(): void {
    const el = $('rLink');
    const alive = laptopAlive();
    const ok = linkStatus === 'online' && alive;
    el.dataset.state = ok ? 'ok' : linkStatus === 'offline' ? 'off' : 'wait';
    $('rLinkText').textContent = ok
      ? latencyMs !== null ? `Conectado · ${latencyMs} ms` : 'Conectado'
      : linkStatus === 'offline' ? 'Sin conexión' : linkStatus === 'online' ? 'Abre la sesión en tu compu' : 'Conectando…';
  }

  function blockLeftNow(): number {
    if (!state) return 0;
    const passed = state.run === 'running' ? (performance.now() - stateAt) / 1000 : 0;
    return state.blockLeftS - passed;
  }

  function paint(): void {
    paintLink();
    if (!state) return;
    $('remote').dataset.ready = '1';
    $('remote').dataset.run = state.run;
    $('rBlock').textContent = state.block || 'Sesión';
    $('rClock').textContent = state.run === 'finished' ? '' : fmt(blockLeftNow());
    $('rLevel').textContent = state.level;
    $('rLevelLabel').textContent = state.levelLabel;
    $('rTarget').textContent = state.targetW ? `${state.targetW} W objetivo` : '';
    $('rToggleText').textContent =
      state.run === 'idle' ? 'Empezar' : state.run === 'running' ? 'Mantén para pausar' : state.run === 'paused' ? 'Mantén para seguir' : 'Sesión terminada';
    $('rRampStop').hidden = !state.ramp || state.run !== 'running';
    const rpe = $('rRpe');
    rpe.hidden = !state.rpeAsk;
    $('rRpeQ').textContent = state.rpeAsk ?? '';
  }

  /** Confirmación sin mirar: destello en el botón y una vibración corta
   * (Android; iPhone no deja vibrar desde la web). */
  function hit(el: HTMLElement, ms = 15): void {
    el.classList.remove('hit');
    void el.offsetWidth; // reinicia la animación aunque se toque seguido
    el.classList.add('hit');
    navigator.vibrate?.(ms);
  }

  // pointerdown y no click: responde al tocar, sin esperar a soltar, y no
  // se pierde si el dedo se resbala un poco por el sudor.
  function onPress(el: HTMLElement, fn: () => void): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!e.isPrimary) return; // un segundo dedo o la palma no cuentan
      void wake.acquire();
      hit(el);
      fn();
    });
  }

  onPress($('rHarder'), () => send({ kind: 'harder', id: nextId++ }));
  onPress($('rEasier'), () => send({ kind: 'easier', id: nextId++ }));
  onPress($('rRampStop'), () => send({ kind: 'ramp-stop', id: nextId++ }));
  $('rRpe').addEventListener('pointerdown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rpe]');
    if (!btn) return;
    e.preventDefault();
    hit(btn, 25);
    send({ kind: 'rpe', id: nextId++, value: Number(btn.dataset.rpe) });
    // se esconde ya, sin esperar la respuesta: evita un segundo toque
    $('rRpe').hidden = true;
  });

  // Empezar con un toque; pausar o seguir, manteniendo presionado.
  const toggle = $('rToggle');
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelHold = (): void => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    toggle.classList.remove('holding');
  };
  toggle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state || state.run === 'finished') return;
    void wake.acquire();
    if (state.run === 'idle') {
      hit(toggle, 30);
      send({ kind: 'toggle', id: nextId++ });
      return;
    }
    toggle.classList.add('holding');
    holdTimer = setTimeout(() => {
      cancelHold();
      hit(toggle, 40);
      send({ kind: 'toggle', id: nextId++ });
    }, HOLD_MS);
  });
  toggle.addEventListener('pointerup', cancelHold);
  toggle.addEventListener('pointerleave', cancelHold);
  toggle.addEventListener('pointercancel', cancelHold);

  // Pantalla completa y horizontal donde el navegador lo permite (Android).
  $('rFs').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      /* iPhone y algunos navegadores no lo permiten: se queda como está */
    }
  });
  if (!document.documentElement.requestFullscreen) $('rFs').hidden = true;

  // Ningún menú de mantener presionado ni zoom por doble toque.
  const noMenu = (e: Event): void => e.preventDefault();
  container.addEventListener('contextmenu', noMenu);

  const clock = setInterval(() => {
    if (state && state.run === 'running') $('rClock').textContent = fmt(blockLeftNow());
  }, 250);
  const heartbeat = setInterval(() => {
    send({ kind: 'hello', id: nextId++ });
    paintLink();
  }, REMOTE_HEARTBEAT_MS);
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') send({ kind: 'hello', id: nextId++ });
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearInterval(clock);
    clearInterval(heartbeat);
    cancelHold();
    document.removeEventListener('visibilitychange', onVisible);
    container.removeEventListener('contextmenu', noMenu);
    wake.release();
    link.close();
    document.body.classList.remove('remote-body');
  };
}
