import { parseHeartRateMeasurement } from './heart-rate-protocol';
import type { ConnectionState, HrAdapter } from './types';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

/** Banda de pulso real: servicio `heart_rate`, característica
 * `heart_rate_measurement`. No probado con hardware real — requiere Chrome
 * con Web Bluetooth y un sensor físico; ver SPEC.md § Dispositivos. */
export class BleHrAdapter implements HrAdapter {
  state: ConnectionState = 'disconnected';
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private readingCbs = new Set<(hr: number) => void>();
  private stateCbs = new Set<(s: ConnectionState) => void>();
  private reconnectAttempt = 0;
  private manuallyDisconnected = false;

  async connect(): Promise<void> {
    this.manuallyDisconnected = false;
    this.setState('connecting');
    // acceptAllDevices en vez de filtrar por servicio: muchos relojes (p. ej.
    // Huawei/Honor) no anuncian `heart_rate` en el paquete de advertising
    // aunque lo tengan disponible tras conectar, así que filtrar los deja
    // fuera del selector. optionalServices sigue siendo obligatorio para
    // poder leer el servicio después de emparejar.
    this.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['heart_rate'] });
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    try {
      await this.attachToDevice();
    } catch (err) {
      this.setState('error');
      throw this.explainError(err);
    }
  }

  private explainError(err: unknown): Error {
    const message = err instanceof Error ? err.message : String(err);
    if (/service/i.test(message) && /not found/i.test(message)) {
      return new Error(
        `"${this.device?.name ?? 'el dispositivo'}" no expone el servicio de pulso estándar de Bluetooth (\`heart_rate\`). Esto es normal en smartwatches (Huawei, Honor, Apple Watch, etc.) que solo comparten el pulso con su propia app — necesitas una banda/correa dedicada (Garmin HRM-Dual, Polar H10, Wahoo TICKR...) que sí lo transmita abiertamente.`,
      );
    }
    return err instanceof Error ? err : new Error(message);
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    this.device?.gatt?.disconnect();
    this.setState('disconnected');
  }

  onReading(cb: (hr: number) => void): () => void {
    this.readingCbs.add(cb);
    return () => this.readingCbs.delete(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    this.stateCbs.forEach((cb) => cb(s));
  }

  private async attachToDevice(): Promise<void> {
    if (!this.device?.gatt) throw new Error('dispositivo sin GATT server');
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    this.characteristic = await service.getCharacteristic('heart_rate_measurement');
    this.characteristic.addEventListener('characteristicvaluechanged', this.handleValueChanged);
    await this.characteristic.startNotifications();
    this.reconnectAttempt = 0;
    this.setState('connected');
  }

  private handleValueChanged = (): void => {
    if (!this.characteristic?.value) return;
    const hr = parseHeartRateMeasurement(this.characteristic.value);
    this.readingCbs.forEach((cb) => cb(hr));
  };

  private handleDisconnected = (): void => {
    if (this.manuallyDisconnected) return;
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt++;
    setTimeout(() => {
      this.attachToDevice().catch(() => {
        this.setState('error');
        this.scheduleReconnect();
      });
    }, delay);
  }
}
