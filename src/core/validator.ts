import { METRIC_IDS, isMetricId } from './metrics';
import { COMPARISON_OPS, INTERVAL_TYPES, RULE_LEVELS, SOUND_IDS } from './types';
import type { Interval, Rule, SoundId } from './types';
import { POWER_ZONES } from './zones';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function list(values: readonly string[]): string {
  return values.join(', ');
}

function validateInterval(raw: unknown, index: number): string[] {
  const errors: string[] = [];
  const label = `el intervalo #${index}`;
  if (!isRecord(raw)) {
    return [`${label} debe ser un objeto`];
  }

  if (!isNonEmptyString(raw.name)) {
    errors.push(`${label} necesita un \`name\` (texto no vacío)`);
  }
  if (typeof raw.type !== 'string' || !INTERVAL_TYPES.includes(raw.type as Interval['type'])) {
    errors.push(
      `${label} usa el tipo \`${String(raw.type)}\`, que no existe; los tipos disponibles son: ${list(INTERVAL_TYPES)}`,
    );
  }
  if (!isFiniteNumber(raw.duration_s) || raw.duration_s <= 0) {
    errors.push(`${label} necesita \`duration_s\` mayor que 0`);
  }
  if (!isFiniteNumber(raw.power_pct) || raw.power_pct < 0) {
    errors.push(`${label} necesita \`power_pct\` como número mayor o igual a 0`);
  }
  if (raw.ramp_to_pct !== undefined && (!isFiniteNumber(raw.ramp_to_pct) || raw.ramp_to_pct < 0)) {
    errors.push(`${label} tiene \`ramp_to_pct\` inválido; debe ser un número mayor o igual a 0`);
  }
  if (raw.cadence_min !== undefined && (!isFiniteNumber(raw.cadence_min) || raw.cadence_min <= 0)) {
    errors.push(`${label} tiene \`cadence_min\` inválido; debe ser un número mayor que 0`);
  }
  if (raw.cadence_max !== undefined && (!isFiniteNumber(raw.cadence_max) || raw.cadence_max <= 0)) {
    errors.push(`${label} tiene \`cadence_max\` inválido; debe ser un número mayor que 0`);
  }
  if (
    isFiniteNumber(raw.cadence_min) &&
    isFiniteNumber(raw.cadence_max) &&
    raw.cadence_min > raw.cadence_max
  ) {
    errors.push(`${label} tiene \`cadence_min\` (${raw.cadence_min}) mayor que \`cadence_max\` (${raw.cadence_max})`);
  }
  if (raw.hr_min !== undefined && (!isFiniteNumber(raw.hr_min) || raw.hr_min <= 0)) {
    errors.push(`${label} tiene \`hr_min\` inválido; debe ser un número mayor que 0`);
  }
  if (raw.hr_ceiling !== undefined && (!isFiniteNumber(raw.hr_ceiling) || raw.hr_ceiling <= 0)) {
    errors.push(`${label} tiene \`hr_ceiling\` inválido; debe ser un número mayor que 0`);
  }
  if (isFiniteNumber(raw.hr_min) && isFiniteNumber(raw.hr_ceiling) && raw.hr_min > raw.hr_ceiling) {
    errors.push(`${label} tiene \`hr_min\` (${raw.hr_min}) mayor que \`hr_ceiling\` (${raw.hr_ceiling})`);
  }

  return errors;
}

