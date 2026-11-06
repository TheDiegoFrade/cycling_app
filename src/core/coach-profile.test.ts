import { describe, expect, it } from 'vitest';
import { STARTING_FTP_FALLBACK, ageFromBirthDate, bodyDataError, coachFtpFields, coachProfileError, coachProfileExtras, estimatedStartingFtp, ftpSourceOf, sourceForAcceptedSuggestion, withFtp, withStartingFtpEstimate } from './coach-profile';
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
    expect(coachProfileExtras(p, new Date(2026, 9, 8))).toEqual({ injuries: 'rodilla izq', weightKg: 72, ageYears: 36, otherActivities: null, intake: null, experienceLevel: null, generalFitnessLevel: null, structuredTrainingYears: null, rpeZones: null });
    expect(coachProfileExtras({ ...base, injuries: '  ' })).toEqual({ injuries: null, weightKg: null, ageYears: null, otherActivities: null, intake: null, experienceLevel: null, generalFitnessLevel: null, structuredTrainingYears: null, rpeZones: null });
  });
});

describe('coachProfileError', () => {
  const today = new Date(2026, 9, 9);
  const complete: Profile = {
    ftp: 200, hr_max: 185, cadence_floor: 0, hr_ceiling: 0, hr_min: 0, cadence_max: 0,
    sex: 'F', birth_date: '1990-05-10', weight_kg: 62, height_cm: 165,
    intake: { conditions: [], takesMedication: false, recentInjury: false, smoking: 'no', alcohol: 'rarely', stress: 'low', sleepHours: 7, sleepQuality: 'good', restingHr: null, rpeLiteracy: 'yes', maxEffortExperience: true },
    experienceLevel: 'experienced', generalFitnessLevel: 'active_cyclist', yearsRiding: 5, structuredTrainingYears: 2,
    discipline: 'road', ridesOutside: false, ftpSource: 'default', hrMaxConfirmed: false,
    competes: false, recentBestResult: 'ninguno todavía', injuries: 'Ninguna', otherActivities: [],
  } as Profile;

  it('completo no pide nada', () => {
    expect(coachProfileError(complete, today)).toBeNull();
  });

  it('pide cada respuesta que falta, en el orden del cuestionario', () => {
    expect(coachProfileError({ ...complete, sex: undefined }, today)).toMatch(/sexo/);
    expect(coachProfileError({ ...complete, birth_date: undefined }, today)).toMatch(/nacimiento/);
    expect(coachProfileError({ ...complete, birth_date: '2024-01-01' }, today)).toMatch(/nacimiento/);
    expect(coachProfileError({ ...complete, weight_kg: 300 }, today)).toMatch(/peso/);
    expect(coachProfileError({ ...complete, height_cm: undefined }, today)).toMatch(/altura/);
    expect(coachProfileError({ ...complete, intake: undefined }, today)).toMatch(/salud/);
    expect(coachProfileError({ ...complete, yearsRiding: undefined }, today)).toMatch(/años/);
    expect(coachProfileError({ ...complete, ridesOutside: true }, today)).toMatch(/medidor/);
    expect(coachProfileError({ ...complete, ftpSource: undefined }, today)).toMatch(/FTP/);
    expect(coachProfileError({ ...complete, hrMaxConfirmed: true, hr_max: 300 }, today)).toMatch(/pulso/);
    expect(coachProfileError({ ...complete, competes: true }, today)).toMatch(/categoría/);
    expect(coachProfileError({ ...complete, recentBestResult: '  ' }, today)).toMatch(/resultado/);
    expect(coachProfileError({ ...complete, injuries: undefined }, today)).toMatch(/lesiones/);
    expect(coachProfileError({ ...complete, otherActivities: undefined }, today)).toMatch(/otra actividad/);
  });

  it('0 años de bici vale (empieza)', () => {
    expect(coachProfileError({ ...complete, yearsRiding: 0, structuredTrainingYears: 0 }, today)).toBeNull();
  });
});

