import { describe, expect, it } from 'vitest';
import { parseHeartRateMeasurement, parseRrIntervals } from './heart-rate-protocol';

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

  it('devuelve null (no lanza) si el paquete no trae ni las banderas', () => {
    expect(parseHeartRateMeasurement(dv([]))).toBeNull();
  });

  it('devuelve null si las banderas dicen uint16 pero el paquete solo trae 1 byte de valor', () => {
    expect(parseHeartRateMeasurement(dv([0x01, 142]))).toBeNull();
  });
});

describe('parseRrIntervals', () => {
  it('sin el bit 4 no hay RR', () => {
    expect(parseRrIntervals(dv([0x00, 142]))).toEqual([]);
  });

  it('lee varios RR (1/1024 s) después de un pulso uint8', () => {
    // 1024 → 1000 ms, 820 → 801 ms
    expect(parseRrIntervals(dv([0x10, 60, 0x00, 0x04, 0x34, 0x03]))).toEqual([1000, 801]);
  });

  it('salta el pulso uint16 y el gasto energético', () => {
    expect(parseRrIntervals(dv([0x19, 0x8c, 0x00, 0x10, 0x00, 0x00, 0x04]))).toEqual([1000]);
  });

  it('ignora un RR cortado y los valores imposibles', () => {
    expect(parseRrIntervals(dv([0x10, 60, 0x00, 0x04, 0x05]))).toEqual([1000]);
    expect(parseRrIntervals(dv([0x10, 60, 0x10, 0x00]))).toEqual([]); // 16 ms
  });
});
