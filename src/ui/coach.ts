// Tarjeta + popup del coach de IA — vive dentro de la pantalla Plan
// (screens/calendar.ts). Requiere Supabase configurado y sesión iniciada;
// si no, no se muestra nada (el coach necesita la Edge Function coach-chat).
import { supabase, isSupabaseConfigured } from '../supabase/client';
import { appState } from './state';
import { isCoachProfileComplete, openOnboardingForm } from './onboarding';
import { computePmc } from '../engine/pmc';
import { listSessions } from '../storage/session-store';
import type { SessionRecord } from '../storage/session-store';
import { isAiEligibleSession } from '../core/session-source';
import { isBikeSession, wasTrained } from '../core/session-kind';
import type { SessionCompletion, SessionKind } from '../core/session-kind';
import { computeSessionAnalytics } from '../engine/analytics';
import { estimateWorkout } from '../core/workout-estimate';
import { deleteWorkout } from '../storage/workout-store';
import { escapeHtml } from './workout-cover';
import { confirmAiWithHumanCoach, humanCoachName } from './coach-notice';
import { coachFtpFields, coachProfileExtras, sourceForAcceptedSuggestion, withFtp } from '../core/coach-profile';

const DAY_LABELS: Record<string, string> = { mon: 'L', tue: 'M', wed: 'M', thu: 'J', fri: 'V', sat: 'S', sun: 'D' };
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Sesiones que SÍ pueden entrar al contexto del coach de IA: todo menos lo
 * que llegó de Strava (sus términos prohíben usar sus datos en modelos de
 * IA, ver core/session-source.ts y docs/coach-view/README.md). Cada
 * función de abajo que arma contexto para coach-chat pasa por aquí — nunca
 * leer listSessions()/appState.cloudSessions directo para eso. La
 * deduplicación local/nube usa los ids de TODAS las locales (sin filtrar),
 * así una sesión de Strava local tampoco se cuela por el lado de la nube.
 *
 * `bikeOnly` deja fuera fuerza/movilidad: el TSS, el PMC y las horas que ve
 * la IA son de bici, igual que Forma (ver core/session-kind.ts). Los
 * registros "No la hice" nunca entran — no se entrenó. */
async function aiEligibleSessions(bikeOnly: boolean): Promise<{
  localSessions: SessionRecord[];
  cloudOnly: typeof appState.cloudSessions;
}> {
  const allLocal = await listSessions();
  const localIds = new Set(allLocal.map((s) => s.id));
  const keep = (s: { kind?: SessionKind | null; completion?: SessionCompletion | null }) => wasTrained(s) && (!bikeOnly || isBikeSession(s));
  return {
    localSessions: allLocal.filter((s) => isAiEligibleSession(s) && keep(s)),
    cloudOnly: appState.cloudSessions.filter((s) => !localIds.has(s.id) && isAiEligibleSession(s) && keep(s)),
  };
}

// La llamada real a Claude tarda ~1-2 minutos — un texto estático ("Armando
// tu plan…") se siente roto a ese tiempo. Rotan cada pocos segundos para
// transmitir que sí está trabajando, no que se colgó.
const THINKING_MESSAGES = [
  '🧠 Revisando tu historial…',
  '📊 Calculando tu forma actual (CTL/ATL/TSB)…',
  '🗓️ Armando la periodización del plan…',
  '💪 Concretando el primer bloque de entrenamientos…',
  '🔧 Armando los intervalos de cada sesión…',
  '✍️ Escribiendo las notas del coach…',
];

/** Con coach humano, lo que genera la IA del atleta llega como borrador a
 * su coach (ver sendWeekToCoachDraft en coach-chat) — hay que decirlo, si
 * no el atleta busca en su Plan algo que todavía no está. */
function sentToCoachHtml(): string {
  const name = humanCoachName() ?? 'tu coach';
  return `<p class="coach-human-note" style="margin-top:10px">Esta propuesta le llegó a <strong>${escapeHtml(name)}</strong> como borrador. La verás en tu Plan cuando la revise y la publique.</p>`;
}

/** "Tu coach" a secas confunde si el atleta también tiene coach humano. */
function aiCoachTitle(): string {
  return humanCoachName() ? 'Coach de IA' : 'Tu coach';
}

/** Presenta lo que dijo el coach como un mensaje amigable — sigue siendo de
 * un solo sentido, no hay caja de respuesta ni hilo. Solo texto que ya
 * regresó la Edge Function, nunca algo editable. */
function coachBubbleHtml(text: string): string {
  return `
    <div class="coach-bubble">
      <div class="coach-bubble-label"><span class="coach-bubble-dot"></span>${aiCoachTitle()}</div>
      <div class="coach-bubble-text">${escapeHtml(text)}</div>
    </div>`;
}

interface PlanWeek {
  weekIndex: number;
  workoutIds: string[];
}

interface ActivePlanRow {
  id: string;
  goal: string;
  data: {
    startDate: string;
    blocks: { name: string; weeks: number; focus: string; published?: boolean }[];
    weeks: PlanWeek[];
    // Lo último que dijo el coach en una weekly_eval — sin esto se perdía
    // apenas se recargaba la página (ver applyModeEffects en coach-chat).
    lastEvalNote?: string;
    // El tope que el atleta puso al crear el plan (ej. "máximo 60 min") —
    // se guarda acá para que weekly_eval lo siga respetando después.
    maxSessionMinutes?: number | null;
    // FTP que propuso el coach (create_plan o weekly_eval). La app ofrece un
    // botón para ponerlo en el perfil; nunca lo cambia sola.
    ftpSuggestion?: FtpSuggestion | null;
  };
  current_block_exhausted: boolean;
  last_eval_iso_week: string | null;
  eval_count_this_iso_week: number;
}

