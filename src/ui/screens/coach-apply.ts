// Solicitud para ser coach (#/coach-apply/:token). Solo llega aquí quien
// recibió la invitación de Torq por correo, y solo con la cuenta de ese
// correo. Torq la revisa y, si la aprueba, se encienden las secciones de
// coach. Reglas en src/core/coach-application.ts.
import { COACH_DISCIPLINES, METHODOLOGY_MIN, normalizeCoachApplication, validateCoachApplication } from '../../core/coach-application';
import type { CoachApplicationAnswers, CoachApplicationErrors, CoachDiscipline } from '../../core/coach-application';
import { previewApplication, submitApplication } from '../../sync/coach-apply';
import { getRouteParam } from '../router';
import { escapeHtml } from '../workout-cover';

const DISCIPLINE_LABEL: Record<CoachDiscipline, string> = {
  road: 'Ruta',
  mountain: 'Montaña / XC',
  gravel: 'Gravel',
  track: 'Pista',
  triathlon: 'Triatlón',
};

const EMPTY: CoachApplicationAnswers = {
  fullName: '',
  phone: '',
  city: '',
  yearsCoaching: NaN,
  certifications: '',
  disciplines: [],
  currentAthletes: NaN,
  methodology: '',
  links: '',
  references: '',
  truthful: false,
  responsible: false,
  adult: false,
};

function shell(inner: string): string {
  return `<div class="screen coach-apply-screen"><h1>Ser coach en Torq</h1>${inner}</div>`;
}

export function renderCoachApply(container: HTMLElement): void {
  const token = getRouteParam() ?? '';
  container.innerHTML = shell('<p class="hint">Cargando tu invitación…</p>');
  void previewApplication(token).then((res) => {
    if (!container.isConnected) return;
    const p = res.data;
    if (!p) return void (container.innerHTML = shell('<p class="hint">No se pudo abrir la invitación. Intenta de nuevo en un momento.</p>'));
    switch (p.status) {
      case 'invalid':
        return void (container.innerHTML = shell('<p class="hint">Este link no existe. Para ser coach en Torq necesitas una invitación: escríbenos.</p>'));
      case 'expired':
        return void (container.innerHTML = shell('<p class="hint">Esta invitación ya venció. Escríbenos y te mandamos otra.</p>'));
      case 'wrong_email':
        return void (container.innerHTML = shell(
          `<p class="hint">Esta invitación es para otra cuenta (<b>${escapeHtml(p.email)}</b>). Sal y entra con ese correo.</p>`,
        ));
      case 'approved':
        return void (container.innerHTML = shell('<p class="hint">Tu solicitud ya está aprobada: ya eres coach en Torq.</p><a class="primary" href="#/coach-invite">Invitar a mi primer atleta</a>'));
      case 'rejected':
      case 'revoked':
        return void (container.innerHTML = shell('<p class="hint">Por ahora no podemos darte de alta como coach en Torq. Si crees que es un error, escríbenos.</p>'));
      case 'submitted':
        return void done(container, token, p.answers ?? EMPTY);
      default:
        form(container, token, p.answers ?? EMPTY);
    }
  });
}

/** Ya la mandó: lo dice, y deja corregirla mientras nadie la revisa. */
function done(container: HTMLElement, token: string, answers: CoachApplicationAnswers): void {
  container.innerHTML = shell(`
    <div class="panel" id="coach-apply-done">
      <h2 class="perfil-h2">Recibimos tu solicitud</h2>
      <p class="hint">La revisamos y te escribimos a tu correo. Mientras tanto puedes usar Torq para entrenar como cualquier atleta.</p>
      <button type="button" class="btn-light" id="coach-apply-edit">Corregir mi solicitud</button>
    </div>`);
  container.querySelector('#coach-apply-edit')!.addEventListener('click', () => form(container, token, answers));
}

