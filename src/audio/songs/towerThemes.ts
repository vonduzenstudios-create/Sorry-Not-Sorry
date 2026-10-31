import type { Song } from '../sequencer';

/** Themes for Hammer Drop and Sniper Tower. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Hammer Drop: stomping anvil march in G minor, bells for the clangs. */
export const hammerTheme: Song = {
  name: 'Hammer Drop',
  bpm: 132,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.14,
      pattern: [
        'G4 . . G4 Bb4 . . . D5 . C5 . Bb4 . A4 .',
        'G4 . . G4 Bb4 . . . F5 - - - D5 . . .',
        'Eb5 . . D5 C5 . . . D5 . . C5 Bb4 . A4 .',
        'Bb4 . A4 . G4 . F#4 . G4 - - - . . . .',
      ].join(' '),
    },
    { instrument: 'bell', volume: 0.14, pattern: repeat('G5 . . . . . . . . . . . . . . .', 3) + ' ' + 'D6 . . . . . . . D6 . . . . . . .' },
    {
      instrument: 'bass',
      volume: 0.48,
      pattern: [
        'G1 . G2 . G1 . G2 . G1 . G2 . F1 . F2 .',
        'Eb1 . Eb2 . Eb1 . Eb2 . D1 . D2 . D1 . D2 .',
        'C2 . C3 . C2 . C3 . G1 . G2 . G1 . G2 .',
        'D2 . D3 . D2 . D3 . G1 . G2 . D2 . F#2 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.85, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.3, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.06, pattern: repeat('x . x . x . x . x . x . x . x .', 4) },
  ],
};

/** Sniper Tower: sneaky spaghetti-western stalk in A minor with a whistling pulse lead. */
export const sniperTheme: Song = {
  name: 'Sniper Tower',
  bpm: 108,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pulse',
      volume: 0.13,
      pattern: [
        'A4 . . E5 . . A5 - - - G5 . E5 . . .',
        'D5 . . F5 . . E5 - - - C5 . B4 . . .',
        'A4 . . E5 . . A5 - - - B5 . C6 . B5 .',
        'A5 . G5 . E5 . D5 . E5 - - - - - . .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.16, pattern: repeat('A3 . E4 . A3 . E4 . A3 . E4 . G3 . D4 .', 2) + ' ' + 'F3 . C4 . F3 . C4 . E3 . B3 . E3 . G#3 .' + ' ' + 'A3 . E4 . A3 . E4 . A3 . . . . . . .' },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A1 . . . . . A1 . E2 . . . . . . .',
        'D2 . . . . . D2 . E2 . . . . . . .',
        'F2 . . . . . F2 . E2 . . . . . E2 .',
        'A1 . . . E2 . . . A1 . . . . . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'hat', volume: 0.09, pattern: repeat('. . x . . . x x . . x . . . x .', 4) },
    { instrument: 'snare', volume: 0.12, pattern: repeat('. . . . . . . . . . . . x . . .', 4) },
  ],
};
