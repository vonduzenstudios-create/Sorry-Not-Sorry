import * as THREE from 'three';
import { wallTheme } from '../audio/songs/chompWallThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { dirPressed, face, fall, knockOut, moveAnim, scorePanel, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const COLS = 6;
const COL_W = 2;
const HALF_X = (COLS * COL_W) / 2;
const WALL_H = 2.6;
const WALL_D = 0.8;
const WALL_START = -11;
const WALL_END = 11;
/** Runners stay in a strip near the camera. */
const RUN_ZMIN = 3.2;
const RUN_ZMAX = 6.4;
const RUN_SPEED = 6;
const RUNNER_R = 0.3;
/** Blocks can be dropped until the wall gets this close to the runners. */
const CUTOFF = RUN_ZMIN - 4.2;
const BUILD = 1.4;
const DROP_FROM = 7;
const BLOCKS = [3, 3, 4, 4, 4, 4, 4, 4];

const colX = (c: number) => -HALF_X + COL_W * (c + 0.5);
const colAt = (x: number) => THREE.MathUtils.clamp(Math.floor((x + HALF_X) / COL_W), 0, COLS - 1);

interface Block {
  mesh: THREE.Mesh;
  y: number;
  vy: number;
}

/**
 * 1 vs 3. The solo player rides the top of a wall and drops blocks into its
 * frame while it rolls toward the runners. Stand in a gap when it passes or
 * get smashed off the stage. Smash all three to win; any survivors at the
 * end win for the runners.
 */
