import type { Song } from '../sequencer';

/** Themes for Graveyard Shift and Sword Spin. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Graveyard Shift: spooky-silly A minor shuffle, wobbly saw lead and organ pad. */
export const graveTheme: Song = {
  name: 'Graveyard Shift',
  bpm: 132,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.14,
      pattern: [
        'A4 . C5 . E5 . D#5 . E5 . . . C5 . A4 .',
        'G4 . B4 . D5 . C#5 . D5 . . . B4 . G4 .',
        'F4 . A4 . C5 . F5 . E5 . D5 . C5 . B4 .',
        'E4 . G#4 . B4 . D5 . C5 . B4 . G#4 - - .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A2 . . A2 E2 . . . A2 . . A2 E2 . G2 .',
        'G2 . . G2 D2 . . . G2 . . G2 D2 . F2 .',
        'F2 . . F2 C2 . . . F2 . . F2 C2 . D2 .',
        'E2 . . E2 B1 . . . E2 . . G#2 B2 . E2 .',
      ].join(' '),
    },
    {
      instrument: 'pad',
      volume: 0.07,
      pattern: 'A3 - - - - - - - - - - - - - - - G3 - - - - - - - - - - - - - - - F3 - - - - - - - - - - - - - - - E3 - - - - - - - - - - - - - - -',
    },
    { instrument: 'bell', volume: 0.08, pattern: repeat('. . . . . . E6 . . . . . . . . .', 3) + ' . . . . . . G#5 . . . . . B5 . . .' },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.2, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.06, pattern: repeat('x . . x x . . x x . . x x . . x', 4) },
  ],
};

/** Sword Spin: brassy heroic gallop in D major. */
export const swordTheme: Song = {
  name: 'Sword Spin',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.16,
      pattern: [
        'D5 . . A4 D5 . F#5 . A5 . . . F#5 . D5 .',
        'G5 . . E5 C#5 . E5 . A4 . . . . . . .',
        'B4 . . D5 G5 . B5 . A5 . . F#5 D5 . F#5 .',
        'E5 . . C#5 A4 . C#5 . D5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'reed',
      volume: 0.1,
      pattern: [
        'F#4 - - - A4 - - - F#4 - - - A4 - - -',
        'E4 - - - G4 - - - E4 - - - C#4 - - -',
        'D4 - - - G4 - - - F#4 - - - A4 - - -',
        'G4 - - - E4 - - - F#4 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.44,
      pattern: [
        'D2 . D3 . D2 . D3 . D2 . D3 . A1 . A2 .',
        'A1 . A2 . A1 . A2 . A1 . A2 . C#2 . E2 .',
        'G1 . G2 . G1 . G2 . D2 . D3 . F#2 . A2 .',
        'A1 . A2 . A1 . A2 . D2 . A1 . D2 . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.22, pattern: repeat('. . . . x . . . . . . . x . x x', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('. . x . . . x . . . x . . . x .', 4) },
  ],
};
