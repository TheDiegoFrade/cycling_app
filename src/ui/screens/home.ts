import type { Workout } from '../../core/types';
import { validateWorkout } from '../../core/validator';
import { estimateWorkout } from '../../core/workout-estimate';
import { WORKOUT_TEMPLATES, findTemplate } from '../../core/workout-templates';
import { computeSessionAnalytics } from '../../engine/analytics';
import { isBikeSession } from '../../core/session-kind';
import { clearDraft, listDrafts } from '../../storage/session-draft';
import { listSessions, saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { saveWorkout } from '../../storage/workout-store';
import { downloadSessionSamples, pushSessionToCloud } from '../../sync/cloud-sync';
import { pushWorkoutToCloud } from '../../sync/workout-sync';
import { navigate, refresh } from '../router';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';
import { tokenForIntervals, tokenForTemplate, tokenForWorkout, tokenHtml } from '../workout-token';
import { montanasVideoHtml } from '../montanas-video';
import { maybeCelebrateWeek } from '../pinon';
import type { Token } from '../workout-token';
import { isNonBikeKind } from '../../core/session-kind';
import { wireDatePicker } from '../date-picker';
import { isSupabaseConfigured } from '../../supabase/client';
import { isCoachProfileComplete, openOnboardingForm } from '../onboarding';
import { fmtMinutes, tipRow, tipTitle } from '../chart-hover';
import { ZONE_NAMES } from '../../core/zones';
import type { PowerZone } from '../../core/zones';
import { dayKeyOf } from '../../core/day-key';

const DAY_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']; // índice = Date#getDay()
const MONTH_NAMES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function errorsHtml(errors: string[]): string {
  if (errors.length === 0) return '';
  return `<div class="error-box"><strong>${errors.length} error(es):</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
}

function fmtDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** h:mm — no confundir con fmtDuration (m:ss), que es para la duración corta
 * de un borrador recién cortado, no para el total de horas de la semana. */
function fmtHours(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${m < 10 ? '0' : ''}${m}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  const mondayOffset = (s.getDay() + 6) % 7; // 0 = lunes
  s.setDate(s.getDate() - mondayOffset);
  return s;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function displayName(): string {
  if (appState.profile.name) return appState.profile.name.split(' ')[0];
  const email = appState.user?.email;
  if (!email) return '';
  const local = email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function renderHome(container: HTMLElement): void {
  const today = new Date();
  const todayKey = toDateKey(today);
  const name = displayName();
  const initial = (appState.user?.email ?? '?').charAt(0).toUpperCase();

  // Hoy puede tener hasta 2 agendados (ver MAX_PER_DAY en calendar.ts) — se
  // muestran los dos, cada uno con su propio botón de play, en vez de
  // asumir que solo puede haber uno.
  const todayWorkouts = appState.workouts.filter((w) => w.scheduledDate === todayKey);
  const nextWorkout =
    todayWorkouts.length > 0
      ? null
      : appState.workouts
          .filter((w): w is Workout & { scheduledDate: string } => Boolean(w.scheduledDate) && w.scheduledDate! > todayKey)
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];

  // Zona que se lee en la meta del hero («65 min · 74–86 W · Z2»).
  const TOKEN_ZONE: Record<Token, string> = { rec: 'Z1', end: 'Z2', ss: 'Z3', ftp: 'Z4', vo2: 'Z5', moon: '', fuerza: '' };

  function metaFor(w: Workout): string {
    const est = estimateWorkout(w.intervals, appState.profile.ftp);
    const [low, high] = est.wattsRange;
    const wattsLabel = low === high ? `${low} W` : `${low}–${high} W`;
    const zone = TOKEN_ZONE[tokenForWorkout(w)];
    return [`${Math.round(est.durationS / 60)} min`, wattsLabel, zone, `${est.tss ?? '—'} TSS`].filter(Boolean).join(' · ');
  }

  /** Lo que está conectado, debajo del botón de rodar. */
  function sensorsHint(): string {
    const trainerOn = appState.trainer?.state === 'connected';
    const hrOn = appState.hr?.state === 'connected';
    if (trainerOn && hrOn) return 'Rodillo y pulso conectados';
    if (trainerOn) return 'Rodillo conectado';
    return 'Rodillo sin conectar · se conecta en el siguiente paso';
  }

  const PLAY_ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="M6 4v16l14-8z" fill="currentColor"></path></svg>';

  /** Botón de rodar: hace lo mismo que el ▶ de antes (Antes de empezar con
   * ese workout). */
  function rideBtn(w: Workout, label = 'Empezar a rodar', small = false): string {
    return `<button type="button" class="home-ride-btn${small ? ' small' : ''}" data-ride-id="${w.id}">${PLAY_ICON}<span>${label}</span></button>`;
  }

  function heroTitle(text: string, token: Token): string {
    // Los nombres del coach o importados son largos: bajan de tamaño para no partir palabras.
    const size = text.length > 22 ? ' long' : text.length > 9 ? ' mid' : '';
    return `<div class="home-scene-titlerow"><h1 class="home-scene-title${size}">${escapeHtml(text)}</h1>${tokenHtml(token, 76, 'bob')}</div>`;
  }

  function heroContentHtml(): string {
    const hello = `${greeting()}${name ? `, ${escapeHtml(name)}` : ''}`;
    if (todayWorkouts.length > 1) {
      // Hoy puede tener hasta 2 agendados (MAX_PER_DAY en calendar.ts): cada uno con su botón.
      return `
        <span class="home-scene-hello">${hello} · hoy toca, elige uno</span>
        <div class="home-scene-choices">
          ${todayWorkouts
            .map(
              (w) => `
            <div class="home-scene-choice">
              ${tokenHtml(tokenForWorkout(w), 56)}
              <div class="home-scene-choice-text">
                <span class="home-scene-choice-name">${escapeHtml(w.name)}</span>
                <span class="home-scene-meta">${metaFor(w)}</span>
              </div>
              ${rideBtn(w, 'Rodar', true)}
            </div>`,
            )
            .join('')}
        </div>
        <span class="home-scene-hint">${sensorsHint()}</span>`;
    }
    const w = todayWorkouts[0] ?? nextWorkout;
    if (!w) {
      return `
        <span class="home-scene-hello">${hello} · hoy toca</span>
        ${heroTitle('Nada agendado', 'moon')}
        <span class="home-scene-meta">Elige o agenda un workout en Plan para verlo aquí.</span>
        <div class="home-scene-cta"><a href="#/plan" class="home-ride-btn">Ir a Plan</a></div>`;
    }
    const label = todayWorkouts.length ? `${hello} · hoy toca` : `${hello} · agendado · ${w.scheduledDate}`;
    return `
      <span class="home-scene-hello">${label}</span>
      ${heroTitle(w.name, tokenForWorkout(w))}
      <span class="home-scene-meta">${metaFor(w)}</span>
      <div class="home-scene-cta">
        ${rideBtn(w)}
        <span class="home-scene-hint">${sensorsHint()}</span>
      </div>`;
  }

  function heroCardHtml(): string {
    return `
      <section class="home-scene" aria-label="Hoy toca" data-pinon-perch>
        ${montanasVideoHtml('home-scene-img')}
        <div class="home-scene-shade" aria-hidden="true"></div>
        <a href="#/profile" class="perfil-avatar perfil-avatar-link home-scene-avatar" aria-label="Ir a tu perfil" title="Tu perfil">${initial}</a>
        <div class="home-scene-col">${heroContentHtml()}</div>
      </section>`;
  }

  const needsOnboarding = isSupabaseConfigured() && !!appState.user && !isCoachProfileComplete(appState.profile);

  container.innerHTML = `
    <div class="screen home-screen">
      <div id="draft-recovery"></div>

      ${
        needsOnboarding
          ? `<div class="recovery-banner">
              <p><strong>Te falta el cuestionario del coach</strong> — lo necesitas para que el coach pueda crear tu plan de entrenamiento.</p>
              <div class="row-actions"><button class="primary" id="home-open-onboarding">Contestarlo ahora</button></div>
            </div>`
          : ''
      }

      ${heroCardHtml()}

      <section class="home-week" id="week-card" aria-label="Esta semana">
        <a href="#/plan" class="home-week-summary">
          <span class="home-week-kicker">Esta semana</span>
          <span class="home-week-big"><span class="num" id="week-count">—</span> <span class="home-week-unit">entrenamientos</span></span>
          <span class="home-week-sub"><span class="num" id="week-hours">0:00</span> h · <span class="num" id="week-tss">0</span> TSS</span>
          <span class="home-week-link">ver plan →</span>
        </a>
        <div class="home-week-tiles-wrap" data-pinon-perch><div class="home-week-tiles" id="week-days"></div></div>
        <div class="home-week-zones">
          <div class="live-col-label" style="margin-bottom:8px">Tiempo por zona</div>
          <div class="home-week-zonebar" id="week-zonebar"></div>
        </div>
      </section>

      <div class="panel home-generate">
        <h2 class="perfil-h2" style="margin:0">Generar workout</h2>
        <p class="hint" style="margin:4px 0 0">Créalo y entrena ahora mismo — también queda guardado en tu Plan.</p>
        <div class="home-gen-cards" id="gen-chips" role="radiogroup" aria-label="Tipo de workout">
          ${WORKOUT_TEMPLATES.map(
            (t, i) =>
              `<button type="button" role="radio" aria-checked="${i === 0}" class="home-gen-card lift${i === 0 ? ' on' : ''}" data-template="${t.id}">${tokenHtml(tokenForTemplate(t.id) ?? 'end', 54)}<span>${t.name}</span></button>`,
          ).join('')}
        </div>
        <label class="live-col-label">Duración<input type="number" id="gen-minutes" value="${WORKOUT_TEMPLATES[0].defaultMinutes}" min="${WORKOUT_TEMPLATES[0].minMinutes}" max="${WORKOUT_TEMPLATES[0].maxMinutes}"></label>
        <p class="hint" id="gen-description">${WORKOUT_TEMPLATES[0].description}</p>
        <div class="home-generate-when">
          <label class="home-generate-radio"><input type="radio" name="gen-when" value="now" checked> Ahora mismo</label>
          <label class="home-generate-radio"><input type="radio" name="gen-when" value="later"> Otra fecha</label>
          <input type="date" id="gen-date" value="${todayKey}" style="display:none">
        </div>
        <button class="btn-light" id="gen-create">Generar y entrenar</button>
        <div id="gen-errors"></div>
      </div>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('[data-ride-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.selectedWorkoutId = btn.dataset.rideId!;
      navigate('prepare');
    });
  });

  container.querySelector('#home-open-onboarding')?.addEventListener('click', () => {
    openOnboardingForm(() => refresh(), true);
  });

  function wireGenerate(): void {
    const chips = container.querySelectorAll<HTMLButtonElement>('.home-gen-card');
    const minutesInput = container.querySelector<HTMLInputElement>('#gen-minutes')!;
    const description = container.querySelector<HTMLElement>('#gen-description')!;
    const genErrors = container.querySelector<HTMLElement>('#gen-errors')!;
    const whenRadios = container.querySelectorAll<HTMLInputElement>('input[name="gen-when"]');
    const dateInput = container.querySelector<HTMLInputElement>('#gen-date')!;
    wireDatePicker(dateInput);
    const dateWrapper = dateInput.closest<HTMLElement>('.date-picker')!;
    const submitBtn = container.querySelector<HTMLButtonElement>('#gen-create')!;

    function isLater(): boolean {
      return container.querySelector<HTMLInputElement>('input[name="gen-when"]:checked')?.value === 'later';
    }
    function updateWhenUI(): void {
      const later = isLater();
      dateWrapper.style.display = later ? '' : 'none';
      submitBtn.textContent = later ? 'Generar y agendar' : 'Generar y entrenar';
    }
    whenRadios.forEach((r) => r.addEventListener('change', updateWhenUI));

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => {
          c.classList.remove('on');
          c.setAttribute('aria-checked', 'false');
        });
        chip.classList.add('on');
        chip.setAttribute('aria-checked', 'true');
        const t = findTemplate(chip.dataset.template!);
        if (!t) return;
        minutesInput.min = String(t.minMinutes);
        minutesInput.max = String(t.maxMinutes);
        minutesInput.value = String(t.defaultMinutes);
        description.textContent = t.description;
      });
    });

    container.querySelector('#gen-create')?.addEventListener('click', async () => {
      const activeChip = container.querySelector<HTMLButtonElement>('.home-gen-card.on');
      const t = findTemplate(activeChip?.dataset.template ?? WORKOUT_TEMPLATES[0].id);
      if (!t) return;
      const minutes = Math.round(Number(minutesInput.value));
      if (!Number.isFinite(minutes) || minutes < t.minMinutes || minutes > t.maxMinutes) {
        genErrors.innerHTML = errorsHtml([`Minutos fuera de rango para "${t.name}": entre ${t.minMinutes} y ${t.maxMinutes}.`]);
        return;
      }
      const later = isLater();
      const scheduledDate = later ? dateInput.value : todayKey;
      const dateObj = new Date(`${scheduledDate}T00:00:00`);
      if (later && (!scheduledDate || Number.isNaN(dateObj.getTime()))) {
        genErrors.innerHTML = errorsHtml(['Elige una fecha válida.']);
        return;
      }
      const workout: Workout = {
        format_version: 1,
        id: crypto.randomUUID(),
        name: `${t.name} · ${minutes} min · ${dateObj.getDate()} ${MONTH_NAMES_SHORT[dateObj.getMonth()]}`,
        intervals: t.build(minutes),
        created_at: new Date().toISOString(),
        scheduledDate,
      };
      const result = validateWorkout(workout);
      genErrors.innerHTML = errorsHtml(result.errors);
      if (!result.valid) return;
      await saveWorkout(workout);
      if (appState.user) void pushWorkoutToCloud(workout, appState.user.id);
      appState.workouts = [...appState.workouts, workout];
      if (later) {
        // se queda en Inicio — ya se agregó a Plan, no hay nada que entrenar
        // todavía. Refresh completo (no solo paintWeek) por si la fecha
        // elegida es hoy y debe aparecer en "Hoy toca".
        refresh();
      } else {
        appState.selectedWorkoutId = workout.id;
        navigate('prepare');
      }
    });

    updateWhenUI();
  }
  wireGenerate();

  /** "Esta semana" necesita las sesiones reales (async, IndexedDB) — se
   * pinta con ceros primero y se reconcilia en cuanto cargan, mismo patrón
   * que el resto de la app. */
  async function paintWeek(): Promise<void> {
    const sessions = await listSessions();
    const weekStart = startOfWeek(today);
    const weekStartKey = toDateKey(weekStart);
    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setDate(weekEndExclusive.getDate() + 7);

    // "Esta semana" es de bici (horas, TSS, zonas) — fuerza/movilidad van
    // con sRPE aparte, nunca se suman aquí (ver core/session-kind.ts).
    const weekSessions = sessions.filter(isBikeSession).filter((s) => {
      const key = dayKeyOf(s.startedAt);
      return key >= weekStartKey && key < toDateKey(weekEndExclusive);
    });

    let totalSeconds = 0;
    let totalTss = 0;
    const zoneSeconds = [0, 0, 0, 0, 0, 0];
    const minutesByDay = new Map<string, number>();
    const tssByDay = new Map<string, number>();
    // Objeto de cada día hecho: el del workout que se entrenó o, si fue libre,
    // el de su intensidad (IF), y la bolita de fuerza para lo que no es bici.
    const doneTokenByDay = new Map<string, Token>();
    const workoutById = new Map(appState.workouts.map((w) => [w.id, w]));
    const doneToken = (workoutId: string | null | undefined, intensityFactor: number | null | undefined): Token => {
      const w = workoutId ? workoutById.get(workoutId) : undefined;
      if (w) return tokenForWorkout(w);
      return tokenForIntervals([{ name: 'libre', type: 'steady', power_pct: Math.round((intensityFactor ?? 0.65) * 100), duration_s: 600 }]);
    };
    weekSessions.forEach((s: SessionRecord) => {
      const analytics = computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp });
      if (!doneTokenByDay.has(dayKeyOf(s.startedAt))) doneTokenByDay.set(dayKeyOf(s.startedAt), doneToken(s.workoutId, analytics.intensityFactor));
      totalSeconds += s.samples.length;
      totalTss += analytics.trainingStressScore ?? 0;
      analytics.powerZoneSeconds.forEach((z, i) => (zoneSeconds[i] += z.seconds));
      const key = dayKeyOf(s.startedAt);
      minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + s.samples.length / 60);
      tssByDay.set(key, (tssByDay.get(key) ?? 0) + (analytics.trainingStressScore ?? 0));
    });

    // Sesiones grabadas en OTRO dispositivo (o importadas ahí) que nunca
    // llegaron a este IndexedDB — solo tenemos el resumen, no las samples;
    // sin esto "Esta semana" se queda corto tras entrenar desde el celular.
    const localIds = new Set(sessions.map((s) => s.id));
    const cloudOnlyThisWeek = appState.cloudSessions.filter((s) => !localIds.has(s.id) && isBikeSession(s)).filter((s) => {
      const key = dayKeyOf(s.startedAt);
      return key >= weekStartKey && key < toDateKey(weekEndExclusive);
    });
    cloudOnlyThisWeek.forEach((s) => {
      if (!doneTokenByDay.has(dayKeyOf(s.startedAt))) doneTokenByDay.set(dayKeyOf(s.startedAt), doneToken(s.workoutId, s.intensityFactor));
      const durationS = Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
      totalSeconds += durationS;
      totalTss += s.trainingStressScore ?? 0;
      const key = dayKeyOf(s.startedAt);
      minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + durationS / 60);
      tssByDay.set(key, (tssByDay.get(key) ?? 0) + (s.trainingStressScore ?? 0));
    });

    // El desglose por zona sí necesita las samples segundo a segundo — para
    // estas sesiones solo viven en el .fit que se guardó en Storage al subir
    // la sesión (ver pushSessionToCloud), así que se descarga y decodifica
    // bajo demanda. Son pocas sesiones (solo las de esta semana), así que
    // bajarlas al vuelo sale más barato que guardar un agregado nuevo.
    await Promise.all(
      cloudOnlyThisWeek.map(async (s) => {
        if (!s.fitPath) return;
        const samples = await downloadSessionSamples(s.fitPath).catch(() => null);
        if (!samples) return;
        const analytics = computeSessionAnalytics(samples, { ...appState.profile, ftp: s.ftp });
        analytics.powerZoneSeconds.forEach((z, i) => (zoneSeconds[i] += z.seconds));
      }),
    );

    // "Entrenamientos esta semana" = sesiones ya completadas (agendadas o no
    // — Diego no siempre agenda primero) + lo agendado que todavía no se
    // entrena. Sumar ambos evita que agendado y completado compitan como dos
    // números separados: completados 2 + agendado pendiente 2 = "2/4", no
    // "0/2" (que ignoraría lo ya hecho) ni "2" a secas (que ignoraría lo
    // agendado pendiente).
    const completedThisWeek = weekSessions.length + cloudOnlyThisWeek.length;
    const scheduledPendingThisWeek = appState.workouts.filter(
      (w) => w.scheduledDate && w.scheduledDate >= weekStartKey && w.scheduledDate < toDateKey(weekEndExclusive) && !minutesByDay.has(w.scheduledDate),
    ).length;
    const totalThisWeek = completedThisWeek + scheduledPendingThisWeek;

    // Semana cerrada: todo lo agendado de esta semana ya se entrenó. Piñón lo
    // celebra una sola vez por semana (ver ui/pinon.ts).
    const scheduledThisWeek = appState.workouts.filter((w) => w.scheduledDate && w.scheduledDate >= weekStartKey && w.scheduledDate < toDateKey(weekEndExclusive));
    const scheduledDone = scheduledThisWeek.filter((w) => minutesByDay.has(w.scheduledDate!)).length;
    if (container.isConnected) maybeCelebrateWeek(scheduledDone, scheduledThisWeek.length, weekStartKey);

    container.querySelector('#week-hours')!.textContent = fmtHours(totalSeconds);
    container.querySelector('#week-tss')!.textContent = String(Math.round(totalTss));
    container.querySelector('#week-count')!.textContent = totalThisWeek > 0 ? `${completedThisWeek}/${totalThisWeek}` : '—';

    const zoneTotal = zoneSeconds.reduce((a, b) => a + b, 0) || 1;
    container.querySelector('#week-zonebar')!.innerHTML = zoneSeconds
      .map((secs, i) => {
        if (secs <= 0) return '';
        const zone = (i + 1) as PowerZone;
        const tip = tipTitle(`Z${zone} · ${ZONE_NAMES[zone]}`) + tipRow('Tiempo', fmtMinutes(secs), `var(--z${zone})`) + tipRow('Del total', `${Math.round((secs / zoneTotal) * 100)}%`);
        return `<div style="width:${(secs / zoneTotal) * 100}%;background:var(--z${zone})" data-tip="${escapeHtml(tip)}"></div>`;
      })
      .join('');

    // Fuerza, movilidad, correr… registrados esa semana (no suman a horas ni TSS).
    const inWeek = (key: string) => key >= weekStartKey && key < toDateKey(weekEndExclusive);
    const nonBikeDays = new Set([
      ...sessions.filter((x) => isNonBikeKind(x.kind) && inWeek(dayKeyOf(x.startedAt))).map((x) => dayKeyOf(x.startedAt)),
      ...appState.cloudSessions.filter((x) => !localIds.has(x.id) && isNonBikeKind(x.kind) && inWeek(dayKeyOf(x.startedAt))).map((x) => dayKeyOf(x.startedAt)),
    ]);

    const daysHtml: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const key = toDateKey(d);
      const isToday = key === todayKey;
      const minutes = minutesByDay.get(key) ?? 0;
      const dayTss = Math.round(tssByDay.get(key) ?? 0);
      const planned = appState.workouts.find((w) => w.scheduledDate === key);
      const done = minutes > 0 || nonBikeDays.has(key);
      const token: Token = doneTokenByDay.get(key) ?? (planned ? tokenForWorkout(planned) : nonBikeDays.has(key) ? 'fuerza' : 'moon');
      const dayName = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' });
      const what = done ? 'hecho' : planned ? planned.name : key > todayKey || isToday ? 'sin nada agendado' : 'descanso';
      const dayTip =
        tipTitle(dayName.charAt(0).toUpperCase() + dayName.slice(1)) +
        (minutes > 0 ? tipRow('Tiempo', fmtMinutes(minutes * 60)) + tipRow('TSS', String(dayTss)) : tipRow(planned && !done ? 'Agendado' : key > todayKey ? 'Pendiente' : 'Descanso', planned && !done ? escapeHtml(planned.name) : '—'));
      daysHtml.push(`
        <a href="#/plan" class="home-week-tile lift${isToday ? ' today' : ''}${token === 'moon' ? ' rest' : ''}" data-tip="${escapeHtml(dayTip)}" aria-label="${escapeHtml(`${dayName}: ${what}`)}">
          <span class="home-week-tile-day">${isToday ? 'HOY' : DAY_SHORT[d.getDay()]}</span>
          ${tokenHtml(token, 46)}
          ${done ? '<span class="home-week-tile-check" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0B0D1A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg></span>' : ''}
        </a>`);
    }
    container.querySelector('#week-days')!.innerHTML = daysHtml.join('');
  }

  void paintWeek();

  /** Si un entrenamiento se cortó a medias (la pestaña se cerró sola, un
   * crash, etc.), lo ofrece recuperar en vez de perderlo en silencio — ver
   * el autosave en train.ts. */
  async function checkDraftRecovery(): Promise<void> {
    const slot = container.querySelector<HTMLElement>('#draft-recovery');
    if (!slot) return;
    const drafts = await listDrafts();
    if (drafts.length === 0) {
      slot.innerHTML = '';
      return;
    }
    slot.innerHTML = drafts
      .map((d) => {
        const duration = d.samples.length ? d.samples[d.samples.length - 1].t : 0;
        const canResume = appState.workouts.some((w) => w.id === d.workoutId);
        return `
          <div class="recovery-banner" data-draft-id="${d.id}">
            <p><strong>Se cortó un entrenamiento sin guardar:</strong> "${d.workoutName}" — ${fmtDuration(duration)} grabados.</p>
            <div class="row-actions">
              ${canResume ? `<button class="primary" data-action="continue-draft" data-draft-id="${d.id}">Continuar entrenamiento</button>` : ''}
              <button data-action="recover" data-draft-id="${d.id}">Guardar como sesión</button>
              <button data-action="discard-draft" data-draft-id="${d.id}">Descartar</button>
            </div>
          </div>`;
      })
      .join('');
    slot.querySelectorAll<HTMLButtonElement>('[data-action="continue-draft"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const draft = drafts.find((d) => d.id === btn.dataset.draftId);
        if (!draft) return;
        appState.selectedWorkoutId = draft.workoutId;
        appState.resumeDraftId = draft.id;
        navigate('prepare');
      });
    });
    slot.querySelectorAll<HTMLButtonElement>('[data-action="recover"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const draft = drafts.find((d) => d.id === btn.dataset.draftId);
        if (!draft) return;
        btn.disabled = true;
        btn.textContent = 'Guardando…';
        const record: SessionRecord = {
          ...draft,
          finishedAt: new Date().toISOString(),
          source: 'torq',
          kind: 'bike_indoor',
        };
        await saveSession(record);
        await clearDraft(draft.id);
        if (appState.user) void pushSessionToCloud(record, appState.profile, appState.user.id);
        checkDraftRecovery();
      });
    });
    slot.querySelectorAll<HTMLButtonElement>('[data-action="discard-draft"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.draftId!;
        if (!confirm('¿Descartar este entrenamiento sin guardar? No se puede deshacer.')) return;
        await clearDraft(id);
        checkDraftRecovery();
      });
    });
  }

  void checkDraftRecovery();
}