describe('otras actividades en el cuestionario', () => {
  const today = new Date(2026, 9, 9);
  const base = {
    ftp: 200, hr_max: 185, cadence_floor: 0, hr_ceiling: 0, hr_min: 0, cadence_max: 0,
    sex: 'M', birth_date: '1990-05-10', weight_kg: 70, height_cm: 175,
    intake: { conditions: [], takesMedication: false, recentInjury: false, smoking: 'no', alcohol: 'rarely', stress: 'low', sleepHours: 7, sleepQuality: 'good', restingHr: null, rpeLiteracy: 'yes', maxEffortExperience: true },
    experienceLevel: 'experienced', generalFitnessLevel: 'active_cyclist', yearsRiding: 5, structuredTrainingYears: 2,
    discipline: 'road', ridesOutside: false, ftpSource: 'default', hrMaxConfirmed: false,
    competes: false, recentBestResult: 'x', injuries: 'Ninguna',
  } as Profile;

  it('acepta actividades completas', () => {
    expect(coachProfileError({ ...base, otherActivities: [{ kind: 'crossfit', perWeek: 2, minutes: 50, days: ['mon', 'thu'] }] }, today)).toBeNull();
  });

  it('pide lo que falta de cada actividad', () => {
    expect(coachProfileError({ ...base, otherActivities: [{ kind: 'running', perWeek: 0, minutes: 30, days: [] }] }, today)).toMatch(/veces por semana/);
    expect(coachProfileError({ ...base, otherActivities: [{ kind: 'running', perWeek: 2, minutes: 0, days: [] }] }, today)).toMatch(/minutos/);
    expect(coachProfileError({ ...base, otherActivities: [{ kind: 'other', perWeek: 1, minutes: 60, days: [] }] }, today)).toBeNull();
    expect(coachProfileError({ ...base, otherActivities: [{ kind: 'strength', perWeek: 1, minutes: 60, days: ['mon', 'wed'] }] }, today)).toMatch(/más días/);
  });
});

describe('mayoría de edad', () => {
  it('menores de 18 no pueden crear plan (términos §2)', () => {
    const today = new Date(2026, 9, 20);
    expect(bodyDataError({ birth_date: '2010-03-01', weight_kg: 60, height_cm: 165 }, today)).toMatch(/solo para mayores de 18/);
    expect(bodyDataError({ birth_date: '2008-10-20', weight_kg: 60, height_cm: 165 }, today)).toBeNull();
  });
});

describe('FTP de arranque para quien no sabe el suyo', () => {
  const today = new Date('2026-11-06T12:00:00Z');
  const novata = { weight_kg: 68, sex: 'F' as const, birth_date: '1992-03-15', generalFitnessLevel: 'sedentary' as const, experienceLevel: 'new_to_cycling' as const };
  it('principiante de 68 kg: ~100 W, no 200', () => {
    expect(estimatedStartingFtp(novata, today)).toBe(100);
  });
  it('sube con la actividad y la experiencia', () => {
    const otro = estimatedStartingFtp({ ...novata, generalFitnessLevel: 'active_other_sport' }, today);
    const ciclista = estimatedStartingFtp({ ...novata, generalFitnessLevel: 'active_cyclist' }, today);
    const experto = estimatedStartingFtp({ ...novata, sex: 'M', weight_kg: 74, generalFitnessLevel: 'active_cyclist', experienceLevel: 'experienced' }, today);
    expect(otro).toBe(125);
    expect(ciclista).toBe(150);
    expect(experto).toBe(215);
  });
  it('baja con la edad, y queda entre 80 y 280', () => {
    expect(estimatedStartingFtp({ ...novata, sex: 'M', birth_date: '1960-01-01' }, today)).toBe(100);
    expect(estimatedStartingFtp({ ...novata, weight_kg: 40 }, today)).toBe(80);
    expect(estimatedStartingFtp({ ...novata, weight_kg: 130, sex: 'M', generalFitnessLevel: 'active_cyclist', experienceLevel: 'experienced' }, today)).toBe(280);
    expect(estimatedStartingFtp({}, today)).toBe(STARTING_FTP_FALLBACK);
  });
  it('al cargar: cambia el 200 por defecto, pero nunca un FTP medido, escrito o provisional', () => {
    const viejo = { ...base, ...novata, ftp: 200 };
    expect(withStartingFtpEstimate(viejo, today).ftp).toBe(100);
    expect(withStartingFtpEstimate({ ...viejo, ftpSource: 'manual', ftpConfirmed: true }, today).ftp).toBe(200);
    expect(withStartingFtpEstimate({ ...viejo, ftpSource: 'test_ramp', ftpConfirmed: true }, today).ftp).toBe(200);
    expect(withStartingFtpEstimate({ ...viejo, ftpSource: 'provisional' }, today).ftp).toBe(200);
    // sin peso todavía (no contestó el cuestionario): se queda
    expect(withStartingFtpEstimate({ ...base, ftp: 200 }, today).ftp).toBe(200);
  });
});
