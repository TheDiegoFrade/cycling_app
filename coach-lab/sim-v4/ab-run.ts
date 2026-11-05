// A/B del coach con la API real: corre el MISMO caso con el código de dos
// versiones del repo (prompt, mensaje, schemas, guardia, routing, intake y
// llamada a Claude de cada una) y guarda la salida final como la dejaría
// producción: guardia + un reintento + descripciones del redactor (Haiku).
// No toca Supabase ni manda correos.
//
//   ANTHROPIC_API_KEY=... npx deno@2 run -A coach-lab/sim-v4/ab-run.ts \
//     <carpeta-salida> <etiqueta>=<raíz-del-repo> [...] -- <casos.json> [repeticiones]
//
// <casos.json>: [{ id, mode, today, context }]. Cuesta dinero (~0.1 USD por
// plan con Sonnet).
import 'npm:zod@4';
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0/helpers/zod';

const args = Deno.args;
const sep = args.indexOf('--');
const [outArg, ...versionArgs] = args.slice(0, sep);
const [casesArg, repsArg] = args.slice(sep + 1);
const reps = Number(repsArg ?? 1);
const outDir = outArg.replace(/\/?$/, '/');
await Deno.mkdir(outDir, { recursive: true });
const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
const DAY_NAMES: Record<string, string> = { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' };
const WRITER_MODEL = 'claude-haiku-5-5';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function loadVersion(root: string) {
  const f = (p: string) => import(`file://${root}/${p}`);
  return {
    prompt: await f('supabase/functions/coach-chat/prompt.ts'),
    message: await f('supabase/functions/coach-chat/message.ts'),
    schemas: await f('supabase/functions/coach-chat/schemas.ts'),
    guard: await f('supabase/functions/coach-chat/guard.ts'),
    routing: await f('supabase/functions/coach-chat/routing.ts'),
    call: await f('supabase/functions/coach-chat/coach-call.ts'),
    expand: await f('supabase/functions/coach-chat/expand.ts'),
    usage: await f('supabase/functions/coach-chat/usage-log.ts'),
    intake: await f('src/core/intake.ts'),
  };
}

const versions: { label: string; v: Awaited<ReturnType<typeof loadVersion>> }[] = [];
for (const a of versionArgs) {
  const [label, root] = a.split('=');
  versions.push({ label, v: await loadVersion(root) });
}
const cases: { id: string; mode: string; today: string; context: Any }[] = JSON.parse(await Deno.readTextFile(casesArg));

function buildContext(v: Any, c: (typeof cases)[number]): Any {
  const ctx: Any = { ...v.schemas.inputContextSchemaForMode(c.mode).parse(c.context) };
  ctx.today = c.today;
  const prof = ctx.profile ?? {};
  ctx.starting = v.intake.startingProfile({
    intake: prof.intake ?? undefined,
    ageYears: prof.ageYears,
    experienceLevel: ctx.experienceLevel ?? prof.experienceLevel ?? ctx.plan?.experienceLevel ?? undefined,
    generalFitnessLevel: ctx.generalFitnessLevel ?? prof.generalFitnessLevel ?? ctx.plan?.generalFitnessLevel ?? undefined,
    structuredTrainingYears: prof.structuredTrainingYears ?? undefined,
  });
  return ctx;
}

async function writeDescriptions(v: Any, athlete: Any, workouts: Any[]): Promise<{ map: Map<number, string>; usage: Any | null }> {
  const payload = {
    athlete,
    workouts: workouts.map((w, index) => ({
      index,
      name: w.name,
      day: DAY_NAMES[w.dayOfWeek] ?? w.dayOfWeek,
      minutes: v.expand.totalMinutes(w.segments),
      targetTSS: w.targetTSS,
      erg: w.erg,
      intent: w.intent,
      structure: v.expand.summarizeSegments(w.segments),
    })),
  };
  try {
    const r = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(v.schemas.WorkoutDescriptionsSchema) },
      system: [{ type: 'text', text: v.prompt.WRITER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Escribe la descripción de cada workout de esta semana.\n\nDatos:\n${JSON.stringify(payload, null, 2)}` }],
    } as never);
    const text = (r.content as Any[]).find((b) => b.type === 'text')?.text;
    const parsed = text ? v.schemas.WorkoutDescriptionsSchema.safeParse(JSON.parse(text)) : null;
    const map = new Map<number, string>();
    if (parsed?.success) for (const d of parsed.data.descriptions) map.set(d.index, d.description);
    return { map, usage: r.usage };
  } catch (e) {
    console.log('   redactor falló:', String(e).slice(0, 120));
    return { map: new Map(), usage: null };
  }
}

async function runOne(label: string, v: Any, c: (typeof cases)[number], rep: number) {
  const tag = `${c.id}__${label}__r${rep}`;
  const t0 = performance.now();
  const ctx = buildContext(v, c);
  const schema = v.schemas.schemaForMode(c.mode);
  const userMessage = v.message.buildUserMessage(c.mode, ctx);
  const system = [{ type: 'text', text: v.prompt.COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];
  const choice = v.routing.plannerFor(c.mode, ctx);
  const planning = v.schemas.PLANNING_MODES.has(c.mode);
  let cost = 0;
  const addCost = (model: string, usage: Any) => (cost += v.usage.costUsd(model, usage) ?? 0);
  const first = await v.call.callCoach(client, choice, system, [{ role: 'user', content: userMessage }], schema);
  addCost(first.model, first.usage);
  let read = v.call.readResponse(first, schema);
  if (!read.ok) {
    console.log(`${tag.padEnd(48)} 💥 ${read.error}`);
    await Deno.writeTextFile(`${outDir}${tag}.json`, JSON.stringify({ id: c.id, label, rep, error: read.error, cost }, null, 2));
    return;
  }
  let guard = v.guard.guardOutput(c.mode, ctx, read.data);
  const firstFails = guard.fails;
  let retried = false;
  if (guard.fails.length && planning) {
    retried = true;
    const retry = await v.call
      .callCoach(client, choice, system, [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: read.text },
        { role: 'user', content: v.guard.correctionMessage(guard.fails) },
      ], schema)
      .catch(() => null);
    if (retry) {
      addCost(retry.model, retry.usage);
      const second = v.call.readResponse(retry, schema);
      if (second.ok) {
        const g2 = v.guard.guardOutput(c.mode, ctx, second.data);
        if (g2.fails.length < guard.fails.length) {
          read = second;
          guard = g2;
        }
      }
    }
  }
  const out = guard.out;
  // Descripciones del redactor, una llamada por semana, como producción.
  if (planning) {
    const mentionFtp = typeof ctx.profile?.ftp === 'number' && ctx.profile?.ftpSource !== 'test_rpe_ramp';
    const athlete = { name: ctx.profile?.name ?? null, sex: ctx.profile?.sex ?? null, mentionFtp };
    const weeks: Any[][] = c.mode === 'create_plan' ? out.firstBlockWeeks.map((w: Any) => w.workouts) : [out.nextWeekWorkouts ?? out.workouts ?? []];
    const results = await Promise.all(weeks.map((ws) => (ws.length ? writeDescriptions(v, athlete, ws) : Promise.resolve({ map: new Map(), usage: null }))));
    results.forEach((res, wi) => {
      if (res.usage) addCost(WRITER_MODEL, res.usage);
      weeks[wi].forEach((w, i) => (w.description = res.map.get(i) ?? null));
    });
  }
  const row = { id: c.id, label, rep, mode: c.mode, model: choice?.model, ok: guard.fails.length === 0, retried, firstFails, fails: guard.fails, warns: guard.warns, fixes: guard.fixes, seconds: Math.round((performance.now() - t0) / 100) / 10, cost: Math.round(cost * 10000) / 10000 };
  await Deno.writeTextFile(`${outDir}${tag}.json`, JSON.stringify({ ...row, output: out }, null, 2));
  console.log(`${tag.padEnd(48)} ${row.ok ? '✅' : '❌'} ${String(row.seconds).padStart(5)} s  $${row.cost.toFixed(4)}${retried ? '  [reintento]' : ''}`);
  return row;
}

// Tope de llamadas simultáneas para no topar el rate limit.
const jobs: (() => Promise<unknown>)[] = [];
for (let rep = 1; rep <= reps; rep++) for (const c of cases) for (const { label, v } of versions) jobs.push(() => runOne(label, v, c, rep).catch((e) => console.log(`${c.id} ${label} r${rep} 💥`, String(e).slice(0, 200))));
const CONCURRENCY = 4;
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) await jobs[next++]();
}));
console.log('listo');