interface FtpSuggestion {
  watts: number;
  from: 'create_plan' | 'weekly_eval';
  at: string;
}

// "Ahora no" se recuerda solo en este navegador: es una comodidad, no un
// dato del plan. Si el storage falla, el botón simplemente vuelve a salir.
const FTP_OFFER_DISMISSED_KEY = 'torq.ftpOfferDismissed';

function ftpOfferDismissed(s: FtpSuggestion): boolean {
  try {
    return localStorage.getItem(FTP_OFFER_DISMISSED_KEY) === `${s.watts}@${s.at}`;
  } catch {
    return false;
  }
}

/** Botón para poner en el perfil el FTP que propuso el coach. Nada si ya es
 * ese número o el atleta dijo "Ahora no" a esta misma sugerencia. */
function ftpOfferHtml(s: FtpSuggestion | null | undefined): string {
  if (!s || s.watts === appState.profile.ftp || ftpOfferDismissed(s)) return '';
  return `
    <div class="coach-ftp-offer" data-ftp-watts="${s.watts}" data-ftp-at="${escapeHtml(s.at)}" style="margin-top:10px">
      <p class="hint" style="margin:0 0 6px">El coach propone ${s.watts} W como tu FTP (hoy tienes ${appState.profile.ftp} W). Tú decides.</p>
      <button class="btn-light" data-ftp-accept>Usar ${s.watts} W como mi FTP</button>
      <button class="plan-chip" data-ftp-dismiss>Ahora no</button>
    </div>`;
}

function wireFtpOffer(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.coach-ftp-offer').forEach((offer) => {
    const watts = Number(offer.dataset.ftpWatts);
    offer.querySelector('[data-ftp-accept]')?.addEventListener('click', async () => {
      appState.profile = withFtp(appState.profile, watts, sourceForAcceptedSuggestion(appState.profile));
      await appState.persistProfile();
      offer.innerHTML = `<p class="hint" style="margin:0">Listo: tu FTP ahora es ${watts} W.</p>`;
    });
    offer.querySelector('[data-ftp-dismiss]')?.addEventListener('click', () => {
      try {
        localStorage.setItem(FTP_OFFER_DISMISSED_KEY, `${watts}@${offer.dataset.ftpAt ?? ''}`);
      } catch {
        // sin storage: se oculta solo por ahora
      }
      offer.remove();
    });
  });
}

const MAX_EVALS_PER_ISO_WEEK = 2; // mismo número que coach-chat/index.ts — la 2ª es un "refresh" de la misma semana

async function fetchActivePlan(userId: string): Promise<ActivePlanRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('training_plans')
    .select('id, goal, data, current_block_exhausted, last_eval_iso_week, eval_count_this_iso_week')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    console.error('no se pudo leer el plan activo', error);
    return null;
  }
  return data as ActivePlanRow | null;
}

/** Mismo ancla que usa el servidor (ver mondayOf/weekEndDate en
 * coach-chat/index.ts) — las "semanas" del plan se alinean a semanas
 * calendario reales (lunes-domingo), no a bloques rígidos de 7 días desde
 * startDate. La semana 0 puede ser corta si el plan no arrancó en lunes. */
function mondayOf(dateUtc: Date): Date {
  const dayNum = (dateUtc.getUTCDay() + 6) % 7;
  const monday = new Date(dateUtc);
  monday.setUTCDate(monday.getUTCDate() - dayNum);
  return monday;
}

function weekEndDate(startDate: string, weekIndex: number): Date {
  const start = new Date(`${startDate}T00:00:00Z`);
  const firstMonday = mondayOf(start);
  const weekEnd = new Date(firstMonday);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + weekIndex * 7 + 6);
  return weekEnd;
}

/** Mismo algoritmo ISO-8601 que currentIsoWeek() en coach-chat/index.ts —
 * se necesita acá también para saber, sin llamar al servidor, si ya se
 * evaluó esta semana (plan.last_eval_iso_week) y así no mostrar un botón
 * que el servidor de todos modos va a rechazar. */
