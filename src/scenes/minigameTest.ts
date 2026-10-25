import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { MINIGAMES } from '../minigames';
import { makeMinigamePlayers } from '../minigames/players';
import { MinigameRunner } from '../minigames/runner';

/**
 * Dev aid: `?debug=minigame&id=bumper` loops one minigame with four CPUs.
 * Add `&play=1` to take seat 1 with the keyboard, `&duel=1` for a one-on-one
 * (FFA games that support duels). Winners are logged to the console.
 */
export class MinigameTestScene implements Scene {
  private runner!: MinigameRunner;

  enter(game: Game): void {
    const params = new URLSearchParams(location.search);
    const def = MINIGAMES.find((m) => m.id === params.get('id')) ?? MINIGAMES[0];
    game.session.seats = ROSTER.map((d, i) => ({
      characterId: d.id,
      controller: i === 0 && params.get('play') ? game.input.keyboard : null,
    }));
    const duel = def.duel && params.get('duel') ? [0, 1] : undefined;
    const teams = def.kind === '2v2' ? [0, 0, 1, 1] : def.kind === '1v3' || duel ? [0, 1, 1, 1] : [0, 1, 2, 3];
    this.runner = new MinigameRunner(game);
    const loop = async () => {
      for (;;) {
        const winners = await this.runner.run(def, makeMinigamePlayers(game.session.seats, teams, duel), duel ? 'duel' : 'round');
        console.info(`[minigame] ${def.id} winners: ${winners.join(',') || 'none'}`);
      }
    };
    void loop();
  }

  update(dt: number): void {
    this.runner.update(dt);
  }

  exit(): void {}
}
