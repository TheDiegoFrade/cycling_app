// Piñón en la sesión en vivo: una esquina, mensajes cortos de ánimo en
// momentos que sirven (hitos del bloque y de la sesión, rato bien en zona).
// Excepción pedida a PINON.md §4 («nunca en train»): aquí no se asoma ni abre
// burbujas, no tapa números y se quita en cuanto sale una alerta real.
// Sin IA: todo sale de los datos de la sesión.
import { pinonFigureHtml, pinonSpeak, setPinonPose } from './pinon';

export const RIDE_SETTING_KEY = 'torq.pinon.ride';
/** Mínimo entre dos mensajes de Piñón (los hitos que caen antes se saltan). */
export const RIDE_MIN_GAP_S = 75;
/** Cuánto se queda en pantalla cada mensaje. */
export const RIDE_SHOW_MS = 5500;
/** Minutos seguidos en zona para que Piñón lo note (y cada cuánto lo repite). */
export const IN_ZONE_EVERY_S = 240;
/** Qué tan cerca del objetivo cuenta como «en zona». */
export const IN_ZONE_TOLERANCE = 0.06;

export function isRidePinonEnabled(): boolean {
  try {
    return localStorage.getItem(RIDE_SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setRidePinonEnabled(on: boolean): void {
  try {
    localStorage.setItem(RIDE_SETTING_KEY, on ? 'on' : 'off');
  } catch {
    // sin almacenamiento: se queda encendido
  }
}

/** ¿Puede hablar ahora? Nunca con una alerta activa ni muy seguido. */
export function canRidePinonSpeak(nowS: number, lastSpokeS: number | null, alertActive: boolean, enabled: boolean): boolean {
  if (!enabled || alertActive) return false;
  return lastSpokeS === null || nowS - lastSpokeS >= RIDE_MIN_GAP_S;
}

/** Potencia dentro de ±6 % del objetivo (sin objetivo, no cuenta). */
export function isInZone(power: number, target: number): boolean {
  if (target <= 0) return false;
  return Math.abs(power - target) <= target * IN_ZONE_TOLERANCE;
}

const IN_ZONE_LINES = [
  'Así, parejito. Llevas {m} min justo en tu zona.',
  '{m} min en zona. Eso es entrenar bien.',
  'Muy constante: {m} min justo donde va.',
] as const;

/** Mensaje por llevar `streakS` segundos seguidos en zona; null si todavía no toca. */
export function inZoneLine(streakS: number, seed: number): string | null {
  if (streakS < IN_ZONE_EVERY_S) return null;
  const m = Math.floor(streakS / 60);
  return IN_ZONE_LINES[Math.abs(seed) % IN_ZONE_LINES.length].replace('{m}', String(m));
}

// ── DOM ────────────────────────────────────────────────────────────────────

export function ridePinonHtml(): string {
  return `<div class="live-pinon" id="livePinon" aria-live="polite" hidden>
    ${pinonFigureHtml('base', 72)}
    <div class="live-pinon-text"><b id="livePinonTitle"></b><span id="livePinonDetail"></span></div>
  </div>`;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Muestra un mensaje en la esquina. `cheer` = pose de festejo (hitos grandes). */
export function ridePinonSay(title: string, detail = '', cheer = false): void {
  const box = document.getElementById('livePinon');
  if (!box) return;
  const fig = box.querySelector('.pinon');
  (box.querySelector('#livePinonTitle') as HTMLElement).textContent = title;
  (box.querySelector('#livePinonDetail') as HTMLElement).textContent = detail;
  box.hidden = false;
  box.classList.remove('on');
  void box.offsetWidth;
  box.classList.add('on');
  if (fig) {
    if (cheer) setPinonPose(fig, 'motiva');
    else pinonSpeak(fig, 1800);
  }
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(ridePinonHide, RIDE_SHOW_MS);
}

/** Lo quita de inmediato (sale una alerta, pausa o se desmonta la pantalla). */
export function ridePinonHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  const box = document.getElementById('livePinon');
  if (!box) return;
  box.classList.remove('on');
  box.hidden = true;
  const fig = box.querySelector('.pinon');
  if (fig) setPinonPose(fig, 'base');
}
