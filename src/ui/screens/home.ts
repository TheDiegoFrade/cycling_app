import { validateRulesFile, validateWorkout } from '../../core/validator';
import { WORKOUT_TEMPLATES, findTemplate } from '../../core/workout-templates';
import { parseZwo } from '../../core/zwo-parser';
import type { Profile, RulesFile, Workout } from '../../core/types';
import { deleteWorkout, saveWorkout } from '../../storage/workout-store';
import { beeper } from '../audio';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';

const SOUNDS = [
  { id: 'tick', label: 'Tick (cuenta regresiva)' },
  { id: 'go', label: 'Go (arranca bloque)' },
  { id: 'alarm_low', label: 'Alarm low (cadencia)' },
  { id: 'alarm_desc', label: 'Alarm desc (pulso)' },
  { id: 'chime', label: 'Chime (comentario)' },
] as const;

function profileFieldRow(key: keyof Profile, label: string, value: number, hint?: string): string {
  return `<label>${label}<input type="number" data-profile-field="${key}" value="${value}" ${hint ? `title="${hint}"` : ''}>${hint ? `<span style="font-size:12px;color:var(--muted)">${hint}</span>` : ''}</label>`;
}

function workoutListItem(w: Workout): string {
  const duration = w.intervals.reduce((a, i) => a + i.duration_s, 0);
  const mins = Math.round(duration / 60);
  return `
    <div class="list-item" data-workout-id="${w.id}">
      <div>
        <div>${w.name}</div>
        <div class="meta">${w.intervals.length} bloques · ${mins} min${w.rules?.length ? ` · ${w.rules.length} reglas` : ''}</div>
      </div>
      <div class="row-actions">
        <button data-action="apply-rules" data-workout-id="${w.id}">+ reglas</button>
        <button data-action="limits" data-workout-id="${w.id}">Límites</button>
        <button data-action="delete" data-workout-id="${w.id}">Borrar</button>
        <button class="primary" data-action="train" data-workout-id="${w.id}">Entrenar</button>
      </div>
    </div>`;
}

function errorsHtml(errors: string[]): string {
  if (errors.length === 0) return '';
  return `<div class="error-box"><strong>${errors.length} error(es):</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
}

async function importWorkoutFile(file: File): Promise<{ workout?: Workout; errors: string[] }> {
  const text = await file.text();
  if (file.name.endsWith('.zwo')) {
    const parsed = parseZwo(text);
    if (parsed.errors.length > 0) return { errors: parsed.errors };
    const workout: Workout = {
      format_version: 1,
      id: crypto.randomUUID(),
      name: parsed.name,
      description: parsed.description,
      intervals: parsed.intervals,
      comments: parsed.comments.length ? parsed.comments : undefined,
      created_at: new Date().toISOString(),
    };
    const result = validateWorkout(workout);
    return result.valid ? { workout, errors: [] } : { errors: result.errors };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { errors: [`"${file.name}" no es JSON válido.`] };
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.intervals)) {
    return { errors: [`"${file.name}" no tiene \`intervals\`; si es un archivo de solo reglas, usa el botón "+ reglas" sobre un workout ya importado.`] };
  }
  const workout: Workout = {
    ...(record as unknown as Workout),
    id: typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID(),
    created_at: typeof record.created_at === 'string' && record.created_at ? record.created_at : new Date().toISOString(),
  };
  const result = validateWorkout(workout);
  return result.valid ? { workout, errors: [] } : { errors: result.errors };
}

async function importRulesFile(file: File, target: Workout): Promise<{ workout?: Workout; errors: string[] }> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { errors: [`"${file.name}" no es JSON válido.`] };
  }
  const result = validateRulesFile(raw);
  if (!result.valid) return { errors: result.errors };
  const rulesFile = raw as RulesFile;
  const merged: Workout = {
    ...target,
    countdown: rulesFile.countdown ?? target.countdown,
    comments: [...(target.comments ?? []), ...(rulesFile.comments ?? [])],
    rules: [...(target.rules ?? []), ...(rulesFile.rules ?? [])],
  };
  const workoutResult = validateWorkout(merged);
  return workoutResult.valid ? { workout: merged, errors: [] } : { errors: workoutResult.errors };
}

