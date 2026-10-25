import type { Game } from './game';

/**
 * A screen of the game (title, lobby, board, a minigame...). Scenes own their
 * three.js scene graph and HTML overlay, and are swapped by the SceneManager.
 */
export interface Scene {
  enter(game: Game): void;
  update(dt: number): void;
  exit(): void;
  /** Online: a number summarizing game state, compared between peers to catch desyncs. */
  digest?(): number;
}

export class SceneManager {
  private current: Scene | null = null;
  private pending: Scene | null = null;

  constructor(private game: Game) {}

  /** Switch at the start of the next frame, so a scene can request a change mid-update. */
  go(scene: Scene): void {
    this.pending = scene;
  }

  /** Name of the scene that is running (or about to), for desync checks. */
  get currentName(): string {
    return (this.pending ?? this.current)?.constructor.name ?? '';
  }

  digest(): number {
    return this.pending ? 0 : (this.current?.digest?.() ?? 0);
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
