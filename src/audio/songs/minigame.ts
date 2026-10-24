import type { Song } from '../sequencer';

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Free-for-all: fast, bouncy chase in G major, I-V-vi-IV. */
const chaseChords = ['G', 'D', 'Em', 'C'];
const chaseBass: Record<string, string> = {
  G: 'G2 . G3 . G2 . G3 . G2 . G3 . D3 . G3 .',
  D: 'D2 . D3 . D2 . D3 . D2 . D3 . A2 . D3 .',
  Em: 'E2 . E3 . E2 . E3 . E2 . E3 . B2 . E3 .',
  C: 'C3 . C3 . G2 . C3 . C3 . C3 . G2 . E3 .',
};
const chaseArp: Record<string, string> = {
  G: 'G4 B4 D5 B4 G4 B4 D5 B4 G4 B4 D5 B4 G4 B4 D5 G5',
  D: 'D4 F#4 A4 F#4 D4 F#4 A4 F#4 D4 F#4 A4 F#4 D4 F#4 A4 D5',
  Em: 'E4 G4 B4 G4 E4 G4 B4 G4 E4 G4 B4 G4 E4 G4 B4 E5',
  C: 'C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 C5',
};
const chaseMelody = [
  'D5 - G5 - B5 - A5 G5 - - E5 - D5 - . .',
  'F#5 - A5 - D6 - C6 A5 - - F#5 - D5 - . .',
  'E5 - G5 - B5 - G5 E5 - - D5 - B4 - . .',
  'C5 - E5 - G5 - A5 G5 - - E5 - D5 - . .',
].join(' ');

export const chaseTheme: Song = {
  name: 'Minigame (FFA)',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    { instrument: 'pulse', volume: 0.18, pattern: chaseMelody },
    { instrument: 'triangle', volume: 0.1, pattern: chaseChords.map((c) => chaseArp[c]).join(' ') },
    { instrument: 'bass', volume: 0.4, pattern: chaseChords.map((c) => chaseBass[c]).join(' ') },
    { instrument: 'kick', volume: 0.7, pattern: repeat('x . . . x . . . x . . . x . . .', 4) },
    { instrument: 'snare', volume: 0.3, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x x x x x x x x x x x x x x x x', 4) },
  ],
};

/** Team games: tense, driving A minor riff. */
const tenseBass = repeat('A2 . A2 A3 . A2 . A2 G2 . G2 G3 . G2 F2 E2', 2) + ' ' + repeat('F2 . F2 F3 . F2 . F2 E2 . E2 E3 . E2 G#2 E2', 2);
const tenseLead = [
  'A4 - - C5 - - E5 - D5 - C5 - B4 - G4 -',
  'A4 - - C5 - - E5 - G5 - F5 - E5 - - -',
  'F5 - - E5 - - D5 - C5 - D5 - E5 - - -',
  'E5 - - D5 - - C5 - B4 - G#4 - E4 - - -',
].join(' ');

export const tenseTheme: Song = {
  name: 'Minigame (teams)',
  bpm: 138,
  stepsPerBeat: 4,
  tracks: [
    { instrument: 'saw', volume: 0.12, pattern: tenseLead },
    { instrument: 'bass', volume: 0.45, pattern: tenseBass },
    { instrument: 'kick', volume: 0.7, pattern: repeat('x . . x . . x . x . . x . . x .', 4) },
    { instrument: 'snare', volume: 0.32, pattern: repeat('. . . . x . . . . . . . x . x .', 4) },
    { instrument: 'hat', volume: 0.09, pattern: repeat('x . x x x . x x x . x x x . x x', 4) },
  ],
};
