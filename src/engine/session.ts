import type { Comment, Interval, Profile, Rule, Sample, Workout } from '../core/types';
import { powerZone } from '../core/zones';
import { computeMetrics } from './metrics';
import type { MetricsSnapshot } from './metrics';
import { buildPlan, intervalIndexAt, targetWattsAt } from './plan';
import type { WorkoutPlan } from './plan';
import { RuleEngine } from './rules-engine';
import type { RuleNotification } from './rules-engine';

export type SessionState = 'idle' | 'running' | 'paused' | 'finished';

const MIN_INTENSITY = 0.5;
const MAX_INTENSITY = 1.2;

export interface EngineOptions {
  workout: Workout;
  profile: Profile;
  rules: Rule[];
  countdownSeconds?: number;
  historyWindowS?: number;
  autoPauseAfterS?: number;
  pausedTargetWatts?: number;
}

export interface RawSample {
  power: number;
  cadence: number;
  hr: number;
}

export type EngineEvent =
  | { type: 'tick'; t: number; sample: Sample; metrics: MetricsSnapshot }
  | { type: 'block-start'; index1: number; interval: Interval; targetWatts: number }
  | { type: 'countdown'; secondsLeft: number; next: { index1: number; interval: Interval; targetWatts: number } }
  | { type: 'comment'; comment: Comment }
  | { type: 'rule'; notification: RuleNotification }
  | { type: 'paused'; reason: 'manual' | 'auto'; targetWatts: number }
  | { type: 'resumed'; reason: 'manual' | 'auto' }
  | { type: 'finished' };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Orquesta una sesión completa: avanza el tiempo del entrenamiento (no el
 * reloj de pared), calcula el objetivo ERG, las métricas y evalúa las
 * reglas en cada tick. No importa nada de `devices/` ni `ui/`: solo recibe
 * muestras `{power, cadence, hr}` y devuelve eventos. */
export class SessionEngine {
  private readonly plan: WorkoutPlan;
  private readonly ruleEngine: RuleEngine;
  private readonly history: Sample[] = [];
  private readonly commentsFired = new Set<number>();

