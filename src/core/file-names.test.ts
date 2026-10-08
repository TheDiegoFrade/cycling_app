import { describe, expect, it } from 'vitest';
import { fitFileName } from './file-names';

describe('fitFileName', () => {
  it('fecha, atleta y sesión sin acentos ni espacios', () => {
    expect(fitFileName('Ana Ramírez', '2026-09-27T12:00:00Z', 'Umbral 3×12')).toBe('2026-09-27_ana-ramirez_umbral-3-12.fit');
    expect(fitFileName('', '2026-09-27T12:00:00Z', '¡¿?!')).toBe('2026-09-27_sesion_sesion.fit');
    expect(fitFileName('José Ñúñez', '2026-01-02', 'Rodada larga / Garmin')).toBe('2026-01-02_jose-nunez_rodada-larga-garmin.fit');
  });
});