class WallSmash extends Minigame {
  readonly timeLimit = 35;
  private wall = new THREE.Group();
  private crane = 2;
  private craneX = colX(2);
  private marker!: THREE.Mesh;
  private filled: boolean[] = [];
  private blocks: Block[] = [];
  private left = 0;
  private wave = -1;
  private phase: 'build' | 'push' | 'sink' = 'build';
  private phaseT = 0;
  private hop = 0;
  private cpuStep = 0;
  private cpuDrop = 0;
  /** CPU: wall z at which the last held-back blocks are dropped. */
  private lateZ = 0;
  private board!: HTMLDivElement;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0xaad4ff, 0xfff2e0], Palette.water, -8);
    const road = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 1.6, 0.8, 23), 0xd8d0e8, { outline: 0.06 });
    road.position.set(0, -0.4, -2);
    this.scene.add(road);
    for (let c = 1; c < COLS; c++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 23), new THREE.MeshBasicMaterial({ color: 0xbcb2d4 }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(-HALF_X + c * COL_W, 0.01, -2);
      this.scene.add(line);
    }
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, RUN_ZMAX - RUN_ZMIN + 0.8), new THREE.MeshBasicMaterial({ color: Palette.mint }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(0, 0.015, (RUN_ZMIN + RUN_ZMAX) / 2);
    this.scene.add(zone);

    // The wall: two posts and a top beam the solo player walks along.
    for (const side of [-1, 1]) {
      const post = toonMesh(new THREE.BoxGeometry(0.6, WALL_H + 0.4, WALL_D + 0.2), 0x6d5f8f, { outline: 0.04 });
      post.position.set(side * (HALF_X + 0.3), (WALL_H + 0.4) / 2, 0);
      this.wall.add(post);
    }
    const beam = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 1.2, 0.3, WALL_D + 0.2), 0x6d5f8f, { outline: 0.04 });
    beam.position.y = WALL_H + 0.25;
    this.wall.add(beam);
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(COL_W - 0.2, WALL_D), new THREE.MeshBasicMaterial({ color: this.solo.character.def.colors.accent }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = WALL_H + 0.41;
    this.wall.add(this.marker);
    this.wall.add(this.solo.character);
    this.solo.character.position.set(this.craneX, WALL_H + 0.4, 0);
    this.solo.character.scale.setScalar(0.8);
    this.scene.add(this.wall);

    this.runners.forEach((p, i) => {
      p.character.position.set((i - 1) * 3.5, 0, (RUN_ZMIN + RUN_ZMAX) / 2);
      p.character.rotation.y = Math.PI;
      p.data.seen = '';
      p.data.react = 0;
    });

    this.camera.position.set(0, 15, 16.5);
    this.camera.lookAt(0, 0, -3.6);
    this.board = scorePanel(this.overlay);
    this.nextWave();
  }

  private nextWave(): void {
    for (const b of this.blocks) this.wall.remove(b.mesh);
    this.blocks = [];
    this.wave++;
    this.filled = Array(COLS).fill(false);
    this.left = BLOCKS[Math.min(this.wave, BLOCKS.length - 1)];
    this.phase = 'build';
    this.phaseT = 0;
    this.wall.position.set(0, 0, WALL_START);
    this.cpuDrop = this.game.rng.range(0.3, 0.7);
    this.lateZ = CUTOFF - this.game.rng.range(0.2, 3);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.textContent = `Wave ${this.wave + 1} · Blocks: ${'■'.repeat(this.left)}${'□'.repeat(BLOCKS[Math.min(this.wave, BLOCKS.length - 1)] - this.left)}`;
  }

  private drop(c: number): void {
    if (this.left <= 0 || this.filled[c]) return;
    this.filled[c] = true;
    this.left--;
    const color = [0xff9a7a, 0xffc46b, 0xe88aa8][(c + this.wave) % 3];
    const mesh = toonMesh(new THREE.BoxGeometry(COL_W - 0.06, WALL_H, WALL_D), color, { outline: 0.04 });
    const y = DROP_FROM;
    mesh.position.set(colX(c), y, 0);
    this.wall.add(mesh);
    this.blocks.push({ mesh, y, vy: 0 });
    this.hop = 0.25;
    this.game.audio.play('select');
    this.renderScore();
  }

  /** CPU wall: block the columns the runners stand in, holding some back for a late surprise. */
  private cpuSolo(dt: number): void {
    const z = this.wall.position.z;
    const reserve = this.wave === 0 ? 0 : this.wave < 3 ? 1 : 2;
    const late = z >= this.lateZ;
    if (this.left <= reserve && !late) return;
    const counts = Array(COLS).fill(0);
    for (const r of this.runners) if (r.alive) counts[colAt(r.character.position.x)]++;
    let target = -1;
    for (let c = 0; c < COLS; c++) {
      if (this.filled[c]) continue;
      if (target < 0 || counts[c] > counts[target] || (counts[c] === counts[target] && Math.abs(c - this.crane) < Math.abs(target - this.crane))) target = c;
    }
    if (target < 0) return;
    this.cpuStep -= dt;
    if (target !== this.crane) {
      if (this.cpuStep <= 0) {
        this.crane += Math.sign(target - this.crane);
        this.cpuStep = 0.11;
      }
      return;
    }
    this.cpuDrop -= dt;
    if (this.cpuDrop <= 0 || late) {
      this.drop(this.crane);
      this.cpuDrop = this.game.rng.range(0.15, 0.5);
    }
  }

  /** CPU runner: head for the nearest gap they've noticed, after a short reaction delay. */
  private cpuRun(p: MinigamePlayer, dt: number): THREE.Vector3 {
    const now = this.filled.map((f) => (f ? '1' : '0')).join('');
    if (now !== p.data.seen) {
      if ((p.data.react as number) <= 0) p.data.react = this.game.rng.range(0.12, 0.42);
      p.data.react = (p.data.react as number) - dt;
      if ((p.data.react as number) <= 0) p.data.seen = now;
    }
    const seen = (p.data.seen as string) || now;
    const pos = p.character.position;
    let best = -1;
    let bestCost = Infinity;
    for (let c = 0; c < COLS; c++) {
      if (seen[c] === '1') continue;
      let cost = Math.abs(colX(c) - pos.x);
      for (const o of this.runners) if (o !== p && o.alive && colAt(o.character.position.x) === c) cost += 0.8;
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    const goal = best < 0 ? pos.x : colX(best) + Math.sin(this.t + p.seat * 2.1) * 0.3;
    const dir = new THREE.Vector3(goal - pos.x, 0, ((RUN_ZMIN + RUN_ZMAX) / 2 - pos.z) * 0.3);
    if (Math.abs(dir.x) < 0.12) dir.x = 0;
    return dir.lengthSq() > 0.02 ? dir.normalize().multiplyScalar(Math.min(1, dir.length() * 2)) : new THREE.Vector3();
  }

  play(dt: number): void {
    const solo = this.solo;
    this.phaseT += dt;
    const z0 = this.wall.position.z;
    const canDrop = this.phase === 'build' || (this.phase === 'push' && z0 < CUTOFF);
    if (canDrop) {
      if (solo.controller) {
        const d = dirPressed(solo);
        if (d === 'left') this.crane = Math.max(0, this.crane - 1);
        if (d === 'right') this.crane = Math.min(COLS - 1, this.crane + 1);
        if (solo.controller.pressed('a')) this.drop(this.crane);
      } else this.cpuSolo(dt);
    }

    if (this.phase === 'build') {
      if (this.phaseT >= BUILD) {
        this.phase = 'push';
        this.phaseT = 0;
        this.game.audio.play('dice');
      }
    } else if (this.phase === 'push') {
      const speed = 5 + this.wave * 0.55;
      this.wall.position.z += speed * dt;
      const z1 = this.wall.position.z;
      if (z0 < CUTOFF && z1 >= CUTOFF) {
        // Unused blocks fall in on their own.
        while (this.left > 0) {
          const empty = this.filled.flatMap((f, c) => (f ? [] : [c]));
          this.drop(this.game.rng.pick(empty));
        }
      }
      this.smash(z0 + WALL_D / 2, z1 + WALL_D / 2);
      if (z1 >= RUN_ZMAX + 1.2) {
        this.phase = 'sink';
        this.phaseT = 0;
      }
    } else {
      this.wall.position.z += 4 * dt;
      this.wall.position.y = -this.phaseT * 9;
      if (this.wall.position.y < -(WALL_H + 1) || this.wall.position.z > WALL_END) this.nextWave();
    }

    for (const r of this.runners) {
      if (!r.alive) continue;
      const c = r.character;
      const move = r.controller ? stick(r) : this.cpuRun(r, dt);
      c.position.addScaledVector(move, RUN_SPEED * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_X + RUNNER_R, HALF_X - RUNNER_R);
      c.position.z = THREE.MathUtils.clamp(c.position.z, RUN_ZMIN, RUN_ZMAX);
      if (move.lengthSq() > 0.01) face(r, move, dt);
      else c.rotation.y += (Math.PI - c.rotation.y) * Math.min(1, dt * 8);
      moveAnim(r, move.length());
      const near = this.phase === 'push' && this.wall.position.z > CUTOFF - 4;
      c.setExpression(near ? 'surprised' : 'determined');
    }
    separate(this.runners.filter((r) => r.alive), RUNNER_R);
    this.hop = Math.max(0, this.hop - dt);
    solo.character.pose = this.hop > 0 ? 'jump' : 'idle';
    if (this.runners.every((r) => !r.alive)) this.finish([solo]);
  }

  /** Runners the wall's front face swept past this frame, outside a gap, are smashed. */
  private smash(from: number, to: number): void {
    for (const r of this.runners) {
      if (!r.alive) continue;
      const p = r.character.position;
      if (p.z < from || p.z >= to) continue;
      const hit = this.filled.some((f, c) => f && Math.abs(p.x - colX(c)) < COL_W / 2 + RUNNER_R * 0.8);
      if (!hit) continue;
      knockOut(r, new THREE.Vector3(0, 0, 9));
      this.game.audio.play('boom');
      this.solo.character.setExpression('happy');
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const r of this.runners) if (!r.alive) fall(r, dt);
    for (const b of this.blocks) {
      if (b.y <= WALL_H / 2) continue;
      b.vy -= 40 * dt;
      b.y = Math.max(WALL_H / 2, b.y + b.vy * dt);
      if (b.y === WALL_H / 2) b.vy = 0;
      b.mesh.position.y = b.y;
    }
    this.craneX += (colX(this.crane) - this.craneX) * Math.min(1, dt * 18);
    this.solo.character.position.x = this.craneX;
    this.solo.character.rotation.y = 0;
    this.marker.position.x = colX(this.crane);
    this.marker.visible = this.left > 0;
  }

  timeout(): number[] {
    return this.runners.filter((r) => r.alive).map((r) => r.seat);
  }
}

export const wallSmash: MinigameDef = {
  id: 'wallsmash',
  name: 'Wall Smash',
  kind: '1v3',
  song: wallTheme,
  rules: 'Wall rider: drop blocks into the rolling wall to smash all three runners! Runners: stand in a gap when the wall rolls past, and survive until time runs out.',
  controls: 'Rider: stick left/right to move, A to drop a block · Runners: stick to run',
  create: () => new WallSmash(),
};
