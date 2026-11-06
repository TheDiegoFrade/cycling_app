import { describe, expect, it } from 'vitest';
import { buildCheckinEmail, checkinTally } from '../../supabase/functions/weekly-checkin/email';

const base = { athleteName: 'Ana', week: 2, nextEmpty: false, planned: 4, done: 3, evalUrl: 'https://torq.test/#/plan/evaluar' };

describe('correo del check-in del domingo', () => {
  it('cuántos entrenamientos hizo', () => {
    expect(checkinTally(4, 3)).toBe('Hiciste 3 de 4 entrenamientos.');
    expect(checkinTally(4, 4)).toBe('Hiciste los 4 entrenamientos de la semana.');
    expect(checkinTally(4, 6)).toBe('Hiciste los 4 entrenamientos de la semana.');
    expect(checkinTally(3, 0)).toContain('No pasa nada');
    expect(checkinTally(0, 0)).toBe('');
    expect(checkinTally(null, null)).toBe('');
  });

  it('semana siguiente ya armada: tono opcional', () => {
    const e = buildCheckinEmail(base);
    expect(e.subject).toBe('Tu semana 3 ya está lista. ¿Cómo te fue la 2?');
    expect(e.text).toContain('Si todo va bien, no tienes que hacer nada.');
    expect(e.text).not.toContain('cada día que pasa');
    expect(e.html).toContain('href="https://torq.test/#/plan/evaluar"');
    expect(e.html).toContain('Hiciste 3 de 4 entrenamientos.');
    expect(e.text).toContain('https://torq.test/#/plan/evaluar');
    expect(e.text).toContain('fuerza en casa o caminar');
  });

  it('semana siguiente vacía: lo dice en el asunto', () => {
    const e = buildCheckinEmail({ ...base, nextEmpty: true });
    expect(e.subject).toBe('Arma tu semana 3: cuéntale al coach cómo te fue');
    expect(e.text).toContain('Tu semana 3 todavía no tiene entrenamientos');
    expect(e.text).toContain('cada día que pasa');
    expect(e.text).not.toContain('no tienes que hacer nada');
  });

  it('escapa el nombre', () => {
    const e = buildCheckinEmail({ ...base, athleteName: '<b>Ana</b>' });
    expect(e.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(e.html).not.toContain('<b>Ana</b>');
  });
});
