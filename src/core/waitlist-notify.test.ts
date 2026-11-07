import { describe, expect, it } from 'vitest';
import { buildWaitlistEmail } from '../../supabase/functions/waitlist-notify/email';

const base = { email: 'ana@correo.com', name: 'Ana', discipline: 'road', when: '7 nov 2026, 17:02', pending: 3, appUrl: 'https://ridetorq.app' };

describe('correo de aviso de lista de espera', () => {
  it('dice quién, con qué datos, cuántos esperan y lleva a la lista', () => {
    const m = buildWaitlistEmail(base);
    expect(m.subject).toBe('[Torq] Ana se apuntó a la lista de espera');
    expect(m.text).toContain('Correo: ana@correo.com');
    expect(m.text).toContain('Rueda: Ruta');
    expect(m.text).toContain('3 personas esperan invitación.');
    expect(m.text).toContain('https://ridetorq.app/#/admin');
    expect(m.html).toContain('href="https://ridetorq.app/#/admin"');
  });

  it('sin nombre usa el correo y omite lo que no llenó', () => {
    const m = buildWaitlistEmail({ ...base, name: '  ', discipline: null, pending: 1 });
    expect(m.subject).toBe('[Torq] ana@correo.com se apuntó a la lista de espera');
    expect(m.text).not.toContain('Nombre:');
    expect(m.text).not.toContain('Rueda:');
    expect(m.text).toContain('1 persona espera invitación.');
  });

  it('escapa lo que escribió la persona', () => {
    const m = buildWaitlistEmail({ ...base, name: '<b>x</b>' });
    expect(m.html).not.toContain('<b>x</b>');
    expect(m.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
