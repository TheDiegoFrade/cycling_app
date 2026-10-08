import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, coachFtpFields, coachProfileExtras, ftpSourceOf, sourceForAcceptedSuggestion, withFtp } from './coach-profile';
import type { Profile } from './types';

// Mismos números que DEFAULT_PROFILE (storage/profile-store.ts), sin
// importar la capa de almacenamiento a core.
const base: Profile = { ftp: 200, hr_max: 185, cadence_floor: 70, hr_ceiling: 170, hr_min: 0, cadence_max: 999 };

describe('ftpSourceOf', () => {
  it('migra perfiles sin ftpSource', () => {
    expect(ftpSourceOf({ ftpConfirmed: true })).toBe('manual');
    expect(ftpSourceOf({ ftpConfirmed: false })).toBe('default');
    expect(ftpSourceOf({})).toBe('default');
    expect(ftpSourceOf({ ftpConfirmed: false, ftpSource: 'provisional' })).toBe('provisional');
  });
});

describe('coachFtpFields', () => {
  it('el default de 200 W no le llega al coach como FTP', () => {
    expect(coachFtpFields(base)).toEqual({ ftp: null, provisionalFtp: null, ftpSource: 'default', ftpUpdatedAt: null });
  });

  it('un provisional va aparte del FTP medido', () => {
    const p = withFtp(base, 120, 'provisional', new Date('2026-10-08T12:00:00Z'));
    expect(p.ftpConfirmed).toBe(false);
    expect(coachFtpFields(p)).toEqual({ ftp: null, provisionalFtp: 120, ftpSource: 'provisional', ftpUpdatedAt: '2026-10-08T12:00:00.000Z' });
  });

  it('un test o un número propio sí es FTP medido', () => {
    expect(coachFtpFields(withFtp(base, 251.4, 'test_ramp')).ftp).toBe(251);
    expect(withFtp(base, 250, 'manual').ftpConfirmed).toBe(true);
    expect(coachFtpFields({ ...base, ftp: 230, ftpConfirmed: true }).ftp).toBe(230);
  });
});

describe('sourceForAcceptedSuggestion', () => {
  it('sin FTP medido, aceptar la sugerencia sigue siendo provisional', () => {
    expect(sourceForAcceptedSuggestion({})).toBe('provisional');
    expect(sourceForAcceptedSuggestion({ ftpSource: 'provisional' })).toBe('provisional');
    expect(sourceForAcceptedSuggestion({ ftpSource: 'test_20min', ftpConfirmed: true })).toBe('manual');
  });
});

describe('edad y extras', () => {
  it('cuenta el cumpleaños por fecha local, sin desfase de huso', () => {
    expect(ageFromBirthDate('1990-10-09', new Date(2026, 9, 8))).toBe(35);
    expect(ageFromBirthDate('1990-10-08', new Date(2026, 9, 8))).toBe(36);
    expect(ageFromBirthDate(undefined)).toBeNull();
    expect(ageFromBirthDate('nope')).toBeNull();
  });

  it('manda edad, no la fecha, y limpia vacíos', () => {
    const p: Profile = { ...base, injuries: '  rodilla izq  ', weight_kg: 72, birth_date: '1990-01-01' };
    expect(coachProfileExtras(p, new Date(2026, 9, 8))).toEqual({ injuries: 'rodilla izq', weightKg: 72, ageYears: 36 });
    expect(coachProfileExtras({ ...base, injuries: '  ' })).toEqual({ injuries: null, weightKg: null, ageYears: null });
  });
});
