import { describe, expect, it } from 'vitest';
import { formBand, suggestToday } from './coaching';

describe('formBand', () => {
  it('tsb > 5 es fresh', () => {
    expect(formBand(6)).toBe('fresh');
    expect(formBand(20)).toBe('fresh');
  });
  it('tsb === 5 es balanced (no fresh)', () => {
    expect(formBand(5)).toBe('balanced');
  });
  it('tsb entre -10 y 5 es balanced', () => {
    expect(formBand(0)).toBe('balanced');
    expect(formBand(-9.9)).toBe('balanced');
  });
  it('tsb === -10 es balanced (no fatigued todavía)', () => {
    expect(formBand(-10)).toBe('balanced');
  });
  it('tsb < -10 es fatigued', () => {
    expect(formBand(-11)).toBe('fatigued');
    expect(formBand(-30)).toBe('fatigued');
  });
});

describe('suggestToday', () => {
  it('fresh sugiere vo2max o umbral, nunca recuperación', () => {
    const s = suggestToday(10, 1);
    expect(s.band).toBe('fresh');
    expect(['vo2max', 'threshold']).toContain(s.templateId);
  });
  it('fatigued siempre sugiere recuperación', () => {
    const s = suggestToday(-15, 3);
    expect(s.band).toBe('fatigued');
    expect(s.templateId).toBe('recovery');
  });
  it('balanced sugiere sweet spot', () => {
    const s = suggestToday(0, 2);
    expect(s.band).toBe('balanced');
    expect(s.templateId).toBe('sweet_spot');
  });
  it('fresh alterna la sugerencia según el día', () => {
    const a = suggestToday(10, 0);
    const b = suggestToday(10, 1);
    expect(a.templateId).not.toBe(b.templateId);
  });
});
