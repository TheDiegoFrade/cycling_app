// Revisión mensual del coach (paso 7 — docs/coach-view/mockups/
// Revision.html). #/coach-review/:atleta/:mes (mes = "2026-09"; sin mes, el
// último mes completo). Los números los arma Torq; el coach escribe el
// mensaje, ajusta los hallazgos y los objetivos, y publica. El atleta no ve
// nada hasta entonces. Cada cambio se guarda solo (con una pausa corta).
import { cleanFindings, cleanGoals, defaultReviewMonth, isMonthKey, monthLabel, reviewAiContext, shiftMonth, suggestFindings, suggestVerdict } from '../../core/monthly-report';
import type { MonthlyReport, ReviewFinding, ReviewVerdict } from '../../core/monthly-report';
import { requestMonthlyReviewDraft } from '../../sync/coach-ai';
import { listCoachAthletes } from '../../sync/coach-athletes';
import type { CoachAthlete } from '../../sync/coach-athletes';
import { fetchCoachReview, loadMonthlyReport, saveReview, sendReviewEmail, setReviewStatus } from '../../sync/monthly-reviews';
import type { MonthlyReview, ReviewContent } from '../../sync/monthly-reviews';
import { athleteName, disciplineLabel, todayUtcKey, errorMessage } from '../coach-ui';
import { emailKpis, renderReportSheet } from '../monthly-report-view';
import { getRouteParam, navigate } from '../router';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

const SAVE_DELAY_MS = 800;

