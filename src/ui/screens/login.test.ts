import { describe, expect, it } from 'vitest';
import { loginErrorText } from './login';

describe('loginErrorText', () => {
  it('traduce los errores de Supabase y dice qué hacer', () => {
    expect(loginErrorText({ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 })).toMatch(/Correo o contraseña incorrectos/);
    expect(loginErrorText({ message: 'Email not confirmed', code: 'email_not_confirmed' })).toMatch(/confirmas tu correo/);
    expect(loginErrorText({ message: 'Too many requests', status: 429 })).toMatch(/Espera un minuto/);
    expect(loginErrorText({ message: 'Failed to fetch' })).toMatch(/conexión/);
  });
  it('nunca deja pasar el texto en inglés', () => {
    expect(loginErrorText({ message: 'Something exploded' })).toBe('No se pudo entrar. Intenta de nuevo en un momento.');
  });
});