function form(container: HTMLElement, token: string, initial: CoachApplicationAnswers): void {
  const v = (n: number) => (Number.isFinite(n) ? String(n) : '');
  const field = (key: keyof CoachApplicationAnswers, label: string, input: string, help = '') =>
    `<div class="coach-apply-field" data-field="${key}">
      <label>${label}${input}</label>
      ${help ? `<span class="live-col-label">${help}</span>` : ''}
      <span class="field-error" data-error="${key}"></span>
    </div>`;
  const text = (key: keyof CoachApplicationAnswers, value: string, attrs = '') =>
    `<input type="text" id="ca-${key}" value="${escapeHtml(value)}" ${attrs}>`;
  const check = (key: keyof CoachApplicationAnswers, on: boolean, label: string) =>
    `<div data-field="${key}"><label class="terms-check"><input type="checkbox" id="ca-${key}"${on ? ' checked' : ''}> <span>${label}</span></label><span class="field-error" data-error="${key}"></span></div>`;

  container.innerHTML = shell(`
    <p class="hint">Torq es para coaches que entrenan atletas de verdad. Cuéntanos de ti: lo revisamos una persona del equipo y te contestamos por correo. Tus atletas usan Torq gratis contigo; tú decides tu precio y cobras por tu cuenta.</p>
    <form id="coach-apply-form" novalidate>
      <section class="panel">
        <h2 class="perfil-h2">Quién eres</h2>
        ${field('fullName', 'Nombre completo', text('fullName', initial.fullName, 'autocomplete="name"'))}
        ${field('phone', 'Teléfono', text('phone', initial.phone, 'inputmode="tel" autocomplete="tel"'))}
        ${field('city', 'Ciudad donde entrenas', text('city', initial.city))}
      </section>
      <section class="panel">
        <h2 class="perfil-h2">Tu experiencia</h2>
        ${field('yearsCoaching', 'Años como coach', `<input type="number" id="ca-yearsCoaching" min="0" max="60" value="${v(initial.yearsCoaching)}">`)}
        ${field('currentAthletes', '¿Cuántos atletas entrenas hoy?', `<input type="number" id="ca-currentAthletes" min="0" max="500" value="${v(initial.currentAthletes)}">`)}
        ${field('certifications', 'Certificaciones o formación', `<textarea id="ca-certifications" rows="2">${escapeHtml(initial.certifications)}</textarea>`, 'Por ejemplo: UCI, USA Cycling, licenciatura en deporte. Si no tienes, dilo y cuéntanos tu experiencia.')}
        <div class="coach-apply-field" data-field="disciplines">
          <span class="live-col-label">Disciplinas</span>
          <div class="coach-apply-chips">${COACH_DISCIPLINES.map((d) => `<label class="terms-check"><input type="checkbox" data-discipline="${d}"${initial.disciplines.includes(d) ? ' checked' : ''}> <span>${DISCIPLINE_LABEL[d]}</span></label>`).join('')}</div>
          <span class="field-error" data-error="disciplines"></span>
        </div>
      </section>
      <section class="panel">
        <h2 class="perfil-h2">Cómo entrenas</h2>
        ${field('methodology', '¿Cómo armas y ajustas los planes de tus atletas?', `<textarea id="ca-methodology" rows="5">${escapeHtml(initial.methodology)}</textarea>`, `Al menos ${METHODOLOGY_MIN} caracteres: tests, bloques, cómo decides los cambios.`)}
        ${field('links', 'Dónde podemos ver tu trabajo', text('links', initial.links), 'Instagram, sitio, Strava, club o equipo.')}
        ${field('references', 'Una referencia (opcional)', text('references', initial.references), 'Un atleta, club o equipo que te pueda recomendar.')}
      </section>
      <section class="panel">
        <h2 class="perfil-h2">Tu compromiso</h2>
        ${check('truthful', initial.truthful, 'La información que doy es verdadera.')}
        ${check('responsible', initial.responsible, 'Entiendo que <strong>yo decido y soy responsable</strong> del entrenamiento de mis atletas en Torq, y que solo invitaré a personas que entreno.')}
        ${check('adult', initial.adult, 'Tengo 18 años o más.')}
      </section>
      <button class="primary" type="submit" id="coach-apply-submit">Mandar mi solicitud</button>
      <p class="hint" id="coach-apply-status" aria-live="polite"></p>
    </form>`);

  const f = container.querySelector<HTMLFormElement>('#coach-apply-form')!;
  const status = f.querySelector<HTMLElement>('#coach-apply-status')!;
  const val = (k: string) => f.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#ca-${k}`)!.value;
  const on = (k: string) => f.querySelector<HTMLInputElement>(`#ca-${k}`)!.checked;
  const read = (): CoachApplicationAnswers =>
    normalizeCoachApplication({
      fullName: val('fullName'),
      phone: val('phone'),
      city: val('city'),
      yearsCoaching: val('yearsCoaching'),
      certifications: val('certifications'),
      disciplines: [...f.querySelectorAll<HTMLInputElement>('[data-discipline]:checked')].map((i) => i.dataset.discipline),
      currentAthletes: val('currentAthletes'),
      methodology: val('methodology'),
      links: val('links'),
      references: val('references'),
      truthful: on('truthful'),
      responsible: on('responsible'),
      adult: on('adult'),
    });
  const showErrors = (errors: CoachApplicationErrors) => {
    f.querySelectorAll<HTMLElement>('[data-error]').forEach((el) => {
      el.textContent = errors[el.dataset.error as keyof CoachApplicationAnswers] ?? '';
    });
    const first = Object.keys(errors)[0];
    if (first) f.querySelector<HTMLElement>(`[data-field="${first}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const answers = read();
    const errors = validateCoachApplication(answers);
    showErrors(errors);
    const n = Object.keys(errors).length;
    if (n) return void (status.textContent = n === 1 ? 'Falta 1 dato.' : `Faltan ${n} datos.`);
    const btn = f.querySelector<HTMLButtonElement>('#coach-apply-submit')!;
    btn.disabled = true;
    status.textContent = 'Mandando…';
    const res = await submitApplication(token, answers);
    btn.disabled = false;
    if (res.error) {
      if (res.errors) showErrors(res.errors);
      status.textContent =
        res.error === 'expired' ? 'Esta invitación ya venció. Escríbenos y te mandamos otra.' : res.error === 'already_reviewed' ? 'Tu solicitud ya fue revisada.' : 'No se pudo mandar. Intenta de nuevo en un momento.';
      return;
    }
    done(container, token, answers);
  });
}
