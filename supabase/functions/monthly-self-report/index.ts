// Reporte mensual para el atleta SIN coach humano. pg_cron la llama todos los
// días (ver supabase/schema.sql); solo genera del 1 al 5 de cada mes, y como
// es idempotente (uno por atleta y mes), si un día falla lo reintenta el
// siguiente. Por cada atleta del lanzamiento controlado que entrenó el mes
// anterior, sin coach activo y sin su reporte todavía, calcula el reporte
// (el mismo cálculo que la vista del coach, src/core vía _shared/core.gen.js),
// la IA lo redacta como su coach y queda publicado en monthly_reviews
// (coach_id null = Coach Torq): el atleta lo ve en la app (#/review) y le llega
// por correo. Uno por atleta y mes (índice único monthly_reviews_self_once).
//
// Auth: header x-cron-secret = secreto CRON_SECRET (no usa JWT de usuario).
// body (todo opcional): { monthKey: "YYYY-MM", userIds: [uuid], dryRun: true }
//   (con monthKey se corre a mano, fuera de la ventana del 1 al 5)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0';
import { ALLOWED_USER_IDS } from '../_shared/coach-access.ts';
import { appUrl, EMAIL_TEST_RECIPIENT, sendEmail } from '../_shared/mailer.ts';
import { addDays, buildMonthlyReport, emailKpis, localDateKey, monthEnd, monthStart, mondayOfWeek, reviewAiContext, shiftMonth, startPhase } from '../_shared/core.gen.js';
import { callCoach, readResponse } from '../coach-chat/coach-call.ts';
import { SELF_MONTHLY_REVIEW_HEADER } from '../coach-chat/message.ts';
import { COACH_SYSTEM_PROMPT } from '../coach-chat/prompt.ts';
import { plannerFor } from '../coach-chat/routing.ts';
import { MonthlyReviewInputContextSchema, MonthlyReviewOutputSchema } from '../coach-chat/schemas.ts';
import { callRow, logCalls } from '../coach-chat/usage-log.ts';
import { buildReviewEmail } from '../send-review-email/email.ts';

