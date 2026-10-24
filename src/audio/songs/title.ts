import type { Song } from '../sequencer';

/** Bouncy title theme in C: C - Am - F - G, eight bars of sixteenth-note steps. */

const melodyA = [
  'E5 . G5 . C6 . G5 . A5 . G5 . E5 . C5 .',
  'D5 . E5 . C5 . A4 - - - . . C5 . D5 .',
  'F5 . A5 . C6 . A5 . G5 . F5 . E5 . D5 .',
];
const melody = [
  ...melodyA,
  'D5 . E5 . F5 . D5 . G5 - - - . . . .',
  ...melodyA,
  'E5 . D5 . C5 - - - C5 . . . . . . .',
].join(' ');

const bassBars: Record<string, string> = {
  C: 'C3 . C3 . G3 . C3 . C3 . C3 . G3 . E3 .',
  Am: 'A2 . A2 . E3 . A2 . A2 . A2 . E3 . C3 .',
  F: 'F2 . F2 . C3 . F2 . F2 . F2 . C3 . A2 .',
  G: 'G2 . G2 . D3 . G2 . G2 . G2 . D3 . B2 .',
};
const progression = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'];

/** Chord tones as [low, mid, high] per chord. */
const voicings: Record<string, [string, string, string]> = {
  C: ['E4', 'G4', 'C5'],
  Am: ['E4', 'A4', 'C5'],
  F: ['F4', 'A4', 'C5'],
  G: ['D4', 'G4', 'B4'],
};

/** Off-beat stabs: one chord tone on steps 2, 6, 10 and 14 of each bar. */
function stabs(voice: 0 | 1 | 2): string {
  return progression
    .map((ch) => {
      const n = voicings[ch][voice];
      return `. . ${n} . . . ${n} . . . ${n} . . . ${n} .`;
    })
    .join(' ');
}

const repeat = (bar: string, times: number) => Array(times).fill(bar).join(' ');

export const titleTheme: Song = {
  name: 'Title',
  bpm: 128,
  stepsPerBeat: 4,
  tracks: [
    { instrument: 'pulse', volume: 0.22, pattern: melody },
    { instrument: 'bass', volume: 0.45, pattern: progression.map((c) => bassBars[c]).join(' ') },
    { instrument: 'pluck', volume: 0.12, pattern: stabs(0) },
    { instrument: 'pluck', volume: 0.12, pattern: stabs(1) },
    { instrument: 'pluck', volume: 0.12, pattern: stabs(2) },
    { instrument: 'kick', volume: 0.7, pattern: repeat('x . . . . . . . x . x . . . . .', 8) },
    { instrument: 'snare', volume: 0.35, pattern: repeat('. . . . x . . . . . . . x . . .', 8) },
    { instrument: 'hat', volume: 0.12, pattern: repeat('x . x . x . x . x . x . x . x .', 8) },
  ],
};
