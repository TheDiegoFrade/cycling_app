import { describe, expect, it } from 'vitest';
import { resolveFromLibrary } from './library.ts';
import type { CoachWeekWorkout, LibraryTemplate } from './library.ts';

const tplIntervals = [{ name: 'SS', type: 'interval', duration_s: 900, power_pct: 90 }];
const templates = new Map<string, LibraryTemplate>([['t1', { name: 'Sweet spot 3×15', payload: { intervals: tplIntervals, description: 'Del coach' } }]]);
const w = (o: Partial<CoachWeekWorkout>): CoachWeekWorkout => ({ name: 'X', description: '', intervals: [], targetTSS: 60, dayOfWeek: 'fri', fromLibraryId: null, libraryChange: null, ...o });

describe('resolveFromLibrary', () => {
  it('copia exacta: intervalos y nombre de la plantilla, no de la IA', () => {
    const [r] = resolveFromLibrary([w({ fromLibraryId: 't1', name: 'Otro nombre', intervals: [{ name: 'inventado' }] })], templates);
    expect(r.intervals).toBe(tplIntervals);
    expect(r.name).toBe('Sweet spot 3×15');
    expect(r.description).toBe('Del coach');
    expect(r.fromLibrary).toEqual({ templateId: 't1', change: null });
  });

  it('ajustada: respeta los intervalos de la IA y devuelve el porqué', () => {
    const adapted = [{ name: 'SS', type: 'interval', duration_s: 720, power_pct: 88 }];
    const [r] = resolveFromLibrary([w({ fromLibraryId: 't1', intervals: adapted, libraryChange: ' 3×12 por fatiga ', description: 'Hoy más corto' })], templates);
    expect(r.intervals).toBe(adapted);
    expect(r.fromLibrary).toEqual({ templateId: 't1', change: '3×12 por fatiga' });
    expect(r.description).toBe('Hoy más corto');
  });

  it('ajuste sin intervalos cae a copia exacta; id ajeno sin intervalos se descarta', () => {
    expect(resolveFromLibrary([w({ fromLibraryId: 't1', libraryChange: 'algo' })], templates)[0].fromLibrary?.change).toBeNull();
    expect(resolveFromLibrary([w({ fromLibraryId: 'no-existe' })], templates)).toEqual([]);
    const [nuevo] = resolveFromLibrary([w({ fromLibraryId: 'no-existe', intervals: [{ name: 'a' }] })], templates);
    expect(nuevo.fromLibrary).toBeNull();
  });
});
