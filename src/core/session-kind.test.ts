import { describe, expect, it } from 'vitest';
import { isBikeSession, isNonBikeKind, srpeLoad, wasTrained } from './session-kind';

describe('isBikeSession', () => {
  it('trata como bici las sesiones sin kind (viejas o .fit sin detalle)', () => {
    expect(isBikeSession({})).toBe(true);
    expect(isBikeSession({ kind: null })).toBe(true);
    expect(isBikeSession({ kind: 'bike_indoor' })).toBe(true);
    expect(isBikeSession({ kind: 'bike_outdoor' })).toBe(true);
  });

  it('fuerza, movilidad, flexibilidad y otro no son bici', () => {
    for (const kind of ['strength', 'mobility', 'flexibility', 'other'] as const) {
      expect(isBikeSession({ kind })).toBe(false);
      expect(isNonBikeKind(kind)).toBe(true);
    }
  });
});

describe('wasTrained', () => {
  it('solo "No la hice" no cuenta como entrenada', () => {
    expect(wasTrained({})).toBe(true);
    expect(wasTrained({ completion: 'complete' })).toBe(true);
    expect(wasTrained({ completion: 'partial' })).toBe(true);
    expect(wasTrained({ completion: 'skipped' })).toBe(false);
  });
});

describe('srpeLoad', () => {
  it('es RPE × minutos, redondeado', () => {
    expect(srpeLoad('strength', 'complete', 6, 45)).toBe(270);
    expect(srpeLoad('mobility', 'partial', 3, 20.4)).toBe(61);
  });

  it('es null para bici, sesiones saltadas o datos incompletos', () => {
    expect(srpeLoad('bike_indoor', 'complete', 6, 45)).toBeNull();
    expect(srpeLoad(undefined, undefined, 6, 45)).toBeNull();
    expect(srpeLoad('strength', 'skipped', 6, 45)).toBeNull();
    expect(srpeLoad('strength', 'complete', null, 45)).toBeNull();
    expect(srpeLoad('strength', 'complete', 11, 45)).toBeNull();
    expect(srpeLoad('strength', 'complete', 6, 0)).toBeNull();
  });
});
