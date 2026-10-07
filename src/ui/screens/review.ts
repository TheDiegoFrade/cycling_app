// Reportes mensuales del atleta (paso 7). #/review = los que le publicó su
// coach; #/review/:mes = uno, de solo lectura. Los números se calculan con
// sus propias sesiones, igual que los vio el coach (sin Strava). Los sigue
// viendo aunque se desvincule: son suyos.
import { isMonthKey, monthLabel, VERDICT_LABELS } from '../../core/monthly-report';
import { listPublishedReviews, loadMonthlyReport } from '../../sync/monthly-reviews';
import type { MonthlyReview } from '../../sync/monthly-reviews';
import { todayUtcKey } from '../coach-ui';
import { renderReportSheet } from '../monthly-report-view';
import { getRouteParam } from '../router';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

const DISCIPLINES: Record<string, string> = { mountain: 'Montaña', road: 'Ruta', gravel: 'Gravel', other: 'Otra' };

export function renderReview(container: HTMLElement): () => void {
  const param = getRouteParam();
  const monthKey = isMonthKey(param) ? param : null;
  const userId = appState.user?.id ?? null;
  let disposed = false;

  function shell(body: string, back = '#/profile', backLabel = 'Perfil'): void {
    container.innerHTML = `<div class="screen review-screen"><a href="${back}" class="back-link">← ${backLabel}</a>${body}</div>`;
  }

  if (!userId) {
    shell('<p class="hint">Inicia sesión para ver los reportes de tu coach.</p>');
    return () => {};
  }

  shell('<p class="hint">Cargando…</p>');
  void (async () => {
    try {
      const reviews = await listPublishedReviews(userId);
      if (disposed) return;
      if (!monthKey) {
        shell(`
          <header class="coach-head"><div><h1>Reportes mensuales</h1><span class="hint">Lo que revisó tu coach cada mes: tus números, lo que vio y el enfoque para el siguiente.</span></div></header>
          ${
            reviews.length
              ? `<div class="review-list">${reviews.map(cardHtml).join('')}</div>`
              : '<div class="panel"><p class="hint" style="margin:0">Todavía no tienes reportes. Cuando tu coach publique la revisión de un mes, aparecerá aquí.</p></div>'
          }`);
        return;
      }
      const review = reviews.find((r) => r.monthKey === monthKey);
      if (!review) {
        shell('<p class="hint">Este reporte no existe o tu coach todavía no lo publica.</p>', '#/review', 'Reportes');
        return;
      }
      const report = await loadMonthlyReport(userId, monthKey, appState.profile.ftp, todayUtcKey());
      if (disposed) return;
      const sheet = renderReportSheet({
        report,
        athleteName: appState.profile.name ?? 'Tú',
        coachName: review.coachName,
        discipline: appState.profile.discipline ? DISCIPLINES[appState.profile.discipline] ?? null : null,
        ftp: appState.profile.ftp,
        weightKg: appState.profile.weight_kg ?? null,
        goal: null,
        content: review,
        publishedAt: review.publishedAt,
        editable: false,
      });
      shell(
        `<header class="coach-head review-toolbar"><div><h1>Reporte de ${monthLabel(monthKey)}</h1></div><div class="coach-head-actions"><button type="button" id="rv-print">Descargar PDF</button></div></header>
         <div class="report-desk">${sheet}</div>`,
        '#/review',
        'Reportes',
      );
      container.querySelector('#rv-print')?.addEventListener('click', () => window.print());
    } catch (err) {
      shell(`<div class="error-box">No se pudo cargar: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`);
    }
  })();

  return () => {
    disposed = true;
  };
}

function cardHtml(r: MonthlyReview): string {
  const first = r.coachMessage.trim().split(/\n/)[0] ?? '';
  return `
    <a class="panel review-card" href="#/review/${r.monthKey}">
      <span class="live-col-label">${escapeHtml(monthLabel(r.monthKey))}</span>
      <strong>${r.verdict ? VERDICT_LABELS[r.verdict] : 'Revisión mensual'}</strong>
      <span class="hint">${escapeHtml(first.length > 160 ? `${first.slice(0, 157)}…` : first)}</span>
      <span class="hint">${r.coachName ? `${escapeHtml(r.coachName)} · ` : ''}${r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
    </a>`;
}
