import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { MINIGAMES } from '../minigames';
import { makeMinigamePlayers } from '../minigames/players';
import { MinigameRunner } from '../minigames/runner';

/**
 * Dev aid: `?debug=minigame&id=bumper` loops one minigame with four CPUs.
 * Add `&play=1` to take seat 1 with the keyboard.
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
    const teams = def.kind === '2v2' ? [0, 0, 1, 1] : def.kind === '1v3' ? [0, 1, 1, 1] : [0, 1, 2, 3];
    this.runner = new MinigameRunner(game);
    const loop = async () => {
      for (;;) await this.runner.run(def, makeMinigamePlayers(game.session.seats, teams));
    };
    void loop();
  }

  update(dt: number): void {
    this.runner.update(dt);
  }

  exit(): void {}
}
