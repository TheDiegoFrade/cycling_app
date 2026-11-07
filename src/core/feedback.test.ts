import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX_CHARS, describeDevice, parseFeedback } from './feedback';
import { buildFeedbackEmail } from '../../supabase/functions/feedback/email';

describe('mandar comentario', () => {
  it('valida y limpia lo que manda la app', () => {
    expect(parseFeedback({ kind: 'idea', message: '  Agreguen modo oscuro  ', screen: 'plan', device: 'Computadora · Chrome 131 · Mac' })).toEqual({
      ok: true,
      value: { kind: 'idea', message: 'Agreguen modo oscuro', screen: 'plan', device: 'Computadora · Chrome 131 · Mac' },
    });
    expect(parseFeedback({ kind: 'idea', message: ' ' })).toEqual({ ok: false, error: 'Escribe tu comentario.' });
    expect(parseFeedback(null)).toEqual({ ok: false, error: 'Escribe tu comentario.' });
    const r = parseFeedback({ kind: 'raro', message: 'x'.repeat(FEEDBACK_MAX_CHARS + 50) });
    expect(r.ok && r.value.kind).toBe('other');
    expect(r.ok && r.value.message.length).toBe(FEEDBACK_MAX_CHARS);
  });

  it('describe el dispositivo en español', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
    expect(describeDevice(mac, false, 1440)).toBe('Computadora · Chrome 131 · Mac');
    expect(describeDevice(iphone, true, 390)).toBe('Celular · Safari 18 · iOS');
    expect(describeDevice(edge, false, 1280)).toBe('Computadora · Edge 131 · Windows');
  });

  it('el correo a soporte trae el comentario, quién, dónde y se responde directo', () => {
    const e = buildFeedbackEmail({ kindLabel: 'Algo no funciona', message: 'El rodillo <no> conecta', name: 'Ana', email: 'ana@x.com', screen: 'prepare', device: 'Computadora · Chrome 131 · Mac', when: '7 nov 2026, 11:00', plan: null });
    expect(e.subject).toBe('[Torq] Algo no funciona: El rodillo <no> conecta');
    expect(e.html).toContain('El rodillo &lt;no&gt; conecta');
    expect(e.html).not.toContain('<no>');
    expect(e.text).toContain('De: Ana <ana@x.com>');
    expect(e.text).toContain('Pantalla: prepare');
    expect(e.text).not.toContain('Plan:');
    expect(e.text).toContain('le llega directo a Ana');
  });
});
