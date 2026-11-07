// Textos y reglas de los links de correo (invitación y «olvidé mi
// contraseña"). Supabase contesta en inglés y con códigos: aquí se traduce a
// qué pasó y qué hacer. Sin DOM, para probarlo con vitest.

export const PASSWORD_MIN = 8;

export type LinkKind = 'invite' | 'recovery';

interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

function codeOf(e: AuthErrorLike): string {
  return `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase();
}

/** Revisión local antes de llamar al servidor. null = está bien. */
export function passwordProblem(a: string, b: string): string | null {
  if (a.length < PASSWORD_MIN) return `Usa al menos ${PASSWORD_MIN} caracteres.`;
  if (a !== b) return 'Las dos no coinciden.';
  return null;
}

/** El link del correo no se pudo canjear (ya usado, vencido o roto). */
export function linkErrorText(kind: LinkKind, e: AuthErrorLike): string {
  const m = codeOf(e);
  if (m.includes('rate') || e.status === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.';
  if (m.includes('fetch') || m.includes('network')) return 'No hay conexión con el servidor. Revisa tu internet y vuelve a intentar.';
  return kind === 'invite'
    ? 'Este link de invitación ya se usó o venció (dura 24 horas). Si ya creaste tu contraseña, entra con ella. Si no, responde al correo de Torq o pide que te inviten otra vez.'
    : 'Este link para cambiar tu contraseña ya se usó o venció (dura 24 horas). Pide otro desde «¿Olvidaste tu contraseña?».';
}

/** Supabase no aceptó la contraseña nueva. */
export function passwordSaveErrorText(e: AuthErrorLike): string {
  const m = codeOf(e);
  if (m.includes('weak_password') || m.includes('weak')) return 'Esa contraseña es muy fácil de adivinar. Usa una más larga o menos común.';
  if (m.includes('same_password') || m.includes('different from the old')) return 'Esa es tu contraseña actual. Escribe una distinta.';
  if (m.includes('fetch') || m.includes('network')) return 'No hay conexión con el servidor. Revisa tu internet y vuelve a intentar.';
  return 'No se pudo guardar. Intenta de nuevo en un momento.';
}

/** Pedir el correo de «olvidé mi contraseña» falló. */
export function resetRequestErrorText(e: AuthErrorLike): string {
  const m = codeOf(e);
  if (m.includes('rate') || e.status === 429) return 'Ya te mandamos un correo hace un momento. Revisa tu bandeja (y spam) o espera un minuto para pedir otro.';
  return 'No se pudo mandar el correo. Revisa que esté bien escrito y vuelve a intentar en un minuto.';
}
