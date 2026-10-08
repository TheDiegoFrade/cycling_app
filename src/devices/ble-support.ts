// ¿Puede este navegador conectarse al rodillo? Web Bluetooth existe en
// Chrome/Edge (computadora y Android), pero no en ningún navegador de
// iPhone/iPad (Apple obliga a todos a usar el motor de Safari, que no lo
// tiene) ni en Firefox.

export function hasWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** iPhone/iPad, incluido el iPad que se presenta como Mac. */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Qué hacer si no hay Bluetooth, en palabras del usuario. */
export function noBluetoothMessage(): string {
  return isAppleMobile()
    ? 'Safari y los demás navegadores de iPhone/iPad no pueden conectarse por Bluetooth. Abre Torq en la app gratuita Bluefy (App Store), en un Android con Chrome o en una computadora con Chrome o Edge.'
    : 'Este navegador no puede conectarse por Bluetooth. Abre Torq en Chrome o Edge (computadora o Android).';
}
