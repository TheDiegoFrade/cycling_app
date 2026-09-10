import { describe, expect, it } from 'vitest';
import { fitCrc16 } from './fit-crc';

describe('fitCrc16', () => {
  it('el CRC de un arreglo vacío es 0', () => {
    expect(fitCrc16([])).toBe(0);
  });

  it('es determinista para la misma entrada', () => {
    const bytes = [1, 2, 3, 4, 5, 250, 0, 128];
    expect(fitCrc16(bytes)).toBe(fitCrc16(bytes));
  });

  it('cambia si cambia cualquier byte (no es una suma trivial)', () => {
    const a = fitCrc16([1, 2, 3]);
    const b = fitCrc16([1, 2, 4]);
    const c = fitCrc16([3, 2, 1]);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('siempre cabe en 16 bits', () => {
    const crc = fitCrc16(Array.from({ length: 300 }, (_, i) => i % 256));
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xffff);
  });
});
