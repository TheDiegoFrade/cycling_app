/** Reloj a 1 Hz basado en tiempo real, no en conteo de ticks: deriva el
 * segundo actual de una marca de tiempo (`nowMs`) en vez de asumir que cada
 * intervalo dura exactamente 1000 ms, para no desfasarse. No posee ningún
 * temporizador — quien lo conduce (real con `setInterval`, o un test) decide
 * cuándo llamar a `poll`, así el engine corre sin browser y sin esperar. */
export class Clock {
  private startedAtMs: number | null = null;
  private pausedAccumMs = 0;
  private pausedAtMs: number | null = null;
  private lastEmitted = -1;

  start(nowMs: number): void {
    this.startedAtMs = nowMs;
    this.pausedAccumMs = 0;
    this.pausedAtMs = null;
    this.lastEmitted = -1;
  }

  pause(nowMs: number): void {
    if (this.startedAtMs !== null && this.pausedAtMs === null) {
      this.pausedAtMs = nowMs;
    }
  }

  resume(nowMs: number): void {
    if (this.pausedAtMs !== null) {
      this.pausedAccumMs += nowMs - this.pausedAtMs;
      this.pausedAtMs = null;
    }
  }

  get isPaused(): boolean {
    return this.pausedAtMs !== null;
  }

  elapsedS(nowMs: number): number {
    if (this.startedAtMs === null) return 0;
    const pausedExtra = this.pausedAtMs !== null ? nowMs - this.pausedAtMs : 0;
    return Math.floor((nowMs - this.startedAtMs - this.pausedAccumMs - pausedExtra) / 1000);
  }

  /** Devuelve, en orden, los segundos enteros que se cruzaron desde la
   * última llamada. Si quien conduce el reloj llega tarde (frame perdido,
   * pestaña en background), aquí aparecen todos los segundos saltados en
   * lugar de perderse. */
  poll(nowMs: number): number[] {
    const target = this.elapsedS(nowMs);
    const out: number[] = [];
    while (this.lastEmitted < target) {
      this.lastEmitted++;
      out.push(this.lastEmitted);
    }
    return out;
  }
}
