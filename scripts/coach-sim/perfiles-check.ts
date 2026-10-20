// Valida los 10 perfiles de perfiles-data.mjs con el MISMO schema de
// coach-chat (sin red ni IA) y muestra el perfil de arranque que el código
// les calcula (método de Joe, src/core/intake.ts).
//   npx --yes deno@2 run --no-lock --allow-read scripts/coach-sim/perfiles-check.ts
import { CreatePlanInputContextSchema } from '../../supabase/functions/coach-chat/schemas.ts';
import { startingProfile } from '../../supabase/functions/_shared/core.gen.js';
import { PERFILES, createContext } from './perfiles-data.mjs';

let bad = 0;
for (const p of PERFILES) {
  const ctx = createContext(p);
  const r = CreatePlanInputContextSchema.safeParse(ctx);
  if (!r.success) {
    bad++;
    console.log(`✗ ${p.id} ${p.name}: ${JSON.stringify(r.error.issues).slice(0, 500)}`);
    continue;
  }
  const s = startingProfile({ intake: p.intake, ageYears: p.age, experienceLevel: p.experienceLevel, generalFitnessLevel: p.generalFitnessLevel, structuredTrainingYears: p.structuredTrainingYears });
  const flags = Object.entries(s).filter(([, v]) => v === true).map(([k]) => k).join(', ');
  console.log(`✓ ${p.id} ${p.name}: test=${s.testPlan} · arranque=${s.start} · estrés=${s.stressAdjusted}${flags ? ' · ' + flags : ''}`);
}
if (bad) Deno.exit(1);
