import { bombDrop } from './bombdrop';
import { bumperBrawl } from './bumper';
import { hexHop } from './hexhop';
import { puckRush } from './puckrush';
import { rollingRock } from './rollingrock';
import type { MinigameDef } from './types';

export const MINIGAMES: MinigameDef[] = [bumperBrawl, hexHop, bombDrop, puckRush, rollingRock];
