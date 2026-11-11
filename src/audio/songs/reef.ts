import type { Song } from '../sequencer';

/**
 * Coral Reef: a lazy, bubbly island groove in F major. Marimba-ish pluck
 * lead, a bell counter-line that answers it, rolling arpeggios, a soft pad
 * and a laid-back bass with a shaker. Sixteen bars, sixteenth-note steps.
 */
const chords = ['F', 'Am', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C', 'Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'F', 'F'];

const tones: Record<string, [string, string, string]> = {
  F: ['F4', 'A4', 'C5'],
  Am: ['E4', 'A4', 'C5'],
  Bb: ['F4', 'Bb4', 'D5'],
  C: ['E4', 'G4', 'C5'],
  Dm: ['F4', 'A4', 'D5'],
  Gm: ['G4', 'Bb4', 'D5'],
};

const bassRoot: Record<string, [string, string]> = {
  F: ['F2', 'C3'],
  Am: ['A2', 'E3'],
  Bb: ['Bb2', 'F3'],
  C: ['C3', 'G2'],
  Dm: ['D3', 'A2'],
  Gm: ['G2', 'D3'],
};

const melody = [
  'C5 - A4 - C5 - F5 - - - E5 - D5 - C5 -',
  'E5 - - - C5 - A4 - C5 - E5 - A5 - - -',
  'F5 - D5 - Bb4 - D5 - F5 - - - G5 - F5 -',
  'E5 - - - - - G4 - C5 - D5 - E5 - - -',
  'F5 - A5 - C6 - A5 - F5 - - - G5 - A5 -',
  'A5 - - - F5 - D5 - F5 - A5 - D6 - - -',
  'D6 - Bb5 - G5 - Bb5 - A5 - G5 - F5 - G5 -',
  'E5 - - - - - - - G5 - - - C5 - - -',
  'D5 - F5 - Bb5 - - - A5 - G5 - F5 - - -',
  'E5 - G5 - C6 - - - Bb5 - A5 - G5 - - -',
  'A5 - - - E5 - - - C5 - E5 - A5 - - -',
  'F5 - E5 - D5 - - - A4 - - - D5 - - -',
  'G5 - Bb5 - D6 - - - C6 - Bb5 - A5 - - -',
  'G5 - E5 - C5 - E5 - G5 - - - Bb5 - - -',
  'A5 - - - F5 - - - C5 - D5 - F5 - - -',
  'F5 - - - - - - - . . . . C5 - - -',
].join(' ');

/** Bell answers in the gaps: a little "bloop" at the end of each bar. */
const counter = chords
  .map((c) => {
    const [, b, d] = tones[c];
    const up = (n: string) => n.replace(/\d/, (o) => String(Number(o) + 1));
    return `. . . . . . . . . . . . ${up(d)} . ${up(b)} .`;
  })
  .join(' ');

/** Rolling broken chords, like water lapping. */
const arp = chords
  .map((c) => {
    const [a, b, d] = tones[c];
    return `${a} ${b} ${d} ${b} ${a} ${b} ${d} ${b} ${a} ${b} ${d} ${b} ${a} ${b} ${d} ${b}`;
  })
  .join(' ');

const pad = (v: 0 | 1 | 2) => chords.map((c) => `${tones[c][v]} - - - - - - - - - - - - - - -`).join(' ');

/** Lilting bass: root, a pickup, the fifth, a skip back to the root. */
const bass = chords
  .map((c) => {
    const [r, f] = bassRoot[c];
    return `${r} - - ${r} . . ${f} - ${r} - - . ${f} . ${r} .`;
  })
  .join(' ');

const repeat = (bar: string) => Array(16).fill(bar).join(' ');

export const reefTheme: Song = {
  name: 'Coral Reef',
  bpm: 100,
  stepsPerBeat: 4,
  tracks: [
    { instrument: 'pluck', volume: 0.22, pattern: melody },
    { instrument: 'bell', volume: 0.09, pattern: counter },
    { instrument: 'triangle', volume: 0.035, pattern: arp },
    { instrument: 'pad', volume: 0.06, pattern: pad(0) },
    { instrument: 'pad', volume: 0.06, pattern: pad(1) },
    { instrument: 'pad', volume: 0.05, pattern: pad(2) },
    { instrument: 'bass', volume: 0.42, pattern: bass },
    { instrument: 'kick', volume: 0.4, pattern: repeat('x . . . . . . . x . . . . . . .') },
    { instrument: 'snare', volume: 0.12, pattern: repeat('. . . . x . . . . . . . x . . x') },
    { instrument: 'hat', volume: 0.05, pattern: repeat('x . x x x . x x x . x x x . x x') },
  ],
};
