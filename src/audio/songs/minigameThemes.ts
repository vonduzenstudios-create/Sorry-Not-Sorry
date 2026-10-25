import type { Song } from '../sequencer';

/** One theme per minigame for the second set of ten. */

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');
const FOUR = 'x . . . x . . . x . . . x . . .';
const BACKBEAT = '. . . . x . . . . . . . x . . .';
const EIGHTHS = 'x . x . x . x . x . x . x . x .';

/** Pump Pump Pop: oom-pah circus romp in F. */
export const pumpTheme: Song = {
  name: 'Pump Pump Pop',
  bpm: 164,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pluck',
      volume: 0.32,
      pattern: [
        'C5 . A4 . C5 . F5 . E5 . D5 . C5 . . .',
        'Bb4 . G4 . Bb4 . E5 . D5 . C5 . Bb4 . . .',
        'A4 . C5 . F5 . A5 . G5 . F5 . E5 . D5 .',
        'C5 . E5 . G5 . Bb5 . A5 - - - F5 . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'F2 . . . C3 . . . F2 . . . C3 . . .',
        'C2 . . . G2 . . . C2 . . . G2 . . .',
        'F2 . . . C3 . . . Bb2 . . . D3 . . .',
        'C2 . . . G2 . . . C3 . . . F2 . . .',
      ].join(' '),
    },
    { instrument: 'square', volume: 0.08, pattern: repeat('. . A4 . . . A4 . . . A4 . . . A4 .', 1) + ' ' + repeat('. . G4 . . . G4 . . . G4 . . . G4 .', 1) + ' ' + repeat('. . A4 . . . A4 . . . D5 . . . D5 .', 1) + ' ' + repeat('. . G4 . . . Bb4 . . . A4 . . . A4 .', 1) },
    { instrument: 'kick', volume: 0.6, pattern: repeat('x . . . . . . . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.22, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
  ],
};

/** Parrot Says: sea-shanty jig in D minor, accordion lead, in triplets. */
export const parrotTheme: Song = {
  name: 'Parrot Says',
  bpm: 112,
  stepsPerBeat: 3,
  tracks: [
    {
      instrument: 'reed',
      volume: 0.2,
      pattern: [
        'D5 . A4 D5 E5 F5 E5 . D5 C5 . A4',
        'Bb4 . D5 F5 . E5 D5 . C5 A4 . .',
        'D5 . A4 D5 E5 F5 G5 . F5 E5 . C5',
        'D5 E5 F5 E5 . C#5 D5 - - . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        'D2 . . A2 . . D2 . . A2 . .',
        'Bb1 . . F2 . . C2 . . G2 . .',
        'D2 . . A2 . . G2 . . C3 . .',
        'A1 . . E2 . . D2 . . A2 . .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.12, pattern: repeat('. F4 A4 . F4 A4 . F4 A4 . E4 A4', 4) },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . . . . x . . . . .', 4) },
    { instrument: 'hat', volume: 0.08, pattern: repeat('. . x . . x . . x . . x', 4) },
  ],
};

/** Paint Panic: funky E minor groove with a chirpy square lead. */
export const paintTheme: Song = {
  name: 'Paint Panic',
  bpm: 118,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.14,
      pattern: [
        'E5 . . G5 . A5 . B5 . . A5 G5 . E5 . .',
        'D5 . . E5 . G5 . A5 . . G5 . E5 . D5 .',
        'E5 . . G5 . A5 . B5 . . D6 . B5 A5 . .',
        'G5 . A5 . G5 . E5 . D5 . E5 - - - . .',
      ].join(' '),
    },
    { instrument: 'bass', volume: 0.45, pattern: repeat('E2 . E3 . . E2 . D3 . E2 . . G2 . A2 B2', 2) + ' ' + repeat('C3 . C3 . . C2 . B2 . C3 . . D3 . B2 A2', 1) + ' ' + repeat('D3 . D2 . . D3 . F#2 . D3 . . B2 . A2 G2', 1) },
    { instrument: 'triangle', volume: 0.08, pattern: repeat('. . B4 . . . B4 . . . B4 . . B4 . .', 4) },
    { instrument: 'kick', volume: 0.65, pattern: repeat('x . . . . . x . . . x . . . . .', 4) },
    { instrument: 'snare', volume: 0.3, pattern: repeat(BACKBEAT, 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x . x x x . x . x . x x x . x .', 4) },
  ],
};