function validateScope(scope: unknown, ruleLabel: string, intervalCount: number | undefined): string[] {
  const errors: string[] = [];

  if (scope === 'all') {
    return errors;
  }
  if (!isRecord(scope)) {
    return [
      `${ruleLabel} tiene un \`scope\` inválido; debe ser \`"all"\`, \`{type:[...]}\`, \`{intervals:[...]}\`, \`{minutes:[ini,fin]}\` o \`{zone:[...]}\``,
    ];
  }

  if ('type' in scope) {
    const types = scope.type;
    if (!Array.isArray(types) || types.length === 0) {
      errors.push(`${ruleLabel} tiene \`scope.type\` inválido; debe ser un arreglo no vacío de tipos de intervalo`);
    } else {
      for (const t of types) {
        if (typeof t !== 'string' || !INTERVAL_TYPES.includes(t as Interval['type'])) {
          errors.push(
            `${ruleLabel} usa el tipo \`${String(t)}\` en \`scope.type\`, que no existe; los tipos disponibles son: ${list(INTERVAL_TYPES)}`,
          );
        }
      }
    }
  } else if ('intervals' in scope) {
    const intervals = scope.intervals;
    if (!Array.isArray(intervals) || intervals.length === 0) {
      errors.push(`${ruleLabel} tiene \`scope.intervals\` inválido; debe ser un arreglo no vacío de números (base 1)`);
    } else {
      for (const n of intervals) {
        if (!isFiniteNumber(n) || n <= 0 || !Number.isInteger(n)) {
          errors.push(`${ruleLabel} tiene un valor inválido en \`scope.intervals\`: ${String(n)}, debe ser un entero mayor o igual a 1`);
        } else if (intervalCount !== undefined && n > intervalCount) {
          errors.push(
            `${ruleLabel} referencia el intervalo #${n} en \`scope.intervals\`, pero el workout solo tiene ${intervalCount} intervalo(s)`,
          );
        }
      }
    }
  } else if ('minutes' in scope) {
    const minutes = scope.minutes;
    if (
      !Array.isArray(minutes) ||
      minutes.length !== 2 ||
      !isFiniteNumber(minutes[0]) ||
      !isFiniteNumber(minutes[1])
    ) {
      errors.push(`${ruleLabel} tiene \`scope.minutes\` inválido; debe ser \`[inicio, fin]\` en minutos`);
    } else if (minutes[0] < 0 || minutes[1] <= minutes[0]) {
      errors.push(`${ruleLabel} tiene \`scope.minutes\` inválido: [${minutes[0]}, ${minutes[1]}]; el fin debe ser mayor que el inicio y ambos mayores o iguales a 0`);
    }
  } else if ('zone' in scope) {
    const zones = scope.zone;
    if (!Array.isArray(zones) || zones.length === 0) {
      errors.push(`${ruleLabel} tiene \`scope.zone\` inválido; debe ser un arreglo no vacío de zonas de potencia`);
    } else {
      for (const z of zones) {
        if (!POWER_ZONES.includes(z as (typeof POWER_ZONES)[number])) {
          errors.push(
            `${ruleLabel} usa la zona \`${String(z)}\` en \`scope.zone\`, que no existe; las zonas disponibles son: ${list(POWER_ZONES.map(String))}`,
          );
        }
      }
    }
  } else {
    errors.push(
      `${ruleLabel} tiene un \`scope\` inválido; debe ser \`"all"\`, \`{type:[...]}\`, \`{intervals:[...]}\` o \`{minutes:[ini,fin]}\``,
    );
  }

  return errors;
}

