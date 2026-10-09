// Arma, para cada escenario de coach-lab/scenarios, el texto que se pega en
// claude.ai: el mismo system prompt y el mismo mensaje que manda coach-chat
// en producción (message.ts), más el JSON Schema de la salida — en la API lo
// fuerza output_config.format; en el chat hay que pedirlo por escrito.
//
//   npm run coach:build              → coach-lab/out/
import { z } from 'npm:zod@4';
import { COACH_SYSTEM_PROMPT } from '../supabase/functions/coach-chat/prompt.ts';
import { buildUserMessage } from '../supabase/functions/coach-chat/message.ts';
import { inputContextSchemaForMode, schemaForMode, type Mode } from '../supabase/functions/coach-chat/schemas.ts';

const here = new URL('.', import.meta.url);
const outDir = new URL('out/', here);
await Deno.mkdir(outDir, { recursive: true });

// Modelo que corre cada modo en producción (ver index.ts) — probar con otro
// en el chat da una idea falsa de la calidad real.
// (ver supabase/functions/coach-chat/routing.ts).
const PROD_MODEL: Record<Mode, string> = {
  create_plan: 'Sonnet 5.5 (effort low)',
  weekly_eval: 'Haiku 5.5 low; Sonnet 5.5 low si la semana trae FTP/test',
  publish_block: 'Sonnet 5.5 (effort low)',
  coach_week: 'Haiku 5.5 (effort low)',
  monthly_review: 'Haiku 5.5 (effort medium)',
  finished_training_eval_comment: 'Haiku 4.5 (la app ya no lo llama)',
};

await Deno.writeTextFile(new URL('_system-prompt.md', outDir), COACH_SYSTEM_PROMPT.trim() + '\n');

const files = [...Deno.readDirSync(new URL('scenarios/', here))].filter((f) => f.name.endsWith('.json')).map((f) => f.name).sort();
for (const file of files) {
  const scenario = JSON.parse(await Deno.readTextFile(new URL(`scenarios/${file}`, here)));
  const mode = scenario.mode as Mode;
  const check = inputContextSchemaForMode(mode).safeParse(scenario.context);
  if (!check.success) {
    console.error(`✗ ${scenario.id}: el context no pasa el schema de entrada de ${mode}`);
    console.error(JSON.stringify(check.error.issues, null, 2));
    Deno.exit(1);
  }
  const jsonSchema = JSON.stringify(z.toJSONSchema(schemaForMode(mode)), null, 1);
  // Lo que agrega el servidor después de validar (athleteNotes, notesDue):
  // en el escenario va aparte, en `serverContext`.
  const fullContext = { ...check.data, ...(scenario.serverContext ?? {}) };
  const text = [
    buildUserMessage(mode, fullContext),
    '',
    '---',
    'Formato de salida (solo para esta prueba en chat; en producción lo fuerza la API): responde ÚNICAMENTE con un objeto JSON válido que cumpla este JSON Schema, sin texto antes ni después.',
    '```json',
    jsonSchema,
    '```',
  ].join('\n');
  await Deno.writeTextFile(new URL(`${scenario.id}.md`, outDir), text + '\n');
  console.log(`✓ ${scenario.id.padEnd(28)} ${mode.padEnd(12)} → modelo: ${PROD_MODEL[mode]}`);
}
console.log(`\nListo: coach-lab/out/_system-prompt.md (instrucciones del Proyecto) y un .md por escenario.`);
