// De las sesiones que tiene la app (locales con samples, o resúmenes de la
// nube) a las filas que necesita la ficha del atleta (engine/athlete-state.ts).
// La usan el coach de IA del atleta (ui/coach.ts) y la semana del coach
// humano (screens/coach-week.ts). Las sesiones de Strava ya vienen fuera.
import { computeSessionAnalytics } from '../engine/analytics';
import { computeSessionMetrics } from '../engine/session-metrics';
import type { StateSession } from '../engine/athlete-state';
import type { Profile, Workout } from '../core/types';
import type { SessionRecord } from '../storage/session-store';
import type { CloudSessionSummary } from '../sync/cloud-sync';
import { isTestWorkoutDoc } from '../core/workout-zone';
import { dayKeyOf } from '../core/day-key';

export function stateSessionFromLocal(s: SessionRecord, profile: Profile, workout: Workout | undefined): StateSession {
  const a = computeSessionAnalytics(s.samples, { ...profile, ftp: s.ftp });
  return {
    dateKey: dayKeyOf(s.startedAt),
    durationS: s.samples.length,
    tss: a.trainingStressScore,
    hrDriftPct: a.hrDriftPct,
    ef: a.efficiencyFactor,
    workoutId: s.workoutId,
    metrics: computeSessionMetrics(s.samples, s.ftp, {
      isTest: workout ? isTestWorkoutDoc(workout) : isTestWorkoutDoc({ name: s.workoutName }),
      selfPacedIntervals: workout?.intervals.flatMap((iv, i) => (iv.type === 'free' ? [i] : [])) ?? [],
    }),
  };
}

export function stateSessionFromCloud(s: Pick<CloudSessionSummary, 'startedAt' | 'finishedAt' | 'trainingStressScore' | 'hrDriftPct' | 'efficiencyFactor' | 'workoutId' | 'metrics'>): StateSession {
  return {
    dateKey: dayKeyOf(s.startedAt),
    durationS: Math.max(0, (Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1000),
    tss: s.trainingStressScore,
    hrDriftPct: s.hrDriftPct,
    ef: s.efficiencyFactor,
    workoutId: s.workoutId,
    metrics: s.metrics,
  };
}
