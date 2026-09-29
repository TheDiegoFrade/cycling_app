import { describe, expect, it } from 'vitest';
import { parseErg, parseMrc } from './course-format-parser';

const SAMPLE_MRC = `[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = Ramp de prueba
FILE NAME = ramp.mrc
MINUTES PERCENT
[END COURSE HEADER]
[COURSE DATA]
0.00\t50
10.00\t50
10.00\t75
20.00\t90
[END COURSE DATA]
`;

const SAMPLE_ERG = `[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = Ramp en watts
FILE NAME = ramp.erg
MINUTES WATTS
[END COURSE HEADER]
[COURSE DATA]
0.00\t81
10.00\t90
10.00\t92
20.00\t101
[END COURSE DATA]
`;

describe('parseMrc', () => {
  it('lee el nombre desde DESCRIPTION', () => {
    expect(parseMrc(SAMPLE_MRC).name).toBe('Ramp de prueba');
  });

  it('un bloque plano (mismo % en ambos extremos) no lleva ramp_to_pct', () => {
    const result = parseMrc(SAMPLE_MRC);
    expect(result.errors).toEqual([]);
    expect(result.intervals[0]).toMatchObject({ duration_s: 600, power_pct: 50, ramp_to_pct: undefined });
  });

  it('un salto de valor en el mismo minuto no genera un bloque de duración 0', () => {
    const result = parseMrc(SAMPLE_MRC);
    // 0-10min plano(50), salto instantáneo a 75 en el minuto 10, luego rampa 75->90 de 10 a 20
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[1]).toMatchObject({ duration_s: 600, power_pct: 75, ramp_to_pct: 90 });
  });

  it('reporta error si falta [COURSE DATA]', () => {
    const result = parseMrc('[COURSE HEADER]\n[END COURSE HEADER]\n');
    expect(result.errors.some((e) => e.includes('COURSE DATA'))).toBe(true);
    expect(result.intervals).toEqual([]);
  });
});

describe('parseErg', () => {
  it('convierte watts absolutos a % de FTP usando el FTP dado', () => {
    const result = parseErg(SAMPLE_ERG, 184);
    expect(result.errors).toEqual([]);
    // 81/184=44%, 90/184=49%, 92/184=50%, 101/184=55%
    expect(result.intervals[0]).toMatchObject({ duration_s: 600, power_pct: 44, ramp_to_pct: 49 });
    expect(result.intervals[1]).toMatchObject({ duration_s: 600, power_pct: 50, ramp_to_pct: 55 });
  });

  it('reporta error claro si no hay FTP válido, sin lanzar', () => {
    const result = parseErg(SAMPLE_ERG, 0);
    expect(result.errors.some((e) => e.includes('FTP'))).toBe(true);
  });
});
