import * as THREE from 'three';
import { chaseTheme, tenseTheme } from '../audio/songs/minigame';
import { Character } from '../characters/character';
import type { Game } from '../core/game';
import { Tasks } from '../core/tasks';
import { css } from '../render/palette';
import { MinigamePreview } from './preview';
import type { Minigame, MinigameDef, MinigameMode, MinigamePlayer, MinigameResult } from './types';

/**
 * Plays one minigame inside whatever scene hosts it (the board, or the
 * minigame test screen): preview (with optional practice rounds), 3-2-1,
 * play with a clock, finish, results.
 * The host forwards `update(dt)` while `active`.
 */
export class MinigameRunner {
  private tasks = new Tasks();
  private mg: Minigame | null = null;
  private playing = false;
  private preview: MinigamePreview | null = null;
  private clock: HTMLDivElement | null = null;
  private remaining = 0;

  constructor(private game: Game) {}

  get active(): boolean {
    return this.mg !== null;
  }

  update(dt: number): void {
    this.tasks.update(dt);
    this.preview?.update(dt);
    const mg = this.mg;
    if (!mg) return;
    if (this.playing) {
      // A decided game stops simulating while the runner wraps it up.
      if (!mg.winners) {
        mg.play(dt);
        mg.trackOuts();
      }
      this.remaining -= dt;
      if (this.clock) this.clock.textContent = String(Math.max(0, Math.ceil(this.remaining)));
    }
    mg.animate(dt);
  }

  /** Returns the winners (possibly none) and everyone's finishing place. */
  async run(def: MinigameDef, players: MinigamePlayer[], mode: MinigameMode = 'round'): Promise<MinigameResult> {
    const game = this.game;
    game.ui.root.classList.add('in-minigame');
    const overlay = game.ui.add('mg-overlay');
    const mg = def.create();
    mg.init(game, players, overlay);
    this.mg = mg;
    game.renderer.setView(mg.scene, mg.camera);

    // Preview: rules, controls and practice pads. Practice rounds loop back here.
    const preview = new MinigamePreview(game, def, players, mode, overlay);
    this.preview = preview;
    let t = 0;
    for (;;) {
      t = 0;
      await this.tasks.until((dt) => {
        t += dt;
        if (!preview.hasHumans) return t > 3;
        return t > 0.4 && preview.decided() !== null;
      });
      if (!preview.hasHumans || preview.decided() === 'play') break;
      preview.visible = false;
      overlay.style.display = 'none';
      await this.practice(def, players, mg);
      overlay.style.display = '';
      preview.visible = true;
      preview.reset();
    }
    await this.tasks.sleep(0.3);
    preview.dispose();
    this.preview = null;

    const raw = await this.round(def, mg, overlay, false);
    const winners = teamWinners(def, players, raw);
    const placement = mg.placement(winners);
    const big = overlay.querySelector('.mg-big') as HTMLDivElement;

    for (const p of players) {
      const won = winners.includes(p.seat);
      if (p.alive || won) {
        p.character.visible = true;
        p.character.pose = won ? 'cheer' : 'sulk';
        p.character.setExpression(won ? 'happy' : 'sad');
      }
    }
    const names = players.filter((p) => winners.includes(p.seat)).map((p) => p.character.def.name);
    big.textContent = '';
    const result = document.createElement('div');
    result.className = 'mg-result panel';
    result.innerHTML =
      (names.length ? `${names.join(' & ')} win${names.length === 1 ? 's' : ''}!` : 'Nobody wins!') + placesHtml(players, placement);
    overlay.appendChild(result);
    game.audio.play(names.length ? 'star' : 'back');
    await this.tasks.sleep(2.6);

    overlay.remove();
    game.ui.root.classList.remove('in-minigame');
    this.clock = null;
    this.mg = null;
    return { winners, placement };
  }

  /**
   * 3-2-1, play until decided or out of time, FINISH. Returns the raw winners.
   * Any human can end a practice round early with START.
   */
  private async round(def: MinigameDef, mg: Minigame, overlay: HTMLDivElement, practice: boolean): Promise<number[]> {
    const game = this.game;
    const big = document.createElement('div');
    big.className = 'mg-big';
    overlay.appendChild(big);
    const pop = (text: string) => {
      big.textContent = text;
      big.classList.remove('pop');
      void big.offsetWidth;
      big.classList.add('pop');
    };
    for (const n of ['3', '2', '1']) {
      pop(n);
      game.audio.play('select');
      await this.tasks.sleep(0.6);
    }
    big.textContent = 'GO!';
    game.audio.play('confirm');
    game.audio.playSong(def.song ?? (def.kind === 'ffa' ? chaseTheme : tenseTheme));

    this.clock = document.createElement('div');
    this.clock.className = 'mg-clock panel';
    overlay.appendChild(this.clock);
    if (practice) {
      const tag = document.createElement('div');
      tag.className = 'mg-practice panel';
      tag.textContent = 'PRACTICE · START: stop';
      overlay.appendChild(tag);
    }
    this.remaining = mg.timeLimit;
    this.playing = true;
    window.setTimeout(() => big.textContent === 'GO!' && (big.textContent = ''), 600);

    let quit = false;
    await this.tasks.until(() => {
      if (practice && mg.players.some((p) => p.controller && !p.controller.gone && p.controller.pressed('start'))) quit = true;
      return quit || mg.winners !== null || this.remaining <= 0;
    });
    this.playing = false;
    const raw = mg.winners ?? (quit ? [] : mg.timeout());
    game.audio.stopSong();
    pop(practice ? 'PRACTICE OVER!' : 'FINISH!');
    game.audio.play(practice ? 'back' : 'boom');
    await this.tasks.sleep(practice ? 1.4 : 1.2);
    return raw;
  }

  /**
   * A throwaway round of the same game with stand-in characters, so the real
   * game's arena and players stay exactly as they were set up.
   */
  private async practice(def: MinigameDef, players: MinigamePlayer[], real: Minigame): Promise<void> {
    const game = this.game;
    const overlay = game.ui.add('mg-overlay');
    const stand = players.map((p) => ({ ...p, character: new Character(p.character.def), alive: true, data: {} }));
    const mg = def.create();
    mg.init(game, stand, overlay);
    this.mg = mg;
    game.renderer.setView(mg.scene, mg.camera);
    await this.round(def, mg, overlay, true);
    overlay.remove();
    this.clock = null;
    this.mg = real;
    game.renderer.setView(real.scene, real.camera);
    mg.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
  }
}

/** In team games the whole side shares the win, even teammates who got knocked out. */
function teamWinners(def: MinigameDef, players: MinigamePlayer[], winners: number[]): number[] {
  if (def.kind === 'ffa') return winners;
  const teams = new Set(players.filter((p) => winners.includes(p.seat)).map((p) => p.team));
  return players.filter((p) => teams.has(p.team)).map((p) => p.seat);
}

const PLACE = ['1st', '2nd', '3rd', '4th'];

function placesHtml(players: MinigamePlayer[], placement: number[][]): string {
  let place = 0;
  const rows = placement.map((group) => {
    const names = group.map((seat) => {
      const p = players.find((q) => q.seat === seat)!;
      return `<span style="color:${css(p.character.def.colors.accent)}">${p.character.def.name}</span>`;
    });
    const row = `<div><b>${PLACE[place]}</b> ${names.join(' & ')}</div>`;
    place += group.length;
    return row;
  });
  return `<div class="mg-places">${rows.join('')}</div>`;
}
