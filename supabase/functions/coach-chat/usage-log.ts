// Registro de cada llamada a Claude (tabla coach_calls, ver schema.sql):
// modo, paso, modelo, tokens por tipo, duración y costo estimado. Es lo que
// permite saber qué modo cuesta más, si la caché se aprovecha y si un
// cambio de verdad ahorró. Nunca frena la respuesta: si el insert falla,
// solo se loguea.

/** USD por millón de tokens. Revisar si cambian los precios. */
export const MODEL_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export type CallStep = 'main' | 'retry' | 'writer';

export interface CallRow {
  user_id: string;
  mode: string;
  step: CallStep;
  model: string;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  duration_ms: number;
  cost_usd: number | null;
  ok: boolean;
  error: string | null;
  /** Arreglos mecánicos y reglas rotas que quedaron (guard.ts), en la
   * llamada cuya respuesta se usó. */
  guard_fixes: number;
  guard_fails: string | null;
}

/** El modelo que respondió puede venir con fecha (claude-haiku-4-5-20251001). */
function pricesFor(model: string) {
  const key = Object.keys(MODEL_PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  return key ? MODEL_PRICES[key] : null;
}

export function costUsd(model: string, usage: UsageLike): number | null {
  const p = pricesFor(model);
  if (!p) return null;
  const usd =
    ((usage.input_tokens ?? 0) * p.input +
      (usage.output_tokens ?? 0) * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export function callRow(
  base: { userId: string; mode: string; step: CallStep; model: string; startedMs: number },
  usage: UsageLike | null,
  error: string | null = null,
): CallRow {
  const u = usage ?? {};
  return {
    user_id: base.userId,
    mode: base.mode,
    step: base.step,
    model: base.model,
    input_tokens: u.input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    duration_ms: Math.max(0, Math.round(Date.now() - base.startedMs)),
    cost_usd: usage ? costUsd(base.model, u) : null,
    ok: error === null,
    error: error?.slice(0, 300) ?? null,
    guard_fixes: 0,
    guard_fails: null,
  };
}

// deno-lint-ignore no-explicit-any
export async function logCalls(admin: { from: (t: string) => any }, rows: CallRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    const { error } = await admin.from('coach_calls').insert(rows);
    if (error) console.error('[coach-chat] no se pudo registrar coach_calls', error.message);
  } catch (err) {
    console.error('[coach-chat] no se pudo registrar coach_calls', err);
  }
}
