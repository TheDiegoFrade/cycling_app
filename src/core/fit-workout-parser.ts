import type { Comment, Interval, IntervalType } from './types';

/** Lee un archivo FIT de ENTRENAMIENTO (file_id.type = 5: el plan de pasos
 * que exportan TrainingPeaks, Garmin Connect, intervals.icu…) — no el de
 * una actividad grabada (eso es fit-activity-parser.ts).
 *
 * Mensajes que importan: `workout` (26: nombre y deporte) y `workout_step`
 * (27: un paso por mensaje). Cómo se traduce cada paso:
 * - Objetivo de pulso → bloque libre (sin ERG, modo calle) con su rango de
 *   pulso como alerta (hr_min / hr_ceiling). La potencia no se fija: el
 *   `power_pct` es solo una referencia para pintar y estimar la carga.
 * - Objetivo de potencia → bloque normal con ERG (% del FTP).
 * - Objetivo de cadencia → límites de cadencia; sin objetivo → libre.
 * - Repetir pasos → se desenrollan. Duración abierta o por distancia → 5 min.
 *
 * Referencia: FIT Profile de Garmin (workout_step: wkt_step_name 0,
 * duration_type 1, duration_value 2, target_type 3, target_value 4,
 * custom_target_value_low 5, custom_target_value_high 6, intensity 7,
 * notes 8, message_index 254). Valores de pulso/potencia > 100/1000 son
 * absolutos (+100 lpm / +1000 W); menores, % del máximo / del FTP. */

const WORKOUT_MESG = 26;
const WORKOUT_STEP_MESG = 27;
const FILE_ID_MESG = 0;
const FILE_TYPE_WORKOUT = 5;
const FILE_TYPE_ACTIVITY = 4;
const SPORT_CYCLING = 2;

const DURATION = { time: 0, open: 5, repeatUntilStepsComplete: 6 } as const;
const TARGET = { heartRate: 1, open: 2, cadence: 3, power: 4 } as const;
const INTENSITY: Record<number, IntervalType> = { 0: 'steady', 1: 'recovery', 2: 'warmup', 3: 'cooldown' };
/** Lo que dura un paso abierto (hasta que el atleta lo termine) o por distancia. */
export const OPEN_STEP_S = 300;

type FieldValue = number | string | null;

interface RawStep {
  index: number;
  name: string;
  durationType: number | null;
  durationValue: number | null;
  targetType: number | null;
  targetValue: number | null;
  low: number | null;
  high: number | null;
  intensity: number | null;
  notes: string;
}

export interface FitWorkoutParseResult {
  name: string;
  intervals: Interval[];
  comments: Comment[];
  /** Todos los pasos son por pulso o libres: arranca sin ERG. */
  allFree: boolean;
  errors: string[];
  warnings: string[];
}

/** Base types de FIT: tamaño y valor inválido (que significa "sin dato"). */
const INVALID: Record<number, number> = { 0x00: 0xff, 0x01: 0x7f, 0x02: 0xff, 0x0a: 0x00, 0x83: 0x7fff, 0x84: 0xffff, 0x8b: 0x0000, 0x85: 0x7fffffff, 0x86: 0xffffffff, 0x8c: 0x00000000 };

