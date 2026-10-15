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
import { aiEligibleSessions, knownCoachPlanState, requestCoachCreate } from './coach';
import type { PinonChatData, PinonChatSession } from '../core/pinon-chat';
import { catchTitle, isCatchMilestone, openPinonBubble, pinonTip } from './pinon';
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
export async function openPinonTip(returnFocus: HTMLElement | null, caught = 0): Promise<void> {
  if (isCatchMilestone(caught)) {
    openPinonBubble({ pose: 'motiva', title: catchTitle(caught), text: 'Qué reflejos. Sigo escondiéndome por ahí, a ver si me vuelves a atrapar.', dismissLabel: 'Ja', returnFocus });
    return;
  }
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
  openPinonBubble({ pose: 'habla', title: caught > 0 ? catchTitle(caught) : 'PIÑÓN', text: tip.text, action, returnFocus });
}

/** Lo que Piñón sabe en el chat. Solo sesiones que pueden ir a la IA (sin
 * Strava, ver coach.ts aiEligibleSessions): el mismo objeto sirve para las
 * respuestas locales y para pinon-chat, así nunca se cuela un dato de Strava. */
export async function buildPinonChatData(): Promise<PinonChatData> {
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

  const { localSessions, cloudOnly } = await aiEligibleSessions(true).catch(() => ({ localSessions: [], cloudOnly: [] }));
  const cloudById = new Map(appState.cloudSessions.map((s) => [s.id, s]));
  const minutesOf = (s: { startedAt: string; finishedAt: string }) =>
    Math.max(0, Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60000));
  const rides: (PinonChatSession & { dateKey: string })[] = [
    ...localSessions.map((s) => ({
      dateKey: dayKeyOf(s.startedAt),
      date: dayKeyOf(s.startedAt),
      name: s.workoutName,
      minutes: s.samples.length ? Math.round(s.samples.length / 60) : minutesOf(s),
      tss: Math.round(computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp }).trainingStressScore ?? 0) || null,
      rpe: s.rpe ?? cloudById.get(s.id)?.rpe ?? null,
      note: (s.note ?? cloudById.get(s.id)?.note ?? '').trim().slice(0, 240) || null,
    })),
    ...cloudOnly.map((s) => ({
      dateKey: dayKeyOf(s.startedAt),
      date: dayKeyOf(s.startedAt),
      name: s.workoutName,
      minutes: minutesOf(s),
      tss: s.trainingStressScore !== null ? Math.round(s.trainingStressScore) : null,
      rpe: s.rpe,
      note: (s.note ?? '').trim().slice(0, 240) || null,
    })),
  ].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));

  const doneDays = new Set(rides.map((r) => r.dateKey));
  const weekDone = rides.filter((r) => inWeek(r.dateKey)).length;
  const pending = appState.workouts.filter((w) => w.scheduledDate && inWeek(w.scheduledDate) && !doneDays.has(w.scheduledDate)).length;
  const todayWorkout = appState.workouts.find((w) => w.scheduledDate === todayKey);
  const pmc = computePmc(rides.map((r) => ({ dateKey: r.dateKey, tss: r.tss ?? 0 })));
  const last = pmc[pmc.length - 1];
  const lastRide = rides[0]?.dateKey;

  return {
    todayKey,
    humanCoach: humanCoachName() !== null,
    hasPlan: knownCoachPlanState() ?? true,
    ftp: appState.profile.ftp,
    ...(todayWorkout
      ? {
          today: {
            name: todayWorkout.name,
            minutes: Math.round(estimateWorkout(todayWorkout.intervals, appState.profile.ftp).durationS / 60),
            zone: mainZoneOf(todayWorkout),
            description: todayWorkout.description?.slice(0, 400) ?? null,
            done: doneDays.has(todayKey),
          },
        }
      : {}),
    week: { done: weekDone, planned: weekDone + pending },
    ...(last ? { form: { ctl: Math.round(last.ctl), atl: Math.round(last.atl), tsb: Math.round(last.tsb) } } : {}),
    recent: rides.slice(0, 5).map(({ dateKey: _d, ...r }) => r),
    daysSinceLastRide: lastRide ? Math.round((new Date(`${todayKey}T00:00:00`).getTime() - new Date(`${lastRide}T00:00:00`).getTime()) / 86_400_000) : null,
  };
}
