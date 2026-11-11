import type { Song } from '../sequencer';

/**
 * Jade Temple: a bouncy jungle groove in D dorian. Breathy flute lead over
 * a marimba-ish pluck ostinato, kalimba bells on the off-beats, a walking
 * bass and a hand-drum kit with a shaker. Sixteen bars of eighths.
 */
const chords = ['Dm', 'Dm', 'C', 'Dm', 'Bb', 'C', 'Dm', 'A', 'Dm', 'F', 'C', 'G', 'Bb', 'C', 'A', 'A'];

const melody = [
  'D5 - F5 A5 G5 F5 E5 D5',
  'A4 - - C5 D5 - . .',
  'E5 - G5 E5 C5 - D5 E5',
  'F5 - E5 D5 A4 - . .',
  'D5 - F5 Bb5 A5 - F5 D5',
  'E5 - G5 - C5 - E5 G5',
  'A5 - G5 F5 E5 D5 E5 F5',
  'E5 - - - C#5 - . .',
  'A5 - A5 G5 F5 - D5 .',
  'C5 - F5 - A5 - G5 F5',
  'G5 - E5 - C5 - E5 G5',
  'B5 - A5 G5 D5 - B4 .',
  'D5 - F5 - Bb5 - A5 G5',
  'G5 - E5 - C5 - D5 E5',
  'C#5 - E5 - A5 - G5 E5',
  'A4 - - - . . . .',
].join(' ');

const tones: Record<string, [string, string, string]> = {
  Dm: ['D4', 'F4', 'A4'],
  C: ['C4', 'E4', 'G4'],
  Bb: ['D4', 'F4', 'Bb4'],
  A: ['C#4', 'E4', 'A4'],
  F: ['C4', 'F4', 'A4'],
  G: ['D4', 'G4', 'B4'],
};

const root: Record<string, [string, string]> = {
  Dm: ['D2', 'A2'],
  C: ['C2', 'G2'],
  Bb: ['Bb1', 'F2'],
  A: ['A1', 'E2'],
  F: ['F2', 'C3'],
  G: ['G1', 'D2'],
};

/** Marimba ostinato: low-high-mid bounce through the chord. */
const marimba = chords
  .map((c) => {
    const [a, b, d] = tones[c];
    return `${a} ${d} ${b} ${d} ${a} ${d} ${b} ${d}`;
  })
  .join(' ');

/** Kalimba sparkle an octave up, on the off-beats only. */
const up = (n: string) => n.replace(/\d/, (o) => String(Number(o) + 1));
const kalimba = chords
  .map((c) => {
    const [a, b, d] = tones[c];
    return `. ${up(d)} . ${up(b)} . ${up(a)} . ${up(b)}`;
  })
  .join(' ');

/** Walking bass: root, fifth, a passing octave. */
const bass = chords
  .map((c) => {
    const [r, f] = root[c];
    return `${r} - . ${r} ${f} - ${up(r)} .`;
  })
  .join(' ');

const repeat = (bar: string) => Array(16).fill(bar).join(' ');

export const jungleTheme: Song = {
  name: 'Jade Temple',
  bpm: 116,
  stepsPerBeat: 2,
  tracks: [
    { instrument: 'triangle', volume: 0.2, pattern: melody },
    { instrument: 'pluck', volume: 0.1, pattern: marimba },
    { instrument: 'bell', volume: 0.05, pattern: kalimba },
    { instrument: 'bass', volume: 0.42, pattern: bass },
    // Hand drums: a low boom, a slap that skips around, and a shaker.
    { instrument: 'kick', volume: 0.42, pattern: repeat('x . . x . . x .') },
    { instrument: 'snare', volume: 0.14, pattern: repeat('. . x . . x . x') },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x x . x x x . x') },
  ],
};
