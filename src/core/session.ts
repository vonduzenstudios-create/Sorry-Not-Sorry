import type { Controller } from '../input/input';

/** One of the four seats in a game. A seat without a controller is a CPU. */
export interface Seat {
  characterId: string;
  controller: Controller | null;
}

/** Who is playing as whom. Filled in by character select, read by everything after. */
export class Session {
  seats: Seat[] = [];

  get humans(): Seat[] {
    return this.seats.filter((s) => s.controller);
  }
}