const COACH_NAME = 'Coach Torq';
// El servidor corre en UTC: el día de cada sesión (y "hoy") se decide en la
// zona de los atletas. Hoy todos están en México; si llegan de otras zonas,
// esto pasa a ser un dato del perfil.
const ATHLETE_TIME_ZONE = 'America/Mexico_City';
const PMC_SEED_DAYS = 180; // igual que src/sync/monthly-reviews.ts
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Del 1 al 5 genera el reporte del mes anterior; después ya no (un reporte
// de septiembre que llega el 25 de octubre no sirve). A mano, con monthKey, siempre.
const GENERATE_UNTIL_DAY = 5;

type Admin = ReturnType<typeof createClient>;
type Row = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Mismas consultas y mapeo que src/sync/monthly-reviews.ts (loadMonthlyReport). */
async function loadReportInput(admin: Admin, userId: string, monthKey: string) {
  const start = monthStart(monthKey);
  const end = monthEnd(monthKey);
  const prevStart = monthStart(shiftMonth(monthKey, -1));
  const planFrom = mondayOfWeek(start) < prevStart ? mondayOfWeek(start) : prevStart;
  const sessions: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('sessions')
      .select(
        'id, workout_name, started_at, finished_at, training_stress_score, rpe, kind, completion, srpe_load, source, ftp, normalized_power, intensity_factor, efficiency_factor, hr_drift_pct, best_1min_power, best_5min_power, best_20min_power',
      )
      .eq('user_id', userId)
      .neq('source', 'strava')
      // Un día de holgura: started_at está en UTC y el día se decide en la zona del atleta.
      .gte('started_at', `${addDays(start, -PMC_SEED_DAYS - 1)}T00:00:00Z`)
      .lte('started_at', `${addDays(end, 1)}T23:59:59.999Z`)
      .order('started_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`sesiones: ${error.message}`);
    sessions.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const [{ data: workouts, error: wErr }, { data: routines, error: rErr }] = await Promise.all([
    admin.from('workouts').select('data').eq('user_id', userId).gte('data->>scheduledDate', planFrom).lte('data->>scheduledDate', addDays(end, 6)),
    admin.from('planned_routines').select('id, kind, name, payload, scheduled_date').eq('athlete_id', userId).gte('scheduled_date', prevStart).lte('scheduled_date', end).order('scheduled_date', { ascending: true }),
  ]);
  if (wErr) throw new Error(`workouts: ${wErr.message}`);
  if (rErr) throw new Error(`rutinas: ${rErr.message}`);
  return {
    sessions: sessions.map((r) => ({
      id: r.id,
      workoutName: r.workout_name,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      tss: r.training_stress_score,
      rpe: r.rpe,
      kind: r.kind,
      completion: r.completion,
      srpeLoad: r.srpe_load,
      source: r.source,
      ftp: r.ftp,
      np: r.normalized_power,
      intensityFactor: r.intensity_factor,
      efficiencyFactor: r.efficiency_factor,
      decouplingPct: r.hr_drift_pct,
      best1: r.best_1min_power,
      best5: r.best_5min_power,
      best20: r.best_20min_power,
    })),
    workouts: ((workouts ?? []) as { data: unknown }[]).map((w) => w.data),
    routines: ((routines ?? []) as Row[]).map((r) => ({ id: r.id, kind: r.kind, name: r.name, payload: r.payload, scheduledDate: r.scheduled_date })),
  };
}

type Outcome = { userId: string; status: 'sent' | 'published' | 'skipped' | 'error'; detail: string };

async function reportFor(admin: Admin, client: Anthropic, userId: string, monthKey: string, todayKey: string, dryRun: boolean): Promise<Outcome> {
  const out = (status: Outcome['status'], detail: string): Outcome => ({ userId, status, detail });

  const [{ data: coach }, { data: existing }, { data: profile }, { data: plan }, { data: notes }, { data: firstSession }] = await Promise.all([
    admin.from('coach_athletes').select('id').eq('athlete_id', userId).eq('status', 'active').maybeSingle(),
    admin.from('monthly_reviews').select('id').eq('athlete_id', userId).is('coach_id', null).eq('month', `${monthKey}-01`).maybeSingle(),
    admin.from('profiles').select('name, ftp, weight_kg, discipline, injuries').eq('user_id', userId).maybeSingle(),
    admin.from('training_plans').select('goal, data').eq('user_id', userId).eq('status', 'active').maybeSingle(),
    admin.from('athlete_notes').select('body').eq('athlete_id', userId).maybeSingle(),
    admin.from('sessions').select('started_at').eq('user_id', userId).neq('source', 'strava').order('started_at', { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (coach) return out('skipped', 'tiene coach: su coach hace la revisión');
  if (existing) return out('skipped', 'ya tiene su reporte de este mes');

  const planRow = plan as { goal?: string; data?: { startDate?: string; form?: { goal?: string } } } | null;
  // Cuándo empezó a entrenar con Torq: su primera sesión o el inicio de su
  // plan, lo que sea antes (no se guarda: se deriva). Ver core/self-report-start.ts.
  const firstStarted = (firstSession as { started_at?: string } | null)?.started_at;
  const starts = [firstStarted ? localDateKey(new Date(firstStarted), ATHLETE_TIME_ZONE) : undefined, planRow?.data?.startDate].filter((d): d is string => !!d).sort();
  const phase = startPhase(starts[0] ?? null, monthKey);
  if (phase.kind === 'skip_short_first') return out('skipped', `arranque corto (${phase.days} días desde el ${phase.startedOn}): va en el reporte del mes siguiente`);

  const p = (profile ?? {}) as Row;
  const ftp = typeof p.ftp === 'number' && p.ftp > 0 ? p.ftp : 0;
  const input = await loadReportInput(admin, userId, monthKey);
  const report = buildMonthlyReport({ monthKey, todayKey, ...input, ftp, timeZone: ATHLETE_TIME_ZONE });
  if (!report.hasData) return out('skipped', 'sin datos ese mes');
  if (dryRun) return out('skipped', `dry run: ${report.kpis.doneCount} sesiones, ${Math.round(report.kpis.tss)} TSS`);

  const ctx = reviewAiContext(
    report,
    userId,
    {
      name: (p.name as string | null) ?? null,
      ftp: ftp || null,
      weightKg: (p.weight_kg as number | null) ?? null,
      discipline: (p.discipline as string | null) ?? null,
      injuries: (p.injuries as string | null) ?? null,
      goal: planRow?.data?.form?.goal ?? planRow?.goal ?? null,
    },
    '',
  );
  const valid = MonthlyReviewInputContextSchema.safeParse(ctx);
  if (!valid.success) return out('error', `contexto inválido: ${valid.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  const notesBody = (notes as { body?: string } | null)?.body;
  const data = { ...valid.data, ...(notesBody ? { athleteNotes: notesBody } : {}), ...startContext(phase) };

  // Claude: mismo system prompt (con caché) y reglas que la revisión del coach.
  const choice = plannerFor('monthly_review', data);
  const startedMs = Date.now();
  const system = [{ type: 'text' as const, text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }];
  const userMessage = `${SELF_MONTHLY_REVIEW_HEADER}\n\nDatos:\n${JSON.stringify(data, null, 2)}`;
  const base = { userId, mode: 'monthly_self', step: 'main' as const, model: choice?.model ?? 'unknown', startedMs };
  let response;
  try {
    response = await callCoach(client, choice, system, [{ role: 'user', content: userMessage }], MonthlyReviewOutputSchema);
  } catch (err) {
    await logCalls(admin, [callRow(base, null, err instanceof Error ? err.message : String(err))]);
    return out('error', `Claude: ${err instanceof Error ? err.message : String(err)}`);
  }
  await logCalls(admin, [callRow({ ...base, model: response.model }, response.usage)]);
  const read = readResponse(response, MonthlyReviewOutputSchema);
  if (!read.ok) return out('error', read.error);
  const review = read.data as { verdict: 'on_track' | 'attention' | 'off_track'; message: string; findings: { tone: 'good' | 'warn' | 'bad'; title: string; body: string }[]; goals: { title: string; detail: string }[] };

  // Publicado de una vez: no hay coach que lo revise. El índice único evita duplicados.
  const { data: inserted, error: insErr } = await admin
    .from('monthly_reviews')
    .insert({
      athlete_id: userId,
      coach_id: null,
      month: `${monthKey}-01`,
      status: 'published',
      verdict: review.verdict,
      coach_message: review.message,
      findings: review.findings,
      goals: review.goals,
      coach_name: COACH_NAME,
    } as never)
    .select('id')
    .single();
  if (insErr) return out(insErr.code === '23505' ? 'skipped' : 'error', `guardar: ${insErr.message}`);
  const reviewId = (inserted as { id: string }).id;

  const { data: user } = await admin.auth.admin.getUserById(userId);
  const athleteEmail = user?.user?.email;
  if (!athleteEmail) return out('published', 'publicado; el atleta no tiene correo');
  const email = buildReviewEmail({
    athleteName: (p.name as string | null)?.trim() || athleteEmail.split('@')[0],
    coachName: COACH_NAME,
    monthKey,
    verdict: review.verdict,
    message: review.message,
    findings: review.findings,
    goals: review.goals,
    kpis: emailKpis(report),
    reviewUrl: `${appUrl()}/#/review/${monthKey}`,
    testIntendedFor: EMAIL_TEST_RECIPIENT ? athleteEmail : null,
    footer: 'Recibes este correo porque entrenas con el coach de Torq: cada mes te mandamos tu reporte. Las actividades de Strava no se incluyen.',
  });
  const sent = await sendEmail({ to: athleteEmail, ...email });
  if (!sent.ok) return out('published', `publicado; el correo falló: ${sent.error}`);
  const at = new Date().toISOString();
  await admin.from('monthly_reviews').update({ emailed_at: at, email_sends: [{ at, comment: '' }] } as never).eq('id', reviewId);
  return out('sent', `enviado a ${sent.sentTo}`);
}

/** Quién podría tener reporte: entrenó ese mes (sin Strava), está en el
 * lanzamiento controlado y todavía no tiene su reporte. Lo demás (coach,
 * arranque corto, días reales en su zona) lo decide reportFor. */
async function candidates(admin: Admin, monthKey: string): Promise<string[]> {
  const [{ data: rows, error }, { data: done }] = await Promise.all([
    admin
      .from('sessions')
      .select('user_id')
      .neq('source', 'strava')
      // un día de holgura: started_at está en UTC y el día se decide en la zona del atleta
      .gte('started_at', `${addDays(monthStart(monthKey), -1)}T00:00:00Z`)
      .lte('started_at', `${addDays(monthEnd(monthKey), 1)}T23:59:59.999Z`)
      .limit(10000),
    admin.from('monthly_reviews').select('athlete_id').is('coach_id', null).eq('month', `${monthKey}-01`),
  ]);
  if (error) throw new Error(`candidatos: ${error.message}`);
  const reported = new Set(((done ?? []) as { athlete_id: string }[]).map((r) => r.athlete_id));
  const trained = new Set(((rows ?? []) as { user_id: string }[]).map((r) => r.user_id));
  return [...trained].filter((u) => ALLOWED_USER_IDS.has(u) && !reported.has(u));
}

/** Lo que la IA sabe del arranque del atleta (ver SELF_MONTHLY_REVIEW_HEADER). */
function startContext(phase: ReturnType<typeof startPhase>): Record<string, unknown> {
  if (phase.kind === 'first_partial') return { startedOn: phase.startedOn };
  if (phase.kind === 'first_full_after_short') return { startedOn: phase.startedOn, firstFullMonth: true };
  return {};
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'no autorizado' }, 401);
  try {
    const body = (await req.json().catch(() => ({}))) as { monthKey?: unknown; userIds?: unknown; dryRun?: unknown };
    const todayKey = localDateKey(new Date(), ATHLETE_TIME_ZONE);
    // Por defecto, el mes que acaba de terminar.
    const monthKey = typeof body.monthKey === 'string' && MONTH.test(body.monthKey) ? body.monthKey : shiftMonth(todayKey.slice(0, 7), -1);
    const manual = typeof body.monthKey === 'string';
    if (!manual && Number(todayKey.slice(8, 10)) > GENERATE_UNTIL_DAY) return json({ monthKey, results: [], note: `solo genera del 1 al ${GENERATE_UNTIL_DAY} de cada mes` });
    const requested = Array.isArray(body.userIds) ? body.userIds.filter((u): u is string => typeof u === 'string') : null;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!) as Admin;
    const userIds = (await candidates(admin, monthKey)).filter((u) => !requested || requested.includes(u));
    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const results: Outcome[] = [];
    for (const userId of userIds) {
      try {
        results.push(await reportFor(admin, client, userId, monthKey, todayKey, body.dryRun === true));
      } catch (err) {
        results.push({ userId, status: 'error', detail: err instanceof Error ? err.message : String(err) });
      }
    }
    console.log(`[monthly-self-report] ${monthKey}: ${results.map((r) => `${r.userId.slice(0, 8)} ${r.status} (${r.detail})`).join(' | ')}`);
    return json({ monthKey, results });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
