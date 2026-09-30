import type { Interval } from '../../core/types';
import { saveWorkout } from '../../storage/workout-store';
import { appState } from '../state';
import { renderWorkoutCover } from '../workout-cover';

type LimitField = 'hr_min' | 'hr_ceiling' | 'cadence_min' | 'cadence_max';

const FIELDS: { key: LimitField; label: string }[] = [
  { key: 'hr_min', label: 'Pulso mín' },
  { key: 'hr_ceiling', label: 'Pulso máx' },
  { key: 'cadence_min', label: 'Cadencia mín' },
  { key: 'cadence_max', label: 'Cadencia máx' },
];

function fmt(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function inconsistent(iv: Interval): string | null {
  if (iv.hr_min !== undefined && iv.hr_ceiling !== undefined && iv.hr_min > iv.hr_ceiling) {
    return `pulso mín (${iv.hr_min}) es mayor que el máx (${iv.hr_ceiling})`;
  }
  if (iv.cadence_min !== undefined && iv.cadence_max !== undefined && iv.cadence_min > iv.cadence_max) {
    return `cadencia mín (${iv.cadence_min}) es mayor que la máx (${iv.cadence_max})`;
  }
  return null;
}

/** Editor de límites por bloque — ver TORQ_DESIGN.md, sección Plan. */
export function renderLimits(container: HTMLElement): void {
  const workout = appState.selectedWorkout;
  if (!workout) {
    container.innerHTML = `
      <div class="screen">
        <a href="#/plan" class="back-link">← Volver a Plan</a>
        <h1>Límites</h1>
        <p class="hint">Elige un workout en Plan primero.</p>
      </div>`;
    return;
  }

  function paint(): void {
    if (!workout) return;
    container.innerHTML = `
      <div class="screen limits-screen">
        <a href="#/plan" class="back-link">← Volver a Plan</a>
        <div class="limits-head">
          ${renderWorkoutCover(workout.intervals, 'sm')}
          <div>
            <h1 style="margin:0">Límites — ${workout.name}</h1>
            <p class="hint" style="margin:4px 0 0">
              Pulso y cadencia mín/máx por bloque. "Sin límite" = aplica el global de tu perfil (Perfil → Alertas), si lo
              tienes activado. Un valor aquí siempre gana sobre el global, solo para ese bloque.
            </p>
          </div>
        </div>
        <div class="limits-rows">
          ${workout.intervals
            .map((iv, i) => {
              const warn = inconsistent(iv);
              return `
              <div class="panel limits-row" data-row="${i}">
                <div class="limits-row-head">
                  <div>
                    <div style="font-weight:500">${iv.name}</div>
                    <div class="hint">${fmt(iv.duration_s)} · ${iv.power_pct}% FTP</div>
                    ${warn ? `<div class="hint" style="color:var(--danger)">${warn}</div>` : ''}
                  </div>
                  <button data-apply-all="${i}" class="limits-apply-btn">Aplicar a todos los intervalos</button>
                </div>
                <div class="limits-fields">
                  ${FIELDS.map(
                    (f) =>
                      `<label>${f.label}<input type="number" data-row="${i}" data-field="${f.key}" value="${iv[f.key] ?? ''}" placeholder="Sin límite"></label>`,
                  ).join('')}
                </div>
              </div>`;
            })
            .join('')}
        </div>
      </div>
    `;

    container.querySelectorAll<HTMLInputElement>('input[data-field]').forEach((input) => {
      input.addEventListener('change', async () => {
        const row = Number(input.dataset.row);
        const field = input.dataset.field as LimitField;
        const iv = workout.intervals[row];
        const raw = input.value.trim();
        if (raw === '') {
          delete iv[field];
        } else {
          const value = Number(raw);
          if (Number.isFinite(value) && value > 0) iv[field] = value;
        }
        await saveWorkout(workout);
        paint();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-apply-all]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sourceIndex = Number(btn.dataset.applyAll);
        const source = workout.intervals[sourceIndex];
        workout.intervals.forEach((iv) => {
          FIELDS.forEach((f) => {
            if (source[f.key] !== undefined) iv[f.key] = source[f.key];
            else delete iv[f.key];
          });
        });
        await saveWorkout(workout);
        paint();
      });
    });
  }

  paint();
}
