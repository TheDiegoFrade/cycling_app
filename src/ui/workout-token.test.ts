import { describe, expect, it } from 'vitest';
import type { Interval } from '../core/types';
import { tokenForIntervals, tokenForTemplate, tokenForWorkout, tokenHtml, tokenUrl } from './workout-token';

const iv = (power_pct: number, duration_s: number, type: Interval['type'] = 'steady'): Interval => ({ name: 'x', type, power_pct, duration_s });
const warm = iv(50, 600, 'warmup');
const cool = iv(45, 600, 'cooldown');

describe('workout-token', () => {
  it('mapea las plantillas', () => {
    expect(tokenForTemplate('z2')).toBe('end');
    expect(tokenForTemplate('recovery')).toBe('rec');
    expect(tokenForTemplate('sweet_spot')).toBe('ss');
    expect(tokenForTemplate('threshold')).toBe('ftp');
    expect(tokenForTemplate('vo2max')).toBe('vo2');
    expect(tokenForTemplate('otra')).toBeNull();
  });

  it('clasifica por el bloque más intenso de 2 min o más', () => {
    expect(tokenForIntervals([warm, iv(50, 1800), cool])).toBe('rec');
    expect(tokenForIntervals([warm, iv(65, 3600), cool])).toBe('end');
    expect(tokenForIntervals([warm, iv(80, 1200), cool])).toBe('ss');
    expect(tokenForIntervals([warm, iv(88, 480), iv(55, 240), iv(88, 480), cool])).toBe('ss');
    expect(tokenForIntervals([warm, iv(97, 900), iv(55, 300), iv(97, 900), cool])).toBe('ftp');
    expect(tokenForIntervals([warm, iv(110, 180), iv(50, 180), cool])).toBe('vo2');
  });

  it('un pico corto no cambia la zona; varios cortos sí suman', () => {
    expect(tokenForIntervals([warm, iv(150, 15), iv(65, 3000), cool])).toBe('end');
    const thirtyThirty = Array.from({ length: 6 }, () => [iv(120, 30), iv(50, 30)]).flat();
    expect(tokenForIntervals([warm, ...thirtyThirty, cool])).toBe('vo2');
  });

  it('las rampas cuentan por su punto más alto', () => {
    expect(tokenForIntervals([{ name: 'r', type: 'steady', power_pct: 60, ramp_to_pct: 100, duration_s: 600 }])).toBe('ftp');
  });

  it('sin trabajo es recuperación', () => {
    expect(tokenForIntervals([])).toBe('rec');
    expect(tokenForIntervals([warm, cool])).toBe('rec');
  });

  it('los tests son el pico de umbral', () => {
    expect(tokenForWorkout({ name: 'Test de 20 minutos', kind: 'test', intervals: [iv(100, 1200)] })).toBe('ftp');
    expect(tokenForWorkout({ name: 'Rampa por RPE', intervals: [iv(30, 120)] })).toBe('ftp');
  });

  it('url y html decorativo', () => {
    expect(tokenUrl('moon')).toBe('/brand/obj-moon.webp');
    expect(tokenUrl('fuerza')).toBeNull();
    expect(tokenHtml('end', 46, 'bob')).toContain('aria-hidden="true"');
    expect(tokenHtml('fuerza', 46)).toContain('tk-fuerza');
  });
});
