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

  /** Click mecánico vintage (tecla de máquina de escribir / interruptor
   * viejo): un golpecito de ruido filtrado y un «toc» grave muy corto. Más
   * bajo que las alertas: es solo para que tocar se sienta. */
  click(): void {
    if (!this.ctx || this.volume <= 0) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const level = this.volume * 0.35;

    const len = Math.floor(ctx.sampleRate * 0.025);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 1.4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = level;
    noise.connect(band).connect(noiseGain).connect(ctx.destination);
    noise.start(t0);

    const thock = ctx.createOscillator();
    const thockGain = ctx.createGain();
    thock.type = 'triangle';
    thock.frequency.setValueAtTime(190, t0);
    thock.frequency.exponentialRampToValueAtTime(90, t0 + 0.04);
    thockGain.gain.setValueAtTime(level * 0.8, t0);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    thock.connect(thockGain).connect(ctx.destination);
    thock.start(t0);
    thock.stop(t0 + 0.06);
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
