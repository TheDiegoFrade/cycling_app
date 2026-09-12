import { describe, expect, it } from 'vitest';
import { encodeFitActivity } from './fit';
import { fitCrc16 } from './fit-crc';
import type { Profile, Sample } from '../core/types';

const profile: Profile = { ftp: 250, hr_max: 190, cadence_floor: 70, hr_ceiling: 176 };

function sample(t: number, interval_index: number, power = 150, cadence = 90, hr = 130): Sample {
  return { t, power, cadence, hr, target: 150, intensity: 100, interval_index };
}

/** Lector mínimo y genérico de FIT (no sabe qué significa cada campo, solo
 * respeta el formato self-describing de definition/data messages) para
 * verificar la estructura del archivo sin duplicar los números mágicos del
 * encoder. */
function readMessageCounts(file: Uint8Array): Record<number, number> {
  const dataSize = file[4] | (file[5] << 8) | (file[6] << 16) | (file[7] << 24);
  const defs = new Map<number, { globalNum: number; fieldSizes: number[] }>();
  const counts: Record<number, number> = {};
  let offset = 14;
  const end = 14 + dataSize;
  while (offset < end) {
    const header = file[offset++];
    const localType = header & 0x0f;
    const isDefinition = (header & 0x40) !== 0;
    if (isDefinition) {
      offset += 2; // reserved + architecture
      const globalNum = file[offset] | (file[offset + 1] << 8);
      offset += 2;
      const numFields = file[offset++];
      const fieldSizes: number[] = [];
      for (let i = 0; i < numFields; i++) {
        offset++; // field num
        fieldSizes.push(file[offset++]);
        offset++; // base type
      }
      defs.set(localType, { globalNum, fieldSizes });
    } else {
      const def = defs.get(localType);
      if (!def) throw new Error(`data message sin definition previa (local type ${localType})`);
      offset += def.fieldSizes.reduce((a, b) => a + b, 0);
      counts[def.globalNum] = (counts[def.globalNum] ?? 0) + 1;
    }
  }
  return counts;
}

const GLOBAL = { fileId: 0, record: 20, lap: 19, session: 18, activity: 34 };

describe('encodeFitActivity', () => {
  it('la cabecera tiene el tamaño, la firma .FIT y el CRC correctos', () => {
    const file = encodeFitActivity(new Date('2026-01-01T10:00:00Z'), [sample(0, 0)], profile);
    expect(file[0]).toBe(14); // header_size
    expect(String.fromCharCode(...file.subarray(8, 12))).toBe('.FIT');
    const headerCrc = file[12] | (file[13] << 8);
    expect(headerCrc).toBe(fitCrc16(file.subarray(0, 12)));
  });

  it('data_size en la cabecera coincide con los bytes reales entre cabecera y CRC final', () => {
    const file = encodeFitActivity(new Date('2026-01-01T10:00:00Z'), [sample(0, 0), sample(1, 0)], profile);
    const dataSize = file[4] | (file[5] << 8) | (file[6] << 16) | (file[7] << 24);
    expect(file.length).toBe(14 + dataSize + 2);
  });

  it('el CRC final cubre todo el archivo salvo los últimos 2 bytes', () => {
    const file = encodeFitActivity(new Date('2026-01-01T10:00:00Z'), [sample(0, 0)], profile);
    const trailingCrc = file[file.length - 2] | (file[file.length - 1] << 8);
    expect(trailingCrc).toBe(fitCrc16(file.subarray(0, file.length - 2)));
  });

  it('escribe un record por muestra y un lap por cada intervalo consecutivo', () => {
    const samples = [
      sample(0, 0),
      sample(1, 0),
      sample(2, 1),
      sample(3, 1),
      sample(4, 1),
      sample(5, 2),
    ];
    const file = encodeFitActivity(new Date('2026-01-01T10:00:00Z'), samples, profile);
    const counts = readMessageCounts(file);
    expect(counts[GLOBAL.record]).toBe(6);
    expect(counts[GLOBAL.lap]).toBe(3);
    expect(counts[GLOBAL.fileId]).toBe(1);
    expect(counts[GLOBAL.session]).toBe(1);
    expect(counts[GLOBAL.activity]).toBe(1);
  });

  it('no revienta con una sola muestra (sesión mínima)', () => {
    const file = encodeFitActivity(new Date('2026-01-01T10:00:00Z'), [sample(0, 0)], profile);
    const counts = readMessageCounts(file);
    expect(counts[GLOBAL.record]).toBe(1);
    expect(counts[GLOBAL.lap]).toBe(1);
  });
});
