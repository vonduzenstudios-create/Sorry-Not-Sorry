import type { Game } from './game';

/**
 * A screen of the game (title, lobby, board, a minigame...). Scenes own their
 * three.js scene graph and HTML overlay, and are swapped by the SceneManager.
 */
export interface Scene {
  enter(game: Game): void;
  update(dt: number): void;
  exit(): void;
}

export class SceneManager {
  private current: Scene | null = null;
  private pending: Scene | null = null;

  constructor(private game: Game) {}

  /** Switch at the start of the next frame, so a scene can request a change mid-update. */
  go(scene: Scene): void {
    this.pending = scene;
  }

  update(dt: number): void {
    if (this.pending) {
      this.current?.exit();
      this.game.ui.clear();
      this.current = this.pending;
      this.pending = null;
      this.current.enter(this.game);
    }
    this.current?.update(dt);
  }
}
