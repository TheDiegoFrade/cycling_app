import { describe, expect, it } from 'vitest';
import { byGender, genderOf } from './gender';

describe('genderOf / byGender', () => {
  it('Hombre, Mujer y el resto (neutro)', () => {
    expect(genderOf('M')).toBe('m');
    expect(genderOf('F')).toBe('f');
    expect(genderOf('other')).toBe('n');
    expect(genderOf(undefined)).toBe('n');
  });
  it('elige la forma de cada uno', () => {
    expect(byGender('m', 'cansado', 'cansada', 'con cansancio')).toBe('cansado');
    expect(byGender('f', 'cansado', 'cansada', 'con cansancio')).toBe('cansada');
    expect(byGender('n', 'cansado', 'cansada', 'con cansancio')).toBe('con cansancio');
    expect(byGender(undefined, 'cansado', 'cansada', 'con cansancio')).toBe('con cansancio');
  });
});
