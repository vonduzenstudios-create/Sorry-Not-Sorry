import { dustyGulch } from './western';
import { pirateCove } from './pirate';
import { starStation } from './space';
import type { BoardDef } from './types';

/** Every playable board, by session board id. */
export const BOARDS: Record<string, () => BoardDef> = {
  pirate: pirateCove,
  western: dustyGulch,
  space: starStation,
};
