import { Sequencer, type Song } from './sequencer';
import { playSfx, type SfxName } from './sfx';

/**
 * WebAudio front door. Everything audible is synthesized: there are no
 * sample files. Music and SFX run through separate buses so each has its
 * own volume.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  noise!: AudioBuffer;
  private sequencer: Sequencer | null = null;
  private queuedSong: Song | null = null;

  /** Must run inside a user gesture the first time. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      // Gentle limiter so stacked SFX don't clip.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.gain.value = 0.55;
      this.music.connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.8;
      this.sfx.connect(this.master);
      this.noise = whiteNoise(ctx);
      this.sequencer = new Sequencer(this);
      if (this.queuedSong) this.sequencer.play(this.queuedSong);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  play(name: SfxName): void {
    if (this.ready) playSfx(this, name);
  }

  /** Starts a song now, or as soon as audio is unlocked. */
  playSong(song: Song): void {
    this.queuedSong = song;
    this.sequencer?.play(song);
  }

  stopSong(): void {
    this.queuedSong = null;
    this.sequencer?.stop();
  }

  setVolume(bus: 'master' | 'music' | 'sfx', value: number): void {
    if (this.ctx) this[bus].gain.value = value;
  }
}

function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
