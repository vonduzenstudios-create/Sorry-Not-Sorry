import * as THREE from 'three';
import { crateClimbTheme } from '../audio/songs/dropClimbThemes';
import { makeStar } from '../render/props';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const COLS = 9;
const CRATE = 1.2;
/** Stand on a stack this many crates tall to win. */
const GOAL = 8;
const SPEED = 4.2;
const JUMP_V = 9.2;
const GRAVITY = 30;
/** Half the player's width along X. */
const W = 0.28;
/** Head height: a crate falling below this (and above the feet) bonks. */
const HEAD = 1.5;
const FALL_SPEED = 8;
const SPAWN_Y = 16;
const DROP_EVERY = 0.3;
const TOPPLE_EVERY = 5;
const STUN = 1.1;
/** Seconds of shrugging off crates after a stun wears off. */
const GUARD = 1;
const KNOCK = 7;
const WOODS = [0xd9a066, 0xc98f58, 0xe6b67a, 0xb97f4a];

const colX = (c: number) => (c - (COLS - 1) / 2) * CRATE;
const colAt = (x: number) => Math.round(x / CRATE + (COLS - 1) / 2);

interface Falling {
  mesh: THREE.Group;
  col: number;
  /** Bottom of the crate. */
  y: number;
  /** Where it started sliding from, for toppled crates. */
  fromX: number;
  slide: number;
  marker: THREE.Mesh;
  /** Seats it already bonked. */
  hit: Set<number>;
}

/**
 * Crates rain from the crane onto the dock. Hop from stack to stack and be the
 * first to stand eight crates high. A crate on the head stuns you, and every
 * few seconds the tallest stack sheds its top crate.
 */
class CrateClimb extends Minigame {
  readonly timeLimit = 55;
  private stacks: THREE.Group[][] = [];
  private falling: Falling[] = [];
  private dropT = 0.6;
  private toppleT = TOPPLE_EVERY;
  private crateGeo = new THREE.BoxGeometry(CRATE * 0.98, CRATE * 0.98, CRATE * 1.6);
  private plankGeo = new THREE.BoxGeometry(CRATE * 1.02, 0.14, CRATE * 1.62);

  protected setup(): void {
    arenaBasics(this.scene, [0xffd7a8, 0xfff3e0], 0x4f9cc8, -3);
    for (let c = 0; c < COLS; c++) this.stacks.push([]);
    // The dock and its posts.
    const dock = toonMesh(new THREE.BoxGeometry(COLS * CRATE + 3, 0.5, 5), 0xa77650, { outline: 0.05 });
    dock.position.y = -0.25;
    this.scene.add(dock);
    for (let i = -1; i <= 1; i += 2) {
      for (let k = 0; k < 3; k++) {
        const post = toonMesh(new THREE.CylinderGeometry(0.22, 0.22, 3, 10), 0x8a5f3c, { outline: 0.03 });
        post.position.set(i * (COLS * CRATE * 0.5 + 1.2), -1.5, -1.8 + k * 1.8);
        this.scene.add(post);
      }
    }
    // Crane gantry the crates drop from.
    const beam = toonMesh(new THREE.BoxGeometry(COLS * CRATE + 4, 0.5, 0.6), Palette.coral, { outline: 0.05 });
    beam.position.set(0, SPAWN_Y + 1.6, -0.6);
    this.scene.add(beam);
    for (let i = -1; i <= 1; i += 2) {
      const leg = toonMesh(new THREE.BoxGeometry(0.5, SPAWN_Y + 2, 0.5), Palette.coral, { outline: 0.05 });
      leg.position.set(i * (COLS * CRATE * 0.5 + 1.6), (SPAWN_Y + 1.6) / 2, -0.6);
      this.scene.add(leg);
    }
    // The goal line: a ribbon of stars at the winning height.
    for (let c = -1; c <= COLS; c++) {
      const star = makeStar(0.28);
      star.position.set(colX(c), GOAL * CRATE + 0.6, -1.4);
      this.scene.add(star);
    }
    const ribbon = toonMesh(new THREE.BoxGeometry(COLS * CRATE + 2.4, 0.08, 0.08), Palette.yellow, { outline: false });
    ribbon.position.set(0, GOAL * CRATE, -1.4);
    this.scene.add(ribbon);

    // A few low stacks to start on.
    for (let c = 0; c < COLS; c++) {
      const h = c % 2 ? this.game.rng.int(0, 1) : this.game.rng.int(0, 2);
      for (let k = 0; k < h; k++) this.place(c, this.crate());
    }

    const spread = [1, 3, 5, 7];
    this.players.forEach((p, i) => {
      const c = this.players.length === 2 ? [2, 6][i] : spread[i];
      p.character.position.set(colX(c), this.top(c), -0.45 + i * 0.3);
      p.character.rotation.y = 0;
      p.data.vy = 0;
      p.data.stun = 0;
      p.data.guard = 0;
      p.data.kx = 0;
      p.data.think = 0;
      p.data.target = c;
    });
    this.camera.position.set(0, 9, 27);
    this.camera.lookAt(0, 6.8, 0);
  }

