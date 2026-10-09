// El coach aprueba los correos de la IA para su atleta: la bienvenida del plan
// y el resumen de cada semana. coach-chat deja el borrador en
// training_plans.data.emailDrafts; aquí el coach lo manda con un comentario
// suyo, como máximo MAX_SENDS veces por correo (data.coachEmails).
//
// body: { athleteId, action: 'status' }            → qué hay pendiente y cuántos envíos quedan
//       { athleteId, action: 'send', key, comment } → key "plan" o "week:<weekIndex>"
//
// Las sesiones del correo salen de lo que el coach PUBLICÓ (tabla workouts),
// no del borrador de la IA: si cambió algo, el atleta ve lo que de verdad tiene.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getUserId } from '../_shared/strava.ts';
import { deliverDraft, type PlanDraft, type WeekDraft } from '../coach-chat/coach-email.ts';
import type { ReportWeek } from '../coach-chat/report-email.ts';

const MAX_SENDS = 2;
const COMMENT_MAX = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^(plan|week:\d{1,3})$/;

type Sends = { at: string; comment: string }[];
interface PlanData {
  startDate: string;
  emailDrafts?: Record<string, PlanDraft | WeekDraft>;
  coachEmails?: Record<string, Sends>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Lunes (YYYY-MM-DD) de la semana `weekIndex` del plan; mismo ancla que coach-chat. */
export function weekStartOf(startDate: string, weekIndex: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + weekIndex * 7);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Primeras dos oraciones de la descripción: el resumen de la sesión. */
function shortIntent(description: unknown): string {
  const text = typeof description === 'string' ? description.replace(/\s+/g, ' ').trim() : '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return sentences.slice(0, 2).join(' ').trim().slice(0, 320);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const coachId = await getUserId(req);
    const body = (await req.json()) as { athleteId?: unknown; action?: unknown; key?: unknown; comment?: unknown };
    const athleteId = typeof body?.athleteId === 'string' && UUID.test(body.athleteId) ? body.athleteId : null;
    if (!athleteId) return json({ error: 'falta athleteId' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Solo el coach con vínculo ACTIVO (misma regla que is_coach_of en schema.sql).
    const { data: link } = await admin
      .from('coach_athletes')
      .select('id')
      .eq('coach_id', coachId)
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) return json({ error: 'ese atleta no está vinculado contigo' }, 403);

    const { data: plan } = await admin.from('training_plans').select('id, data').eq('user_id', athleteId).eq('status', 'active').maybeSingle();
    const row = plan as { id: string; data: PlanData } | null;
    const drafts = row?.data.emailDrafts ?? {};
    const sends = row?.data.coachEmails ?? {};

    const loadWeek = async (weekIndex: number): Promise<ReportWeek> => {
      const monday = weekStartOf(row!.data.startDate, weekIndex);
      const { data: rows } = await admin
        .from('workouts')
        .select('data')
        .eq('user_id', athleteId)
        .gte('data->>scheduledDate', monday)
        .lte('data->>scheduledDate', addDays(monday, 6));
      const workouts = ((rows ?? []) as { data: Record<string, unknown> }[])
        .map(({ data: w }) => {
          const name = String(w.name ?? 'Sesión');
          const intervals = Array.isArray(w.intervals) ? (w.intervals as { duration_s?: number }[]) : [];
          return {
            date: String(w.scheduledDate),
            name,
            minutes: Math.round(intervals.reduce((s, x) => s + (x.duration_s ?? 0), 0) / 60),
            isTest: w.kind === 'test' || /\b(test|rampa)\b/i.test(name),
            intent: shortIntent(w.description),
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      return { weekNumber: weekIndex + 1, workouts };
    };

    if (body.action === 'status') {
      const items = Object.keys(drafts)
        .filter((k) => KEY.test(k))
        .map((key) => {
          const weekIndex = key === 'plan' ? 0 : Number(key.slice(5));
          const used = sends[key]?.length ?? 0;
          return { key, weekStart: row ? weekStartOf(row.data.startDate, weekIndex) : null, sends: used, remaining: Math.max(0, MAX_SENDS - used), lastSentAt: sends[key]?.[used - 1]?.at ?? null };
        });
      return json({ items, maxSends: MAX_SENDS });
    }

    if (body.action !== 'send') return json({ error: 'acción desconocida' }, 400);
    const key = typeof body.key === 'string' && KEY.test(body.key) ? body.key : null;
    if (!key) return json({ error: 'falta key' }, 400);
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (comment.length < 3) return json({ error: 'escribe un comentario para tu atleta: va al inicio del correo' }, 400);
    if (comment.length > COMMENT_MAX) return json({ error: `el comentario puede tener hasta ${COMMENT_MAX} caracteres` }, 400);
    if (!row || !drafts[key]) return json({ error: 'no hay un correo pendiente para eso' }, 404);
    const used = sends[key]?.length ?? 0;
    if (used >= MAX_SENDS) return json({ error: `ya lo enviaste ${MAX_SENDS} veces, que es el máximo` }, 409);

    let draft: PlanDraft | WeekDraft;
    if (key === 'plan') {
      const planDraft = drafts.plan as PlanDraft;
      const weeks = (await Promise.all(planDraft.weeks.map((w) => loadWeek(w.weekNumber - 1)))).filter((w) => w.workouts.length);
      if (!weeks.length) return json({ error: 'publica primero la semana 1: el correo lleva las sesiones que publicaste' }, 409);
      draft = { ...planDraft, weeks };
    } else {
      const weekDraft = drafts[key] as WeekDraft;
      const week = await loadWeek(weekDraft.weekIndex);
      if (!week.workouts.length) return json({ error: 'publica primero esa semana: el correo lleva las sesiones que publicaste' }, 409);
      draft = { ...weekDraft, nextWeek: week };
    }

    const [{ data: athleteUser }, { data: coachUser }, { data: profiles }] = await Promise.all([
      admin.auth.admin.getUserById(athleteId),
      admin.auth.admin.getUserById(coachId),
      admin.from('profiles').select('user_id, name').in('user_id', [athleteId, coachId]),
    ]);
    const athleteEmail = athleteUser?.user?.email;
    if (!athleteEmail) return json({ error: 'el atleta no tiene correo registrado' }, 422);
    const nameOf = (id: string) => ((profiles ?? []) as { user_id: string; name: string | null }[]).find((p) => p.user_id === id)?.name?.trim() || null;
    const coachEmail = coachUser?.user?.email ?? undefined;
    const coachName = nameOf(coachId) ?? coachEmail?.split('@')[0] ?? 'Tu coach';

    const sent = await deliverDraft(key === 'plan' ? 'plan' : 'week', draft, { email: athleteEmail, name: nameOf(athleteId), replyTo: coachEmail }, { name: coachName, comment });
    if (!sent.ok) return json({ error: `no se pudo enviar: ${sent.error}` }, 502);

    // Registro del envío: se relee el plan justo antes para no pisar otros cambios.
    const at = new Date().toISOString();
    const { data: fresh } = await admin.from('training_plans').select('data').eq('id', row.id).maybeSingle();
    const current = ((fresh as { data?: PlanData } | null)?.data ?? row.data) as PlanData;
    const log = { ...(current.coachEmails ?? {}), [key]: [...(current.coachEmails?.[key] ?? []), { at, comment }] };
    await admin.from('training_plans').update({ data: { ...current, coachEmails: log } } as never).eq('id', row.id);

    return json({ sentTo: sent.test ? sent.sentTo : 'atleta', test: sent.test, remaining: MAX_SENDS - used - 1, sentAt: at });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
