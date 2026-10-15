import { describe, expect, it } from 'vitest';
import { IN_ZONE_EVERY_S, RIDE_MIN_GAP_S, canRidePinonSpeak, inZoneLine, isInZone } from './pinon-ride';

describe('Piñón al rodar', () => {
  it('nunca con una alerta activa, apagado ni muy seguido', () => {
    expect(canRidePinonSpeak(100, null, false, true)).toBe(true);
    expect(canRidePinonSpeak(100, null, true, true)).toBe(false);
    expect(canRidePinonSpeak(100, null, false, false)).toBe(false);
    expect(canRidePinonSpeak(100, 100 - RIDE_MIN_GAP_S + 1, false, true)).toBe(false);
    expect(canRidePinonSpeak(100, 100 - RIDE_MIN_GAP_S, false, true)).toBe(true);
  });

  it('en zona: ±6 % del objetivo, sin objetivo no cuenta', () => {
    expect(isInZone(200, 200)).toBe(true);
    expect(isInZone(212, 200)).toBe(true);
    expect(isInZone(213, 200)).toBe(false);
    expect(isInZone(188, 200)).toBe(true);
    expect(isInZone(100, 0)).toBe(false);
  });

  it('el mensaje de zona sale a los 4 min, con los minutos y buen tono', () => {
    expect(inZoneLine(IN_ZONE_EVERY_S - 1, 0)).toBeNull();
    const texts = [0, 1, 2].map((s) => inZoneLine(IN_ZONE_EVERY_S, s)!);
    expect(new Set(texts).size).toBe(3);
    for (const t of texts) {
      expect(t).toContain('4 min');
      expect(t.length).toBeLessThanOrEqual(120);
      expect(/\p{Extended_Pictographic}/u.test(t)).toBe(false);
    }
    expect(inZoneLine(9 * 60 + 30, 0)).toContain('9 min');
  });
});
