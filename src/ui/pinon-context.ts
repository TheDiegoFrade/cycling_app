// El consejo de Piñón con datos que la app ya tiene en memoria (workouts,
// sesiones de este dispositivo y de la nube, PMC). No llama a la IA ni a
// Supabase. Se carga solo al tocar al Piñón asomado (import dinámico), así
// pinon.ts queda libre de dependencias pesadas y se puede probar solo.
import { estimateWorkout } from '../core/workout-estimate';
import { mainZoneOf } from '../core/workout-zone';
import { isBikeSession } from '../core/session-kind';
import { dayKeyOf } from '../core/day-key';
import { computeSessionAnalytics } from '../engine/analytics';
import { computePmc } from '../engine/pmc';
import { listSessions } from '../storage/session-store';
import { appState } from './state';
import { humanCoachName } from './coach-notice';
import { knownCoachPlanState, requestCoachCreate } from './coach';
import { openPinonBubble, pinonTip } from './pinon';
import type { PinonAction, PinonTipContext } from './pinon';

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function buildPinonTipContext(): Promise<{ ctx: PinonTipContext; todayWorkoutId: string | null }> {
  const now = new Date();
  const todayKey = localKey(now);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = localKey(monday);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const weekEnd = localKey(sunday);
  const inWeek = (k: string) => k >= weekStart && k <= weekEnd;

  const local = (await listSessions().catch(() => [])).filter(isBikeSession);
  const localIds = new Set(local.map((s) => s.id));
  const cloud = appState.cloudSessions.filter((s) => !localIds.has(s.id) && isBikeSession(s));
  const doneDays = new Set([...local.map((s) => dayKeyOf(s.startedAt)), ...cloud.map((s) => dayKeyOf(s.startedAt))]);

  // Mismo conteo que «Esta semana» en Inicio: hechas + agendadas pendientes.
  const weekDone = [...local, ...cloud].filter((s) => inWeek(dayKeyOf(s.startedAt))).length;
  const pending = appState.workouts.filter((w) => w.scheduledDate && inWeek(w.scheduledDate) && !doneDays.has(w.scheduledDate)).length;

  const today = doneDays.has(todayKey) ? undefined : appState.workouts.find((w) => w.scheduledDate === todayKey);

  const pmc = computePmc([
    ...local.map((s) => ({ dateKey: dayKeyOf(s.startedAt), tss: computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp }).trainingStressScore ?? 0 })),
    ...cloud.map((s) => ({ dateKey: dayKeyOf(s.startedAt), tss: s.trainingStressScore ?? 0 })),
  ]);

  // Si nunca se abrió Plan en esta sesión no sabemos si hay plan: mejor no
  // invitar a crear uno que tal vez ya existe.
  const hasPlan = knownCoachPlanState() ?? true;
  const ctx: PinonTipContext = {
    todayWorkout: today
      ? { name: today.name, minutes: Math.round(estimateWorkout(today.intervals, appState.profile.ftp).durationS / 60), zone: mainZoneOf(today) }
      : undefined,
    weekDone,
    weekPlanned: weekDone + pending,
    tsb: pmc.length ? pmc[pmc.length - 1].tsb : undefined,
    hasPlan,
    isRestDay: hasPlan && !today && !doneDays.has(todayKey),
    humanCoach: humanCoachName() !== null,
    seed: Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000),
  };
  return { ctx, todayWorkoutId: today?.id ?? null };
}

/** Abre la burbuja con el consejo de hoy (clic en el Piñón asomado). */
export async function openPinonTip(returnFocus: HTMLElement | null): Promise<void> {
  const { ctx, todayWorkoutId } = await buildPinonTipContext();
  const tip = pinonTip(ctx);
  let action: PinonAction | undefined;
  if (tip.action) {
    const { label, href, kind } = tip.action;
    action = {
      label,
      href,
      // Empezar a rodar: el mismo flujo que el botón principal de Inicio.
      onSelect: kind === 'ride' && todayWorkoutId ? () => (appState.selectedWorkoutId = todayWorkoutId) : kind === 'create' ? requestCoachCreate : undefined,
    };
  }
  openPinonBubble({ pose: 'habla', title: 'PIÑÓN', text: tip.text, action, returnFocus });
}