function currentIsoWeek(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Red de seguridad invisible — en uso normal (2×semana) nunca se acerca a
// esto, así que no se muestra como si fuera un recurso a administrar (eso
// confundía: "te quedan 10" sugiere algo que se gasta a propósito, cuando
// la restricción real que el atleta de verdad vive es la semanal de abajo).
// Solo aparece un mensaje si de verdad se topa, caso anómalo.
const MONTHLY_WEEKLY_EVAL_LIMIT = 10; // mismo número que coach-chat/index.ts

function evalZoneHtml(plan: ActivePlanRow, weeklyEvalsUsed: number): string {
  if (plan.current_block_exhausted) return ''; // toca publish_block, no weekly_eval — eso no tiene UI todavía
  // create_plan concretiza hasta 3 semanas de una vez — mientras todavía
  // queden semanas ya armadas por delante que ni siquiera han empezado, no
  // hay nada real que evaluar (mismo gate que el servidor en
  // checkModeAllowed, para no mostrar un botón que de todos modos va a
  // rebotar). Sin esto, evaluar el día 1 de un plan nuevo trataba semanas
  // futuras sin entrenar como adherencia perdida — encontrado probando esto.
  const lastWeekEnd = weekEndDate(plan.data.startDate, plan.data.weeks.length - 1);
  const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (todayUtc <= lastWeekEnd) {
    const lastWeekEndLabel = lastWeekEnd.toISOString().slice(0, 10);
    return `<p class="hint" style="margin-top:10px">Tu plan ya tiene armadas las próximas semanas — vuelve cuando se acerque el ${lastWeekEndLabel} para seguir ajustando.</p>`;
  }
  if (weeklyEvalsUsed >= MONTHLY_WEEKLY_EVAL_LIMIT) {
    return `<p class="hint" style="margin-top:10px">Alcanzaste el límite de seguridad de evaluaciones de este mes — vuelve el próximo mes.</p>`;
  }
  const evalsThisWeek = plan.last_eval_iso_week === currentIsoWeek() ? plan.eval_count_this_iso_week : 0;
  const isRefresh = evalsThisWeek > 0;
  const remainingThisWeek = MAX_EVALS_PER_ISO_WEEK - evalsThisWeek;
  if (remainingThisWeek <= 0) {
    return `<p class="hint" style="margin-top:10px">Ya usaste tus ${MAX_EVALS_PER_ISO_WEEK} evaluaciones de esta semana — vuelve la próxima para seguir ajustando.</p>`;
  }
  return `
    <div style="margin-top:10px">
      <button class="btn-light" id="coach-eval-open">${isRefresh ? 'Refrescar semana' : 'Evaluar semana'}</button>
      <p class="hint" style="margin-top:4px">Te quedan ${remainingThisWeek} de ${MAX_EVALS_PER_ISO_WEEK} evaluaciones de esta semana. Mejor espérate al final de la semana (ej. domingo) para evaluarla — así el coach ve cómo te fue completa y arma o actualiza la semana siguiente con esa info real, no a medias.</p>
    </div>
    <div id="coach-eval-form" style="display:none;margin-top:10px">
      <label class="live-col-label">¿Cómo te fue esta semana y algo que debamos saber para la que viene? (opcional)
        <textarea id="coach-eval-note" rows="3" placeholder="Ej. me sentí muy cansado toda la semana · el miércoles no voy a poder entrenar · el sábado tengo una rodada larga con un grupo · estoy de vacaciones…" style="width:100%;resize:vertical;font-family:inherit"></textarea>
      </label>
      <button class="btn-light" id="coach-eval-submit" style="margin-top:8px">${isRefresh ? 'Refrescar semana' : 'Evaluar semana'}</button>
      <p class="hint" id="coach-eval-status" style="margin-top:8px"></p>
    </div>`;
}

function planSummaryHtml(plan: ActivePlanRow, weeklyEvalsUsed: number, planActionsUsed: number): string {
  const blocks = plan.data.blocks
    .map((b) => `<span class="plan-chip${b.published ? ' on' : ''}">${b.name} · ${b.weeks} sem</span>`)
    .join('');
  const planActionsRemaining = MONTHLY_PLAN_ACTION_LIMIT - planActionsUsed;
  return `
    <div class="panel plan-coach-card">
      <h2 class="perfil-h2" style="margin:0">${aiCoachTitle()} — ${plan.goal}</h2>
      <div class="plan-chip-row" style="margin-top:10px">${blocks}</div>
      <p class="hint" style="margin-top:8px">${plan.current_block_exhausted ? 'El bloque actual ya se completó — toca publicar el siguiente.' : 'Semana en curso dentro del plan.'}</p>
      ${plan.data.lastEvalNote ? coachBubbleHtml(plan.data.lastEvalNote) : ''}
      ${ftpOfferHtml(plan.data.ftpSuggestion)}
      <div id="coach-eval-zone">${evalZoneHtml(plan, weeklyEvalsUsed)}</div>
      <div id="coach-abandon-zone" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <a href="#" class="prepare-link" id="coach-abandon">Dar de baja este plan</a>
        <p class="hint" style="margin-top:4px">
          ${planActionsRemaining > 0 ? `Te quedan ${planActionsRemaining} de ${MONTHLY_PLAN_ACTION_LIMIT} cambios de plan este mes.` : `Ya usaste tus ${MONTHLY_PLAN_ACTION_LIMIT} cambios de plan de este mes — vuelve el próximo mes.`}
          Para crear un plan nuevo primero tienes que dar de baja el actual.
        </p>
      </div>
      <p class="hint" id="coach-abandon-error" style="margin-top:8px;display:none"></p>
    </div>`;
}

/** Confirmación propia de la app, sin confirm()/alert() nativos — esos
 * bloquean toda la pestaña (congelan hasta el render), no solo son feos.
 * El primer clic en el link cambia la zona por "¿Seguro? Sí/No" inline. */
function wireAbandonButton(slot: HTMLElement, container: HTMLElement, onChange: () => void): void {
  const zone = slot.querySelector<HTMLElement>('#coach-abandon-zone');
  const errorEl = slot.querySelector<HTMLElement>('#coach-abandon-error');
  zone?.querySelector('#coach-abandon')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!zone || !confirmAiWithHumanCoach()) return;
    zone.innerHTML = `
      <span class="hint">¿Dar de baja?</span>
      <button class="plan-chip" id="coach-abandon-yes">Sí</button>
      <button class="plan-chip on" id="coach-abandon-no">No</button>`;
    zone.querySelector('#coach-abandon-no')?.addEventListener('click', () => renderCoachSection(container, onChange));
    zone.querySelector('#coach-abandon-yes')?.addEventListener('click', async () => {
      if (!supabase) return;
      const { error, data } = await supabase.functions.invoke('coach-retire-plan', { body: { status: 'abandoned' } });
      if (error || data?.error) {
        if (errorEl) {
          errorEl.textContent = `No se pudo dar de baja: ${data?.error ?? error?.message ?? 'error desconocido'}`;
          errorEl.style.display = 'block';
        }
        return;
      }
      // El servidor ya borró estos workouts (nunca entrenados) de verdad —
      // sin esto, appState.workouts se queda con la agenda muerta en
      // memoria y el calendario la sigue mostrando hasta un reload completo
      // (bug real encontrado probando este flujo). Limpia memoria Y
      // IndexedDB local, mismo patrón que syncFromCloud en ui/state.ts.
      const deletedIds: string[] = data?.deletedWorkoutIds ?? [];
      if (deletedIds.length > 0) {
        const deletedSet = new Set(deletedIds);
        appState.workouts = appState.workouts.filter((w) => !deletedSet.has(w.id));
        await Promise.all(deletedIds.map((id) => deleteWorkout(id)));
      }
      onChange();
    });
  });
}

