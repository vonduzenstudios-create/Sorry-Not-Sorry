import type { Song } from '../sequencer';

/** Themes for Rocket Rodeo and Lava Rise. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Rocket Rodeo: galloping space-western in A minor, twangy pulse lead over a saw drone. */
export const rocketTheme: Song = {
  name: 'Rocket Rodeo',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pulse',
      volume: 0.22,
      pattern: [
        'A4 . . C5 E5 . A5 . G5 . E5 . D5 . C5 .',
        'D5 . . F5 A5 . G5 . F5 . E5 . D5 - - .',
        'E5 . . G5 B5 . A5 . G5 . E5 . G5 . A5 .',
        'E5 . D5 . C5 . B4 . A4 - - - . . E4 .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A1 . . A2 E2 . . A2 A1 . . A2 E2 . . A2',
        'D2 . . D3 A2 . . D3 D2 . . D3 A2 . . D3',
        'C2 . . C3 G2 . . C3 G1 . . G2 D2 . . G2',
        'E2 . . E3 B2 . . E3 A1 . . A2 E2 . . A2',
      ].join(' '),
    },
    { instrument: 'saw', volume: 0.05, pattern: 'A3 - - - - - - - - - - - - - - - D4 - - - - - - - - - - - - - - - C4 - - - - - - - G3 - - - - - - - E3 - - - - - - - A3 - - - - - - -' },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . x . . x . x . . x . . x .', 4) },
    { instrument: 'snare', volume: 0.2, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.08, pattern: repeat('x x . x x x . x x x . x x x . x', 4) },
  ],
};

/** Lava Rise: rumbling, climbing chromatic riff in E minor that pushes upward. */
export const lavaTheme: Song = {
  name: 'Lava Rise',
  bpm: 132,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.16,
      pattern: [
        'E5 . E5 . G5 . E5 . A5 . G5 . F#5 . E5 .',
        'F5 . F5 . A5 . F5 . Bb5 . A5 . G5 . F5 .',
        'F#5 . F#5 . A5 . F#5 . B5 . A5 . G#5 . F#5 .',
        'G5 . A5 . B5 . C6 . D6 - - - B5 . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'E2 E2 . E2 . E2 G2 . E2 E2 . E2 A2 . G2 .',
        'F2 F2 . F2 . F2 A2 . F2 F2 . F2 Bb2 . A2 .',
        'F#2 F#2 . F#2 . F#2 A2 . F#2 F#2 . F#2 B2 . A2 .',
        'G2 G2 . G2 A2 A2 . A2 B2 B2 . B2 B1 . . .',
      ].join(' '),
    },
    { instrument: 'pad', volume: 0.07, pattern: 'E4 - - - - - - - - - - - - - - - F4 - - - - - - - - - - - - - - - F#4 - - - - - - - - - - - - - - - G4 - - - - - - - B4 - - - - - - -' },
    { instrument: 'kick', volume: 0.65, pattern: repeat('x . . . x . . x x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.22, pattern: repeat('. . . . x . . . . . . . x . x .', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x . x . x . x . x . x . x . x x', 4) },
  ],
};
