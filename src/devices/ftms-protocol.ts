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
 * desalinear el offset.
 *
 * Antes de cada lectura se verifica que el paquete tenga suficientes bytes:
 * un rodillo real puede mandar, sobre todo justo al conectar/reenganchar
 * ERG, un paquete más corto de lo que anuncian sus propias banderas (BLE
 * truncado, firmware con un bug, interferencia). Sin este chequeo
 * `DataView.getUint16/getInt16` lanza un `RangeError` sin capturar dentro
 * del callback nativo de `characteristicvaluechanged` — varias veces por
 * segundo si el rodillo sigue mandando el mismo paquete malformado — que es
 * justo el tipo de excepción que puede desestabilizar la pestaña. */
export function parseIndoorBikeData(data: DataView): IndoorBikeReading {
  if (data.byteLength < 2) return { power: null, cadence: null };
  const flags = data.getUint16(0, true);
  let offset = 2;
  let cadence: number | null = null;
  let power: number | null = null;
  const canRead = (bytes: number) => offset + bytes <= data.byteLength;

  if ((flags & FLAG_MORE_DATA) === 0) {
    offset += 2; // instantaneous speed, no la usamos
  }
  if (flags & FLAG_AVG_SPEED) offset += 2;
  if (flags & FLAG_INST_CADENCE) {
    if (canRead(2)) cadence = data.getUint16(offset, true) / 2;
    offset += 2;
  }
  if (flags & FLAG_AVG_CADENCE) offset += 2;
  if (flags & FLAG_TOTAL_DISTANCE) offset += 3;
  if (flags & FLAG_RESISTANCE) offset += 2;
  if (flags & FLAG_INST_POWER) {
    if (canRead(2)) power = data.getInt16(offset, true);
    offset += 2;
  }

  return { power, cadence };
}

export const CONTROL_POINT_OPCODE = {
  requestControl: 0x00,
  setTargetPower: 0x05,
  start: 0x07,
  setResistanceLevel: 0x04,
  setIndoorBikeSimulation: 0x11,
} as const;

/** `fitness_machine_feature`: dos campos de 32 bits (lo que mide y lo que se
 * le puede pedir). Solo nos interesa el segundo: qué modos de control acepta. */
export interface FtmsTargetFeatures {
  resistance: boolean;
  power: boolean;
  simulation: boolean;
}

export function parseFitnessMachineFeature(data: DataView): FtmsTargetFeatures | null {
  if (data.byteLength < 8) return null;
  const target = data.getUint32(4, true);
  return { resistance: (target & (1 << 2)) !== 0, power: (target & (1 << 3)) !== 0, simulation: (target & (1 << 13)) !== 0 };
}

/** Calle simulada (sin ERG), como Rouvy, Zwift o MyWhoosh: el rodillo
 * calcula el freno con tu velocidad real, la pendiente, el rodamiento y el
 * aire, así que se siente con inercia y el esfuerzo lo pones tú con los
 * cambios. Valores por defecto: sin viento, asfalto (Crr 0.004) y un
 * ciclista en posición normal (CdA·ρ/2 ≈ 0.51 kg/m). */
export function buildSetIndoorBikeSimulation(gradePct: number, opts: { windSpeedMs?: number; crr?: number; cwKgPerM?: number } = {}): Uint8Array {
  const buf = new ArrayBuffer(7);
  const dv = new DataView(buf);
  dv.setUint8(0, CONTROL_POINT_OPCODE.setIndoorBikeSimulation);
  dv.setInt16(1, Math.round((opts.windSpeedMs ?? 0) * 1000), true); // m/s, resolución 0.001
  dv.setInt16(3, Math.round(gradePct * 100), true); // %, resolución 0.01
  dv.setUint8(5, Math.round((opts.crr ?? 0.004) * 10000)); // resolución 0.0001
  dv.setUint8(6, Math.round((opts.cwKgPerM ?? 0.51) * 100)); // kg/m, resolución 0.01
  return new Uint8Array(buf);
}

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
