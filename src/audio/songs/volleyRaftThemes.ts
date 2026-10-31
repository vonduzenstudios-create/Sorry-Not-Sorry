import type { Song } from '../sequencer';

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Volley Bash: sunny surf-rock shuffle in A, twangy pluck lead over a bouncing bass. */
export const volleyTheme: Song = {
  name: 'Volley Bash',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pluck',
      volume: 0.3,
      pattern: [
        'E5 . E5 . C#5 . E5 . F#5 . E5 . C#5 . A4 .',
        'D5 . D5 . B4 . D5 . E5 . D5 . B4 . . .',
        'E5 . E5 . C#5 . E5 . A5 . G#5 . F#5 . E5 .',
        'D5 . B4 . G#4 . B4 . A4 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A2 . A2 . C#3 . E3 . A2 . A2 . E3 . C#3 .',
        'D2 . D2 . F#2 . A2 . D2 . D2 . A2 . F#2 .',
        'A2 . A2 . C#3 . E3 . F#2 . F#2 . A2 . C#3 .',
        'E2 . E2 . G#2 . B2 . A2 . E2 . A2 . . .',
      ].join(' '),
    },
    {
      instrument: 'square',
      volume: 0.07,
      pattern: [
        repeat('. . C#4 . . . C#4 . . . C#4 . . . C#4 .', 1),
        repeat('. . D4 . . . D4 . . . D4 . . . D4 .', 1),
        repeat('. . C#4 . . . C#4 . . . F#4 . . . F#4 .', 1),
        repeat('. . E4 . . . E4 . . . C#4 . . . C#4 .', 1),
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.22, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x . x x x . x x x . x x x . x x', 4) },
  ],
};

/** Raft Rally: rowing chant in D, steady tom-like kick on every stroke and a hearty reed call. */
export const raftTheme: Song = {
  name: 'Raft Rally',
  bpm: 128,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'reed',
      volume: 0.2,
      pattern: [
        'D5 . . . A4 . . . D5 . E5 . F#5 . . .',
        'G5 . . . F#5 . E5 . D5 . . . A4 . . .',
        'B4 . . . D5 . . . G5 . F#5 . E5 . . .',
        'F#5 . E5 . D5 . C#5 . D5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'D2 . . . D2 . . . A1 . . . A1 . . .',
        'G1 . . . G1 . . . D2 . . . D2 . . .',
        'G1 . . . G1 . . . E2 . . . E2 . . .',
        'A1 . . . A1 . . . D2 . . . D2 . . .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.12, pattern: repeat('. . F#4 A4 . . F#4 A4 . . G4 B4 . . F#4 A4', 4) },
    { instrument: 'kick', volume: 0.65, pattern: repeat('x . . . . . . . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.18, pattern: repeat('. . . . . . . . . . . . x . x .', 4) },
    { instrument: 'hat', volume: 0.06, pattern: repeat('. . x . . . x . . . x . . . x .', 4) },
  ],
};
