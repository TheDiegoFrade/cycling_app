// Cuestionario inicial de coaching — llena el Perfil persistente (no es
// específico de un plan). Se dispara antes de "Crear mi plan" si el perfil
// todavía no tiene lo mínimo, y también se puede abrir libremente para
// completarlo o actualizarlo después. Al guardar, SIEMPRE se fusiona sobre
// appState.profile existente (mutación de campos + persistProfile()), igual
// que ya hace Perfil — nunca se reemplaza el objeto completo.
import type { Profile } from '../core/types';
import { coachProfileError, ftpSourceOf, isMeasuredFtp, withFtp } from '../core/coach-profile';
import { CHRONIC_CONDITIONS, CHRONIC_CONDITION_LABELS } from '../core/intake';
import type { HealthIntake } from '../core/intake';
import { DAY_CODES, DAY_SHORT_LABELS, QUESTIONNAIRE_KINDS, QUESTIONNAIRE_KIND_LABELS } from '../core/other-activities';
import type { OtherActivity } from '../core/other-activities';
import type { NonBikeKind } from '../core/session-kind';
import { appState } from './state';
import { wireDatePicker } from './date-picker';
import { buildCompletedSessionFromFit } from '../core/completed-session-import';
import { saveSession } from '../storage/session-store';
import { pushSessionToCloud } from '../sync/cloud-sync';
import { byGender, genderOf } from '../core/gender';
import type { Gender } from '../core/gender';
import { pinonFigureHtml } from './pinon';

/** Todo el cuestionario es obligatorio para crear un plan (menos los .fit):
 * ver coachProfileError. */
export function isCoachProfileComplete(profile: Profile): boolean {
  return coachProfileError(profile) === null;
}

/** Lo que el atleta escribe cuando marca que no tiene lesiones. */
const NO_INJURIES = 'Ninguna';

function esc(v: string | number | undefined | null): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Una opción grande (título + explicación) de una pregunta de selección única. */
function optionHtml(attr: string, value: string, on: boolean, title: string, desc: string): string {
  return `<button type="button" class="ob-option${on ? ' on' : ''}" ${attr}="${value}" aria-pressed="${on}">
    <span class="ob-option-title">${title}</span><span class="ob-option-desc">${desc}</span>
  </button>`;
}

/** Interruptor: checkbox real (oculto) + el dibujo del switch, para que la
 * lógica siga leyendo `.checked`. */
/** FTP del cuestionario: con "No sé mi FTP" un número escrito es
 * provisional; sin número se queda el que había (default o provisional). Sin
 * la casilla, el número es suyo. */
function ftpFromForm(p: Profile, typed: number, unknown: boolean): Profile {
  const hasNumber = Number.isFinite(typed) && typed > 0;
  if (unknown) {
    if (hasNumber) return withFtp(p, typed, 'provisional');
    const source = ftpSourceOf(p) === 'provisional' ? 'provisional' : 'default';
    return { ...p, ftpSource: source, ftpConfirmed: false };
  }
  return hasNumber ? withFtp(p, typed, 'manual') : { ...p, ftpSource: 'manual', ftpConfirmed: true };
}

function toggleHtml(id: string, checked: boolean, title: string, desc = '', extraAttrs = ''): string {
  return `<label class="ob-toggle" ${extraAttrs}>
    <span class="ob-toggle-text"><span class="ob-toggle-title">${title}</span>${desc ? `<span class="ob-toggle-desc">${desc}</span>` : ''}</span>
    <input type="checkbox" id="${id}" class="ob-switch-input" ${checked ? 'checked' : ''}>
    <span class="ob-switch" aria-hidden="true"></span>
  </label>`;
}

