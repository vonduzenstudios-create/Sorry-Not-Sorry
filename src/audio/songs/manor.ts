import type { Song } from '../sequencer';

/**
 * Hollow Hill Manor: a tiptoeing music-box waltz in D minor. A bell melody
 * over a harpsichord oom-pah-pah, a soft organ pad and a walking bass, with a
 * high wobbly "oooo" answering every fourth bar. Sixteen bars of 3/4, written
 * in eighth notes (six steps a bar).
 */
const chords = ['Dm', 'Dm', 'Gm', 'A7', 'Dm', 'Bb', 'Gm', 'A', 'F', 'C', 'Dm', 'A7', 'Bb', 'Gm', 'A7', 'Dm'];

/** [pad, stab low, stab high] */
const tones: Record<string, [string, string, string]> = {
  Dm: ['D4', 'F4', 'A4'],
  Gm: ['D4', 'G4', 'Bb4'],
  A7: ['C#4', 'E4', 'G4'],
  A: ['C#4', 'E4', 'A4'],
  Bb: ['D4', 'F4', 'Bb4'],
  F: ['C4', 'F4', 'A4'],
  C: ['C4', 'E4', 'G4'],
};

/** Root and fifth for the bass, alternating bar to bar. */
const bassNotes: Record<string, [string, string]> = {
  Dm: ['D2', 'A1'],
  Gm: ['G1', 'D2'],
  A7: ['A1', 'E2'],
  A: ['A1', 'E2'],
  Bb: ['Bb1', 'F2'],
  F: ['F2', 'C2'],
  C: ['C2', 'G1'],
};

const bass = chords.map((c, i) => `${bassNotes[c][i % 2]} - . . . .`).join(' ');
const stabLo = chords.map((c) => `. . ${tones[c][1]} . ${tones[c][1]} .`).join(' ');
const stabHi = chords.map((c) => `. . ${tones[c][2]} . ${tones[c][2]} .`).join(' ');
const pad = chords.map((c) => `${tones[c][0]} - - - - -`).join(' ');

const melody = [
  'A4 - - - D5 E5',
  'F5 - - - E5 D5',
  'G5 - - - F5 E5',
  'E5 - C#5 - A4 .',
  'A4 - - - D5 E5',
  'F5 - - - G5 A5',
  'Bb5 - A5 - G5 -',
  'A5 - - - - .',
  'C6 - - - A5 F5',
  'G5 - - - E5 C5',
  'D5 - F5 - A5 -',
  'G5 - F5 - E5 -',
  'D5 - - - F5 Bb5',
  'A5 - G5 - F5 -',
  'E5 - C#5 - E5 -',
  'D5 - - - - .',
].join(' ');

/** The ghost choir: a long high note at the end of every fourth bar. */
const ooo = [
  '. . . . . .',
  '. . . . . .',
  '. . . . . .',
  'A5 - - - - -',
  '. . . . . .',
  '. . . . . .',
  '. . . . . .',
  'C#6 - - - - -',
  '. . . . . .',
  '. . . . . .',
  '. . . . . .',
  'E6 - - - - -',
  '. . . . . .',
  '. . . . . .',
  '. . . . . .',
  'D6 - - - - -',
].join(' ');

const repeat = (bar: string) => Array(16).fill(bar).join(' ');

export const manorTheme: Song = {
  name: 'Hollow Hill Manor',
  bpm: 150,
  stepsPerBeat: 2,
  tracks: [
    { instrument: 'bell', volume: 0.17, pattern: melody },
    { instrument: 'triangle', volume: 0.05, pattern: ooo },
    { instrument: 'pluck', volume: 0.12, pattern: stabLo },
    { instrument: 'pluck', volume: 0.1, pattern: stabHi },
    { instrument: 'pad', volume: 0.06, pattern: pad },
    { instrument: 'bass', volume: 0.38, pattern: bass },
    { instrument: 'kick', volume: 0.3, pattern: repeat('x . . . . .') },
    { instrument: 'hat', volume: 0.05, pattern: repeat('. . x . x .') },
  ],
};