/** Botón "Evaluar semana" — abre un textarea opcional para contexto libre
 * del atleta (ver evalZoneHtml) y, al confirmar, llama a weekly_eval con el
 * contexto real calculado en computeWeekEvalContext. Mismo patrón de
 * thinking-banner + manejo de error que openCreateModal. */
function wireWeeklyEvalButton(slot: HTMLElement, plan: ActivePlanRow, onChange: () => void): void {
  const openBtn = slot.querySelector<HTMLButtonElement>('#coach-eval-open');
  const form = slot.querySelector<HTMLElement>('#coach-eval-form');
  const noteInput = slot.querySelector<HTMLTextAreaElement>('#coach-eval-note');
  const submitBtn = slot.querySelector<HTMLButtonElement>('#coach-eval-submit');
  const status = slot.querySelector<HTMLElement>('#coach-eval-status');
  if (!openBtn || !form || !noteInput || !submitBtn || !status) return;

  openBtn.addEventListener('click', () => {
    if (!confirmAiWithHumanCoach()) return;
    openBtn.parentElement!.style.display = 'none';
    form.style.display = '';
  });

  submitBtn.addEventListener('click', async () => {
    if (!supabase) return;
    submitBtn.disabled = true;
    let msgIndex = 0;
    status.textContent = THINKING_MESSAGES[0];
    const thinkingTimer = window.setInterval(() => {
      msgIndex = (msgIndex + 1) % THINKING_MESSAGES.length;
      status.textContent = THINKING_MESSAGES[msgIndex];
    }, 4000);

    const athleteNote = noteInput.value.trim() || null;
    const context = await computeWeekEvalContext(plan, athleteNote);
    if (!context) {
      window.clearInterval(thinkingTimer);
      status.textContent = 'Todavía no hay ninguna sesión real registrada para evaluar — entrena esta semana primero.';
      submitBtn.disabled = false;
      return;
    }

    const { data, error } = await supabase.functions.invoke('coach-chat', { body: { mode: 'weekly_eval', context } });
    window.clearInterval(thinkingTimer);
    if (error || data?.error) {
      let serverMessage = data?.error as string | undefined;
      if (!serverMessage && error && 'context' in error) {
        try {
          const body = await (error as unknown as { context: Response }).context.json();
          serverMessage = body?.error;
        } catch {
          // el body no era JSON — nos quedamos con error.message de abajo
        }
      }
      status.textContent = `No se pudo evaluar la semana: ${serverMessage ?? error?.message ?? 'error desconocido'}`;
      submitBtn.disabled = false;
      return;
    }

    status.textContent = '';
    form.querySelectorAll('label, #coach-eval-submit').forEach((el) => ((el as HTMLElement).style.display = 'none'));
    status.insertAdjacentHTML('beforebegin', coachBubbleHtml(data.result.reasoning));
    if (data.result.sentToCoach) status.insertAdjacentHTML('beforebegin', sentToCoachHtml());
    if (data.result.ftpAction === 'change' && data.result.suggestedFtp) {
      status.insertAdjacentHTML('beforebegin', ftpOfferHtml({ watts: Math.round(data.result.suggestedFtp), from: 'weekly_eval', at: new Date().toISOString() }));
      wireFtpOffer(form);
    }
    status.insertAdjacentHTML(
      'afterend',
      '<button class="btn-light" id="coach-eval-done" style="margin-top:12px">Entendido</button>',
    );
    form.querySelector('#coach-eval-done')?.addEventListener('click', onChange);
  });
}

const MONTHLY_PLAN_ACTION_LIMIT = 3; // mismo número que coach-chat/index.ts — solo para mostrar el aviso, el tope real lo aplica el servidor

/** Cuenta create_plan + modify_plan de este mes calendario — mismo criterio
 * que el servidor (ver coach-chat/index.ts getMonthlyActionCount), para
 * avisar ANTES de que lo intenten, no solo cuando ya les rebotó el error.
 * Filtra por action explícitamente: plan_actions ahora también guarda filas
 * de weekly_eval (tope separado, ver fetchMonthlyWeeklyEvalsUsed) — sin este
 * filtro, evaluar la semana unas veces infla por error el conteo de
 * creaciones/cambios de plan. */
