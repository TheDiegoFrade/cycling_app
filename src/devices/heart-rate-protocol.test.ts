import { describe, expect, it } from 'vitest';
import { parseHeartRateMeasurement } from './heart-rate-protocol';

function dv(bytes: number[]): DataView {
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('parseHeartRateMeasurement', () => {
  it('lee uint8 cuando el bit 0 de las banderas es 0', () => {
    expect(parseHeartRateMeasurement(dv([0x00, 142]))).toBe(142);
  });

  it('lee uint16 little-endian cuando el bit 0 de las banderas es 1', () => {
    // 300 lpm (fuera de rango humano, pero sirve para probar el parseo de 2 bytes)
    expect(parseHeartRateMeasurement(dv([0x01, 0x2c, 0x01]))).toBe(300);
  });
});
