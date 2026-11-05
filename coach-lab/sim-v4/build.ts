// Simulación v4 (comentarios de Joe): arma el mismo mensaje que producción
// (message.ts + starting de intake.ts + today), con el JSON Schema de salida.
//   npx deno@2 run -A coach-lab/sim-v4/build.ts
import { z } from 'npm:zod@4';
import { COACH_SYSTEM_PROMPT } from '../../supabase/functions/coach-chat/prompt.ts';
import { buildUserMessage } from '../../supabase/functions/coach-chat/message.ts';
import { inputContextSchemaForMode, schemaForMode, type Mode } from '../../supabase/functions/coach-chat/schemas.ts';
import { startingProfile } from '../../src/core/intake.ts';

const here = new URL('.', import.meta.url);
const outDir = new URL('out/', here);
await Deno.mkdir(outDir, { recursive: true });
await Deno.writeTextFile(new URL('_system-prompt.md', outDir), COACH_SYSTEM_PROMPT.trim() + '\n');
let bad = false;
for (const file of [...Deno.readDirSync(new URL('scenarios/', here))].map((f) => f.name).filter((n) => n.endsWith('.json')).sort()) {
  const sc = JSON.parse(await Deno.readTextFile(new URL(`scenarios/${file}`, here)));
  const mode = sc.mode as Mode;
  const check = inputContextSchemaForMode(mode).safeParse(sc.context);
  if (!check.success) {
    bad = true;
    console.error(`✗ ${sc.id}:`, JSON.stringify(check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)));
    continue;
  }
  const ctx: Record<string, unknown> = { ...check.data, ...(sc.serverContext ?? {}) };
  ctx.today = sc.today;
  const prof = (ctx.profile ?? {}) as Record<string, unknown>;
  const plan = ctx.plan as Record<string, unknown> | undefined;
  ctx.starting = startingProfile({
    intake: prof.intake as never,
    ageYears: prof.ageYears as number | null,
    experienceLevel: (ctx.experienceLevel ?? prof.experienceLevel ?? plan?.experienceLevel) as never,
    generalFitnessLevel: (ctx.generalFitnessLevel ?? prof.generalFitnessLevel ?? plan?.generalFitnessLevel) as never,
    structuredTrainingYears: prof.structuredTrainingYears as number | undefined,
  });
  await Deno.writeTextFile(new URL(`${sc.id}.ctx.json`, outDir), JSON.stringify(ctx));
  const schema = JSON.stringify(z.toJSONSchema(schemaForMode(mode)));
  await Deno.writeTextFile(
    new URL(`${sc.id}.md`, outDir),
    `${buildUserMessage(mode, ctx)}\n\n---\nFormato de salida: responde ÚNICAMENTE con un objeto JSON válido que cumpla este JSON Schema, sin texto antes ni después.\n${schema}\n`,
  );
  console.log(`✓ ${sc.id} (${mode})`);
}
if (bad) Deno.exit(1);