async function fetchMonthlyPlanActionsUsed(userId: string): Promise<number> {
  if (!supabase) return 0;
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('plan_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('action', ['create', 'modify'])
    .gte('created_at', startOfMonth.toISOString());
  return count ?? 0;
}

/** Mismo criterio que arriba, pero para el tope SEPARADO de weekly_eval
 * (ver MONTHLY_WEEKLY_EVAL_LIMIT y getMonthlyActionCount en coach-chat). */
async function fetchMonthlyWeeklyEvalsUsed(userId: string): Promise<number> {
  if (!supabase) return 0;
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('plan_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'weekly_eval')
    .gte('created_at', startOfMonth.toISOString());
  return count ?? 0;
}

function createCardHtml(actionsUsed: number): string {
  const remaining = MONTHLY_PLAN_ACTION_LIMIT - actionsUsed;
  const atLimit = remaining <= 0;
  return `
    <div class="panel plan-coach-card">
      <h2 class="perfil-h2" style="margin:0">${aiCoachTitle()}</h2>
      <p class="hint" style="margin-top:8px">Todavía no tienes un plan — el coach arma tu periodización y va ajustando cada semana según cómo te va.</p>
      <button class="btn-light" id="coach-open-create" style="margin-top:10px" ${atLimit ? 'disabled' : ''}>Crear mi plan</button>
      <p class="hint" style="margin-top:6px">${atLimit ? 'Ya usaste tus 3 creaciones/cambios de plan de este mes — vuelve el próximo mes.' : `Te quedan ${remaining} de ${MONTHLY_PLAN_ACTION_LIMIT} creaciones/cambios de plan este mes.`}</p>
    </div>`;
}

// Disciplina/años/compite/FTP/experiencia ya viven en el Perfil (ver
// onboarding.ts) — este modal solo pregunta lo específico de ESTE plan.
// create_plan los lee directo de appState.profile al armar el context.
function modalHtml(): string {
  const days = DAY_ORDER.map((d) => `<button class="plan-chip" data-day="${d}">${DAY_LABELS[d]}</button>`).join('');
  return `
    <div class="modal-backdrop" id="coach-modal-backdrop">
      <div class="panel plan-coach-modal" id="coach-modal">
        <div class="plan-create-head">
          <h2 class="perfil-h2" style="margin:0">Crear tu plan</h2>
          <button class="plan-create-close" id="coach-modal-close" aria-label="Cerrar">✕</button>
        </div>
        <label class="live-col-label">¿Para qué entrenas?
          <textarea id="coach-goal" rows="4" placeholder="Cuéntanos con calma: para qué te preparas, qué quieres lograr, si hay una carrera o fecha objetivo, cualquier contexto que ayude a armar tu plan" style="width:100%;resize:vertical;font-family:inherit"></textarea>
        </label>
        <label class="live-col-label" style="margin-top:10px;display:block">Horas por semana disponibles
          <input type="number" id="coach-hours" value="6" min="1" max="20" style="width:100%">
        </label>
        <label class="live-col-label" style="margin-top:10px;display:block">Minutos máximos por sesión (opcional)
          <input type="number" id="coach-max-minutes" placeholder="Ej. 60 — déjalo vacío si no te importa" min="20" max="90" style="width:100%">
        </label>
        <label class="live-col-label" style="margin-top:10px;display:block">Días disponibles</label>
        <div class="plan-chip-row" id="coach-days">${days}</div>
        <button class="btn-light" id="coach-submit" style="margin-top:14px">Crear plan</button>
        <p class="hint" id="coach-status" style="margin-top:8px"></p>
      </div>
    </div>`;
}

export function renderCoachSection(container: HTMLElement, onChange: () => void): void {
  if (!isSupabaseConfigured() || !appState.user) return; // el coach necesita cuenta — sin eso, no se muestra nada
  const slot = container.querySelector<HTMLElement>('#coach-slot');
  if (!slot) return;
  slot.innerHTML = '<div class="panel plan-coach-card"><p class="hint">Cargando tu coach…</p></div>';

  void Promise.all([
    fetchActivePlan(appState.user.id),
    fetchMonthlyPlanActionsUsed(appState.user.id),
    fetchMonthlyWeeklyEvalsUsed(appState.user.id),
  ]).then(([plan, actionsUsed, weeklyEvalsUsed]) => {
    slot.innerHTML = plan ? planSummaryHtml(plan, weeklyEvalsUsed, actionsUsed) : createCardHtml(actionsUsed);
    // Con coach humano: recordatorio visible (no bloquea) de platicar con
    // él antes de pedirle cambios a la IA — ver ui/coach-notice.ts.
    const humanCoach = humanCoachName();
    if (humanCoach) {
      slot.firstElementChild?.insertAdjacentHTML(
        'afterbegin',
        `<p class="coach-human-note">Tienes coach: <strong>${escapeHtml(humanCoach)}</strong>. Antes de pedirle cambios a la IA, platícalo con tu coach para que el plan no se contradiga. Mover, agregar o quitar entrenamientos lo puedes hacer cuando quieras.</p>`,
      );
    }
    slot.querySelector('#coach-open-create')?.addEventListener('click', () => {
      if (!confirmAiWithHumanCoach()) return;
      // El cuestionario inicial llena el Perfil persistente — si ya está
      // completo (de esta vez o de una anterior), no se vuelve a preguntar.
      if (isCoachProfileComplete(appState.profile)) {
        openCreateModal(onChange);
      } else {
        openOnboardingForm(() => openCreateModal(onChange), false);
      }
    });
    if (plan) {
      wireFtpOffer(slot);
      wireAbandonButton(slot, container, onChange);
      wireWeeklyEvalButton(slot, plan, onChange);
    }
  });
}

interface RecentHistory {
  weeksOfData: number;
  avgHoursPerWeekLast4: number;
  ctl?: number;
  atl?: number;
  tsb?: number;
}

/** Calcula el historial real del atleta con el mismo motor que ya usa Forma
 * (computePmc) — null genuino si no hay ninguna sesión, nunca inventado. */
async function computeRecentHistory(): Promise<RecentHistory | null> {
  const { localSessions, cloudOnly } = await aiEligibleSessions(true);
  const localEntries = localSessions.map((s) => ({
    dateKey: s.startedAt.slice(0, 10),
    tss: computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp }).trainingStressScore ?? 0,
    durationS: s.samples.length,
  }));
  const cloudEntries = cloudOnly
    .map((s) => ({
      dateKey: s.startedAt.slice(0, 10),
      tss: s.trainingStressScore ?? 0,
      durationS: Math.max(0, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 1000),
    }));
  const entries = [...localEntries, ...cloudEntries];
  if (entries.length === 0) return null;

  const pmc = computePmc(entries.map((e) => ({ dateKey: e.dateKey, tss: e.tss })));
  const latest = pmc[pmc.length - 1];
  const earliestKey = entries.reduce((min, e) => (e.dateKey < min ? e.dateKey : min), entries[0].dateKey);
  const weeksOfData = Math.max(
    1,
    Math.round((new Date().getTime() - new Date(`${earliestKey}T00:00:00Z`).getTime()) / (7 * 86400000)),
  );
  const fourWeeksAgoKey = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const last4WeeksHours = entries.filter((e) => e.dateKey >= fourWeeksAgoKey).reduce((sum, e) => sum + e.durationS, 0) / 3600;

  return {
    weeksOfData,
    avgHoursPerWeekLast4: Math.round((last4WeeksHours / 4) * 10) / 10,
    ctl: latest ? Math.round(latest.ctl * 10) / 10 : undefined,
    atl: latest ? Math.round(latest.atl * 10) / 10 : undefined,
    tsb: latest ? Math.round(latest.tsb * 10) / 10 : undefined,
  };
}

