import { describe, expect, it } from 'vitest';
import { intakeError, startingProfile } from './intake';
import type { HealthIntake } from './intake';

const healthy: HealthIntake = {
  conditions: [],
  takesMedication: false,
  recentInjury: false,
  smoking: 'no',
  alcohol: 'rarely',
  stress: 'low',
  sleepHours: 7.5,
  sleepQuality: 'good',
  restingHr: 58,
  rpeLiteracy: 'yes',
  maxEffortExperience: true,
};
const athlete = { ageYears: 34, experienceLevel: 'experienced' as const, generalFitnessLevel: 'active_cyclist' as const, structuredTrainingYears: 3 };

describe('intakeError', () => {
  it('completa no pide nada', () => expect(intakeError(healthy)).toBeNull());
  it('pide lo que falta', () => {
    expect(intakeError(undefined)).toMatch(/salud/);
    expect(intakeError({ ...healthy, conditions: ['other'] })).toMatch(/otra condición/);
    expect(intakeError({ ...healthy, sleepHours: 0 })).toMatch(/horas/);
    expect(intakeError({ ...healthy, restingHr: 200 })).toMatch(/reposo/);
    expect(intakeError({ ...healthy, restingHr: null })).toBeNull();
  });
});

describe('startingProfile (método de Joe)', () => {
  it('experimentado, sano, con esfuerzos máximos y RPE: test de 20 min', () => {
    const s = startingProfile({ ...athlete, intake: healthy });
    expect(s).toMatchObject({ healthFirst: false, maxEffortReady: true, testPlan: 'test20', baseFirst: false, start: 'normal', teachRpe: false });
  });

  it('sin esfuerzos máximos previos o que empieza: rampa', () => {
    expect(startingProfile({ ...athlete, intake: { ...healthy, maxEffortExperience: false } }).testPlan).toBe('ramp');
    expect(startingProfile({ ...athlete, experienceLevel: 'new_to_cycling', structuredTrainingYears: 0, intake: healthy }).testPlan).toBe('ramp');
    expect(startingProfile({ ...athlete, intake: { ...healthy, rpeLiteracy: 'somewhat' } }).testPlan).toBe('ramp');
  });

  it('salud primero: condición o medicamento → sin test máximo', () => {
    const s = startingProfile({ ...athlete, intake: { ...healthy, conditions: ['hypertension'] } });
    expect(s).toMatchObject({ healthFirst: true, maxEffortReady: false, testPlan: 'none' });
    expect(s.notReadyReasons.join(' ')).toMatch(/médico/);
    expect(startingProfile({ ...athlete, intake: { ...healthy, takesMedication: true } }).testPlan).toBe('none');
  });

  it('focos rojos: lesión reciente, menor, sedentario o sin RPE → sin test', () => {
    expect(startingProfile({ ...athlete, intake: { ...healthy, recentInjury: true } }).testPlan).toBe('none');
    expect(startingProfile({ ...athlete, ageYears: 15, intake: healthy }).testPlan).toBe('none');
    expect(startingProfile({ ...athlete, generalFitnessLevel: 'sedentary', intake: healthy }).testPlan).toBe('none');
    const noRpe = startingProfile({ ...athlete, intake: { ...healthy, rpeLiteracy: 'no' } });
    expect(noRpe).toMatchObject({ testPlan: 'none', teachRpe: true });
  });

  it('hábitos: fumar o alcohol → base primero; alcohol frecuente → estrés alto y arranque conservador', () => {
    expect(startingProfile({ ...athlete, intake: { ...healthy, smoking: 'occasional' } }).baseFirst).toBe(true);
    const drinks = startingProfile({ ...athlete, intake: { ...healthy, alcohol: 'frequent' } });
    expect(drinks).toMatchObject({ baseFirst: true, stressAdjusted: 'high', start: 'conservative' });
    expect(startingProfile({ ...athlete, intake: { ...healthy, alcohol: 'weekly' } }).stressAdjusted).toBe('medium');
  });

  it('sueño corto o malo → arranque conservador', () => {
    expect(startingProfile({ ...athlete, intake: { ...healthy, sleepHours: 5 } }).start).toBe('conservative');
    expect(startingProfile({ ...athlete, intake: { ...healthy, sleepQuality: 'poor' } }).start).toBe('conservative');
  });

  it('sin evaluación (perfiles viejos): no inventa focos rojos', () => {
    const s = startingProfile(athlete);
    expect(s).toMatchObject({ healthFirst: false, maxEffortReady: true, testPlan: 'ramp', baseFirst: false, start: 'normal' });
  });
});

describe('límites de Joe: intensidad, metabolismo y temporada', () => {
  it('sano y sin datos nuevos: sin límites, sin metabolismo primero, no en temporada', () => {
    expect(startingProfile({ ...athlete, intake: healthy })).toMatchObject({ intensityLimit: false, intensityLimitReasons: [], metabolicFirst: false, inSeason: false, recentHoursPerWeek: null });
  });

  it('corazón, disautonomía, vértigo o lesión que la impide: sin alta intensidad', () => {
    for (const c of ['heart', 'dysautonomia', 'vertigo'] as const) {
      const s = startingProfile({ ...athlete, intake: { ...healthy, conditions: [c] } });
      expect(s.intensityLimit).toBe(true);
      expect(s.healthFirst).toBe(true);
    }
    const injury = startingProfile({ ...athlete, intake: { ...healthy, injuryLimitsIntensity: true } });
    expect(injury.intensityLimit).toBe(true);
    expect(injury.intensityLimitReasons[0]).toMatch(/lesión/);
    expect(startingProfile({ ...athlete, intake: { ...healthy, conditions: ['hypertension'] } }).intensityLimit).toBe(false);
  });

  it('diabetes o metabólica: metabolismo primero', () => {
    expect(startingProfile({ ...athlete, intake: { ...healthy, conditions: ['diabetes'] } }).metabolicFirst).toBe(true);
    expect(startingProfile({ ...athlete, intake: { ...healthy, conditions: ['metabolic'] } }).metabolicFirst).toBe(true);
    expect(startingProfile({ ...athlete, intake: { ...healthy, conditions: ['asthma'] } }).metabolicFirst).toBe(false);
  });

  it('viene entrenando con intensidad: en temporada, con sus horas', () => {
    const s = startingProfile({ ...athlete, intake: { ...healthy, recentTraining: 'with_intensity', recentHoursPerWeek: 7.5 } });
    expect(s).toMatchObject({ inSeason: true, recentHoursPerWeek: 7.5 });
    expect(startingProfile({ ...athlete, intake: { ...healthy, recentTraining: 'easy' } }).inSeason).toBe(false);
  });

  it('horas fuera de rango se piden de nuevo', () => {
    expect(intakeError({ ...healthy, recentHoursPerWeek: 60 })).toMatch(/horas por semana/);
    expect(intakeError({ ...healthy, recentHoursPerWeek: null })).toBeNull();
  });
});

