import { describe, expect, it } from 'vitest';
import { buildReviewEmail, cleanKpis, monthTitle } from '../../supabase/functions/send-review-email/email';

const base = {
  athleteName: 'Ana Ramírez',
  coachName: 'Joe',
  monthKey: '2026-09',
  verdict: 'on_track' as const,
  message: 'Muy buen mes, Ana.\n\nTu base aeróbica mejoró.',
  findings: [{ tone: 'good' as const, title: 'Fitness subió.', body: 'De 62 a 71.' }],
  goals: [{ title: 'Fuerza los martes', detail: '2 por semana' }],
  kpis: [{ label: 'Fitness (CTL)', value: '71', delta: '+9 desde 62' }],
  reviewUrl: 'https://app.test/#/review/2026-09',
};

describe('correo del reporte mensual', () => {
  it('arma asunto, html y texto con el contenido del coach', () => {
    const e = buildReviewEmail(base);
    expect(monthTitle('2026-09')).toBe('Septiembre 2026');
    expect(e.subject).toBe('Tu reporte de septiembre 2026 · Joe');
    expect(e.html).toContain('Mes bien encaminado');
    expect(e.html).toContain('<p style=');
    expect(e.html).toContain('href="https://app.test/#/review/2026-09"');
    expect(e.html).toContain('Fuerza los martes');
    expect(e.html).not.toContain('Modo de prueba');
    expect(e.text).toContain('Muy buen mes, Ana.');
    expect(e.text).toContain('- Fitness (CTL): 71 (+9 desde 62)');
    expect(e.text).toContain('Ver reporte completo: https://app.test/#/review/2026-09');
  });

  it('escapa lo que escribe el coach', () => {
    const e = buildReviewEmail({ ...base, message: '<script>alert(1)</script>', findings: [{ tone: 'bad', title: '"x"', body: '<b>' }] });
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
    expect(e.html).toContain('&quot;x&quot;');
  });

  it('modo de prueba: dice a quién iba', () => {
    const e = buildReviewEmail({ ...base, testIntendedFor: 'ana@correo.com' });
    expect(e.html).toContain('Modo de prueba');
    expect(e.html).toContain('ana@correo.com');
    expect(e.text).toContain('ana@correo.com');
  });

  it('limpia los números que manda el cliente', () => {
    expect(cleanKpis('x')).toEqual([]);
    const k = cleanKpis([{ label: 'A', value: '1', delta: 'x'.repeat(100) }, { label: '', value: '2' }, null, ...Array(10).fill({ label: 'B', value: '3', delta: '' })]);
    expect(k).toHaveLength(6);
    expect(k[0].delta).toHaveLength(40);
  });
});