  private crate(): THREE.Group {
    const g = new THREE.Group();
    g.add(toonMesh(this.crateGeo, WOODS[this.game.rng.int(0, WOODS.length - 1)], { outline: 0.04 }));
    for (const y of [-0.38, 0.38]) {
      const plank = toonMesh(this.plankGeo, 0x8a5f3c, { outline: false });
      plank.position.y = y * CRATE;
      g.add(plank);
    }
    this.scene.add(g);
    return g;
  }

  private place(c: number, g: THREE.Group): void {
    g.position.set(colX(c), this.stacks[c].length * CRATE + CRATE / 2, 0);
    this.stacks[c].push(g);
  }

  private height(c: number): number {
    return c < 0 || c >= COLS ? Infinity : this.stacks[c].length;
  }

  private top(c: number): number {
    return this.height(c) * CRATE;
  }

  /** Columns a player at `x` overlaps. */
  private under(x: number): number[] {
    const a = colAt(x - W);
    const b = colAt(x + W);
    return a === b ? [a] : [a, b];
  }

  private ground(x: number): number {
    return Math.max(...this.under(x).map((c) => this.top(c)));
  }

  private spawn(col: number, y: number, fromX = colX(col), mesh = this.crate()): void {
    const marker = toonMesh(new THREE.CircleGeometry(0.42, 16), Palette.ink, { outline: false });
    (marker.material as THREE.Material).transparent = true;
    (marker.material as THREE.Material).opacity = 0.35;
    marker.rotation.x = -Math.PI / 2;
    this.scene.add(marker);
    mesh.position.set(fromX, y + CRATE / 2, 0);
    this.falling.push({ mesh, col, y, fromX, slide: fromX === colX(col) ? 1 : 0, marker, hit: new Set() });
  }

  /** Where the next crate goes: usually the lower of two picks, sometimes right onto a climber. */
  private dropCrate(): void {
    const rng = this.game.rng;
    let col: number;
    const alive = this.players;
    if (rng.next() < 0.15) {
      col = THREE.MathUtils.clamp(colAt(alive[rng.int(0, alive.length - 1)].character.position.x), 0, COLS - 1);
    } else {
      const a = rng.int(0, COLS - 1);
      const b = rng.int(0, COLS - 1);
      col = this.stacks[a].length <= this.stacks[b].length ? a : b;
    }
    if (this.stacks[col].length >= GOAL + 1) return;
    this.spawn(col, SPAWN_Y);
  }

  /** The tallest stack sheds its top crate onto a lower neighbour. */
  private topple(): void {
    let best = -1;
    for (let c = 0; c < COLS; c++) if (this.stacks[c].length >= 3 && (best < 0 || this.stacks[c].length > this.stacks[best].length)) best = c;
    if (best < 0) return;
    const l = this.height(best - 1);
    const r = this.height(best + 1);
    const to = l === r ? best + (this.game.rng.next() < 0.5 ? -1 : 1) : l < r ? best - 1 : best + 1;
    const mesh = this.stacks[best].pop()!;
    this.spawn(to, this.stacks[best].length * CRATE, colX(best), mesh);
    this.game.audio.play('back');
  }