  private state: SessionState = 'idle';
  private elapsedS = 0;
  private bias = 1;
  private zeroCadenceStreak = 0;
  private pauseReason: 'manual' | 'auto' | null = null;
  private lastIntervalIndex1 = -1;
  private readonly opts: EngineOptions;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.plan = buildPlan(opts.workout.intervals);
    this.ruleEngine = new RuleEngine(opts.rules);
  }

  get currentState(): SessionState {
    return this.state;
  }

  get intensityPct(): number {
    return Math.round(this.bias * 100);
  }

  start(): EngineEvent[] {
    if (this.state !== 'idle') return [];
    this.state = 'running';
    this.elapsedS = 0;
    return this.blockStartEvent(0);
  }

  pause(): EngineEvent[] {
    if (this.state !== 'running') return [];
    this.state = 'paused';
    this.pauseReason = 'manual';
    return [{ type: 'paused', reason: 'manual', targetWatts: this.opts.pausedTargetWatts ?? 50 }];
  }

  resume(): EngineEvent[] {
    if (this.state !== 'paused') return [];
    const reason = this.pauseReason ?? 'manual';
    this.state = 'running';
    this.pauseReason = null;
    this.zeroCadenceStreak = 0;
    return [{ type: 'resumed', reason }];
  }

  setIntensityPct(pct: number): number {
    this.bias = clamp(pct / 100, MIN_INTENSITY, MAX_INTENSITY);
    return this.intensityPct;
  }

  adjustIntensityPct(deltaPct: number): number {
    return this.setIntensityPct(this.intensityPct + deltaPct);
  }

  /** Reemplaza las reglas activas sin reiniciar la sesión — para editar un
   * límite de pulso/cadencia (de perfil o de bloque) a mitad de entrenamiento. */
  updateRules(rules: Rule[]): void {
    this.ruleEngine.setRules(rules);
  }

  private blockStartEvent(index0: number): EngineEvent[] {
    const index1 = index0 + 1;
    if (index1 === this.lastIntervalIndex1) return [];
    this.lastIntervalIndex1 = index1;
    const interval = this.plan.intervals[index0];
    const targetWatts = targetWattsAt(this.plan, this.plan.segStart[index0], this.opts.profile.ftp, this.bias);
    return [{ type: 'block-start', index1, interval, targetWatts }];
  }

  /** Avanza un segundo con una muestra de sensores. Mientras está en pausa
   * (manual o automática) el tiempo de sesión no avanza. */
  tick(rawSample: RawSample): EngineEvent[] {
    if (this.state === 'finished') return [];
    const events: EngineEvent[] = [];

    if (this.state === 'running') {
      if (rawSample.cadence === 0) {
        this.zeroCadenceStreak++;
        if (this.zeroCadenceStreak > (this.opts.autoPauseAfterS ?? 10)) {
          this.state = 'paused';
          this.pauseReason = 'auto';
          events.push({ type: 'paused', reason: 'auto', targetWatts: this.opts.pausedTargetWatts ?? 50 });
          return events;
        }
      } else {
        this.zeroCadenceStreak = 0;
      }
    }

    if (this.state === 'paused') {
      if (rawSample.cadence > 0) {
        const reason = this.pauseReason ?? 'auto';
        this.state = 'running';
        this.pauseReason = null;
        this.zeroCadenceStreak = 0;
        events.push({ type: 'resumed', reason });
      } else {
        return events;
      }
    }

    const index0 = intervalIndexAt(this.plan, this.elapsedS);
    const interval = this.plan.intervals[index0];
    const index1 = index0 + 1;
    const into = this.elapsedS - this.plan.segStart[index0];
    const timeLeft = interval.duration_s - into;
    const target = targetWattsAt(this.plan, this.elapsedS, this.opts.profile.ftp, this.bias);

    events.push(...this.blockStartEvent(index0));

    const sample: Sample = {
      t: this.elapsedS,
      power: rawSample.power,
      cadence: rawSample.cadence,
      hr: rawSample.hr,
      target,
      intensity: this.intensityPct,
      interval_index: index0,
    };
    this.history.push(sample);
    const maxWindow = this.opts.historyWindowS ?? 30;
    if (this.history.length > maxWindow) this.history.shift();

    const metrics = computeMetrics(this.history, {
      target,
      profile: this.opts.profile,
      timeInInterval: into,
      timeLeftInterval: timeLeft,
      intensityPct: sample.intensity,
    });

    events.push({ type: 'tick', t: this.elapsedS, sample, metrics });

    (this.opts.workout.comments ?? []).forEach((comment, i) => {
      if (this.commentsFired.has(i)) return;
      const triggerS =
        comment.at_s !== undefined
          ? comment.at_s
          : comment.interval !== undefined
            ? this.plan.segStart[comment.interval - 1] + (comment.offset_s ?? 0)
            : undefined;
      if (triggerS !== undefined && this.elapsedS >= triggerS) {
        this.commentsFired.add(i);
        events.push({ type: 'comment', comment });
      }
    });

    const countdownS = this.opts.countdownSeconds ?? this.opts.workout.countdown?.seconds ?? 5;
    const nextInterval = this.plan.intervals[index0 + 1];
    if (nextInterval && timeLeft <= countdownS && timeLeft > 0) {
      const nextTargetWatts = targetWattsAt(this.plan, this.plan.segStart[index0 + 1], this.opts.profile.ftp, this.bias);
      events.push({
        type: 'countdown',
        secondsLeft: timeLeft,
        next: { index1: index1 + 1, interval: nextInterval, targetWatts: nextTargetWatts },
      });
    }

    const notification = this.ruleEngine.evaluateTick(this.elapsedS, metrics, {
      intervalIndex1: index1,
      intervalType: interval.type,
      intervalZone: powerZone(interval.power_pct),
      elapsedS: this.elapsedS,
    });
    if (notification) events.push({ type: 'rule', notification });

    this.elapsedS++;
    if (this.elapsedS >= this.plan.totalDuration) {
      this.state = 'finished';
      events.push({ type: 'finished' });
    }

    return events;
  }
}
