import type { ConnectionState, FreeMode, HrAdapter, TrainerAdapter, TrainerReading } from './types';

/** Adaptador simulado: mismo contrato que el FTMS/HR real, para poder
 * construir y probar toda la UI (M3) sin hardware, y que M4 sea un cambio
 * de una sola pieza (swap del adaptador, nada más). */
export class SimulatedTrainerAdapter implements TrainerAdapter {
  state: ConnectionState = 'disconnected';
  private target = 100;
  private cadence = 90;
  private ergMode = true;
  private resistancePercent = 30;
  private gradePct: number | null = null;
  freeMode: FreeMode = 'sim';
  private readingCbs = new Set<(r: TrainerReading) => void>();
  private stateCbs = new Set<(s: ConnectionState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    this.setState('connecting');
    await new Promise((r) => setTimeout(r, 300));
    this.setState('connected');
    this.timer = setInterval(() => this.emitReading(), 1000);
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setState('disconnected');
  }

  setTarget(watts: number): void {
    this.target = watts;
    this.ergMode = true;
  }

  /** Simula salir de ERG: la potencia deja de perseguir `target` y pasa a
   * moverse alrededor de lo que "implicaría" el nivel de resistencia, con
   * más variación (ya no hay un objetivo fijo tirando de ella). */
  setResistance(percent: number): void {
    this.resistancePercent = percent;
    this.gradePct = null;
    this.ergMode = false;
  }

  /** Simula la calle: plano ≈ 150 W, cada 1 % de pendiente ≈ +25 W. */
  setSimulation(gradePct: number): void {
    this.gradePct = gradePct;
    this.ergMode = false;
  }

  onFreeModeChange(_cb: (mode: FreeMode) => void): () => void {
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

  private emitReading(): void {
    const base = this.ergMode ? this.target : this.gradePct !== null ? Math.max(60, 150 + this.gradePct * 25) : this.resistancePercent * 2.5;
    const noise = this.ergMode ? 16 : 30;
    const power = Math.max(0, Math.round(base + (Math.random() * noise - noise / 2)));
    this.cadence = Math.max(0, Math.round(this.cadence + (Math.random() * 4 - 2)));
    if (this.cadence < 60) this.cadence = 85; // vuelve a un valor razonable en vez de quedarse en 0
    this.readingCbs.forEach((cb) => cb({ power, cadence: this.cadence }));
  }
}

export class SimulatedHrAdapter implements HrAdapter {
  state: ConnectionState = 'disconnected';
  private hr = 90;
  private readingCbs = new Set<(hr: number) => void>();
  private rrCbs = new Set<(rrMs: number[]) => void>();
  private stateCbs = new Set<(s: ConnectionState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private beatDebt = 0;

  async connect(): Promise<void> {
    this.setState('connecting');
    await new Promise((r) => setTimeout(r, 300));
    this.setState('connected');
    this.timer = setInterval(() => this.emitReading(), 1000);
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setState('disconnected');
  }

  onReading(cb: (hr: number) => void): () => void {
    this.readingCbs.add(cb);
    return () => this.readingCbs.delete(cb);
  }

  onRr(cb: (rrMs: number[]) => void): () => void {
    this.rrCbs.add(cb);
    return () => this.rrCbs.delete(cb);
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    this.stateCbs.forEach((cb) => cb(s));
  }

  private emitReading(): void {
    this.hr += (135 - this.hr) * 0.05 + (Math.random() * 2 - 1);
    this.readingCbs.forEach((cb) => cb(Math.round(this.hr)));
    // los latidos de este segundo, con un poco de variabilidad latido a latido
    this.beatDebt += this.hr / 60;
    const rr: number[] = [];
    for (; this.beatDebt >= 1; this.beatDebt--) rr.push(Math.round(60000 / this.hr + (Math.random() * 30 - 15)));
    if (rr.length) this.rrCbs.forEach((cb) => cb(rr));
  }
}
