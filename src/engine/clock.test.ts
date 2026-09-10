import { describe, expect, it } from 'vitest';
import { Clock } from './clock';

describe('Clock', () => {
  it('no emite nada antes de start', () => {
    const c = new Clock();
    expect(c.elapsedS(1000)).toBe(0);
  });

  it('deriva el segundo del tiempo real, no de conteo de ticks', () => {
    const c = new Clock();
    c.start(0);
    expect(c.poll(0)).toEqual([0]);
    expect(c.poll(400)).toEqual([]); // todavía no llega a 1000 ms
    expect(c.poll(1050)).toEqual([1]);
    expect(c.poll(1980)).toEqual([]); // 1.98 s -> sigue en el segundo 1
    expect(c.poll(2010)).toEqual([2]);
  });

  it('no pierde segundos aunque el poll llegue tarde (recupera todos los saltados)', () => {
    const c = new Clock();
    c.start(0);
    c.poll(0);
    expect(c.poll(5200)).toEqual([1, 2, 3, 4, 5]);
  });

  it('congela el avance mientras está en pausa', () => {
    const c = new Clock();
    c.start(0);
    c.poll(0);
    c.poll(3000); // segundo 3
    c.pause(3000);
    expect(c.isPaused).toBe(true);
    expect(c.elapsedS(10000)).toBe(3); // pasa tiempo real, pero no cuenta
    c.resume(10000);
    expect(c.isPaused).toBe(false);
    expect(c.elapsedS(11000)).toBe(4); // un segundo real más tras resumir
  });

  it('reinicia limpio si se llama start otra vez', () => {
    const c = new Clock();
    c.start(0);
    c.poll(5000);
    c.start(100000);
    expect(c.elapsedS(100000)).toBe(0);
    expect(c.poll(100000)).toEqual([0]);
    expect(c.poll(101000)).toEqual([1]);
  });
});
