import type { Song } from '../sequencer';

/** Themes for Ghost Hunt and Bridge Burn. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Ghost Hunt: creepy tiptoe waltz in D minor, music box over a low pad. */
export const ghostTheme: Song = {
  name: 'Ghost Hunt',
  bpm: 132,
  stepsPerBeat: 2,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.22,
      pattern: [
        'D5 . F5 A5 . G5', 'F5 . E5 D5 . .', 'C#5 . E5 A5 . G5', 'F5 E5 D5 C#5 . .',
        'D5 . F5 A5 . D6', 'C6 . A5 Bb5 . G5', 'F5 . A5 E5 . C#5', 'D5 - - . . .',
      ].join(' '),
    },
    { instrument: 'pad', volume: 0.1, pattern: 'D4 - - - - - D4 - - - - - A3 - - - - - A3 - - - - - Bb3 - - - - - G3 - - - - - A3 - - - - - D4 - - - - -' },
    {
      instrument: 'pluck',
      volume: 0.16,
      pattern: [
        'D3 . A3 . A3 .', 'D3 . A3 . A3 .', 'A2 . E3 . G3 .', 'A2 . E3 . G3 .',
        'Bb2 . F3 . F3 .', 'G2 . D3 . Bb3 .', 'A2 . E3 . C#4 .', 'D3 . A3 . D4 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.4, pattern: repeat('x . . . . .', 8) },
    { instrument: 'hat', volume: 0.06, pattern: repeat('. . x . x .', 8) },
  ],
};

/** Bridge Burn: galloping A minor scramble with a sizzling saw lead. */
export const bridgeTheme: Song = {
  name: 'Bridge Burn',
  bpm: 170,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.1,
      pattern: [
        'A4 . A4 . C5 . E5 . D5 . C5 . B4 . G4 .',
        'A4 . A4 . C5 . E5 . G5 . F5 . E5 . . .',
        'F5 . E5 . D5 . F5 . E5 . D5 . C5 . E5 .',
        'D5 . C5 . B4 . G#4 . A4 - - - . . . .',
      ].join(' '),
    },
    { instrument: 'square', volume: 0.06, pattern: repeat('. . E5 . . . E5 . . . E5 . . . E5 .', 2) + ' ' + repeat('. . D5 . . . D5 . . . C5 . . . C5 .', 1) + ' ' + repeat('. . B4 . . . B4 . . . C5 . . . C5 .', 1) },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'A1 . A2 . A1 . A2 . G1 . G2 . G1 . G2 .',
        'F1 . F2 . F1 . F2 . C2 . C3 . C2 . C3 .',
        'D2 . D3 . D2 . D3 . A1 . A2 . A1 . A2 .',
        'E2 . E3 . E2 . E3 . A1 . A2 . E2 . E3 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.7, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.25, pattern: repeat('. . . . x . . . . . . . x . . .', 3) + ' ' + '. . . . x . . . x . x . x x x x' },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x x x x x x x x x x x x x x x x', 4) },
  ],
};
