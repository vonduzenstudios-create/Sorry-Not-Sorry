import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Seat } from '../core/session';
import type { MinigamePlayer } from './types';

/** Fresh characters for a minigame scene, one per seat, with teams assigned. */
export function makeMinigamePlayers(seats: Seat[], teams: number[]): MinigamePlayer[] {
  return seats.map((seat, i) => ({
    seat: i,
    character: new Character(ROSTER.find((d) => d.id === seat.characterId)!),
    controller: seat.controller,
    team: teams[i],
    alive: true,
    data: {},
  }));
}