  /** Best column to head for: tall, near, and reachable a crate at a time. */
  private plan(p: MinigamePlayer): number {
    const here = THREE.MathUtils.clamp(colAt(p.character.position.x), 0, COLS - 1);
    let best = here;
    let bestScore = this.height(here);
    for (const dir of [-1, 1]) {
      let h = this.height(here);
      for (let c = here + dir; c >= 0 && c < COLS; c += dir) {
        const ch = this.height(c);
        if (ch > h + 1) break;
        h = ch;
        const score = ch - Math.abs(c - here) * 0.3;
        if (score > bestScore + 0.2) {
          bestScore = score;
          best = c;
        }
      }
    }
    return best;
  }

  /** A crate is about to land on this column at about head height. */
  private threat(c: number, feet: number): boolean {
    return this.falling.some((f) => f.col === c && f.y > feet && (f.y - feet - HEAD) / FALL_SPEED < 0.55);
  }

  private cpu(p: MinigamePlayer, dt: number): { move: number; jump: boolean } {
    const pos = p.character.position;
    const here = THREE.MathUtils.clamp(colAt(pos.x), 0, COLS - 1);
    p.data.think = (p.data.think as number) - dt;
    if ((p.data.think as number) <= 0) {
      p.data.think = 0.3 + (p.seat % 3) * 0.08;
      const rng = this.game.rng;
      let target = this.plan(p);
      // Step aside from a crate overhead (most of the time).
      if (this.threat(here, pos.y) && rng.next() < 0.8) {
        const sides = [here - 1, here + 1].filter((c) => this.height(c) <= this.height(here) + 1);
        if (sides.length) target = sides[rng.int(0, sides.length - 1)];
      }
      p.data.target = target;
    }
    const target = p.data.target as number;
    const dx = colX(target) - pos.x;
    const move = Math.abs(dx) < 0.12 ? 0 : Math.sign(dx);
    const next = here + Math.sign(dx);
    const wall = move !== 0 && this.top(next) > pos.y + 0.05 && Math.abs(colX(here) - pos.x) < CRATE * 0.45;
    return { move, jump: wall };
  }

