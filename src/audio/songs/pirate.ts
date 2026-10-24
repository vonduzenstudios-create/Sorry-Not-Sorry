import type { Song } from '../sequencer';

/**
 * Pirate Cove: a sea shanty in 6/8, D minor. Six steps per bar (eighth notes),
 * three steps per beat. Sixteen bars: verse then chorus.
 */
const melodyBars = [
  // Verse: Dm C Dm A Dm C Dm-A Dm
  'A4 - D5 D5 - E5',
  'F5 - E5 C5 - -',
  'D5 - F5 A5 - F5',
  'E5 - - C#5 - -',
  'A4 - D5 D5 - E5',
  'F5 - G5 E5 - C5',
  'D5 - F5 E5 - C#5',
  'D5 - - . . A4',
  // Chorus: F C Dm A F C A Dm
  'C5 - F5 F5 - G5',
  'A5 - G5 E5 - C5',
  'F5 - E5 D5 - F5',
  'E5 - - A4 - -',
  'C5 - F5 F5 - G5',
  'A5 - C6 G5 - E5',
  'F5 - E5 C#5 - E5',
  'D5 - - . . A4',
];

const chords = ['Dm', 'C', 'Dm', 'A', 'Dm', 'C', 'Dm', 'Dm', 'F', 'C', 'Dm', 'A', 'F', 'C', 'A', 'Dm'];

const bass: Record<string, [string, string]> = {
  Dm: ['D3', 'A2'],
  C: ['C3', 'G2'],
  A: ['A2', 'E3'],
  F: ['F2', 'C3'],
};

const voicings: Record<string, [string, string, string]> = {
  Dm: ['D4', 'F4', 'A4'],
  C: ['C4', 'E4', 'G4'],
  A: ['C#4', 'E4', 'A4'],
  F: ['C4', 'F4', 'A4'],
};

/** Oom-pah-pah: root on 1, fifth on 4. */
const bassLine = chords.map((c) => `${bass[c][0]} . . ${bass[c][1]} . .`).join(' ');

/** The "pah-pah" chord stabs on the off steps. */
const stab = (v: 0 | 1 | 2) =>
  chords
    .map((c) => {
      const n = voicings[c][v];
      return `. ${n} ${n} . ${n} ${n}`;
    })
    .join(' ');

const repeat = (bar: string) => Array(16).fill(bar).join(' ');

export const pirateTheme: Song = {
  name: 'Pirate Cove',
  bpm: 108,
  stepsPerBeat: 3,
  tracks: [
    { instrument: 'reed', volume: 0.2, pattern: melodyBars.join(' ') },
    { instrument: 'bass', volume: 0.45, pattern: bassLine },
    { instrument: 'pluck', volume: 0.09, pattern: stab(0) },
    { instrument: 'pluck', volume: 0.09, pattern: stab(1) },
    { instrument: 'pluck', volume: 0.09, pattern: stab(2) },
    { instrument: 'kick', volume: 0.5, pattern: repeat('x . . x . .') },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x . x x . x') },
  ],
};
