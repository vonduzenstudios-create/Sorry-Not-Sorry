import * as THREE from 'three';
import { distance } from '../board/graph';
import { makeGrudge } from '../board/grudge';
import { Hud, rank } from '../board/hud';
import { DiceBlock } from '../board/dice';
import { makeGate } from '../board/gate';
import { ITEM_IDS, ITEMS, rollItem, type ItemId } from '../board/items';
import { BOARDS } from '../board';
import type { BoardDef, Space } from '../board/types';
import { buildSpaces, SPACE_TOP } from '../board/view';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Seat } from '../core/session';
import { easeOut, easeOutBack, linear, Tasks } from '../core/tasks';
import type { Controller } from '../input/input';
import { MINIGAMES } from '../minigames';
import { makeMinigamePlayers } from '../minigames/players';
import { MinigameRunner } from '../minigames/runner';
import type { MinigameDef, MinigameKind, MinigameMode, MinigamePlayer } from '../minigames/types';
import { addLights, skyDome } from '../render/environment';
import { Palette } from '../render/palette';
import { makeStar } from '../render/props';
import { EndingScene, type FinalPlayer } from './ending';

const STAR_COST = 20;
const START_COINS = 10;
const CAMERA_OFFSET = new THREE.Vector3(0, 16, 14);
const SUN_OFFSET = new THREE.Vector3(8, 14, 6);

export interface BoardPlayer {
  seat: Seat;
  character: Character;
  spaceId: number;
  coins: number;
  stars: number;
  /** Held item; MP2 rules, one at a time. */
  item: ItemId | null;
  /** Stats for end-of-game bonus stars and the results card. */
  stats: PlayerStats;
}

/** Everything the turn flow depends on; online, guests adopt the host's at checkpoints. */
interface BoardSnapshot {
  rng: number;
  starSpace: number;
  roundColors: ('blue' | 'red')[];
  lastMinigame: string;
  lastFive: boolean;
  players: { spaceId: number; coins: number; stars: number; item: ItemId | null; stats: PlayerStats }[];
}

export interface PlayerStats {
  minigameCoins: number;
  minigamesWon: number;
  maxCoins: number;
  happenings: number;
  itemsUsed: number;
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
  private sun!: THREE.DirectionalLight;
  private alive = true;
  private runner!: MinigameRunner;
  /** Color each player landed on this round; decides the minigame type. */
  private roundColors: ('blue' | 'red')[] = [];
  private lastMinigame = '';
  /** Last-5-turns event fired: blue and red spaces count double. */
  private lastFive = false;
  private gates = new Map<number, ReturnType<typeof makeGate>>();

