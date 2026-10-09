// Corre escenarios del laboratorio contra la API real, con el modelo y el
// effort que quieras, y los pasa por la misma guardia que producción
// (guard.ts, con su único reintento). CUESTA DINERO: úsalo para comparar
// configuraciones con pocos escenarios, no para iterar el prompt (para eso
// está claude.ai con `npm run coach:build`).
//
//   ANTHROPIC_API_KEY=... deno run -A coach-lab/api-run.ts <carpeta> <modelo>:<effort>[,...] <escenario> [...]
//   p. ej.  ... api-run.ts results/api-1 claude-sonnet-5-5:medium,claude-haiku-5-5:low 07-eval-fatiga 08-eval-progreso
//   `auto` como configuración usa la misma elección que producción (routing.ts).
//
// Escribe <carpeta>/<escenario>__<modelo>-<effort>.json (salida + métricas)
// y <carpeta>/resumen.json. No llama al redactor (Haiku, ~$0.002 por plan,
// igual en todas las configuraciones).
import 'npm:zod@4';
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0/helpers/beta/zod';
import { COACH_SYSTEM_PROMPT } from '../supabase/functions/coach-chat/prompt.ts';
import { buildUserMessage } from '../supabase/functions/coach-chat/message.ts';
import { inputContextSchemaForMode, schemaForMode, type Mode } from '../supabase/functions/coach-chat/schemas.ts';
import { correctionMessage, guardOutput } from '../supabase/functions/coach-chat/guard.ts';
import { costUsd, MODEL_PRICES, type UsageLike } from '../supabase/functions/coach-chat/usage-log.ts';
import { plannerFor } from '../supabase/functions/coach-chat/routing.ts';

const here = new URL('.', import.meta.url);
const [dirArg, configsArg, ...ids] = Deno.args;
if (!dirArg || !configsArg || !ids.length) {
  console.error('uso: api-run.ts <carpeta> <modelo>:<effort>[,...] <escenario> [...]');
  Deno.exit(1);
}
const outDir = new URL(`${dirArg.replace(/\/?$/, '/')}`, here);
await Deno.mkdir(outDir, { recursive: true });
const configs = configsArg.split(',').map((c) => {
  const [model, effort] = c.split(':');
  return { model, effort: effort as 'low' | 'medium' | 'high' | undefined };
});

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
const system = [{ type: 'text' as const, text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }];

/** Costo como si la caché nunca se hubiera leído (producción con poco tráfico). */
function coldCost(model: string, u: UsageLike): number | null {
  return costUsd(model, { ...u, cache_creation_input_tokens: (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), cache_read_input_tokens: 0 });
}

async function call(model: string, effort: string, schema: ReturnType<typeof schemaForMode>, messages: Anthropic.Beta.BetaMessageParam[]) {
  const t0 = performance.now();
  const r = await client.beta.messages
    .stream({
      model,
      max_tokens: 32000,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system,
      messages,
    } as never)
    .finalMessage();
  const text = (r.content as { type: string; text?: string }[]).find((b) => b.type === 'text')?.text ?? '';
  let data: unknown = null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success) data = parsed.data;
  } catch {
    // data queda null
  }
  return { r, text, data, ms: Math.round(performance.now() - t0) };
}

const summary: Record<string, unknown>[] = [];
for (const id of ids) {
  const scenario = JSON.parse(await Deno.readTextFile(new URL(`scenarios/${id}.json`, here)));
  const mode = scenario.mode as Mode;
  const ctx = { ...inputContextSchemaForMode(mode).parse(scenario.context), ...(scenario.serverContext ?? {}) };
  const userMessage = buildUserMessage(mode, ctx);
  const schema = schemaForMode(mode);
  // En paralelo por escenario: todas las configuraciones a la vez.
  const rows = await Promise.all(
    configs.map(async (cfg) => {
      const auto = cfg.model === 'auto' ? plannerFor(mode, ctx) : null;
      const model = auto?.model ?? cfg.model;
      const effort = auto?.effort ?? cfg.effort ?? 'low';
      const tag = auto ? `auto-${model}-${effort}` : `${model}-${effort}`;
      try {
        const first = await call(model, effort, schema, [{ role: 'user', content: userMessage }]);
        const usages = [first.r.usage as UsageLike];
        let ms = first.ms;
        let out = first.data;
        let guard = out ? guardOutput(mode, ctx, out) : null;
        const firstFails = guard?.fails ?? ['salida inválida'];
        let retried = false;
        if (guard && guard.fails.length) {
          retried = true;
          const second = await call(model, effort, schema, [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: first.text },
            { role: 'user', content: correctionMessage(guard.fails) },
          ]);
          usages.push(second.r.usage as UsageLike);
          ms += second.ms;
          const g2 = second.data ? guardOutput(mode, ctx, second.data) : null;
          if (g2 && g2.fails.length < guard.fails.length) {
            out = second.data;
            guard = g2;
          }
        }
        const sum = (k: keyof UsageLike) => usages.reduce((s, u) => s + (u[k] ?? 0), 0);
        const usage = {
          input_tokens: sum('input_tokens'),
          output_tokens: sum('output_tokens'),
          cache_read_input_tokens: sum('cache_read_input_tokens'),
          cache_creation_input_tokens: sum('cache_creation_input_tokens'),
        };
        const row = {
          id,
          mode,
          config: tag,
          ok: !!out && guard!.fails.length === 0,
          seconds: Math.round(ms / 100) / 10,
          cost: costUsd(model, usage),
          coldCost: coldCost(model, usage),
          usage,
          retried,
          firstFails,
          fails: guard?.fails ?? ['salida inválida'],
          fixes: guard?.fixes ?? [],
          warns: guard?.warns ?? [],
        };
        await Deno.writeTextFile(new URL(`${id}__${tag}.json`, outDir), JSON.stringify({ ...row, output: guard?.out ?? out, raw: first.text }, null, 2));
        console.log(`${id.padEnd(34)} ${tag.padEnd(26)} ${row.ok ? '✅' : '❌'} ${String(row.seconds).padStart(5)} s  $${row.cost?.toFixed(4)} (frío $${row.coldCost?.toFixed(4)})  out ${usage.output_tokens}${retried ? '  [reintento]' : ''}`);
        return row;
      } catch (err) {
        console.log(`${id.padEnd(34)} ${tag.padEnd(26)} 💥 ${err instanceof Error ? err.message : err}`);
        return { id, mode, config: tag, error: String(err) };
      }
    }),
  );
  summary.push(...rows);
}
await Deno.writeTextFile(new URL('resumen.json', outDir), JSON.stringify({ prices: MODEL_PRICES, rows: summary }, null, 2));
