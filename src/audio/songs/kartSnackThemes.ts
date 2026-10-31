import type { Song } from '../sequencer';

/** Themes for Kart Clash and Snack Attack. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Kart Clash: revving surf-rock chase in A minor, saw lead over driving eighths. */
export const kartTheme: Song = {
  name: 'Kart Clash',
  bpm: 158,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.14,
      pattern: [
        'A4 . . A4 C5 . E5 . D5 . C5 . A4 . G4 .',
        'A4 . . A4 C5 . E5 . G5 - - . E5 . . .',
        'F4 . . F4 A4 . C5 . B4 . A4 . G4 . E4 .',
        'E4 . G#4 . B4 . D5 . E5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        repeat('A2 . A2 . A2 . A2 .', 2),
        repeat('A2 . A2 . G2 . G2 .', 2),
        repeat('F2 . F2 . F2 . F2 .', 2),
        repeat('E2 . E2 . E2 . G#2 .', 2),
      ].join(' '),
    },
    { instrument: 'pulse', volume: 0.07, pattern: repeat('. . E5 . . . E5 . . . E5 . . . E5 .', 2) + ' ' + repeat('. . C5 . . . C5 . . . B4 . . . B4 .', 2) },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.24, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x . x . x . x . x . x . x . x .', 4) },
  ],
};

/** Snack Attack: bouncy picnic tune in G, bell and pluck call-and-response. */
export const snackTheme: Song = {
  name: 'Snack Attack',
  bpm: 132,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.22,
      pattern: [
        'G5 . D5 . B4 . D5 . G5 . A5 . B5 . . .',
        'C6 . B5 . A5 . G5 . A5 - - . . . . .',
        'E5 . G5 . C6 . B5 . A5 . G5 . F#5 . . .',
        'G5 . D5 . F#5 . A5 . G5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.16,
      pattern: repeat('. . . . . . . . . . . . D5 E5 F#5 .', 1) + ' ' + repeat('. . . . . . . . . . . . E5 D5 C5 .', 1) + ' ' + repeat('. . . . . . . . . . . . A4 B4 C5 .', 1) + ' ' + repeat('. . . . . . . . . . . . D5 C5 B4 .', 1),
    },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        'G2 . . . D3 . . . G2 . . . D3 . B2 .',
        'C3 . . . G2 . . . D3 . . . A2 . . .',
        'C3 . . . G2 . . . A2 . . . D3 . . .',
        'G2 . . . D3 . . . G2 . D2 . G2 . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . . . . . . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.18, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
    { instrument: 'hat', volume: 0.06, pattern: repeat('. . x . . . x . . . x . . . x .', 4) },
  ],
};
