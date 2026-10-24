import type { Song } from '../sequencer';

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Results fanfare in F: proud brass-ish pulse lead over F - Bb - C - F. */
const chords = ['F', 'Bb', 'Gm', 'C', 'F', 'Bb', 'C', 'F'];
const bass: Record<string, string> = {
  F: 'F2 . . F3 C3 . F2 . F2 . . F3 C3 . A2 .',
  Bb: 'Bb2 . . Bb3 F3 . Bb2 . Bb2 . . Bb3 F3 . D3 .',
  Gm: 'G2 . . G3 D3 . G2 . G2 . . G3 D3 . Bb2 .',
  C: 'C3 . . C4 G3 . C3 . C3 . . C4 G3 . E3 .',
};
const pads: Record<string, string> = {
  F: 'A4 - - - - - - - C5 - - - - - - -',
  Bb: 'Bb4 - - - - - - - D5 - - - - - - -',
  Gm: 'Bb4 - - - - - - - D5 - - - - - - -',
  C: 'G4 - - - - - - - E5 - - - - - - -',
};
const melody = [
  'C5 . F5 . A5 - - - G5 . F5 . G5 - A5 .',
  'Bb5 - - - A5 . G5 . F5 - - - D5 . . .',
  'D5 . G5 . Bb5 - - - A5 . G5 . A5 - Bb5 .',
  'C6 - - - Bb5 . A5 . G5 - - - E5 . . .',
  'C5 . F5 . A5 - - - G5 . F5 . G5 - A5 .',
  'Bb5 - - - D6 . C6 . Bb5 - - - A5 . G5 .',
  'A5 - G5 - F5 - E5 - G5 - - - C6 - - -',
  'F5 - - - - - - - . . . . . . . .',
].join(' ');

export const endingTheme: Song = {
  name: 'Results',
  bpm: 112,
  stepsPerBeat: 4,
  tracks: [
    { instrument: 'pulse', volume: 0.2, pattern: melody },
    { instrument: 'square', volume: 0.06, pattern: melody },
    { instrument: 'pad', volume: 0.12, pattern: chords.map((c) => pads[c]).join(' ') },
    { instrument: 'bass', volume: 0.42, pattern: chords.map((c) => bass[c]).join(' ') },
    { instrument: 'kick', volume: 0.65, pattern: repeat('x . . . . . x . x . . . . . . .', 8) },
    { instrument: 'snare', volume: 0.3, pattern: repeat('. . . . x . . . . . . . x . x x', 8) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x . x . x . x . x . x . x . x .', 8) },
  ],
};

/** Short snare roll for "and the winner is...". */
export const drumroll: Song = {
  name: 'Drumroll',
  bpm: 120,
  stepsPerBeat: 4,
  tracks: [{ instrument: 'snare', volume: 0.32, pattern: repeat('x x x x x x x x x x x x x x x x', 2) }],
};
