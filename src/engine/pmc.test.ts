import { describe, expect, it } from 'vitest';
import { computePmc } from './pmc';

const CTL_FACTOR = 1 - Math.exp(-1 / 42);
const ATL_FACTOR = 1 - Math.exp(-1 / 7);

describe('computePmc', () => {
  it('arreglo vacío da una serie vacía', () => {
    expect(computePmc([])).toEqual([]);
  });

  it('un solo día: CTL/ATL parten de 0 y absorben el TSS del día con su propio factor; TSB del primer día es 0', () => {
    const points = computePmc([{ dateKey: '2026-01-01', tss: 100 }]);
    expect(points).toHaveLength(1);
    expect(points[0].dateKey).toBe('2026-01-01');
    expect(points[0].ctl).toBeCloseTo(100 * CTL_FACTOR, 10);
    expect(points[0].atl).toBeCloseTo(100 * ATL_FACTOR, 10);
    expect(points[0].tsb).toBe(0);
  });

  it('TSB de un día usa el CTL/ATL de fin del día anterior (la forma con la que arrancas)', () => {
    const points = computePmc([
      { dateKey: '2026-01-01', tss: 100 },
      { dateKey: '2026-01-02', tss: 100 },
    ]);
    const ctlDay1 = 100 * CTL_FACTOR;
    const atlDay1 = 100 * ATL_FACTOR;
    expect(points[1].tsb).toBeCloseTo(ctlDay1 - atlDay1, 10);
    expect(points[1].ctl).toBeCloseTo(ctlDay1 + (100 - ctlDay1) * CTL_FACTOR, 10);
    expect(points[1].atl).toBeCloseTo(atlDay1 + (100 - atlDay1) * ATL_FACTOR, 10);
  });

  it('rellena los días sin sesión con TSS 0 (CTL y ATL decaen)', () => {
    const points = computePmc([
      { dateKey: '2026-01-01', tss: 100 },
      { dateKey: '2026-01-04', tss: 0 },
    ]);
    expect(points.map((p) => p.dateKey)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    // sin entrenar, CTL y ATL solo pueden bajar día a día
    for (let i = 1; i < points.length; i++) {
      expect(points[i].ctl).toBeLessThan(points[i - 1].ctl);
      expect(points[i].atl).toBeLessThan(points[i - 1].atl);
    }
  });

  it('ATL reacciona más rápido que CTL a una carga alta (fatiga sube más rápido que el fitness)', () => {
    const points = computePmc([{ dateKey: '2026-01-01', tss: 100 }]);
    expect(points[0].atl).toBeGreaterThan(points[0].ctl);
  });

  it('dos sesiones el mismo día suman su TSS', () => {
    const combined = computePmc([{ dateKey: '2026-01-01', tss: 150 }]);
    const split = computePmc([
      { dateKey: '2026-01-01', tss: 100 },
      { dateKey: '2026-01-01', tss: 50 },
    ]);
    expect(split).toEqual(combined);
  });

  it('el orden de entrada no importa (se ordena por fecha internamente)', () => {
    const a = computePmc([
      { dateKey: '2026-01-01', tss: 80 },
      { dateKey: '2026-01-02', tss: 40 },
    ]);
    const b = computePmc([
      { dateKey: '2026-01-02', tss: 40 },
      { dateKey: '2026-01-01', tss: 80 },
    ]);
    expect(b).toEqual(a);
  });
});
