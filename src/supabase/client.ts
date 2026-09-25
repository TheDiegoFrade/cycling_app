import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** `null` si no hay variables de entorno configuradas — la app entera debe
 * poder funcionar sin esto (solo local, sin login ni sync). Nunca asumir que
 * `supabase` existe sin antes revisar `isSupabaseConfigured()`. */
// flowType 'pkce' a propósito: el link mágico vuelve con `?code=...` en la
// query string, no con `#access_token=...` en el hash — nuestro router
// también usa el hash (`#/home`, `#/train`...), así que un flujo basado en
// hash chocaría con la navegación. PKCE evita ese choque por completo.
//
// Nota: los scanners de seguridad de Gmail/Outlook a veces "pre-visitan" el
// link del correo y gastan el token de un solo uso antes de que la persona
// lo toque (error `otp_expired`) — es un problema conocido de los magic
// links, no de esta app. Si pasa, solo hay que pedir el link de nuevo.
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey, { auth: { flowType: 'pkce' } }) : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