/** Fechas (YYYY-MM-DD) entre startDate y startDate+weeksAhead semanas que
 * YA tienen un workout agendado o una sesión completada — create_plan y
 * weekly_eval las mandan como `occupiedDates` para que el coach nunca
 * duplique un día que el atleta ya tiene ocupado (encontrado en
 * producción: create_plan duplicaba entrenamientos ya completados). */
async function computeOccupiedDates(startDate: string, weeksAhead: number): Promise<string[]> {
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + weeksAhead * 7);
  const endKey = end.toISOString().slice(0, 10);
  const inRange = (d: string) => d >= startDate && d <= endKey;

  const scheduled = appState.workouts.filter((w) => w.scheduledDate && inRange(w.scheduledDate)).map((w) => w.scheduledDate!);

  // occupiedDates también le llega al modelo (ver prompt.ts), así que las
  // fechas de sesiones de Strava tampoco van.
  const { localSessions, cloudOnly } = await aiEligibleSessions(false);
  const localDates = localSessions.map((s) => s.startedAt.slice(0, 10)).filter(inRange);
  const cloudDates = cloudOnly
    .map((s) => s.startedAt.slice(0, 10))
    .filter(inRange);

  return Array.from(new Set([...scheduled, ...localDates, ...cloudDates]));
}

interface WeekSummary {
  weekIndex: number;
  plannedTSS: number;
  actualTSS: number;
  completedWorkouts: number;
  missedWorkouts: number;
}

/** Contexto real para weekly_eval — nunca inventado, null si no hay ni una
 * sola sesión real con la que evaluar nada (igual que computeRecentHistory).
 * Reconstruye, para CADA semana ya materializada del plan (no solo la
 * última), planeado-vs-logrado real — así el modelo ve la trayectoria
 * completa (ver recentWeeksSummary en schemas.ts), no un dato aislado. */
