// Lista de espera desde el login (tabla `waitlist`, ver supabase/schema.sql).
// Solo inserta: la lista no se puede leer desde la app.
import { supabase } from '../supabase/client';

export type WaitlistResult = 'ok' | 'invalid_email' | 'failed';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function joinWaitlist(email: string, name: string, discipline: string): Promise<WaitlistResult> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean) || clean.length > 254) return 'invalid_email';
  if (!supabase) return 'failed';
  const { error } = await supabase.from('waitlist').insert({
    email: clean,
    name: name.trim().slice(0, 80) || null,
    discipline: discipline || null,
  });
  // Ya estaba apuntado (índice único): para la persona es lo mismo, y no
  // revelamos si un correo ya estaba en la lista.
  if (!error || error.code === '23505') return 'ok';
  // Para diagnosticar desde la consola del navegador. PGRST205 / 42P01 = la
  // tabla no existe en este Supabase: falta correr supabase/schema.sql.
  console.warn('[waitlist] no se pudo guardar', error.code, error.message);
  return 'failed';
}
