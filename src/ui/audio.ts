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
