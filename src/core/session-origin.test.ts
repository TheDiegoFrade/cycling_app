import { describe, expect, it } from 'vitest';
import { isLiveRecorded } from './session-origin';

describe('isLiveRecorded', () => {
  it('una sesión grabada en vivo es true', () => {
    expect(isLiveRecorded({ workoutId: 'abc-123', stravaActivityId: undefined })).toBe(true);
  });
  it('un import manual de .fit es false', () => {
    expect(isLiveRecorded({ workoutId: 'fit-import', stravaActivityId: undefined })).toBe(false);
  });
  it('un import de Strava es false', () => {
    expect(isLiveRecorded({ workoutId: 'abc-123', stravaActivityId: 9876 })).toBe(false);
  });
  it('workoutId null/ausente (filas de nube de antes de esta columna) se trata como en vivo', () => {
    expect(isLiveRecorded({ workoutId: null, stravaActivityId: null })).toBe(true);
    expect(isLiveRecorded({})).toBe(true);
  });
});
