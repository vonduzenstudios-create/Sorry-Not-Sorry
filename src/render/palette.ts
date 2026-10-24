/** Pastel palette shared by every scene, plus one accent per character. */
export const Palette = {
  ink: 0x2b2440,
  cream: 0xfff6e6,
  mint: 0xb8f0d8,
  peach: 0xffd3b8,
  lavender: 0xd8c8ff,
  butter: 0xfff0a8,
  sky: 0xb8e2ff,
  rose: 0xffc2d6,
  grass: 0x9fe3a8,
  grassDark: 0x7ccf8c,
  sand: 0xf6e3b4,
  water: 0x8fd3f0,
  skyTop: 0x8ec9ff,
  skyBottom: 0xfde4f2,

  // Saturated accents so players read each other at a glance.
  coral: 0xff7a7a,
  violet: 0xa98bff,
  green: 0x5fd39a,
  yellow: 0xffd23f,
} as const;

export const PlayerColors = [Palette.coral, Palette.violet, Palette.green, Palette.yellow] as const;

export function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
