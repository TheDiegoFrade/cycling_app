// Qué modelo atiende cada llamada del coach. Sale de la prueba contra la API
// del 2026-10-08/09 (coach-lab/results/api-2026-10-0*): en 29 escenarios,
// Haiku 5.5 con effort low resolvió casi todas las evaluaciones semanales
// igual que Sonnet a ~1/15 del costo, pero se equivocó justo donde hay que
// razonar sobre el FTP (un test con ERG fijo que no midió un máximo, un FTP
// que quedó alto tras la rampa). Sonnet low rindió como medium, más rápido
// y un poco más barato. En coach_week y monthly_review (2026-10-09,
// coach-lab/results/api-2026-10-09-coach) Haiku 5.5 rindió igual o mejor
// que Haiku 4.5 a ~1/6 del costo; en la revisión mensual con fatiga solo
// Haiku 5.5 medium acertó el veredicto y no leyó una baja del 20 min como
// pérdida de forma. Lógica pura.
import type { Mode } from './schemas.ts';

export const SONNET = 'claude-sonnet-5-5';
export const HAIKU = 'claude-haiku-5-5';

export interface ModelChoice {
  model: string;
  effort: 'low' | 'medium';
  /** Por qué, para el log. */
  reason: string;
}

const FTP_TALK_RE = /\bftp\b|\btest\b|rampa|\bvatios\b|\bwatts?\b|\b\d{2,3}\s*w\b/i;

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** La semana que se evalúa trae algo que obliga a razonar sobre el FTP. */
export function weekNeedsFtpReasoning(ctx: Record<string, unknown>): string | null {
  // deno-lint-ignore no-explicit-any
  const c = ctx as any;
  const week = c.weekJustFinished ?? {};
  if ((week.workouts ?? []).some((w: { zone?: string }) => w.zone === 'test')) return 'la semana trajo un test';
  if (c.lastTest?.date) {
    const recent = !c.nextWeekStart || c.lastTest.date >= addDays(c.nextWeekStart, -7);
    if (recent) return 'hay un test reciente que leer';
  }
  if (FTP_TALK_RE.test(week.athleteNote ?? '')) return 'la nota habla del FTP o de un test';
  return null;
}

/** Modelo y effort del coach para este modo y contexto (no del redactor).
 * null = finished_training_eval_comment, que la app ya no llama. */
export function plannerFor(mode: Mode, ctx: Record<string, unknown>): ModelChoice | null {
  if (mode === 'coach_week') return { model: HAIKU, effort: 'low', reason: 'semana del coach' };
  if (mode === 'monthly_review') return { model: HAIKU, effort: 'medium', reason: 'revisión mensual (una al mes)' };
  if (mode === 'finished_training_eval_comment') return null;
  if (mode === 'weekly_eval') {
    const why = weekNeedsFtpReasoning(ctx);
    return why ? { model: SONNET, effort: 'low', reason: why } : { model: HAIKU, effort: 'low', reason: 'semana sin FTP ni test de por medio' };
  }
  // create_plan y publish_block: pocos al mes y son la base de todo lo
  // demás; Haiku dejó un coachNote vacío, olvidó la escalera de ajuste y
  // metió 82 % en una semana de absorción.
  return { model: SONNET, effort: 'low', reason: 'plan o bloque nuevo' };
}
