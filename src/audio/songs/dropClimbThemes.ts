import type { Song } from '../sequencer';

/** Themes for Color Drop and Crate Climb. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Color Drop: a bright game-show shuffle in A major, bell lead over a ticking hat. */
export const colorDropTheme: Song = {
  name: 'Color Drop',
  bpm: 144,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.2,
      pattern: [
        'E5 . A5 . C#6 . A5 . B5 . G#5 . E5 . . .',
        'F#5 . A5 . D6 . C#6 . B5 - - . A5 . . .',
        'E5 . A5 . C#6 . E6 . D6 . B5 . G#5 . . .',
        'A5 . G#5 . F#5 . E5 . A5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.16,
      pattern: [
        'A4 C#5 E5 C#5 A4 C#5 E5 C#5 E4 G#4 B4 G#4 E4 G#4 B4 G#4',
        'D4 F#4 A4 F#4 D4 F#4 A4 F#4 E4 G#4 B4 G#4 E4 G#4 B4 G#4',
        'A4 C#5 E5 C#5 A4 C#5 E5 C#5 B3 D4 F#4 D4 E4 G#4 B4 G#4',
        'D4 F#4 A4 F#4 E4 G#4 B4 G#4 A4 C#5 E5 C#5 A4 . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A2 . . A2 . . A3 . E2 . . E2 . . E3 .',
        'D2 . . D2 . . D3 . E2 . . E2 . . E3 .',
        'A2 . . A2 . . A3 . B2 . . B2 . E3 E2',
        'D2 . . D3 . E2 . E3 A2 . . . A2 . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.65, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.26, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x . x x x . x x x . x x x . x x', 4) },
  ],
};

/** Crate Climb: a stomping dockyard work song in E minor, reed and saw trading lines. */
export const crateClimbTheme: Song = {
  name: 'Crate Climb',
  bpm: 132,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'reed',
      volume: 0.18,
      pattern: [
        'E4 . G4 . B4 - - . A4 . G4 . F#4 . E4 .',
        'D4 . F#4 . A4 - - . G4 . F#4 . E4 . D4 .',
        'E4 . G4 . B4 . E5 . D5 . B4 . A4 . G4 .',
        'F#4 . A4 . B4 - - - E4 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'saw',
      volume: 0.07,
      pattern: [
        '. . . . . . . . E5 . D5 . B4 . . .',
        '. . . . . . . . D5 . C5 . A4 . . .',
        '. . . . . . . . G5 . F#5 . E5 . . .',
        '. . . . . . . . F#5 . D#5 . E5 . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'E2 . E2 . E3 . E2 . C2 . C2 . C3 . C2 .',
        'D2 . D2 . D3 . D2 . G2 . G2 . G3 . G2 .',
        'E2 . E2 . E3 . E2 . A2 . A2 . C3 . A2 .',
        'B1 . B1 . B2 . B1 . E2 . E2 . E3 . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.75, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.32, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
    { instrument: 'hat', volume: 0.08, pattern: repeat('x . x . x . x . x . x . x . x x', 4) },
  ],
};