async function computeWeekEvalContext(
  plan: ActivePlanRow,
  athleteNote: string | null,
): Promise<{
  weekJustFinished: {
    plannedTSS: number;
    actualTSS: number;
    completedWorkouts: number;
    missedWorkouts: number;
    ruleTriggers: { ruleId: string; count: number }[];
    athleteNote: string | null;
  };
  pmcTrend: { ctl: number; atl: number; tsb: number; ctlRampLast4Weeks: number };
  recentGapPattern: { startDate: string; endDate: string; days: number }[] | null;
  recentWeeksSummary: WeekSummary[] | null;
  profile: { sex: 'M' | 'F' | 'other' | null; name: string | null } & ReturnType<typeof coachFtpFields> & ReturnType<typeof coachProfileExtras>;
  maxSessionMinutes: number | null;
  occupiedDates: string[];
} | null> {
  const weeks = plan.data.weeks;
  if (weeks.length === 0) return null;

  const { localSessions, cloudOnly } = await aiEligibleSessions(true);
  const localEntries = localSessions.map((s) => ({
    dateKey: s.startedAt.slice(0, 10),
    tss: computeSessionAnalytics(s.samples, { ...appState.profile, ftp: s.ftp }).trainingStressScore ?? 0,
    workoutId: s.workoutId as string | null,
  }));
  // Las cloud-only no traen workoutId confiable para emparejar contra lo
  // planeado — cuentan para TSS/adherencia general, pero no para el conteo
  // preciso de completedWorkouts (ver más abajo). Simplificación conocida:
  // un workout de Torq entrenado en otro dispositivo sin volver a sincronizar
  // localmente no se cuenta como "completado" en ese conteo preciso.
  const cloudEntries = cloudOnly.map((s) => ({
    dateKey: s.startedAt.slice(0, 10),
    tss: s.trainingStressScore ?? 0,
    workoutId: null as string | null,
  }));
  const allEntries = [...localEntries, ...cloudEntries];
  if (allEntries.length === 0) return null;

  function weekDateRange(weekIndex: number): [string, string] {
    // Alineado a semanas calendario reales (lunes-domingo) — la semana 0
    // empieza en startDate mismo (puede ser una semana corta si el plan no
    // arrancó en lunes), el resto son semanas lunes-domingo completas. Ver
    // weekEndDate/mondayOf arriba, mismo ancla que el servidor.
    const planStart = plan.data.startDate;
    const end = weekEndDate(planStart, weekIndex);
    const weekMonday = mondayOf(new Date(`${planStart}T00:00:00Z`));
    weekMonday.setUTCDate(weekMonday.getUTCDate() + weekIndex * 7);
    const start = weekIndex === 0 ? new Date(`${planStart}T00:00:00Z`) : weekMonday;
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  }

  function summarizeWeek(week: PlanWeek): WeekSummary {
    const [startKey, endKey] = weekDateRange(week.weekIndex);
    const plannedWorkouts = appState.workouts.filter((w) => week.workoutIds.includes(w.id));
    const plannedTSS = plannedWorkouts.reduce((sum, w) => sum + (estimateWorkout(w.intervals, appState.profile.ftp).tss ?? 0), 0);
    const weekEntries = allEntries.filter((e) => e.dateKey >= startKey && e.dateKey <= endKey);
    const actualTSS = weekEntries.reduce((sum, e) => sum + e.tss, 0);
    const matchedWorkoutIds = new Set(weekEntries.map((e) => e.workoutId).filter((id): id is string => id !== null));
    const completedWorkouts = plannedWorkouts.filter((w) => matchedWorkoutIds.has(w.id)).length;
    const missedWorkouts = Math.max(0, plannedWorkouts.length - completedWorkouts);
    return { weekIndex: week.weekIndex, plannedTSS, actualTSS, completedWorkouts, missedWorkouts };
  }

  const weekSummaries = weeks.map(summarizeWeek);
  const lastWeek = weekSummaries[weekSummaries.length - 1];

  const pmc = computePmc(allEntries.map((e) => ({ dateKey: e.dateKey, tss: e.tss })));
  const latest = pmc[pmc.length - 1];
  const fourWeeksAgoKey = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const ctlFourWeeksAgo = [...pmc].reverse().find((p) => p.dateKey <= fourWeeksAgoKey) ?? pmc[0];

  // Huecos reales (3+ días completos sin ninguna sesión) entre sesiones
  // consecutivas — crudos, sin decidir aquí si son "un patrón"; esa lectura
  // es trabajo del modelo (ver recurringPatternFlag en el prompt).
  const sortedDates = Array.from(new Set(allEntries.map((e) => e.dateKey))).sort();
  const gaps: { startDate: string; endDate: string; days: number }[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(`${sortedDates[i - 1]}T00:00:00Z`);
    const cur = new Date(`${sortedDates[i]}T00:00:00Z`);
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    if (diffDays >= 4) {
      const gapStart = new Date(prev);
      gapStart.setUTCDate(gapStart.getUTCDate() + 1);
      const gapEnd = new Date(cur);
      gapEnd.setUTCDate(gapEnd.getUTCDate() - 1);
      gaps.push({ startDate: gapStart.toISOString().slice(0, 10), endDate: gapEnd.toISOString().slice(0, 10), days: diffDays - 1 });
    }
  }

  const occupiedDates = await computeOccupiedDates(new Date().toISOString().slice(0, 10), 1);

  return {
    weekJustFinished: {
      plannedTSS: lastWeek.plannedTSS,
      actualTSS: lastWeek.actualTSS,
      completedWorkouts: lastWeek.completedWorkouts,
      missedWorkouts: lastWeek.missedWorkouts,
      // No se trackea ruleId por sesión hoy (SessionRecord.alerts solo
      // guarda level/message, no el id de la regla) — vacío en vez de
      // inventar números. El resto de la jerarquía de evidencia (TSS real,
      // PMC, huecos) ya cubre la señal que más importa.
      ruleTriggers: [],
      athleteNote,
    },
    pmcTrend: {
      ctl: Math.round(latest.ctl * 10) / 10,
      atl: Math.round(latest.atl * 10) / 10,
      tsb: Math.round(latest.tsb * 10) / 10,
      ctlRampLast4Weeks: Math.round((latest.ctl - ctlFourWeeksAgo.ctl) * 10) / 10,
    },
    recentGapPattern: gaps.length > 0 ? gaps.slice(-5) : null,
    recentWeeksSummary: weekSummaries.length > 1 ? weekSummaries : null,
    profile: {
      sex: appState.profile.sex ?? null,
      name: appState.profile.name ?? null,
      ...coachFtpFields(appState.profile),
      ...coachProfileExtras(appState.profile),
    },
    maxSessionMinutes: plan.data.maxSessionMinutes ?? null,
    occupiedDates,
  };
}

