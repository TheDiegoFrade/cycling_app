import { describe, expect, it } from 'vitest';
import { CADENCE_STALE_MS, CadenceCalculator, parseCscMeasurement } from './cadence-protocol';

function packet(opts: { wheel?: boolean; crank?: { revs: number; time: number } }): DataView {
  const bytes: number[] = [(opts.wheel ? 1 : 0) | (opts.crank ? 2 : 0)];
  if (opts.wheel) bytes.push(1, 0, 0, 0, 0, 0); // vueltas de rueda + hora: se saltan
  if (opts.crank) bytes.push(opts.crank.revs & 0xff, opts.crank.revs >> 8, opts.crank.time & 0xff, opts.crank.time >> 8);
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('parseCscMeasurement', () => {
  it('lee las vueltas de pedal, también si el paquete trae rueda', () => {
    expect(parseCscMeasurement(packet({ crank: { revs: 300, time: 5000 } }))).toEqual({ revs: 300, eventTime: 5000 });
    expect(parseCscMeasurement(packet({ wheel: true, crank: { revs: 7, time: 99 } }))).toEqual({ revs: 7, eventTime: 99 });
  });

  it('null si no trae pedal o viene truncado', () => {
    expect(parseCscMeasurement(packet({ wheel: true }))).toBeNull();
    expect(parseCscMeasurement(new DataView(new Uint8Array([2, 1, 0]).buffer))).toBeNull();
  });
});

describe('CadenceCalculator', () => {
  it('90 rpm: una vuelta cada 2/3 de segundo', () => {
    const c = new CadenceCalculator();
    c.push({ revs: 10, eventTime: 0 }, 0);
    expect(c.push({ revs: 13, eventTime: 2048 }, 2000)).toBe(90); // 3 vueltas en 2 s
  });

  it('aguanta que los contadores den la vuelta', () => {
    const c = new CadenceCalculator();
    c.push({ revs: 65535, eventTime: 65000 }, 0);
    expect(c.push({ revs: 1, eventTime: (65000 + 1365) & 0xffff }, 1300)).toBe(90); // 2 vueltas en ~1.33 s
  });

  it('el mismo paquete repetido conserva la cadencia; sin vueltas nuevas cae a 0', () => {
    const c = new CadenceCalculator();
    c.push({ revs: 0, eventTime: 0 }, 0);
    c.push({ revs: 1, eventTime: 683 }, 700);
    expect(c.push({ revs: 1, eventTime: 683 }, 1200)).toBe(90);
    expect(c.current(700 + CADENCE_STALE_MS + 1)).toBe(0);
  });

  it('ignora lecturas imposibles', () => {
    const c = new CadenceCalculator();
    c.push({ revs: 0, eventTime: 0 }, 0);
    c.push({ revs: 1, eventTime: 683 }, 700);
    expect(c.push({ revs: 50, eventTime: 783 }, 800)).toBe(90);
  });
});
