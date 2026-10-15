// Chat con Piñón: solo lo que la app no pudo contestar sola (botones y
// preguntas comunes se contestan en el cliente, ver src/core/pinon-chat.ts).
//
// REGLA DURA: Piñón solo opina. Esta función no escribe nada del atleta: ni
// workouts, ni plan, ni perfil. Lo único que inserta es su fila de consumo
// en coach_calls. El modelo no tiene herramientas, solo devuelve texto.
//
// El user_id sale SIEMPRE del JWT (getUserId), nunca del body. Los datos del
// atleta los arma el cliente (ya sin Strava) y parsePinonRequest los
// reconstruye campo por campo con topes de largo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { ALLOWED_USER_IDS } from '../_shared/coach-access.ts';
import { hasUnlimitedCoach, parsePinonRequest, pinonLimitReached, pinonUserMessage } from '../_shared/core.gen.js';
import { callRow, logCalls } from '../coach-chat/usage-log.ts';
import { PINON_SYSTEM_PROMPT } from './prompt.ts';

const MODEL = 'claude-haiku-5-5';
const MODE = 'pinon_chat';
/** El tope diario cuenta las últimas 24 h, no el día de calendario. */
const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Respuesta corta, pero con margen para que pueda pensar un poco antes. */
const MAX_TOKENS = 1024;
const REPLY_MAX_CHARS = 600;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    // Mismo lanzamiento controlado que el coach: rechazar aquí cuesta $0.
    if (!ALLOWED_USER_IDS.has(userId)) return json({ error: 'not_available' }, 403);

    const parsed = parsePinonRequest(await req.json().catch(() => null));
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count, error: countError } = await admin
      .from('coach_calls')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('mode', MODE)
      .eq('ok', true)
      .gte('created_at', since);
    if (countError) throw new Error(`no se pudo leer el consumo: ${countError.message}`);
    if (pinonLimitReached(count ?? 0, hasUnlimitedCoach(userId))) return json({ error: 'daily_limit' }, 429);

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const started = Date.now();
    const base = { userId, mode: MODE, step: 'main' as const, model: MODEL, startedMs: started };
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // low: preguntas cortas; puede saltarse el pensar en las fáciles.
        output_config: { effort: 'low' },
        system: PINON_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: pinonUserMessage(parsed.request) }],
      });
    } catch (err) {
      await logCalls(admin, [callRow(base, null, err instanceof Error ? err.message : String(err))]);
      throw err;
    }

    // Puede empezar con bloques de thinking: se lee el texto por tipo.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .slice(0, REPLY_MAX_CHARS);
    const failed = response.stop_reason === 'refusal' || !text;
    await logCalls(admin, [callRow({ ...base, model: response.model }, response.usage, failed ? `sin texto (${response.stop_reason})` : null)]);
    if (failed) return json({ error: 'no_reply' }, 502);
    return json({ reply: text });
  } catch (err) {
    console.error('[pinon-chat]', err);
    const message = err instanceof Error ? err.message : String(err);
    if (/sesi[oó]n/i.test(message)) return json({ error: 'auth' }, 401);
    return json({ error: 'server' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
