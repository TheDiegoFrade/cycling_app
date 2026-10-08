import { describe, expect, it } from 'vitest';
import { ruleTriggersOf } from './rule-triggers';

describe('ruleTriggersOf', () => {
  it('cuenta por regla, agrupa las propias y salta las alertas viejas sin id', () => {
    expect(
      ruleTriggersOf([
        { ruleId: 'factory-erg-detached' },
        { ruleId: 'factory-hr-ceiling' },
        { ruleId: 'factory-erg-detached' },
        { ruleId: '8f1c2d3e-uuid' },
        { ruleId: 'otra-regla-del-workout' },
        {},
      ]),
    ).toEqual([
      { ruleId: 'custom', count: 2 },
      { ruleId: 'factory-erg-detached', count: 2 },
      { ruleId: 'factory-hr-ceiling', count: 1 },
    ]);
    expect(ruleTriggersOf([])).toEqual([]);
  });
});
