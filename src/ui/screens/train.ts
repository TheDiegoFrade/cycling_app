import { buildCadenceMinRules, buildFactoryRules } from '../../core/defaults';
import { powerZone } from '../../core/zones';
import type { Interval, Rule, Sample, Workout } from '../../core/types';
import { Clock } from '../../engine/clock';
import { buildPlan } from '../../engine/plan';
import { SessionEngine } from '../../engine/session';
import type { EngineEvent } from '../../engine/session';
import { SimulatedHrAdapter, SimulatedTrainerAdapter } from '../../devices/simulated';
import { WakeLockGuard } from '../../devices/wake-lock';
import { saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { beeper } from '../audio';
import { navigate } from '../router';
import { appState } from '../state';

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function factoryRulesForSettings(): Rule[] {
  const enabled = appState.settings.factoryRulesEnabled;
  return buildFactoryRules(appState.profile).filter((r) => {
    if (r.id === 'factory-cadence-floor') return enabled.cadenceFloor;
    if (r.id === 'factory-hr-ceiling') return enabled.hrCeiling;
    if (r.id === 'factory-erg-detached') return enabled.ergDetached;
    return true;
  });
}

export function renderTrain(container: HTMLElement): (() => void) | void {
  const maybeWorkout = appState.selectedWorkout;
  if (!maybeWorkout) {
    container.innerHTML = `<div class="screen"><p class="hint">Elige un workout en Inicio primero.</p><button id="back">Volver a Inicio</button></div>`;
    container.querySelector('#back')?.addEventListener('click', () => navigate('home'));
    return;
  }
  const workout: Workout = maybeWorkout;

  container.innerHTML = `
    <div class="app">
      <div class="top">
        <div class="title">${workout.name}</div>
        <div class="sensor"><span class="status-dot" id="trainer-dot"></span><span id="trainer-name">Rodillo</span></div>
        <div class="sensor"><span class="status-dot" id="hr-dot"></span><span id="hr-name">Banda</span></div>
        <div class="sensor">FTP <b class="num">${appState.profile.ftp}</b></div>
        <div class="sensor bias"><button id="bMinus" type="button">−</button><b class="num" id="bias">100%</b><button id="bPlus" type="button">+</button></div>
        <button id="btnErg" type="button" title="al apagarlo, la app deja de mandarle el objetivo en watts al rodillo">ERG: ON</button>
        <button id="btnRules" type="button">Reglas</button>
        <div class="clock num"><span id="elapsed">00:00</span> <span>/ <span id="total">00:00</span></span></div>
        <button id="btnMain" type="button">Empezar</button>
      </div>

      <div class="stage idle" id="stage">
        <div class="headline" id="hl">Listo</div>
        <div class="detail" id="dt">Empieza a pedalear para arrancar, o presiona Empezar · espacio para pausar/continuar luego.</div>
        <div class="why" id="why"></div>
      </div>

      <div class="graph">
        <div class="legend"><span><i style="background:var(--bad)"></i>Pulso</span><span><i style="background:var(--z2)"></i>Cadencia</span><span><i style="background:#fff;opacity:.6"></i>Potencia</span></div>
        <canvas id="g"></canvas>
      </div>

      <div class="nums">
        <div class="card">
          <div class="label">Potencia</div>
          <div class="row"><div class="v num" id="pw">—</div><div class="sub">objetivo <b class="num" id="tgt">—</b> W</div><span class="erg">ERG</span></div>
        </div>
        <div class="card">
          <div class="label">Cadencia</div>
          <div class="row"><div class="v num" id="cad">—</div><div class="sub">mín <b class="num" id="cadMin">—</b></div></div>
        </div>
        <div class="card">
          <div class="label">Pulso</div>
          <div class="row"><div class="v num" id="hr">—</div><span class="zone" id="hrZone" style="background:var(--z1)">—</span></div>
        </div>
        <div class="card iv">
          <div class="label">Intervalo <span id="ivIdx"></span></div>
          <div class="row"><div class="v num" id="ivLeft">—</div><span class="zone" id="ivZone" style="background:var(--z1)">—</span></div>
          <div class="next" id="ivNext"></div>
        </div>
      </div>
    </div>
    <div class="count" id="count"><div class="ring" id="ring"></div><div class="n num" id="countN">5</div><div class="what" id="countWhat"></div></div>
    <div class="rules" id="rules"><h4>Reglas activas</h4><div id="rulesList"></div></div>
  `;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  const rules: Rule[] = [...factoryRulesForSettings(), ...buildCadenceMinRules(workout.intervals), ...(workout.rules ?? [])];
  $('rulesList').innerHTML = rules.map((r) => `<div>· <code>${r.level}</code> ${r.message}</div>`).join('') || '<div>Sin reglas activas.</div>';
  $('btnRules').addEventListener('click', () => $('rules').classList.toggle('on'));

  const plan = buildPlan(workout.intervals);
  $('total').textContent = fmt(plan.totalDuration);

  const engine = new SessionEngine({ workout, profile: appState.profile, rules, autoPauseAfterS: 5 });
  const clock = new Clock();
  const wakeLock = new WakeLockGuard();

  const trainer = appState.trainer ?? new SimulatedTrainerAdapter();
  const hr = appState.hr ?? new SimulatedHrAdapter();
  appState.trainer = trainer;
  appState.hr = hr;
  if (trainer.state === 'disconnected') trainer.connect();
  if (hr.state === 'disconnected') hr.connect();
  $('trainer-dot').className = `status-dot ${trainer.state}`;
  $('hr-dot').className = `status-dot ${hr.state}`;
  const unsubTrainerState = trainer.onStateChange((s) => ($('trainer-dot').className = `status-dot ${s}`));
  const unsubHrState = hr.onStateChange((s) => ($('hr-dot').className = `status-dot ${s}`));

  const SENSOR_STALE_MS = 4000;
  let latestPower = 0;
  let latestCadence = 0;
  let latestHr = 0;
  let lastPowerReadingAt = performance.now();
  let lastHrReadingAt = performance.now();
  const unsubTrainerReading = trainer.onReading((r) => {
    latestPower = r.power;
    latestCadence = r.cadence;
    lastPowerReadingAt = performance.now();
  });
  const unsubHrReading = hr.onReading((v) => {
    latestHr = v;
    lastHrReadingAt = performance.now();
  });

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let autoStartTimer: ReturnType<typeof setInterval> | null = null;
  let autoStartStreak = 0;
  const AUTO_START_PEDAL_S = 3;
  let stageTimer: ReturnType<typeof setTimeout> | null = null;
  let cdShown = -1;
  let currentIndex0 = 0;
  let currentTimeLeft = workout.intervals[0]?.duration_s ?? 0;
  let ergEnabled = true;
  let lastTargetWatts = 0;

  const history: Sample[] = [];
  const alerts: SessionRecord['alerts'] = [];
  const intensityChanges: SessionRecord['intensityChanges'] = [];
  const startedAt = new Date();
  let lastElapsedS = 0;

  function zoneColor(z: number): string {
    return getComputedStyle(document.documentElement).getPropertyValue(`--z${z}`).trim();
  }

  function paintIdle(): void {
    const iv = workout.intervals[currentIndex0];
    if (!iv) return;
    $('stage').className = 'stage idle';
    $('hl').textContent = iv.name;
    $('dt').textContent = `cadencia ${iv.cadence_min ?? '—'}+ · ${fmt(currentTimeLeft)} restante`;
    $('why').textContent = '';
  }

  function showStage(kind: string, headline: string, detail: string, why: string, holdMs = 8000): void {
    if (stageTimer) clearTimeout(stageTimer);
    const st = $('stage');
    st.className = 'stage';
    void st.offsetWidth;
    st.className = `stage ${kind}`;
    $('hl').textContent = headline;
    $('dt').textContent = detail;
    $('why').textContent = why;
    stageTimer = setTimeout(paintIdle, holdMs);
  }

  function draw(): void {
    const canvas = $<HTMLCanvasElement>('g');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width;
    const h = rect.height;
    const pad = 10;
    const top = 26;
    g.clearRect(0, 0, w, h);
    const X = (t: number) => pad + (t / plan.totalDuration) * (w - 2 * pad);

    workout.intervals.forEach((iv: Interval, i: number) => {
      const bh = (iv.power_pct / 130) * (h - top - pad);
      g.fillStyle = zoneColor(powerZone(iv.power_pct));
      g.globalAlpha = i < currentIndex0 ? 0.3 : i === currentIndex0 ? 0.9 : 0.55;
      g.fillRect(X(plan.segStart[i]) + 1, h - pad - bh, X(plan.segStart[i] + iv.duration_s) - X(plan.segStart[i]) - 2, bh);
    });
    g.globalAlpha = 1;

    if (history.length > 1) {
      const line = (key: 'power' | 'cadence' | 'hr', min: number, max: number, color: string, lw: number) => {
        g.beginPath();
        g.strokeStyle = color;
        g.lineWidth = lw;
        g.lineJoin = 'round';
        history.forEach((p, j) => {
          const x = X(p.t);
          const y = h - pad - ((p[key] - min) / (max - min)) * (h - top - pad);
          j ? g.lineTo(x, y) : g.moveTo(x, y);
        });
        g.stroke();
      };
      line('power', 0, appState.profile.ftp * 1.3, 'rgba(255,255,255,.35)', 1.5);
      line('cadence', 60, 110, zoneColor(2), 2);
      line('hr', 80, 190, zoneColor(6), 2.5);
    }

    const last = history[history.length - 1];
    if (last) {
      g.fillStyle = '#fff';
      g.fillRect(X(last.t) - 1, top, 2, h - top - pad);
    }
  }

  function handleEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'tick': {
        lastElapsedS = event.t;
        currentIndex0 = event.sample.interval_index;
        currentTimeLeft = event.metrics.time_left_interval ?? 0;
        history.push(event.sample);
        $('elapsed').textContent = fmt(event.t);
        $('pw').textContent = String(event.sample.power);
        $('tgt').textContent = String(event.sample.target);
        $('cad').textContent = String(event.sample.cadence);
        $('cadMin').textContent = String(workout.intervals[currentIndex0]?.cadence_min ?? '—');
        $('hr').textContent = String(event.sample.hr);
        const hrPct = event.metrics.hr_pct_max ?? 0;
        const hz = hrPct < 60 ? 1 : hrPct < 70 ? 2 : hrPct < 80 ? 3 : hrPct < 90 ? 4 : 5;
        $('hrZone').textContent = `Z${hz}`;
        $('hrZone').style.background = zoneColor(hz);
        const z = powerZone(workout.intervals[currentIndex0]?.power_pct ?? 0);
        $('ivZone').textContent = `Z${z}`;
        $('ivZone').style.background = zoneColor(z);
        $('ivIdx').textContent = `${currentIndex0 + 1} / ${workout.intervals.length}`;
        $('ivLeft').textContent = fmt(currentTimeLeft);
        const next = workout.intervals[currentIndex0 + 1];
        $('ivNext').innerHTML = next ? `siguiente: <b>${next.name}</b> · ${next.cadence_min ?? '—'}+ rpm` : 'siguiente: fin';
        if ($('stage').classList.contains('idle')) paintIdle();
        lastTargetWatts = event.sample.target;
        if (ergEnabled) trainer.setTarget(lastTargetWatts);
        draw();
        return;
      }
      case 'block-start': {
        $('count').classList.remove('on');
        cdShown = -1;
        beeper.play('go');
        showStage('go', event.interval.name, `${event.targetWatts} W · ${event.interval.cadence_min ?? '—'}+ rpm`, '', 1800);
        return;
      }
      case 'countdown': {
        const count = $('count');
        count.classList.add('on');
        if (cdShown !== event.secondsLeft) {
          cdShown = event.secondsLeft;
          const n = $('countN');
          const ring = $('ring');
          n.textContent = String(event.secondsLeft);
          n.className = 'n num';
          ring.className = 'ring';
          void n.offsetWidth;
          n.className = 'n num go';
          ring.className = 'ring go';
          beeper.play('tick');
        }
        $('countWhat').innerHTML = `siguiente<b>${event.next.interval.name} · ${event.next.targetWatts} W · ${event.next.interval.cadence_min ?? '—'}+ rpm</b>`;
        return;
      }
      case 'comment': {
        $('count').classList.remove('on');
        cdShown = -1;
        beeper.play(event.comment.sound ?? 'chime');
        showStage('info', event.comment.message, event.comment.detail ?? '', 'comentario del coach', 6000);
        return;
      }
      case 'rule': {
        $('count').classList.remove('on');
        cdShown = -1;
        const n = event.notification;
        if (n.kind === 'fire') {
          beeper.play(n.sound);
          const kind = n.level === 'danger' ? 'bad' : n.level === 'adjust' ? 'warn' : 'info';
          showStage(kind, n.message, n.detail ?? '', `regla: ${n.rule.id}`, n.level === 'danger' ? 4000 : 2600);
          alerts.push({ t: lastElapsedS, level: n.level, message: n.message });
        } else {
          beeper.play('tick');
          showStage('info', n.message, '', '', 2200);
        }
        return;
      }
      case 'paused': {
        // el loop de 1 Hz sigue corriendo: tick() es quien detecta que
        // volviste a pedalear y reanuda solo, aunque la pausa haya sido manual.
        $('btnMain').textContent = 'Continuar';
        showStage('pause', 'Pausa', `ERG en reposo (${event.targetWatts} W) · espacio para continuar`, '', 999999);
        trainer.setTarget(event.targetWatts);
        return;
      }
      case 'resumed': {
        $('btnMain').textContent = 'Pausar';
        showStage('info', 'Reanuda', '', '', 1200);
        return;
      }
      case 'finished': {
        finish();
        return;
      }
    }
  }

  async function finish(): Promise<void> {
    stopPollLoop();
    wakeLock.release();
    showStage('info', 'Terminado', 'Guardando sesión…', '', 999999);
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      ftp: appState.profile.ftp,
      samples: history,
      alerts,
      intensityChanges,
    };
    await saveSession(record);
    appState.lastSession = record;
    navigate('summary');
  }

  function stopPollLoop(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function driveEngineTicks(): void {
    if (pollTimer) return;
    clock.start(performance.now());
    pollTimer = setInterval(() => {
      const ticks = clock.poll(performance.now());
      for (let i = 0; i < ticks.length; i++) {
        // si un sensor se cae (o deja de mandar notificaciones sin que BLE
        // avise de la desconexión), se graban ceros en vez de congelar la
        // última lectura en silencio — así se nota en la pantalla y en el
        // registro de la sesión.
        const now = performance.now();
        const powerStale = now - lastPowerReadingAt > SENSOR_STALE_MS;
        const hrStale = now - lastHrReadingAt > SENSOR_STALE_MS;
        const events = engine.tick({
          power: powerStale ? 0 : latestPower,
          cadence: powerStale ? 0 : latestCadence,
          hr: hrStale ? 0 : latestHr,
        });
        events.forEach(handleEvent);
      }
    }, 200);
  }

  function paintBias(pct: number): void {
    const b = $('bias');
    b.textContent = `${pct}%`;
    b.className = `num${pct < 100 ? ' down' : ''}`;
    beeper.play('tick');
    intensityChanges.push({ t: lastElapsedS, pct });
    if (engine.currentState === 'running') showStage('info', `Intensidad ${pct}%`, 'se guarda en el registro', 'ajuste manual', 1600);
  }

  function adjustIntensity(deltaPct: number): void {
    paintBias(engine.adjustIntensityPct(deltaPct));
  }

  $('bMinus').addEventListener('click', () => adjustIntensity(-5));
  $('bPlus').addEventListener('click', () => adjustIntensity(5));

  $('btnErg').addEventListener('click', () => {
    ergEnabled = !ergEnabled;
    $('btnErg').textContent = `ERG: ${ergEnabled ? 'ON' : 'OFF'}`;
    if (ergEnabled) {
      // al reactivarlo, vuelve a mandar el objetivo actual de inmediato en
      // vez de esperar al próximo tick para que el rodillo enganche ya
      trainer.setTarget(lastTargetWatts);
    }
    showStage('info', `ERG ${ergEnabled ? 'activado' : 'desactivado'}`, ergEnabled ? '' : 'el rodillo deja de recibir el objetivo en watts', '', 1800);
  });

  function toggleRun(): void {
    if (engine.currentState === 'idle') {
      stopAutoStartWatcher();
      beeper.unlock();
      wakeLock.acquire();
      $('btnMain').textContent = 'Pausar';
      engine.start().forEach(handleEvent);
      driveEngineTicks();
    } else if (engine.currentState === 'running') {
      engine.pause().forEach(handleEvent);
    } else if (engine.currentState === 'paused') {
      engine.resume().forEach(handleEvent);
    }
  }

  $('btnMain').addEventListener('click', toggleRun);

  /** Como en Rouvy: si pedaleas unos segundos antes de tocar nada, arranca
   * solo. Deja de vigilar en cuanto la sesión empieza (por acá o por el
   * botón/espacio). */
  function startAutoStartWatcher(): void {
    if (autoStartTimer) return;
    autoStartTimer = setInterval(() => {
      if (engine.currentState !== 'idle') {
        stopAutoStartWatcher();
        return;
      }
      if (latestCadence > 0) {
        autoStartStreak++;
        if (autoStartStreak >= AUTO_START_PEDAL_S) toggleRun();
      } else {
        autoStartStreak = 0;
      }
    }, 1000);
  }

  function stopAutoStartWatcher(): void {
    if (autoStartTimer) clearInterval(autoStartTimer);
    autoStartTimer = null;
  }

  startAutoStartWatcher();

  function onKeydown(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      e.preventDefault();
      toggleRun();
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      adjustIntensity(1);
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      adjustIntensity(-1);
    }
  }
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', draw);

  paintIdle();
  draw();

  return () => {
    stopPollLoop();
    stopAutoStartWatcher();
    wakeLock.release();
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', draw);
    unsubTrainerState();
    unsubHrState();
    unsubTrainerReading();
    unsubHrReading();
    if (stageTimer) clearTimeout(stageTimer);
  };
}
