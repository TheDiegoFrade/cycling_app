import { buildAchievementInput, evaluateAchievements } from '../engine/achievements';
import type { Achievement } from '../engine/achievements';
import { computeWeeklyStreak } from '../engine/streaks';
import { isLiveRecorded } from '../core/session-origin';
import { listSessions } from '../storage/session-store';
import { appState } from './state';

const SEEN_KEY = 'torq.seenAchievements';

/** Logros ya "vistos" (ganados y ya celebrados o ya mostrados en la galería
 * de Forma) — en localStorage, no Supabase: es puro caché de UI para no
 * repetir una celebración, no un dato que haga falta sincronizar entre
 * dispositivos ni administrar. */
function getSeenAchievementIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markAchievementsSeen(ids: readonly string[]): void {
  if (ids.length === 0) return;
  const seen = getSeenAchievementIds();
  ids.forEach((id) => seen.add(id));
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage lleno o bloqueado (modo privado, etc.) — sin registro
    // persistente no se puede celebrar de forma confiable, pero no es crítico.
  }
}

/** Compara los logros ganados ahora mismo contra los ya vistos y devuelve
 * solo los nuevos — de paso marca TODOS los ganados (no solo los nuevos)
 * como vistos, para no volver a celebrarlos la próxima vez. */
export function findNewlyEarnedAchievements(earned: readonly Achievement[]): Achievement[] {
  const seen = getSeenAchievementIds();
  const fresh = earned.filter((a) => !seen.has(a.id));
  markAchievementsSeen(earned.map((a) => a.id));
  return fresh;
}

/** Celebración de uno o más logros nuevos al terminar un entrenamiento —
 * overlay fijo con trofeo animado, se cierra sola o al tocarla. No hace nada
 * si la lista viene vacía (nada que celebrar). */
export function showAchievementCelebration(achievements: readonly Achievement[]): void {
  if (achievements.length === 0) return;
  const el = document.createElement('div');
  el.className = 'achievement-celebration';
  const title = achievements.length === 1 ? '¡Nuevo logro desbloqueado!' : `¡${achievements.length} logros nuevos desbloqueados!`;
  el.innerHTML = `
    <div class="achievement-celebration-trophy">🏆</div>
    <div class="achievement-celebration-title">${title}</div>
    <div class="achievement-celebration-list">
      ${achievements
        .map(
          (a) => `
        <div class="achievement-celebration-item">
          <span class="achievement-celebration-item-icon">${a.icon}</span>
          <div>
            <div class="achievement-celebration-item-title">${a.title}</div>
            <div class="hint">${a.description}</div>
          </div>
        </div>`,
        )
        .join('')}
    </div>
  `;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

function todayKeyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface MinimalRow {
  startedAt: string;
  durationS: number;
  ftp: number;
  workoutId: string | null;
  stravaActivityId: number | null;
}

/** Se llama al montar Resumen justo después de terminar un entrenamiento
 * real (ver appState.justFinishedSession en train.ts) — recarga el
 * historial igual que lo hace Forma, evalúa logros solo con sesiones en vivo
 * (ver core/session-origin.ts) y celebra los que sean nuevos desde la
 * última vez. Nunca lanza: si algo falla, simplemente no hay celebración
 * esta vez, no debe romper la pantalla de Resumen. */
export async function checkAndCelebrateAchievements(): Promise<void> {
  try {
    const localSessions = await listSessions();
    const localById = new Map(localSessions.map((s) => [s.id, s]));
    const localRows: MinimalRow[] = localSessions.map((s) => ({
      startedAt: s.startedAt,
      durationS: s.samples.length,
      ftp: s.ftp,
      workoutId: s.workoutId,
      stravaActivityId: s.stravaActivityId ?? null,
    }));
    const cloudRows: MinimalRow[] = appState.cloudSessions
      .filter((s) => !localById.has(s.id))
      .map((s) => ({
        startedAt: s.startedAt,
        durationS: Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000),
        ftp: s.ftp,
        workoutId: s.workoutId,
        stravaActivityId: s.stravaActivityId,
      }));
    const liveRows = [...localRows, ...cloudRows].filter(isLiveRecorded);
    const todayKey = todayKeyLocal();
    const streak = computeWeeklyStreak(
      liveRows.map((r) => r.startedAt.slice(0, 10)),
      todayKey,
    );
    const input = buildAchievementInput(liveRows, streak, appState.profile.ftp);
    const earned = evaluateAchievements(input)
      .filter((r) => r.earned)
      .map((r) => r.achievement);
    showAchievementCelebration(findNewlyEarnedAchievements(earned));
  } catch (err) {
    console.error('[achievement-toast] no se pudo chequear logros nuevos', err);
  }
}
