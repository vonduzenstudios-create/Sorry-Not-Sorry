import type { Song } from '../sequencer';

/** Themes for Chilly Chute and Tank Tangle. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Chilly Chute: breakneck sleigh-bell gallop in A major. */
export const chuteTheme: Song = {
  name: 'Chilly Chute',
  bpm: 172,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.24,
      pattern: [
        'E5 . A5 . C#6 . B5 . A5 . E5 . F#5 . G#5 .',
        'A5 . . . E5 . . . C#5 . E5 . A5 - - .',
        'D5 . F#5 . A5 . F#5 . E5 . G#5 . B5 . G#5 .',
        'A5 . C#6 . B5 . G#5 . A5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A2 . E2 . A2 . E2 . A2 . E2 . D2 . E2 .',
        'A2 . E2 . A2 . E2 . F#2 . C#2 . F#2 . E2 .',
        'D2 . A2 . D2 . A2 . E2 . B2 . E2 . B2 .',
        'A2 . E2 . F#2 . G#2 . A2 . . . A1 . . .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.1, pattern: repeat('. C#5 E5 . . C#5 E5 . . C#5 E5 . . D5 E5 .', 4) },
    { instrument: 'hat', volume: 0.12, pattern: repeat('x x x x x x x x x x x x x x x x', 4) },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.2, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
  ],
};

/** Tank Tangle: stomping C minor march with a brassy saw lead. */
export const tankTheme: Song = {
  name: 'Tank Tangle',
  bpm: 128,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.14,
      pattern: [
        'C4 . . C4 Eb4 . G4 . C5 - - . G4 . . .',
        'Ab4 . . Ab4 G4 . F4 . Eb4 - - . D4 . . .',
        'C4 . . C4 Eb4 . G4 . Bb4 . Ab4 . G4 . F4 .',
        'Eb4 . D4 . B3 . D4 . C4 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'C2 . . . G1 . . . C2 . . . G1 . . .',
        'Ab1 . . . Eb2 . . . Bb1 . . . F2 . . .',
        'C2 . . . G1 . . . Eb2 . . . F2 . . .',
        'G1 . . . G1 . . . C2 . G1 . C2 . . .',
      ].join(' '),
    },
    { instrument: 'square', volume: 0.06, pattern: repeat('. . G3 . . . G3 . . . Ab3 . . . G3 .', 4) },
    { instrument: 'kick', volume: 0.65, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.24, pattern: repeat('. . . . x . . x . . . . x . x x', 4) },
  ],
};
