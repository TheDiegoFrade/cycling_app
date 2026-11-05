// Pasa cada respuesta de results/ por el schema y la guardia de producción.
import { schemaForMode, type Mode } from '../../supabase/functions/coach-chat/schemas.ts';
import { guardOutput, reviewOutput } from '../../supabase/functions/coach-chat/guard.ts';
const here = new URL('.', import.meta.url);
for (const f of [...Deno.readDirSync(new URL('results/', here))].map((e) => e.name).filter((n) => n.endsWith('.json')).sort()) {
  const id = f.replace(/\.json$/, '');
  const sc = JSON.parse(await Deno.readTextFile(new URL(`scenarios/${id}.json`, here)));
  const ctx = JSON.parse(await Deno.readTextFile(new URL(`out/${id}.ctx.json`, here)));
  const raw = await Deno.readTextFile(new URL(`results/${f}`, here));
  const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  console.log(`\n── ${id} (${sc.mode})`);
  let out: unknown;
  try { out = JSON.parse(body); } catch (e) { console.log('  ❌ JSON inválido', String(e)); continue; }
  const p = schemaForMode(sc.mode as Mode).safeParse(out);
  if (!p.success) { console.log('  ❌ schema:', p.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ')); continue; }
  const fin = reviewOutput(sc.mode, ctx, p.data);
  const g = guardOutput(sc.mode, ctx, p.data);
  for (const x of fin) console.log(`  ${x.level === 'fail' ? (g.fails.includes(x.msg) ? '❌' : '🔧') : x.level === 'warn' ? '⚠️ ' : 'ℹ️ '} ${x.msg}`);
  console.log(g.fails.length ? `  → ${g.fails.length} fallas pedirían reintento` : '  → pasa la guardia');
}