  play(dt: number): void {
    this.dropT -= dt;
    if (this.dropT <= 0) {
      this.dropT = DROP_EVERY;
      this.dropCrate();
    }
    this.toppleT -= dt;
    if (this.toppleT <= 0) {
      this.toppleT = TOPPLE_EVERY;
      this.topple();
    }

    for (const p of this.players) {
      const c = p.character;
      const pos = c.position;
      let move = 0;
      let jump = false;
      const stunned = (p.data.stun as number) > 0;
      if (stunned) {
        p.data.stun = (p.data.stun as number) - dt;
        if ((p.data.stun as number) <= 0) {
          c.setExpression('determined');
          p.data.guard = GUARD;
        }
      } else if (p.controller) {
        p.data.guard = (p.data.guard as number) - dt;
        move = stick(p).x;
        if (Math.abs(move) < 0.2) move = 0;
        jump = p.controller.pressed('a');
      } else {
        p.data.guard = (p.data.guard as number) - dt;
        ({ move, jump } = this.cpu(p, dt));
      }

      // Sideways, stopping at any stack taller than our feet.
      const kx = p.data.kx as number;
      p.data.kx = kx * Math.max(0, 1 - dt * 4);
      const vx = move * SPEED + kx;
      let nx = pos.x + vx * dt;
      if (vx > 0) {
        const edge = colAt(nx + W);
        if (this.top(edge) > pos.y + 0.05) nx = Math.min(nx, colX(edge) - CRATE / 2 - W - 0.001);
      } else if (vx < 0) {
        const edge = colAt(nx - W);
        if (this.top(edge) > pos.y + 0.05) nx = Math.max(nx, colX(edge) + CRATE / 2 + W + 0.001);
      }
      pos.x = nx;
      face(p, new THREE.Vector3(move, 0, move === 0 ? 1 : 0), dt);

      const floor = this.ground(pos.x);
      const grounded = pos.y <= floor + 0.001 && (p.data.vy as number) <= 0;
      if (grounded && jump) {
        p.data.vy = JUMP_V;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      if (!grounded || (p.data.vy as number) > 0) {
        p.data.vy = (p.data.vy as number) - GRAVITY * dt;
        pos.y += (p.data.vy as number) * dt;
        if (pos.y <= floor) {
          pos.y = floor;
          p.data.vy = 0;
          c.land();
          if (c.pose === 'jump') c.pose = 'idle';
        }
      } else {
        pos.y = floor;
        if (!stunned) moveAnim(p, Math.abs(move));
      }
    }

    this.updateFalling(dt);

    const winners = this.players.filter((p) => p.character.position.y >= GOAL * CRATE - 0.01 && (p.data.vy as number) === 0);
    if (winners.length) this.finish(winners);
  }

  private updateFalling(dt: number): void {
    for (const f of [...this.falling]) {
      f.y -= FALL_SPEED * dt;
      f.slide = Math.min(1, f.slide + dt * 4);
      const x = THREE.MathUtils.lerp(f.fromX, colX(f.col), f.slide);
      const land = this.top(f.col);
      f.marker.position.set(colX(f.col), land + 0.02, 0.81);
      f.mesh.position.set(x, Math.max(f.y, land) + CRATE / 2, 0);

      // Bonk anyone it comes down on: stunned and knocked toward the lower side.
      for (const p of this.players) {
        const pos = p.character.position;
        if (f.hit.has(p.seat) || Math.abs(pos.x - x) > CRATE / 2 + W - 0.08) continue;
        if (f.y > pos.y + 0.3 && f.y < pos.y + HEAD) {
          f.hit.add(p.seat);
          const here = colAt(pos.x);
          const l = this.height(here - 1);
          const r = this.height(here + 1);
          p.data.kx = (l === r ? Math.sign(pos.x - x) || 1 : l < r ? -1 : 1) * KNOCK;
          p.data.vy = 5;
          this.game.audio.play('pop');
          if ((p.data.stun as number) > 0 || (p.data.guard as number) > 0) continue;
          p.data.stun = STUN;
          p.character.pose = 'sulk';
          p.character.setExpression('surprised');
        }
      }
      if (f.y <= land) {
        this.remove(f);
        this.place(f.col, f.mesh);
        this.game.audio.play('boom');
        // Anyone it couldn't knock clear gets squeezed up on top.
        const top = this.top(f.col);
        for (const p of this.players) {
          const pos = p.character.position;
          if (pos.y < top - 0.05 && Math.abs(pos.x - colX(f.col)) < CRATE / 2 + W - 0.02) {
            pos.y = top;
            p.data.vy = 0;
          }
        }
      }
    }
  }

  private remove(f: Falling): void {
    this.falling.splice(this.falling.indexOf(f), 1);
    this.scene.remove(f.marker);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) {
      if ((p.data.stun as number) > 0) p.character.rotation.y += dt * 10;
      else if (p.character.pose === 'sulk') p.character.pose = 'idle';
    }
  }

  /** Highest climbers win when time runs out. */
  protected standing(p: MinigamePlayer): number | number[] {
    return Math.round(p.character.position.y / CRATE);
  }

  timeout(): number[] {
    const h = (p: MinigamePlayer) => Math.round(p.character.position.y / CRATE);
    const best = Math.max(...this.players.map(h));
    return this.players.filter((p) => h(p) === best).map((p) => p.seat);
  }
}

export const crateClimb: MinigameDef = {
  id: 'crateclimb',
  name: 'Crate Climb',
  kind: 'ffa',
  duel: true,
  song: crateClimbTheme,
  rules: 'Crates rain onto the dock! Hop from stack to stack and be first to stand eight crates high. A crate on the head stuns you, and tall stacks topple.',
  controls: 'Stick: move · A: jump',
  create: () => new CrateClimb(),
};
