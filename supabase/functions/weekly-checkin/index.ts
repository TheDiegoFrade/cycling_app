// Check-in del domingo por correo. pg_cron la llama los domingos a las 6 pm
// de la Ciudad de México (ver supabase/schema.sql). A cada atleta con plan
// activo del coach de IA (sin coach humano) que todavía no evalúa la semana
// que termina, le pregunta cómo le fue con un botón que abre la evaluación
// (#/plan/evaluar). Si la semana siguiente ya está armada, es opcional (solo
// si algo no le late); si está vacía, le pide evaluar para armarla. La evaluación sigue siendo cuando la
// persona da clic: el domingo o cualquier día de la semana siguiente.
//
// Uno por plan y semana (tabla weekly_checkin_emails): si el cron corre dos
// veces, no repite.
//
// Auth: header x-cron-secret = secreto CRON_SECRET (no usa JWT de usuario).
// body (todo opcional): { userIds: [uuid], dryRun: true, anyDay: true }
//   (anyDay: correrla a mano un día que no es domingo)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadAiAccess } from '../_shared/access.ts';
import { appUrl, EMAIL_TEST_RECIPIENT, sendEmail } from '../_shared/mailer.ts';
import { localDateKey, storedIsoWeekKey, weeklyEvalDue } from '../_shared/core.gen.js';
import { buildCheckinEmail } from './email.ts';

// Hoy todos los atletas están en México (igual que monthly-self-report).
const ATHLETE_TIME_ZONE = 'America/Mexico_City';

type Admin = ReturnType<typeof createClient>;

interface PlanRow {
  id: string;
  user_id: string;
  last_eval_iso_week: string | null;
  data: {
    startDate: string;
    blocks: { weeks: number }[];
    weeks: { weekIndex: number; workoutIds: string[] }[];
    lastEvaluatedWeek?: number;
  };
}

type Outcome = { userId: string; status: 'sent' | 'skipped' | 'error'; detail: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function checkinFor(admin: Admin, plan: PlanRow, todayKey: string, now: Date, dryRun: boolean): Promise<Outcome> {
  const userId = plan.user_id;
  const out = (status: Outcome['status'], detail: string): Outcome => ({ userId, status, detail });
  const d = plan.data;
  if (!d?.startDate || !Array.isArray(d.blocks) || !Array.isArray(d.weeks)) return out('skipped', 'plan sin semanas');
  // Lo creó hoy: todavía no hay semana que contar.
  if (d.startDate >= todayKey) return out('skipped', 'el plan arrancó hoy o después');

  const due = weeklyEvalDue(
    { startDate: d.startDate, blocks: d.blocks, weeks: d.weeks, lastEvaluatedWeek: d.lastEvaluatedWeek, lastEvalIsoWeek: plan.last_eval_iso_week },
    todayKey,
    storedIsoWeekKey(now),
  );
  if (!due) return out('skipped', 'ya evaluó o el plan terminó');

  const [{ data: coach }, { data: sentBefore }] = await Promise.all([
    admin.from('coach_athletes').select('id').eq('athlete_id', userId).eq('status', 'active').limit(1),
    admin.from('weekly_checkin_emails').select('plan_id').eq('plan_id', plan.id).eq('week', due.week).maybeSingle(),
  ]);
  if ((coach ?? []).length) return out('skipped', 'tiene coach: su coach ve su semana');
  if (sentBefore) return out('skipped', `ya se le mandó el de la semana ${due.week}`);
  const access = await loadAiAccess(admin, userId).catch(() => null);
  if (!access?.ai) return out('skipped', 'sin acceso al coach de IA');

  // Cuántos de los entrenamientos de esa semana hizo.
  const ids = d.weeks.find((w) => w.weekIndex === due.week - 1)?.workoutIds ?? [];
  let done: number | null = null;
  if (ids.length) {
    const { data: trained, error } = await admin.from('sessions').select('workout_id').eq('user_id', userId).in('workout_id', ids);
    if (!error) done = new Set(((trained ?? []) as { workout_id: string }[]).map((s) => s.workout_id)).size;
  }

  const [{ data: user }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('profiles').select('name').eq('user_id', userId).maybeSingle(),
  ]);
  const to = user?.user?.email;
  if (!to) return out('skipped', 'sin correo');
  if (dryRun) return out('skipped', `dry run: semana ${due.week}, ${done ?? '?'} de ${ids.length}, siguiente ${due.nextEmpty ? 'vacía' : 'armada'}`);

  // Primero se aparta (plan, semana): si dos corridas se cruzan, solo una manda.
  const { error: claimErr } = await admin.from('weekly_checkin_emails').insert({ plan_id: plan.id, athlete_id: userId, week: due.week } as never);
  if (claimErr) return out(claimErr.code === '23505' ? 'skipped' : 'error', `apartar: ${claimErr.message}`);

  const name = ((profile as { name?: string | null } | null)?.name ?? '').trim() || to.split('@')[0];
  const email = buildCheckinEmail({
    athleteName: name,
    week: due.week,
    nextEmpty: due.nextEmpty,
    planned: ids.length || null,
    done,
    evalUrl: `${appUrl()}/#/plan/evaluar`,
    testIntendedFor: EMAIL_TEST_RECIPIENT ? to : null,
  });
  const sent = await sendEmail({ to, ...email });
  if (!sent.ok) {
    // Que lo intente la siguiente corrida.
    await admin.from('weekly_checkin_emails').delete().eq('plan_id', plan.id).eq('week', due.week);
    return out('error', `correo: ${sent.error}`);
  }
  await admin.from('weekly_checkin_emails').update({ sent_to: sent.sentTo, sent_at: new Date().toISOString() } as never).eq('plan_id', plan.id).eq('week', due.week);
  return out('sent', `semana ${due.week} a ${sent.sentTo}`);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'no autorizado' }, 401);
  try {
    const body = (await req.json().catch(() => ({}))) as { userIds?: unknown; dryRun?: unknown; anyDay?: unknown };
    const now = new Date();
    const todayKey = localDateKey(now, ATHLETE_TIME_ZONE);
    const isSunday = new Date(`${todayKey}T00:00:00Z`).getUTCDay() === 0;
    if (!isSunday && body.anyDay !== true) return json({ todayKey, results: [], note: 'solo manda los domingos' });
    const requested = Array.isArray(body.userIds) ? body.userIds.filter((u): u is string => typeof u === 'string') : null;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as Admin;
    let query = admin.from('training_plans').select('id, user_id, last_eval_iso_week, data').eq('status', 'active');
    if (requested) query = query.in('user_id', requested);
    const { data: plans, error } = await query;
    if (error) throw new Error(`planes: ${error.message}`);

    const results: Outcome[] = [];
    for (const plan of (plans ?? []) as PlanRow[]) {
      try {
        results.push(await checkinFor(admin, plan, todayKey, now, body.dryRun === true));
      } catch (err) {
        results.push({ userId: plan.user_id, status: 'error', detail: err instanceof Error ? err.message : String(err) });
      }
    }
    console.log(`[weekly-checkin] ${todayKey}: ${results.map((r) => `${r.userId.slice(0, 8)} ${r.status} (${r.detail})`).join(' | ')}`);
    return json({ todayKey, results });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
