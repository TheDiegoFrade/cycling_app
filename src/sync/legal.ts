// Aceptación de términos (tabla legal_acceptances, solo insert; ver
// supabase/schema.sql). La huella SHA-256 del texto prueba qué versión exacta
// se aceptó.
import { supabase } from '../supabase/client';

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** ¿Ya aceptó esta versión? `undefined` = no se pudo saber (sin internet): la
 * app no bloquea por eso. */
export async function hasAcceptedTerms(userId: string, version: string): Promise<boolean | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from('legal_acceptances').select('id').eq('user_id', userId).eq('doc', 'torq').eq('version', version).limit(1);
  if (error) {
    console.error('[legal] no se pudo leer la aceptación', error);
    return undefined;
  }
  return (data ?? []).length > 0;
}

export async function acceptTerms(userId: string, version: string, text: string, consents: Record<string, boolean>): Promise<string | null> {
  if (!supabase) return 'sin conexión con el servidor';
  const { error } = await supabase.from('legal_acceptances').insert({
    user_id: userId,
    doc: 'torq',
    version,
    text_sha256: await sha256Hex(text),
    consents,
    user_agent: navigator.userAgent.slice(0, 300),
  });
  return error ? 'No se pudo guardar tu aceptación. Revisa tu conexión e intenta de nuevo.' : null;
}
