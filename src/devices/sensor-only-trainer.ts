import type { CadenceAdapter, ConnectionState, FreeMode, TrainerAdapter, TrainerReading } from './types';

/** «Rodillo» para la rodada libre sin rodillo inteligente: no controla nada
 * (ERG, calle y resistencia no hacen nada) y no mide potencia. Solo pasa la
 * cadencia del sensor, si hay uno, con el mismo contrato que un rodillo real
 * para que Entrenar no cambie. Manda una lectura por segundo aunque no haya
 * sensor de cadencia, para que Entrenar no la tome por un rodillo caído. */
export class SensorOnlyTrainer implements TrainerAdapter {
  state: ConnectionState = 'disconnected';
  readonly freeMode: FreeMode = 'sim';
  /** Para que Entrenar sepa que aquí no hay potencia ni control. */
  readonly sensorOnly = true;
  private cadence = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubCadence: (() => void) | null = null;
  private readingCbs = new Set<(r: TrainerReading) => void>();
  private stateCbs = new Set<(s: ConnectionState) => void>();

  private readonly cadenceSensor: CadenceAdapter | null;

  constructor(cadenceSensor: CadenceAdapter | null) {
    this.cadenceSensor = cadenceSensor;
  }

  get hasCadence(): boolean {
    return this.cadenceSensor !== null;
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    this.unsubCadence = this.cadenceSensor?.onReading((rpm) => (this.cadence = rpm)) ?? null;
    this.timer = setInterval(() => {
      const reading = { power: 0, cadence: this.cadenceSensor?.state === 'connected' ? this.cadence : 0 };
      this.readingCbs.forEach((cb) => cb(reading));
    }, 1000);
    this.setState('connected');
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsubCadence?.();
    this.unsubCadence = null;
    this.setState('disconnected');
  }

  setTarget(): void {}
  setResistance(): void {}
  setSimulation(): void {}

  onFreeModeChange(): () => void {
    return () => {};
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
}
