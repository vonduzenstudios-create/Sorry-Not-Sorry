import type { Song } from '../sequencer';

/**
 * Frostbite Peak: a skating waltz in D. Twinkly bell lead, an oom-pah-pah
 * pluck accompaniment, a warm pad and jingling hats. Sixteen bars of 3/4,
 * two steps per beat (six per bar).
 */
const chords = ['D', 'D', 'G', 'D', 'A', 'A', 'D', 'D', 'Bm', 'Bm', 'G', 'G', 'D', 'A', 'D', 'D'];

const melody = [
  'F#5 - - - A5 F#5',
  'D5 - - - E5 F#5',
  'G5 - - - B5 G5',
  'F#5 - - - . A4',
  'C#5 - - - E5 C#5',
  'A4 - B4 C#5 D5 E5',
  'F#5 - E5 - D5 -',
  'A4 - - - . .',
  'B4 - - - D5 F#5',
  'B5 - - - A5 F#5',
  'G5 - F#5 - E5 -',
  'D5 - - - B4 G4',
  'A4 - - - F#5 E5',
  'D5 - - - C#5 E5',
  'D5 - - - - -',
  '. . A4 B4 C#5 -',
].join(' ');

const root: Record<string, string> = { D: 'D2', G: 'G2', A: 'A2', Bm: 'B1' };

const triad: Record<string, [string, string, string]> = {
  D: ['F#4', 'A4', 'D5'],
  G: ['G4', 'B4', 'D5'],
  A: ['E4', 'A4', 'C#5'],
  Bm: ['F#4', 'B4', 'D5'],
};

/** Waltz bass: root on the downbeat. */
const bass = chords.map((c) => `${root[c]} - - - . .`).join(' ');

/** Oom-pah-pah: the chord answers the bass on beats two and three. */
const pah = chords
  .map((c) => {
    const [a, b] = triad[c];
    return `. . ${a} . ${b} .`;
  })
  .join(' ');

const pad = chords.map((c) => `${triad[c][1]} - - - - -`).join(' ');

/** Sparkly broken-chord run high above, once every two bars. */
const sparkle = chords
  .map((c, i) => {
    const [a, b, d] = triad[c].map((n) => n.replace(/\d/, (o) => String(Number(o) + 1)));
    return i % 2 ? '. . . . . .' : `. . . ${a} ${b} ${d}`;
  })
  .join(' ');

const repeat = (bar: string) => Array(16).fill(bar).join(' ');

export const frostbiteTheme: Song = {
  name: 'Frostbite Peak',
  bpm: 168,
  stepsPerBeat: 2,
  tracks: [
    { instrument: 'bell', volume: 0.2, pattern: melody },
    { instrument: 'pluck', volume: 0.09, pattern: pah },
    { instrument: 'pad', volume: 0.06, pattern: pad },
    { instrument: 'triangle', volume: 0.035, pattern: sparkle },
    { instrument: 'bass', volume: 0.42, pattern: bass },
    { instrument: 'kick', volume: 0.3, pattern: repeat('x . . . . .') },
    { instrument: 'hat', volume: 0.07, pattern: repeat('. . x x x x') },
  ],
};
