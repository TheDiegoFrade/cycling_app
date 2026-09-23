import type { MetricId } from './metrics';
import type { PowerZone } from './zones';

export type IntervalType = 'warmup' | 'steady' | 'interval' | 'recovery' | 'cooldown' | 'free';

export const INTERVAL_TYPES: readonly IntervalType[] = [
  'warmup',
  'steady',
  'interval',
  'recovery',
  'cooldown',
  'free',
];

export type SoundId = 'tick' | 'go' | 'alarm_low' | 'alarm_desc' | 'chime' | 'none';

export const SOUND_IDS: readonly SoundId[] = ['tick', 'go', 'alarm_low', 'alarm_desc', 'chime', 'none'];

export type RuleLevel = 'info' | 'adjust' | 'danger';

export const RULE_LEVELS: readonly RuleLevel[] = ['info', 'adjust', 'danger'];

export type ComparisonOp = '<' | '<=' | '>' | '>=';

export const COMPARISON_OPS: readonly ComparisonOp[] = ['<', '<=', '>', '>='];

export interface Interval {
  name: string;
  type: IntervalType;
  duration_s: number;
  power_pct: number; // % de FTP
  ramp_to_pct?: number; // rampa lineal hasta este %
  cadence_min?: number;
  cadence_max?: number;
  hr_min?: number;
  // mismo nombre que el límite global de perfil (`Profile.hr_ceiling`), a
  // propósito: nunca `hr_max`, ese término queda exclusivo para "tu máximo
  // fisiológico" y ya causó confusión una vez al mezclarse con un límite de sesión.
  hr_ceiling?: number;
}

export interface Comment {
  at_s?: number; // segundo absoluto
  interval?: number; // número de bloque (base 1)
  offset_s?: number;
  message: string;
  detail?: string;
  sound?: SoundId;
}

export type RuleScope =
  | 'all'
  | { type: IntervalType[] }
  | { intervals: number[] }
  | { minutes: [number, number] }
  | { zone: PowerZone[] }; // zona de potencia (1–6) del bloque, ver core/zones.ts

export interface Rule {
  id: string;
  when: { metric: MetricId; op: ComparisonOp; value: number };
  scope: RuleScope;
  tolerance_s: number; // segundos que debe sostenerse; 0 = inmediato
  repeat_s: number | null; // repetir cada N s mientras siga; null = una vez
  level: RuleLevel;
  message: string;
  detail?: string; // admite {metric} para insertar el valor actual
  sound: SoundId;
  recovery_message?: string; // mensaje al volver a cumplir
}

export interface Countdown {
  seconds: number;
  sound: SoundId;
  start_sound: SoundId;
}

export interface Workout {
  format_version: 1;
  id: string;
  name: string;
  description?: string;
  intervals: Interval[];
  countdown?: Countdown;
  comments?: Comment[];
  rules?: Rule[];
  created_at: string;
}

/** Archivo de solo reglas (modo A del prompt de importación): mismas reglas,
 * comentarios y countdown, pero sin intervalos — se aplica sobre cualquier workout. */
export interface RulesFile {
  format_version: 1;
  name: string;
  applies_to: 'any' | string;
  countdown?: Countdown;
  comments?: Comment[];
  rules?: Rule[];
}

export interface Profile {
  ftp: number;
  hr_max: number;
  cadence_floor: number;
  hr_ceiling: number;
  // límites globales opcionales de facto: siempre tienen un número, pero solo
  // se aplican como regla si su interruptor está activo en "Alertas de fábrica"
  // (ver AppSettings.factoryRulesEnabled) — mismo patrón que los dos de arriba.
  hr_min: number;
  cadence_max: number;
}

export interface Sample {
  t: number; // segundo desde el inicio
  power: number;
  cadence: number;
  hr: number;
  target: number; // objetivo ERG en ese momento
  intensity: number; // ajuste manual, 1 = 100 %
  interval_index: number;
}