/** Sweep Leap: breakneck A major hop, hats everywhere. */
export const sweepTheme: Song = {
  name: 'Sweep Leap',
  bpm: 172,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pulse',
      volume: 0.17,
      pattern: [
        'A5 . E5 . A5 . C#6 . B5 . A5 . E5 . . .',
        'F#5 . D5 . F#5 . A5 . G#5 . F#5 . E5 . . .',
        'A5 . E5 . A5 . C#6 . E6 . D6 . C#6 . B5 .',
        'A5 . B5 . C#6 . B5 . A5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        repeat('A2 A3', 8),
        repeat('D2 D3', 8),
        repeat('F#2 F#3', 4) + ' ' + repeat('E2 E3', 4),
        repeat('A2 A3', 4) + ' ' + repeat('E2 E3', 4),
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.65, pattern: repeat(FOUR, 4) },
    { instrument: 'snare', volume: 0.28, pattern: repeat(BACKBEAT, 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x x x x x x x x x x x x x x x x', 4) },
  ],
};

/** Tug Tussle: heavy stomping march in C minor. */
export const tugTheme: Song = {
  name: 'Tug Tussle',
  bpm: 108,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.12,
      pattern: [
        'C5 - - - Eb5 - G5 - Ab5 - - - G5 - - -',
        'F5 - - - Eb5 - D5 - Eb5 - - - C5 - - -',
        'C5 - - - Eb5 - G5 - C6 - - - Bb5 - Ab5 -',
        'G5 - - - F5 - Eb5 - D5 - - - B4 - - -',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.5,
      pattern: [
        'C2 . C2 . C2 . G1 . C2 . C2 . G1 . Ab1 .',
        'F1 . F1 . F1 . C2 . Ab1 . Ab1 . Eb2 . . .',
        'C2 . C2 . C2 . G1 . Ab1 . Ab1 . F1 . . .',
        'G1 . G1 . G1 . D2 . G1 . B1 . D2 . G1 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.85, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.35, pattern: repeat('. . . . x . . . . . . . x . . .', 3) + ' ' + '. . . . x . . . x . x . x x x x' },
    { instrument: 'hat', volume: 0.07, pattern: repeat(EIGHTHS, 4) },
  ],
};

/** Treasure Haul: sunny calypso in G with steel-drum bells. */
export const treasureTheme: Song = {
  name: 'Treasure Haul',
  bpm: 126,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.3,
      pattern: [
        'B5 . . D6 . . B5 . A5 . G5 . A5 . . .',
        'C6 . . E6 . . C6 . B5 . A5 . B5 . . .',
        'D6 . . B5 . . G5 . A5 . B5 . C6 . A5 .',
        'B5 . . A5 . . G5 . D5 . . . G5 . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'G2 . . D3 . . G2 . G2 . . D3 . . B2 .',
        'C3 . . G3 . . C3 . D3 . . A2 . . D3 .',
        'G2 . . D3 . . E3 . C3 . . G2 . . D3 .',
        'D3 . . A2 . . D3 . G2 . . D3 . . G2 .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.12, pattern: repeat('. . D5 . . G5 . . . . D5 . . G5 . .', 4) },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . x . . x . x . . x . . x .', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x . x x x . x x x . x x x . x x', 4) },
  ],
};

/** Hoop Troop: laid-back swung beat in F minor. */
export const hoopTheme: Song = {
  name: 'Hoop Troop',
  bpm: 96,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'triangle',
      volume: 0.2,
      pattern: [
        'F5 . . Ab5 . . C6 . Bb5 . Ab5 . F5 . . .',
        'Eb5 . . F5 . . Ab5 . G5 . Eb5 . C5 . . .',
        'F5 . . Ab5 . . C6 . Eb6 . C6 . Bb5 . Ab5 .',
        'G5 . . F5 . . Eb5 . F5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.55,
      pattern: [
        'F2 . . . . . F2 . Ab2 . . C3 . . Bb2 .',
        'Eb2 . . . . . Eb2 . G2 . . Bb2 . . C3 .',
        'Db2 . . . . . Db2 . F2 . . Ab2 . . Bb2 .',
        'C2 . . . . . C2 . E2 . . G2 . . C3 .',
      ].join(' '),
    },
    { instrument: 'pad', volume: 0.08, pattern: 'Ab4 - - - - - - - - - - - - - - - G4 - - - - - - - - - - - - - - - F4 - - - - - - - - - - - - - - - E4 - - - - - - - - - - - - - - -' },
    { instrument: 'kick', volume: 0.75, pattern: repeat('x . . . . . . x . . x . . . . .', 4) },
    { instrument: 'snare', volume: 0.35, pattern: repeat(BACKBEAT, 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x . . x x . . x x . . x x . x x', 4) },
  ],
};

/** Peekaboo Panic: tiptoeing, spooky E minor with a creepy bell. */
export const peekabooTheme: Song = {
  name: 'Peekaboo Panic',
  bpm: 104,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pluck',
      volume: 0.3,
      pattern: [
        'E4 . G4 . B4 . . . A#4 . . . A4 . . .',
        'E4 . G4 . B4 . . . C5 . B4 . A4 . . .',
        'E4 . G4 . B4 . E5 . D#5 . . . D5 . . .',
        'C5 . B4 . A4 . F#4 . G4 . F#4 . D#4 . . .',
      ].join(' '),
    },
    { instrument: 'bell', volume: 0.12, pattern: 'B5 . . . . . . . . . . . . . . . . . . . . . . . C6 . . . . . . . B5 . . . . . . . . . . . . . . . . . . . . . . . D#6 . . . . . . .' },
    { instrument: 'bass', volume: 0.4, pattern: repeat('E2 . . . B1 . . . E2 . . . B1 . . .', 3) + ' ' + 'A1 . . . F#1 . . . B1 . . . B1 . . .' },
    { instrument: 'kick', volume: 0.5, pattern: repeat('x . . . . . . . x . . . . . . .', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('. . x . . . x . . . x . . . x x', 4) },
  ],
};

/** Snowball Siege: jingly wintery gallop in C. */
export const snowTheme: Song = {
  name: 'Snowball Siege',
  bpm: 144,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.28,
      pattern: [
        'E5 . G5 . C6 . G5 . A5 . F5 . D5 . . .',
        'D5 . F5 . B5 . A5 . G5 . E5 . C5 . . .',
        'E5 . G5 . C6 . E6 . D6 . C6 . A5 . F5 .',
        'G5 . E5 . D5 . B4 . C5 - - - . . . .',
      ].join(' '),
    },
    { instrument: 'pulse', volume: 0.08, pattern: repeat('C5 . E5 . C5 . E5 . C5 . F5 . C5 . F5 .', 1) + ' ' + repeat('B4 . D5 . B4 . D5 . C5 . E5 . C5 . E5 .', 1) + ' ' + repeat('C5 . E5 . C5 . G5 . A4 . C5 . A4 . F5 .', 1) + ' ' + repeat('G4 . B4 . G4 . D5 . E4 . G4 . C5 . . .', 1) },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        'C3 . . . G2 . . . F2 . . . F2 . . .',
        'G2 . . . G2 . . . C3 . . . C3 . . .',
        'C3 . . . E3 . . . F2 . . . D3 . . .',
        'G2 . . . G2 . . . C3 . . . C3 . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'hat', volume: 0.13, pattern: repeat('x x x x x x x x x x x x x x x x', 4) },
  ],
};

/** Giant Shove: taiko-style drum stomp in D dorian. */
export const giantTheme: Song = {
  name: 'Giant Shove',
  bpm: 120,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'reed',
      volume: 0.17,
      pattern: [
        'D5 - - - . . F5 . G5 - - - A5 . . .',
        'C6 - - - A5 . G5 . A5 - - - . . . .',
        'D5 - - - . . F5 . G5 - - - B5 . A5 .',
        'G5 - F5 - E5 - C5 - D5 - - - . . . .',
      ].join(' '),
    },
    { instrument: 'bass', volume: 0.5, pattern: repeat('D2 . . D2 . . A1 . D2 . . . C2 . A1 .', 3) + ' ' + 'G1 . . G1 . . A1 . D2 . . . D2 . . .' },
    { instrument: 'kick', volume: 0.9, pattern: repeat('x . . x . . x . x . . . x . x x', 4) },
    { instrument: 'snare', volume: 0.3, pattern: repeat('. . . . x . . . . . . . x . . .', 3) + ' ' + 'x . x . x . x . x x x x x . . .' },
    { instrument: 'hat', volume: 0.06, pattern: repeat(EIGHTHS, 4) },
  ],
};
