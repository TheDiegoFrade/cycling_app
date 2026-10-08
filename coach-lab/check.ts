// Revisa la respuesta de un escenario contra reglas duras de coach — lo que
// se puede comprobar con código, sin gastar una llamada. El criterio fino
// (¿es un buen plan?) va aparte, con rubric.md.
//
//   npm run coach:check -- 07-eval-fatiga              (lee results/07-eval-fatiga.json)
//   npm run coach:check -- 07-eval-fatiga otra.json
//   npm run coach:check                                (todos los que tengan resultado)
//
// ❌ = rompe una regla del prompt (en producción, un reintento) · 🔧 = rompe una
// regla pero el código la arregla solo · ⚠️ = sospechoso, revisar a mano.
import { schemaForMode, type Mode } from '../supabase/functions/coach-chat/schemas.ts';
// Las reglas viven en coach-chat/guard.ts: las mismas que aplica producción.
import { guardOutput, reviewOutput } from '../supabase/functions/coach-chat/guard.ts';

const here = new URL('.', import.meta.url);

function parseOutput(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return JSON.parse(body.slice(start, end + 1));
}

async function run(id: string, resultPath?: string): Promise<boolean> {
  const scenario = JSON.parse(await Deno.readTextFile(new URL(`scenarios/${id}.json`, here)));
  const path = resultPath ?? new URL(`results/${id}.json`, here).pathname;
  const mode = scenario.mode as Mode;
  console.log(`\n── ${id} (${mode}) — ${scenario.title}`);
  let out: unknown;
  try {
    out = parseOutput(await Deno.readTextFile(path));
  } catch (e) {
    console.log(`  ❌ no se pudo leer JSON de ${path}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
  const parsed = schemaForMode(mode).safeParse(out);
  if (!parsed.success) {
    console.log('  ❌ no cumple el schema de salida (en producción sería un 502):');
    for (const i of parsed.error.issues.slice(0, 8)) console.log(`     ${i.path.join('.')}: ${i.message}`);
    return false;
  }
  const ctx = { ...scenario.context, ...(scenario.serverContext ?? {}) };
  // Lo que respondió el modelo, tal cual (calidad del prompt)…
  const findings = reviewOutput(mode, ctx, parsed.data);
  // …y lo que quedaría en producción después de los arreglos del código.
  const guard = guardOutput(mode, ctx, parsed.data);
  const remaining = new Set(guard.fails);
  const icon = { ok: 'ℹ️ ', warn: '⚠️ ', fail: '❌' } as const;
  for (const x of findings) {
    const byCode = x.level === 'fail' && !remaining.has(x.msg);
    console.log(`  ${byCode ? '🔧' : icon[x.level]} ${x.msg}${byCode ? ' (lo arregla el código)' : ''}`);
  }
  for (const fx of guard.fixes) console.log(`     🔧 ${fx}`);
  const fails = findings.filter((x) => x.level === 'fail').length;
  const warns = findings.filter((x) => x.level === 'warn').length;
  const left = guard.fails.length;
  console.log(
    fails
      ? `  → ${fails} fallas (${fails - left} las arregla el código; ${left} pedirían un reintento en producción), ${warns} avisos`
      : warns
        ? `  → sin fallas, ${warns} avisos`
        : '  → ✅ pasa todas las reglas',
  );
  console.log('  Revisa también a mano lo que espera un buen coach:');
  for (const e of scenario.expect) console.log(`     • ${e}`);
  return left === 0;
}

const [id, file] = Deno.args;
if (id) {
  Deno.exit((await run(id, file)) ? 0 : 1);
}
let allOk = true;
let any = false;
for (const f of [...Deno.readDirSync(new URL('results/', here))].map((e) => e.name).filter((n) => n.endsWith('.json')).sort()) {
  any = true;
  allOk = (await run(f.replace(/\.json$/, ''))) && allOk;
}
if (!any) console.log('No hay respuestas en coach-lab/results/ todavía (guarda ahí <escenario>.json).');
Deno.exit(allOk ? 0 : 1);
