import { describe, expect, it } from 'vitest';
import { tourSteps } from './pinon-tour';

describe('recorrido de Piñón', () => {
  const steps = tourSteps({ name: 'Ana', gender: 'f' });

  it('explica las secciones, cómo entrenar, el celular, a Piñón y Perfil, en ese orden', () => {
    expect(steps.map((s) => s.id)).toEqual(['intro', 'home', 'plan', 'library', 'form', 'ride', 'erg', 'phone', 'pinon', 'profile']);
  });

  it('saluda por nombre y concuerda en género', () => {
    expect(steps[0].title).toBe('¡Hola, Ana!');
    expect(steps.find((s) => s.id === 'form')!.text).toContain('llegas fresca');
    expect(tourSteps({ gender: 'n' })[0].title).toBe('¡Hola!');
    expect(tourSteps({ gender: 'n' }).find((s) => s.id === 'form')!.text).toContain('piernas frescas');
  });

  it('cada sección apunta a la barra lateral (computadora) y a la de abajo (celular)', () => {
    for (const id of ['home', 'plan', 'library', 'form']) {
      const t = steps.find((s) => s.id === id)!.targets;
      expect(t.some((x) => x.startsWith('.sidebar-link'))).toBe(true);
      expect(t.some((x) => x.startsWith('.tabbar-item'))).toBe(true);
    }
  });

  it('dice cómo se entrena: Chrome en la compu, Bluetooth, ERG con + y −, y el celular como control', () => {
    const text = steps.map((s) => s.text).join(' ');
    expect(text).toContain('Google Chrome');
    expect(text).toContain('Bluetooth');
    expect(text).toContain('modo ERG');
    expect(text).toMatch(/escanea el código con tu celular/);
  });

  it('con coach humano, el plan lo arma su coach (no promete que Piñón lo ajusta)', () => {
    const plan = tourSteps({ humanCoach: true }).find((s) => s.id === 'plan')!.text;
    expect(plan).toContain('tu coach');
    expect(plan).not.toContain('armo la siguiente');
  });

  it('textos cortos: se leen de un vistazo', () => {
    for (const s of steps) expect(s.text.length, s.id).toBeLessThanOrEqual(190);
  });
});
