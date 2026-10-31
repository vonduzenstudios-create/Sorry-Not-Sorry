import type { Song } from '../sequencer';

/** Themes for Saw Sprint and Fish Frenzy. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Saw Sprint: driving A minor gallop with a buzzing saw lead. */
export const sawTheme: Song = {
  name: 'Saw Sprint',
  bpm: 152,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.12,
      pattern: [
        'A4 . A4 C5 . A4 E5 . D5 . C5 . B4 . G4 .',
        'A4 . A4 C5 . A4 E5 . G5 . F5 . E5 - - .',
        'F4 . F4 A4 . F4 C5 . B4 . A4 . G4 . E4 .',
        'E4 . G#4 . B4 . E5 . D5 . B4 . G#4 . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A1 . A2 . A1 . A2 . A1 . A2 . G1 . G2 .',
        'A1 . A2 . A1 . A2 . C2 . C3 . D2 . D3 .',
        'F1 . F2 . F1 . F2 . G1 . G2 . G1 . G2 .',
        'E1 . E2 . E1 . E2 . E1 . E2 . E2 . G#2 .',
      ].join(' '),
    },
    { instrument: 'pulse', volume: 0.07, pattern: repeat('. . E5 . . . E5 . . . E5 . . . E5 .', 2) + ' ' + repeat('. . C5 . . . C5 . . . B4 . . . B4 .', 2) },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . x x . . . x . . x x . . .', 4) },
    { instrument: 'snare', volume: 0.22, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x x x x x x x x x x x x x x x x', 4) },
  ],
};

/** Fish Frenzy: lazy lakeside swing in G with a plucky banjo-ish lead. */
export const fishTheme: Song = {
  name: 'Fish Frenzy',
  bpm: 104,
  stepsPerBeat: 3,
  tracks: [
    {
      instrument: 'pluck',
      volume: 0.3,
      pattern: [
        'G4 . B4 D5 . B4 E5 . D5 B4 . G4',
        'A4 . C5 E5 . C5 D5 - - . . .',
        'B4 . D5 G5 . D5 E5 . C5 A4 . F#4',
        'G4 . A4 B4 . D5 G4 - - . . .',
      ].join(' '),
    },
    {
      instrument: 'reed',
      volume: 0.1,
      pattern: [
        'D4 - - - - - E4 - - - - -',
        'C4 - - - - - D4 - - - - -',
        'B3 - - - - - C4 - - A3 - -',
        'D4 - - - - - B3 - - - - -',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        'G2 . . D2 . . C2 . . D2 . .',
        'A1 . . E2 . . D2 . . A1 . .',
        'G1 . . D2 . . C2 . . A1 . .',
        'D2 . . A1 . . G1 . . D2 . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.5, pattern: repeat('x . . . . . x . . . . .', 4) },
    { instrument: 'hat', volume: 0.08, pattern: repeat('. . . x . x . . . x . x', 4) },
  ],
};
