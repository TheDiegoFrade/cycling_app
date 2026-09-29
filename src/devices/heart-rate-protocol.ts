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