function validateRule(raw: unknown, index: number, intervalCount: number | undefined): string[] {
  const errors: string[] = [];
  const genericLabel = `la regla #${index}`;
  if (!isRecord(raw)) {
    return [`${genericLabel} debe ser un objeto`];
  }

  const idLabel = isNonEmptyString(raw.id) ? `la regla \`${raw.id}\`` : genericLabel;
  if (!isNonEmptyString(raw.id)) {
    errors.push(`${genericLabel} necesita un \`id\` (texto no vacío)`);
  }

  if (!isRecord(raw.when)) {
    errors.push(`${idLabel} necesita \`when: { metric, op, value }\``);
  } else {
    const metric = raw.when.metric;
    if (typeof metric !== 'string' || !isMetricId(metric)) {
      errors.push(
        `${idLabel} usa la métrica \`${String(metric)}\`, que no existe; las disponibles son: ${list(METRIC_IDS)}`,
      );
    }
    if (typeof raw.when.op !== 'string' || !COMPARISON_OPS.includes(raw.when.op as Rule['when']['op'])) {
      errors.push(`${idLabel} usa el operador \`${String(raw.when.op)}\` en \`when.op\`, que no existe; los disponibles son: ${list(COMPARISON_OPS)}`);
    }
    if (!isFiniteNumber(raw.when.value)) {
      errors.push(`${idLabel} necesita \`when.value\` numérico`);
    }
  }

  errors.push(...validateScope(raw.scope, idLabel, intervalCount));

  if (!isFiniteNumber(raw.tolerance_s) || raw.tolerance_s < 0) {
    errors.push(`${idLabel} necesita \`tolerance_s\` mayor o igual a 0`);
  }
  if (raw.repeat_s !== null && (!isFiniteNumber(raw.repeat_s) || raw.repeat_s <= 0)) {
    errors.push(`${idLabel} tiene \`repeat_s\` inválido; debe ser \`null\` o un número mayor que 0`);
  }
  if (typeof raw.level !== 'string' || !RULE_LEVELS.includes(raw.level as Rule['level'])) {
    errors.push(`${idLabel} usa el nivel \`${String(raw.level)}\`, que no existe; los disponibles son: ${list(RULE_LEVELS)}`);
  }
  if (!isNonEmptyString(raw.message)) {
    errors.push(`${idLabel} necesita un \`message\` (texto no vacío)`);
  }
  if (raw.detail !== undefined && typeof raw.detail !== 'string') {
    errors.push(`${idLabel} tiene \`detail\` inválido; debe ser texto`);
  }
  if (typeof raw.sound !== 'string' || !SOUND_IDS.includes(raw.sound as Rule['sound'])) {
    errors.push(`${idLabel} usa el sonido \`${String(raw.sound)}\`, que no existe; los disponibles son: ${list(SOUND_IDS)}`);
  }
  if (raw.recovery_message !== undefined && typeof raw.recovery_message !== 'string') {
    errors.push(`${idLabel} tiene \`recovery_message\` inválido; debe ser texto`);
  }

  return errors;
}

function validateRulesArray(raw: unknown, intervalCount: number | undefined): string[] {
  const errors: string[] = [];
  if (raw === undefined) return errors;
  if (!Array.isArray(raw)) {
    return [`\`rules\` debe ser un arreglo`];
  }

  const seenIds = new Set<string>();
  raw.forEach((rule, i) => {
    errors.push(...validateRule(rule, i + 1, intervalCount));
    if (isRecord(rule) && isNonEmptyString(rule.id)) {
      if (seenIds.has(rule.id)) {
        errors.push(`hay más de una regla con el id \`${rule.id}\`; los ids deben ser únicos`);
      }
      seenIds.add(rule.id);
    }
  });

  return errors;
}

function validateComment(raw: unknown, index: number, intervalCount: number | undefined): string[] {
  const errors: string[] = [];
  const label = `el comentario #${index}`;
  if (!isRecord(raw)) {
    return [`${label} debe ser un objeto`];
  }

  const hasAtS = raw.at_s !== undefined;
  const hasInterval = raw.interval !== undefined;
  if (!hasAtS && !hasInterval) {
    errors.push(`${label} necesita \`at_s\` (segundo absoluto) o \`interval\` (número de bloque) para saber cuándo mostrarse`);
  }
  if (hasAtS && (!isFiniteNumber(raw.at_s) || raw.at_s < 0)) {
    errors.push(`${label} tiene \`at_s\` inválido; debe ser un número mayor o igual a 0`);
  }
  if (hasInterval) {
    if (!isFiniteNumber(raw.interval) || raw.interval <= 0 || !Number.isInteger(raw.interval)) {
      errors.push(`${label} tiene \`interval\` inválido; debe ser un entero mayor o igual a 1`);
    } else if (intervalCount !== undefined && raw.interval > intervalCount) {
      errors.push(`${label} referencia el intervalo #${raw.interval}, pero el workout solo tiene ${intervalCount} intervalo(s)`);
    }
  }
  if (raw.offset_s !== undefined && !isFiniteNumber(raw.offset_s)) {
    errors.push(`${label} tiene \`offset_s\` inválido; debe ser un número`);
  }
  if (!isNonEmptyString(raw.message)) {
    errors.push(`${label} necesita un \`message\` (texto no vacío)`);
  }
  if (raw.detail !== undefined && typeof raw.detail !== 'string') {
    errors.push(`${label} tiene \`detail\` inválido; debe ser texto`);
  }
  if (raw.sound !== undefined && (typeof raw.sound !== 'string' || !SOUND_IDS.includes(raw.sound as SoundId))) {
    errors.push(`${label} usa el sonido \`${String(raw.sound)}\`, que no existe; los disponibles son: ${list(SOUND_IDS)}`);
  }

  return errors;
}

