import { chaseTheme, tenseTheme } from '../audio/songs/minigame';
import type { Game } from '../core/game';
import { Tasks } from '../core/tasks';
import { css } from '../render/palette';
import type { Minigame, MinigameDef, MinigameMode, MinigamePlayer } from './types';

const KIND_LABEL = { ffa: '4-Player', '2v2': '2 vs 2', '1v3': '1 vs 3' } as const;

/**
 * Plays one minigame inside whatever scene hosts it (the board, or the
 * minigame test screen): intro card, 3-2-1, play with a clock, finish, results.
 * The host forwards `update(dt)` while `active`.
 */
export class MinigameRunner {
  private tasks = new Tasks();
  private mg: Minigame | null = null;
  private playing = false;
  private overlay: HTMLDivElement | null = null;
  private clock: HTMLDivElement | null = null;
  private remaining = 0;

  constructor(private game: Game) {}

  get active(): boolean {
    return this.mg !== null;
  }

  update(dt: number): void {
    this.tasks.update(dt);
    if (!this.mg) return;
    if (this.playing) {
      this.mg.play(dt);
      this.remaining -= dt;
      if (this.clock) this.clock.textContent = String(Math.max(0, Math.ceil(this.remaining)));
    }
    this.mg.animate(dt);
  }

  /** Returns the seat numbers of the winners (possibly none). */
  async run(def: MinigameDef, players: MinigamePlayer[], mode: MinigameMode = 'round'): Promise<number[]> {
    const game = this.game;
    game.ui.root.classList.add('in-minigame');
    this.overlay = game.ui.add('mg-overlay');
    const mg = def.create();
    mg.init(game, players, this.overlay);
    this.mg = mg;
    game.renderer.setView(mg.scene, mg.camera);
    const card = document.createElement('div');
    card.className = 'mg-card panel';
    card.innerHTML = `
      <div class="mg-kind">${mode === 'duel' ? 'Duel' : mode === 'battle' ? 'Battle' : KIND_LABEL[def.kind]} minigame</div>
      <div class="mg-name">${def.name}</div>
      ${teamsHtml(def, players, mode)}
      <div class="mg-rules">${def.rules}</div>
      <div class="mg-controls">${def.controls}</div>
      <div class="mg-start">${players.some((p) => p.controller) ? 'Press A to start!' : 'Starting...'}</div>`;
    this.overlay.appendChild(card);

    const humans = players.filter((p) => p.controller);
    let t = 0;
    await this.tasks.until((dt) => {
      t += dt;
      if (humans.length === 0) return t > 3;
      return t > 0.4 && humans.some((p) => p.controller!.pressed('a'));
    });
    game.audio.play('confirm');
    card.remove();

    const big = document.createElement('div');
    big.className = 'mg-big';
    this.overlay.appendChild(big);
    for (const n of ['3', '2', '1']) {
      big.textContent = n;
      big.classList.remove('pop');
      void big.offsetWidth;
      big.classList.add('pop');
      game.audio.play('select');
      await this.tasks.sleep(0.6);
    }
    big.textContent = 'GO!';
    game.audio.play('confirm');
    game.audio.playSong(def.kind === 'ffa' ? chaseTheme : tenseTheme);

    this.clock = document.createElement('div');
    this.clock.className = 'mg-clock panel';
    this.overlay.appendChild(this.clock);
    this.remaining = mg.timeLimit;
    this.playing = true;
    window.setTimeout(() => big.textContent === 'GO!' && (big.textContent = ''), 600);

    await this.tasks.until(() => mg.winners !== null || this.remaining <= 0);
    this.playing = false;
    const winners = mg.winners ?? mg.timeout();
    game.audio.stopSong();
    big.textContent = 'FINISH!';
    big.classList.remove('pop');
    void big.offsetWidth;
    big.classList.add('pop');
    game.audio.play('boom');
    await this.tasks.sleep(1.2);

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
    result.innerHTML = names.length ? `${names.join(' & ')} win${names.length === 1 ? 's' : ''}!` : 'Nobody wins!';
    this.overlay.appendChild(result);
    game.audio.play(names.length ? 'star' : 'back');
    await this.tasks.sleep(2.6);

    this.overlay.remove();
    game.ui.root.classList.remove('in-minigame');
    this.overlay = null;
    this.clock = null;
    this.mg = null;
    return winners;
  }
}

function teamsHtml(def: MinigameDef, players: MinigamePlayer[], mode: MinigameMode): string {
  if (def.kind === 'ffa' && mode !== 'duel') return '';
  const teams = [0, 1].map((team) =>
    players
      .filter((p) => p.team === team)
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">${p.character.def.name}</span>`)
      .join(' & '),
  );
  return `<div class="mg-teams">${teams[0]} <b>vs</b> ${teams[1]}</div>`;
}
