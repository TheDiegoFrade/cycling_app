import { describe, expect, it } from 'vitest';
import { parseFitActivity } from './fit-activity-parser';

const FIT_EPOCH_OFFSET_S = 631065600;

/** Arma un .fit mínimo válido a mano: header + una definición de "record"
 * (timestamp, heart_rate, cadence, power) + N mensajes de datos. Sin CRC
 * final — el parser no lo valida. */
function buildFitActivity(records: { timestamp: number; hr: number; cadence: number; power: number }[]): ArrayBuffer {
  const defBytes = [
    0x40, // header: definition message, local type 0
    0x00, // reserved
    0x00, // architecture: little-endian
    20,
    0x00, // global msg num 20 (record), uint16 LE
    4, // num fields
    253,
    4,
    0x86, // timestamp: field 253, size 4, base type uint32
    3,
    1,
    0x02, // heart_rate: field 3, size 1, base type uint8
    4,
    1,
    0x02, // cadence: field 4, size 1, base type uint8
    7,
    2,
    0x84, // power: field 7, size 2, base type uint16
  ];

  const recordBytes: number[] = [];
  for (const r of records) {
    recordBytes.push(0x00); // header: data message, local type 0
    // timestamp (uint32 LE)
    recordBytes.push(r.timestamp & 0xff, (r.timestamp >> 8) & 0xff, (r.timestamp >> 16) & 0xff, (r.timestamp >> 24) & 0xff);
    recordBytes.push(r.hr);
    recordBytes.push(r.cadence);
    recordBytes.push(r.power & 0xff, (r.power >> 8) & 0xff);
  }

  const dataBytes = [...defBytes, ...recordBytes];
  const headerSize = 12;
  const header = new Uint8Array(headerSize);
  header[0] = headerSize;
  header[1] = 0x10; // protocol version, arbitrario
  header[2] = 0;
  header[3] = 0; // profile version, arbitrario
  const dataSize = dataBytes.length;
  header[4] = dataSize & 0xff;
  header[5] = (dataSize >> 8) & 0xff;
  header[6] = (dataSize >> 16) & 0xff;
  header[7] = (dataSize >> 24) & 0xff;
  header.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"

  const full = new Uint8Array(headerSize + dataBytes.length);
  full.set(header, 0);
  full.set(dataBytes, headerSize);
  return full.buffer;
}

describe('parseFitActivity', () => {
  it('decodifica timestamp/potencia/cadencia/pulso de mensajes record', () => {
    const base = 100000;
    const buffer = buildFitActivity([
      { timestamp: base, hr: 120, cadence: 85, power: 150 },
      { timestamp: base + 1, hr: 125, cadence: 87, power: 160 },
      { timestamp: base + 2, hr: 130, cadence: 90, power: 170 },
    ]);
    const result = parseFitActivity(buffer);
    expect(result.errors).toEqual([]);
    expect(result.samples).toEqual([
      { t: 0, power: 150, cadence: 85, hr: 120, target: 0, intensity: 100, interval_index: 0 },
      { t: 1, power: 160, cadence: 87, hr: 125, target: 0, intensity: 100, interval_index: 0 },
      { t: 2, power: 170, cadence: 90, hr: 130, target: 0, intensity: 100, interval_index: 0 },
    ]);
    expect(result.startedAt).toBe(new Date((base + FIT_EPOCH_OFFSET_S) * 1000).toISOString());
    expect(result.finishedAt).toBe(new Date((base + 2 + FIT_EPOCH_OFFSET_S) * 1000).toISOString());
  });

  it('reporta error claro si falta la firma .FIT', () => {
    const bad = new Uint8Array(20);
    const result = parseFitActivity(bad.buffer);
    expect(result.errors.some((e) => e.includes('.FIT'))).toBe(true);
    expect(result.samples).toEqual([]);
  });

  it('reporta error si el archivo es demasiado corto', () => {
    const result = parseFitActivity(new Uint8Array(5).buffer);
    expect(result.errors.some((e) => e.includes('corto'))).toBe(true);
  });

  it('valores inválidos (0xFF/0xFFFF) de cadencia/pulso/potencia caen a 0, no se usan como dato real', () => {
    const buffer = buildFitActivity([{ timestamp: 100000, hr: 0xff, cadence: 0xff, power: 0xffff }]);
    const result = parseFitActivity(buffer);
    expect(result.samples[0]).toMatchObject({ power: 0, cadence: 0, hr: 0 });
  });
});
