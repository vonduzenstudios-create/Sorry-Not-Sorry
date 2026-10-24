import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Seat } from '../core/session';
import type { MinigamePlayer } from './types';

/**
 * Fresh characters for a minigame scene, one per seat, with teams assigned.
 * `only` limits it to some seats (duels); `teams` is indexed by seat.
 */
export function makeMinigamePlayers(seats: Seat[], teams: number[], only?: number[]): MinigamePlayer[] {
  const ids = only ?? seats.map((_, i) => i);
  return ids.map((i) => ({
    seat: i,
    controller: seats[i].controller,
    character: new Character(ROSTER.find((d) => d.id === seats[i].characterId)!),
    team: teams[i],
    alive: true,
    data: {},
  }));
}
