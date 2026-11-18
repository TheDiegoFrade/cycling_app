import { CadenceCalculator, parseCscMeasurement } from './cadence-protocol';
import type { CadenceAdapter, ConnectionState } from './types';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

/** Sensor de cadencia real (servicio `cycling_speed_and_cadence`): un sensor
 * en la biela, o un rodillo/potenciómetro que lo exponga. Manda la cadencia
 * una vez por segundo aunque el sensor deje de notificar (así cae a 0 cuando
 * dejas de pedalear). No probado con hardware real. */
export class BleCadenceAdapter implements CadenceAdapter {
  state: ConnectionState = 'disconnected';
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private calc = new CadenceCalculator();
  private readingCbs = new Set<(rpm: number) => void>();
  private stateCbs = new Set<(s: ConnectionState) => void>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private manuallyDisconnected = false;

  async connect(): Promise<void> {
    this.manuallyDisconnected = false;
    this.setState('connecting');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['cycling_speed_and_cadence'] }],
      optionalServices: ['cycling_speed_and_cadence'],
    });
    try {
      await this.attachToDevice();
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    } catch (err) {
      this.device.gatt?.disconnect();
      this.setState('error');
      throw err;
    }
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopEmitting();
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    this.device?.gatt?.disconnect();
    this.setState('disconnected');
  }

  onReading(cb: (rpm: number) => void): () => void {
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
    const service = await server.getPrimaryService('cycling_speed_and_cadence');
    this.characteristic = await service.getCharacteristic('csc_measurement');
    this.characteristic.addEventListener('characteristicvaluechanged', this.handleValueChanged);
    await this.characteristic.startNotifications();
    this.calc = new CadenceCalculator();
    this.reconnectAttempt = 0;
    this.startEmitting();
    this.setState('connected');
  }

  private handleValueChanged = (): void => {
    try {
      if (!this.characteristic?.value) return;
      const crank = parseCscMeasurement(this.characteristic.value);
      if (crank) this.calc.push(crank, performance.now());
    } catch (err) {
      console.error('[cadence] no se pudo leer csc_measurement', err);
    }
  };

  private startEmitting(): void {
    this.stopEmitting();
    this.emitTimer = setInterval(() => {
      const rpm = this.calc.current(performance.now());
      this.readingCbs.forEach((cb) => cb(rpm));
    }, 1000);
  }

  private stopEmitting(): void {
    if (this.emitTimer) clearInterval(this.emitTimer);
    this.emitTimer = null;
  }

  private handleDisconnected = (): void => {
    this.stopEmitting();
    if (this.manuallyDisconnected) return;
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manuallyDisconnected) return;
      this.attachToDevice().catch(() => {
        if (this.manuallyDisconnected) return;
        this.setState('error');
        this.scheduleReconnect();
      });
    }, delay);
  }
}
