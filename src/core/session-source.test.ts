import { describe, expect, it } from 'vitest';
import { isAiEligibleSession, isAiEligibleSource, sessionSourceOf } from './session-source';

describe('sessionSourceOf', () => {
  it('marca como strava cualquier sesión con id de actividad de Strava, diga lo que diga source', () => {
    expect(sessionSourceOf({ workoutId: 'strava-import', stravaActivityId: 123 })).toBe('strava');
    expect(sessionSourceOf({ source: 'torq', workoutId: 'abc', stravaActivityId: 123 })).toBe('strava');
    expect(sessionSourceOf({ source: 'fit_upload', workoutId: 'strava-import', stravaActivityId: null })).toBe('strava');
  });

  it('respeta source cuando no viene de Strava', () => {
    expect(sessionSourceOf({ source: 'intervals', workoutId: 'abc', stravaActivityId: null })).toBe('intervals');
    expect(sessionSourceOf({ source: 'manual', workoutId: null })).toBe('manual');
  });

  it('deduce la fuente de sesiones viejas sin source', () => {
    expect(sessionSourceOf({ workoutId: 'fit-import' })).toBe('fit_upload');
    expect(sessionSourceOf({ workoutId: 'workout-123' })).toBe('torq');
    expect(sessionSourceOf({ source: null, workoutId: null, stravaActivityId: null })).toBe('torq');
  });
});

describe('isAiEligible', () => {
  it('solo excluye Strava', () => {
    expect(isAiEligibleSource('strava')).toBe(false);
    expect(isAiEligibleSource('torq')).toBe(true);
    expect(isAiEligibleSource('fit_upload')).toBe(true);
    expect(isAiEligibleSource('intervals')).toBe(true);
    expect(isAiEligibleSource('manual')).toBe(true);
    expect(isAiEligibleSession({ workoutId: 'strava-import', stravaActivityId: 1 })).toBe(false);
    expect(isAiEligibleSession({ workoutId: 'fit-import' })).toBe(true);
  });
});
