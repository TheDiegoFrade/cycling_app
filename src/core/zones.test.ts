import { describe, expect, it } from 'vitest';
import { hrZone, powerZone } from './zones';

describe('powerZone', () => {
  it.each([
    [40, 1],
    [54, 1],
    [55, 2],
    [74, 2],
    [75, 3],
    [89, 3],
    [90, 4],
    [104, 4],
    [105, 5],
    [119, 5],
    [120, 6],
    [200, 6],
  ])('%i%% de FTP -> zona %i', (input, expected) => {
    expect(powerZone(input)).toBe(expected);
  });
});

describe('hrZone', () => {
  const hrMax = 190;
  it.each([
    [100, 1], // 52.6%
    [113, 1], // 59.5%
    [114, 2], // 60%
    [132, 2], // 69.5%
    [133, 3], // 70%
    [151, 3], // 79.5%
    [152, 4], // 80%
    [170, 4], // 89.5%
    [171, 5], // 90%
    [190, 5],
  ])('hr=%i con hr_max=190 -> zona %i', (hr, expected) => {
    expect(hrZone(hr, hrMax)).toBe(expected);
  });
});