function openCreateModal(onChange: () => void): void {
  document.body.insertAdjacentHTML('beforeend', modalHtml());
  const backdrop = document.getElementById('coach-modal-backdrop')!;
  const selectedDays = new Set<string>();
  const status = backdrop.querySelector<HTMLElement>('#coach-status')!;

  backdrop.querySelectorAll<HTMLButtonElement>('#coach-days .plan-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const day = chip.dataset.day!;
      if (selectedDays.has(day)) {
        selectedDays.delete(day);
        chip.classList.remove('on');
      } else {
        selectedDays.add(day);
        chip.classList.add('on');
      }
    });
  });

  const close = () => backdrop.remove();
  backdrop.querySelector('#coach-modal-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const submitBtn = backdrop.querySelector<HTMLButtonElement>('#coach-submit')!;
  backdrop.querySelector('#coach-submit')?.addEventListener('click', async () => {
    if (!supabase) return;
    const goal = (backdrop.querySelector<HTMLInputElement>('#coach-goal')!).value.trim();
    const hoursPerWeek = Number((backdrop.querySelector<HTMLInputElement>('#coach-hours')!).value);
    if (!goal) {
      status.textContent = 'Dinos para qué entrenas.';
      return;
    }
    if (selectedDays.size === 0) {
      status.textContent = 'Elige al menos un día disponible.';
      return;
    }

    // Deshabilitado mientras espera — la llamada tarda ~1-2 min y sin esto
    // un doble click manda dos create_plan (gasta 2 de las 3 del mes en vez
    // de 1). El texto rota para que no se sienta colgado a ese tiempo.
    submitBtn.disabled = true;
    let msgIndex = 0;
    status.textContent = THINKING_MESSAGES[0];
    const thinkingTimer = window.setInterval(() => {
      msgIndex = (msgIndex + 1) % THINKING_MESSAGES.length;
      status.textContent = THINKING_MESSAGES[msgIndex];
    }, 4000);

    // Todo lo de abajo ya vive en el Perfil (llenado por el cuestionario
    // inicial, ver onboarding.ts) — nunca se vuelve a preguntar aquí.
    const p = appState.profile;
    const startDate = new Date().toISOString().slice(0, 10);
    const maxMinutesInput = (backdrop.querySelector<HTMLInputElement>('#coach-max-minutes')!).value.trim();
    const maxSessionMinutes = maxMinutesInput ? Number(maxMinutesInput) : null;
    const [recentHistory, occupiedDates] = await Promise.all([computeRecentHistory(), computeOccupiedDates(startDate, 3)]);
    const context = {
      startDate,
      goal,
      experienceLevel: p.experienceLevel!,
      generalFitnessLevel: p.generalFitnessLevel!,
      discipline: p.discipline!,
      yearsRiding: p.yearsRiding ?? 0,
      competes: p.competes ?? false,
      category: p.competes ? (p.category ?? null) : null,
      availability: { hoursPerWeek, days: Array.from(selectedDays), maxSessionMinutes },
      occupiedDates,
      // ftp solo si es medido; un provisional va en provisionalFtp (ver
      // core/coach-profile.ts). Edad en vez de fecha de nacimiento.
      profile: { ...coachFtpFields(p), hr_max: p.hr_max, sex: p.sex ?? null, name: p.name ?? null, ...coachProfileExtras(p) },
      recentHistory,
    };

    const { data, error } = await supabase.functions.invoke('coach-chat', { body: { mode: 'create_plan', context } });
    window.clearInterval(thinkingTimer);
    if (error || data?.error) {
      // En respuestas non-2xx, supabase-js deja `data` en null y pone en
      // `error.message` un texto genérico ("Edge Function returned a non-2xx
      // status code") — el error real que sí manda la función (json({error})
      // en index.ts) vive en el body de error.context, nunca en data. Sin
      // esto, cada error del servidor se ve idéntico aunque la razón sea
      // totalmente distinta cada vez.
      let serverMessage = data?.error as string | undefined;
      if (!serverMessage && error && 'context' in error) {
        try {
          const body = await (error as unknown as { context: Response }).context.json();
          serverMessage = body?.error;
        } catch {
          // el body no era JSON — nos quedamos con error.message de abajo
        }
      }
      status.textContent = `No se pudo crear el plan: ${serverMessage ?? error?.message ?? 'error desconocido'}`;
      submitBtn.disabled = false;
      return;
    }

    // Se queda la burbuja con lo que dijo el coach, visible hasta que el
    // atleta la cierre él mismo — ya no es un auto-cierre con timer, hay
    // algo real que leer.
    status.textContent = '';
    const form = backdrop.querySelectorAll('label, .plan-chip-row, #coach-submit');
    form.forEach((el) => ((el as HTMLElement).style.display = 'none'));
    status.insertAdjacentHTML('beforebegin', coachBubbleHtml(data.result.coachNote));
    if (data.result.sentToCoach) status.insertAdjacentHTML('beforebegin', sentToCoachHtml());
    if (data.result.suggestedFtp) {
      status.insertAdjacentHTML('beforebegin', ftpOfferHtml({ watts: Math.round(data.result.suggestedFtp), from: 'create_plan', at: new Date().toISOString() }));
      wireFtpOffer(backdrop);
    }
    status.insertAdjacentHTML(
      'afterend',
      '<button class="btn-light" id="coach-done" style="margin-top:12px">Entendido</button>',
    );
    backdrop.querySelector('#coach-done')?.addEventListener('click', () => {
      close();
      onChange();
    });
  });
}