  enter(game: Game): void {
    this.game = game;
    this.board = (BOARDS[game.session.boardId] ?? BOARDS.pirate)();
    this.spaces = this.board.spaces;

    this.scene.add(skyDome(...this.board.sky));
    this.sun = addLights(this.scene);
    // The sun's shadow box is small, so it follows the camera round the board.
    this.scene.add(this.sun.target);
    this.board.buildScenery(this.scene, this.spaces);
    this.scene.add(buildSpaces(this.spaces));
    this.buildGates();

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
        item: null,
        stats: { minigameCoins: 0, minigamesWon: 0, maxCoins: START_COINS, happenings: 0, itemsUsed: 0 },
      });
    }
    this.spreadPlayers(true);

    this.runner = new MinigameRunner(game);
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
      if (turns >= 10 && this.turn === turns - 4) await this.lastFiveEvent();
      for (let i = 0; i < this.players.length; i++) {
        await this.checkpoint(`turn${this.turn}-p${i}`);
        this.active = i;
        this.refreshHud();
        await this.playerTurn(this.players[i]);
      }
      this.active = -1;
      this.refreshHud();
      await this.checkpoint(`turn${this.turn}-minigame`);
      await this.minigame();
    }
    await this.checkpoint('results');
    await this.results();
  }

  private async playerTurn(p: BoardPlayer): Promise<void> {
    this.focus(p.character.position);
    await this.say(`${p.character.def.name}'s turn!`, undefined, 1.0);

    const dice = await this.itemPhase(p);
    let roll = 0;
    for (let i = 0; i < dice; i++) roll += await this.rollDice(p, dice > 1 ? `Die ${i + 1} of ${dice}` : undefined);
    if (dice > 1) await this.say(`${roll} spaces in total!`, undefined, 1.0);
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
      if (this.spaces[nextId].type === 'shop') await this.shop(p);
    }
    counter.remove();
    await this.land(p);
    p.character.pose = 'idle';
    p.character.setExpression('neutral');
    this.spreadPlayers(false);
  }

  private async rollDice(p: BoardPlayer, which?: string): Promise<number> {
    const ch = p.character;
    this.dice.position.copy(ch.position).add(new THREE.Vector3(0, 3, 0));
    this.dice.scale.setScalar(0.01);
    this.dice.visible = true;
    this.dice.rolling = true;
    await this.tasks.tween(0.25, (k) => this.dice.scale.setScalar(Math.max(0.01, k)), easeOutBack);
    const prompt = p.seat.controller ? 'Press A to hit the dice block!' : `${ch.def.name} is rolling...`;
    this.hud.say(which ? `${which}: ${prompt}` : prompt);
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
    const hasKey = p.item === 'key';
    const options = here.next.filter((id) => !this.spaces[id].gate || hasKey);
    if (options.length === 1) {
      if (p.seat.controller) await this.say('The shortcut gate is locked. A Skeleton Key would open it!', undefined, 1.4);
      return options[0];
    }
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
    const chosen = options[pick];
    if (this.spaces[chosen].gate) await this.unlockGate(p, chosen);
    return chosen;
  }

  private buildGates(): void {
    for (const s of this.spaces) {
      if (!s.gate) continue;
      const from = this.spaces.find((o) => o.next.includes(s.id))!;
      const gate = makeGate();
      gate.position.lerpVectors(from.pos, s.pos, 0.55).setY(0);
      gate.rotation.y = Math.atan2(s.pos.x - from.pos.x, s.pos.z - from.pos.z);
      this.scene.add(gate);
      this.gates.set(s.id, gate);
    }
  }

  /** Uses up the key and swings the gate open; it shuts again behind the player. */
  private async unlockGate(p: BoardPlayer, id: number): Promise<void> {
    const gate = this.gates.get(id)!;
    p.item = null;
    p.stats.itemsUsed++;
    this.refreshHud();
    this.focus(gate.position);
    this.game.audio.play('join');
    await this.say(`${p.character.def.name} opens the gate with the Skeleton Key!`, undefined, 1.2);
    await this.tasks.tween(0.5, (k) => gate.open(k), easeOut);
    this.focus(p.character.position);
    // Shut again a moment after the player walks through.
    void this.tasks.sleep(1.2).then(() => this.tasks.tween(0.5, (k) => gate.open(1 - k), easeOut));
  }

  // ---------------------------------------------------------------- spaces

  private async land(p: BoardPlayer): Promise<void> {
    const space = this.spaces[p.spaceId];
    const bonus = this.lastFive ? 2 : 1;
    // Blue and red count as themselves; event spaces count as a random color.
    const seat = this.players.indexOf(p);
    this.roundColors[seat] =
      space.type === 'blue' || space.type === 'start'
        ? 'blue'
        : space.type === 'red' || space.type === 'villain'
          ? 'red'
          : this.game.rng.pick(['blue', 'red'] as const);
    switch (space.type) {
      case 'blue':
      case 'start':
        await this.changeCoins(p, 3 * bonus);
        break;
      case 'red':
        await this.changeCoins(p, -3 * bonus);
        break;
      case 'happening':
        await this.happening(p);
        break;
      case 'villain':
        await this.villain(p);
        break;
      case 'item':
        await this.itemSpace(p);
        break;
      case 'battle':
        await this.battle(p);
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
    if (this.board.happening.style === 'warp') {
      await this.warp(p, dest.id);
      this.focus(p.character.position);
      await this.tasks.sleep(0.4);
      if (dest.id === this.starSpace) await this.offerStar(p);
      return;
    }
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

  private async grudgeIn(near: THREE.Vector3): Promise<void> {
    const g = this.grudge;
    g.position.copy(near).add(new THREE.Vector3(-2.2, 0, -0.6));
    g.rotation.y = 0.6;
    g.scale.setScalar(0.01);
    g.visible = true;
    this.game.audio.play('boom');
    await this.tasks.tween(0.4, (k) => g.scale.setScalar(Math.max(0.01, k)), easeOutBack);
  }

  private async grudgeOut(): Promise<void> {
    const g = this.grudge;
    await this.tasks.tween(0.3, (k) => g.scale.setScalar(Math.max(0.01, 1 - k)));
    g.visible = false;
  }

  private async villain(p: BoardPlayer): Promise<void> {
    const ch = p.character;
    await this.grudgeIn(ch.position);
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
    await this.grudgeOut();
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

  // ---------------------------------------------------------------- items

  /** Offers the held item before the roll. Returns how many dice to roll. */
  private async itemPhase(p: BoardPlayer): Promise<number> {
    if (!p.item || ITEMS[p.item].passive) return 1;
    const it = ITEMS[p.item];
    const name = p.character.def.name;
    const rivals = this.players.filter((o) => o !== p);
    // Items that need a target are only offered when one exists.
    if (p.item === 'chest' && !rivals.some((o) => o.item)) return 1;

    let use: boolean;
    if (p.seat.controller) {
      use = (await this.ask(p, `Use your ${it.name}? ${it.description}`, ['Use it', 'Save it'], 0)) === 0;
    } else {
      use = this.cpuWantsItem(p);
    }
    if (!use) return 1;

    const id = p.item;
    p.item = null;
    p.stats.itemsUsed++;
    this.refreshHud();
    this.game.audio.play('join');
    p.character.pose = 'cheer';
    await this.say(`${name} uses the ${it.name}!`, undefined, 1.2);
    p.character.pose = 'idle';
    switch (id) {
      case 'turbo':
        return 2;
      case 'gold':
        return 3;
      case 'swap':
        await this.swapPlaces(p, this.game.rng.pick(rivals));
        break;
      case 'glove':
        await this.duel(p);
        break;
      case 'chest':
        await this.pickpocket(p);
        break;
      case 'lamp':
        await this.warp(p, this.starSpace);
        await this.offerStar(p);
        break;
    }
    this.focus(p.character.position);
    return 1;
  }

  private cpuWantsItem(p: BoardPlayer): boolean {
    const rivals = this.players.filter((o) => o !== p);
    switch (p.item) {
      case 'turbo':
      case 'gold':
        return true;
      case 'swap':
        return rank(this.players)[this.players.indexOf(p)] >= 3 && this.game.rng.next() < 0.6;
      case 'glove':
        return p.coins >= 5 && rivals.some((o) => o.coins >= 10);
      case 'chest':
        return rivals.some((o) => o.item);
      case 'lamp':
        return p.coins >= STAR_COST;
      default:
        return false;
    }
  }

  /** Gives an item; if the player already holds one they choose which to keep. */
  private async giveItem(p: BoardPlayer, id: ItemId): Promise<void> {
    const held = p.item;
    if (held && held !== id) {
      const keep = ITEMS[held];
      const take = ITEMS[id];
      // CPUs keep whichever is worth more.
      const swap = await this.ask(p, `You can only carry one item. Keep the ${keep.name} or take the ${take.name}?`, [`Keep ${keep.name}`, `Take ${take.name}`], take.price > keep.price ? 1 : 0);
      if (swap !== 1) return;
    }
    p.item = id;
    this.refreshHud();
  }

  private async itemSpace(p: BoardPlayer): Promise<void> {
    const ch = p.character;
    ch.setExpression('surprised');
    // Roulette: flick through item names, slowing down.
    const final = rollItem(this.game.rng.next());
    let delay = 0.05;
    for (let i = 0; i < 12; i++) {
      const id = i === 11 ? final : ITEM_IDS[(i * 3 + this.game.rng.int(0, 6)) % ITEM_IDS.length];
      this.hud.say(`Item roulette... <b>${ITEMS[id].name}</b>`);
      this.game.audio.play('select');
      await this.tasks.sleep(delay);
      delay *= 1.25;
    }
    const it = ITEMS[final];
    this.game.audio.play('coin');
    ch.pose = 'cheer';
    ch.setExpression('happy');
    await this.say(`${ch.def.name} got a ${it.name}! ${it.description}`, undefined, 1.8);
    ch.pose = 'idle';
    await this.giveItem(p, final);
  }

  /** Passing or landing on the shop. One item at a time, MP2 style. */
  private async shop(p: BoardPlayer): Promise<void> {
    const human = !!p.seat.controller;
    const cheapest = Math.min(...ITEM_IDS.map((id) => ITEMS[id].price));
    if (p.item) {
      if (human) await this.say(`The shop! But ${p.character.def.name} already carries an item.`, 'Shopkeeper', 1.2);
      return;
    }
    if (p.coins < cheapest) {
      if (human) await this.say('Come back when you have some coins!', 'Shopkeeper', 1.2);
      return;
    }
    // Three random items on the shelf today, cheapest first.
    const stock = [...ITEM_IDS].sort(() => this.game.rng.next() - 0.5).slice(0, 3).sort((a, b) => ITEMS[a].price - ITEMS[b].price);
    // CPUs buy the priciest thing that still leaves 10 coins toward a star.
    const affordable = stock.map((id, i) => ({ id, i })).filter(({ id }) => p.coins - ITEMS[id].price >= 10);
    const cpuPick = affordable.length ? affordable[affordable.length - 1].i : stock.length;
    if (!human && cpuPick === stock.length) return;

    this.focus(p.character.position);
    const options = [...stock.map((id) => `${ITEMS[id].name} ●${ITEMS[id].price}`), 'Leave'];
    const describe = (sel: number) =>
      sel < stock.length ? `<b>Welcome to the shop!</b> ${ITEMS[stock[sel]].description}` : '<b>Welcome to the shop!</b> Just looking?';
    const pick = await this.ask(p, describe, options, cpuPick);
    if (pick >= stock.length) return;
    const it = ITEMS[stock[pick]];
    if (p.coins < it.price) {
      await this.say(`You need ${it.price} coins for that!`, 'Shopkeeper', 1.2);
      return;
    }
    await this.changeCoins(p, -it.price);
    p.item = it.id;
    this.refreshHud();
    await this.say(`${p.character.def.name} bought a ${it.name}!`, 'Shopkeeper', 1.2);
  }

  /** Shrink, move, pop back up. */
  private async warp(p: BoardPlayer, spaceId: number): Promise<void> {
    const ch = p.character;
    this.game.audio.play('jump');
    await this.tasks.tween(0.3, (k) => ch.scale.setScalar(Math.max(0.01, 1 - k)));
    p.spaceId = spaceId;
    ch.position.copy(this.spaces[spaceId].pos).setY(SPACE_TOP);
    this.focus(ch.position);
    await this.tasks.sleep(0.4);
    this.game.audio.play('star');
    await this.tasks.tween(0.35, (k) => ch.scale.setScalar(Math.max(0.01, k)), easeOutBack);
    ch.land();
    this.spreadPlayers(false);
  }

  private async swapPlaces(p: BoardPlayer, other: BoardPlayer): Promise<void> {
    const a = p.spaceId;
    const b = other.spaceId;
    await this.say(`${p.character.def.name} swaps places with ${other.character.def.name}!`, undefined, 1.2);
    await Promise.all([this.warp(p, b), this.warp(other, a)]);
    other.character.setExpression('sad');
    this.focus(p.character.position);
    await this.tasks.sleep(0.6);
    other.character.setExpression('neutral');
  }

  private async pickpocket(p: BoardPlayer): Promise<void> {
    const marks = this.players.filter((o) => o !== p && o.item);
    let victim = this.game.rng.pick(marks);
    if (p.seat.controller && marks.length > 1) {
      victim = marks[await this.ask(p, 'Whose item will you pinch?', marks.map((m) => `${m.character.def.name} (${ITEMS[m.item!].name})`), 0)];
    }
    const id = victim.item!;
    victim.item = null;
    p.item = id;
    this.refreshHud();
    this.focus(victim.character.position);
    victim.character.setExpression('sad');
    victim.character.pose = 'sulk';
    this.game.audio.play('coin');
    await this.say(`${p.character.def.name} pinched ${victim.character.def.name}'s ${ITEMS[id].name}! Sorry, not sorry.`, undefined, 1.8);
    victim.character.pose = 'idle';
    victim.character.setExpression('neutral');
  }

  /** Duel Glove: pick a rival and a wager, then play a 1-on-1 minigame. */
  private async duel(p: BoardPlayer): Promise<void> {
    const rivals = this.players.filter((o) => o !== p);
    let foe: BoardPlayer;
    let wager: number;
    if (p.seat.controller) {
      foe = rivals[await this.ask(p, 'Who will you challenge?', rivals.map((r) => `${r.character.def.name} ●${r.coins}`), 0)];
      wager = [5, 10, 20][await this.ask(p, 'How many coins are on the line?', ['5', '10', '20'], 1)];
    } else {
      foe = rivals.reduce((a, b) => (b.coins > a.coins ? b : a));
      wager = 10;
    }
    const stake = Math.min(wager, p.coins, foe.coins);
    this.focus(foe.character.position);
    foe.character.setExpression('determined');
    await this.say(
      stake > 0
        ? `${p.character.def.name} challenges ${foe.character.def.name} to a duel for ${stake} coins!`
        : `${p.character.def.name} challenges ${foe.character.def.name} to a duel for bragging rights!`,
      undefined,
      1.8,
    );
    const seats = [this.players.indexOf(p), this.players.indexOf(foe)];
    const options = MINIGAMES.filter((m) => m.duel);
    const def = this.game.rng.pick(options);
    const teams = this.players.map((_, i) => (i === seats[0] ? 0 : 1));
    const winners = await this.playMinigame(def, makeMinigamePlayers(this.game.session.seats, teams, seats), 'duel');

    if (winners.length === 1) {
      const winner = this.players[winners[0]];
      const loser = winner === p ? foe : p;
      winner.stats.minigamesWon++;
      winner.stats.minigameCoins += stake;
      this.focus(winner.character.position);
      await this.say(`${winner.character.def.name} wins the duel${stake ? ` and takes ${stake} coins` : ''}!`, undefined, 1.4);
      if (stake) {
        void this.changeCoins(loser, -stake);
        await this.changeCoins(winner, stake);
      }
    } else {
      await this.say("It's a draw! Everyone keeps their coins.", undefined, 1.4);
    }
  }

  // ---------------------------------------------------------------- events

  /** Everyone chips into a pot; the battle minigame's winners split it. */
  private async battle(p: BoardPlayer): Promise<void> {
    p.character.setExpression('surprised');
    this.game.audio.play('boom');
    this.hud.banner('BATTLE!');
    const stake = this.game.rng.pick([5, 10, 20]);
    await this.say(`A battle minigame! Everyone puts ${stake} coins into the pot!`, undefined, 1.8);
    let pot = 0;
    for (const o of this.players) {
      const take = Math.min(o.coins, stake);
      pot += take;
      if (take) void this.changeCoins(o, -take);
    }
    this.focus(this.centroid());
    await this.tasks.sleep(1.1);
    if (pot === 0) {
      await this.say('Nobody has any coins! The battle is called off.', undefined, 1.4);
      return;
    }
    const def = this.pickMinigame('ffa');
    const winners = await this.playMinigame(def, makeMinigamePlayers(this.game.session.seats, [0, 1, 2, 3]), 'battle');
    if (winners.length === 0) {
      await this.say(`No winner... the Grudge pockets all ${pot} coins!`, 'The Grudge', 1.6);
      return;
    }
    const share = Math.floor(pot / winners.length);
    await this.say(`${this.names(winners)} win${winners.length === 1 ? 's' : ''} the pot: ${share} coins${winners.length > 1 ? ' each' : ''}!`, undefined, 1.6);
    for (const seat of winners) {
      const w = this.players[seat];
      w.stats.minigamesWon++;
      w.stats.minigameCoins += share;
      void this.changeCoins(w, share);
    }
    await this.tasks.sleep(1);
  }

  /** The Grudge shakes things up for the final stretch. */
  private async lastFiveEvent(): Promise<void> {
    this.lastFive = true;
    const ranks = rank(this.players);
    const worst = Math.max(...ranks);
    const losers = this.players.filter((_, i) => ranks[i] === worst);
    this.focus(losers[0].character.position);
    this.hud.banner('Last 5 turns!', 2600);
    await this.grudgeIn(losers[0].character.position);
    await this.say("Bwahaha! It's the last 5 turns! Time to stir things up!", 'The Grudge', 2);
    await this.say(`${losers.map((l) => l.character.def.name).join(' and ')} in last place get${losers.length === 1 ? 's' : ''} 10 coins. Sorry, not sorry, everyone else!`, 'The Grudge', 2);
    for (const l of losers) void this.changeCoins(l, 10);
    await this.tasks.sleep(1);
    await this.say('And from now on, blue and red spaces are worth double!', 'The Grudge', 2);
    await this.grudgeOut();
  }

  // ---------------------------------------------------------------- minigame + results

  private pickMinigame(kind: MinigameKind): MinigameDef {
    const options = MINIGAMES.filter((m) => m.kind === kind);
    const fresh = options.filter((m) => m.id !== this.lastMinigame);
    const def = this.game.rng.pick(fresh.length ? fresh : options);
    this.lastMinigame = def.id;
    return def;
  }

  /** Plays a minigame and returns to the board view and music. */
  private async playMinigame(def: MinigameDef, players: MinigamePlayer[], mode: MinigameMode): Promise<number[]> {
    this.game.audio.stopSong();
    const winners = await this.runner.run(def, players, mode);
    this.game.renderer.setView(this.scene, this.camera);
    this.game.audio.playSong(this.board.song);
    for (const p of this.players) {
      p.character.pose = 'idle';
      p.character.setExpression('neutral');
    }
    return winners;
  }

  private async minigame(): Promise<void> {
    this.focus(this.centroid());
    const blues = this.players.map((_, i) => this.roundColors[i] ?? 'blue');
    const nBlue = blues.filter((c) => c === 'blue').length;
    const kind: MinigameKind = nBlue === 0 || nBlue === 4 ? 'ffa' : nBlue === 2 ? '2v2' : '1v3';
    // 2v2: blue team vs red team. 1v3: the odd color out goes solo (team 0).
    const soloColor = nBlue === 1 ? 'blue' : 'red';
    const teams = blues.map((c, i) => (kind === 'ffa' ? i : kind === '2v2' ? (c === 'blue' ? 0 : 1) : c === soloColor ? 0 : 1));
    const label = kind === 'ffa' ? 'a 4-player' : kind === '2v2' ? 'a 2 vs 2' : 'a 1 vs 3';
    await this.say(`Minigame time! It's ${label} minigame!`, undefined, 1.6);

    const def = this.pickMinigame(kind);
    const played = await this.playMinigame(def, makeMinigamePlayers(this.game.session.seats, teams), 'round');
    // Online, the host's result is the one that counts.
    const winners = await this.sync(`turn${this.turn}-winners`, played);
    this.roundColors = [];

    for (const seat of winners) {
      const p = this.players[seat];
      p.stats.minigameCoins += 10;
      p.stats.minigamesWon++;
      void this.changeCoins(p, 10);
    }
    if (winners.length) {
      await this.say(`${this.names(winners)} win${winners.length === 1 ? 's' : ''} 10 coins!`, undefined, 1.6);
    }
    for (const p of this.players) {
      p.character.pose = 'idle';
      p.character.setExpression('neutral');
    }
  }

  private async results(): Promise<void> {
    this.star.visible = false;
    this.focus(this.centroid());
    this.zoomTarget = 1.6;
    this.game.audio.play('boom');
    this.hud.banner('GAME OVER!', 2400);
    for (const p of this.players) p.character.pose = 'wave';
    await this.say("That's the final turn! Let's head to the results!", undefined, 2.4);
    const final: FinalPlayer[] = this.players.map((p) => ({
      characterId: p.seat.characterId,
      cpu: !p.seat.controller,
      stars: p.stars,
      coins: p.coins,
      stats: { ...p.stats },
    }));
    this.game.scenes.go(new EndingScene(final));
  }

  // ---------------------------------------------------------------- online

  /**
   * Online: waits until every peer reaches `key`, then everyone continues on
   * the same frame with the host's `data`. Offline it returns `data` at once.
   */
  private async sync<T>(key: string, data: T): Promise<T> {
    const net = this.game.net;
    if (!net) return data;
    net.barrier(key, data);
    await this.tasks.until(() => net.isReleased(key));
    return net.released(key) as T;
  }

  /** A turn boundary: everyone lines up and takes the host's board state. */
  private async checkpoint(key: string): Promise<void> {
    if (!this.game.net) return;
    this.restore(await this.sync(key, this.snapshot()));
  }

  private snapshot(): BoardSnapshot {
    return {
      rng: this.game.rng.seed,
      starSpace: this.starSpace,
      roundColors: [...this.roundColors],
      lastMinigame: this.lastMinigame,
      lastFive: this.lastFive,
      players: this.players.map((p) => ({ spaceId: p.spaceId, coins: p.coins, stars: p.stars, item: p.item, stats: { ...p.stats } })),
    };
  }

  private restore(s: BoardSnapshot): void {
    this.game.rng.reset(s.rng);
    if (s.starSpace !== this.starSpace && s.starSpace >= 0) {
      this.star.visible = true;
      this.star.position.copy(this.spaces[s.starSpace].pos).setY(2.2);
    }
    this.starSpace = s.starSpace;
    this.roundColors = [...s.roundColors];
    this.lastMinigame = s.lastMinigame;
    this.lastFive = s.lastFive;
    let moved = false;
    s.players.forEach((d, i) => {
      const p = this.players[i];
      moved ||= p.spaceId !== d.spaceId;
      Object.assign(p, { spaceId: d.spaceId, coins: d.coins, stars: d.stars, item: d.item, stats: { ...d.stats } });
    });
    if (moved) this.spreadPlayers(true);
    this.refreshHud();
  }

  digest(): number {
    let h = this.turn * 31 + this.active + this.starSpace * 7 + (this.runner?.active ? 1000 : 0);
    for (const p of this.players) h = Math.imul(h, 16777619) ^ (p.spaceId * 997 + p.coins * 31 + p.stars);
    return h >>> 0;
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

  /**
   * Human picks with left/right + A; CPUs answer `cpuChoice` after a beat.
   * `text` can depend on the highlighted option (shop descriptions).
   */
  private async ask(p: BoardPlayer, prompt: string | ((sel: number) => string), options: string[], cpuChoice: number): Promise<number> {
    const c = p.seat.controller;
    const text = (i: number) => (typeof prompt === 'string' ? prompt : prompt(i));
    let sel = 0;
    this.hud.choices(text(sel), options, sel);
    if (!c) {
      await this.tasks.sleep(0.8);
      sel = cpuChoice;
      this.hud.choices(text(sel), options, sel);
      await this.tasks.sleep(0.5);
    } else {
      let latch = false;
      await this.tasks.until(() => {
        const x = c.stickX;
        if (Math.abs(x) > 0.5 && !latch) {
          sel = (sel + (x > 0 ? 1 : options.length - 1)) % options.length;
          this.game.audio.play('select');
          this.hud.choices(text(sel), options, sel);
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

  private names(seats: number[]): string {
    return seats.map((s) => this.players[s].character.def.name).join(' & ');
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
      this.players.map((p) => ({ character: p.character, coins: p.coins, stars: p.stars, cpu: !p.seat.controller, item: p.item })),
      this.active,
    );
  }

  update(dt: number): void {
    if (this.runner.active) {
      this.runner.update(dt);
      return;
    }
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
    this.sun.target.position.set(this.camFocus.x, 0, this.camFocus.z);
    this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);
    this.hud.update();
  }
}