export function renderCoachReview(container: HTMLElement): () => void {
  const [athleteId, rawMonth] = (getRouteParam() ?? '').split('/');
  const todayKey = todayUtcKey();
  const currentMonth = todayKey.slice(0, 7);
  const monthKey = isMonthKey(rawMonth) && rawMonth <= currentMonth ? rawMonth : defaultReviewMonth(todayKey);
  const coachId = appState.user?.id ?? null;
  const routeParam = getRouteParam();

  let athlete: CoachAthlete | null = null;
  let report: MonthlyReport | null = null;
  let review: MonthlyReview | null = null;
  let content: ReviewContent = { verdict: null, coachMessage: '', findings: [], goals: [], coachName: appState.profile.name ?? null };
  let suggested: ReviewFinding[] = [];
  let dirty = false;
  let saveTimer: number | null = null;
  let saving: Promise<void> = Promise.resolve();
  let status = '';
  let busy = false;
  let drafting = false;
  let emailing = false;
  let aiMessage: string | null = null;
  let disposed = false;

  const stale = () => disposed || getRouteParam() !== routeParam;

  function shell(body: string): void {
    container.innerHTML = `<div class="screen coach-screen review-screen"><a href="#/coach-athlete/${escapeHtml(athleteId ?? '')}" class="back-link">← ${athlete ? escapeHtml(athleteName(athlete)) : 'Atleta'}</a>${body}</div>`;
  }

  if (!coachId || !appState.coach.isCoach) {
    shell('<p class="hint">Esta sección es solo para coaches.</p>');
    return () => {};
  }
  if (!athleteId) {
    shell('<p class="hint">Falta el atleta.</p>');
    return () => {};
  }

  const published = () => review?.status === 'published';

  function sheet(editable: boolean): string {
    return renderReportSheet({
      report: report!,
      athleteName: athlete ? athleteName(athlete) : 'Atleta',
      coachName: content.coachName,
      discipline: athlete ? disciplineLabel(athlete) : null,
      ftp: athlete?.ftp ?? null,
      weightKg: athlete?.weightKg ?? null,
      goal: athlete?.goal ?? null,
      content,
      publishedAt: review?.publishedAt ?? null,
      editable,
      aiMessage: editable ? aiMessage : null,
    });
  }

  function statusPill(): string {
    if (published())
      return `<span class="coach-pill coach-pill-success">Publicada · tu atleta ya la ve</span>${
        review?.emailedAt ? `<span class="coach-pill">Enviada por correo el ${new Date(review.emailedAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''
      }`;
    if (review) return '<span class="coach-pill coach-pill-accent">Borrador · tu atleta aún no la ve</span>';
    return '<span class="coach-pill">Sin empezar</span>';
  }

  function render(): void {
    if (!report) return;
    const canNext = shiftMonth(monthKey, 1) <= currentMonth;
    shell(`
      <header class="coach-head review-toolbar">
        <div>
          <div class="weeks-nav">
            <button type="button" id="rv-prev" aria-label="Mes anterior">‹</button>
            <h1>Revisión · ${monthLabel(monthKey)}</h1>
            <button type="button" id="rv-next" aria-label="Mes siguiente"${canNext ? '' : ' disabled'}>›</button>
          </div>
          <div class="coach-pills">${statusPill()}<span class="hint" id="rv-status" aria-live="polite">${escapeHtml(status)}</span></div>
        </div>
        <div class="coach-head-actions">
          ${published() ? '' : `<button type="button" id="rv-ai"${drafting || busy ? ' disabled' : ''}>${drafting ? 'Redactando…' : 'Redactar con IA'}</button>`}
          <button type="button" id="rv-print">Descargar PDF</button>
          ${
            published()
              ? `<button type="button" class="btn-light" id="rv-email"${emailing || busy ? ' disabled' : ''}>${emailing ? 'Enviando…' : review?.emailedAt ? 'Reenviar por correo' : 'Enviar por correo'}</button>
                 <button type="button" id="rv-unpublish"${busy ? ' disabled' : ''}>Regresar a borrador</button>`
              : `<button type="button" class="btn-light" id="rv-publish"${busy ? ' disabled' : ''}>Publicar al atleta</button>`
          }
        </div>
      </header>
      ${report.inProgress ? '<p class="hint">Este mes sigue en curso: los números cambian hasta que termine.</p>' : ''}
      ${published() ? '<p class="hint">Para corregir algo, regrésala a borrador (tu atleta deja de verla) y vuelve a publicarla.</p>' : '<p class="hint">Los números los arma Torq con las sesiones del mes. Tú escribes el mensaje, revisas los hallazgos y dejas 2 o 3 objetivos. Se guarda solo.</p>'}
      <div class="report-desk">${sheet(!published())}</div>`);
    wire();
  }

  function setStatus(text: string): void {
    status = text;
    const el = container.querySelector('#rv-status');
    if (el) el.textContent = text;
  }

  function cleaned(): ReviewContent {
    return { ...content, coachMessage: content.coachMessage.trim(), findings: cleanFindings(content.findings), goals: cleanGoals(content.goals) };
  }

  /** Guarda lo pendiente (en cola: nunca dos guardados a la vez). */
  function flush(): Promise<void> {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!dirty) return saving;
    dirty = false;
    const snapshot = cleaned();
    setStatus('Guardando…');
    const run = saving.then(async () => {
      review = await saveReview(review, coachId!, athleteId!, monthKey, snapshot);
    });
    saving = run.then(
      () => {
        if (!stale()) setStatus(dirty ? 'Guardando…' : 'Guardado');
      },
      (err) => {
        dirty = true;
        if (!stale()) setStatus(`No se pudo guardar: ${errorMessage(err)}`);
      },
    );
    return run;
  }

  function changed(rerender = false): void {
    dirty = true;
    setStatus('Cambios sin guardar…');
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void flush().catch(() => {}), SAVE_DELAY_MS);
    if (rerender) {
      const hadReview = !!review;
      render();
      if (!hadReview) setStatus('Cambios sin guardar…');
    }
  }

  function wire(): void {
    container.querySelector('#rv-prev')?.addEventListener('click', () => go(shiftMonth(monthKey, -1)));
    container.querySelector('#rv-next')?.addEventListener('click', () => go(shiftMonth(monthKey, 1)));
    container.querySelector('#rv-print')?.addEventListener('click', () => {
      // se imprime la versión de lectura (sin cajas de texto)
      const desk = container.querySelector('.report-desk');
      if (!desk) return;
      desk.innerHTML = sheet(false);
      window.print();
      desk.innerHTML = sheet(!published());
      wireSheet();
    });
    container.querySelector('#rv-publish')?.addEventListener('click', () => void publish());
    container.querySelector('#rv-ai')?.addEventListener('click', () => void draftWithAi());
    container.querySelector('#rv-email')?.addEventListener('click', () => void emailReview());
    container.querySelector('#rv-unpublish')?.addEventListener('click', () => void unpublish());
    wireSheet();
  }

  function wireSheet(): void {
    const root = container.querySelector('.report-sheet');
    if (!root || published()) return;
    root.querySelector<HTMLSelectElement>('[data-rv="verdict"]')?.addEventListener('change', (e) => {
      content.verdict = (e.target as HTMLSelectElement).value as ReviewVerdict;
      changed();
    });
    root.querySelector('#rv-use-ai-message')?.addEventListener('click', () => {
      if (!aiMessage) return;
      content.coachMessage = aiMessage;
      aiMessage = null;
      changed(true);
    });
    root.querySelector('#rv-dismiss-ai-message')?.addEventListener('click', () => {
      aiMessage = null;
      render();
    });
    root.querySelector<HTMLTextAreaElement>('[data-rv="message"]')?.addEventListener('input', (e) => {
      content.coachMessage = (e.target as HTMLTextAreaElement).value;
      changed();
    });
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-rv-finding]').forEach((el) =>
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const i = Number(el.dataset.rvFinding);
        const field = el.dataset.field as keyof ReviewFinding;
        content.findings = content.findings.map((f, k) => (k === i ? { ...f, [field]: el.value } : f));
        changed(field === 'tone');
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-rv-remove-finding]').forEach((b) =>
      b.addEventListener('click', () => {
        content.findings = content.findings.filter((_, k) => k !== Number(b.dataset.rvRemoveFinding));
        changed(true);
      }),
    );
    root.querySelector('#rv-add-finding')?.addEventListener('click', () => {
      content.findings = [...content.findings, { tone: 'good', title: '', body: '' }];
      changed(true);
      container.querySelector<HTMLInputElement>(`[data-rv-finding="${content.findings.length - 1}"][data-field="title"]`)?.focus();
    });
    root.querySelector('#rv-suggest')?.addEventListener('click', () => {
      if (content.findings.length && !window.confirm('¿Reemplazar los hallazgos por los que sugieren los datos?')) return;
      content.findings = suggested.map((f) => ({ ...f }));
      changed(true);
    });
    root.querySelectorAll<HTMLInputElement>('[data-rv-goal]').forEach((el) =>
      el.addEventListener('input', () => {
        const i = Number(el.dataset.rvGoal);
        const field = el.dataset.field as 'title' | 'detail';
        content.goals = content.goals.map((g, k) => (k === i ? { ...g, [field]: el.value } : g));
        changed();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-rv-remove-goal]').forEach((b) =>
      b.addEventListener('click', () => {
        content.goals = content.goals.filter((_, k) => k !== Number(b.dataset.rvRemoveGoal));
        changed(true);
      }),
    );
    root.querySelector('#rv-add-goal')?.addEventListener('click', () => {
      content.goals = [...content.goals, { title: '', detail: '' }];
      changed(true);
      container.querySelector<HTMLInputElement>(`[data-rv-goal="${content.goals.length - 1}"][data-field="title"]`)?.focus();
    });
  }

  /** La IA propone veredicto, hallazgos y (si están vacíos) mensaje y
   * objetivos. Nada se publica: queda en el borrador para que el coach lo
   * revise. Si el coach ya escribió su mensaje, la propuesta se le ofrece
   * aparte en vez de reemplazarlo. */
  async function draftWithAi(): Promise<void> {
    if (!report || !athlete) return;
    if (!window.confirm('La IA va a proponer el veredicto y los hallazgos (reemplaza los actuales) y, si están vacíos, el mensaje y los objetivos. Tú revisas todo antes de publicar. ¿Continuar?')) return;
    drafting = true;
    setStatus('La IA está redactando… (puede tardar unos segundos)');
    render();
    try {
      const draft = await requestMonthlyReviewDraft(
        reviewAiContext(
          report,
          athleteId!,
          { name: athlete.name, ftp: athlete.ftp, weightKg: athlete.weightKg, discipline: disciplineLabel(athlete), injuries: athlete.injuries, goal: athlete.goal },
          content.coachMessage,
        ),
      );
      if (stale()) return;
      content.verdict = draft.verdict;
      content.findings = cleanFindings(draft.findings);
      const message = draft.message.trim();
      if (!content.coachMessage.trim()) content.coachMessage = message;
      else aiMessage = message && message !== content.coachMessage.trim() ? message : null;
      if (!cleanGoals(content.goals).length) content.goals = cleanGoals(draft.goals);
      drafting = false;
      changed(true);
      setStatus('Listo: revisa lo que propuso la IA antes de publicar.');
    } catch (err) {
      drafting = false;
      status = `La IA no pudo redactar: ${errorMessage(err)}`;
      if (!stale()) render();
    }
  }

  async function emailReview(): Promise<void> {
    if (!review || !report || !published()) return;
    const again = review.emailedAt ? ' Ya se había enviado antes.' : '';
    if (!window.confirm(`¿Enviar la revisión de ${monthLabel(monthKey)} por correo?${again}`)) return;
    emailing = true;
    setStatus('Enviando…');
    render();
    try {
      const res = await sendReviewEmail(review.id, emailKpis(report));
      review = { ...review, emailedAt: res.emailedAt };
      status = res.test ? `Enviado en modo de prueba a ${res.sentTo} (tu atleta no lo recibe todavía).` : 'Enviado por correo a tu atleta.';
    } catch (err) {
      status = `No se pudo enviar: ${errorMessage(err)}`;
    } finally {
      emailing = false;
      if (!stale()) render();
    }
  }

  async function publish(): Promise<void> {
    if (!content.coachMessage.trim()) {
      window.alert('Escribe el mensaje para tu atleta antes de publicar: es lo primero que va a leer.');
      container.querySelector<HTMLTextAreaElement>('[data-rv="message"]')?.focus();
      return;
    }
    if (!window.confirm(`¿Publicar la revisión de ${monthLabel(monthKey)}? ${athlete ? athleteName(athlete) : 'Tu atleta'} la verá en la app.`)) return;
    busy = true;
    render();
    try {
      if (!review) dirty = true; // publicar sin haber editado: se crea con las sugerencias
      await flush();
      await saving;
      if (!review) throw new Error('No se pudo guardar la revisión.');
      review = await setReviewStatus(review.id, 'published');
      status = 'Publicada';
    } catch (err) {
      status = `No se pudo publicar: ${errorMessage(err)}`;
    } finally {
      busy = false;
      if (!stale()) render();
    }
  }

  async function unpublish(): Promise<void> {
    if (!review || !window.confirm('¿Regresarla a borrador? Tu atleta dejará de verla hasta que la vuelvas a publicar.')) return;
    busy = true;
    render();
    try {
      review = await setReviewStatus(review.id, 'draft');
      status = 'De vuelta en borrador';
    } catch (err) {
      status = `No se pudo cambiar: ${errorMessage(err)}`;
    } finally {
      busy = false;
      if (!stale()) render();
    }
  }

  function go(month: string): void {
    void flush()
      .catch(() => {})
      .finally(() => navigate('coach-review', `${athleteId}/${month}`));
  }

  shell('<p class="hint">Armando el reporte…</p>');
  void (async () => {
    try {
      athlete = (await listCoachAthletes()).find((a) => a.userId === athleteId) ?? null;
      if (stale()) return;
      if (!athlete) {
        shell('<p class="hint">Este atleta no está vinculado contigo (o se desvinculó).</p>');
        return;
      }
      const ftp = athlete.ftp ?? appState.profile.ftp;
      const [built, existing] = await Promise.all([loadMonthlyReport(athleteId, monthKey, ftp, todayKey), fetchCoachReview(coachId, athleteId, monthKey)]);
      if (stale()) return;
      report = built;
      review = existing;
      suggested = suggestFindings(built);
      content = existing
        ? { verdict: existing.verdict, coachMessage: existing.coachMessage, findings: existing.findings, goals: existing.goals, coachName: existing.coachName ?? appState.profile.name ?? null }
        : { verdict: suggestVerdict(suggested), coachMessage: '', findings: suggested.map((f) => ({ ...f })), goals: [], coachName: appState.profile.name ?? null };
      render();
    } catch (err) {
      shell(`<div class="error-box">No se pudo armar el reporte: ${escapeHtml(errorMessage(err))}</div>`);
    }
  })();

  return () => {
    disposed = true;
    if (dirty) void flush().catch(() => {});
  };
}
