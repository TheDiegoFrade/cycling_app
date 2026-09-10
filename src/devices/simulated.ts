import type { ConnectionState, HrAdapter, TrainerAdapter, TrainerReading } from './types';

/** Adaptador simulado: mismo contrato que el FTMS/HR real, para poder
 * construir y probar toda la UI (M3) sin hardware, y que M4 sea un cambio
 * de una sola pieza (swap del adaptador, nada más). */
export class SimulatedTrainerAdapter implements TrainerAdapter {
  state: ConnectionState = 'disconnected';
  private target = 100;
  private cadence = 90;
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
    const power = Math.max(0, Math.round(this.target + (Math.random() * 16 - 8)));
    this.cadence = Math.max(0, Math.round(this.cadence + (Math.random() * 4 - 2)));
    if (this.cadence < 60) this.cadence = 85; // vuelve a un valor razonable en vez de quedarse en 0
    this.readingCbs.forEach((cb) => cb({ power, cadence: this.cadence }));
  }
}

export class SimulatedHrAdapter implements HrAdapter {
  state: ConnectionState = 'disconnected';
  private hr = 90;
  private readingCbs = new Set<(hr: number) => void>();
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

  private emitReading(): void {
    this.hr += (135 - this.hr) * 0.05 + (Math.random() * 2 - 1);
    this.readingCbs.forEach((cb) => cb(Math.round(this.hr)));
  }
}
