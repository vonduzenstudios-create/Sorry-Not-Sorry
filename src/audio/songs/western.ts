import type { Song } from '../sequencer';

/**
 * Dusty Gulch: a bouncy cowboy two-step in G. Harmonica-ish reed lead,
 * banjo-style pluck rolls and a boom-chick bass. Sixteen bars of eighths.
 */
const chords = ['G', 'G', 'C', 'G', 'D', 'D', 'G', 'G', 'C', 'C', 'G', 'Em', 'A', 'A', 'D', 'D'];

const melody = [
  'D5 - B4 D5 G5 - D5 B4',
  'A4 - B4 G4 - - . D4',
  'E4 - G4 C5 E5 - D5 C5',
  'B4 - D5 - - - . .',
  'A4 - F#4 A4 D5 - C5 A4',
  'B4 - A4 F#4 - - D4 .',
  'G4 - B4 D5 G5 - F#5 E5',
  'D5 - - - . . D5 E5',
  'G5 - E5 C5 E5 - G5 E5',
  'D5 - C5 A4 - - C5 .',
  'B4 - D5 G5 B5 - A5 G5',
  'G5 - E5 - B4 - . .',
  'A4 - C#5 E5 A5 - G5 E5',
  'E5 - C#5 A4 - - A4 B4',
  'C#5 - D5 E5 F#5 - E5 F#5',
  'A5 - - - D5 - . .',
].join(' ');

const root: Record<string, [string, string]> = {
  G: ['G2', 'D3'],
  C: ['C3', 'G2'],
  D: ['D3', 'A2'],
  Em: ['E2', 'B2'],
  A: ['A2', 'E3'],
};

const triad: Record<string, [string, string, string]> = {
  G: ['G4', 'B4', 'D5'],
  C: ['G4', 'C5', 'E5'],
  D: ['F#4', 'A4', 'D5'],
  Em: ['G4', 'B4', 'E5'],
  A: ['E4', 'A4', 'C#5'],
};

/** Boom-chick: root on 1, fifth on 3. */
const bass = chords.map((c) => `${root[c][0]} . . . ${root[c][1]} . . .`).join(' ');

/** Banjo roll: cycle through the chord tones every eighth. */
const roll = chords
  .map((c) => {
    const [a, b, d] = triad[c];
    return `${a} ${b} ${d} ${b} ${a} ${d} ${b} ${d}`;
  })
  .join(' ');

const repeat = (bar: string) => Array(16).fill(bar).join(' ');

export const westernTheme: Song = {
  name: 'Dusty Gulch',
  bpm: 132,
  stepsPerBeat: 2,
  tracks: [
    { instrument: 'reed', volume: 0.17, pattern: melody },
    { instrument: 'pluck', volume: 0.08, pattern: roll },
    { instrument: 'bass', volume: 0.45, pattern: bass },
    { instrument: 'kick', volume: 0.45, pattern: repeat('x . . . x . . .') },
    { instrument: 'snare', volume: 0.18, pattern: repeat('. . x . . . x x') },
    { instrument: 'hat', volume: 0.06, pattern: repeat('. x . x . x . x') },
  ],
};
