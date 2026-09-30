import type { Workout } from '../../core/types';
import { estimateWorkout } from '../../core/workout-estimate';
import { computeSessionAnalytics } from '../../engine/analytics';
import { clearDraft, listDrafts } from '../../storage/session-draft';
import { listSessions, saveSession } from '../../storage/session-store';
import type { SessionRecord } from '../../storage/session-store';
import { pushSessionToCloud } from '../../sync/cloud-sync';
import { navigate } from '../router';
import { appState } from '../state';
import { renderWorkoutCover } from '../workout-cover';

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // índice = Date#getDay()
const ZONE_LEGEND: { zone: 1 | 2 | 3 | 4 | 5 | 6; label: string }[] = [1, 2, 3, 4, 5, 6].map((z) => ({ zone: z as 1 | 2 | 3 | 4 | 5 | 6, label: `Z${z}` }));

function fmtDuration(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
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

  const todayWorkout = appState.workouts.find((w) => w.scheduledDate === todayKey);
  const nextWorkout =
    todayWorkout ??
    appState.workouts
      .filter((w): w is Workout & { scheduledDate: string } => Boolean(w.scheduledDate) && w.scheduledDate! > todayKey)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];

  function heroCardHtml(): string {
    if (!nextWorkout) {
      return `
        <div class="home-hero-card home-hero-empty">
          <div class="live-col-label">Hoy toca</div>
          <div class="home-hero-title">Nada agendado</div>
          <p class="hint">Elige o agenda un workout en Plan para verlo aquí.</p>
          <a href="#/plan" class="prepare-link">Ir a Plan</a>
        </div>`;
    }
    const est = estimateWorkout(nextWorkout.intervals, appState.profile.ftp);
    const [low, high] = est.wattsRange;
    const wattsLabel = low === high ? `${low} W` : `${low}–${high} W`;
    const label = todayWorkout ? 'Hoy toca' : `Agendado · ${nextWorkout.scheduledDate}`;
    return `
      <div class="home-hero-card">
        ${renderWorkoutCover(nextWorkout.intervals, 'lg')}
        <div class="home-hero-body">
          <div>
            <div class="live-col-label">${label}</div>
            <div class="home-hero-title">${nextWorkout.name}</div>
            <div class="hint">${Math.round(est.durationS / 60)} min · ${est.tss ?? '—'} TSS · a ${wattsLabel}</div>
          </div>
          <button class="home-play-btn" id="hero-play" aria-label="Empezar" data-workout-id="${nextWorkout.id}">▶</button>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="screen home-screen">
      <div id="draft-recovery"></div>
      <div class="home-topline">
        <h1>${greeting()}${name ? `, ${name}` : ''}</h1>
        <div class="perfil-avatar">${initial}</div>
      </div>

      <div class="home-grid">
        <div class="home-grid-hero">${heroCardHtml()}</div>
        <div class="panel home-week-card" id="week-card">
          <div class="home-week-head"><h2 class="perfil-h2" style="margin:0">Esta semana</h2><span class="live-col-label" id="week-fraction"></span></div>
          <div class="home-week-nums">
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

      <div class="home-fortu">
        <div class="home-fortu-head">
          <h2 class="perfil-h2" style="margin:0">Para ti</h2>
          <div class="home-fortu-legend">
            ${ZONE_LEGEND.map((z) => `<span class="home-legend-item"><span class="home-legend-dot" style="background:var(--z${z.zone})"></span>${z.label}</span>`).join('')}
            <a href="#/plan" class="home-fortu-link">Ver biblioteca</a>
          </div>
        </div>
        <div class="home-fortu-grid" id="fortu-grid"></div>
      </div>
    </div>
  `;

  container.querySelector('#hero-play')?.addEventListener('click', () => {
    if (!nextWorkout) return;
    appState.selectedWorkoutId = nextWorkout.id;
    navigate('prepare');
  });

  const fortuGrid = container.querySelector<HTMLElement>('#fortu-grid')!;
  const fortuCandidates = appState.workouts.filter((w) => w.id !== nextWorkout?.id).slice(0, 5);
  fortuGrid.innerHTML = fortuCandidates.length
    ? fortuCandidates
        .map((w) => {
          const est = estimateWorkout(w.intervals, appState.profile.ftp);
          return `
        <button class="home-fortu-item" data-workout-id="${w.id}">
          ${renderWorkoutCover(w.intervals, 'md', w.name)}
          <div class="home-fortu-name">${w.name}</div>
          <div class="live-col-label">${Math.round(est.durationS / 60)} min</div>
        </button>`;
        })
        .join('')
    : '<p class="hint">Importa o genera un workout en Plan para verlo aquí.</p>';
  fortuGrid.querySelectorAll<HTMLButtonElement>('[data-workout-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.selectedWorkoutId = btn.dataset.workoutId ?? null;
      navigate('prepare');
    });
  });

  /** "Esta semana" necesita las sesiones reales (async, IndexedDB) — se
   * pinta con ceros primero y se reconcilia en cuanto cargan, mismo patrón
   * que el resto de la app. */
  async function paintWeek(): Promise<void> {
    const sessions = await listSessions();
    const weekStart = startOfWeek(today);
    const weekStartKey = toDateKey(weekStart);
    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setDate(weekEndExclusive.getDate() + 7);

    const weekSessions = sessions.filter((s) => {
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

    const scheduledThisWeek = appState.workouts.filter((w) => w.scheduledDate && w.scheduledDate >= weekStartKey && w.scheduledDate < toDateKey(weekEndExclusive));
    const doneCount = scheduledThisWeek.filter((w) => minutesByDay.has(w.scheduledDate!)).length;

    container.querySelector('#week-hours')!.textContent = fmtDuration(totalSeconds);
    container.querySelector('#week-tss')!.textContent = String(Math.round(totalTss));
    container.querySelector('#week-fraction')!.textContent = scheduledThisWeek.length ? `${doneCount} de ${scheduledThisWeek.length}` : '';

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
