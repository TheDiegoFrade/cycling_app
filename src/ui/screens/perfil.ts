import { supabase } from '../../supabase/client';
import { disconnectStrava, getStravaConnection, isStravaConfigured, redirectToStravaAuthorize } from '../../sync/strava';
import type { StravaConnection } from '../../sync/strava';
import type { Profile } from '../../core/types';
import { ageFromBirthDate, ftpSourceOf, isMeasuredFtp, withFtp } from '../../core/coach-profile';
import { ZONE_NAMES } from '../../core/zones';
import type { PowerZone } from '../../core/zones';
import { beeper } from '../audio';
import { appState } from '../state';
import { refresh } from '../router';
import { escapeHtml } from '../workout-cover';
import { COACH_TIER_LABELS } from '../../core/coach-invite';
import { endMyCoachLink } from '../../sync/coach-link';
import { wireDatePicker } from '../date-picker';
import { isCoachProfileComplete, openOnboardingForm } from '../onboarding';

const SOUNDS = [
  { id: 'tick', label: 'Cuenta regresiva' },
  { id: 'go', label: 'Inicio de bloque' },
  { id: 'alarm_low', label: 'Alerta de cadencia' },
  { id: 'alarm_desc', label: 'Alerta de pulso' },
  { id: 'chime', label: 'Comentario' },
] as const;

/** Rango en watts de cada zona con el FTP actual — mismos cortes que
 * `powerZone()` (ver core/zones.ts), solo para mostrarlos en Perfil. */
function zoneRanges(ftp: number): { zone: PowerZone; range: string }[] {
  const bounds: [number, number | null][] = [
    [0, 55],
    [55, 75],
    [75, 90],
    [90, 105],
    [105, 120],
    [120, null],
  ];
  return bounds.map(([from, to], i) => {
    const zone = (i + 1) as PowerZone;
    const lowW = Math.round((from / 100) * ftp);
    const range = to === null ? `${lowW}+ W` : from === 0 ? `hasta ${Math.round((to / 100) * ftp)} W` : `${lowW}–${Math.round((to / 100) * ftp)} W`;
    return { zone, range };
  });
}

function switchHtml(id: string, checked: boolean): string {
  return `<button class="switch${checked ? ' on' : ''}" role="switch" aria-pressed="${checked}" data-switch="${id}"></button>`;
}

/** De dónde salió el FTP, debajo del campo. */
function ftpHint(p: Profile): string {
  switch (ftpSourceOf(p)) {
    case 'default':
      return 'Valor de fábrica: ponle tu número o uno provisional';
    case 'provisional':
      return 'Provisional: se afina con tus sesiones';
    case 'test_ramp':
      return 'De tu test de rampa';
    case 'test_20min':
      return 'De tu test de 20 min';
    default:
      return 'Actualízalo después de cada test';
  }
}

type AlertRow = {
  label: string;
  hint: string;
  toggleKey: keyof typeof appState.settings.factoryRulesEnabled;
  valueKey?: keyof Profile;
  unit?: string;
};

const ALERT_ROWS: AlertRow[] = [
  { label: 'Cadencia mínima', hint: 'Te avisa si pedaleas muy lento', toggleKey: 'cadenceFloor', valueKey: 'cadence_floor', unit: 'rpm' },
  { label: 'Cadencia máxima', hint: 'Te avisa si pedaleas demasiado rápido', toggleKey: 'cadenceCeiling', valueKey: 'cadence_max', unit: 'rpm' },
  { label: 'Pulso máximo', hint: 'Alerta roja si lo pasas', toggleKey: 'hrCeiling', valueKey: 'hr_ceiling', unit: 'lpm' },
  { label: 'Pulso mínimo', hint: 'Útil para no quedarte demasiado suave', toggleKey: 'hrFloor', valueKey: 'hr_min', unit: 'lpm' },
  { label: 'Aviso si el ERG se desengancha', hint: 'Cuando el rodillo deja de controlar la resistencia', toggleKey: 'ergDetached' },
];

