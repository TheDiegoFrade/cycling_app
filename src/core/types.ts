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
  /** Fecha (YYYY-MM-DD) en la que se agendó este workout — la usa Calendario.
   * Sin fecha, el workout solo vive en la biblioteca de Inicio. */
  scheduledDate?: string;
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
  // Datos personales, todos opcionales — no afectan ningún cálculo del motor
  // (FTP/HR max siguen siendo la fuente de verdad de zonas y reglas), solo
  // identifican al atleta y sirven de referencia (p.ej. peso para W/kg a futuro).
  name?: string;
  birth_date?: string; // YYYY-MM-DD
  height_cm?: number;
  weight_kg?: number;
  sex?: 'M' | 'F' | 'other';

  // Contexto de coaching para el coach de IA (ver supabase/functions/coach-chat)
  // — igual que arriba, opcional, no afecta el motor. Se llenan una vez en el
  // cuestionario inicial y se actualizan ahí; al guardar siempre se FUSIONA
  // sobre el perfil existente, nunca se reemplaza el objeto completo.
  experienceLevel?: 'new_to_cycling' | 'returning_or_new_to_app' | 'experienced';
  generalFitnessLevel?: 'sedentary' | 'active_other_sport' | 'active_cyclist';
  yearsRiding?: number;
  structuredTrainingYears?: number; // distinto de yearsRiding: años entrenando CON estructura/potencia
  competes?: boolean;
  category?: string; // solo tiene sentido si competes=true, ej. "Experto 30-39"
  discipline?: 'mountain' | 'road' | 'gravel' | 'other';
  injuries?: string;
  ridesOutside?: boolean;
  hasOutdoorPowerMeter?: boolean; // solo relevante si ridesOutside=true
  recentBestResult?: string;
  // `ftp`/`hr_max` arriba SIEMPRE tienen un número (el motor lo necesita para
  // zonas/ERG en vivo) — pero puede ser el default sin confirmar
  // (DEFAULT_PROFILE: ftp 200, hr_max 185) de alguien que nunca lo tocó.
  // Ausente o `false` = trátalo como desconocido para el coach (dispara el
  // protocolo de calibración), aunque el motor lo siga usando para entrenar.
  ftpConfirmed?: boolean;
  hrMaxConfirmed?: boolean;
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
