import type { Interval } from '../../core/types';
import { saveWorkout } from '../../storage/workout-store';
import { renderNav } from '../nav';
import { navigate } from '../router';
import { appState } from '../state';

type LimitField = 'hr_min' | 'hr_ceiling' | 'cadence_min' | 'cadence_max';

const FIELDS: { key: LimitField; label: string }[] = [
  { key: 'hr_min', label: 'Pulso mín' },
  { key: 'hr_ceiling', label: 'Pulso techo' },
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
    return `pulso mín (${iv.hr_min}) es mayor que el techo (${iv.hr_ceiling})`;
  }
  if (iv.cadence_min !== undefined && iv.cadence_max !== undefined && iv.cadence_min > iv.cadence_max) {
    return `cadencia mín (${iv.cadence_min}) es mayor que la máx (${iv.cadence_max})`;
  }
  return null;
}

export function renderLimits(container: HTMLElement): void {
  const workout = appState.selectedWorkout;
  if (!workout) {
    container.innerHTML = `
      <div class="screen">
        ${renderNav('limits')}
        <h1>Límites</h1>
        <p class="hint">Elige un workout en Inicio primero.</p>
        <button id="back">Volver a Inicio</button>
      </div>`;
    container.querySelector('#back')?.addEventListener('click', () => navigate('home'));
    return;
  }

  function paint(): void {
    if (!workout) return;
    container.innerHTML = `
      <div class="screen">
        ${renderNav('limits')}
        <h1>Límites — ${workout.name}</h1>
        <p class="hint">
          Pulso y cadencia mín/máx por bloque. Vacío = sin límite propio para ese bloque — en ese caso aplica el límite
          global de tu perfil (Inicio → Perfil / Alertas de fábrica), si lo tienes activado. Un valor aquí siempre gana
          sobre el global, solo para ese bloque.
        </p>
        <div class="panel" style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse" class="num">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px 8px">Bloque</th>
                ${FIELDS.map((f) => `<th style="text-align:left;padding:6px 8px">${f.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${workout.intervals
                .map((iv, i) => {
                  const warn = inconsistent(iv);
                  return `
                <tr data-row="${i}" style="border-top:1px solid #232830">
                  <td style="padding:6px 8px">
                    <div>${iv.name}</div>
                    <div class="meta">${fmt(iv.duration_s)} · ${iv.power_pct}% FTP</div>
                    ${warn ? `<div class="meta" style="color:var(--bad)">${warn}</div>` : ''}
                  </td>
                  ${FIELDS.map(
                    (f) =>
                      `<td style="padding:6px 8px"><input type="number" style="width:80px" data-row="${i}" data-field="${f.key}" value="${iv[f.key] ?? ''}" placeholder="sin límite"></td>`,
                  ).join('')}
                </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="row-actions" style="margin-top:20px">
          <button id="back">Volver a Inicio</button>
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

    container.querySelector('#back')?.addEventListener('click', () => navigate('home'));
  }

  paint();
}
