// ¿Puede este navegador conectarse al rodillo? Web Bluetooth no existe en
// Safari, Firefox ni en ningún navegador de iPhone/iPad. Torq está hecho y
// probado para Google Chrome en computadora: es lo único que se recomienda.

export function hasWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** iPhone/iPad, incluido el iPad que se presenta como Mac. */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** ¿Es Google Chrome? Edge, Opera, Brave y Samsung Internet también se
 * presentan como «Chrome/…», pero no son donde se prueba Torq. */
export function isGoogleChrome(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (!/Chrome\//.test(ua) || /Edg\/|EdgA\/|OPR\/|SamsungBrowser|YaBrowser|Vivaldi/.test(ua)) return false;
  return !(navigator as Navigator & { brave?: unknown }).brave;
}

/** El aviso para este navegador, o null si es Chrome con Bluetooth. */
export function browserWarning(): string | null {
  if (!hasWebBluetooth()) return noBluetoothMessage();
  if (!isGoogleChrome()) return 'Torq está probado en Google Chrome en computadora. En este navegador la conexión con el rodillo podría no funcionar bien: te recomendamos abrirlo en Chrome.';
  return null;
}

/** Lo que se dice a todos en la entrada. */
export const BROWSER_HINT = 'Torq está hecho para Google Chrome en computadora.';

/** Qué hacer si no hay Bluetooth, en palabras del usuario. Solo se
 * recomienda Google Chrome en computadora: es donde se prueba Torq. */
export function noBluetoothMessage(): string {
  return isAppleMobile()
    ? 'En iPhone y iPad no se puede conectar el rodillo ni la banda de pulso. Abre Torq en Google Chrome en tu computadora.'
    : 'Este navegador no puede conectarse al rodillo ni a la banda de pulso. Abre Torq en Google Chrome en tu computadora.';
}
