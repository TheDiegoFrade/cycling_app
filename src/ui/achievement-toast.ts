import { buildAchievementInput, evaluateAchievements } from '../engine/achievements';
import type { Achievement } from '../engine/achievements';
import { computeWeeklyStreak } from '../engine/streaks';
import { computeSessionAnalytics } from '../engine/analytics';
import { listSessions } from '../storage/session-store';
import type { SessionRecord } from '../storage/session-store';
import { localPowerBests, bestOf } from './screens/history';
import { getPowerRecords } from '../sync/cloud-sync';
import { appState } from './state';

/** Lo mínimo que necesita el toast de celebración para mostrarse — un
 * `Achievement` del catálogo fijo cumple esto de sobra (trae además el
 * predicado `earned`), y también lo cumple un logro sintético de pico de
 * potencia que no vive en ningún catálogo. */
interface CelebratableAchievement {
  id: string;
  icon: string;
  title: string;
  description: string;
}

const POWER_PEAK_WINDOWS: { key: 'best1min' | 'best5min' | 'best20min'; windowS: number; label: string; icon: string }[] = [
  { key: 'best1min', windowS: 60, label: '1 minuto', icon: '⚡' },
  { key: 'best5min', windowS: 300, label: '5 minutos', icon: '🔥' },
  { key: 'best20min', windowS: 1200, label: '20 minutos', icon: '🚵' },
];

/** Compara la sesión recién terminada contra el mejor histórico de TODAS las
 * demás sesiones (local + nube, sin importar su origen — grabada en vivo,
 * importada de Strava o subida a mano) y arma un "logro" sintético por cada
 * ventana (1/5/20 min) que acaba de superarse. A diferencia del catálogo
 * fijo de achievements.ts, esto no tiene estado de "visto": la propia
 * comparación contra el histórico anterior ya garantiza que es nuevo, así
 * que se puede volver a celebrar cada vez que se rompe el récord de nuevo. */
async function detectNewPowerPeaks(justFinished: SessionRecord, otherLocalSessions: SessionRecord[]): Promise<CelebratableAchievement[]> {
  const profile = { ...appState.profile, ftp: justFinished.ftp };
  const analytics = computeSessionAnalytics(justFinished.samples, profile);
  const priorLocalBests = localPowerBests(otherLocalSessions);
  const cloudBests =
    appState.cloudEnabled && appState.user
      ? await getPowerRecords(appState.user.id).catch(() => null)
      : null;

  const peaks: CelebratableAchievement[] = [];
  for (const w of POWER_PEAK_WINDOWS) {
    const watts = analytics.powerCurve.find((p) => p.windowS === w.windowS)?.watts ?? null;
    if (watts === null) continue;
    const priorBest = bestOf(priorLocalBests[w.key], cloudBests?.[w.key] ?? null);
    if (priorBest && watts <= priorBest.watts) continue;
    peaks.push({
      id: `power_peak_${w.key}_${justFinished.id}`,
      icon: w.icon,
      title: `Nuevo récord: ${w.label}`,
      description: `${Math.round(watts)} W — tu mejor marca de ${w.label} hasta ahora.`,
    });
  }
  return peaks;
}

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
export function showAchievementCelebration(achievements: readonly CelebratableAchievement[]): void {
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
 * historial igual que lo hace Forma, evalúa logros con cualquier sesión
 * (grabada en vivo, importada de Strava o subida a mano) y celebra los que
 * sean nuevos desde la última vez. Nunca lanza: si algo falla, simplemente
 * no hay celebración esta vez, no debe romper la pantalla de Resumen. */
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
    const allRows = [...localRows, ...cloudRows];
    const todayKey = todayKeyLocal();
    const streak = computeWeeklyStreak(
      allRows.map((r) => r.startedAt.slice(0, 10)),
      todayKey,
    );
    const input = buildAchievementInput(allRows, streak, appState.profile.ftp);
    const earned = evaluateAchievements(input)
      .filter((r) => r.earned)
      .map((r) => r.achievement);
    const newBadges = findNewlyEarnedAchievements(earned);

    // picos de potencia: cualquier sesión que se acabe de guardar compite por
    // el récord, sin importar su origen.
    const justFinished = appState.lastSession;
    const newPeaks = justFinished
      ? await detectNewPowerPeaks(
          justFinished,
          localSessions.filter((s) => s.id !== justFinished.id),
        )
      : [];

    showAchievementCelebration([...newBadges, ...newPeaks]);
  } catch (err) {
    console.error('[achievement-toast] no se pudo chequear logros nuevos', err);
  }
}
