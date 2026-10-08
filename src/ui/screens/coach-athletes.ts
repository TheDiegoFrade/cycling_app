// Atletas — pantalla principal del coach (docs/coach-view/mockups/Main.dc.html),
// solo lectura. Lo que depende de pasos posteriores (semanas por aprobar,
// revisión mensual, cumplimiento contra plan) todavía no aparece: aquí solo
// va lo que ya se puede calcular de verdad con las sesiones del atleta.
import { summarizeAthlete } from '../../core/coach-metrics';
import type { AthleteSummary, CoachSessionRow } from '../../core/coach-metrics';
import { COACH_TIER_LABELS } from '../../core/coach-invite';
import { listAthleteSessions, listCoachAthletes } from '../../sync/coach-athletes';
import type { CoachAthlete } from '../../sync/coach-athletes';
import {
  COACH_OVERVIEW_DAYS,
  alertPillHtml,
  athleteName,
  avatarHtml,
  daysAgoLabel,
  disciplineLabel,
  fmtSigned,
  sinceIso,
  sourceLabel,
  todayUtcKey,
  tsbColor,
  errorMessage,
} from '../coach-ui';
import { appState } from '../state';
import { escapeHtml } from '../workout-cover';

interface Row {
  athlete: CoachAthlete;
  summary: AthleteSummary;
}

function weekLabel(todayKey: string): string {
  const d = new Date(`${todayKey}T00:00:00Z`);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `Semana del ${fmt(monday)} al ${fmt(sunday)}`;
}

