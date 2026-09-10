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
  start: 0x07,
  setTargetPower: 0x05,
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
