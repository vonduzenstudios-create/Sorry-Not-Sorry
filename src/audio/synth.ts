import type { AudioEngine } from './engine';

/**
 * Small set of synth voices shared by music and SFX. Each voice schedules
 * itself at an exact AudioContext time and cleans up after it ends.
 */
export type Instrument = 'square' | 'pulse' | 'triangle' | 'saw' | 'pluck' | 'bell' | 'bass' | 'pad' | 'kick' | 'snare' | 'hat';

export interface Voice {
  instrument: Instrument;
  freq: number;
  time: number;
  duration: number;
  volume: number;
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4", "F#5", "Bb3" -> Hz (A4 = 440). */
export function noteToFreq(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`Bad note: ${note}`);
  let semis = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  semis += (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semis - 69) / 12);
}

function envelope(g: GainNode, t: number, attack: number, peak: number, decay: number, sustain: number, end: number, release: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + attack + decay);
  g.gain.setValueAtTime(Math.max(0.0001, sustain), end);
  g.gain.exponentialRampToValueAtTime(0.0001, end + release);
}

export function playVoice(engine: AudioEngine, out: AudioNode, v: Voice): void {
  const ctx = engine.ctx!;
  const t = v.time;
  const end = t + v.duration;
  const g = ctx.createGain();
  g.connect(out);
  const vol = v.volume;

  const osc = (type: OscillatorType, freq: number, detune = 0): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    return o;
  };
  const noise = (): AudioBufferSourceNode => {
    const n = ctx.createBufferSource();
    n.buffer = engine.noise;
    n.loop = true;
    return n;
  };
  const run = (node: AudioScheduledSourceNode, stop: number) => {
    node.start(t);
    node.stop(stop);
  };

  switch (v.instrument) {
    case 'square':
    case 'triangle':
    case 'saw': {
      const o = osc(v.instrument === 'saw' ? 'sawtooth' : v.instrument, v.freq);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = v.instrument === 'saw' ? 2400 : 5000;
      o.connect(lp).connect(g);
      envelope(g, t, 0.005, vol, 0.08, vol * 0.6, end, 0.06);
      run(o, end + 0.1);
      break;
    }
    case 'pulse': {
      // Two detuned squares for a fatter chiptune lead.
      const a = osc('square', v.freq, -6);
      const b = osc('square', v.freq, 6);
      a.connect(g);
      b.connect(g);
      envelope(g, t, 0.005, vol * 0.6, 0.1, vol * 0.4, end, 0.05);
      run(a, end + 0.1);
      run(b, end + 0.1);
      break;
    }
    case 'pluck': {
      const o = osc('triangle', v.freq);
      const o2 = osc('square', v.freq * 2);
      const g2 = ctx.createGain();
      g2.gain.value = 0.15;
      o2.connect(g2).connect(g);
      o.connect(g);
      envelope(g, t, 0.002, vol, 0.25, 0.0001, t + 0.3, 0.05);
      run(o, t + 0.4);
      run(o2, t + 0.4);
      break;
    }
    case 'bell': {
      // Simple two-operator FM.
      const carrier = osc('sine', v.freq);
      const mod = osc('sine', v.freq * 3.5);
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(v.freq * 2, t);
      modGain.gain.exponentialRampToValueAtTime(1, t + 0.6);
      mod.connect(modGain).connect(carrier.frequency);
      carrier.connect(g);
      envelope(g, t, 0.002, vol, 0.6, 0.0001, t + 0.7, 0.1);
      run(carrier, t + 0.9);
      run(mod, t + 0.9);
      break;
    }
    case 'bass': {
      const o = osc('triangle', v.freq);
      const sub = osc('square', v.freq / 2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const subG = ctx.createGain();
      subG.gain.value = 0.25;
      sub.connect(subG).connect(lp);
      o.connect(lp).connect(g);
      envelope(g, t, 0.005, vol, 0.1, vol * 0.7, end, 0.04);
      run(o, end + 0.08);
      run(sub, end + 0.08);
      break;
    }
    case 'pad': {
      for (const d of [-8, 0, 8]) {
        const o = osc('sawtooth', v.freq, d);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1200;
        o.connect(lp).connect(g);
        run(o, end + 0.5);
      }
      envelope(g, t, 0.15, vol * 0.4, 0.3, vol * 0.3, end, 0.4);
      break;
    }
    case 'kick': {
      const o = osc('sine', 150);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      o.connect(g);
      envelope(g, t, 0.002, vol, 0.15, 0.0001, t + 0.16, 0.02);
      run(o, t + 0.25);
      break;
    }
    case 'snare': {
      const n = noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 0.7;
      n.connect(bp).connect(g);
      const body = osc('triangle', 190);
      const bg = ctx.createGain();
      bg.gain.value = 0.5;
      body.connect(bg).connect(g);
      envelope(g, t, 0.001, vol, 0.12, 0.0001, t + 0.13, 0.02);
      run(n, t + 0.2);
      run(body, t + 0.08);
      break;
    }
    case 'hat': {
      const n = noise();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      n.connect(hp).connect(g);
      envelope(g, t, 0.001, vol, 0.04, 0.0001, t + 0.05, 0.01);
      run(n, t + 0.08);
      break;
    }
  }
}
