import { describe, expect, it } from 'vitest';
import { acceptAiNotes, notesDueOnWeeklyEval } from './notes.ts';

describe('acceptAiNotes', () => {
  it('acepta un texto nuevo dentro del tope', () => {
    expect(acceptAiNotes('  Aguanta 3 semanas de carga.  ', null)).toBe('Aguanta 3 semanas de carga.');
    expect(acceptAiNotes('x'.repeat(1201), null)).toBeNull();
    expect(acceptAiNotes('', null)).toBeNull();
    expect(acceptAiNotes(null, null)).toBeNull();
  });

  it('nunca borra lo que escribió un coach; lo propio de la IA sí se reescribe', () => {
    const coach = { body: 'Rodilla izquierda: nada bajo 80 rpm.', updatedBy: 'coach' as const };
    expect(acceptAiNotes('Responde bien a sweet spot.', coach)).toBeNull();
    expect(acceptAiNotes('Rodilla izquierda: nada bajo 80 rpm. Responde bien a sweet spot.', coach)).toContain('sweet spot');
    expect(acceptAiNotes('Otra cosa.', { body: 'Lo anterior de la IA.', updatedBy: 'ai' })).toBe('Otra cosa.');
    expect(acceptAiNotes('Igual.', { body: 'Igual.', updatedBy: 'ai' })).toBeNull();
  });
});

describe('notesDueOnWeeklyEval', () => {
  it('cada 4 evaluaciones y solo sin coach humano', () => {
    expect([0, 1, 2, 3, 7].map((n) => notesDueOnWeeklyEval(n, false))).toEqual([false, false, false, true, true]);
    expect(notesDueOnWeeklyEval(3, true)).toBe(false);
  });
});
