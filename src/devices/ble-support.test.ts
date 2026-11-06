import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_HINT, browserWarning, isGoogleChrome, noBluetoothMessage } from './ble-support';

afterEach(() => vi.unstubAllGlobals());

describe('aviso de navegador', () => {
  it('la entrada dice que es para Google Chrome en computadora', () => {
    expect(BROWSER_HINT).toBe('Torq está hecho para Google Chrome en computadora.');
  });
  it('sin Bluetooth: manda a Chrome en computadora (nada de Edge ni otros)', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh) Firefox/130', platform: 'MacIntel', maxTouchPoints: 0 });
    expect(noBluetoothMessage()).toBe('Este navegador no puede conectarse al rodillo ni a la banda de pulso. Abre Torq en Google Chrome en tu computadora.');
  });
  it('iPhone: no se puede conectar, solo Chrome en computadora', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 });
    expect(noBluetoothMessage()).toBe('En iPhone y iPad no se puede conectar el rodillo ni la banda de pulso. Abre Torq en Google Chrome en tu computadora.');
  });
  it('Chrome sí; Edge, Opera y Brave no (aunque digan «Chrome»)', () => {
    const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
    vi.stubGlobal('navigator', { userAgent: chrome, bluetooth: {} });
    expect(isGoogleChrome()).toBe(true);
    expect(browserWarning()).toBeNull();
    vi.stubGlobal('navigator', { userAgent: `${chrome} Edg/156.0.0.0`, bluetooth: {} });
    expect(isGoogleChrome()).toBe(false);
    expect(browserWarning()).toMatch(/probado en Google Chrome/);
    vi.stubGlobal('navigator', { userAgent: `${chrome} OPR/120.0.0.0`, bluetooth: {} });
    expect(isGoogleChrome()).toBe(false);
    vi.stubGlobal('navigator', { userAgent: chrome, bluetooth: {}, brave: {} });
    expect(isGoogleChrome()).toBe(false);
  });
  it('sin Bluetooth manda el aviso fuerte', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh) Firefox/130', platform: 'MacIntel', maxTouchPoints: 0 });
    expect(browserWarning()).toBe(noBluetoothMessage());
  });
});
