import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_ATHLETES, MAX_ATHLETES_LIMIT, clampMaxAthletes, normalizeCoachApplication, validateCoachApplication } from './coach-application';

const ok = {
  fullName: 'Joe Hernández',
  phone: '55 1234 5678',
  city: 'CDMX',
  yearsCoaching: 8,
  certifications: 'UCI Nivel 2',
  disciplines: ['road', 'gravel'],
  currentAthletes: 18,
  methodology: 'Arranco con un test de FTP, armo bloques de 3 semanas de carga y 1 de descarga y ajusto cada semana con lo que rodó.',
  links: 'instagram.com/joe',
  references: '',
  truthful: true,
  responsible: true,
  adult: true,
};

describe('solicitud de coach', () => {
  it('completa: sin errores', () => {
    expect(validateCoachApplication(normalizeCoachApplication(ok))).toEqual({});
  });
  it('vacía: pide cada cosa, incluidas las tres declaraciones', () => {
    const e = validateCoachApplication(normalizeCoachApplication({}));
    expect(Object.keys(e).sort()).toEqual(
      ['adult', 'certifications', 'city', 'currentAthletes', 'disciplines', 'fullName', 'links', 'methodology', 'phone', 'responsible', 'truthful', 'yearsCoaching'].sort(),
    );
  });
  it('metodología de una línea no alcanza', () => {
    expect(validateCoachApplication(normalizeCoachApplication({ ...ok, methodology: 'Entreno gente.' })).methodology).toMatch(/al menos 80/);
  });
  it('limpia disciplinas desconocidas y repetidas, y números en texto', () => {
    const a = normalizeCoachApplication({ ...ok, disciplines: ['road', 'road', 'futbol'], yearsCoaching: '3', currentAthletes: '0' });
    expect(a.disciplines).toEqual(['road']);
    expect(a.yearsCoaching).toBe(3);
    expect(a.currentAthletes).toBe(0);
  });
  it('las declaraciones solo cuentan si son true de verdad', () => {
    expect(normalizeCoachApplication({ ...ok, truthful: 'true' }).truthful).toBe(false);
  });
  it('máximo de atletas: default 20 y tope', () => {
    expect(clampMaxAthletes(undefined)).toBe(DEFAULT_MAX_ATHLETES);
    expect(clampMaxAthletes('0')).toBe(DEFAULT_MAX_ATHLETES);
    expect(clampMaxAthletes(35)).toBe(35);
    expect(clampMaxAthletes(9999)).toBe(MAX_ATHLETES_LIMIT);
  });
});
