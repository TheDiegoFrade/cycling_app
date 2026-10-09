import { describe, expect, it } from 'vitest';
import { startPhase } from './self-report-start';

describe('arranque en el reporte mensual sin coach', () => {
  it('sin fecha o desde antes del mes: reporte normal', () => {
    expect(startPhase(null, '2026-11')).toEqual({ kind: 'regular' });
    expect(startPhase('2026-08-20', '2026-11')).toEqual({ kind: 'regular' });
    expect(startPhase('2026-11-01', '2026-11')).toEqual({ kind: 'regular' }); // el día 1 es un mes completo
  });

  it('empezó a mitad del mes con días suficientes: se evalúa desde su fecha', () => {
    expect(startPhase('2026-10-14', '2026-10')).toEqual({ kind: 'first_partial', startedOn: '2026-10-14' }); // 18 días
    expect(startPhase('2026-10-18', '2026-10')).toEqual({ kind: 'first_partial', startedOn: '2026-10-18' }); // 14 días justos
  });

  it('empezó al final del mes: sin reporte propio, va en el siguiente', () => {
    expect(startPhase('2026-10-28', '2026-10')).toEqual({ kind: 'skip_short_first', startedOn: '2026-10-28', days: 4 });
    expect(startPhase('2026-10-28', '2026-11')).toEqual({ kind: 'first_full_after_short', startedOn: '2026-10-28' });
    // febrero corto: el 16 deja 13 días
    expect(startPhase('2027-02-16', '2027-02').kind).toBe('skip_short_first');
  });

  it('después de un arranque largo, el mes siguiente ya es normal', () => {
    expect(startPhase('2026-10-14', '2026-11')).toEqual({ kind: 'regular' });
  });
});
