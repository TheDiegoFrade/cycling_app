/** Plan que acuerdan coach y atleta — mismo check que `coach_athletes.tier`
 * y `coach_invites.tier` en supabase/schema.sql. Solo se registra qué
 * acordaron: el cobro queda fuera (ver docs/coach-view/README.md). */
export type CoachTier = 'basica' | 'pro' | 'revision' | 'todo';
export const COACH_TIERS: readonly CoachTier[] = ['revision', 'todo', 'pro', 'basica'];

export const COACH_TIER_LABELS: Record<CoachTier, string> = {
  basica: 'IA básica',
  pro: 'IA pro',
  revision: 'IA + revisión del coach',
  todo: 'Todo incluido',
};

/** Días que dura un link de invitación (un solo uso). El check de RLS en
 * schema.sql acepta hasta 30, por si esto cambia. */
export const INVITE_TTL_DAYS = 7;

/** Token aleatorio de 256 bits en base64url — va en el link y nunca se
 * guarda: la base solo tiene su hash (ver inviteTokenHash). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 en hex minúsculas del token en UTF-8 — idéntico a
 * `encode(sha256(convert_to(token, 'UTF8')), 'hex')`, que es como lo
 * calculan preview_coach_invite / accept_coach_invite en schema.sql. */
export async function inviteTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Link que comparte el coach. Hash routing (ver ui/router.ts): funciona en
 * cualquier despliegue sin configurar rutas en el servidor. */
export function inviteLink(origin: string, token: string): string {
  return `${origin}/#/invite/${token}`;
}

/** Tokens que generamos: base64url de 32 bytes = 43 caracteres. Filtra
 * basura antes de preguntarle a la base. */
export function looksLikeInviteToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
