import { buildFactoryRules, buildIntervalLimitRules } from '../../core/defaults';
import { powerZone, ZONE_HEIGHT_PCT, ZONE_NAMES } from '../../core/zones';
import type { Profile, Rule, Sample, Workout } from '../../core/types';
import { Clock } from '../../engine/clock';
import { buildPlan, intervalIndexAt, targetWattsAt } from '../../engine/plan';
import { SessionEngine } from '../../engine/session';
import type { EngineEvent } from '../../engine/session';
import { WakeLockGuard } from '../../devices/wake-lock';
import { clearDraft, getDraft, saveDraft } from '../../storage/session-draft';
import { saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { pushSessionToCloud } from '../../sync/cloud-sync';
import { beeper } from '../audio';
import { navigate } from '../router';
import { appState } from '../state';

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function factoryRulesForSettings(workout: Workout): Rule[] {
  const enabled = appState.settings.factoryRulesEnabled;
  return buildFactoryRules(appState.profile, workout).filter((r) => {
    if (r.id === 'factory-cadence-floor') return enabled.cadenceFloor;
    if (r.id === 'factory-hr-ceiling') return enabled.hrCeiling;
    if (r.id === 'factory-hr-floor') return enabled.hrFloor;
    if (r.id === 'factory-cadence-ceiling') return enabled.cadenceCeiling;
    if (r.id === 'factory-erg-detached') return enabled.ergDetached;
    return true;
  });
}

type BannerKind = 'info' | 'adjust' | 'danger' | 'pause';

export function renderTrain(container: HTMLElement): (() => void) | void {
  const maybeWorkout = appState.selectedWorkout;
  if (!maybeWorkout) {
    container.innerHTML = `<div class="screen"><p class="hint">Elige un workout en Inicio primero.</p><button id="back">Volver a Inicio</button></div>`;
    container.querySelector('#back')?.addEventListener('click', () => navigate('home'));
    return;
  }
  // nunca se conecta un simulador por su cuenta acá (bug #1 de TORQ_DESIGN.md):
  // si no hay rodillo, se vuelve a Antes de empezar — ahí el único lugar
  // donde se puede elegir explícitamente "modo demo".
  if (!appState.trainer) {
    navigate('prepare');
    return;
  }
  const workout: Workout = maybeWorkout;
  const isDemo = appState.demoSession;

  container.innerHTML = `
    <div class="live">
      <div class="live-zonestrip" id="zoneStrip"></div>
      <div class="live-topbar">
        <span class="live-zonepill" id="zonePill">—</span>
        <span class="live-blockinfo" id="blockInfo"></span>
        <div class="live-topbar-right">
          <span class="status-dot" id="trainer-dot" title="Rodillo"></span>
          <span class="status-dot" id="hr-dot" title="Banda de pulso"></span>
          <span class="live-clock num"><span id="elapsed">00:00</span> / <span id="total">00:00</span></span>
          <div class="live-intensity">
            <button id="bMinus" type="button" aria-label="Bajar intensidad">−</button>
            <span class="live-intensity-value num" id="bias">100%</span>
            <button id="bPlus" type="button" aria-label="Subir intensidad">+</button>
          </div>
          <button class="live-pause-btn" id="btnMain" type="button">Empezar</button>
          <div class="live-menu-wrap" id="menuWrap">
            <button class="live-menu-btn" id="menuBtn" type="button" aria-label="Más opciones">⋯</button>
            <div class="live-menu" id="menu">
              <button class="live-menu-item" id="menuErg" type="button">ERG: activado</button>
              <button class="live-menu-item" id="menuFtp" type="button">FTP: ${appState.profile.ftp} W</button>
              <button class="live-menu-item" id="menuRules" type="button">Reglas</button>
              <button class="live-menu-item" id="menuLimits" type="button">Límites</button>
              <div class="live-menu-divider"></div>
              <button class="live-menu-item" id="menuFinish" type="button">Terminar y guardar</button>
              <div class="live-menu-divider"></div>
              <button class="live-menu-item danger live-menu-hold" id="menuDiscard" type="button">
                <span class="live-menu-hold-fill"></span>
                <span class="live-menu-hold-content">
                  <span>Salir sin guardar</span>
                  <span class="live-menu-hold-hint">mantén presionado</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="live-center">
        <div class="live-power-col">
          <div class="live-col-label">Potencia</div>
          <div class="live-power-row">
            <span class="live-power-num num empty" id="pw">—</span>
            <span class="live-target-wrap">
              <span class="live-target-num num" id="tgt">—</span>
              <span class="live-target-label">objetivo W</span>
            </span>
          </div>
          <div class="live-power-rangebar">
            <div class="band" id="rangeBand"></div>
            <div class="marker" id="rangeMarker"></div>
          </div>
        </div>
        <div class="live-block-col">
          <div class="live-col-label">Quedan del bloque</div>
          <span class="live-timeleft-num num empty" id="ivLeft">—</span>
          <div class="live-next" id="ivNext"></div>
        </div>
        <div class="live-message-overlay" id="banner">
          <div class="live-message-title" id="bannerTitle"></div>
          <div class="live-message-detail" id="bannerDetail"></div>
        </div>
      </div>

      <div class="live-bottom-row">
        <div>
          <div class="live-metric-label">Cadencia</div>
          <div class="live-metric-row"><span class="live-metric-num num empty" id="cad">—</span><span class="live-metric-sub" id="cadSub">rpm</span></div>
        </div>
        <div>
          <div class="live-metric-label">Pulso</div>
          <div class="live-metric-row"><span class="live-metric-num num empty" id="hr">—</span><span class="live-metric-sub" id="hrSub">—</span></div>
        </div>
      </div>

      <div class="live-graph">
        <div class="live-graph-legend">
          <span><i style="background:#fff"></i>Potencia</span>
          <span><i style="background:var(--z2)"></i>Cadencia</span>
          <span><i style="background:var(--danger)"></i>Pulso</span>
        </div>
        <div class="live-timeline" id="timeline"></div>
        <canvas id="g"></canvas>
      </div>
    </div>
    <div class="count" id="count"><div class="ring" id="ring"></div><div class="n num" id="countN">5</div><div class="what" id="countWhat"></div></div>
    <div class="rules" id="rules"><h4>Reglas activas</h4><div id="rulesList"></div></div>
    <div class="rules" id="limits"><h4>Límites de pulso/cadencia</h4><div id="limitsPanel"></div></div>
  `;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  function zoneColor(z: number): string {
    return getComputedStyle(document.documentElement).getPropertyValue(`--z${z}`).trim();
  }

  // se reconstruye completa cada vez que cambia un límite (perfil o bloque)
  // para no tener que llevar un diff a mano — el motor la puede recibir
  // completa en caliente vía engine.updateRules().
  function buildRules(): Rule[] {
    return [...factoryRulesForSettings(workout), ...buildIntervalLimitRules(workout.intervals), ...(workout.rules ?? [])];
  }

  function paintRulesList(): void {
    $('rulesList').innerHTML = buildRules().map((r) => `<div>· <code>${r.level}</code> ${r.message}</div>`).join('') || '<div>Sin reglas activas.</div>';
  }
  paintRulesList();

  const plan = buildPlan(workout.intervals);
  $('total').textContent = fmt(plan.totalDuration);

  const engine = new SessionEngine({ workout, profile: appState.profile, rules: buildRules(), autoPauseAfterS: 5 });
  const clock = new Clock();
  const wakeLock = new WakeLockGuard();

  // el rodillo ya está garantizado (ver guard arriba); la banda de pulso es
  // opcional — sin ella, el pulso se graba en 0 (igual que un sensor que se
  // cae a mitad de sesión), nunca se inventa uno simulado.
  const trainer = appState.trainer!;
  const hr = appState.hr;
  if (trainer.state === 'disconnected') trainer.connect();
  $('trainer-dot').className = `status-dot ${trainer.state}`;
  $('hr-dot').className = `status-dot ${hr?.state ?? 'disconnected'}`;
  const unsubTrainerState = trainer.onStateChange((s) => ($('trainer-dot').className = `status-dot ${s}`));
  const unsubHrState = hr?.onStateChange((s) => ($('hr-dot').className = `status-dot ${s}`));

  const SENSOR_STALE_MS = 4000;
  let latestPower = 0;
  let latestCadence = 0;
  let latestHr = 0;
  let lastPowerReadingAt = performance.now();
  let lastHrReadingAt = performance.now() - SENSOR_STALE_MS - 1; // sin banda, "stale" desde el inicio
  const unsubTrainerReading = trainer.onReading((r) => {
    latestPower = r.power;
    latestCadence = r.cadence;
    lastPowerReadingAt = performance.now();
  });
  const unsubHrReading = hr?.onReading((v) => {
    latestHr = v;
    lastHrReadingAt = performance.now();
  });

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let autoStartTimer: ReturnType<typeof setInterval> | null = null;
  let autoStartStreak = 0;
  const AUTO_START_PEDAL_S = 3;
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  let compactTimer: ReturnType<typeof setTimeout> | null = null;
  let activeAlertLevel: 'danger' | 'adjust' | null = null;
  const firedMotivation = new Set<string>();
  let cdShown = -1;
  let currentIndex0 = 0;
  let currentTimeLeft = workout.intervals[0]?.duration_s ?? 0;
  let ergEnabled = true;
  let lastTargetWatts = 0;

  const history: Sample[] = [];
  const alerts: SessionRecord['alerts'] = [];
  const intensityChanges: SessionRecord['intensityChanges'] = [];
  let startedAt = new Date();
  let sessionId: string = crypto.randomUUID();
  let lastElapsedS = 0;
  let sessionFinished = false;

  // Mismos cortes que powerZone() (zones.ts), con el techo de cada zona
  // anclado a su ZONE_HEIGHT_PCT — interpolado linealmente entre cortes en
  // vez de "saltado" a un escalón por zona, para que la línea de potencia
  // suba y baje con ruido real en vez de verse como un trazo plano.
  const POWER_PCT_HEIGHT_POINTS: readonly [number, number][] = [
    [0, 0],
    [55, 25],
    [75, 40],
    [90, 55],
    [105, 70],
    [120, 85],
    [150, 100],
  ];

  function powerPctToHeightPct(powerPct: number): number {
    const points = POWER_PCT_HEIGHT_POINTS;
    if (powerPct <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [p1, h1] = points[i];
      if (powerPct <= p1) {
        const [p0, h0] = points[i - 1];
        return h0 + ((powerPct - p0) / (p1 - p0)) * (h1 - h0);
      }
    }
    return 100;
  }

  /** Líneas de potencia/cadencia/pulso avanzando en vivo — igual que antes
   * del rediseño, el usuario prefiere verlas mientras entrena. */
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
    g.clearRect(0, 0, w, h);
    const X = (t: number) => pad + (t / plan.totalDuration) * (w - 2 * pad);

    if (history.length > 1) {
      const line = (key: 'cadence' | 'hr', min: number, max: number, color: string, lw: number) => {
        g.beginPath();
        g.strokeStyle = color;
        g.lineWidth = lw;
        g.lineJoin = 'round';
        history.forEach((p, j) => {
          const x = X(p.t);
          const y = h - pad - ((p[key] - min) / (max - min)) * (h - 2 * pad);
          j ? g.lineTo(x, y) : g.moveTo(x, y);
        });
        g.stroke();
      };
      // potencia: mismo eje que las barras (altura por zona), no un rango
      // lineal de watts — pero interpolado de forma continua entre los
      // mismos puntos de corte que usan las zonas (ver ZONE_HEIGHT_PCT), no
      // "saltada" a un escalón fijo por zona — eso se veía como una línea
      // recta y plana, nada parecido al ruido real de la potencia. Sin el
      // pad vertical que sí llevan cadencia/pulso, para que 100% de la
      // escala toque el borde superior igual que una barra al 100%.
      const powerPath = new Path2D();
      history.forEach((p, j) => {
        const x = X(p.t);
        const powerPct = appState.profile.ftp > 0 ? (p.power / appState.profile.ftp) * 100 : 0;
        const heightPct = powerPctToHeightPct(powerPct);
        const y = h - (heightPct / 100) * h;
        j ? powerPath.lineTo(x, y) : powerPath.moveTo(x, y);
      });
      // la línea queda justo sobre el color de zona de la barra, que puede
      // ser gris, verde, azul... — un halo oscuro detrás asegura que se vea
      // sin importar contra qué color caiga encima.
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,.55)';
      g.lineWidth = 4;
      g.stroke(powerPath);
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.stroke(powerPath);
      const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
      line('cadence', 60, 110, zoneColor(2), 2);
      line('hr', 80, 190, dangerColor, 2);
    }
  }

  const MOTIVATION = {
    blockHalfway: ['Vas a la mitad de este bloque — no aflojes.', 'Mitad del bloque, todo bien hasta aquí.'],
    blockLeft5: ['Quedan 5 minutos de este bloque, ¡tú puedes!', 'Faltan 5 del bloque — aguanta ahí.'],
    blockLeft1: ['Último minuto del bloque, dale con todo.', '1 minuto y cambias de bloque.'],
    sessionFirst10: ['Primeros 10 minutos — ¡vas muy bien!', 'Ya llevas 10 min, buen arranque.'],
    sessionLeft10: ['Te faltan 10 minutos, ya lo tienes.', 'Últimos 10 — no te sueltes.'],
    sessionLeft5: ['5 minutos más y terminas.', 'Ya casi — 5 min para el final.'],
    sessionLeft1: ['Último minuto de todo el entrenamiento, ¡dale!', '1 minuto — termínalo fuerte.'],
  } as const;

  function pick(msgs: readonly string[]): string {
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  /** Mensajes de ánimo durante el entrenamiento — por hitos de tiempo del
   * bloque actual y de la sesión completa, cada uno una sola vez. Nunca
   * compite con una alerta real en curso (activeAlertLevel) ni se queda
   * pegado: usa el mismo banner de 'comment', breve y se quita solo. */
  function maybeMotivate(): void {
    if (activeAlertLevel) return;
    const iv = workout.intervals[currentIndex0];
    if (!iv) return;

    const fire = (key: string, title: string, detail = ''): true => {
      firedMotivation.add(key);
      showBanner('info', title, detail, 3200);
      return true;
    };

    const blockKey = (suffix: string) => `b${currentIndex0}-${suffix}`;
    if (iv.duration_s > 120 && currentTimeLeft === Math.round(iv.duration_s / 2) && !firedMotivation.has(blockKey('half'))) {
      fire(blockKey('half'), pick(MOTIVATION.blockHalfway));
      return;
    }
    if (iv.duration_s > 360 && currentTimeLeft === 300 && !firedMotivation.has(blockKey('left5'))) {
      fire(blockKey('left5'), pick(MOTIVATION.blockLeft5));
      return;
    }
    if (iv.duration_s > 90 && currentTimeLeft === 60 && !firedMotivation.has(blockKey('left1'))) {
      fire(blockKey('left1'), pick(MOTIVATION.blockLeft1));
      return;
    }

    const totalLeft = Math.round(plan.totalDuration - lastElapsedS);
    if (plan.totalDuration > 1200 && lastElapsedS === 600 && !firedMotivation.has('s-first10')) {
      fire('s-first10', pick(MOTIVATION.sessionFirst10));
      return;
    }
    if (plan.totalDuration > 1800 && lastElapsedS === Math.round(plan.totalDuration / 2) && !firedMotivation.has('s-half')) {
      const avgPower = Math.round(history.reduce((s, p) => s + p.power, 0) / history.length);
      const avgCadence = Math.round(history.reduce((s, p) => s + p.cadence, 0) / history.length);
      fire('s-half', 'Vas a la mitad del entrenamiento', `Promedio hasta aquí: ${avgPower} W · ${avgCadence} rpm`);
      return;
    }
    if (plan.totalDuration > 1200 && totalLeft === 600 && !firedMotivation.has('s-left10')) {
      fire('s-left10', pick(MOTIVATION.sessionLeft10));
      return;
    }
    if (totalLeft === 300 && !firedMotivation.has('s-left5')) {
      fire('s-left5', pick(MOTIVATION.sessionLeft5));
      return;
    }
    if (totalLeft === 60 && !firedMotivation.has('s-left1')) {
      fire('s-left1', pick(MOTIVATION.sessionLeft1));
      return;
    }
  }

  // "Continuar entrenamiento" desde Inicio: retoma un borrador en vez de
  // arrancar de 0. Se consume una sola vez (si esta pantalla se desmonta sin
  // llegar a pedalear, el borrador original sigue intacto en disco).
  let resumeAtS = 0;
  const resumeDraftId = appState.resumeDraftId;
  appState.resumeDraftId = null;
  if (resumeDraftId) {
    void getDraft(resumeDraftId).then((draft) => {
      if (!draft || draft.workoutId !== workout.id || draft.samples.length === 0) return;
      sessionId = draft.id;
      startedAt = new Date(draft.startedAt);
      history.push(...draft.samples);
      alerts.push(...draft.alerts);
      intensityChanges.push(...draft.intensityChanges);
      resumeAtS = draft.samples[draft.samples.length - 1].t + 1;
      currentIndex0 = intervalIndexAt(plan, resumeAtS);
      currentTimeLeft = workout.intervals[currentIndex0].duration_s - (resumeAtS - plan.segStart[currentIndex0]);
      $('elapsed').textContent = fmt(resumeAtS);
      paintBlockHeader();
      paintTimeline();
      paintLimitsPanel();
    });
  }

  // autosave: si la pestaña se cierra sola (el navegador la descarta por
  // memoria, se cae, etc.) esto es lo único que sobrevive — sin esto se
  // pierde el entrenamiento completo en vez de, como mucho, unos segundos.
  const DRAFT_SAVE_EVERY_TICKS = 5;
  let ticksSinceDraftSave = 0;
  function flushDraft(): void {
    // modo demo: "no se graba" tiene que ser cierto también para el
    // borrador — si no, Inicio ofrece "recuperar" una sesión demo que en
    // realidad nunca se quiso guardar.
    if (isDemo) return;
    void saveDraft({
      id: sessionId,
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: startedAt.toISOString(),
      ftp: appState.profile.ftp,
      samples: history,
      alerts,
      intensityChanges,
    });
  }
  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden' && !sessionFinished && history.length > 0) flushDraft();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  type LimitField = 'hr_min' | 'hr_ceiling' | 'cadence_min' | 'cadence_max';
  const LIMIT_ROWS: { label: string; blockKey: LimitField; globalKey: keyof Profile }[] = [
    { label: 'Pulso mín', blockKey: 'hr_min', globalKey: 'hr_min' },
    { label: 'Pulso techo', blockKey: 'hr_ceiling', globalKey: 'hr_ceiling' },
    { label: 'Cadencia mín', blockKey: 'cadence_min', globalKey: 'cadence_floor' },
    { label: 'Cadencia máx', blockKey: 'cadence_max', globalKey: 'cadence_max' },
  ];

  /** Reconstruye y aplica las reglas sin reiniciar la sesión — se llama tras
   * cualquier edición en vivo de límites (bloque o global). */
  function applyLiveRules(): void {
    engine.updateRules(buildRules());
    paintRulesList();
  }

  function paintLimitsPanel(): void {
    const iv = workout.intervals[currentIndex0];
    $('limitsPanel').innerHTML = `
      <div>Bloque actual: <b>${iv?.name ?? '—'}</b></div>
      <div class="grid-form" style="margin-top:8px">
        ${LIMIT_ROWS.map(
          (r) =>
            `<label>${r.label} (bloque)<input type="number" data-limit-block="${r.blockKey}" value="${iv?.[r.blockKey] ?? ''}" placeholder="sin límite"></label>`,
        ).join('')}
      </div>
      <div style="margin-top:12px">Global (perfil) — aplica donde el bloque no define lo suyo</div>
      <div class="grid-form" style="margin-top:8px">
        ${LIMIT_ROWS.map(
          (r) => `<label>${r.label} (global)<input type="number" data-limit-global="${r.globalKey}" value="${appState.profile[r.globalKey]}"></label>`,
        ).join('')}
      </div>
    `;
    $('limitsPanel').querySelectorAll<HTMLInputElement>('[data-limit-block]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.limitBlock as LimitField;
        const target = workout.intervals[currentIndex0];
        const raw = input.value.trim();
        if (raw === '') {
          delete target[key];
        } else {
          const v = Number(raw);
          if (Number.isFinite(v) && v > 0) target[key] = v;
        }
        applyLiveRules();
      });
    });
    $('limitsPanel').querySelectorAll<HTMLInputElement>('[data-limit-global]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.limitGlobal as keyof Profile;
        const v = Number(input.value);
        if (Number.isFinite(v)) {
          appState.profile = { ...appState.profile, [key]: v };
          appState.persistProfile();
          engine.updateProfile(appState.profile);
          applyLiveRules();
        }
      });
    });
  }
  paintLimitsPanel();

  /** Cabecera de zona + info de bloque — solo cambia al empezar un bloque
   * nuevo, no en cada tick. */
  function paintBlockHeader(): void {
    const iv = workout.intervals[currentIndex0];
    if (!iv) return;
    const z = powerZone(iv.power_pct);
    const color = zoneColor(z);
    $('zonePill').textContent = `Z${z} · ${ZONE_NAMES[z]}`;
    $('zonePill').style.background = color;
    $('zoneStrip').style.background = color;
    $('blockInfo').textContent = `Bloque ${currentIndex0 + 1} de ${workout.intervals.length} · ${iv.name}`;
  }

  /** Línea de tiempo del workout completo por zonas — hecho atenuado, bloque
   * actual al 100% con contorno, pendiente muy tenue. Ver TORQ_DESIGN.md.
   * El ancho de cada barra es proporcional a su duración (flex-grow), no
   * uno por uno igual — así coincide con el eje de tiempo de `draw()`, que
   * dibuja las líneas de potencia/cadencia/pulso encima en el mismo panel. */
  function paintTimeline(): void {
    $('timeline').innerHTML = workout.intervals
      .map((iv, i) => {
        const z = powerZone(iv.power_pct);
        // antes 0.45/0.18 — con zonas bajas (Z1 gris, Z2 azul) a esa opacidad
        // contra el fondo oscuro el color prácticamente no se notaba.
        const opacity = i < currentIndex0 ? 0.6 : i === currentIndex0 ? 1 : 0.35;
        const outline = i === currentIndex0 ? 'outline:2px solid var(--text);outline-offset:2px;' : '';
        return `<div class="live-timeline-bar" style="flex-grow:${iv.duration_s};height:${ZONE_HEIGHT_PCT[z]}%;background:${zoneColor(z)};opacity:${opacity};${outline}"></div>`;
      })
      .join('');
  }

  /** Banda de rango alrededor del objetivo con el marcador de potencia
   * actual — puramente visual (no dispara ninguna regla), ±8% del objetivo. */
  function paintRangeBar(power: number, target: number, color: string): void {
    const band = $('rangeBand');
    const marker = $('rangeMarker');
    if (target <= 0) {
      band.style.width = '0';
      marker.style.left = '0';
      return;
    }
    const domainMax = target * 1.5;
    const pct = (v: number) => Math.max(0, Math.min(100, (v / domainMax) * 100));
    const lowPct = pct(target * 0.92);
    const highPct = pct(target * 1.08);
    band.style.left = `${lowPct}%`;
    band.style.width = `${highPct - lowPct}%`;
    band.style.background = color;
    band.style.opacity = '0.35';
    marker.style.left = `${pct(power)}%`;
    marker.style.background = color;
  }

  function showBanner(kind: BannerKind, title: string, detail: string, holdMs: number | null): void {
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
    if (compactTimer) {
      clearTimeout(compactTimer);
      compactTimer = null;
    }
    $('banner').className = `live-message-overlay live-message-${kind} on`;
    $('bannerTitle').textContent = title;
    $('bannerDetail').textContent = detail;
    if (holdMs !== null) {
      bannerTimer = setTimeout(clearBanner, holdMs);
    } else if (kind === 'danger' || kind === 'adjust') {
      // sin tiempo fijo (sigue sin corregirse) — tras unos segundos se achica
      // a una franja delgada arriba en vez de tapar potencia y tiempo
      // restante todo el bloque; la urgencia inicial ya se vio (bug: se
      // quedaba tapando la pantalla entera mientras el problema seguía).
      compactTimer = setTimeout(() => $('banner').classList.add('compact'), 3500);
    }
  }

  function clearBanner(): void {
    if (bannerTimer) {
      clearTimeout(bannerTimer);
      bannerTimer = null;
    }
    if (compactTimer) {
      clearTimeout(compactTimer);
      compactTimer = null;
    }
    $('banner').classList.remove('on', 'compact');
  }

  function handleEvent(event: EngineEvent): void {
    switch (event.type) {
      case 'tick': {
        lastElapsedS = event.t;
        currentIndex0 = event.sample.interval_index;
        currentTimeLeft = event.metrics.time_left_interval ?? 0;
        history.push(event.sample);
        $('elapsed').textContent = fmt(event.t);

        const pwEl = $('pw');
        pwEl.textContent = String(event.sample.power);
        pwEl.classList.remove('empty');
        const z = powerZone(workout.intervals[currentIndex0]?.power_pct ?? 0);
        const zColor = zoneColor(z);
        $('tgt').textContent = String(event.sample.target);
        $('tgt').style.color = zColor;
        paintRangeBar(event.sample.power, event.sample.target, zColor);

        // promedio móvil de 10 s, no la lectura instantánea: el sensor de
        // cadencia tiene picos falsos (p.ej. "40" pedaleando estable a 70)
        // que con el número crudo se ven como si la cadencia se hubiera
        // caído de verdad.
        const cadEl = $('cad');
        cadEl.textContent = String(Math.round(event.metrics.cadence_10s ?? event.sample.cadence));
        cadEl.classList.remove('empty');
        const cadenceMin = workout.intervals[currentIndex0]?.cadence_min;
        // si el bloque no trae piso de cadencia, no se muestra esa parte —
        // nunca "· piso —".
        $('cadSub').textContent = cadenceMin !== undefined ? `rpm · piso ${cadenceMin}` : 'rpm';

        const hrEl = $('hr');
        hrEl.textContent = String(event.sample.hr);
        hrEl.classList.remove('empty');
        const hrPct = event.metrics.hr_pct_max ?? 0;
        const hz = hrPct < 60 ? 1 : hrPct < 70 ? 2 : hrPct < 80 ? 3 : hrPct < 90 ? 4 : 5;
        $('hrSub').textContent = `zona ${hz}`;
        $('hrSub').style.color = zoneColor(hz);

        const ivLeftEl = $('ivLeft');
        ivLeftEl.textContent = fmt(currentTimeLeft);
        ivLeftEl.classList.remove('empty');
        const next = workout.intervals[currentIndex0 + 1];
        if (next) {
          const nextTargetWatts = targetWattsAt(plan, plan.segStart[currentIndex0 + 1], appState.profile.ftp, engine.intensityPct / 100);
          $('ivNext').innerHTML = `Sigue: <b>${next.name}</b> · ${nextTargetWatts} W`;
        } else {
          $('ivNext').textContent = 'Sigue: fin del workout';
        }

        lastTargetWatts = event.sample.target;
        if (ergEnabled) trainer.setTarget(lastTargetWatts);
        draw();
        maybeMotivate();
        ticksSinceDraftSave++;
        if (ticksSinceDraftSave >= DRAFT_SAVE_EVERY_TICKS) {
          ticksSinceDraftSave = 0;
          flushDraft();
        }
        return;
      }
      case 'block-start': {
        $('count').classList.remove('on');
        cdShown = -1;
        beeper.play('go');
        // el evento 'tick' que actualiza currentIndex0 llega justo después de
        // este en el mismo lote — se adelanta acá para que la cabecera y el
        // panel de límites muestren el bloque nuevo desde ya, no el anterior.
        currentIndex0 = event.index1 - 1;
        paintBlockHeader();
        paintTimeline();
        paintLimitsPanel();
        showBanner('info', event.interval.name, `${event.targetWatts} W · ${event.interval.cadence_min ?? '—'}+ rpm`, 1800);
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
        showBanner('info', event.comment.message, event.comment.detail ?? '', 6000);
        return;
      }
      case 'rule': {
        $('count').classList.remove('on');
        cdShown = -1;
        const n = event.notification;
        if (n.kind === 'fire') {
          beeper.play(n.sound);
          const kind: BannerKind = n.level === 'danger' ? 'danger' : n.level === 'adjust' ? 'adjust' : 'info';
          // el banner de ajuste/peligro se queda hasta que se corrija (evento
          // 'recover' más abajo), no un tiempo fijo — así no desaparece solo
          // porque pasaron unos segundos aunque el problema siga.
          const holdMs = n.level === 'danger' || n.level === 'adjust' ? null : 2600;
          showBanner(kind, n.message, n.detail ?? '', holdMs);
          alerts.push({ t: lastElapsedS, level: n.level, message: n.message });
          activeAlertLevel = n.level === 'danger' || n.level === 'adjust' ? n.level : null;
        } else {
          beeper.play('tick');
          showBanner('info', n.message, '', 2200);
          activeAlertLevel = null;
        }
        return;
      }
      case 'paused': {
        // el loop de 1 Hz sigue corriendo: tick() es quien detecta que
        // volviste a pedalear y reanuda solo, aunque la pausa haya sido manual.
        $('btnMain').textContent = 'Continuar';
        showBanner('pause', 'Pausa', `ERG en reposo (${event.targetWatts} W) · espacio para continuar`, null);
        trainer.setTarget(event.targetWatts);
        return;
      }
      case 'resumed': {
        $('btnMain').textContent = 'Pausar';
        showBanner('info', 'Reanuda', '', 1200);
        return;
      }
      case 'finished': {
        finish();
        return;
      }
    }
  }

  async function finish(): Promise<void> {
    sessionFinished = true;
    stopPollLoop();
    stopAutoStartWatcher();
    wakeLock.release();

    // modo demo ("Probar sin rodillo" en Antes de empezar): nunca se graba,
    // ni local ni en la nube — ver TORQ_DESIGN.md, bug #1.
    if (isDemo) {
      appState.demoSession = false;
      void clearDraft(sessionId);
      showBanner('info', 'Terminado', 'Modo demo: no se guardó nada.', 1800);
      navigate('home');
      return;
    }

    showBanner('info', 'Terminado', 'Guardando sesión…', null);
    const record: SessionRecord = {
      id: sessionId,
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
    void clearDraft(sessionId);
    appState.lastSession = record;
    appState.lastCloudSession = null;
    // en segundo plano: la sesión ya quedó guardada local, no hay que
    // esperar a la nube (ni bloquear si no hay internet) para navegar.
    if (appState.user) void pushSessionToCloud(record, appState.profile, appState.user.id);
    appState.justFinishedSession = true;
    navigate('session');
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
    b.className = `live-intensity-value num${pct < 100 ? ' down' : ''}`;
    beeper.play('tick');
    intensityChanges.push({ t: lastElapsedS, pct });
    if (engine.currentState === 'running') showBanner('info', `Intensidad ${pct}%`, 'se guarda en el registro', 1600);
  }

  let resistancePercent = 30;

  function paintResistance(): void {
    const b = $('bias');
    b.textContent = `R ${Math.round(resistancePercent)}%`;
    b.className = 'live-intensity-value num';
  }

  /** Con ERG activo, +/- ajustan la intensidad del objetivo en watts. Con
   * ERG apagado, ajustan directamente el nivel de resistencia fija —
   * dejar de mandar setTarget no basta para "soltar" el rodillo (se queda
   * pegado al último objetivo para siempre), así que sin esto no había
   * ninguna forma de hacerlo más fácil/difícil una vez apagado el ERG. */
  function adjustIntensity(deltaPct: number): void {
    if (ergEnabled) {
      paintBias(engine.adjustIntensityPct(deltaPct));
      return;
    }
    resistancePercent = Math.min(100, Math.max(0, resistancePercent + deltaPct));
    trainer.setResistance(resistancePercent);
    paintResistance();
    beeper.play('tick');
  }

  $('bMinus').addEventListener('click', () => adjustIntensity(-5));
  $('bPlus').addEventListener('click', () => adjustIntensity(5));

  function closeMenu(): void {
    $('menu').classList.remove('on');
  }

  $('menuBtn').addEventListener('click', () => $('menu').classList.toggle('on'));

  function onDocClick(e: MouseEvent): void {
    if (!$('menuWrap').contains(e.target as Node)) closeMenu();
  }
  document.addEventListener('click', onDocClick);

  $('menuErg').addEventListener('click', () => {
    closeMenu();
    ergEnabled = !ergEnabled;
    $('menuErg').textContent = `ERG: ${ergEnabled ? 'activado' : 'desactivado'}`;
    if (ergEnabled) {
      // al reactivarlo, vuelve a mandar el objetivo actual de inmediato en
      // vez de esperar al próximo tick para que el rodillo enganche ya
      trainer.setTarget(lastTargetWatts);
      // repinta el % de intensidad sin pasar por paintBias: esa función
      // también registra un ajuste de intensidad y no queremos un renglón
      // falso en el historial solo por haber prendido el ERG de nuevo
      const pct = engine.intensityPct;
      const b = $('bias');
      b.textContent = `${pct}%`;
      b.className = `live-intensity-value num${pct < 100 ? ' down' : ''}`;
    } else {
      // sin esto el rodillo se queda pegado al último objetivo en watts
      // para siempre — no basta con dejar de mandarle setTarget.
      trainer.setResistance(resistancePercent);
      paintResistance();
    }
    showBanner(
      'info',
      `ERG ${ergEnabled ? 'activado' : 'desactivado'}`,
      ergEnabled ? '' : `resistencia fija ${resistancePercent}% · ajusta con +/- (no verificado en hardware real)`,
      2200,
    );
  });

  $('menuFtp').addEventListener('click', () => {
    closeMenu();
    const raw = window.prompt('Nuevo FTP (W):', String(appState.profile.ftp));
    if (raw === null) return;
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    appState.profile = { ...appState.profile, ftp: v };
    appState.persistProfile();
    engine.updateProfile(appState.profile);
    $('menuFtp').textContent = `FTP: ${v} W`;
    showBanner('info', 'FTP actualizado', `${v} W`, 1600);
  });

  $('menuRules').addEventListener('click', () => {
    closeMenu();
    $('rules').classList.toggle('on');
  });

  $('menuLimits').addEventListener('click', () => {
    closeMenu();
    $('limits').classList.toggle('on');
  });

  $('menuFinish').addEventListener('click', () => {
    closeMenu();
    if (engine.currentState === 'idle' || engine.currentState === 'finished') return;
    if (!window.confirm('¿Terminar el entrenamiento y guardar la sesión?')) return;
    finish();
  });

  // "Salir sin guardar" pierde toda la sesión sin vuelta atrás, y vive junto
  // a "Terminar y guardar" (la acción buena, la que se usa todo el tiempo) —
  // un solo tap mal puesto ahí sería carísimo. En vez de un window.confirm
  // (que el reflejo de "aceptar todo" salta sin leer), exige mantener
  // presionado: un toque accidental nunca dura lo suficiente.
  const DISCARD_HOLD_MS = 1400;
  let discardHoldTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelDiscardHold(): void {
    if (discardHoldTimer) {
      clearTimeout(discardHoldTimer);
      discardHoldTimer = null;
    }
    document.getElementById('menuDiscard')?.classList.remove('holding');
  }

  function runDiscard(): void {
    closeMenu();
    sessionFinished = true; // evita que el cleanup del desmontaje autoguarde un draft
    stopPollLoop();
    stopAutoStartWatcher();
    wakeLock.release();
    void clearDraft(sessionId);
    navigate('home');
  }

  $('menuDiscard').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (engine.currentState === 'idle') {
      runDiscard();
      return;
    }
    $('menuDiscard').classList.add('holding');
    discardHoldTimer = setTimeout(() => {
      discardHoldTimer = null;
      runDiscard();
    }, DISCARD_HOLD_MS);
  });
  $('menuDiscard').addEventListener('pointerup', cancelDiscardHold);
  $('menuDiscard').addEventListener('pointerleave', cancelDiscardHold);
  $('menuDiscard').addEventListener('pointercancel', cancelDiscardHold);
  window.addEventListener('blur', cancelDiscardHold);

  function toggleRun(): void {
    if (engine.currentState === 'idle') {
      stopAutoStartWatcher();
      beeper.unlock();
      wakeLock.acquire();
      $('btnMain').textContent = 'Pausar';
      engine.start(resumeAtS).forEach(handleEvent);
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

  paintBlockHeader();
  paintTimeline();
  draw();

  return () => {
    // si se navega fuera de Entrenar sin terminar (o sin haber llegado a
    // pedalear), el draft que haya en disco queda como está — Inicio lo
    // ofrece recuperar la próxima vez que se cargue la app.
    if (!sessionFinished && history.length > 0) flushDraft();
    stopPollLoop();
    stopAutoStartWatcher();
    wakeLock.release();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', draw);
    window.removeEventListener('blur', cancelDiscardHold);
    cancelDiscardHold();
    unsubTrainerState();
    unsubHrState?.();
    unsubTrainerReading();
    unsubHrReading?.();
    if (bannerTimer) clearTimeout(bannerTimer);
  };
}
