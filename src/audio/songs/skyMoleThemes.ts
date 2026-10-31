import type { Song } from '../sequencer';

/** Themes for Sky Glider and Mole Bonk. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Sky Glider: airy waltz-time breeze in G, bell lead over soft pads. */
export const gliderTheme: Song = {
  name: 'Sky Glider',
  bpm: 132,
  stepsPerBeat: 2,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.26,
      pattern: [
        'D5 . G5 . B5 . A5 . G5 . D5 .',
        'E5 . G5 . C6 . B5 - - . A5 .',
        'D5 . F#5 . A5 . G5 . F#5 . E5 .',
        'D5 . E5 . F#5 . G5 - - - - .',
      ].join(' '),
    },
    {
      instrument: 'pad',
      volume: 0.14,
      pattern: [
        'G3 - - - - - - - - - - -',
        'C4 - - - - - - - - - - -',
        'D4 - - - - - - - - - - -',
        'G3 - - - - - - D4 - - - -',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.34,
      pattern: [
        'G2 . . . D3 . . . D3 . . .',
        'C3 . . . G3 . . . G3 . . .',
        'D3 . . . A3 . . . A3 . . .',
        'G2 . . . D3 . . . B2 . . .',
      ].join(' '),
    },
    { instrument: 'hat', volume: 0.08, pattern: repeat('. . x . x . . . x . x .', 4) },
    { instrument: 'kick', volume: 0.4, pattern: repeat('x . . . . . x . . . . .', 4) },
  ],
};

/** Mole Bonk: bouncy garden two-step in C, plucky lead and a cheeky bassline. */
export const moleTheme: Song = {
  name: 'Mole Bonk',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pluck',
      volume: 0.3,
      pattern: [
        'C5 . . E5 . . G5 . A5 . G5 . E5 . . .',
        'F5 . . A5 . . G5 . E5 . C5 . D5 . . .',
        'C5 . . E5 . . G5 . C6 . B5 . A5 . G5 .',
        'F5 . E5 . D5 . B4 . C5 - - . . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'C2 . . . G2 . C3 . C2 . . . G2 . E2 .',
        'F2 . . . C3 . F2 . G2 . . . D3 . G2 .',
        'C2 . . . G2 . C3 . A2 . . . E3 . A2 .',
        'F2 . . . G2 . . . C2 . G2 . C3 . . .',
      ].join(' '),
    },
    { instrument: 'square', volume: 0.07, pattern: repeat('. . E4 . . . G4 . . . E4 . . . G4 .', 2) + ' ' + repeat('. . E4 . . . A4 . . . F4 . . . G4 .', 2) },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.22, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x . x . x . x . x . x . x . x .', 4) },
  ],
};