export function renderHome(container: HTMLElement): void {
  container.innerHTML = `
    <div class="screen">
      ${renderNav('home')}
      <h1>Torq</h1>
      <p class="hint">Entrena sin mirar la pantalla — la app avisa por sonido cuando hay que corregir algo.</p>

      <h2>Perfil</h2>
      <div class="panel">
        <div class="grid-form" id="profile-form">
          ${profileFieldRow('ftp', 'FTP (W)', appState.profile.ftp)}
          ${profileFieldRow('hr_max', 'Pulso máximo (HRmax real)', appState.profile.hr_max, 'Tu máximo fisiológico, no el límite de una sesión — se usa para calcular tus zonas de pulso (Z1-Z5).')}
          ${profileFieldRow('cadence_floor', 'Piso de cadencia', appState.profile.cadence_floor, 'rpm mínimas en todo momento, en cualquier workout.')}
          ${profileFieldRow('cadence_max', 'Techo de cadencia', appState.profile.cadence_max, 'rpm máximas en todo momento. Ponlo alto (p. ej. 999) si no quieres límite.')}
          ${profileFieldRow('hr_ceiling', 'Techo de pulso (alerta)', appState.profile.hr_ceiling, 'Límite general que dispara la alerta roja si lo pasas. Puede ser menor que tu HRmax.')}
          ${profileFieldRow('hr_min', 'Piso de pulso', appState.profile.hr_min, 'Pulso mínimo esperado. Ponlo en 0 si no quieres límite — útil solo si te interesa saber que estás pedaleando muy suave.')}
        </div>
      </div>

      <h2>Alertas de fábrica</h2>
      <div class="panel">
        <div class="toggle-row"><span>Piso de cadencia (todo el workout)</span><input type="checkbox" data-toggle="cadenceFloor" ${appState.settings.factoryRulesEnabled.cadenceFloor ? 'checked' : ''}></div>
        <div class="toggle-row"><span>Techo de cadencia (todo el workout)</span><input type="checkbox" data-toggle="cadenceCeiling" ${appState.settings.factoryRulesEnabled.cadenceCeiling ? 'checked' : ''}></div>
        <div class="toggle-row"><span>Techo de pulso (todo el workout)</span><input type="checkbox" data-toggle="hrCeiling" ${appState.settings.factoryRulesEnabled.hrCeiling ? 'checked' : ''}></div>
        <div class="toggle-row"><span>Piso de pulso (todo el workout)</span><input type="checkbox" data-toggle="hrFloor" ${appState.settings.factoryRulesEnabled.hrFloor ? 'checked' : ''}></div>
        <div class="toggle-row"><span>Aviso de ERG desenganchado</span><input type="checkbox" data-toggle="ergDetached" ${appState.settings.factoryRulesEnabled.ergDetached ? 'checked' : ''}></div>
        <p class="hint">Si un bloque de un workout ya trae su propio límite (ver botón "Límites"), ese manda y el de aquí se apaga solo para ese bloque — no compiten entre sí.</p>
      </div>

      <h2>Sonidos</h2>
      <div class="panel">
        <label>Volumen<input type="range" id="volume" min="0" max="1" step="0.05" value="${appState.settings.soundVolume}"></label>
        <div class="row-actions">
          ${SOUNDS.map((s) => `<button data-sound="${s.id}">${s.label}</button>`).join('')}
        </div>
      </div>

      <h2>Generar workout</h2>
      <p class="hint">Elige un tipo y cuántos minutos quieres — se arma solo y se ajusta a tu FTP al entrenarlo.</p>
      <div class="panel">
        <div class="grid-form">
          <label>Tipo
            <select id="gen-template">
              ${WORKOUT_TEMPLATES.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </label>
          <label>Minutos<input type="number" id="gen-minutes" value="${WORKOUT_TEMPLATES[0].defaultMinutes}" min="${WORKOUT_TEMPLATES[0].minMinutes}" max="${WORKOUT_TEMPLATES[0].maxMinutes}"></label>
        </div>
        <p class="hint" id="gen-description" style="margin-top:8px">${WORKOUT_TEMPLATES[0].description}</p>
        <div class="row-actions" style="margin-top:10px">
          <button class="primary" id="gen-create">Generar</button>
        </div>
        <div id="gen-errors"></div>
      </div>

      <h2>Biblioteca de workouts</h2>
      <div class="row-actions">
        <label class="callout" style="cursor:pointer">Importar .zwo / .workout.json<input type="file" id="import-workout" accept=".zwo,.json" style="display:none"></label>
      </div>
      <div id="import-errors"></div>
      <div class="list" id="workout-list" style="margin-top:12px">
        ${appState.workouts.length ? appState.workouts.map(workoutListItem).join('') : '<p class="hint">Todavía no importas ningún workout.</p>'}
      </div>
      <input type="file" id="import-rules" accept=".json" style="display:none">
    </div>
  `;

  beeper.setVolume(appState.settings.soundVolume);

  container.querySelectorAll<HTMLInputElement>('[data-profile-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.profileField as keyof Profile;
      const value = Number(input.value);
      if (Number.isFinite(value)) {
        appState.profile = { ...appState.profile, [key]: value };
        appState.persistProfile();
      }
    });
  });

  container.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.toggle as keyof typeof appState.settings.factoryRulesEnabled;
      appState.settings = {
        ...appState.settings,
        factoryRulesEnabled: { ...appState.settings.factoryRulesEnabled, [key]: input.checked },
      };
      appState.persistSettings();
    });
  });

  const volumeInput = container.querySelector<HTMLInputElement>('#volume');
  volumeInput?.addEventListener('input', () => {
    const v = Number(volumeInput.value);
    appState.settings = { ...appState.settings, soundVolume: v };
    beeper.setVolume(v);
    appState.persistSettings();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-sound]').forEach((btn) => {
    btn.addEventListener('click', () => {
      beeper.unlock();
      beeper.play(btn.dataset.sound as Parameters<typeof beeper.play>[0]);
    });
  });

  const importErrors = container.querySelector<HTMLElement>('#import-errors')!;

  function refreshList(): void {
    const list = container.querySelector<HTMLElement>('#workout-list')!;
    list.innerHTML = appState.workouts.length
      ? appState.workouts.map(workoutListItem).join('')
      : '<p class="hint">Todavía no importas ningún workout.</p>';
    wireListButtons();
  }

  const genTemplateSelect = container.querySelector<HTMLSelectElement>('#gen-template')!;
  const genMinutesInput = container.querySelector<HTMLInputElement>('#gen-minutes')!;
  const genDescription = container.querySelector<HTMLElement>('#gen-description')!;
  const genErrors = container.querySelector<HTMLElement>('#gen-errors')!;

  genTemplateSelect.addEventListener('change', () => {
    const t = findTemplate(genTemplateSelect.value);
    if (!t) return;
    genMinutesInput.min = String(t.minMinutes);
    genMinutesInput.max = String(t.maxMinutes);
    genMinutesInput.value = String(t.defaultMinutes);
    genDescription.textContent = t.description;
  });

  container.querySelector('#gen-create')?.addEventListener('click', async () => {
    const t = findTemplate(genTemplateSelect.value);
    if (!t) return;
    const minutes = Math.round(Number(genMinutesInput.value));
    if (!Number.isFinite(minutes) || minutes < t.minMinutes || minutes > t.maxMinutes) {
      genErrors.innerHTML = errorsHtml([`Minutos fuera de rango para "${t.name}": entre ${t.minMinutes} y ${t.maxMinutes}.`]);
      return;
    }
    const workout: Workout = {
      format_version: 1,
      id: crypto.randomUUID(),
      name: `${t.name} · ${minutes} min`,
      intervals: t.build(minutes),
      created_at: new Date().toISOString(),
    };
    const result = validateWorkout(workout);
    genErrors.innerHTML = errorsHtml(result.errors);
    if (result.valid) {
      await saveWorkout(workout);
      appState.workouts = [...appState.workouts, workout];
      refreshList();
    }
  });

  function wireListButtons(): void {
    container.querySelectorAll<HTMLButtonElement>('[data-action="train"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.selectedWorkoutId = btn.dataset.workoutId ?? null;
        navigate('connect');
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="limits"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        appState.selectedWorkoutId = btn.dataset.workoutId ?? null;
        navigate('limits');
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.workoutId!;
        await deleteWorkout(id);
        appState.workouts = appState.workouts.filter((w) => w.id !== id);
        refreshList();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="apply-rules"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = appState.workouts.find((w) => w.id === btn.dataset.workoutId);
        if (!target) return;
        rulesTargetWorkout = target;
        rulesInput.click();
      });
    });
  }

  let rulesTargetWorkout: Workout | null = null;
  const rulesInput = container.querySelector<HTMLInputElement>('#import-rules')!;
  rulesInput.addEventListener('change', async () => {
    const file = rulesInput.files?.[0];
    rulesInput.value = '';
    if (!file || !rulesTargetWorkout) return;
    const { workout, errors } = await importRulesFile(file, rulesTargetWorkout);
    importErrors.innerHTML = errorsHtml(errors);
    if (workout) {
      await saveWorkout(workout);
      appState.workouts = appState.workouts.map((w) => (w.id === workout.id ? workout : w));
      refreshList();
    }
  });

  const workoutInput = container.querySelector<HTMLInputElement>('#import-workout')!;
  workoutInput.addEventListener('change', async () => {
    const file = workoutInput.files?.[0];
    workoutInput.value = '';
    if (!file) return;
    const { workout, errors } = await importWorkoutFile(file);
    importErrors.innerHTML = errorsHtml(errors);
    if (workout) {
      await saveWorkout(workout);
      appState.workouts = [...appState.workouts, workout];
      refreshList();
    }
  });

  wireListButtons();
}
