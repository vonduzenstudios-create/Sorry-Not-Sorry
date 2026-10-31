import type { Song } from '../sequencer';

/** Themes for Fuse Frenzy and Boogie Stomp. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Fuse Frenzy: breakneck ska stomp in E minor with offbeat skanks. */
export const fuseTheme: Song = {
  name: 'Fuse Frenzy',
  bpm: 168,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.11,
      pattern: [
        'E5 . G5 . B5 . A5 G5 F#5 . E5 . D5 . E5 .',
        'G5 . F#5 . E5 . D5 . B4 - - - . . . .',
        'E5 . G5 . B5 . D6 . C6 . B5 . A5 . G5 .',
        'F#5 . G5 . A5 . F#5 . E5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'E2 . E3 . G2 . B2 . E2 . E3 . D2 . D3 .',
        'C2 . C3 . G2 . C3 . B1 . B2 . F#2 . B2 .',
        'E2 . E3 . G2 . B2 . A2 . A3 . G2 . G3 .',
        'C2 . C3 . D2 . D3 . E2 . B2 . E2 . . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.13,
      pattern: [
        repeat('. . B4 . . . B4 . . . B4 . . . A4 .', 1),
        repeat('. . G4 . . . G4 . . . F#4 . . . F#4 .', 1),
        repeat('. . B4 . . . B4 . . . C5 . . . B4 .', 1),
        repeat('. . G4 . . . A4 . . . B4 . . . B4 .', 1),
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.26, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.08, pattern: repeat('x . x x x . x x x . x x x . x x', 4) },
  ],
};

/**
 * Boogie Stomp: four-on-the-floor disco in A minor at 120 BPM. The kick lands
 * on every beat so the notes on screen line up with something you can hear.
 */
export const stompTheme: Song = {
  name: 'Boogie Stomp',
  bpm: 120,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.12,
      pattern: [
        'A5 . . C6 . . A5 . G5 . E5 . G5 . A5 .',
        '. . . . C6 . D6 . E6 . D6 . C6 . A5 .',
        'F5 . . A5 . . F5 . E5 . C5 . E5 . G5 .',
        '. . . . G5 . A5 . B5 . G5 . E5 - - .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'A2 . A3 . A2 . A3 . A2 . A3 . G2 . G3 .',
        'A2 . A3 . A2 . A3 . C3 . C4 . E3 . E2 .',
        'F2 . F3 . F2 . F3 . F2 . F3 . E2 . E3 .',
        'G2 . G3 . G2 . G3 . E2 . E3 . G2 . G#2 .',
      ].join(' '),
    },
    {
      instrument: 'pad',
      volume: 0.07,
      pattern: [
        'A4 - - - - - - - - - - - - - - -',
        'C5 - - - - - - - - - - - - - - -',
        'F4 - - - - - - - - - - - - - - -',
        'E4 - - - - - - - - - - - - - - -',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.7, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.24, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('. . x . . . x . . . x . . . x .', 4) },
  ],
};
