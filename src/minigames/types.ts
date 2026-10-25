import * as THREE from 'three';
import type { Character } from '../characters/character';
import type { Game } from '../core/game';
import type { Controller } from '../input/input';
import type { Song } from '../audio/sequencer';

export type MinigameKind = 'ffa' | '2v2' | '1v3';
/** Why a minigame is being played: end of round, a battle space or a duel. */
export type MinigameMode = 'round' | 'battle' | 'duel';

export interface MinigamePlayer {
  /** Seat index on the board, used to report winners back. */
  seat: number;
  character: Character;
  controller: Controller | null;
  /** 2v2: 0 or 1. 1v3: the solo player is team 0. FFA: own index. */
  team: number;
  alive: boolean;
  /** Free slot for per-game state (velocity, score...). */
  data: Record<string, unknown>;
}

export interface MinigameDef {
  id: string;
  name: string;
  kind: MinigameKind;
  rules: string;
  controls: string;
  /** FFA game that also works one on one, so it can host duels. */
  duel?: boolean;
  /** Its own theme; games without one share the FFA or team theme. */
  song?: Song;
  create(): Minigame;
}

/**
 * Base for every minigame. Subclasses build their arena in `setup`, run the
 * game in `play`, and call `finish(winners)` when it's decided. If time runs
 * out first, `timeout()` picks the winners.
 */
export abstract class Minigame {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  game!: Game;
  players: MinigamePlayer[] = [];
  /** Seconds of play allowed; the runner shows the countdown clock. */
  abstract readonly timeLimit: number;
  t = 0;
  winners: number[] | null = null;
  /** HTML layer for minigame-specific HUD (scores, callouts). */
  overlay!: HTMLDivElement;

  init(game: Game, players: MinigamePlayer[], overlay: HTMLDivElement): void {
    this.game = game;
    this.players = players;
    this.overlay = overlay;
    for (const p of players) this.scene.add(p.character);
    this.setup();
  }

  protected abstract setup(): void;
  /** One frame of gameplay. */
  abstract play(dt: number): void;
  /** Winners (seat numbers) when the clock hits zero. */
  abstract timeout(): number[];

  /** Runs every frame, before and after play too: animation only. */
  animate(dt: number): void {
    this.t += dt;
    for (const p of this.players) p.character.update(dt);
  }

  protected finish(winners: MinigamePlayer[]): void {
    if (this.winners) return;
    this.winners = winners.map((p) => p.seat);
  }

  get alive(): MinigamePlayer[] {
    return this.players.filter((p) => p.alive);
  }
}
