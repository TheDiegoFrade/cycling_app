import { describe, expect, it } from 'vitest';
import { wellnessDayFromIcu } from './intervals-icu';

describe('wellnessDayFromIcu', () => {
  it('convierte un día de intervals.icu', () => {
    expect(
      wellnessDayFromIcu({
        id: '2026-10-07',
        hrv: 62.34,
        restingHR: 48,
        sleepSecs: 27000,
      }),
    ).toEqual({
      dateKey: '2026-10-07',
      hrvMs: 62.3,
      restingHr: 48,
      sleepH: 7.5,
    });
  });

  it('campos vacíos o en 0 quedan en null; un día sin nada se descarta', () => {
    expect(
      wellnessDayFromIcu({
        id: '2026-10-07',
        hrv: null,
        restingHR: 0,
        sleepSecs: 25200,
      }),
    ).toEqual({
      dateKey: '2026-10-07',
      hrvMs: null,
      restingHr: null,
      sleepH: 7,
    });
    expect(wellnessDayFromIcu({ id: '2026-10-07' })).toBeNull();
    expect(wellnessDayFromIcu({ id: 'basura', hrv: 60 })).toBeNull();
  });
});
