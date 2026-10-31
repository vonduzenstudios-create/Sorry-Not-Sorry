import type { Song } from '../sequencer';

/** Themes for Jump Rope Jam and Balloon Bounce. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Jump Rope Jam: playground skip-along in G, bouncy and quick. */
export const jumpRopeTheme: Song = {
  name: 'Jump Rope Jam',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.16,
      pattern: [
        'G5 . . D5 G5 . B5 . A5 . G5 . E5 . D5 .',
        'E5 . . C5 E5 . G5 . F#5 . E5 . D5 . . .',
        'G5 . . D5 G5 . B5 . D6 . B5 . A5 . G5 .',
        'A5 . F#5 . D5 . E5 . G5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'G2 . . . D3 . . . G2 . . . D3 . . .',
        'C2 . . . G2 . . . C2 . . . G2 . . .',
        'G2 . . . D3 . . . E2 . . . B2 . . .',
        'D2 . . . A2 . . . G2 . D2 . G2 . . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.14,
      pattern: [
        '. . B4 . . . B4 . . . B4 . . . B4 .',
        '. . G4 . . . G4 . . . G4 . . . G4 .',
        '. . B4 . . . B4 . . . G4 . . . G4 .',
        '. . F#4 . . . F#4 . . . B4 . . . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.2, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('. . x . . . x . . . x . . . x .', 4) },
  ],
};

/** Balloon Bounce: floaty boing-boing waltz in Eb with a bell lead. */
export const balloonTheme: Song = {
  name: 'Balloon Bounce',
  bpm: 132,
  stepsPerBeat: 2,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.2,
      pattern: [
        'Eb5 . G5 Bb5 . G5',
        'Ab5 - - G5 . F5',
        'G5 . Bb5 Eb6 . Bb5',
        'C6 - - Bb5 . .',
        'Ab5 . C6 Ab5 . F5',
        'G5 . Bb5 G5 . Eb5',
        'F5 . Ab5 G5 . F5',
        'Eb5 - - - . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        'Eb2 . . . Bb2 .',
        'Ab2 . . . Eb2 .',
        'Eb2 . . . Bb2 .',
        'Ab2 . . . C3 .',
        'F2 . . . C3 .',
        'Eb2 . . . Bb2 .',
        'Bb2 . . . F2 .',
        'Eb2 . . . Bb2 .',
      ].join(' '),
    },
    {
      instrument: 'pad',
      volume: 0.08,
      pattern: [
        '. . G4 - Bb4 -',
        '. . Ab4 - C5 -',
        '. . G4 - Bb4 -',
        '. . Ab4 - Eb5 -',
        '. . Ab4 - C5 -',
        '. . G4 - Bb4 -',
        '. . F4 - Ab4 -',
        '. . G4 - Bb4 -',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.5, pattern: repeat('x . . . . .', 8) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('. . x . x .', 8) },
  ],
};
