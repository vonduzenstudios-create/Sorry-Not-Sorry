import type { AudioEngine } from './engine';
import { noteToFreq, playVoice, type Instrument } from './synth';

export type SfxName = 'select' | 'confirm' | 'back' | 'coin' | 'jump' | 'star' | 'dice' | 'boom' | 'join' | 'pop';

type Step = [instrument: Instrument, note: string, offset: number, duration: number, volume: number];

/** Each SFX is a tiny score of synth hits relative to "now". */
const RECIPES: Record<Exclude<SfxName, 'jump' | 'boom' | 'dice' | 'pop'>, Step[]> = {
  select: [['square', 'A5', 0, 0.05, 0.25]],
  confirm: [
    ['square', 'C6', 0, 0.06, 0.3],
    ['square', 'G6', 0.06, 0.1, 0.3],
  ],
  back: [
    ['square', 'E5', 0, 0.06, 0.25],
    ['square', 'A4', 0.06, 0.1, 0.25],
  ],
  coin: [
    ['square', 'B5', 0, 0.06, 0.3],
    ['square', 'E6', 0.06, 0.25, 0.3],
  ],
  join: [
    ['bell', 'C6', 0, 0.2, 0.4],
    ['bell', 'E6', 0.07, 0.2, 0.4],
    ['bell', 'G6', 0.14, 0.3, 0.4],
  ],
  star: [
    ['bell', 'C6', 0, 0.2, 0.4],
    ['bell', 'E6', 0.08, 0.2, 0.4],
    ['bell', 'G6', 0.16, 0.2, 0.4],
    ['bell', 'C7', 0.24, 0.5, 0.45],
    ['pulse', 'C6', 0.24, 0.5, 0.2],
  ],
};

export function playSfx(engine: AudioEngine, name: SfxName): void {
  const ctx = engine.ctx!;
  const now = ctx.currentTime;
  const out = engine.sfx;

  if (name === 'jump') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    o.connect(g).connect(out);
    o.start(now);
    o.stop(now + 0.22);
    return;
  }

  if (name === 'boom') {
    const n = ctx.createBufferSource();
    n.buffer = engine.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, now);
    lp.frequency.exponentialRampToValueAtTime(80, now + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    n.connect(lp).connect(g).connect(out);
    n.start(now);
    n.stop(now + 0.75);
    playVoice(engine, out, { instrument: 'kick', freq: 0, time: now, duration: 0.2, volume: 1 });
    return;
  }

  if (name === 'pop') {
    // Short bright noise burst with a falling blip: balloons, paint splats, snowballs.
    const n = ctx.createBufferSource();
    n.buffer = engine.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    n.connect(hp).connect(g).connect(out);
    n.start(now);
    n.stop(now + 0.14);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, now);
    o.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    og.gain.setValueAtTime(0.3, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(og).connect(out);
    o.start(now);
    o.stop(now + 0.14);
    return;
  }

  if (name === 'dice') {
    // A rattle of short clicks that slow down.
    let t = 0;
    for (let i = 0; i < 7; i++) {
      playVoice(engine, out, { instrument: 'hat', freq: 0, time: now + t, duration: 0.03, volume: 0.5 });
      playVoice(engine, out, { instrument: 'pluck', freq: noteToFreq('E5') * (1 + i * 0.05), time: now + t, duration: 0.03, volume: 0.15 });
      t += 0.04 + i * 0.012;
    }
    return;
  }

  for (const [instrument, note, offset, duration, volume] of RECIPES[name]) {
    playVoice(engine, out, { instrument, freq: noteToFreq(note), time: now + offset, duration, volume });
  }
}
