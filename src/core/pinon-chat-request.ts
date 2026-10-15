// Lo que la función pinon-chat acepta del cliente. Todo se reconstruye campo
// por campo con topes de largo: nada del body pasa tal cual al modelo. Lo usa
// la Edge Function (vía core.gen.js); aquí se prueba con vitest.
import { PINON_DAILY_AI_LIMIT, PINON_MAX_CHARS } from './pinon-chat';
import type { PinonChatData, PinonChatSession } from './pinon-chat';
import type { WorkoutZone } from './workout-zone';

export const PINON_HISTORY_TURNS = 6;
const HISTORY_TEXT_MAX = 400;
const NOTE_MAX = 240;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 400;
const RECENT_MAX = 6;
const ZONES: readonly WorkoutZone[] = ['fondo', 'tempo', 'sweet spot', 'umbral', 'VO2', 'test'];

export interface PinonTurn {
  role: 'user' | 'pinon';
  text: string;
}

export interface PinonChatRequest {
  message: string;
  history: PinonTurn[];
  context: PinonChatData;
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;
const dateKey = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function session(v: unknown): PinonChatSession | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  const date = dateKey(s.date);
  const name = str(s.name, NAME_MAX);
  if (!date || !name) return null;
  return { date, name, minutes: num(s.minutes, 0, 1000) ?? 0, tss: num(s.tss, 0, 1000), rpe: num(s.rpe, 1, 10), note: str(s.note, NOTE_MAX) };
}

function context(v: unknown): PinonChatData | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  const todayKey = dateKey(c.todayKey);
  if (!todayKey) return null;
  const t = c.today as Record<string, unknown> | undefined;
  const todayName = t ? str(t.name, NAME_MAX) : null;
  const w = (c.week ?? {}) as Record<string, unknown>;
  const f = c.form as Record<string, unknown> | undefined;
  const ctl = f ? num(f.ctl, -500, 500) : null;
  const atl = f ? num(f.atl, -500, 500) : null;
  const tsb = f ? num(f.tsb, -500, 500) : null;
  return {
    todayKey,
    humanCoach: c.humanCoach === true,
    hasPlan: c.hasPlan !== false,
    ftp: num(c.ftp, 0, 700) ?? 0,
    ...(t && todayName
      ? {
          today: {
            name: todayName,
            minutes: num(t.minutes, 0, 1000) ?? 0,
            zone: ZONES.includes(t.zone as WorkoutZone) ? (t.zone as WorkoutZone) : null,
            description: str(t.description, DESCRIPTION_MAX),
            done: t.done === true,
          },
        }
      : {}),
    week: { done: num(w.done, 0, 50) ?? 0, planned: num(w.planned, 0, 50) ?? 0 },
    ...(ctl !== null && atl !== null && tsb !== null ? { form: { ctl, atl, tsb } } : {}),
    recent: (Array.isArray(c.recent) ? c.recent : [])
      .slice(0, RECENT_MAX)
      .map(session)
      .filter((s): s is PinonChatSession => s !== null),
    daysSinceLastRide: num(c.daysSinceLastRide, 0, 10000),
  };
}

/** Valida y recorta el body. Mensaje vacío o de más de PINON_MAX_CHARS se
 * rechaza (no se recorta: el cliente ya no deja escribir más). */
export function parsePinonRequest(body: unknown): { ok: true; request: PinonChatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'pedido vacío' };
  const b = body as Record<string, unknown>;
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!message) return { ok: false, error: 'escribe algo para Piñón' };
  if (message.length > PINON_MAX_CHARS) return { ok: false, error: `máximo ${PINON_MAX_CHARS} caracteres` };
  const ctx = context(b.context);
  if (!ctx) return { ok: false, error: 'falta el contexto' };
  const history = (Array.isArray(b.history) ? b.history : [])
    .slice(-PINON_HISTORY_TURNS)
    .map((h): PinonTurn | null => {
      const turn = h as Record<string, unknown> | null;
      const text = turn ? str(turn.text, HISTORY_TEXT_MAX) : null;
      return text && (turn!.role === 'user' || turn!.role === 'pinon') ? { role: turn!.role, text } : null;
    })
    .filter((h): h is PinonTurn => h !== null);
  return { ok: true, request: { message, history, context: ctx } };
}

/** ¿Ya gastó sus mensajes con IA de hoy? */
export function pinonLimitReached(usedToday: number, unlimited: boolean): boolean {
  return !unlimited && usedToday >= PINON_DAILY_AI_LIMIT;
}

/** El mensaje que ve el modelo: datos, conversación reciente y la pregunta. */
export function pinonUserMessage(req: PinonChatRequest): string {
  const transcript = req.history.map((h) => `${h.role === 'user' ? 'Atleta' : 'Piñón'}: ${h.text}`).join('\n');
  return [
    `<datos_del_atleta>\n${JSON.stringify(req.context)}\n</datos_del_atleta>`,
    transcript ? `<conversacion_reciente>\n${transcript}\n</conversacion_reciente>` : '',
    `<pregunta>\n${req.message}\n</pregunta>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
