import type { Song } from '../sequencer';

/** Themes for Pinball Panic and Magnet Mayhem. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Pinball Panic: bright arcade shuffle in A major, square lead over bell arps. */
export const pinballTheme: Song = {
  name: 'Pinball Panic',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.16,
      pattern: [
        'A4 . C#5 . E5 . A5 . G#5 . E5 . F#5 - E5 .',
        'D5 . F#5 . A5 . F#5 . E5 . C#5 . B4 - - .',
        'A4 . C#5 . E5 . A5 . B5 . A5 . G#5 . F#5 .',
        'E5 . G#5 . B5 . G#5 . A5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bell',
      volume: 0.1,
      pattern: [
        repeat('A5 E5 C#5 E5', 4),
        repeat('F#5 D5 A4 D5', 4),
        repeat('A5 E5 C#5 E5', 4),
        repeat('B5 G#5 E5 G#5', 4),
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A2 . . A2 E2 . . . A2 . . A2 E3 . C#3 .',
        'D2 . . D2 A2 . . . D2 . . D2 F#2 . A2 .',
        'A2 . . A2 E2 . . . F#2 . . F#2 C#3 . F#2 .',
        'E2 . . E2 B2 . . . E2 . G#2 . B2 . E3 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.24, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.08, pattern: repeat('x . x x x . x x x . x x x . x x', 4) },
  ],
};

/** Magnet Mayhem: clanky junkyard groove in C minor, saw riff and pulse stabs. */
export const magnetTheme: Song = {
  name: 'Magnet Mayhem',
  bpm: 126,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.12,
      pattern: [
        'C4 . C4 Eb4 . C4 G4 . F4 . Eb4 . C4 . Bb3 .',
        'C4 . C4 Eb4 . C4 G4 . Bb4 . G4 . F4 - - .',
        'Ab3 . Ab3 C4 . Ab3 Eb4 . D4 . C4 . Bb3 . G3 .',
        'G3 . B3 . D4 . F4 . G4 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'pulse',
      volume: 0.08,
      pattern: [
        '. . G4 . . . G4 . . . G4 . . . G4 .',
        '. . G4 . . . G4 . . . Bb4 . . . Bb4 .',
        '. . Eb4 . . . Eb4 . . . Eb4 . . . Eb4 .',
        '. . D4 . . . D4 . . . F4 . . . F4 .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.46,
      pattern: [
        'C2 . C2 . . C2 . . C2 . . C3 . Bb2 . .',
        'C2 . C2 . . C2 . . Eb2 . . F2 . G2 . .',
        'Ab1 . Ab1 . . Ab1 . . Ab1 . . Eb2 . Ab2 . .',
        'G1 . G1 . . G1 . . G1 . B1 . D2 . G2 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.62, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.26, pattern: repeat('. . . . x . . x . . . . x . . .', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('. . x . . . x . . . x . . x x .', 4) },
  ],
};
