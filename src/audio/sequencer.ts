import type { AudioEngine } from './engine';
import { noteToFreq, playVoice, type Instrument } from './synth';

/**
 * Songs are written as text patterns, one token per step:
 *   "C5"  play a note       "."  rest       "-"  hold the previous note
 *   "x"   hit (drum tracks, pitch ignored)
 * Bars are just whitespace; the pattern loops over the song length.
 */
export interface Track {
  instrument: Instrument;
  volume: number;
  pattern: string;
}

export interface Song {
  name: string;
  bpm: number;
  /** Steps per beat (4 = sixteenth notes). */
  stepsPerBeat: number;
  tracks: Track[];
}

interface CompiledNote {
  step: number;
  length: number;
  freq: number;
}

interface CompiledTrack {
  instrument: Instrument;
  volume: number;
  notes: CompiledNote[];
  length: number;
}

function compile(track: Track): CompiledTrack {
  const tokens = track.pattern.trim().split(/\s+/);
  const notes: CompiledNote[] = [];
  tokens.forEach((tok, step) => {
    if (tok === '.') return;
    if (tok === '-') {
      const last = notes[notes.length - 1];
      if (last && last.step + last.length === step) last.length++;
      return;
    }
    notes.push({ step, length: 1, freq: tok === 'x' ? 0 : noteToFreq(tok) });
  });
  return { instrument: track.instrument, volume: track.volume, notes, length: tokens.length };
}

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

/** Look-ahead scheduler: a timer queues notes slightly ahead of the audio clock. */
export class Sequencer {
  private timer: number | null = null;
  private tracks: CompiledTrack[] = [];
  private stepDur = 0;
  private songLength = 1;
  private nextStep = 0;
  private nextTime = 0;

  constructor(private engine: AudioEngine) {}

  play(song: Song): void {
    this.stop();
    const ctx = this.engine.ctx!;
    this.tracks = song.tracks.map(compile);
    this.songLength = Math.max(...this.tracks.map((t) => t.length));
    this.stepDur = 60 / song.bpm / song.stepsPerBeat;
    this.nextStep = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const ctx = this.engine.ctx!;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      const step = this.nextStep % this.songLength;
      for (const track of this.tracks) {
        const local = step % track.length;
        for (const n of track.notes) {
          if (n.step !== local) continue;
          playVoice(this.engine, this.engine.music, {
            instrument: track.instrument,
            freq: n.freq,
            time: this.nextTime,
            duration: n.length * this.stepDur * 0.92,
            volume: track.volume,
          });
        }
      }
      this.nextStep++;
      this.nextTime += this.stepDur;
    }
  }
}
