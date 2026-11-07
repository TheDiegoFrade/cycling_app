// «Mandar comentario»: lo que la persona escribe sobre la app (un problema,
// una idea, algo que le gustó) llega al correo de soporte de Torq y se guarda
// en la tabla feedback. Lógica pura: la usan la app (ui/feedback.ts) y la
// Edge Function feedback (vía core.gen.js).

export const FEEDBACK_KINDS = ['problem', 'idea', 'like', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  problem: 'Algo no funciona',
  idea: 'Una idea',
  like: 'Algo que me gustó',
  other: 'Otra cosa',
};

export const FEEDBACK_MIN_CHARS = 3;
export const FEEDBACK_MAX_CHARS = 2000;
/** Por persona, en 24 horas: de sobra para comentar, corta un abuso. */
export const FEEDBACK_DAILY_LIMIT = 10;

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** Pantalla donde estaba (#/plan…), para reproducir un problema. */
  screen: string | null;
  /** «Celular · Chrome 131 · Android», sacado del navegador. */
  device: string | null;
}

/** Valida lo que manda la app. Error en español o la entrada limpia. */
export function parseFeedback(body: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = FEEDBACK_KINDS.includes(b.kind as FeedbackKind) ? (b.kind as FeedbackKind) : 'other';
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (message.length < FEEDBACK_MIN_CHARS) return { ok: false, error: 'Escribe tu comentario.' };
  const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  return {
    ok: true,
    value: { kind, message: message.slice(0, FEEDBACK_MAX_CHARS), screen: clip(b.screen, 80), device: clip(b.device, 120) },
  };
}

/** «Celular · Chrome 131 · Android» a partir del user agent y si es táctil. */
export function describeDevice(userAgent: string, touch: boolean, widthPx: number): string {
  const ua = userAgent || '';
  const browser = /Edg\/(\d+)/.test(ua)
    ? `Edge ${RegExp.$1}`
    : /CriOS\/(\d+)/.test(ua)
      ? `Chrome ${RegExp.$1}`
      : /Chrome\/(\d+)/.test(ua)
        ? `Chrome ${RegExp.$1}`
        : /Firefox\/(\d+)/.test(ua)
          ? `Firefox ${RegExp.$1}`
          : /Version\/(\d+)[\d.]* .*Safari/.test(ua)
            ? `Safari ${RegExp.$1}`
            : 'otro navegador';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'otro sistema';
  const kind = touch && widthPx < 700 ? 'Celular' : touch ? 'Tableta' : 'Computadora';
  return `${kind} · ${browser} · ${os}`;
}
