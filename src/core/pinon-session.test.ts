import { describe, expect, it } from 'vitest';
import { pinonSessionComment } from './pinon-session';
import type { PinonSessionInput } from './pinon-session';

const base: PinonSessionInput = { minutes: 60, plannedMinutes: 60, intensityFactor: 0.7, rpe: 5, hrDriftPct: 2, zone: 'fondo', gender: 'f' };

describe('pinonSessionComment', () => {
  it('sesión completa, en el género del perfil', () => {
    expect(pinonSessionComment(base)).toBe('Bien hecha. 60 min de base completos. Así se construye el motor.');
    expect(pinonSessionComment({ ...base, gender: 'm' })).toMatch(/^Bien hecho\./);
    expect(pinonSessionComment({ ...base, gender: 'n' })).toMatch(/^Buen trabajo\./);
  });
  it('sin RPE, pide marcarlo', () => {
    expect(pinonSessionComment({ ...base, rpe: null })).toMatch(/Márcalo abajo/);
  });
  it('a medias: lo dice sin regañar', () => {
    const t = pinonSessionComment({ ...base, minutes: 30 });
    expect(t).toMatch(/^Hoy fueron 30 de 60 min/);
    expect(t).not.toMatch(/flojo|fallaste|mal/i);
  });
  it('se sintió más duro que los números', () => {
    expect(pinonSessionComment({ ...base, rpe: 9, intensityFactor: 0.65 })).toMatch(/más duro de lo que dicen los números/);
  });
  it('deriva de pulso en una larga', () => {
    expect(pinonSessionComment({ ...base, hrDriftPct: 11 })).toMatch(/pulso subió 11 %/);
  });
  it('corto y sin siglas', () => {
    const cases: PinonSessionInput[] = [base, { ...base, zone: 'VO2' }, { ...base, zone: 'test' }, { ...base, rpe: null, minutes: 10 }, { ...base, rpe: 3, intensityFactor: 0.95 }];
    for (const c of cases) {
      const t = pinonSessionComment(c);
      expect(t.length).toBeLessThanOrEqual(240);
      expect(t).not.toMatch(/\b(TSS|IF|NP|CTL|ATL|TSB)\b/);
    }
  });
});
