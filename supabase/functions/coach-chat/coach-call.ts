// Llamada a Claude con salida estructurada y lectura de la respuesta. La usan
// coach-chat y monthly-self-report (el reporte mensual sin coach).
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0/helpers/zod';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0/helpers/beta/zod';
import { SONNET, type ModelChoice } from './routing.ts';
import type { schemaForMode } from './schemas.ts';

/** Modelo de los modos sin routing (el comentario post-sesión). */
export const OTHER_MODEL = 'claude-haiku-4-5-20251001';

export async function callCoach(
  client: Anthropic,
  choice: ModelChoice | null,
  system: Anthropic.TextBlockParam[],
  messages: Anthropic.MessageParam[],
  schema: ReturnType<typeof schemaForMode>,
) {
  if (choice) {
    return await client.beta.messages
      .stream({
        model: choice.model,
        // La salida compacta ronda unos pocos miles de tokens; el techo
        // alto es solo margen (se cobra lo generado, no el techo).
        max_tokens: 32000,
        // low: en la prueba rindió igual que medium, más rápido y barato.
        output_config: { effort: choice.effort, format: betaZodOutputFormat(schema) },
        // Si un clasificador de seguridad rechazara la petición a Sonnet,
        // el servidor la reintenta con otro modelo en la misma llamada.
        ...(choice.model === SONNET ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
        system,
        messages,
      })
      .finalMessage();
  }
  return await client.messages
    .stream({
      model: OTHER_MODEL,
      max_tokens: 48000,
      system,
      messages,
      output_config: { format: zodOutputFormat(schema) },
    })
    .finalMessage();
}

/** Texto, JSON y schema de una respuesta; el error que ve el atleta si no. */
export function readResponse(
  response: { stop_reason: string | null; content: unknown[] },
  schema: ReturnType<typeof schemaForMode>,
): { ok: true; text: string; data: Record<string, unknown> } | { ok: false; error: string } {
  if (response.stop_reason === 'refusal') {
    return { ok: false, error: 'el coach no pudo procesar esta petición — intenta de nuevo o ajusta tu objetivo' };
  }
  if (response.stop_reason === 'max_tokens') {
    return { ok: false, error: 'la respuesta del coach se cortó por longitud (max_tokens) — intenta de nuevo' };
  }
  const text = (response.content as { type: string; text?: string }[]).find((b) => b.type === 'text')?.text ?? '';
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    // JSON truncado o malformado: mensaje explícito para que la próxima
    // falla de este tipo sea diagnosticable sin gastar otra llamada.
    return { ok: false, error: 'el modelo no devolvió JSON válido, intenta de nuevo' };
  }
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) return { ok: false, error: 'el modelo no devolvió una salida válida, intenta de nuevo' };
  return { ok: true, text, data: parsed.data as Record<string, unknown> };
}
