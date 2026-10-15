import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, withSettingsDefaults } from './settings-store';

describe('withSettingsDefaults', () => {
  it('rellena interruptores nuevos en ajustes viejos (de la nube o locales)', () => {
    const old = { soundVolume: 0.3, heroCharacter: 'woman' as const, factoryRulesEnabled: { cadenceFloor: false } };
    const s = withSettingsDefaults(old as never);
    expect(s.clickSound).toBe(true);
    expect(s.soundVolume).toBe(0.3);
    expect(s.factoryRulesEnabled.cadenceFloor).toBe(false);
    expect(s.factoryRulesEnabled.hrCeiling).toBe(DEFAULT_SETTINGS.factoryRulesEnabled.hrCeiling);
  });

  it('respeta un click apagado a propósito', () => {
    expect(withSettingsDefaults({ clickSound: false }).clickSound).toBe(false);
  });

  it('sin nada guardado da los valores por defecto', () => {
    expect(withSettingsDefaults(null)).toEqual(DEFAULT_SETTINGS);
  });
});
