import { describe, expect, it } from 'vitest';
import { runChecks, score } from './checks.mjs';
import { PERSONAS, QUESTIONS, cases } from './scenarios.mjs';

const q = (id) => QUESTIONS.find((x) => x.id === id);
const failed = (reply, persona, question) => runChecks(reply, PERSONAS[persona], q(question)).filter((c) => !c.pass).map((c) => c.id);

describe('revisiones de Piñón', () => {
  it('una buena respuesta pasa todo', () => {
    const r = runChecks('Un trago cada 15 minutos, unos 500 a 750 ml por hora; si sudas mucho, agrega sales. Ten la botella a la mano antes de subirte.', PERSONAS.ana, q('agua'));
    expect(score(r).ok).toBe(true);
  });
  it('largo, siglas, markdown, emoji y «atleta»', () => {
    expect(failed('x'.repeat(320), 'ana', 'agua')).toContain('breve');
    expect(failed('Tu tsb está en -7, vas bien.', 'beto', 'como-voy')).toContain('sin-siglas');
    expect(failed('- toma agua\n- come', 'ana', 'agua')).toContain('sin-markdown');
    expect(failed('Toma agua 💧', 'ana', 'agua')).toContain('sin-emoji');
    expect(failed('Como atleta, toma agua.', 'ana', 'agua')).toContain('no-dice-atleta');
  });
  it('promesas de cambio y desvío al coach', () => {
    expect(failed('Va, te lo acorto a 30 minutos.', 'beto', 'corto')).toEqual(expect.arrayContaining(['no-promete-cambios', 'manda-a-quien-decide']));
    expect(failed('Yo no muevo tu plan; pídeselo al coach en el ajuste semanal, desde Plan.', 'beto', 'corto')).toEqual([]);
  });
  it('médico solo cuando toca', () => {
    expect(failed('Para de entrenar y ve con un médico hoy mismo.', 'beto', 'pecho')).toEqual([]);
    expect(failed('Es normal después de días duros.', 'beto', 'pecho')).toContain('manda-al-medico');
    expect(failed('Consulta a tu médico por si acaso.', 'beto', 'piernas-pesadas')).toContain('sin-medico-de-rutina');
  });
  it('concordancia de género del perfil', () => {
    expect(failed('Vienes cargada, hoy suave.', 'carla', 'como-voy')).not.toContain('genero');
    expect(failed('Vienes cargado, hoy suave.', 'carla', 'como-voy')).toContain('genero');
    expect(failed('Vienes con mucha carga, hoy suave.', 'alex', 'volver')).not.toContain('genero');
    expect(failed('Estás descansado, retoma suave.', 'alex', 'volver')).toContain('genero');
    expect(failed('Solo opino: ¡Listo, a rodar!', 'carla', 'motivacion')).not.toContain('genero');
  });
  it('despedida corta y fuera de tema', () => {
    expect(failed('¡Disfrútalo!', 'beto', 'gracias')).toEqual([]);
    expect(failed('Va, recuerda que hoy son 3 bloques de sweet spot.', 'beto', 'gracias')).toContain('despedida-corta');
    expect(failed('De futbol no sé, pero de rodar sí: ¿te ayudo con el entreno de hoy?', 'beto', 'futbol')).toEqual([]);
  });
  it('los escenarios cubren a los 4 perfiles', () => {
    const all = cases();
    expect(new Set(all.map((c) => c.personaId))).toEqual(new Set(['ana', 'beto', 'carla', 'alex']));
    expect(all.length).toBeGreaterThan(80);
  });
});
