/** `heart_rate_measurement`: el bit 0 de las banderas dice si el valor de
 * pulso viene en uint8 (byte 1) o uint16 little-endian (bytes 1–2).
 * Devuelve `null` ante un paquete más corto de lo que anuncian sus propias
 * banderas — un sensor real con firmware rara (o un paquete BLE truncado
 * por interferencia) puede mandar uno así, y sin este chequeo el `DataView`
 * lanza un `RangeError` sin capturar dentro del callback nativo de
 * Bluetooth, justo el tipo de excepción que puede desestabilizar la pestaña. */
export function parseHeartRateMeasurement(data: DataView): number | null {
  if (data.byteLength < 2) return null;
  const flags = data.getUint8(0);
  const isUint16 = (flags & 0x01) === 1;
  if (isUint16 && data.byteLength < 3) return null;
  return isUint16 ? data.getUint16(1, true) : data.getUint8(1);
}

/** Intervalos RR del mismo paquete, en milisegundos: vienen si el bit 4 de
 * las banderas está prendido, después del pulso y del gasto energético (bit
 * 3, uint16), como uint16 en unidades de 1/1024 s. Una banda manda 0, 1 o
 * varios por paquete (uno por latido desde el anterior aviso). Lo que no
 * cabe completo se ignora, igual que en `parseHeartRateMeasurement`; los
 * valores fuera de 250–2500 ms (240–24 lpm) son ruido de contacto. */
export function parseRrIntervals(data: DataView): number[] {
  if (data.byteLength < 2) return [];
  const flags = data.getUint8(0);
  if ((flags & 0x10) === 0) return [];
  let offset = 1 + ((flags & 0x01) === 1 ? 2 : 1) + ((flags & 0x08) !== 0 ? 2 : 0);
  const out: number[] = [];
  for (; offset + 2 <= data.byteLength; offset += 2) {
    const ms = Math.round((data.getUint16(offset, true) * 1000) / 1024);
    if (ms >= 250 && ms <= 2500) out.push(ms);
  }
  return out;
}
