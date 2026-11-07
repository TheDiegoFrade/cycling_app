import { describe, expect, it } from 'vitest';
import { linkErrorText, passwordProblem, passwordSaveErrorText, resetRequestErrorText } from './auth-link';

describe('links de correo: textos en español', () => {
  it('revisa la contraseña antes de llamar al servidor', () => {
    expect(passwordProblem('1234567', '1234567')).toBe('Usa al menos 8 caracteres.');
    expect(passwordProblem('12345678', '12345679')).toBe('Las dos no coinciden.');
    expect(passwordProblem('contraseña-larga', 'contraseña-larga')).toBeNull();
  });

  it('link usado o vencido: dice cuánto dura y qué hacer, según el tipo', () => {
    const e = { code: 'otp_expired', message: 'Email link is invalid or has expired', status: 403 };
    expect(linkErrorText('invite', e)).toContain('invitación ya se usó o venció (dura 24 horas)');
    expect(linkErrorText('invite', e)).toContain('pide que te inviten otra vez');
    expect(linkErrorText('recovery', e)).toContain('«¿Olvidaste tu contraseña?»');
  });

  it('demasiados intentos y sin red no se confunden con link vencido', () => {
    expect(linkErrorText('invite', { status: 429, message: 'rate limit' })).toContain('Espera un minuto');
    expect(linkErrorText('recovery', { message: 'Failed to fetch' })).toContain('Revisa tu internet');
  });

  it('contraseña rechazada por el servidor', () => {
    expect(passwordSaveErrorText({ code: 'weak_password', message: 'Password is known to be weak' })).toContain('muy fácil de adivinar');
    expect(passwordSaveErrorText({ code: 'same_password', message: 'New password should be different from the old password.' })).toContain('contraseña actual');
    expect(passwordSaveErrorText({ message: 'boom' })).toBe('No se pudo guardar. Intenta de nuevo en un momento.');
  });

  it('pedir otro correo muy seguido', () => {
    expect(resetRequestErrorText({ code: 'over_email_send_rate_limit', status: 429, message: 'only request this after 58 seconds' })).toContain('Ya te mandamos un correo');
    expect(resetRequestErrorText({ message: 'x' })).toContain('No se pudo mandar el correo');
  });
});
