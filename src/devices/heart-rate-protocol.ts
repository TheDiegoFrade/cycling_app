/** `heart_rate_measurement`: el bit 0 de las banderas dice si el valor de
 * pulso viene en uint8 (byte 1) o uint16 little-endian (bytes 1–2). */
export function parseHeartRateMeasurement(data: DataView): number {
  const flags = data.getUint8(0);
  const isUint16 = (flags & 0x01) === 1;
  return isUint16 ? data.getUint16(1, true) : data.getUint8(1);
}
