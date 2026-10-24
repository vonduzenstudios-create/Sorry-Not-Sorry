import { beamMeUp } from './beammeup';
import { bombDrop } from './bombdrop';
import { bumperBrawl } from './bumper';
import { cannonVolley } from './cannonvolley';
import { coinShower } from './coinshower';
import { hexHop } from './hexhop';
import { puckRush } from './puckrush';
import { quickDraw } from './quickdraw';
import { rollingRock } from './rollingrock';
import { traceRace } from './tracerace';
import type { MinigameDef } from './types';

export const MINIGAMES: MinigameDef[] = [
  bumperBrawl,
  hexHop,
  bombDrop,
  traceRace,
  coinShower,
  quickDraw,
  puckRush,
  cannonVolley,
  rollingRock,
  beamMeUp,
];
