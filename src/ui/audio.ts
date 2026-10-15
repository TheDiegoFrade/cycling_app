import type { SoundId } from '../core/types';

/** Web Audio, osciladores, sin archivos — cada evento tiene su firma
 * sonora. El AudioContext requiere un gesto del usuario: se crea recién en
 * `unlock()`, que hay que llamar en el click de "empezar". */
export class Beeper {
  private ctx: AudioContext | null = null;
  private volume = 0.6;

  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
  }

  private tone(freq: number, ms: number, atS = 0, volMul = 1, type: OscillatorType = 'sine'): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + atS;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(this.volume * volMul, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.start(t0);
    osc.stop(t0 + ms / 1000);
  }

  /** Golpecito de ruido filtrado: la base de los sonidos de bici. */
  private tick(atS: number, freq: number, q: number, level: number, ms = 6): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + atS;
    const len = Math.max(1, Math.floor((ctx.sampleRate * ms) / 1000));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  /** Tono metálico que se apaga rápido (el «ping» de una pieza de metal). */
  private ping(atS: number, freq: number, ms: number, level: number): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + atS;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(level, t0 + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + ms / 1000 + 0.01);
  }

  /** Sonidos de bici al tocar la app (ui/click-sound.ts). Cortos y más
   * bajos que las alertas: solo para que tocar se sienta.
   *   ratchet: el tic-tic-tic de la rueda libre (botones)
   *   shift:   el clac de un cambio de velocidad (navegar)
   *   bell:    un timbre corto y suave (empezar a rodar) */
  bike(kind: 'ratchet' | 'shift' | 'bell'): void {
    if (!this.ctx || this.volume <= 0) return;
    const v = this.volume;
    if (kind === 'ratchet') {
      [0, 0.022, 0.044].forEach((at, i) => this.tick(at, 5200 - i * 300, 5, v * (0.9 - i * 0.2)));
      return;
    }
    if (kind === 'shift') {
      this.tick(0, 3800, 7, v * 1.2, 8);
      this.ping(0, 3100, 45, v * 0.1);
      this.tick(0.05, 2900, 7, v * 1, 10);
      this.ping(0.05, 2400, 60, v * 0.08);
      return;
    }
    // Timbre: parciales inharmónicos como los de una campanita de bici.
    this.ping(0, 2350, 420, v * 0.11);
    this.ping(0, 5650, 260, v * 0.035);
    this.ping(0.004, 3890, 180, v * 0.03);
  }

  play(sound: SoundId): void {
    switch (sound) {
      case 'tick':
        this.tone(880, 70);
        return;
      case 'go':
        this.tone(1320, 260);
        this.tone(1760, 180, 0.2);
        return;
      case 'alarm_low':
        this.tone(330, 140, 0, 1, 'square');
        this.tone(330, 140, 0.2, 1, 'square');
        return;
      case 'alarm_desc':
        this.tone(660, 150);
        this.tone(520, 150, 0.18);
        this.tone(400, 260, 0.36);
        return;
      case 'chime':
        this.tone(1047, 220, 0, 0.6);
        this.tone(1319, 320, 0.12, 0.6);
        return;
      case 'none':
        return;
    }
  }
}

export const beeper = new Beeper();
