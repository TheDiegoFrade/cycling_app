import type { MetricId } from '../core/metrics';
import type { ComparisonOp, IntervalType, Rule, RuleLevel, RuleScope, SoundId } from '../core/types';
import type { PowerZone } from '../core/zones';
import type { MetricsSnapshot } from './metrics';

export interface RuleScopeContext {
  intervalIndex1: number;
  intervalType: IntervalType;
  intervalZone: PowerZone;
  elapsedS: number;
}

export type RuleNotification =
  | { kind: 'fire'; rule: Rule; level: RuleLevel; message: string; detail?: string; sound: SoundId }
  | { kind: 'recover'; rule: Rule; message: string; sound: SoundId };

interface RuleTrackingState {
  conditionSinceS: number | null;
  lastFiredS: number | null;
  wasActive: boolean;
}

function compare(value: number, op: ComparisonOp, threshold: number): boolean {
  switch (op) {
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
  }
}

function scopeMatches(scope: RuleScope, ctx: RuleScopeContext): boolean {
  if (scope === 'all') return true;
  if ('type' in scope) return scope.type.includes(ctx.intervalType);
  if ('intervals' in scope) return scope.intervals.includes(ctx.intervalIndex1);
  if ('zone' in scope) return scope.zone.includes(ctx.intervalZone);
  const minute = ctx.elapsedS / 60;
  return minute >= scope.minutes[0] && minute < scope.minutes[1];
}

function substitute(text: string, metric: MetricId, value: number): string {
  return text.replace(new RegExp(`\\{${metric}\\}`, 'g'), String(Math.round(value)));
}

const LEVEL_RANK: Record<RuleLevel, number> = { danger: 3, adjust: 2, info: 1 };

function rank(n: RuleNotification): number {
  return n.kind === 'fire' ? LEVEL_RANK[n.level] : 0;
}

/** Evalúa reglas a 1 Hz: tolerancia sostenida, repetición mientras se
 * cumple, recuperación al dejar de cumplirse, y prioridad danger > adjust >
 * info cuando compiten varias en el mismo tick (solo una se devuelve; el
 * resto se descarta, no se encola). */
export class RuleEngine {
  private readonly tracking = new Map<string, RuleTrackingState>();
  private rules: readonly Rule[];

  constructor(rules: readonly Rule[]) {
    this.rules = rules;
  }

  /** Reemplaza el set de reglas en caliente (p. ej. al editar un límite a
   * mitad de sesión). El tracking (desde cuándo se sostiene, última vez que
   * disparó) sigue vivo por `rule.id` — mientras los ids no cambien entre
   * llamadas, una regla que ya estaba "sostenida" no pierde su progreso. */
  setRules(rules: readonly Rule[]): void {
    this.rules = rules;
  }

  evaluateTick(currentS: number, metrics: MetricsSnapshot, ctx: RuleScopeContext): RuleNotification | null {
    const candidates: RuleNotification[] = [];

    for (const rule of this.rules) {
      let tr = this.tracking.get(rule.id);
      if (!tr) {
        tr = { conditionSinceS: null, lastFiredS: null, wasActive: false };
        this.tracking.set(rule.id, tr);
      }

      const metricValue = metrics[rule.when.metric];
      const conditionMet =
        scopeMatches(rule.scope, ctx) && metricValue !== undefined && compare(metricValue, rule.when.op, rule.when.value);

      if (conditionMet) {
        if (tr.conditionSinceS === null) tr.conditionSinceS = currentS;
        const sustainedFor = currentS - tr.conditionSinceS;
        if (sustainedFor >= rule.tolerance_s) {
          const shouldFire = tr.lastFiredS === null || (rule.repeat_s !== null && currentS - tr.lastFiredS >= rule.repeat_s);
          if (shouldFire) {
            tr.lastFiredS = currentS;
            tr.wasActive = true;
            candidates.push({
              kind: 'fire',
              rule,
              level: rule.level,
              message: substitute(rule.message, rule.when.metric, metricValue),
              detail: rule.detail !== undefined ? substitute(rule.detail, rule.when.metric, metricValue) : undefined,
              sound: rule.sound,
            });
          }
        }
      } else {
        if (tr.wasActive && rule.recovery_message !== undefined) {
          candidates.push({ kind: 'recover', rule, message: rule.recovery_message, sound: rule.sound });
        }
        tr.conditionSinceS = null;
        tr.lastFiredS = null;
        tr.wasActive = false;
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => rank(b) - rank(a));
    return candidates[0];
  }
}
