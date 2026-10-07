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
import { escapeHtml, renderWorkoutCover } from '../workout-cover';
import { wireDatePicker } from '../date-picker';
import { isSupabaseConfigured } from '../../supabase/client';
import { isCoachProfileComplete, openOnboardingForm } from '../onboarding';

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // índice = Date#getDay()
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

  function heroCardFor(w: Workout, label: string): string {
    const est = estimateWorkout(w.intervals, appState.profile.ftp);
    const [low, high] = est.wattsRange;
    const wattsLabel = low === high ? `${low} W` : `${low}–${high} W`;
    return `
      <div class="home-hero-card home-hero-clickable" data-workout-id="${w.id}">
        ${renderWorkoutCover(w.intervals, 'lg')}
        <div class="home-hero-body">
          <div>
            <div class="live-col-label">${label}</div>
            <div class="home-hero-title">${escapeHtml(w.name)}</div>
            <div class="hint">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS · a ${wattsLabel}</div>
          </div>
          <button class="home-play-btn" aria-label="Empezar">▶</button>
        </div>
      </div>`;
  }

  function heroCardHtml(): string {
    if (todayWorkouts.length > 0) {
      const label = todayWorkouts.length > 1 ? 'Hoy toca — elige uno' : 'Hoy toca';
      return todayWorkouts.map((w) => heroCardFor(w, label)).join('');
    }
    if (!nextWorkout) {
      return `
        <div class="home-hero-card home-hero-empty">
          <div class="live-col-label">Hoy toca</div>
          <div class="home-hero-title">Nada agendado</div>
          <p class="hint">Elige o agenda un workout en Plan para verlo aquí.</p>
          <a href="#/plan" class="prepare-link">Ir a Plan</a>
        </div>`;
    }
    return heroCardFor(nextWorkout, `Agendado · ${nextWorkout.scheduledDate}`);
  }

  const needsOnboarding = isSupabaseConfigured() && !!appState.user && !isCoachProfileComplete(appState.profile);

  container.innerHTML = `
    <div class="screen home-screen">
      <div id="draft-recovery"></div>
      <div class="home-topline">
        <h1>${greeting()}${name ? `, ${name}` : ''}</h1>
        <div class="perfil-avatar">${initial}</div>
      </div>

      ${
        needsOnboarding
          ? `<div class="recovery-banner">
              <p><strong>Te falta el cuestionario del coach</strong> — lo necesitas para que el coach pueda crear tu plan de entrenamiento.</p>
              <div class="row-actions"><button class="primary" id="home-open-onboarding">Contestarlo ahora</button></div>
            </div>`
          : ''
      }

      <div class="home-grid">
        <div class="home-grid-hero">${heroCardHtml()}</div>
        <div class="panel home-week-card" id="week-card">
          <div class="home-week-head"><h2 class="perfil-h2" style="margin:0">Esta semana</h2></div>
          <div class="home-week-nums">
            <div><div class="prepare-stat-num num" id="week-count">0/0</div><div class="live-col-label">entrenamientos</div></div>
            <div><div class="prepare-stat-num num" id="week-hours">0:00</div><div class="live-col-label">horas</div></div>
            <div><div class="prepare-stat-num num" id="week-tss">0</div><div class="live-col-label">TSS</div></div>
          </div>
          <div>
            <div class="live-col-label" style="margin-bottom:8px">Tiempo por zona</div>
            <div class="home-week-zonebar" id="week-zonebar"></div>
          </div>
          <div class="home-week-days" id="week-days"></div>
        </div>
      </div>

      <div class="panel home-generate">
        <h2 class="perfil-h2" style="margin:0">Generar workout</h2>
        <p class="hint" style="margin:4px 0 0">Créalo y entrena ahora mismo — también queda guardado en tu Plan.</p>
        <div class="plan-chip-row" id="gen-chips" style="margin-top:12px">
          ${WORKOUT_TEMPLATES.map((t, i) => `<button class="plan-chip${i === 0 ? ' on' : ''}" data-template="${t.id}">${t.name}</button>`).join('')}
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

  container.querySelectorAll<HTMLElement>('.home-hero-clickable').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.workoutId;
      if (!id) return;
      appState.selectedWorkoutId = id;
      navigate('prepare');
    });
  });

  container.querySelector('#home-open-onboarding')?.addEventListener('click', () => {
    openOnboardingForm(() => refresh(), true);
  });

  function wireGenerate(): void {
    const chips = container.querySelectorAll<HTMLButtonElement>('.plan-chip');
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
        chips.forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        const t = findTemplate(chip.dataset.template!);
        if (!t) return;
        minutesInput.min = String(t.minMinutes);
        minutesInput.max = String(t.maxMinutes);
        minutesInput.value = String(t.defaultMinutes);
        description.textContent = t.description;
      });
    });

    container.querySelector('#gen-create')?.addEventListener('click', async () => {
      const activeChip = container.querySelector<HTMLButtonElement>('.plan-chip.on');
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
      const key = s.startedAt.slice(0, 10);
      return key >= weekStartKey && key < toDateKey(weekEndExclusive);
    });

    let totalSeconds = 0;
    let totalTss = 0;
    const zoneSeconds = [0, 0, 0, 0, 0, 0];
    const minutesByDay = new Map<string, number>();
    weekSessions.forEach((s: SessionRecord) => {
      const analytics = computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp });
      totalSeconds += s.samples.length;
      totalTss += analytics.trainingStressScore ?? 0;
      analytics.powerZoneSeconds.forEach((z, i) => (zoneSeconds[i] += z.seconds));
      const key = s.startedAt.slice(0, 10);
      minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + s.samples.length / 60);
    });

    // Sesiones grabadas en OTRO dispositivo (o importadas ahí) que nunca
    // llegaron a este IndexedDB — solo tenemos el resumen, no las samples;
    // sin esto "Esta semana" se queda corto tras entrenar desde el celular.
    const localIds = new Set(sessions.map((s) => s.id));
    const cloudOnlyThisWeek = appState.cloudSessions.filter((s) => !localIds.has(s.id) && isBikeSession(s)).filter((s) => {
      const key = s.startedAt.slice(0, 10);
      return key >= weekStartKey && key < toDateKey(weekEndExclusive);
    });
    cloudOnlyThisWeek.forEach((s) => {
      const durationS = Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
      totalSeconds += durationS;
      totalTss += s.trainingStressScore ?? 0;
      const key = s.startedAt.slice(0, 10);
      minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + durationS / 60);
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

    container.querySelector('#week-hours')!.textContent = fmtHours(totalSeconds);
    container.querySelector('#week-tss')!.textContent = String(Math.round(totalTss));
    container.querySelector('#week-count')!.textContent = totalThisWeek > 0 ? `${completedThisWeek}/${totalThisWeek}` : '—';

    const zoneTotal = zoneSeconds.reduce((a, b) => a + b, 0) || 1;
    container.querySelector('#week-zonebar')!.innerHTML = zoneSeconds
      .map((secs, i) => (secs > 0 ? `<div style="width:${(secs / zoneTotal) * 100}%;background:var(--z${i + 1})"></div>` : ''))
      .join('');

    const daysHtml: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const key = toDateKey(d);
      const isToday = key === todayKey;
      const minutes = minutesByDay.get(key) ?? 0;
      const heightPx = minutes > 0 ? Math.min(90, Math.max(6, minutes)) : 6;
      const barStyle = minutes > 0 ? `height:${heightPx}px;background:var(--text-soft)` : isToday ? `height:${heightPx}px;background:transparent;border:1.5px dashed var(--text-soft);box-sizing:border-box` : `height:${heightPx}px;background:var(--surface-active)`;
      daysHtml.push(`
        <div class="home-week-day">
          <div class="home-week-daybar" style="${barStyle}"></div>
          <div class="home-week-daylabel" style="${isToday ? 'color:var(--text);font-weight:500' : ''}">${isToday ? 'Hoy' : DAY_LETTERS[d.getDay()]}</div>
        </div>`);
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