export function renderPerfil(container: HTMLElement): void {
  const user = appState.user;
  let stravaConnection: StravaConnection | null | 'loading' = 'loading';

  function paint(): void {
    const initial = (user?.email ?? '?').charAt(0).toUpperCase();
    container.innerHTML = `
      <div class="screen perfil-screen">
        <div class="perfil-header">
          <div class="perfil-avatar">${initial}</div>
          <div>
            <h1 style="margin:0">${user?.email ?? 'Perfil'}</h1>
            <p class="hint" style="margin:2px 0 0">${
              appState.cloudEnabled
                ? 'Tus cambios se guardan solos y se sincronizan entre tus dispositivos.'
                : 'Tus cambios se guardan solos en este dispositivo (sin sincronización en la nube configurada).'
            }</p>
          </div>
        </div>

        <div class="perfil-grid">
          <div class="perfil-col-main">
            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Datos personales</h2>
              <div class="grid-form">
                <label>Nombre<input type="text" id="profile-name" autocomplete="name" value="${appState.profile.name ?? ''}"></label>
                <label>Fecha de nacimiento<input type="date" id="profile-birth-date" value="${appState.profile.birth_date ?? ''}"></label>
                <label>Altura<span class="perfil-numfield-row"><input type="number" id="profile-height" min="0" step="1" value="${appState.profile.height_cm ?? ''}"><span class="live-col-label">cm</span></span></label>
                <label>Peso${appState.coach.myCoach ? ' <span class="perfil-alert-hint">· tu coach lo ve para calcular tus W/kg</span>' : ''}<span class="perfil-numfield-row"><input type="number" id="profile-weight" min="0" step="0.1" value="${appState.profile.weight_kg ?? ''}"><span class="live-col-label">kg</span></span></label>
                <label>Sexo
                  <select id="profile-sex">
                    <option value="" ${!appState.profile.sex ? 'selected' : ''}>Prefiero no decir</option>
                    <option value="M" ${appState.profile.sex === 'M' ? 'selected' : ''}>Hombre</option>
                    <option value="F" ${appState.profile.sex === 'F' ? 'selected' : ''}>Mujer</option>
                    <option value="other" ${appState.profile.sex === 'other' ? 'selected' : ''}>Otro</option>
                  </select>
                </label>
              </div>
              ${ageFromBirthDate(appState.profile.birth_date) !== null ? `<p class="hint" style="margin:6px 0 0">${ageFromBirthDate(appState.profile.birth_date)} años</p>` : ''}
            </div>

            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Tus números</h2>
              <div class="perfil-numbers">
                <label class="perfil-numfield"><span class="live-col-label">FTP</span><span class="perfil-numfield-row"><input type="number" data-profile-field="ftp" value="${appState.profile.ftp}" aria-label="FTP en watts" class="perfil-numinput"><span class="live-col-label">W</span></span><span class="perfil-numfield-hint">${ftpHint(appState.profile)}</span></label>
                <label class="perfil-numfield"><span class="live-col-label">Pulso máximo</span><span class="perfil-numfield-row"><input type="number" data-profile-field="hr_max" value="${appState.profile.hr_max}" aria-label="Pulso máximo" class="perfil-numinput"><span class="live-col-label">lpm</span></span><span class="perfil-numfield-hint">Tu máximo real, no el de una sesión</span></label>
              </div>
              <label class="ob-toggle" style="margin-bottom:14px">
                <span class="ob-toggle-text"><span class="ob-toggle-title">Mi FTP es provisional</span><span class="ob-toggle-desc">Todavía no hago un test: el coach lo toma como punto de partida y te dice cuándo ajustarlo.</span></span>
                <input type="checkbox" id="profile-ftp-provisional" class="ob-switch-input" ${isMeasuredFtp(ftpSourceOf(appState.profile)) ? '' : 'checked'}>
                <span class="ob-switch" aria-hidden="true"></span>
              </label>
              <div>
                <div class="live-col-label" style="margin-bottom:8px">Tus zonas de potencia con FTP ${appState.profile.ftp}</div>
                <div class="perfil-zones">
                  ${zoneRanges(appState.profile.ftp)
                    .map((z) => `<div class="perfil-zone"><div class="perfil-zone-bar" style="background:var(--z${z.zone})"></div><div class="perfil-zone-name">Z${z.zone} ${ZONE_NAMES[z.zone]}</div><div class="live-col-label">${z.range}</div></div>`)
                    .join('')}
                </div>
              </div>
            </div>

            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Cuestionario del coach</h2>
              <p class="hint" style="margin:0 0 8px">${
                isCoachProfileComplete(appState.profile)
                  ? 'Ya lo contestaste — esto es lo que usa el coach para crear y ajustar tu plan. Puedes actualizarlo cuando quieras (ej. en cuanto confirmes tu FTP).'
                  : 'Todavía no lo contestas — lo necesitas para que el coach pueda crear tu plan.'
              }</p>
              <button class="btn-light" id="profile-open-onboarding">${isCoachProfileComplete(appState.profile) ? 'Editar cuestionario' : 'Contestar cuestionario'}</button>
            </div>

            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Alertas</h2>
              <p class="hint" style="margin:0 0 6px">Suenan en cualquier workout. Si un bloque trae su propio límite, ese manda.</p>
              ${ALERT_ROWS.map((r) => {
                const on = appState.settings.factoryRulesEnabled[r.toggleKey];
                const value = r.valueKey ? appState.profile[r.valueKey] : undefined;
                return `
                  <div class="perfil-alert-row">
                    ${switchHtml(r.toggleKey, on)}
                    <div class="perfil-alert-copy"><div>${r.label}</div><div class="perfil-alert-hint">${r.hint}</div></div>
                    ${
                      r.valueKey
                        ? on
                          ? `<span class="perfil-alert-value"><input type="number" class="perfil-alert-input num" data-profile-field="${r.valueKey}" value="${value}">${r.unit}</span>`
                          : `<span class="perfil-alert-value perfil-alert-value-off">sin límite</span>`
                        : ''
                    }
                  </div>`;
              }).join('')}
            </div>
          </div>

          <div class="perfil-col-side">
            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Sonidos</h2>
              <label class="perfil-volume">Volumen<input type="range" id="volume" min="0" max="1" step="0.05" value="${appState.settings.soundVolume}"></label>
              <div class="row-actions">
                ${SOUNDS.map((s) => `<button data-sound="${s.id}">▶ ${s.label}</button>`).join('')}
              </div>
            </div>

            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Ilustración de fondo</h2>
              <div class="perfil-illustration-toggle">
                <button data-hero="man" class="${appState.settings.heroCharacter === 'man' ? 'on' : ''}">Ciclista hombre</button>
                <button data-hero="woman" class="${appState.settings.heroCharacter === 'woman' ? 'on' : ''}">Ciclista mujer</button>
              </div>
            </div>

            ${
              appState.coach.myCoach
                ? `
            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Tu coach</h2>
              <div class="perfil-account-row">
                <div><div>${escapeHtml(appState.coach.myCoach.coachName ?? 'Tu coach')}</div><div class="perfil-alert-hint">Plan: ${COACH_TIER_LABELS[appState.coach.myCoach.tier]} · desde ${new Date(appState.coach.myCoach.startedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
                <button id="coach-unlink" class="perfil-danger-link" style="margin:0">Desvincularme</button>
              </div>
              <a href="#/review" class="perfil-coach-reports">Reportes mensuales de tu coach →</a>
              <div id="coach-unlink-result"></div>
            </div>`
                : ''
            }

            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Cuentas conectadas</h2>
              ${
                isStravaConfigured()
                  ? `
              <div class="perfil-account-row">
                <div><div>Strava</div><div class="perfil-alert-hint" style="color:${stravaConnection && stravaConnection !== 'loading' ? 'var(--success)' : 'var(--text-muted)'}">${
                    stravaConnection === 'loading'
                      ? 'Verificando…'
                      : stravaConnection
                        ? `Conectado como ${stravaConnection.athleteName ?? `atleta #${stravaConnection.athleteId}`}`
                        : 'No conectado'
                  }</div></div>
                <button id="strava-btn">${stravaConnection ? 'Desconectar' : 'Conectar'}</button>
              </div>
              <div id="strava-result"></div>`
                  : '<p class="hint">Strava no está configurado en este despliegue.</p>'
              }
              <div class="perfil-account-row" style="margin-top:14px">
                <div><div>intervals.icu</div><div class="perfil-alert-hint">Sube tus sesiones automáticamente</div></div>
              </div>
              <div class="grid-form" style="margin-top:8px">
                <label>Athlete ID<input type="text" id="icu-athlete-id" autocomplete="off" data-lpignore="true" value="${appState.settings.intervalsIcu?.athleteId ?? ''}"></label>
                <label>API key<input type="password" id="icu-api-key" autocomplete="off" data-lpignore="true" value="${appState.settings.intervalsIcu?.apiKey ?? ''}"></label>
              </div>
              <div class="row-actions" style="margin-top:8px"><button id="icu-save">Guardar</button><span id="icu-saved" class="hint"></span></div>
            </div>

            ${
              appState.cloudEnabled && supabase
                ? `
            <div class="panel perfil-panel">
              <h2 class="perfil-h2">Cuenta</h2>
              <div class="perfil-account-row">
                <div>Contraseña</div>
                <button id="pw-toggle">Cambiar</button>
              </div>
              <div id="pw-fields" style="display:none;margin-top:10px">
                <label>Nueva contraseña<input type="password" id="set-password" placeholder="mínimo 6 caracteres" autocomplete="new-password"></label>
                <div class="row-actions" style="margin-top:8px"><button id="set-password-btn">Guardar contraseña</button></div>
                <div id="password-result"></div>
              </div>
              <button id="signout" class="perfil-danger-link">Cerrar sesión</button>
            </div>`
                : `<div class="panel perfil-panel"><p class="hint">Este despliegue no tiene sincronización en la nube configurada. La app funciona 100% local.</p></div>`
            }
          </div>
        </div>
      </div>
    `;

    beeper.setVolume(appState.settings.soundVolume);

    container.querySelectorAll<HTMLInputElement>('[data-profile-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.profileField as keyof Profile;
        const value = Number(input.value);
        if (key === 'ftp' && Number.isFinite(value) && value > 0) {
          const provisional = container.querySelector<HTMLInputElement>('#profile-ftp-provisional')?.checked ?? false;
          appState.profile = withFtp(appState.profile, value, provisional ? 'provisional' : 'manual');
          appState.persistProfile();
          paint();
          return;
        }
        if (Number.isFinite(value)) {
          appState.profile = { ...appState.profile, [key]: value };
          appState.persistProfile();
          if (key === 'ftp') paint();
        }
      });
    });

    // Marcar/desmarcar sin cambiar el número: "este FTP es mío" o "es un
    // punto de partida". Lo que el coach recibe depende de esto.
    container.querySelector<HTMLInputElement>('#profile-ftp-provisional')?.addEventListener('change', (e) => {
      const provisional = (e.target as HTMLInputElement).checked;
      appState.profile = withFtp(appState.profile, appState.profile.ftp, provisional ? 'provisional' : 'manual');
      appState.persistProfile();
      paint();
    });

    container.querySelector<HTMLInputElement>('#profile-name')?.addEventListener('change', (e) => {
      const name = (e.target as HTMLInputElement).value.trim();
      appState.profile = { ...appState.profile, name: name || undefined };
      appState.persistProfile();
    });

    const birthDateInput = container.querySelector<HTMLInputElement>('#profile-birth-date');
    if (birthDateInput) {
      wireDatePicker(birthDateInput, { showToday: false });
      birthDateInput.addEventListener('change', () => {
        appState.profile = { ...appState.profile, birth_date: birthDateInput.value || undefined };
        appState.persistProfile();
        paint(); // refresca la edad calculada junto al campo
      });
    }

    container.querySelector<HTMLInputElement>('#profile-height')?.addEventListener('change', (e) => {
      const raw = (e.target as HTMLInputElement).value;
      const value = Number(raw);
      appState.profile = { ...appState.profile, height_cm: raw && Number.isFinite(value) ? value : undefined };
      appState.persistProfile();
    });

    container.querySelector<HTMLInputElement>('#profile-weight')?.addEventListener('change', (e) => {
      const raw = (e.target as HTMLInputElement).value;
      const value = Number(raw);
      appState.profile = { ...appState.profile, weight_kg: raw && Number.isFinite(value) ? value : undefined };
      appState.persistProfile();
    });

    container.querySelector<HTMLSelectElement>('#profile-sex')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value as 'M' | 'F' | 'other' | '';
      appState.profile = { ...appState.profile, sex: value || undefined };
      appState.persistProfile();
    });

    // allowSkip:true — a diferencia de la primera vez (antes de "Crear mi
    // plan", donde es obligatorio), acá es revisión/edición libre.
    container.querySelector('#profile-open-onboarding')?.addEventListener('click', () => {
      openOnboardingForm(() => paint(), true);
    });

    container.querySelectorAll<HTMLButtonElement>('[data-switch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.switch as keyof typeof appState.settings.factoryRulesEnabled;
        appState.settings = {
          ...appState.settings,
          factoryRulesEnabled: { ...appState.settings.factoryRulesEnabled, [key]: !appState.settings.factoryRulesEnabled[key] },
        };
        appState.persistSettings();
        paint();
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

    container.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const heroCharacter = btn.dataset.hero as 'man' | 'woman';
        if (heroCharacter === appState.settings.heroCharacter) return;
        appState.settings = { ...appState.settings, heroCharacter };
        appState.persistSettings();
        paint();
      });
    });

    container.querySelector('#coach-unlink')?.addEventListener('click', async () => {
      const name = appState.coach.myCoach?.coachName ?? 'tu coach';
      if (!window.confirm(`¿Desvincularte de ${name}? Deja de ver tus datos en este momento.`)) return;
      const resultEl = container.querySelector<HTMLElement>('#coach-unlink-result')!;
      try {
        await endMyCoachLink();
        appState.coach = { ...appState.coach, myCoach: null };
        refresh(); // repinta también la barra lateral (tarjeta "Tu coach")
      } catch (err) {
        resultEl.innerHTML = `<div class="error-box">${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
      }
    });

    container.querySelector('#strava-btn')?.addEventListener('click', () => {
      if (stravaConnection) {
        void (async () => {
          const resultEl = container.querySelector<HTMLElement>('#strava-result')!;
          resultEl.innerHTML = '<p class="hint">Desconectando…</p>';
          try {
            await disconnectStrava();
            stravaConnection = null;
            paint();
          } catch (err) {
            resultEl.innerHTML = `<div class="error-box">${err instanceof Error ? err.message : String(err)}</div>`;
          }
        })();
      } else {
        redirectToStravaAuthorize();
      }
    });

    container.querySelector('#icu-save')?.addEventListener('click', () => {
      const athleteId = container.querySelector<HTMLInputElement>('#icu-athlete-id')!.value.trim();
      const apiKey = container.querySelector<HTMLInputElement>('#icu-api-key')!.value.trim();
      appState.settings = { ...appState.settings, intervalsIcu: athleteId && apiKey ? { athleteId, apiKey } : undefined };
      appState.persistSettings();
      const saved = container.querySelector<HTMLElement>('#icu-saved')!;
      saved.textContent = 'Guardado.';
      setTimeout(() => (saved.textContent = ''), 1800);
    });

    container.querySelector('#pw-toggle')?.addEventListener('click', () => {
      const fields = container.querySelector<HTMLElement>('#pw-fields')!;
      fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
    });

    container.querySelector('#set-password-btn')?.addEventListener('click', async () => {
      if (!supabase) return;
      const passwordInput = container.querySelector<HTMLInputElement>('#set-password')!;
      const resultEl = container.querySelector<HTMLElement>('#password-result')!;
      const password = passwordInput.value;
      if (!password) {
        resultEl.innerHTML = '<div class="error-box">Escribe una contraseña.</div>';
        return;
      }
      resultEl.innerHTML = '<p class="hint">Guardando…</p>';
      const { error } = await supabase.auth.updateUser({ password });
      resultEl.innerHTML = error ? `<div class="error-box">${error.message}</div>` : '<p class="hint">Listo.</p>';
      if (!error) passwordInput.value = '';
    });

    container.querySelector('#signout')?.addEventListener('click', async () => {
      // sin repintar acá: appState.signOut() dispara el refresh global (ver
      // main.ts), que vuelve a mostrar el login ya desconectado.
      await appState.signOut();
    });
  }

  paint();

  async function loadStravaConnection(): Promise<void> {
    if (!user || !isStravaConfigured()) return;
    stravaConnection = await getStravaConnection(user.id);
    paint();
  }
  void loadStravaConnection();
}
