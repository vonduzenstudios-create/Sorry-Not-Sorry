import type { Song } from '../sequencer';

/** Themes for Beam Hop and Hot Fuse. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Beam Hop: driving synth arpeggios in A minor, laser-lab energy. */
export const beamHopTheme: Song = {
  name: 'Beam Hop',
  bpm: 138,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pulse',
      volume: 0.16,
      pattern: [
        'A4 . C5 . E5 . A5 . G5 . E5 . C5 . D5 .',
        'F4 . A4 . C5 . F5 . E5 . C5 . A4 . C5 .',
        'G4 . B4 . D5 . G5 . F5 . D5 . B4 . D5 .',
        'E4 . G#4 . B4 . E5 . G#5 - - . E5 . . .',
      ].join(' '),
    },
    { instrument: 'saw', volume: 0.06, pattern: repeat('A5 E5 A5 E5 A5 E5 A5 E5 A5 E5 A5 E5 A5 E5 A5 E5', 1) + ' ' + repeat('F5 C5 F5 C5 F5 C5 F5 C5 F5 C5 F5 C5 F5 C5 F5 C5', 1) + ' ' + repeat('G5 D5 G5 D5 G5 D5 G5 D5 G5 D5 G5 D5 G5 D5 G5 D5', 1) + ' ' + repeat('E5 B4 E5 B4 E5 B4 E5 B4 G#5 E5 G#5 E5 G#5 E5 G#5 E5', 1) },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A1 . A2 . A1 . A2 . A1 . A2 . A1 . A2 .',
        'F1 . F2 . F1 . F2 . F1 . F2 . F1 . F2 .',
        'G1 . G2 . G1 . G2 . G1 . G2 . G1 . G2 .',
        'E1 . E2 . E1 . E2 . E1 . E2 . E2 . E1 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.2, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('. . x . . . x . . . x . . . x x', 4) },
  ],
};

/** Hot Fuse: frantic ragtime-ish chase in G with a ticking woodblock feel. */
export const hotFuseTheme: Song = {
  name: 'Hot Fuse',
  bpm: 172,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.13,
      pattern: [
        'G4 . B4 . D5 . G5 . F#5 . E5 . D5 . B4 .',
        'C5 . E5 . G5 . E5 . D5 . C5 . B4 . A4 .',
        'G4 . B4 . D5 . G5 . A5 . G5 . F#5 . E5 .',
        'D5 . F#5 . A5 . C6 . B5 - - . G5 . . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.16,
      pattern: [
        '. . D4 . . . D4 . . . D4 . . . D4 .',
        '. . E4 . . . E4 . . . E4 . . . E4 .',
        '. . D4 . . . D4 . . . C4 . . . C4 .',
        '. . F#4 . . . F#4 . . . D4 . . . D4 .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'G2 . . . D2 . . . G2 . . . D2 . . .',
        'C2 . . . G2 . . . C2 . . . G2 . . .',
        'G2 . . . D2 . . . E2 . . . C2 . . .',
        'D2 . . . A2 . . . D2 . . . G1 . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x . x . x . x . x . x . x . x .', 4) },
    { instrument: 'snare', volume: 0.18, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
  ],
};
