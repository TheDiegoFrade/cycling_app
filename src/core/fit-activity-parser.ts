import type { Sample } from './types';

/** Decodifica el protocolo binario FIT de una ACTIVIDAD grabada (Garmin,
 * Wahoo, Zwift, TrainingPeaks, etc.) — no confundir con un archivo FIT de
 * "workout" (plan estructurado, que no soportamos). Solo nos interesan los
 * mensajes "record" (uno por segundo/evento): timestamp, potencia, cadencia
 * y pulso. El resto de los campos/mensajes se saltan pero SÍ se consumen
 * los bytes correctos para no desalinear el resto del archivo.
 *
 * Referencia: FIT Protocol de Garmin (definition/data messages, base types,
 * campo común 253 = timestamp en cualquier tipo de mensaje). No valida el
 * CRC final — no hace falta para simplemente leer los datos. Los archivos
 * con "compressed timestamp header" (poco comunes en exports reales) no
 * están soportados: se reporta un error claro en vez de leer mal. */

const FIT_EPOCH_OFFSET_S = 631065600; // 1989-12-31T00:00:00Z, en segundos unix
const RECORD_MESG_NUM = 20;
const TIMESTAMP_FIELD_NUM = 253; // campo común a (casi) todos los tipos de mensaje
const POWER_FIELD_NUM = 7;
const CADENCE_FIELD_NUM = 4;
const HEART_RATE_FIELD_NUM = 3;

interface FieldDef {
  fieldDefNum: number;
  size: number;
}
interface DevFieldDef {
  size: number;
}
interface MessageDef {
  globalMsgNum: number;
  littleEndian: boolean;
  fields: FieldDef[];
  devFields: DevFieldDef[];
}
interface RawRecord {
  timestamp: number;
  power?: number;
  cadence?: number;
  heartRate?: number;
}

export interface FitActivityParseResult {
  samples: Sample[];
  startedAt: string | null;
  finishedAt: string | null;
  errors: string[];
}

function readUint(view: DataView, offset: number, size: number, littleEndian: boolean): number | null {
  if (size === 1) return view.getUint8(offset);
  if (size === 2) return view.getUint16(offset, littleEndian);
  if (size === 4) return view.getUint32(offset, littleEndian);
  return null;
}

export function parseFitActivity(buffer: ArrayBuffer): FitActivityParseResult {
  const errors: string[] = [];
  const empty = (msg: string): FitActivityParseResult => ({ samples: [], startedAt: null, finishedAt: null, errors: [msg] });

  if (buffer.byteLength < 14) return empty('el archivo es demasiado corto para ser un .fit válido');
  const view = new DataView(buffer);
  const headerSize = view.getUint8(0);
  const signature = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (signature !== '.FIT') return empty('el archivo no tiene la firma ".FIT" — no es un archivo FIT válido');

  const dataSize = view.getUint32(4, true);
  const dataEnd = Math.min(headerSize + dataSize, buffer.byteLength);
  let offset = headerSize;

  const localDefs = new Map<number, MessageDef>();
  const rawRecords: RawRecord[] = [];

  while (offset < dataEnd) {
    const headerByte = view.getUint8(offset);
    offset += 1;

    if (headerByte & 0x80) {
      errors.push('el archivo usa "compressed timestamp header", una variante del formato FIT que todavía no soportamos');
      break;
    }

    const isDefinition = (headerByte & 0x40) !== 0;
    const hasDevFields = (headerByte & 0x20) !== 0;
    const localType = headerByte & 0x0f;

    if (isDefinition) {
      offset += 1; // reserved
      const architecture = view.getUint8(offset);
      offset += 1;
      const littleEndian = architecture === 0;
      const globalMsgNum = view.getUint16(offset, littleEndian);
      offset += 2;
      const numFields = view.getUint8(offset);
      offset += 1;
      const fields: FieldDef[] = [];
      for (let i = 0; i < numFields; i++) {
        fields.push({ fieldDefNum: view.getUint8(offset), size: view.getUint8(offset + 1) });
        offset += 3;
      }
      const devFields: DevFieldDef[] = [];
      if (hasDevFields) {
        const numDevFields = view.getUint8(offset);
        offset += 1;
        for (let i = 0; i < numDevFields; i++) {
          devFields.push({ size: view.getUint8(offset + 1) });
          offset += 3;
        }
      }
      localDefs.set(localType, { globalMsgNum, littleEndian, fields, devFields });
      continue;
    }

    const def = localDefs.get(localType);
    if (!def) {
      errors.push(`mensaje de datos sin definición previa (tipo local ${localType}) — archivo corrupto o formato no reconocido`);
      break;
    }

    let timestamp: number | undefined;
    let power: number | undefined;
    let cadence: number | undefined;
    let heartRate: number | undefined;
    let truncated = false;

    for (const field of def.fields) {
      if (offset + field.size > buffer.byteLength) {
        errors.push('el archivo terminó a mitad de un mensaje — puede estar truncado');
        truncated = true;
        break;
      }
      if (field.fieldDefNum === TIMESTAMP_FIELD_NUM && field.size === 4) {
        timestamp = readUint(view, offset, 4, def.littleEndian) ?? undefined;
      } else if (def.globalMsgNum === RECORD_MESG_NUM && field.fieldDefNum === POWER_FIELD_NUM && field.size === 2) {
        const v = readUint(view, offset, 2, def.littleEndian);
        if (v !== null && v !== 0xffff) power = v;
      } else if (def.globalMsgNum === RECORD_MESG_NUM && field.fieldDefNum === CADENCE_FIELD_NUM && field.size === 1) {
        const v = view.getUint8(offset);
        if (v !== 0xff) cadence = v;
      } else if (def.globalMsgNum === RECORD_MESG_NUM && field.fieldDefNum === HEART_RATE_FIELD_NUM && field.size === 1) {
        const v = view.getUint8(offset);
        if (v !== 0xff) heartRate = v;
      }
      offset += field.size;
    }
    if (truncated) break;
    for (const devField of def.devFields) offset += devField.size;

    if (def.globalMsgNum === RECORD_MESG_NUM && timestamp !== undefined) {
      rawRecords.push({ timestamp, power, cadence, heartRate });
    }
  }

  if (rawRecords.length === 0) {
    errors.push('no se encontraron mensajes "record" con datos utilizables en este archivo');
    return { samples: [], startedAt: null, finishedAt: null, errors };
  }

  rawRecords.sort((a, b) => a.timestamp - b.timestamp);
  const startTimestamp = rawRecords[0].timestamp;
  const samples: Sample[] = rawRecords.map((r) => ({
    t: r.timestamp - startTimestamp,
    power: r.power ?? 0,
    cadence: r.cadence ?? 0,
    hr: r.heartRate ?? 0,
    target: 0,
    intensity: 100,
    interval_index: 0,
  }));

  const startedAt = new Date((startTimestamp + FIT_EPOCH_OFFSET_S) * 1000).toISOString();
  const finishedAt = new Date((rawRecords[rawRecords.length - 1].timestamp + FIT_EPOCH_OFFSET_S) * 1000).toISOString();

  return { samples, startedAt, finishedAt, errors };
}
