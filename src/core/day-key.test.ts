import { describe, expect, it } from 'vitest';
import { addDaysKey, dayKeyOf, localDateKey, planStartKey } from './day-key';

const MX = 'America/Mexico_City';

describe('día en la zona del atleta', () => {
  it('una sesión de la noche cae en su día, no en el siguiente (UTC)', () => {
    // 7:49 pm del lunes 5 de octubre en CDMX = 01:49 del 6 en UTC
    expect(dayKeyOf('2026-10-06T01:49:57.138+00:00', MX)).toBe('2026-10-05');
    expect(dayKeyOf('2026-10-06T01:49:57.138+00:00', 'UTC')).toBe('2026-10-06');
  });

  it('hoy por la noche sigue siendo hoy', () => {
    // jueves 8 a las 11:10 pm en CDMX = viernes 9 a las 05:10 UTC
    expect(localDateKey(new Date('2026-10-09T05:10:00Z'), MX)).toBe('2026-10-08');
  });

  it('cambio de mes y de año', () => {
    expect(dayKeyOf('2026-11-01T03:00:00Z', MX)).toBe('2026-10-31');
    expect(dayKeyOf('2027-01-01T05:59:59Z', MX)).toBe('2026-12-31');
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('una clave YYYY-MM-DD se queda igual', () => {
    expect(dayKeyOf('2026-10-05', MX)).toBe('2026-10-05');
  });
});

describe('planStartKey: desde qué día arranca un plan nuevo', () => {
  it('antes de las 4 pm: hoy', () => {
    expect(planStartKey(new Date(2026, 10, 5, 9, 30))).toBe('2026-11-05');
    expect(planStartKey(new Date(2026, 10, 5, 15, 59))).toBe('2026-11-05');
  });
  it('de las 4 pm en adelante: mañana (un jueves en la noche arranca el viernes)', () => {
    expect(planStartKey(new Date(2026, 10, 5, 16, 0))).toBe('2026-11-06');
    expect(planStartKey(new Date(2026, 10, 5, 22, 45))).toBe('2026-11-06');
  });
  it('fin de mes y de año', () => {
    expect(planStartKey(new Date(2026, 11, 31, 20, 0))).toBe('2027-01-01');
  });
});
