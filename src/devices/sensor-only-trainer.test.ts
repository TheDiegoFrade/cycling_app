import { afterEach, describe, expect, it, vi } from 'vitest';
import { SensorOnlyTrainer } from './sensor-only-trainer';
import type { CadenceAdapter, ConnectionState } from './types';

function fakeCadence(): CadenceAdapter & { emit(rpm: number): void } {
  const cbs = new Set<(rpm: number) => void>();
  return {
    state: 'connected' as ConnectionState,
    async connect() {},
    disconnect() {},
    onReading(cb) {
      cbs.add(cb);
      return () => cbs.delete(cb);
    },
    onStateChange() {
      return () => {};
    },
    emit(rpm) {
      cbs.forEach((cb) => cb(rpm));
    },
  };
}

afterEach(() => vi.useRealTimers());

describe('SensorOnlyTrainer', () => {
  it('manda una lectura por segundo con la cadencia del sensor y potencia 0', async () => {
    vi.useFakeTimers();
    const sensor = fakeCadence();
    const t = new SensorOnlyTrainer(sensor);
    const readings: { power: number; cadence: number }[] = [];
    t.onReading((r) => readings.push(r));
    await t.connect();
    expect(t.state).toBe('connected');
    sensor.emit(88);
    vi.advanceTimersByTime(2000);
    expect(readings).toEqual([
      { power: 0, cadence: 88 },
      { power: 0, cadence: 88 },
    ]);
    t.disconnect();
    vi.advanceTimersByTime(2000);
    expect(readings).toHaveLength(2);
  });

  it('sin sensor de cadencia también manda lecturas (cadencia 0)', async () => {
    vi.useFakeTimers();
    const t = new SensorOnlyTrainer(null);
    const readings: number[] = [];
    t.onReading((r) => readings.push(r.cadence));
    await t.connect();
    vi.advanceTimersByTime(1000);
    expect(readings).toEqual([0]);
    expect(t.hasCadence).toBe(false);
  });
});
