/** Parseo y construcción de mensajes FTMS (`fitness_machine`), aislado de
 * Web Bluetooth para poder probarlo sin hardware. Ver SPEC.md § Dispositivos. */

export interface IndoorBikeReading {
  power: number | null;
  cadence: number | null;
}

const FLAG_MORE_DATA = 1 << 0; // si está en 1, NO viene instantaneous speed
const FLAG_AVG_SPEED = 1 << 1;
const FLAG_INST_CADENCE = 1 << 2;
const FLAG_AVG_CADENCE = 1 << 3;
const FLAG_TOTAL_DISTANCE = 1 << 4;
const FLAG_RESISTANCE = 1 << 5;
const FLAG_INST_POWER = 1 << 6;

/** `indoor_bike_data`: banderas de 16 bits, luego los campos presentes en
 * orden fijo. Solo nos interesan cadencia (0.5 rpm/unidad) y potencia
 * (W, int16), pero hay que consumir los campos anteriores para no
 * desalinear el offset. */
export function parseIndoorBikeData(data: DataView): IndoorBikeReading {
  const flags = data.getUint16(0, true);
  let offset = 2;
  let cadence: number | null = null;
  let power: number | null = null;

  if ((flags & FLAG_MORE_DATA) === 0) {
    offset += 2; // instantaneous speed, no la usamos
  }
  if (flags & FLAG_AVG_SPEED) offset += 2;
  if (flags & FLAG_INST_CADENCE) {
    cadence = data.getUint16(offset, true) / 2;
    offset += 2;
  }
  if (flags & FLAG_AVG_CADENCE) offset += 2;
  if (flags & FLAG_TOTAL_DISTANCE) offset += 3;
  if (flags & FLAG_RESISTANCE) offset += 2;
  if (flags & FLAG_INST_POWER) {
    power = data.getInt16(offset, true);
    offset += 2;
  }

  return { power, cadence };
}

export const CONTROL_POINT_OPCODE = {
  requestControl: 0x00,
  setTargetPower: 0x05,
  start: 0x07,
  setResistanceLevel: 0x04,
} as const;

export function buildRequestControl(): Uint8Array {
  return new Uint8Array([CONTROL_POINT_OPCODE.requestControl]);
}

export function buildStart(): Uint8Array {
  return new Uint8Array([CONTROL_POINT_OPCODE.start]);
}

export function buildSetTargetPower(watts: number): Uint8Array {
  const buf = new ArrayBuffer(3);
  const dv = new DataView(buf);
  dv.setUint8(0, CONTROL_POINT_OPCODE.setTargetPower);
  dv.setInt16(1, Math.round(watts), true);
  return new Uint8Array(buf);
}

/** Saca al rodillo de modo ERG (potencia fija) y lo pasa a resistencia fija
 * — deja de perseguir un objetivo en watts, así que el esfuerzo vuelve a
 * depender de qué tan rápido pedaleas. `percent` es 0–100 y se manda con
 * la resolución de 0.1 que pide el estándar FTMS. Sin verificar contra
 * hardware real: el mapeo de "nivel de resistencia" a sensación física es
 * específico de cada fabricante. */
export function buildSetResistanceLevel(percent: number): Uint8Array {
  const buf = new ArrayBuffer(3);
  const dv = new DataView(buf);
  dv.setUint8(0, CONTROL_POINT_OPCODE.setResistanceLevel);
  dv.setInt16(1, Math.round(percent * 10), true);
  return new Uint8Array(buf);
}

export const CONTROL_POINT_RESULT = {
  success: 1,
  opCodeNotSupported: 2,
  invalidParameter: 3,
  operationFailed: 4,
  controlNotPermitted: 5,
} as const;

export interface ControlPointResponse {
  requestOpCode: number;
  resultCode: number;
}

/** Cada comando al control point dispara una respuesta (notify/indicate) en
 * la misma característica: `0x80` + el opcode que se está respondiendo +
 * un código de resultado. Un `resultCode` distinto de `success` (p. ej.
 * `controlNotPermitted`) es la señal real de que el rodillo salió de modo
 * ERG — el aviso de "ERG desenganchado" que ya existía solo detecta el
 * síntoma (potencia muy por debajo del objetivo), esto detecta la causa. */
export function parseControlPointResponse(data: DataView): ControlPointResponse | null {
  if (data.byteLength < 3 || data.getUint8(0) !== 0x80) return null;
  return { requestOpCode: data.getUint8(1), resultCode: data.getUint8(2) };
}
