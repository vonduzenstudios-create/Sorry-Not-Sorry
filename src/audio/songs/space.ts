import type { Song } from '../sequencer';

/**
 * Star Station: floaty synth-pop in E minor. Sparkly bell lead, sixteenth
 * saw arpeggios, a soft pad and a pulsing bass. Eight bars, Em C G D / Em C Am B.
 */
const chords = ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'B'];

const tones: Record<string, [string, string, string, string]> = {
  Em: ['E4', 'G4', 'B4', 'E5'],
  C: ['C4', 'E4', 'G4', 'C5'],
  G: ['D4', 'G4', 'B4', 'D5'],
  D: ['D4', 'F#4', 'A4', 'D5'],
  Am: ['C4', 'E4', 'A4', 'C5'],
  B: ['D#4', 'F#4', 'B4', 'D#5'],
};

const bassRoot: Record<string, string> = { Em: 'E2', C: 'C2', G: 'G2', D: 'D2', Am: 'A2', B: 'B1' };

const arp = chords
  .map((c) => {
    const [a, b, d, e] = tones[c];
    return `${a} ${b} ${d} ${e} ${d} ${b} ${a} ${b} ${d} ${e} ${d} ${b} ${a} ${b} ${d} ${e}`;
  })
  .join(' ');

const pad = chords.map((c) => `${tones[c][1]} - - - - - - - - - - - - - - -`).join(' ');
const pad2 = chords.map((c) => `${tones[c][2]} - - - - - - - - - - - - - - -`).join(' ');

/** Pulsing eighth-note bass with an octave pop on the off-beat. */
const bass = chords
  .map((c) => {
    const r = bassRoot[c];
    const up = r.replace(/\d/, (n) => String(Number(n) + 1));
    return `${r} . ${r} . ${up} . ${r} . ${r} . ${r} . ${up} . ${r} .`;
  })
  .join(' ');

const melody = [
  'B5 - - - G5 - - - E5 - F#5 - G5 - - -',
  'E5 - - - G5 - - - C6 - - - B5 - - -',
  'D6 - - - B5 - - - G5 - A5 - B5 - - -',
  'A5 - - - F#5 - - - D5 - - - . . . .',
  'B5 - - - G5 - - - E5 - F#5 - G5 - - -',
  'E5 - - - G5 - - - C6 - B5 - C6 - - -',
  'A5 - - - C6 - - - E6 - D6 - C6 - - -',
  'B5 - - - - - - - F#5 - - - D#5 - - -',
].join(' ');

const repeat = (bar: string) => Array(8).fill(bar).join(' ');

export const spaceTheme: Song = {
  name: 'Star Station',
  bpm: 112,
  stepsPerBeat: 4,
  tracks: [
    { instrument: 'bell', volume: 0.16, pattern: melody },
    { instrument: 'saw', volume: 0.05, pattern: arp },
    { instrument: 'pad', volume: 0.07, pattern: pad },
    { instrument: 'pad', volume: 0.07, pattern: pad2 },
    { instrument: 'bass', volume: 0.42, pattern: bass },
    { instrument: 'kick', volume: 0.55, pattern: repeat('x . . . . . . . x . . . . . . .') },
    { instrument: 'snare', volume: 0.22, pattern: repeat('. . . . x . . . . . . . x . . .') },
    { instrument: 'hat', volume: 0.07, pattern: repeat('. . x . . . x . . . x . . . x x') },
  ],
};
