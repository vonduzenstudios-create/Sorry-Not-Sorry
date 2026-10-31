import type { Song } from '../sequencer';

/** Themes for Chomp Chase and Wall Smash. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Chomp Chase: sneaky, bouncy creature chase in C minor. */
export const chompTheme: Song = {
  name: 'Chomp Chase',
  bpm: 152,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.14,
      pattern: [
        'C5 . . Eb5 . . G5 . F#5 . G5 . Eb5 . C5 .',
        'Bb4 . . D5 . . F5 . E5 . F5 . D5 . Bb4 .',
        'Ab4 . C5 . Eb5 . Ab5 . G5 . F5 . Eb5 . D5 .',
        'G4 . B4 . D5 . F5 . Eb5 . D5 . C5 - - .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.44,
      pattern: [
        'C2 . C3 . C2 . C3 . C2 . C3 . Bb2 . G2 .',
        'Bb1 . Bb2 . Bb1 . Bb2 . Bb1 . Bb2 . A2 . F2 .',
        'Ab1 . Ab2 . Ab1 . Ab2 . Ab1 . Ab2 . Bb2 . C3 .',
        'G1 . G2 . G1 . G2 . G1 . B2 . D3 . G2 .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.1, pattern: repeat('. . G4 . . . Eb4 . . . G4 . . . C5 .', 4) },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.24, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.09, pattern: repeat('x . x x x . x . x . x x x . x .', 4) },
  ],
};

/** Wall Smash: clanky factory march in E minor with a stomping beat. */
export const wallTheme: Song = {
  name: 'Wall Smash',
  bpm: 126,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.1,
      pattern: [
        'E4 . . . E4 . G4 . A4 . . . B4 . . .',
        'E4 . . . E4 . G4 . F#4 . . . D4 . . .',
        'C5 . . . B4 . A4 . G4 . . . A4 . B4 .',
        'E5 . . . D5 . B4 . E4 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.46,
      pattern: [
        'E2 . E2 . . . E2 . E2 . E2 . . . G2 .',
        'E2 . E2 . . . E2 . D2 . D2 . . . F#2 .',
        'C2 . C2 . . . C2 . A1 . A1 . . . B1 .',
        'B1 . B1 . . . B1 . E2 . E2 . E2 . . .',
      ].join(' '),
    },
    { instrument: 'bell', volume: 0.1, pattern: repeat('. . . . B5 . . . . . . . E5 . . .', 4) },
    { instrument: 'kick', volume: 0.65, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.26, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('. . x . . . x . . . x . . . x .', 4) },
  ],
};