export function renderCoachAthletes(container: HTMLElement): void {
  if (!appState.user || !appState.coach.isCoach) {
    container.innerHTML = '<div class="screen"><h1>Atletas</h1><p class="hint">Esta sección es solo para coaches.</p></div>';
    return;
  }

  const todayKey = todayUtcKey();
  let rows: Row[] | null = null;
  let error = '';
  let search = '';
  let onlyAlerts = false;

  function tilesHtml(all: Row[]): string {
    const withAlerts = all.filter((r) => r.summary.alerts.length > 0).length;
    const trainedThisWeek = all.filter((r) => r.summary.weekBikeSessions + r.summary.weekNonBikeSessions > 0).length;
    const avgCtl = all.length ? all.reduce((s, r) => s + r.summary.ctl, 0) / all.length : 0;
    const tiles = [
      { label: 'Atletas', value: String(all.length), sub: 'Con vínculo activo', color: 'var(--text)' },
      { label: 'Entrenaron esta semana', value: `${trainedThisWeek}`, sub: `de ${all.length}`, color: 'var(--success)' },
      { label: 'Con alertas', value: String(withAlerts), sub: 'Fatiga, días sin datos o FTP', color: withAlerts ? 'var(--z5)' : 'var(--text)' },
      { label: 'Fitness promedio', value: String(Math.round(avgCtl)), sub: 'CTL de todos', color: 'var(--accent)' },
    ];
    return tiles
      .map(
        (t) => `
        <div class="coach-tile">
          <span class="live-col-label">${t.label}</span>
          <span class="coach-tile-value num" style="color:${t.color}">${t.value}</span>
          <span class="hint">${t.sub}</span>
        </div>`,
      )
      .join('');
  }

  function rowHtml(r: Row): string {
    const { athlete: a, summary: s } = r;
    const meta = [COACH_TIER_LABELS[a.tier], disciplineLabel(a)].filter(Boolean).join(' · ');
    const week = [`${s.weekBikeSessions} bici`, `${Math.round(s.weekTss)} TSS`, s.weekNonBikeSessions ? `+${s.weekNonBikeSessions} fuerza/mov.` : null]
      .filter(Boolean)
      .join(' · ');
    const delta = s.ctlDelta7 === null ? '' : `<span class="hint">${s.ctlDelta7 >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(s.ctlDelta7))}</span>`;
    return `
      <tr>
        <td><a href="#/coach-athlete/${a.userId}" class="coach-athlete-link">${avatarHtml(a)}<span><span class="coach-athlete-name">${escapeHtml(athleteName(a))}</span><span class="hint">${escapeHtml(meta)}</span></span></a></td>
        <td data-label="Esta semana">${week}</td>
        <td data-label="Forma"><span class="num coach-num" style="color:${tsbColor(s.tsb)}">${fmtSigned(s.tsb)}</span></td>
        <td data-label="Fitness"><span class="num coach-num">${Math.round(s.ctl)}</span> ${delta}</td>
        <td data-label="Última actividad">${s.last ? `<div>${escapeHtml(s.last.workoutName)}</div><div class="hint">${daysAgoLabel(s.last, todayKey)} · ${sourceLabel(s.last.source)}</div>` : '<span class="hint">—</span>'}</td>
        <td data-label="Atención">${s.alerts.length ? `<div class="coach-pills">${s.alerts.map(alertPillHtml).join('')}</div>` : '<span class="hint">Sin alertas</span>'}</td>
        <td class="coach-row-action"><a href="#/coach-athlete/${a.userId}" class="coach-btn">Ver atleta</a></td>
      </tr>`;
  }

  function tbodyHtml(): string {
    const all = rows ?? [];
    const q = search.trim().toLowerCase();
    const visible = all.filter((r) => (!onlyAlerts || r.summary.alerts.length > 0) && (!q || athleteName(r.athlete).toLowerCase().includes(q)));
    return visible.map(rowHtml).join('') || '<tr><td colspan="7" class="hint">Nadie coincide con el filtro.</td></tr>';
  }

  function render(): void {
    const all = rows ?? [];
    const withAlerts = all.filter((r) => r.summary.alerts.length > 0);

    let body: string;
    if (error) body = `<div class="error-box">${escapeHtml(error)}</div>`;
    else if (rows === null) body = '<p class="hint">Cargando atletas…</p>';
    else if (all.length === 0)
      body = '<div class="panel coach-empty"><p>Todavía no tienes atletas vinculados.</p><a href="#/coach-invite" class="coach-btn coach-btn-primary">Invitar atleta</a></div>';
    else
      body = `
        <section class="coach-tiles" aria-label="Resumen">${tilesHtml(all)}</section>
        <div class="coach-filters" role="group" aria-label="Filtros">
          <button type="button" class="log-choice${onlyAlerts ? '' : ' on'}" data-filter="all">Todos · ${all.length}</button>
          <button type="button" class="log-choice${onlyAlerts ? ' on' : ''}" data-filter="alerts">Con alertas · ${withAlerts.length}</button>
        </div>
        <div class="coach-table-wrap">
          <table class="coach-table coach-athletes-table">
            <thead><tr><th scope="col">Atleta</th><th scope="col">Esta semana</th><th scope="col">Forma (TSB)</th><th scope="col">Fitness (CTL)</th><th scope="col">Última actividad</th><th scope="col">Atención</th><th scope="col" aria-label="Acción"></th></tr></thead>
            <tbody id="coach-tbody">${tbodyHtml()}</tbody>
          </table>
        </div>
        <p class="hint">Forma = TSB (frescura): negativo es fatiga acumulada. Solo cuentan actividades que llegan por Torq, .fit o intervals.icu conectado directo al dispositivo; lo que llega por Strava no se muestra.</p>`;

    container.innerHTML = `
      <div class="screen coach-screen">
        <header class="coach-head">
          <div><span class="live-col-label">${weekLabel(todayKey)}</span><h1>Atletas</h1></div>
          <div class="coach-head-actions">
            <input type="search" id="coach-search" placeholder="Buscar atleta" aria-label="Buscar atleta" value="${escapeHtml(search)}">
            <a href="#/coach-invite" class="coach-btn coach-btn-primary">Invitar atleta</a>
          </div>
        </header>
        ${body}
      </div>`;

    const searchInput = container.querySelector<HTMLInputElement>('#coach-search')!;
    searchInput.addEventListener('input', () => {
      search = searchInput.value;
      const tbody = container.querySelector('#coach-tbody');
      if (tbody) tbody.innerHTML = tbodyHtml();
    });
    container.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        onlyAlerts = btn.dataset.filter === 'alerts';
        render();
      });
    });
  }

  render();
  void (async () => {
    try {
      const athletes = await listCoachAthletes();
      const sessions = await listAthleteSessions(
        athletes.map((a) => a.userId),
        sinceIso(COACH_OVERVIEW_DAYS),
      );
      const byAthlete = new Map<string, CoachSessionRow[]>();
      sessions.forEach((s) => byAthlete.set(s.userId, [...(byAthlete.get(s.userId) ?? []), s]));
      rows = athletes.map((athlete) => ({ athlete, summary: summarizeAthlete(byAthlete.get(athlete.userId) ?? [], todayKey, athlete.ftpConfirmed) }));
    } catch (err) {
      error = `No se pudieron cargar tus atletas: ${errorMessage(err)}`;
    }
    render();
  })();
}
