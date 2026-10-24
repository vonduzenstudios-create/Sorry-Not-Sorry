import * as THREE from 'three';
import { distance } from '../board/graph';
import { makeGrudge } from '../board/grudge';
import { Hud, rank } from '../board/hud';
import { DiceBlock } from '../board/dice';
import { pirateCove } from '../board/pirate';
import type { BoardDef, Space } from '../board/types';
import { buildSpaces, SPACE_TOP } from '../board/view';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Seat } from '../core/session';
import { easeOut, easeOutBack, linear, Tasks } from '../core/tasks';
import type { Controller } from '../input/input';
import { addLights, skyDome } from '../render/environment';
import { Palette } from '../render/palette';
import { makeStar } from '../render/props';
import { TitleScene } from './title';

const STAR_COST = 20;
const START_COINS = 10;
const CAMERA_OFFSET = new THREE.Vector3(0, 16, 14);

export interface BoardPlayer {
  seat: Seat;
  character: Character;
  spaceId: number;
  coins: number;
  stars: number;
  /** Stats for end-of-game bonus stars. */
  stats: { minigameCoins: number; maxCoins: number; happenings: number };
}

/**
 * The board game itself. Turn flow is written as async code driven by
 * `Tasks`, so each step reads top to bottom: roll, move, land, minigame.
 */
