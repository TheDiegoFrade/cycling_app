// Control remoto desde el celular (ver ui/screens/remote.ts y sync/remote.ts).
// El celular y la laptop se hablan por un canal de Supabase Realtime cuyo
// nombre lleva un código aleatorio de 128 bits: quien no tiene el QR no
// puede adivinarlo. Lo que viaja es mínimo a propósito (cada mensaje cuenta
// en la cuota de Realtime): el celular manda botones; la laptop manda su
// estado solo cuando cambia y un latido cada pocos segundos.

/** Lo que el celular le pide a la laptop. */
export type RemoteCommand =
  | { kind: 'harder'; id: number }
  | { kind: 'easier'; id: number }
  | { kind: 'toggle'; id: number } // empezar / pausar / seguir
  | { kind: 'rpe'; id: number; value: number } // respuesta de la rampa
  | { kind: 'ramp-stop'; id: number } // «Llegué a 8+»
  | { kind: 'hello'; id: number }; // el celular se conectó o sigue vivo

/** Lo que la laptop le cuenta al celular. */
export interface RemoteState {
  run: 'idle' | 'running' | 'paused' | 'finished';
  /** erg = watts fijos (los botones mueven la intensidad); sim = calle
   * simulada (mueven la pendiente); resistance = resistencia fija. */
  mode: 'erg' | 'sim' | 'resistance';
  /** Lo que se muestra grande en medio: "100%", "+1.5%", "R 25%". */
  level: string;
  /** Qué hacen los botones ahora, en palabras ("pendiente", "intensidad"). */
  levelLabel: string;
  block: string;
  /** Segundos que le quedan al bloque cuando se mandó el estado. */
  blockLeftS: number;
  targetW: number | null;
  /** La rampa está preguntando el RPE de un escalón (texto de la pregunta). */
  rpeAsk: string | null;
  /** Es una rampa por RPE (muestra el botón «Llegué a 8+»). */
  ramp: boolean;
  /** Último comando aplicado: el celular lo usa para medir la demora. */
  ackId: number | null;
}

export const REMOTE_EVENT_CMD = 'cmd';
export const REMOTE_EVENT_STATE = 'state';
/** Cada cuánto el celular dice «sigo aquí» y la laptop repite su estado. */
export const REMOTE_HEARTBEAT_MS = 15_000;
/** Sin noticias del celular en este tiempo = desconectado. */
export const REMOTE_STALE_MS = 40_000;

const CODE_RE = /^[a-z0-9]{26}$/;

/** 128 bits en base 32 (26 caracteres, minúsculas: cabe bien en un QR). */
export function newRemoteCode(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const bytes = rand(17);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.slice(0, 26);
}

export function isRemoteCode(code: string | null | undefined): code is string {
  return !!code && CODE_RE.test(code);
}

export function remoteChannelName(code: string): string {
  return `torq-remote:${code}`;
}

/** Liga que abre el celular (la lee el QR). */
export function remoteUrl(origin: string, pathname: string, code: string): string {
  return `${origin}${pathname}#/remote/${code}`;
}

/** Solo deja pasar comandos bien formados: lo que llega por el canal no es
 * de confianza. */
export function parseRemoteCommand(payload: unknown): RemoteCommand | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.id !== 'number' || !Number.isFinite(p.id)) return null;
  switch (p.kind) {
    case 'harder':
    case 'easier':
    case 'toggle':
    case 'ramp-stop':
    case 'hello':
      return { kind: p.kind, id: p.id };
    case 'rpe':
      if (typeof p.value !== 'number' || !Number.isInteger(p.value) || p.value < 1 || p.value > 10) return null;
      return { kind: 'rpe', id: p.id, value: p.value };
    default:
      return null;
  }
}

export function parseRemoteState(payload: unknown): RemoteState | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<RemoteState>;
  if (!['idle', 'running', 'paused', 'finished'].includes(p.run as string)) return null;
  if (!['erg', 'sim', 'resistance'].includes(p.mode as string)) return null;
  if (typeof p.level !== 'string' || typeof p.block !== 'string' || typeof p.blockLeftS !== 'number') return null;
  return {
    run: p.run!,
    mode: p.mode!,
    level: p.level.slice(0, 16),
    levelLabel: typeof p.levelLabel === 'string' ? p.levelLabel.slice(0, 40) : '',
    block: p.block.slice(0, 80),
    blockLeftS: Math.max(0, p.blockLeftS),
    targetW: typeof p.targetW === 'number' ? p.targetW : null,
    rpeAsk: typeof p.rpeAsk === 'string' ? p.rpeAsk.slice(0, 120) : null,
    ramp: p.ramp === true,
    ackId: typeof p.ackId === 'number' ? p.ackId : null,
  };
}

/** Dos estados iguales salvo el reloj no ameritan otro mensaje. */
export function sameRemoteState(a: RemoteState | null, b: RemoteState): boolean {
  if (!a) return false;
  return (
    a.run === b.run &&
    a.mode === b.mode &&
    a.level === b.level &&
    a.block === b.block &&
    a.targetW === b.targetW &&
    a.rpeAsk === b.rpeAsk &&
    a.ramp === b.ramp &&
    a.ackId === b.ackId
  );
}