/** Una fila de «Otras actividades»: tipo, veces, minutos y días. */
function otherActivityRowHtml(a: OtherActivity, i: number): string {
  const kinds = QUESTIONNAIRE_KINDS.map((k) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${QUESTIONNAIRE_KIND_LABELS[k]}</option>`).join('');
  const days = DAY_CODES.map(
    (d) => `<button type="button" class="ob-chip ob-chip-sm${a.days.includes(d) ? ' on' : ''}" data-day="${d}" aria-pressed="${a.days.includes(d)}">${DAY_SHORT_LABELS[d]}</button>`,
  ).join('');
  return `<div class="ob-other-row" data-i="${i}">
    <div class="ob-grid">
      <label class="ob-field">Actividad<select data-f="kind">${kinds}</select></label>
      <label class="ob-field">Veces por semana<input type="number" data-f="perWeek" min="1" max="7" inputmode="numeric" value="${esc(a.perWeek || '')}"></label>
      <label class="ob-field">Minutos por sesión<span class="ob-input-unit"><input type="number" data-f="minutes" min="10" max="300" inputmode="numeric" value="${esc(a.minutes || '')}"><span>min</span></span></label>
    </div>
    <p class="ob-q" style="margin-top:8px">Qué días <span class="ob-optional">si son fijos</span></p>
    <div class="ob-chips">${days}</div>
    <button type="button" class="ob-skip ob-other-remove">Quitar</button>
  </div>`;
}

/** Grupo de opciones de una sola respuesta (chips). `selected` undefined =
 * sin contestar: nada marcado, el atleta tiene que elegir. */
function chipGroupHtml(id: string, options: readonly (readonly [string, string])[], selected: string | undefined): string {
  return `<div class="ob-chips" id="${id}" data-single>${options
    .map(([v, label]) => `<button type="button" class="ob-chip${selected === v ? ' on' : ''}" data-value="${v}" aria-pressed="${selected === v}">${label}</button>`)
    .join('')}</div>`;
}

const yesNo = (v: boolean | undefined): string | undefined => (v === undefined ? undefined : v ? 'yes' : 'no');

function sectionHtml(n: number, title: string, body: string): string {
  return `<section class="ob-section" data-step="${n}" aria-labelledby="ob-step-title-${n}"><h3 class="ob-section-title" id="ob-step-title-${n}"><span class="ob-section-num">${n}</span>${title}</h3>${body}</section>`;
}

/** Los pasos del cuestionario, en el orden del formulario. */
export const OB_STEPS = ['Sobre ti', 'Salud', 'Hábitos', 'Tu experiencia', 'Tu bici', 'Tus números', 'Otras actividades', 'Metas', 'Entrenamientos recientes'] as const;

/** Lo que dice Piñón en cada paso: acompaña y explica para qué sirve, sin
 * acortar nada (todas las preguntas son necesarias para un plan serio). */
export function obGuideLine(step: number, name: string | undefined, gender: Gender | undefined): string {
  const hi = name ? `Hola, ${name}. ` : 'Hola. ';
  switch (step) {
    case 1:
      return `${hi}Yo te acompaño: son ${OB_STEPS.length} pasos cortos y con esto tu coach arma un plan hecho para ti. Empecemos por lo básico.`;
    case 2:
      return 'Salud va primero porque manda sobre todo lo demás: con esto tu coach decide qué tan fuerte y qué tan rápido subir. Contesta con calma.';
    case 3:
      return 'No es para juzgarte: el sueño y el estrés cambian cuánta carga aguantas. Con esto el plan arranca a tu ritmo.';
    case 4:
      return 'Ahora tu historia en la bici. Si empiezas de cero, perfecto: el plan arranca justo desde ahí.';
    case 5:
      return `Vas a la mitad. ¿Qué rodadas haces? Esto cambia el tipo de sesiones que te tocan.`;
    case 6:
      return 'Si no sabes tu FTP o tu pulso, márcalo y ya: el plan trae un test para medirlos con seguridad.';
    case 7:
      return 'Correr, gym o fútbol también cansan. Dímelo y tu coach lo acomoda junto a tus rodadas.';
    case 8:
      return `${byGender(gender, '¿Listo? Ya casi terminamos.', '¿Lista? Ya casi terminamos.', 'Ya casi terminamos.')} Cuéntame qué quieres lograr.`;
    default:
      return 'Último paso, y es opcional: si entrenaste con otra app, sube tus .fit y el plan arranca con datos reales. Si no, dale a Guardar.';
  }
}

function modalHtml(p: Profile): string {
  const ftpMeasured = isMeasuredFtp(ftpSourceOf(p));
  const editing = isCoachProfileComplete(p);
  // Sin selección previa: cada respuesta la elige el atleta.
  const experience = p.experienceLevel;
  const fitness = p.generalFitnessLevel;
  const discipline = p.discipline;
  const noInjuries = p.injuries === NO_INJURIES;
  const intake = p.intake;
  return `
    <div class="modal-backdrop" id="onboarding-backdrop">
      <div class="panel ob-modal" id="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <header class="ob-head">
          <div>
            <h2 class="ob-title" id="ob-title">${editing ? 'Tu perfil de entrenamiento' : 'Antes de tu plan, cuéntanos de ti'}</h2>
            <p class="ob-subtitle">Tu coach y la IA usan esto para armar y ajustar tu plan. Puedes cambiarlo cuando quieras desde Perfil.</p>
          </div>
          <button type="button" class="ob-close" id="onboarding-close" aria-label="Cerrar">✕</button>
        </header>

        <div class="ob-guide">
          ${pinonFigureHtml('habla', 56)}
          <div class="ob-guide-main">
            <p class="ob-guide-text" id="ob-guide-text" aria-live="polite"></p>
            <div class="ob-progress" aria-hidden="true"><span class="ob-progress-bar" id="ob-progress-bar"></span></div>
            <nav class="ob-steps" id="ob-steps" aria-label="Pasos del cuestionario">
              ${OB_STEPS.map((t, i) => `<button type="button" class="ob-step-dot" data-go="${i + 1}" aria-label="Paso ${i + 1}: ${t}" title="${t}">${i + 1}</button>`).join('')}
            </nav>
          </div>
        </div>

        <div class="ob-body">
          ${sectionHtml(
            1,
            'Sobre ti',
            `<p class="ob-q">Sexo</p>
            <div class="ob-chips" id="ob-sex">
              ${(
                [
                  ['M', 'Hombre'],
                  ['F', 'Mujer'],
                  ['other', 'Otro'],
                ] as const
              )
                .map(([v, label]) => `<button type="button" class="ob-chip${p.sex === v ? ' on' : ''}" data-sex="${v}" aria-pressed="${p.sex === v}">${label}</button>`)
                .join('')}
            </div>
            <div class="ob-grid">
              <label class="ob-field">Fecha de nacimiento
                <input type="date" id="ob-birth-date" value="${esc(p.birth_date)}">
              </label>
              <label class="ob-field">Peso
                <span class="ob-input-unit"><input type="number" id="ob-weight" value="${esc(p.weight_kg)}" min="30" max="200" step="0.1" inputmode="decimal"><span>kg</span></span>
              </label>
              <label class="ob-field">Altura
                <span class="ob-input-unit"><input type="number" id="ob-height" value="${esc(p.height_cm)}" min="100" max="230" step="1" inputmode="numeric"><span>cm</span></span>
              </label>
            </div>`,
          )}

          ${sectionHtml(
            2,
            'Salud',
            `<p class="ob-note" style="margin-top:0">Va primero porque manda sobre todo lo demás: con esto tu coach cuida qué tan fuerte y qué tan rápido subir.</p>
            <p class="ob-q">¿Tienes alguna enfermedad crónica o condición de salud?</p>
            <div class="ob-chips" id="ob-conditions">
              <button type="button" class="ob-chip${intake && intake.conditions.length === 0 ? ' on' : ''}" data-value="none" aria-pressed="${!!intake && intake.conditions.length === 0}">Ninguna</button>
              ${CHRONIC_CONDITIONS.map((c) => `<button type="button" class="ob-chip${intake?.conditions.includes(c) ? ' on' : ''}" data-value="${c}" aria-pressed="${!!intake?.conditions.includes(c)}">${CHRONIC_CONDITION_LABELS[c]}</button>`).join('')}
            </div>
            <label class="ob-field" id="ob-conditions-other-label" style="display:${intake?.conditions.includes('other') ? 'flex' : 'none'}">¿Cuál?
              <input type="text" id="ob-conditions-other" maxlength="120" value="${esc(intake?.conditionsOther)}">
            </label>
            <p class="ob-q">¿Tomas algún medicamento de forma regular?</p>
            ${chipGroupHtml('ob-medication', [['no', 'No'], ['yes', 'Sí']], yesNo(intake?.takesMedication))}
            <label class="ob-field" id="ob-medication-note-label" style="display:${intake?.takesMedication ? 'flex' : 'none'}"><span>¿Cuál? <span class="ob-optional">opcional</span></span>
              <input type="text" id="ob-medication-note" maxlength="200" value="${esc(intake?.medicationNote)}" placeholder="Ej. para la presión">
            </label>
            <p class="ob-q">¿Tuviste alguna lesión o cirugía importante en los últimos 2 años?</p>
            ${chipGroupHtml('ob-recent-injury', [['no', 'No'], ['yes', 'Sí']], yesNo(intake?.recentInjury))}
            <p class="ob-q">¿Hoy tienes una lesión o molestia que te impida hacer esfuerzos fuertes?</p>
            ${chipGroupHtml('ob-injury-limits', [['no', 'No'], ['yes', 'Sí']], yesNo(intake?.injuryLimitsIntensity))}
            <label class="ob-field"><span>Lesiones o limitaciones actuales</span>
              <textarea id="ob-injuries" rows="3" placeholder="Ej. molestia en rodilla izquierda, evitar sentadilla profunda" ${noInjuries ? 'disabled' : ''}>${noInjuries ? '' : esc(p.injuries)}</textarea>
            </label>
            <div class="ob-toggles">
              ${toggleHtml('ob-no-injuries', noInjuries, 'No tengo lesiones ni limitaciones')}
            </div>`,
          )}

          ${sectionHtml(
            3,
            'Hábitos',
            `<p class="ob-note" style="margin-top:0">No es para juzgarte: nos dice cómo arrancar para que el plan te funcione.</p>
            <p class="ob-q">¿Fumas?</p>
            ${chipGroupHtml('ob-smoking', [['no', 'No'], ['occasional', 'De vez en cuando'], ['daily', 'Diario']], intake?.smoking)}
            <p class="ob-q">¿Tomas alcohol?</p>
            ${chipGroupHtml('ob-alcohol', [['rarely', 'Nunca o rara vez'], ['weekly', '1-2 veces por semana'], ['frequent', '3 o más por semana']], intake?.alcohol)}
            <p class="ob-q">¿Cómo es tu estrés en un día normal?</p>
            ${chipGroupHtml('ob-stress', [['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto']], intake?.stress)}
            <div class="ob-grid">
              <label class="ob-field">Horas que duermes en promedio
                <span class="ob-input-unit"><input type="number" id="ob-sleep-hours" value="${esc(intake?.sleepHours)}" min="3" max="12" step="0.5" inputmode="decimal"><span>h</span></span>
              </label>
            </div>
            <p class="ob-q">¿Cómo duermes?</p>
            ${chipGroupHtml('ob-sleep-quality', [['good', 'Bien'], ['fair', 'Regular'], ['poor', 'Mal']], intake?.sleepQuality)}`,
          )}

          ${sectionHtml(
            4,
            'Tu experiencia',
            `<p class="ob-q">¿Qué tanto has entrenado con estructura?</p>
            <div class="ob-options" id="ob-experience">
              ${optionHtml('data-level', 'new_to_cycling', experience === 'new_to_cycling', 'Nunca con estructura', 'Empiezo desde cero con zonas y planes.')}
              ${optionHtml('data-level', 'returning_or_new_to_app', experience === 'returning_or_new_to_app', 'Ya entreno, pero no en Torq', 'Tengo experiencia; es mi primera vez aquí.')}
              ${optionHtml('data-level', 'experienced', experience === 'experienced', 'Entreno regular', 'Conozco mis números y uso zonas.')}
            </div>
            <p class="ob-q">¿Qué tan activo has estado los últimos meses?</p>
            <div class="ob-options" id="ob-fitness">
              ${optionHtml('data-level', 'sedentary', fitness === 'sedentary', 'Apenas arranco', 'Poca actividad física últimamente.')}
              ${optionHtml('data-level', 'active_other_sport', fitness === 'active_other_sport', 'Activo, pero no en bici', 'Corro, nado, gimnasio u otro deporte.')}
              ${optionHtml('data-level', 'active_cyclist', fitness === 'active_cyclist', 'Ya ando en bici seguido', 'Varias salidas por semana.')}
            </div>
            <div class="ob-grid">
              <label class="ob-field">Años andando en bici
                <span class="ob-input-unit"><input type="number" id="ob-years" value="${esc(p.yearsRiding)}" placeholder="0 si empiezas" min="0" max="60" inputmode="numeric"><span>años</span></span>
              </label>
              <label class="ob-field">Años entrenando con potencia o estructura
                <span class="ob-input-unit"><input type="number" id="ob-structured-years" value="${esc(p.structuredTrainingYears)}" placeholder="0 si nunca" min="0" max="60" inputmode="numeric"><span>años</span></span>
              </label>
            </div>
            <p class="ob-q">¿Sabes medir qué tan duro vas del 1 al 10 (RPE)?</p>
            <p class="ob-note" style="margin-top:0">3-4: puedes platicar · 6-7: solo frases cortas · 8-9: pocas palabras · 10: no puedes más.</p>
            ${chipGroupHtml('ob-rpe', [['yes', 'Sí'], ['somewhat', 'Más o menos'], ['no', 'No']], intake?.rpeLiteracy)}
            <p class="ob-q">¿Has hecho esfuerzos al máximo? (carreras, tests, series a tope)</p>
            ${chipGroupHtml('ob-max-effort', [['yes', 'Sí'], ['no', 'No']], yesNo(intake?.maxEffortExperience))}`,
          )}

          ${sectionHtml(
            5,
            'Tu bici',
            `<p class="ob-q">Disciplina principal</p>
            <div class="ob-chips" id="ob-discipline">
              ${(
                [
                  ['mountain', 'Montaña / XC'],
                  ['road', 'Ruta'],
                  ['gravel', 'Gravel'],
                  ['other', 'Otra'],
                ] as const
              )
                .map(([v, label]) => `<button type="button" class="ob-chip${discipline === v ? ' on' : ''}" data-discipline="${v}" aria-pressed="${discipline === v}">${label}</button>`)
                .join('')}
            </div>
            <div class="ob-toggles">
              ${toggleHtml('ob-rides-outside', !!p.ridesOutside, 'Salgo a rodar afuera', 'Aunque sea de vez en cuando.')}
              ${toggleHtml('ob-outdoor-power', !!p.hasOutdoorPowerMeter, 'Tengo medidor de potencia afuera', '', `id="ob-outdoor-power-label" style="display:${p.ridesOutside ? 'flex' : 'none'}"`)}
            </div>
            <p class="ob-q">¿Cómo has entrenado las últimas 4 semanas?</p>
            ${chipGroupHtml('ob-recent-training', [['little', 'Poco o nada'], ['easy', 'Rodadas suaves'], ['with_intensity', 'Con intensidad (series, carreras, salidas fuertes)']], intake?.recentTraining)}
            <div class="ob-grid">
              <label class="ob-field"><span>Horas por semana, más o menos <span class="ob-optional">opcional</span></span>
                <span class="ob-input-unit"><input type="number" id="ob-recent-hours" value="${esc(intake?.recentHoursPerWeek ?? '')}" min="0" max="40" step="0.5" inputmode="decimal"><span>h</span></span>
              </label>
            </div>
            <div id="ob-recent-note-box"${intake?.recentTraining && intake.recentTraining !== 'little' ? '' : ' hidden'}>
              <label class="ob-field">¿Cómo es una semana típica de tu entrenamiento?
                <textarea id="ob-recent-note" rows="3" maxlength="500" placeholder="Ej.: martes y jueves rodillo 1 h con series de 8 min, sábado salida larga de 3 h, domingo suave">${esc(intake?.recentTrainingNote ?? '')}</textarea>
              </label>
              <p class="ob-note" style="margin-top:0">Con esto el coach parte de lo que ya haces, no de cero.</p>
            </div>`,
          )}

          ${sectionHtml(
            6,
            'Tus números',
            `<div class="ob-grid">
              <div class="ob-field">
                <label for="ob-ftp" id="ob-ftp-label">${ftpMeasured ? 'FTP actual' : 'FTP provisional (si tienes uno)'}</label>
                <span class="ob-input-unit"><input type="number" id="ob-ftp" value="${ftpMeasured || ftpSourceOf(p) === 'provisional' ? esc(p.ftp) : ''}" placeholder="${ftpMeasured ? 'Ej. 200' : 'Si no, el coach te propone uno'}" inputmode="numeric"><span>W</span></span>
                ${toggleHtml('ob-no-ftp', !!p.ftpSource && !ftpMeasured, 'No sé mi FTP todavía', 'Puedes escribir uno provisional: el coach lo toma como punto de partida, no como medición.')}
              </div>
              <div class="ob-field">
                <label for="ob-hrmax">Pulso máximo</label>
                <span class="ob-input-unit"><input type="number" id="ob-hrmax" value="${p.hrMaxConfirmed ? esc(p.hr_max) : ''}" placeholder="Ej. 185" inputmode="numeric" ${p.hrMaxConfirmed === false ? 'disabled' : ''}><span>lpm</span></span>
                ${toggleHtml('ob-no-hrmax', p.hrMaxConfirmed === false, 'No sé mi pulso máximo')}
              </div>
              <div class="ob-field">
                <label for="ob-resting-hr">Pulso en reposo</label>
                <span class="ob-input-unit"><input type="number" id="ob-resting-hr" value="${esc(intake?.restingHr)}" placeholder="Ej. 58" inputmode="numeric" ${intake && intake.restingHr === null ? 'disabled' : ''}><span>lpm</span></span>
                ${toggleHtml('ob-no-resting-hr', !!intake && intake.restingHr === null, 'No sé mi pulso en reposo')}
              </div>
            </div>
            <p class="ob-note">No pasa nada si no los sabes: el plan arranca con un protocolo para calibrarlos con seguridad.</p>`,
          )}

          ${sectionHtml(
            7,
            'Otras actividades',
            `<p class="ob-q">¿Haces algo más además de la bici? Correr, gym, crossfit… también cansa, y tu coach lo acomoda junto a tus rodadas.</p>
            <div id="ob-other-list" class="ob-other-list"></div>
            <button type="button" class="ob-chip" id="ob-other-add">+ Agregar actividad</button>
            <div class="ob-toggles">
              ${toggleHtml('ob-no-other', p.otherActivities?.length === 0, 'No hago otra actividad además de la bici')}
            </div>`,
          )}

          ${sectionHtml(
            8,
            'Metas',
            `<div class="ob-toggles">
              ${toggleHtml('ob-competes', !!p.competes, 'Compito o quiero competir')}
            </div>
            <label class="ob-field" id="ob-category-label" style="display:${p.competes ? 'flex' : 'none'}">Categoría
              <input type="text" id="ob-category" value="${esc(p.category)}" placeholder="Ej. Experto 30-39, Élite, Cat 2">
            </label>
            <label class="ob-field"><span>Mejor resultado o logro reciente</span>
              <input type="text" id="ob-best-result" value="${esc(p.recentBestResult)}" placeholder="Ej. terminé mi primer XC local, o «ninguno todavía»">
            </label>
`,
          )}

          ${sectionHtml(
            9,
            'Entrenamientos recientes fuera de Torq',
            `<p class="ob-note" style="margin-top:0">¿Entrenaste con otra app o dispositivo las últimas 1 o 2 semanas? Sube esos archivos .fit para que el plan arranque con contexto real. Lo que ya grabaste en Torq no hace falta. <span class="ob-optional">opcional</span></p>
            <label class="ob-upload">
              <span class="ob-upload-icon" aria-hidden="true">↑</span>
              <span><strong>Elegir archivos .fit</strong><span class="ob-toggle-desc">Puedes elegir varios a la vez.</span></span>
              <input type="file" id="ob-fit-files" accept=".fit" multiple>
            </label>
            <p class="ob-note" id="ob-fit-status" aria-live="polite"></p>`,
          )}
        </div>

        <footer class="ob-foot">
          <span class="ob-status" id="onboarding-status" aria-live="polite"></span>
          <button type="button" class="ob-skip" id="onboarding-skip">Saltar por ahora</button>
          <button type="button" class="ob-back" id="onboarding-back">Atrás</button>
          <button type="button" class="ob-save" id="onboarding-next">Siguiente</button>
          <button type="button" class="ob-save" id="onboarding-submit">Guardar</button>
        </footer>
      </div>
    </div>`;
}

/** Qué parte del formulario corresponde a cada aviso de «falta…», en orden:
 * lo más específico primero («años entrenando con estructura» antes que
 * «entrenado con estructura»). */
const MISSING_TARGETS: [RegExp, string][] = [
  [/sexo/i, '#ob-sex'],
  [/nacimiento/i, '#ob-birth-date'],
  [/peso/i, '#ob-weight'],
  [/altura/i, '#ob-height'],
  [/condici[oó]n de salud|«Ninguna»/i, '#ob-conditions'],
  [/¿cuál|cual es tu condición/i, '#ob-conditions-other'],
  [/medicamento/i, '#ob-medication'],
  [/cirug[ií]a/i, '#ob-recent-injury'],
  [/te impida/i, '#ob-injury-limits'],
  [/fumas/i, '#ob-smoking'],
  [/alcohol/i, '#ob-alcohol'],
  [/estr[eé]s/i, '#ob-stress'],
  [/horas.*duermes|duermes.*horas/i, '#ob-sleep-hours'],
  [/duermes/i, '#ob-sleep-quality'],
  [/semana t[ií]pica/i, '#ob-recent-note'],
  [/4 semanas/i, '#ob-recent-training'],
  [/del 1 al 10/i, '#ob-rpe'],
  [/esfuerzos al m[aá]ximo/i, '#ob-max-effort'],
  [/pulso en reposo/i, '#ob-resting-hr'],
  [/años llevas entrenando/i, '#ob-structured-years'],
  [/años llevas andando/i, '#ob-years'],
  [/entrenado con estructura/i, '#ob-experience'],
  [/qu[eé] tan activo/i, '#ob-fitness'],
  [/disciplina/i, '#ob-discipline'],
  [/medidor de potencia/i, '#ob-outdoor-power'],
  [/rodar afuera/i, '#ob-rides-outside'],
  [/FTP/, '#ob-ftp'],
  [/pulso m[aá]ximo/i, '#ob-hrmax'],
  [/actividad/i, '#ob-other-add'],
  [/categor[ií]a/i, '#ob-category'],
  [/compites/i, '#ob-competes'],
  [/mejor resultado/i, '#ob-best-result'],
  [/lesiones o limitaciones/i, '#ob-injuries'],
];

/** Marca el campo que falta y lo pone a la vista: un texto al pie de un
 * formulario largo no dice dónde está el problema. */
function missingTarget(root: HTMLElement, message: string): HTMLElement | null {
  const selector = MISSING_TARGETS.find(([re]) => re.test(message))?.[1];
  return selector ? root.querySelector<HTMLElement>(selector) : null;
}

function flagMissing(root: HTMLElement, message: string): void {
  const el = missingTarget(root, message);
  if (el) flagElement(root, el);
}

function flagElement(root: HTMLElement, el: HTMLElement): void {
  root.querySelectorAll('.ob-missing').forEach((x) => x.classList.remove('ob-missing'));
  root.querySelectorAll('[aria-invalid="true"]').forEach((x) => x.removeAttribute('aria-invalid'));
  // el input de la fecha está oculto: se marca el selector visible que lo envuelve
  const box = el.closest<HTMLElement>('.date-picker, .ob-toggle') ?? (el.matches('input, textarea, select') ? el.closest<HTMLElement>('.ob-field') : null) ?? el;
  box.classList.add('ob-missing');
  (el.matches('input, textarea, select') ? el : box).setAttribute('aria-invalid', 'true');
  box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const focusable = box.matches('.date-picker') ? box.querySelector<HTMLElement>('[role=spinbutton]') : el.matches('input:not([type=checkbox]), textarea') ? el : null;
  focusable?.focus({ preventScroll: true });
}

/** Lo primero sin contestar en un paso, para no avanzar con huecos. Revisa
 * lo que se ve: grupos de opciones sin elegir y campos vacíos que no dicen
 * «opcional». Rangos y combinaciones los revisa la validación completa al
 * guardar (coachProfileError), que sigue siendo la que manda. */
function stepGap(section: HTMLElement): { el: HTMLElement; question: string } | null {
  const shown = (el: HTMLElement) => el.getClientRects().length > 0;
  const questionOf = (el: HTMLElement): string => {
    const q = el.previousElementSibling;
    if (q?.classList.contains('ob-q')) return q.textContent!.trim();
    // el título del campo: el primer texto que no sea el input con su unidad
    const field = el.closest('label, .ob-field');
    const head = field && !field.matches('label') ? (field.querySelector('label') ?? field) : field;
    for (const n of head?.childNodes ?? []) {
      if (n instanceof Element && n.querySelector('input, textarea, select')) continue;
      const t = n.textContent?.trim();
      if (t) return t;
    }
    return 'este dato';
  };
  for (const el of section.querySelectorAll<HTMLElement>('.ob-chips, .ob-options, input, textarea')) {
    if (el.closest('.ob-other-list')) continue;
    if (el.matches('.ob-chips, .ob-options')) {
      if (shown(el) && !el.querySelector('.on')) return { el, question: questionOf(el) };
      continue;
    }
    const input = el as HTMLInputElement;
    if (['checkbox', 'file'].includes(input.type) || input.disabled) continue;
    if (input.closest('label, .ob-field')?.querySelector('.ob-optional')) continue;
    if (input.id === 'ob-ftp' && section.querySelector<HTMLInputElement>('#ob-no-ftp')?.checked) continue;
    // la fecha vive en un input oculto detrás del selector de día/mes/año
    if (input.id !== 'ob-birth-date' && !shown(input)) continue;
    if (!input.value.trim()) {
      const toggle = input.closest('.ob-field')?.querySelector<HTMLElement>('.ob-toggle');
      return { el: input, question: questionOf(input) + (toggle ? ` (o marca «${toggle.querySelector('.ob-toggle-title')?.textContent}»)` : '') };
    }
  }
  const noOther = section.querySelector<HTMLInputElement>('#ob-no-other');
  if (noOther && !noOther.checked && !section.querySelector('.ob-other-row')) {
    return { el: noOther, question: 'Agrega tus otras actividades o marca «No hago otra actividad además de la bici»' };
  }
  return null;
}

/** `allowSkip`: true en el primer aviso al llegar a la app (se puede
 * posponer); false cuando se abre porque el usuario ya intentó crear un
 * plan y hace falta esto primero — ahí no hay botón de saltar. */
export function openOnboardingForm(onComplete: () => void, allowSkip: boolean): void {
  const p = appState.profile;
  document.body.insertAdjacentHTML('beforeend', modalHtml(p));
  const backdrop = document.getElementById('onboarding-backdrop')!;
  let experienceLevel: Profile['experienceLevel'] = p.experienceLevel;
  let generalFitnessLevel: Profile['generalFitnessLevel'] = p.generalFitnessLevel;
  let discipline: Profile['discipline'] = p.discipline;
  let sex: Profile['sex'] = p.sex;

  if (!allowSkip) backdrop.querySelector('#onboarding-skip')?.remove();
  wireDatePicker(backdrop.querySelector<HTMLInputElement>('#ob-birth-date')!, { showToday: false });

  backdrop.querySelectorAll<HTMLButtonElement>('#ob-experience .ob-option').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-experience .ob-option').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      experienceLevel = chip.dataset.level as typeof experienceLevel;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-fitness .ob-option').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-fitness .ob-option').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      generalFitnessLevel = chip.dataset.level as typeof generalFitnessLevel;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-sex .ob-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-sex .ob-chip').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      sex = chip.dataset.sex as typeof sex;
    });
  });
  backdrop.querySelectorAll<HTMLButtonElement>('#ob-discipline .ob-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      backdrop.querySelectorAll('#ob-discipline .ob-chip').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      discipline = chip.dataset.discipline as typeof discipline;
    });
  });

  const competesCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-competes')!;
  const categoryLabel = backdrop.querySelector<HTMLElement>('#ob-category-label')!;
  competesCheckbox.addEventListener('change', () => {
    categoryLabel.style.display = competesCheckbox.checked ? 'flex' : 'none';
  });

  const ridesOutsideCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-rides-outside')!;
  const outdoorPowerLabel = backdrop.querySelector<HTMLElement>('#ob-outdoor-power-label')!;
  ridesOutsideCheckbox.addEventListener('change', () => {
    outdoorPowerLabel.style.display = ridesOutsideCheckbox.checked ? 'flex' : 'none';
  });

  const noFtpCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-ftp')!;
  const ftpLabel = backdrop.querySelector<HTMLElement>('#ob-ftp-label')!;
  noFtpCheckbox.addEventListener('change', () => {
    ftpLabel.textContent = noFtpCheckbox.checked ? 'FTP provisional (si tienes uno)' : 'FTP actual';
  });
  const hrMaxInput = backdrop.querySelector<HTMLInputElement>('#ob-hrmax')!;
  const noHrMaxCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-hrmax')!;
  noHrMaxCheckbox.addEventListener('change', () => {
    hrMaxInput.disabled = noHrMaxCheckbox.checked;
    if (noHrMaxCheckbox.checked) hrMaxInput.value = '';
  });

  // Opciones de una sola respuesta: marcar una desmarca las otras del grupo.
  backdrop.querySelectorAll<HTMLElement>('[data-single]').forEach((group) => {
    group.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.ob-chip');
      if (!chip) return;
      group.querySelectorAll('.ob-chip').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
      if (group.id === 'ob-medication') backdrop.querySelector<HTMLElement>('#ob-medication-note-label')!.style.display = chip.dataset.value === 'yes' ? 'flex' : 'none';
    });
  });
  const picked = (id: string): string | undefined => backdrop.querySelector<HTMLElement>(`#${id} .ob-chip.on`)?.dataset.value;
  // Condiciones: varias a la vez; «Ninguna» es excluyente.
  const conditionsGroup = backdrop.querySelector<HTMLElement>('#ob-conditions')!;
  conditionsGroup.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.ob-chip');
    if (!chip) return;
    const setOn = (c: Element, on: boolean) => { c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); };
    if (chip.dataset.value === 'none') conditionsGroup.querySelectorAll('.ob-chip').forEach((c) => setOn(c, c === chip));
    else {
      setOn(chip, !chip.classList.contains('on'));
      setOn(conditionsGroup.querySelector('[data-value="none"]')!, false);
    }
    backdrop.querySelector<HTMLElement>('#ob-conditions-other-label')!.style.display = conditionsGroup.querySelector('[data-value="other"].on') ? 'flex' : 'none';
  });
  const restingHrInput = backdrop.querySelector<HTMLInputElement>('#ob-resting-hr')!;
  const noRestingHr = backdrop.querySelector<HTMLInputElement>('#ob-no-resting-hr')!;
  noRestingHr.addEventListener('change', () => {
    restingHrInput.disabled = noRestingHr.checked;
    if (noRestingHr.checked) restingHrInput.value = '';
  });

  /** Lee Salud y Hábitos (y RPE / esfuerzos máximos); dice qué falta, en orden. */
  function readIntake(): { intake?: HealthIntake; missing?: string } {
    const conditions = [...conditionsGroup.querySelectorAll<HTMLElement>('.ob-chip.on')].map((c) => c.dataset.value!);
    if (!conditions.length) return { missing: 'Dinos si tienes alguna condición de salud, o marca «Ninguna».' };
    const medication = picked('ob-medication');
    if (!medication) return { missing: 'Dinos si tomas algún medicamento de forma regular.' };
    const recentInjury = picked('ob-recent-injury');
    if (!recentInjury) return { missing: 'Dinos si tuviste una lesión o cirugía importante en los últimos 2 años.' };
    const injuryLimits = picked('ob-injury-limits');
    if (!injuryLimits) return { missing: 'Dinos si hoy tienes una lesión o molestia que te impida hacer esfuerzos fuertes.' };
    const smoking = picked('ob-smoking');
    if (!smoking) return { missing: 'Dinos si fumas.' };
    const alcohol = picked('ob-alcohol');
    if (!alcohol) return { missing: 'Dinos qué tan seguido tomas alcohol.' };
    const stress = picked('ob-stress');
    if (!stress) return { missing: 'Dinos cómo es tu estrés en un día normal.' };
    const sleepRaw = backdrop.querySelector<HTMLInputElement>('#ob-sleep-hours')!.value;
    const sleepQuality = picked('ob-sleep-quality');
    if (!sleepQuality) return { missing: 'Dinos cómo duermes.' };
    const recentTraining = picked('ob-recent-training');
    if (!recentTraining) return { missing: 'Dinos cómo has entrenado las últimas 4 semanas.' };
    const recentHoursRaw = backdrop.querySelector<HTMLInputElement>('#ob-recent-hours')!.value.trim();
    const recentNote = backdrop.querySelector<HTMLTextAreaElement>('#ob-recent-note')!.value.trim();
    if (recentTraining !== 'little' && recentNote.length < 10) return { missing: 'Cuéntanos cómo es una semana típica de tu entrenamiento.' };
    const rpe = picked('ob-rpe');
    if (!rpe) return { missing: 'Dinos si sabes medir tu esfuerzo del 1 al 10.' };
    const maxEffort = picked('ob-max-effort');
    if (!maxEffort) return { missing: 'Dinos si has hecho esfuerzos al máximo.' };
    const restingRaw = restingHrInput.value.trim();
    if (!noRestingHr.checked && !restingRaw) return { missing: 'Escribe tu pulso en reposo o marca «No sé mi pulso en reposo».' };
    const real = conditions.filter((c) => c !== 'none') as HealthIntake['conditions'];
    return {
      intake: {
        conditions: real,
        ...(real.includes('other') ? { conditionsOther: backdrop.querySelector<HTMLInputElement>('#ob-conditions-other')!.value.trim() } : {}),
        takesMedication: medication === 'yes',
        ...(medication === 'yes' && backdrop.querySelector<HTMLInputElement>('#ob-medication-note')!.value.trim()
          ? { medicationNote: backdrop.querySelector<HTMLInputElement>('#ob-medication-note')!.value.trim() }
          : {}),
        recentInjury: recentInjury === 'yes',
        injuryLimitsIntensity: injuryLimits === 'yes',
        recentTraining: recentTraining as HealthIntake['recentTraining'],
        recentHoursPerWeek: recentHoursRaw ? Number(recentHoursRaw) : null,
        ...(recentNote ? { recentTrainingNote: recentNote.slice(0, 500) } : {}),
        smoking: smoking as HealthIntake['smoking'],
        alcohol: alcohol as HealthIntake['alcohol'],
        stress: stress as HealthIntake['stress'],
        sleepHours: Number(sleepRaw) || 0,
        sleepQuality: sleepQuality as HealthIntake['sleepQuality'],
        restingHr: noRestingHr.checked ? null : Number(restingRaw),
        rpeLiteracy: rpe as HealthIntake['rpeLiteracy'],
        maxEffortExperience: maxEffort === 'yes',
      },
    };
  }

  const injuriesInput = backdrop.querySelector<HTMLTextAreaElement>('#ob-injuries')!;
  const noInjuriesCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-injuries')!;
  noInjuriesCheckbox.addEventListener('change', () => {
    injuriesInput.disabled = noInjuriesCheckbox.checked;
    if (noInjuriesCheckbox.checked) injuriesInput.value = '';
  });

  // Otras actividades: estado en memoria, se pinta de nuevo al agregar,
  // quitar o cambiar el tipo; los campos de texto solo actualizan el estado.
  const activities: OtherActivity[] = (p.otherActivities ?? []).map((a) => ({ ...a, days: [...a.days] }));
  const otherList = backdrop.querySelector<HTMLElement>('#ob-other-list')!;
  const noOtherCheckbox = backdrop.querySelector<HTMLInputElement>('#ob-no-other')!;
  const addOtherBtn = backdrop.querySelector<HTMLButtonElement>('#ob-other-add')!;
  const paintActivities = () => {
    otherList.innerHTML = activities.map(otherActivityRowHtml).join('');
    addOtherBtn.style.display = noOtherCheckbox.checked ? 'none' : '';
  };
  addOtherBtn.addEventListener('click', () => {
    activities.push({ kind: 'strength', perWeek: 0, minutes: 0, days: [] });
    paintActivities();
  });
  noOtherCheckbox.addEventListener('change', () => {
    if (noOtherCheckbox.checked) activities.length = 0;
    paintActivities();
  });
  otherList.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const i = Number(el.closest<HTMLElement>('.ob-other-row')?.dataset.i);
    const a = activities[i];
    if (!a) return;
    if (el.dataset.f === 'perWeek') a.perWeek = Number(el.value) || 0;
    if (el.dataset.f === 'minutes') a.minutes = Number(el.value) || 0;
  });
  otherList.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    if (el.dataset.f !== 'kind') return;
    const a = activities[Number(el.closest<HTMLElement>('.ob-other-row')?.dataset.i)];
    if (!a) return;
    a.kind = el.value as NonBikeKind;
    paintActivities();
  });
  otherList.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const row = el.closest<HTMLElement>('.ob-other-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    if (el.classList.contains('ob-other-remove')) {
      activities.splice(i, 1);
      paintActivities();
      return;
    }
    const day = el.closest<HTMLElement>('[data-day]')?.dataset.day as OtherActivity['days'][number] | undefined;
    if (!day) return;
    const a = activities[i];
    a.days = a.days.includes(day) ? a.days.filter((d) => d !== day) : DAY_CODES.filter((d) => d === day || a.days.includes(d));
    paintActivities();
  });
  paintActivities();

  const fitStatus = backdrop.querySelector<HTMLElement>('#ob-fit-status')!;
  backdrop.querySelector<HTMLInputElement>('#ob-fit-files')?.addEventListener('change', async (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    let imported = 0;
    const errors: string[] = [];
    for (const file of files) {
      fitStatus.textContent = `Importando ${imported + errors.length + 1} de ${files.length}…`;
      // Sin dateOverride: se queda con la fecha/hora real del archivo — a
      // diferencia de "Agregar entrenamiento completado" en Plan, aquí no
      // hay un solo día que forzar, pueden ser varias sesiones de fechas
      // distintas.
      const { session, errors: fileErrors } = await buildCompletedSessionFromFit(file, appState.profile);
      if (fileErrors.length > 0) {
        errors.push(`${file.name}: ${fileErrors.join(', ')}`);
        continue;
      }
      if (session) {
        await saveSession(session);
        if (appState.user) void pushSessionToCloud(session, appState.profile, appState.user.id);
        imported++;
      }
    }
    fitStatus.textContent = `${imported} sesión(es) importada(s).${errors.length > 0 ? ` ${errors.length} con error: ${errors.join(' · ')}` : ''}`;
  });

  // La semana típica aparece solo si viene entrenando (no «Poco o nada»).
  const recentNoteBox = backdrop.querySelector<HTMLElement>('#ob-recent-note-box')!;
  backdrop.querySelector('#ob-recent-training')!.addEventListener('click', () =>
    queueMicrotask(() => {
      const v = backdrop.querySelector('#ob-recent-training .on')?.getAttribute('data-value');
      recentNoteBox.hidden = !v || v === 'little';
    }),
  );

  // en cuanto la persona toca lo marcado, la marca se quita
  const clearFlag = (e: Event) => {
    const box = (e.target as HTMLElement).closest('.ob-missing');
    if (!box) return;
    box.classList.remove('ob-missing');
    box.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
    box.removeAttribute('aria-invalid');
  };
  backdrop.addEventListener('click', clearFlag);
  backdrop.addEventListener('input', clearFlag);

  const close = () => backdrop.remove();
  backdrop.querySelector('#onboarding-close')?.addEventListener('click', close);
  backdrop.querySelector('#onboarding-skip')?.addEventListener('click', close);

  // ── Pasos: una sección a la vez, con Piñón guiando ──
  const sections = [...backdrop.querySelectorAll<HTMLElement>('.ob-section')];
  const editing = isCoachProfileComplete(p);
  const statusEl = backdrop.querySelector<HTMLElement>('#onboarding-status')!;
  const guideEl = backdrop.querySelector<HTMLElement>('#ob-guide-text')!;
  const bar = backdrop.querySelector<HTMLElement>('#ob-progress-bar')!;
  const backBtn = backdrop.querySelector<HTMLButtonElement>('#onboarding-back')!;
  const nextBtn = backdrop.querySelector<HTMLButtonElement>('#onboarding-next')!;
  const saveBtn = backdrop.querySelector<HTMLButtonElement>('#onboarding-submit')!;
  const bodyEl = backdrop.querySelector<HTMLElement>('.ob-body')!;
  let step = 1;
  // hasta dónde llegó: a esos pasos se puede saltar con los puntitos (al
  // editar un perfil ya completo, a todos)
  let reached = editing ? sections.length : 1;
  const showStep = (n: number, focus = true) => {
    step = Math.min(Math.max(n, 1), sections.length);
    reached = Math.max(reached, step);
    sections.forEach((s, i) => (s.hidden = i + 1 !== step));
    guideEl.textContent = obGuideLine(step, appState.displayName() || undefined, genderOf(sex));
    bar.style.width = `${(step / sections.length) * 100}%`;
    backdrop.querySelectorAll<HTMLButtonElement>('.ob-step-dot').forEach((dot) => {
      const n2 = Number(dot.dataset.go);
      dot.classList.toggle('done', n2 < step && n2 <= reached);
      dot.disabled = n2 > reached;
      if (n2 === step) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
    backBtn.hidden = step === 1;
    nextBtn.hidden = step === sections.length;
    saveBtn.hidden = step !== sections.length && !editing;
    statusEl.textContent = '';
    bodyEl.scrollTop = 0;
    if (focus) {
      const title = sections[step - 1].querySelector<HTMLElement>('.ob-section-title')!;
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  };
  backBtn.addEventListener('click', () => showStep(step - 1));
  nextBtn.addEventListener('click', () => {
    const gap = stepGap(sections[step - 1]);
    if (gap) {
      statusEl.textContent = `Contesta «${gap.question}» para seguir.`;
      flagElement(backdrop, gap.el);
      return;
    }
    showStep(step + 1);
  });
  backdrop.querySelector('#ob-steps')?.addEventListener('click', (e) => {
    const dot = (e.target as HTMLElement).closest<HTMLButtonElement>('.ob-step-dot');
    if (dot && !dot.disabled) showStep(Number(dot.dataset.go));
  });
  // el saludo de Piñón cambia de género en cuanto se elige el sexo
  backdrop.querySelector('#ob-sex')?.addEventListener('click', () => (guideEl.textContent = obGuideLine(step, appState.displayName() || undefined, genderOf(sex))));
  showStep(1, false);

  backdrop.querySelector('#onboarding-submit')?.addEventListener('click', async () => {
    const status = statusEl;
    const numOrUndef = (id: string) => {
      const raw = backdrop.querySelector<HTMLInputElement>(id)!.value;
      return raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    };
    const competes = competesCheckbox.checked;
    const ridesOutside = ridesOutsideCheckbox.checked;
    const hrMaxConfirmed = !noHrMaxCheckbox.checked;
    const typedFtp = numOrUndef('#ob-ftp');
    const typedHrMax = numOrUndef('#ob-hrmax');
    const intakeRead = readIntake();
    const ftpOrHrError = (): string | null => {
      // Sin «No sé», el número es obligatorio: antes se quedaba el 200 W / 185
      // lpm por defecto marcado como si fuera suyo.
      if (!noFtpCheckbox.checked && !(typedFtp !== undefined && typedFtp >= 50 && typedFtp <= 600)) {
        return 'Escribe tu FTP (de 50 a 600 W) o marca «No sé mi FTP todavía».';
      }
      if (hrMaxConfirmed && typedHrMax === undefined) {
        return 'Escribe tu pulso máximo o marca «No sé mi pulso máximo».';
      }
      return null;
    };

    // Fusión explícita sobre el perfil existente — nunca reemplazar el
    // objeto completo (ver memoria: podría borrar FTP/pulso ya guardados).
    const candidate = ftpFromForm(
      {
        ...appState.profile,
        sex,
        birth_date: backdrop.querySelector<HTMLInputElement>('#ob-birth-date')!.value || undefined,
        weight_kg: numOrUndef('#ob-weight'),
        height_cm: numOrUndef('#ob-height'),
        experienceLevel,
        generalFitnessLevel,
        discipline,
        yearsRiding: numOrUndef('#ob-years'),
        structuredTrainingYears: numOrUndef('#ob-structured-years'),
        competes,
        category: competes ? backdrop.querySelector<HTMLInputElement>('#ob-category')!.value.trim() || undefined : undefined,
        ridesOutside,
        hasOutdoorPowerMeter: ridesOutside ? backdrop.querySelector<HTMLInputElement>('#ob-outdoor-power')!.checked : undefined,
        injuries: noInjuriesCheckbox.checked ? NO_INJURIES : injuriesInput.value.trim() || undefined,
        intake: intakeRead.intake,
        recentBestResult: backdrop.querySelector<HTMLInputElement>('#ob-best-result')!.value.trim() || undefined,
        // Ni actividades ni «No hago»: sin contestar (coachProfileError lo pide).
        otherActivities: noOtherCheckbox.checked
          ? []
          : activities.length
            ? activities.map(({ name: _name, ...a }) => a)
            : undefined,
        hrMaxConfirmed,
        hr_max: hrMaxConfirmed ? (typedHrMax as number) : appState.profile.hr_max,
      },
      typedFtp ?? NaN,
      noFtpCheckbox.checked,
    );
    // Mismo orden que el formulario: primero lo que va antes de «Tus
    // números», luego el FTP y el pulso escritos, luego el resto.
    // Mismo orden que el formulario: «Sobre ti», luego Salud y Hábitos, luego
    // lo que va antes de «Tus números», el FTP y el pulso, y el resto.
    const firstGap = coachProfileError({ ...candidate, intake: undefined });
    const aboutYou = firstGap && /sexo|nacimiento|peso|altura/.test(firstGap) ? firstGap : null;
    const before = coachProfileError({ ...candidate, ftpSource: 'default', hrMaxConfirmed: false, competes: false, recentBestResult: '-', otherActivities: [] });
    const missing = aboutYou ?? intakeRead.missing ?? before ?? ftpOrHrError() ?? coachProfileError(candidate);
    if (missing) {
      // lo que falta puede estar en un paso anterior: se regresa ahí
      const target = missingTarget(backdrop, missing);
      const owner = target?.closest<HTMLElement>('.ob-section');
      if (owner) showStep(sections.indexOf(owner) + 1, false);
      status.textContent = missing;
      flagMissing(backdrop, missing);
      return;
    }
    appState.profile = candidate;
    status.textContent = 'Guardando…';
    await appState.persistProfile();
    close();
    onComplete();
  });
}