export class BoardScene implements Scene {
  private game!: Game;
  private board!: BoardDef;
  private spaces!: Space[];
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 800);
  private camTarget = new THREE.Vector3();
  private camFocus = new THREE.Vector3();
  /** Camera distance multiplier; >1 pulls back for overviews. */
  private zoom = 2.6;
  private zoomTarget = 2.6;
  private tasks = new Tasks();
  private hud!: Hud;
  private players: BoardPlayer[] = [];
  private active = -1;
  private turn = 1;
  private dice = new DiceBlock();
  private star!: THREE.Mesh;
  private starSpace = -1;
  private grudge = makeGrudge();
  private arrows: THREE.Mesh[] = [];
  private t = 0;
  private alive = true;

  enter(game: Game): void {
    this.game = game;
    this.board = pirateCove();
    this.spaces = this.board.spaces;

    this.scene.add(skyDome(0x8ec9ff, 0xfde4f2));
    addLights(this.scene);
    this.board.buildScenery(this.scene, this.spaces);
    this.scene.add(buildSpaces(this.spaces));

    this.star = makeStar(0.7);
    this.star.visible = false;
    this.scene.add(this.star);
    this.dice.visible = false;
    this.scene.add(this.dice);
    this.grudge.visible = false;
    this.scene.add(this.grudge);

    for (const seat of game.session.seats) {
      const def = ROSTER.find((d) => d.id === seat.characterId)!;
      const character = new Character(def);
      this.scene.add(character);
      this.players.push({
        seat,
        character,
        spaceId: this.board.startId,
        coins: START_COINS,
        stars: 0,
        stats: { minigameCoins: 0, maxCoins: START_COINS, happenings: 0 },
      });
    }
    this.spreadPlayers(true);

    this.hud = new Hud(game.ui, this.camera);
    this.refreshHud();
    this.hud.setTurn(1, game.session.turns);

    // Open on an overview of the whole board.
    this.camTarget.set(0, 0, 2);
    this.camFocus.copy(this.camTarget);
    game.renderer.setView(this.scene, this.camera);
    game.audio.playSong(this.board.song);

    void this.run().catch((e) => {
      if (this.alive) throw e;
    });
  }

  exit(): void {
    this.alive = false;
    this.tasks.clear();
    this.game.audio.stopSong();
  }

  // ---------------------------------------------------------------- flow

  private async run(): Promise<void> {
    const turns = this.game.session.turns;
    await this.say(`Welcome to ${this.board.name}! Buy stars for ${STAR_COST} coins. Most stars after ${turns} turns wins!`, undefined, 3);
    this.zoomTarget = 1;
    await this.moveStar(true);

    for (this.turn = 1; this.turn <= turns; this.turn++) {
      this.hud.setTurn(this.turn, turns);
      for (let i = 0; i < this.players.length; i++) {
        this.active = i;
        this.refreshHud();
        await this.playerTurn(this.players[i]);
      }
      this.active = -1;
      this.refreshHud();
      await this.minigame();
    }
    await this.results();
  }

  private async playerTurn(p: BoardPlayer): Promise<void> {
    this.focus(p.character.position);
    await this.say(`${p.character.def.name}'s turn!`, undefined, 1.0);

    const roll = await this.rollDice(p);
    let steps = roll;
    const counter = this.hud.label('steps-label', String(steps), () =>
      p.character.position.clone().add(new THREE.Vector3(0, 2.6, 0)),
    );
    p.character.setExpression('determined');

    while (steps > 0) {
      const here = this.spaces[p.spaceId];
      const nextId = here.next.length > 1 ? await this.chooseBranch(p, here) : here.next[0];
      await this.hop(p, this.spaces[nextId].pos);
      p.spaceId = nextId;
      steps--;
      counter.el.textContent = String(steps);
      this.game.audio.play('select');
      if (nextId === this.starSpace) await this.offerStar(p);
    }
    counter.remove();
    await this.land(p);
    p.character.pose = 'idle';
    p.character.setExpression('neutral');
    this.spreadPlayers(false);
  }

  private async rollDice(p: BoardPlayer): Promise<number> {
    const ch = p.character;
    this.dice.position.copy(ch.position).add(new THREE.Vector3(0, 3, 0));
    this.dice.scale.setScalar(0.01);
    this.dice.visible = true;
    this.dice.rolling = true;
    await this.tasks.tween(0.25, (k) => this.dice.scale.setScalar(Math.max(0.01, k)), easeOutBack);
    this.hud.say(p.seat.controller ? 'Press A to hit the dice block!' : `${ch.def.name} is rolling...`);
    await this.waitPress(p.seat.controller, 0.7 + this.game.rng.next() * 0.6);
    this.hud.hideDialog();

    // Jump up and bonk the block.
    const base = ch.position.y;
    ch.pose = 'jump';
    this.game.audio.play('jump');
    await this.tasks.tween(0.18, (k) => (ch.position.y = base + k * 1.1), easeOut);
    this.dice.rolling = false;
    const value = this.game.rng.int(1, 10);
    this.dice.show(value);
    this.game.audio.play('dice');
    await this.tasks.tween(0.18, (k) => (ch.position.y = base + (1 - k) * 1.1), linear);
    ch.position.y = base;
    ch.land();
    ch.pose = 'idle';
    await this.tasks.sleep(0.5);
    await this.tasks.tween(0.2, (k) => this.dice.scale.setScalar(Math.max(0.01, 1 - k)));
    this.dice.visible = false;
    return value;
  }

  private async hop(p: BoardPlayer, to: THREE.Vector3): Promise<void> {
    const ch = p.character;
    const from = ch.position.clone();
    const target = to.clone().setY(SPACE_TOP);
    ch.rotation.y = Math.atan2(target.x - from.x, target.z - from.z);
    ch.pose = 'walk';
    ch.moveSpeed = 1;
    this.focus(target);
    await this.tasks.tween(
      0.3,
      (k) => {
        ch.position.lerpVectors(from, target, k);
        ch.position.y += Math.sin(k * Math.PI) * 0.6;
      },
      linear,
    );
    ch.land();
  }

  private async chooseBranch(p: BoardPlayer, here: Space): Promise<number> {
    const options = here.next;
    // Arrows pointing down each path.
    for (const id of options) {
      const dir = this.spaces[id].pos.clone().sub(here.pos).setY(0).normalize();
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), new THREE.MeshBasicMaterial({ color: Palette.yellow }));
      // Cone points up; tip it forward, then yaw toward the path.
      arrow.rotation.order = 'YXZ';
      arrow.rotation.set(Math.PI / 2, Math.atan2(dir.x, dir.z), 0);
      arrow.position.copy(here.pos).addScaledVector(dir, 1.6).setY(0.9);
      arrow.userData.dir = dir;
      this.scene.add(arrow);
      this.arrows.push(arrow);
    }

    let pick = 0;
    const c = p.seat.controller;
    if (c) {
      this.hud.say('Which way? Point with the stick and press A.');
      await this.tasks.until(() => {
        const stick = new THREE.Vector3(c.stickX, 0, -c.stickY);
        if (stick.lengthSq() > 0.25) {
          let best = -Infinity;
          options.forEach((_, i) => {
            const d = stick.dot(this.arrows[i].userData.dir as THREE.Vector3);
            if (d > best) {
              best = d;
              pick = i;
            }
          });
        }
        this.arrows.forEach((a, i) => a.scale.setScalar(i === pick ? 1.3 + Math.sin(this.t * 10) * 0.1 : 0.8));
        return c.pressed('a');
      });
    } else {
      // CPUs head for the star when one path is clearly closer.
      const d = options.map((id) => (this.starSpace >= 0 ? distance(this.spaces, id, this.starSpace) : 0));
      const min = Math.min(...d);
      const best = options.map((_, i) => i).filter((i) => d[i] === min);
      pick = this.game.rng.pick(best);
      this.arrows.forEach((a, i) => a.scale.setScalar(i === pick ? 1.3 : 0.8));
      await this.tasks.sleep(0.7);
    }
    this.game.audio.play('confirm');
    this.hud.hideDialog();
    for (const a of this.arrows) this.scene.remove(a);
    this.arrows = [];
    return options[pick];
  }

  // ---------------------------------------------------------------- spaces

  private async land(p: BoardPlayer): Promise<void> {
    const space = this.spaces[p.spaceId];
    const ch = p.character;
    switch (space.type) {
      case 'blue':
      case 'start':
        await this.changeCoins(p, 3);
        break;
      case 'red':
        await this.changeCoins(p, -3);
        break;
      case 'happening':
        await this.happening(p);
        break;
      case 'villain':
        await this.villain(p);
        break;
      case 'item':
        ch.setExpression('surprised');
        await this.say('An item space! Items arrive in an upcoming update.', undefined, 1.4);
        break;
      case 'battle':
        ch.setExpression('surprised');
        await this.say('A battle space! Battles arrive in an upcoming update.', undefined, 1.4);
        break;
    }
  }

  private async changeCoins(p: BoardPlayer, amount: number): Promise<void> {
    const real = amount < 0 ? -Math.min(p.coins, -amount) : amount;
    p.coins += real;
    p.stats.maxCoins = Math.max(p.stats.maxCoins, p.coins);
    const head = p.character.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    this.hud.popup(`${amount >= 0 ? '+' : ''}${real}`, head, amount >= 0);
    this.game.audio.play(amount >= 0 ? 'coin' : 'back');
    p.character.pose = amount >= 0 ? 'cheer' : 'sulk';
    p.character.setExpression(amount >= 0 ? 'happy' : 'sad');
    this.refreshHud();
    await this.tasks.sleep(0.9);
    p.character.pose = 'idle';
  }

  private async happening(p: BoardPlayer): Promise<void> {
    p.stats.happenings++;
    p.character.setExpression('surprised');
    await this.say(`${this.board.happening.title} ${this.board.happening.description}`, undefined, 1.6);
    const choices = this.spaces.filter((s) => s.type === 'blue' && s.pos.distanceTo(this.spaces[p.spaceId].pos) > 12);
    const dest = this.game.rng.pick(choices);
    this.game.audio.play('boom');
    const ch = p.character;
    const from = ch.position.clone();
    const to = dest.pos.clone().setY(SPACE_TOP);
    ch.pose = 'jump';
    await this.tasks.tween(
      1.6,
      (k) => {
        ch.position.lerpVectors(from, to, k);
        ch.position.y += Math.sin(k * Math.PI) * 12;
        ch.rotation.x = k * Math.PI * 4;
        this.focus(ch.position);
      },
      linear,
    );
    ch.rotation.x = 0;
    ch.land();
    p.spaceId = dest.id;
    this.game.audio.play('boom');
    await this.tasks.sleep(0.4);
    if (dest.id === this.starSpace) await this.offerStar(p);
  }

  private async villain(p: BoardPlayer): Promise<void> {
    const ch = p.character;
    const g = this.grudge;
    g.position.copy(ch.position).add(new THREE.Vector3(-2.2, 0, -0.6));
    g.rotation.y = 0.6;
    g.scale.setScalar(0.01);
    g.visible = true;
    this.game.audio.play('boom');
    await this.tasks.tween(0.4, (k) => g.scale.setScalar(Math.max(0.01, k)), easeOutBack);
    ch.setExpression('surprised');
    await this.say('Bwahaha! Sorry... not sorry!', 'The Grudge', 1.6);

    if (p.stars > 0 && this.game.rng.next() < 0.25) {
      p.stars--;
      ch.pose = 'sulk';
      ch.setExpression('sad');
      this.refreshHud();
      await this.say(`The Grudge swipes one of ${ch.def.name}'s stars!`, 'The Grudge', 1.6);
    } else {
      const take = Math.min(p.coins, this.game.rng.pick([5, 10, 15]));
      await this.say(`The Grudge takes ${take} coins!`, 'The Grudge', 1.2);
      await this.changeCoins(p, -take);
    }
    await this.tasks.tween(0.3, (k) => g.scale.setScalar(Math.max(0.01, 1 - k)));
    g.visible = false;
    ch.pose = 'idle';
  }

  // ---------------------------------------------------------------- star

  /** Puts the star on a new candidate space and shows it. */
  private async moveStar(first: boolean): Promise<void> {
    const candidates = this.spaces.filter((s) => s.starCandidate && s.id !== this.starSpace);
    const dest = this.game.rng.pick(candidates);
    this.starSpace = dest.id;
    this.star.visible = true;
    this.star.position.copy(dest.pos).setY(2.2);
    const back = this.camFocus.clone();
    this.focus(dest.pos);
    this.game.audio.play('star');
    await this.say(first ? 'The first star appears here!' : 'The star moved here!', undefined, 1.6);
    this.focus(back);
    await this.tasks.sleep(0.4);
  }

  private async offerStar(p: BoardPlayer): Promise<void> {
    const ch = p.character;
    if (p.coins < STAR_COST) {
      ch.setExpression('sad');
      await this.say(`A star costs ${STAR_COST} coins. ${ch.def.name} can't afford it!`, undefined, 1.5);
      ch.setExpression('determined');
      return;
    }
    const buy = await this.ask(p, `Buy a star for ${STAR_COST} coins?`, ['Yes', 'No'], 0);
    if (buy !== 0) return;

    p.coins -= STAR_COST;
    p.stars++;
    this.refreshHud();
    const from = this.star.position.clone();
    const to = ch.position.clone().add(new THREE.Vector3(0, 2.5, 0));
    this.game.audio.play('star');
    await this.tasks.tween(0.6, (k) => this.star.position.lerpVectors(from, to, k));
    ch.pose = 'cheer';
    ch.setExpression('happy');
    await this.say(`${ch.def.name} got a star!`, undefined, 1.6);
    ch.pose = 'idle';
    await this.moveStar(false);
    this.focus(ch.position);
  }

  // ---------------------------------------------------------------- minigame + results

  private async minigame(): Promise<void> {
    this.focus(this.centroid());
    await this.say('Minigame time!', undefined, 1.0);
    await this.say('Real minigames arrive in the next update. For now: a lucky coin toss!', undefined, 1.8);
    const winners = this.players.filter(() => this.game.rng.next() < 0.4);
    if (winners.length === 0) winners.push(this.game.rng.pick(this.players));
    for (const p of this.players) {
      if (winners.includes(p)) {
        p.stats.minigameCoins += 10;
        void this.changeCoins(p, 10);
      } else {
        p.character.pose = 'sulk';
        p.character.setExpression('sad');
      }
    }
    await this.say(`${winners.map((w) => w.character.def.name).join(' and ')} win${winners.length === 1 ? 's' : ''} 10 coins!`, undefined, 1.6);
    for (const p of this.players) {
      p.character.pose = 'idle';
      p.character.setExpression('neutral');
    }
  }

  private async results(): Promise<void> {
    this.star.visible = false;
    const ranks = rank(this.players);
    const order = this.players.map((p, i) => ({ p, r: ranks[i] })).sort((a, b) => a.r - b.r);
    const winners = order.filter((o) => o.r === 1).map((o) => o.p);
    this.focus(winners[0].character.position);
    for (const { p, r } of order) {
      p.character.pose = r === 1 ? 'cheer' : 'idle';
      p.character.setExpression(r === 1 ? 'happy' : r === 4 ? 'sad' : 'neutral');
    }
    this.game.audio.play('star');
    const panel = this.game.ui.add('results panel');
    panel.innerHTML =
      '<div class="name" style="font-size:26px;text-align:center;margin-bottom:6px">Final results</div>' +
      order.map(({ p, r }) => `<div class="row"><b>${r}. ${p.character.def.name}</b><span>★ ${p.stars} &nbsp; ● ${p.coins}</span></div>`).join('');
    await this.say(`${winners.map((w) => w.character.def.name).join(' and ')} win${winners.length === 1 ? 's' : ''}! Press A to return to the title.`);
    await this.tasks.until(() => this.game.input.controllers.some((c) => c.pressed('a') || c.pressed('start')));
    this.game.scenes.go(new TitleScene());
  }

  // ---------------------------------------------------------------- helpers

  /** Shows a dialog line; continues on A (any human) or after `auto` seconds. */
  private async say(text: string, speaker?: string, auto = 2.2): Promise<void> {
    this.hud.say(text, speaker);
    let t = 0;
    await this.tasks.until((dt) => {
      t += dt;
      const skip = t > 0.25 && this.game.session.humans.some((s) => s.controller!.pressed('a'));
      return skip || t >= auto;
    });
    this.hud.hideDialog();
  }

  /** Human picks with left/right + A; CPUs answer `cpuChoice` after a beat. */
  private async ask(p: BoardPlayer, text: string, options: string[], cpuChoice: number): Promise<number> {
    const c = p.seat.controller;
    let sel = 0;
    this.hud.choices(text, options, sel);
    if (!c) {
      await this.tasks.sleep(0.8);
      sel = cpuChoice;
      this.hud.choices(text, options, sel);
      await this.tasks.sleep(0.5);
    } else {
      let latch = false;
      await this.tasks.until(() => {
        const x = c.stickX;
        if (Math.abs(x) > 0.5 && !latch) {
          sel = (sel + (x > 0 ? 1 : options.length - 1)) % options.length;
          this.game.audio.play('select');
          this.hud.choices(text, options, sel);
        }
        latch = Math.abs(x) > 0.5;
        if (c.pressed('b')) sel = options.length - 1;
        return c.pressed('a') || c.pressed('b');
      });
    }
    this.game.audio.play('confirm');
    this.hud.hideDialog();
    return sel;
  }

  /** Waits for A from a human, or `cpuDelay` seconds for a CPU. */
  private waitPress(c: Controller | null, cpuDelay: number): Promise<void> {
    if (!c) return this.tasks.sleep(cpuDelay);
    return this.tasks.until(() => c.pressed('a'));
  }

  private focus(p: THREE.Vector3): void {
    this.camTarget.copy(p).setY(0);
  }

  private centroid(): THREE.Vector3 {
    const c = new THREE.Vector3();
    for (const p of this.players) c.add(p.character.position);
    return c.divideScalar(this.players.length);
  }

  /** Players sharing a space stand in a little cluster instead of overlapping. */
  private spreadPlayers(instant: boolean): void {
    const groups = new Map<number, BoardPlayer[]>();
    for (const p of this.players) {
      const list = groups.get(p.spaceId) ?? [];
      list.push(p);
      groups.set(p.spaceId, list);
    }
    for (const [id, list] of groups) {
      const base = this.spaces[id].pos;
      list.forEach((p, i) => {
        const offset =
          list.length === 1 ? new THREE.Vector3() : new THREE.Vector3(Math.cos((i / list.length) * Math.PI * 2) * 0.55, 0, Math.sin((i / list.length) * Math.PI * 2) * 0.55);
        const target = base.clone().add(offset).setY(SPACE_TOP);
        if (instant) p.character.position.copy(target);
        else p.character.userData.slide = target;
      });
    }
  }

  private refreshHud(): void {
    this.hud.setPlayers(
      this.players.map((p) => ({ character: p.character, coins: p.coins, stars: p.stars, cpu: !p.seat.controller })),
      this.active,
    );
  }

  update(dt: number): void {
    this.t += dt;
    this.tasks.update(dt);
    this.board.updateScenery?.(this.t);

    for (const [i, p] of this.players.entries()) {
      const slide = p.character.userData.slide as THREE.Vector3 | undefined;
      if (slide) {
        p.character.position.lerp(slide, Math.min(1, dt * 8));
        if (p.character.position.distanceTo(slide) < 0.01) delete p.character.userData.slide;
      }
      // Idle players turn back toward the camera.
      if (i !== this.active && p.character.pose === 'idle') {
        const r = p.character.rotation;
        r.y = Math.atan2(Math.sin(r.y), Math.cos(r.y));
        r.y += (0 - r.y) * Math.min(1, dt * 4);
      }
      p.character.update(dt);
    }

    this.dice.update(dt, this.t);
    if (this.star.visible) {
      this.star.rotation.y = this.t * 2;
    }

    // Smooth follow camera.
    this.camFocus.lerp(this.camTarget, Math.min(1, dt * 3));
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 2);
    this.camera.position.copy(this.camFocus).addScaledVector(CAMERA_OFFSET, this.zoom);
    this.camera.lookAt(this.camFocus.x, 0.5, this.camFocus.z);
    this.hud.update();
  }
}