function readField(view: DataView, offset: number, size: number, baseType: number, le: boolean): FieldValue {
  if ((baseType & 0x1f) === 0x07) {
    let s = '';
    const bytes: number[] = [];
    for (let i = 0; i < size; i++) {
      const b = view.getUint8(offset + i);
      if (b === 0) break;
      bytes.push(b);
    }
    try {
      s = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch {
      s = String.fromCharCode(...bytes);
    }
    return s;
  }
  let v: number;
  if (size === 1) v = baseType === 0x01 ? view.getInt8(offset) : view.getUint8(offset);
  else if (size === 2) v = baseType === 0x83 ? view.getInt16(offset, le) : view.getUint16(offset, le);
  else if (size === 4) v = baseType === 0x85 ? view.getInt32(offset, le) : view.getUint32(offset, le);
  else return null;
  return INVALID[baseType] === v ? null : v;
}

const num = (v: FieldValue | undefined): number | null => (typeof v === 'number' ? v : null);
const str = (v: FieldValue | undefined): string => (typeof v === 'string' ? v.trim() : '');

/** Pulso del paso en lpm (absolutos > 100; si no, % del pulso máximo). */
function hrBpm(v: number | null, hrMax: number): number | null {
  if (v === null || v === 0) return null;
  return v > 100 ? v - 100 : Math.round((v / 100) * hrMax);
}

/** Zona de pulso 1-5 → rango en % del pulso máximo (50-60, 60-70…). */
function hrZoneRange(zone: number, hrMax: number): [number, number] {
  const lo = 40 + zone * 10;
  return [Math.round((lo / 100) * hrMax), Math.round(((lo + 10) / 100) * hrMax)];
}

/** Potencia del paso en % del FTP (absolutos > 1000 W; si no, ya es %). */
function powerPct(v: number | null, ftp: number): number | null {
  if (v === null || v === 0) return null;
  return v > 1000 ? Math.round(((v - 1000) / ftp) * 100) : v;
}

/** Zona de potencia 1-7 (Coggan) → % del FTP de en medio de la zona. */
const POWER_ZONE_MID = [0, 45, 65, 82, 97, 112, 135, 160];

/** % del pulso máximo → % del FTP aproximado, solo para pintar y estimar la
 * carga de un bloque por pulso (el rodillo no lo impone). */
function referencePctForHr(midBpm: number, hrMax: number): number {
  const hrPct = (midBpm / hrMax) * 100;
  return Math.max(40, Math.min(100, Math.round(45 + (hrPct - 60) * 1.5)));
}

export function parseFitWorkout(buffer: ArrayBuffer, opts: { ftp: number; hrMax: number }): FitWorkoutParseResult {
  const fail = (msg: string): FitWorkoutParseResult => ({ name: '', intervals: [], comments: [], allFree: false, errors: [msg], warnings: [] });
  if (buffer.byteLength < 14) return fail('el archivo es demasiado corto para ser un .fit válido');
  const view = new DataView(buffer);
  const headerSize = view.getUint8(0);
  const signature = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (signature !== '.FIT') return fail('el archivo no tiene la firma ".FIT": no es un archivo FIT válido');

  const dataEnd = Math.min(headerSize + view.getUint32(4, true), buffer.byteLength);
  const defs = new Map<number, { global: number; le: boolean; fields: { num: number; size: number; type: number }[]; devSize: number }>();
  let offset = headerSize;
  let fileType: number | null = null;
  let name = '';
  let sport: number | null = null;
  const steps: RawStep[] = [];

  try {
    while (offset < dataEnd) {
      const header = view.getUint8(offset++);
      if (header & 0x80) return fail('el archivo usa "compressed timestamp header", que todavía no soportamos');
      const local = header & 0x0f;
      if (header & 0x40) {
        offset += 1;
        const le = view.getUint8(offset++) === 0;
        const global = view.getUint16(offset, le);
        offset += 2;
        const n = view.getUint8(offset++);
        const fields = [];
        for (let i = 0; i < n; i++, offset += 3) fields.push({ num: view.getUint8(offset), size: view.getUint8(offset + 1), type: view.getUint8(offset + 2) });
        let devSize = 0;
        if (header & 0x20) {
          const nd = view.getUint8(offset++);
          for (let i = 0; i < nd; i++, offset += 3) devSize += view.getUint8(offset + 1);
        }
        defs.set(local, { global, le, fields, devSize });
        continue;
      }
      const def = defs.get(local);
      if (!def) return fail('mensaje sin definición previa: archivo corrupto o formato no reconocido');
      const values = new Map<number, FieldValue>();
      for (const f of def.fields) {
        values.set(f.num, readField(view, offset, f.size, f.type, def.le));
        offset += f.size;
      }
      offset += def.devSize;
      if (def.global === FILE_ID_MESG) fileType = num(values.get(0));
      else if (def.global === WORKOUT_MESG) {
        name = str(values.get(8));
        sport = num(values.get(4));
      } else if (def.global === WORKOUT_STEP_MESG) {
        steps.push({
          index: num(values.get(254)) ?? steps.length,
          name: str(values.get(0)),
          durationType: num(values.get(1)),
          durationValue: num(values.get(2)),
          targetType: num(values.get(3)),
          targetValue: num(values.get(4)),
          low: num(values.get(5)),
          high: num(values.get(6)),
          intensity: num(values.get(7)),
          notes: str(values.get(8)),
        });
      }
    }
  } catch {
    return fail('el archivo .fit está incompleto o dañado');
  }

  if (fileType === FILE_TYPE_ACTIVITY) return fail('este .fit es una actividad ya grabada, no un entrenamiento: súbela en «Agregar entrenamiento completado»');
  if (fileType !== FILE_TYPE_WORKOUT || steps.length === 0) return fail('este .fit no trae un entrenamiento (pasos) que se pueda importar');

  const warnings: string[] = [];
  if (sport !== null && sport !== SPORT_CYCLING) warnings.push('el entrenamiento no es de ciclismo; se importó igual');

  // Primero cada paso por separado; las repeticiones se arman después.
  const byIndex = new Map<number, { interval: Interval; note: string }>();
  const order: (number | { repeatFrom: number; times: number })[] = [];
  let openSteps = 0;
  for (const s of steps) {
    if (s.durationType === DURATION.repeatUntilStepsComplete) {
      order.push({ repeatFrom: s.durationValue ?? 0, times: Math.max(1, s.targetValue ?? 1) });
      continue;
    }
    let duration_s: number;
    if (s.durationType === DURATION.time && s.durationValue) duration_s = Math.max(1, Math.round(s.durationValue / 1000));
    else {
      duration_s = OPEN_STEP_S;
      openSteps++;
    }
    const kind = INTENSITY[s.intensity ?? 0] ?? 'steady';
    const label = s.name || { steady: 'Bloque', recovery: 'Recuperación', warmup: 'Calentamiento', cooldown: 'Enfriamiento' }[kind as 'steady'] || 'Bloque';
    let interval: Interval;
    if (s.targetType === TARGET.power) {
      const lo = powerPct(s.low, opts.ftp);
      const hi = powerPct(s.high, opts.ftp);
      const zone = !lo && !hi && s.targetValue ? POWER_ZONE_MID[Math.min(7, s.targetValue)] : null;
      const pct = zone ?? (lo !== null && hi !== null ? Math.round((lo + hi) / 2) : (lo ?? hi ?? 60));
      interval = { name: label, type: kind, duration_s, power_pct: pct };
    } else if (s.targetType === TARGET.heartRate) {
      let range: [number, number] | null = null;
      const lo = hrBpm(s.low, opts.hrMax);
      const hi = hrBpm(s.high, opts.hrMax);
      if (lo !== null || hi !== null) range = [lo ?? hi!, hi ?? lo!];
      else if (s.targetValue) range = hrZoneRange(Math.min(5, s.targetValue), opts.hrMax);
      interval = {
        name: label,
        type: 'free',
        duration_s,
        power_pct: range ? referencePctForHr((range[0] + range[1]) / 2, opts.hrMax) : 55,
        ...(range ? { hr_min: range[0], hr_ceiling: range[1] } : {}),
      };
    } else {
      interval = { name: label, type: 'free', duration_s, power_pct: kind === 'steady' ? 60 : 45 };
      if (s.targetType === TARGET.cadence && (s.low || s.high)) {
        if (s.low) interval.cadence_min = s.low;
        if (s.high) interval.cadence_max = s.high;
      }
    }
    byIndex.set(s.index, { interval, note: s.notes });
    order.push(s.index);
  }
  if (openSteps > 0) warnings.push(`${openSteps === 1 ? 'un paso abierto o por distancia quedó' : `${openSteps} pasos abiertos o por distancia quedaron`} de ${OPEN_STEP_S / 60} min`);

  // Desenrolla: "repite desde el paso N" repite lo que va de N hasta aquí.
  const flat: { interval: Interval; note: string }[] = [];
  const emittedIndex: number[] = [];
  for (const o of order) {
    if (typeof o === 'number') {
      flat.push(byIndex.get(o)!);
      emittedIndex.push(o);
      continue;
    }
    const start = emittedIndex.indexOf(o.repeatFrom);
    if (start < 0) continue;
    const block = flat.slice(start);
    const blockIdx = emittedIndex.slice(start);
    for (let r = 1; r < o.times; r++) {
      flat.push(...block);
      emittedIndex.push(...blockIdx);
    }
    // Nombres "x/n" para que el atleta sepa en cuál va, como en un .zwo.
    if (o.times > 1) {
      for (let r = 0; r < o.times; r++) {
        for (let k = 0; k < block.length; k++) {
          const pos = start + r * block.length + k;
          flat[pos] = { ...flat[pos], interval: { ...flat[pos].interval, name: `${block[k].interval.name} ${r + 1}/${o.times}` } };
        }
      }
    }
  }

  const comments: Comment[] = [];
  flat.forEach((f, i) => {
    if (f.note) comments.push({ interval: i + 1, offset_s: 0, message: f.note });
  });
  const intervals = flat.map((f) => f.interval);
  return {
    name: name || 'Entrenamiento importado',
    intervals,
    comments,
    allFree: intervals.every((iv) => iv.type === 'free'),
    errors: [],
    warnings,
  };
}
