import {
  buildRequestControl,
  buildSetTargetPower,
  buildStart,
  CONTROL_POINT_RESULT,
  parseControlPointResponse,
  parseIndoorBikeData,
} from './ftms-protocol';
import type { ConnectionState, TrainerAdapter, TrainerReading } from './types';

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

/** Rodillo real vía FTMS (`fitness_machine`), probado contra un Saris H3.
 * No se puede verificar end-to-end sin el hardware conectado — este código
 * sigue al pie de la letra SPEC.md § Dispositivos (banderas de
 * indoor_bike_data, secuencia de control point, reconexión). */
export class BleTrainerAdapter implements TrainerAdapter {
  state: ConnectionState = 'disconnected';
  private device: BluetoothDevice | null = null;
  private dataCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private controlCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private statusCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private readingCbs = new Set<(r: TrainerReading) => void>();
  private stateCbs = new Set<(s: ConnectionState) => void>();
  private reconnectAttempt = 0;
  private manuallyDisconnected = false;
  private currentTarget = 100;
  private lastCadence = 0;
  private pendingWrite = false;
  private lastSentTarget: number | null = null;
  private recoveringErg = false;

  async connect(): Promise<void> {
    this.manuallyDisconnected = false;
    this.setState('connecting');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['fitness_machine'] }],
      optionalServices: ['fitness_machine'],
    });
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    await this.attachToDevice();
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    this.device?.gatt?.disconnect();
    this.setState('disconnected');
  }

  /** Manda el objetivo ERG. Si ya hay un envío en el aire (Bluetooth
   * congestionado, otra app peleando por el mismo rodillo, la pestaña
   * estuvo en segundo plano y se acumularon ticks) no se encola uno nuevo
   * — se descarta. El motor llama a esto cada segundo, así que el próximo
   * tick manda el valor más reciente en cuanto el canal se libera, en vez
   * de ir entregando una fila de objetivos viejos con retraso. */
  setTarget(watts: number): void {
    this.currentTarget = watts;
    if (this.state !== 'connected' || !this.controlCharacteristic) return;
    if (this.pendingWrite || this.lastSentTarget === watts) return;
    this.pendingWrite = true;
    this.controlCharacteristic
      .writeValueWithResponse(buildSetTargetPower(watts))
      .then(() => {
        this.lastSentTarget = watts;
      })
      .catch(() => {
        /* si falla, el próximo tick lo vuelve a intentar */
      })
      .finally(() => {
        this.pendingWrite = false;
      });
  }

  onReading(cb: (r: TrainerReading) => void): () => void {
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
    const service = await server.getPrimaryService('fitness_machine');

    this.dataCharacteristic = await service.getCharacteristic('indoor_bike_data');
    this.dataCharacteristic.addEventListener('characteristicvaluechanged', this.handleDataChanged);
    await this.dataCharacteristic.startNotifications();

    this.controlCharacteristic = await service.getCharacteristic('fitness_machine_control_point');
    this.controlCharacteristic.addEventListener('characteristicvaluechanged', this.handleControlResponse);
    await this.controlCharacteristic.startNotifications();

    // status es opcional (detectar si el rodillo pierde el modo ERG); no
    // interrumpe la conexión si el dispositivo no lo expone.
    try {
      this.statusCharacteristic = await service.getCharacteristic('fitness_machine_status');
      await this.statusCharacteristic.startNotifications();
    } catch {
      this.statusCharacteristic = null;
    }

    // al conectar (o reconectar) hay que repetir la secuencia completa,
    // incluyendo el objetivo actual, para que el rodillo vuelva a modo ERG.
    await this.controlCharacteristic.writeValueWithResponse(buildRequestControl());
    await this.controlCharacteristic.writeValueWithResponse(buildStart());
    await this.controlCharacteristic.writeValueWithResponse(buildSetTargetPower(this.currentTarget));
    this.lastSentTarget = this.currentTarget;

    this.reconnectAttempt = 0;
    this.setState('connected');
  }

  private handleDataChanged = (): void => {
    if (!this.dataCharacteristic?.value) return;
    const { power, cadence } = parseIndoorBikeData(this.dataCharacteristic.value);
    if (cadence !== null) this.lastCadence = cadence;
    this.readingCbs.forEach((cb) => cb({ power: power ?? 0, cadence: cadence ?? this.lastCadence }));
  };

  /** Cada comando al control point (incluido cada set target power) trae
   * una respuesta con código de resultado. Si el rodillo deja de aceptar
   * comandos (p. ej. `controlNotPermitted`) sin que la conexión BLE se
   * caiga, `writeValueWithResponse` igual resuelve — el rechazo solo se ve
   * acá. Reaccionamos repitiendo la secuencia completa de enganche. */
  private handleControlResponse = (): void => {
    if (!this.controlCharacteristic?.value) return;
    const response = parseControlPointResponse(this.controlCharacteristic.value);
    if (response && response.resultCode !== CONTROL_POINT_RESULT.success) {
      this.recoverErgControl();
    }
  };

  private recoverErgControl(): void {
    if (this.recoveringErg || !this.controlCharacteristic) return;
    this.recoveringErg = true;
    const characteristic = this.controlCharacteristic;
    characteristic
      .writeValueWithResponse(buildRequestControl())
      .then(() => characteristic.writeValueWithResponse(buildStart()))
      .then(() => characteristic.writeValueWithResponse(buildSetTargetPower(this.currentTarget)))
      .then(() => {
        this.lastSentTarget = this.currentTarget;
      })
      .catch(() => {
        /* si esto también falla, la próxima respuesta con error lo reintenta */
      })
      .finally(() => {
        this.recoveringErg = false;
      });
  }

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