function validateCommentsArray(raw: unknown, intervalCount: number | undefined): string[] {
  const errors: string[] = [];
  if (raw === undefined) return errors;
  if (!Array.isArray(raw)) {
    return [`\`comments\` debe ser un arreglo`];
  }
  raw.forEach((comment, i) => errors.push(...validateComment(comment, i + 1, intervalCount)));
  return errors;
}

function validateCountdown(raw: unknown): string[] {
  const errors: string[] = [];
  if (raw === undefined) return errors;
  if (!isRecord(raw)) {
    return [`\`countdown\` debe ser un objeto \`{ seconds, sound, start_sound }\``];
  }
  if (!isFiniteNumber(raw.seconds) || raw.seconds <= 0) {
    errors.push(`\`countdown.seconds\` debe ser un número mayor que 0`);
  }
  if (typeof raw.sound !== 'string' || !SOUND_IDS.includes(raw.sound as SoundId)) {
    errors.push(`\`countdown.sound\` usa \`${String(raw.sound)}\`, que no existe; los disponibles son: ${list(SOUND_IDS)}`);
  }
  if (typeof raw.start_sound !== 'string' || !SOUND_IDS.includes(raw.start_sound as SoundId)) {
    errors.push(`\`countdown.start_sound\` usa \`${String(raw.start_sound)}\`, que no existe; los disponibles son: ${list(SOUND_IDS)}`);
  }
  return errors;
}

export function validateWorkout(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { valid: false, errors: ['el workout debe ser un objeto JSON'] };
  }

  if (raw.format_version !== 1) {
    errors.push(`\`format_version\` debe ser \`1\` (llegó \`${String(raw.format_version)}\`)`);
  }
  if (!isNonEmptyString(raw.id)) {
    errors.push('el workout necesita un `id` (texto no vacío)');
  }
  if (!isNonEmptyString(raw.name)) {
    errors.push('el workout necesita un `name` (texto no vacío)');
  }
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    errors.push('`description` debe ser texto');
  }
  if (!isNonEmptyString(raw.created_at)) {
    errors.push('el workout necesita `created_at` (texto no vacío, fecha ISO)');
  }

  let intervalCount: number | undefined;
  if (!Array.isArray(raw.intervals) || raw.intervals.length === 0) {
    errors.push('el workout necesita `intervals`: un arreglo con al menos un bloque');
  } else {
    intervalCount = raw.intervals.length;
    raw.intervals.forEach((interval, i) => errors.push(...validateInterval(interval, i + 1)));
  }

  errors.push(...validateCountdown(raw.countdown));
  errors.push(...validateCommentsArray(raw.comments, intervalCount));
  errors.push(...validateRulesArray(raw.rules, intervalCount));

  return { valid: errors.length === 0, errors };
}

export function validateRulesFile(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { valid: false, errors: ['el archivo de reglas debe ser un objeto JSON'] };
  }

  if (raw.format_version !== 1) {
    errors.push(`\`format_version\` debe ser \`1\` (llegó \`${String(raw.format_version)}\`)`);
  }
  if (!isNonEmptyString(raw.name)) {
    errors.push('el archivo de reglas necesita un `name` (texto no vacío)');
  }
  if (raw.applies_to !== 'any' && !isNonEmptyString(raw.applies_to)) {
    errors.push('`applies_to` debe ser `"any"` o el nombre del archivo de workout al que aplica');
  }

  errors.push(...validateCountdown(raw.countdown));
  errors.push(...validateCommentsArray(raw.comments, undefined));
  errors.push(...validateRulesArray(raw.rules, undefined));

  return { valid: errors.length === 0, errors };
}
