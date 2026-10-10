import {
  buildRequestControl,
  buildSetIndoorBikeSimulation,
  buildSetResistanceLevel,
  buildSetTargetPower,
  buildStart,
  CONTROL_POINT_OPCODE,
  CONTROL_POINT_RESULT,
  parseControlPointResponse,
  parseFitnessMachineFeature,
  parseIndoorBikeData,
} from './ftms-protocol';
import type { ConnectionState, FreeMode, TrainerAdapter, TrainerReading } from './types';

/** Resistencia fija cuando el rodillo no soporta la simulación de calle. */
const FALLBACK_RESISTANCE_PCT = 20;

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
  private lastSentResistance: number | null = null;
  private pendingResistanceWrite = false;
  private recoveringErg = false;
  /** Lo último que se le pidió: el modo en el que DEBE estar el rodillo. Al
   * reconectar o al recuperar el control se repite esto, no siempre ERG
   * (antes, con ERG apagado, un rechazo o una reconexión lo regresaban a
   * ERG sin avisar y se sentía atorado). */
  private controlMode: 'erg' | 'sim' | 'resistance' = 'erg';
  private currentGrade = 0;
  private currentResistance = FALLBACK_RESISTANCE_PCT;
  private lastSentGrade: number | null = null;
  private pendingSimWrite = false;
  /** Optimista hasta leer las capacidades del rodillo (o hasta que rechace). */
  freeMode: FreeMode = 'sim';
  private freeModeCbs = new Set<(m: FreeMode) => void>();

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
    this.controlMode = 'erg';
    if (this.state !== 'connected' || !this.controlCharacteristic) return;
    if (this.pendingWrite || this.lastSentTarget === watts) return;
    this.pendingWrite = true;
    this.controlCharacteristic
      .writeValueWithResponse(buildSetTargetPower(watts))
      .then(() => {
        this.lastSentTarget = watts;
        this.lastSentResistance = null; // ya no estamos en modo resistencia
        this.lastSentGrade = null;
      })
      .catch(() => {
        /* si falla, el próximo tick lo vuelve a intentar */
      })
      .finally(() => {
        this.pendingWrite = false;
      });
  }

  /** Saca al rodillo de modo ERG (deja de perseguir watts) y lo pasa a
   * resistencia fija — mismo patrón de "descartar si hay un envío en el
   * aire" que `setTarget`. Sin verificar en hardware real: el mapeo de
   * "nivel 0-100" a sensación física depende del fabricante. */
  setResistance(percent: number): void {
    this.controlMode = 'resistance';
    this.currentResistance = percent;
    if (this.state !== 'connected' || !this.controlCharacteristic) return;
    if (this.pendingResistanceWrite || this.lastSentResistance === percent) return;
    this.pendingResistanceWrite = true;
    this.controlCharacteristic
      .writeValueWithResponse(buildSetResistanceLevel(percent))
      .then(() => {
        this.lastSentResistance = percent;
        this.lastSentTarget = null; // ya no estamos en modo ERG
        this.lastSentGrade = null;
      })
      .catch(() => {
        /* si falla, la próxima llamada lo reintenta */
      })
      .finally(() => {
        this.pendingResistanceWrite = false;
      });
  }

  /** Calle simulada (ver buildSetIndoorBikeSimulation). Si este rodillo no
   * la soporta, cae a resistencia fija. */
  setSimulation(gradePct: number): void {
    this.currentGrade = gradePct;
    if (this.freeMode !== 'sim') {
      this.setResistance(this.currentResistance);
      return;
    }
    this.controlMode = 'sim';
    if (this.state !== 'connected' || !this.controlCharacteristic) return;
    if (this.pendingSimWrite || this.lastSentGrade === gradePct) return;
    this.pendingSimWrite = true;
    this.controlCharacteristic
      .writeValueWithResponse(buildSetIndoorBikeSimulation(gradePct))
      .then(() => {
        this.lastSentGrade = gradePct;
        this.lastSentTarget = null;
        this.lastSentResistance = null;
      })
      .catch(() => {
        /* si falla, la próxima llamada lo reintenta */
      })
      .finally(() => {
        this.pendingSimWrite = false;
      });
  }

  onFreeModeChange(cb: (m: FreeMode) => void): () => void {
    this.freeModeCbs.add(cb);
    return () => this.freeModeCbs.delete(cb);
  }

  private setFreeMode(mode: FreeMode): void {
    if (this.freeMode === mode) return;
    this.freeMode = mode;
    this.freeModeCbs.forEach((cb) => cb(mode));
  }

  /** El comando del modo en el que debe estar el rodillo ahora. */
  private currentModeCommand(): Uint8Array {
    if (this.controlMode === 'sim') return buildSetIndoorBikeSimulation(this.currentGrade);
    if (this.controlMode === 'resistance') return buildSetResistanceLevel(this.currentResistance);
    return buildSetTargetPower(this.currentTarget);
  }

  private markSent(): void {
    this.lastSentTarget = this.controlMode === 'erg' ? this.currentTarget : null;
    this.lastSentGrade = this.controlMode === 'sim' ? this.currentGrade : null;
    this.lastSentResistance = this.controlMode === 'resistance' ? this.currentResistance : null;
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

    // Qué modos acepta: si no anuncia la simulación de calle, el modo
    // libre usa resistencia fija. Sin esta característica (opcional en
    // algunos rodillos) se intenta la simulación y se cae si la rechaza.
    try {
      const feature = await service.getCharacteristic('fitness_machine_feature');
      const parsed = parseFitnessMachineFeature(await feature.readValue());
      if (parsed) this.setFreeMode(parsed.simulation ? 'sim' : 'resistance');
    } catch {
      /* sin la característica: se queda optimista */
    }
    if (this.controlMode === 'sim' && this.freeMode !== 'sim') this.controlMode = 'resistance';

    // al conectar (o reconectar) hay que repetir la secuencia completa,
    // incluyendo el modo actual (ERG, calle o resistencia), no siempre ERG.
    await this.controlCharacteristic.writeValueWithResponse(buildRequestControl());
    await this.controlCharacteristic.writeValueWithResponse(buildStart());
    await this.controlCharacteristic.writeValueWithResponse(this.currentModeCommand());
    this.markSent();

    this.reconnectAttempt = 0;
    this.setState('connected');
  }

  // envuelto en try/catch: esto corre dentro del callback nativo de
  // `characteristicvaluechanged` — una excepción sin capturar ahí (p. ej.
  // por un paquete más corto de lo esperado) no tiene nada que la atrape
  // río arriba, y puede repetirse varias veces por segundo mientras el
  // rodillo siga mandando el mismo dato.
  private handleDataChanged = (): void => {
    try {
      if (!this.dataCharacteristic?.value) return;
      const { power, cadence } = parseIndoorBikeData(this.dataCharacteristic.value);
      if (cadence !== null) this.lastCadence = cadence;
      this.readingCbs.forEach((cb) => cb({ power: power ?? 0, cadence: cadence ?? this.lastCadence }));
    } catch (err) {
      console.error('[ftms] no se pudo leer indoor_bike_data', err);
    }
  };

  /** Cada comando al control point (incluido cada set target power) trae
   * una respuesta con código de resultado. Si el rodillo deja de aceptar
   * comandos (p. ej. `controlNotPermitted`) sin que la conexión BLE se
   * caiga, `writeValueWithResponse` igual resuelve — el rechazo solo se ve
   * acá. Reaccionamos repitiendo la secuencia completa de enganche. */
  private handleControlResponse = (): void => {
    try {
      if (!this.controlCharacteristic?.value) return;
      const response = parseControlPointResponse(this.controlCharacteristic.value);
      if (!response || response.resultCode === CONTROL_POINT_RESULT.success) return;
      // No soporta la calle simulada: modo libre con resistencia fija.
      if (response.requestOpCode === CONTROL_POINT_OPCODE.setIndoorBikeSimulation && response.resultCode !== CONTROL_POINT_RESULT.controlNotPermitted) {
        this.setFreeMode('resistance');
        this.lastSentGrade = null;
        this.setResistance(this.currentResistance);
        return;
      }
      // Tampoco acepta resistencia fija: no hay forma de soltarlo; no se
      // regresa a ERG a escondidas (se queda en lo último que aceptó).
      if (response.requestOpCode === CONTROL_POINT_OPCODE.setResistanceLevel && response.resultCode !== CONTROL_POINT_RESULT.controlNotPermitted) {
        console.warn('[ftms] el rodillo no acepta resistencia fija');
        return;
      }
      this.recoverControl();
    } catch (err) {
      console.error('[ftms] no se pudo leer la respuesta del control point', err);
    }
  };

  /** Repite el enganche completo y el modo actual (ERG, calle o resistencia). */
  private recoverControl(): void {
    if (this.recoveringErg || !this.controlCharacteristic) return;
    this.recoveringErg = true;
    const characteristic = this.controlCharacteristic;
    characteristic
      .writeValueWithResponse(buildRequestControl())
      .then(() => characteristic.writeValueWithResponse(buildStart()))
      .then(() => characteristic.writeValueWithResponse(this.currentModeCommand()))
      .then(() => this.markSent())
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
