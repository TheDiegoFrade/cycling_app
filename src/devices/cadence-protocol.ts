/** Parseo del sensor de cadencia estándar de Bluetooth (servicio
 * `cycling_speed_and_cadence`, característica `csc_measurement`), aislado de
 * Web Bluetooth para poder probarlo sin hardware.
 *
 * El sensor no manda rpm: manda un contador acumulado de vueltas del pedal
 * y la hora (en 1/1024 s) de la última vuelta. La cadencia sale de la
 * diferencia entre dos lecturas. Los dos contadores dan la vuelta (16 bits). */

const FLAG_WHEEL = 1 << 0; // trae vueltas de rueda (uint32 + uint16): se saltan
const FLAG_CRANK = 1 << 1; // trae vueltas de pedal (uint16 + uint16)

export interface CrankData {
  /** Vueltas de pedal acumuladas (0–65535, da la vuelta). */
  revs: number;
  /** Hora de la última vuelta, en 1/1024 s (0–65535, da la vuelta). */
  eventTime: number;
}

/** null si el paquete no trae datos de pedal o viene truncado. */
export function parseCscMeasurement(data: DataView): CrankData | null {
  if (data.byteLength < 1) return null;
  const flags = data.getUint8(0);
  if (!(flags & FLAG_CRANK)) return null;
  const offset = 1 + (flags & FLAG_WHEEL ? 6 : 0);
  if (data.byteLength < offset + 4) return null;
  return { revs: data.getUint16(offset, true), eventTime: data.getUint16(offset + 2, true) };
}

/** Sin una vuelta nueva en este tiempo, la cadencia es 0 (dejó de pedalear). */
export const CADENCE_STALE_MS = 3000;
/** Por encima de esto es ruido del sensor, no pedaleo real. */
const MAX_RPM = 250;

/** Convierte lecturas sucesivas del sensor en rpm. Los sensores repiten el
 * mismo paquete varias veces por segundo mientras no hay vuelta nueva: ahí se
 * conserva la última cadencia hasta que pasan `CADENCE_STALE_MS` sin vueltas. */
export class CadenceCalculator {
  private last: CrankData | null = null;
  private lastChangeAt = 0;
  private rpm = 0;

  /** `nowMs`: reloj del navegador al recibir el paquete. Devuelve la cadencia. */
  push(crank: CrankData, nowMs: number): number {
    const prev = this.last;
    this.last = crank;
    if (!prev) {
      this.lastChangeAt = nowMs;
      return this.rpm;
    }
    const dRevs = (crank.revs - prev.revs + 0x10000) & 0xffff;
    const dTime = (crank.eventTime - prev.eventTime + 0x10000) & 0xffff;
    if (dRevs === 0 || dTime === 0) return this.current(nowMs);
    this.lastChangeAt = nowMs;
    const rpm = (dRevs * 60 * 1024) / dTime;
    this.rpm = rpm > MAX_RPM ? this.rpm : Math.round(rpm);
    return this.rpm;
  }

  /** La cadencia en este momento (0 si lleva rato sin vueltas nuevas). */
  current(nowMs: number): number {
    if (nowMs - this.lastChangeAt > CADENCE_STALE_MS) this.rpm = 0;
    return this.rpm;
  }
}
