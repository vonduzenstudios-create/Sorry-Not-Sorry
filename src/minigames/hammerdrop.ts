import * as THREE from 'three';
import { hammerTheme } from '../audio/songs/towerThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const GRID = 7;
const TILE = 1.5;
const HALF = (GRID * TILE) / 2;
/** Hammer handle length: the head swings down on an arc this far from the hinge. */
const ARM = 5.2;
const HEAD_R = TILE / 2;
const RUN_SPEED = 4.2;
const STEP_REPEAT = 0.13;
const SLAM = 0.1;
const RECOVER = 0.32;
const RAISED = -1.15;
/** Wind-up time shrinks from this to WINDUP_MIN as the clock runs. */
const WINDUP_MAX = 0.85;
const WINDUP_MIN = 0.5;
/** How much of a runner can poke into a struck tile and still get squashed. */
const HIT_MARGIN = 0.22;

type Phase = 'ready' | 'windup' | 'slam' | 'recover';

interface Strike {
  col: number;
  row: number;
  /** Lengthwise along X (a row of tiles) or along Z (a column). */
  across: boolean;
}

const tileX = (col: number) => -HALF + TILE / 2 + col * TILE;
const tileZ = (row: number) => -HALF + TILE / 2 + row * TILE;
const clampCell = (n: number) => THREE.MathUtils.clamp(n, 0, GRID - 1);

/** Tiles a strike covers: the aimed tile and one either side along the head. */
function cells(s: Strike): [number, number][] {
  const out: [number, number][] = [];
  for (let k = -1; k <= 1; k++) {
    const c = s.across ? s.col + k : s.col;
    const r = s.across ? s.row : s.row + k;
    if (c >= 0 && c < GRID && r >= 0 && r < GRID) out.push([c, r]);
  }
  return out;
}

/** Whether a point is under a strike (with a little slack on every side). */
function under(s: Strike, x: number, z: number, margin = HIT_MARGIN): boolean {
  const cx = tileX(s.col);
  const cz = tileZ(s.row);
  const hx = (s.across ? TILE * 1.5 : TILE / 2) + margin;
  const hz = (s.across ? TILE / 2 : TILE * 1.5) + margin;
  return Math.abs(x - cx) < hx && Math.abs(z - cz) < hz;
}

/**
 * 1 vs 3. The solo player works a giant mallet over a tiled courtyard: move
 * the target tile by tile, flip the hammer between rows and columns, and slam.
 * Struck tiles flash red during the wind-up, so the three can scramble clear.
 * Flatten all three to win; any survivor at the bell wins it for the trio.
 */
class HammerDrop extends Minigame {
  readonly timeLimit = 30;
  private tiles: THREE.Mesh[][] = [];
  private tileColors: THREE.Color[][] = [];
  private hammer = new THREE.Group();
  private arm = new THREE.Group();
  private aim: Strike = { col: 3, row: 3, across: true };
  private strike: Strike | null = null;
  private phase: Phase = 'ready';
  private phaseT = 0;
  /** Seconds of actual play (t also counts the intro). */
  private playT = 0;
  private windup = WINDUP_MAX;
  private stepT = 0;
  private lastStep = new THREE.Vector2();
  private shake = 0;
  private cpuThink = 0;
  private cpuGoal: Strike | null = null;
  private camBase = new THREE.Vector3(0.8, 17, 13);

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0xa8c8ff, 0xffe8d6], 0x8fd3f0, -6);
    const base = toonMesh(new THREE.BoxGeometry(GRID * TILE + 1, 1.2, GRID * TILE + 1), 0xc9b6e8, { outline: 0.05 });
    base.position.y = -0.8;
    this.scene.add(base);
    for (let c = 0; c < GRID; c++) {
      this.tiles.push([]);
      this.tileColors.push([]);
      for (let r = 0; r < GRID; r++) {
        const color = new THREE.Color((c + r) % 2 ? Palette.cream : Palette.lavender);
        const tile = toonMesh(new THREE.BoxGeometry(TILE - 0.08, 0.4, TILE - 0.08), color.getHex(), { outline: 0.02 });
        tile.position.set(tileX(c), -0.2, tileZ(r));
        this.scene.add(tile);
        this.tiles[c].push(tile);
        this.tileColors[c].push(color);
      }
    }
    // The solo player's lookout, off the far corner.
    const perch = toonMesh(new THREE.CylinderGeometry(1.1, 1.3, 3, 16), 0x9a86c8, { outline: 0.05 });
    perch.position.set(HALF + 1.9, -0.3, -HALF + 1.2);
    this.scene.add(perch);

    // Mallet: hinge at the group origin, handle along +Z, head across the end.
    const handle = toonMesh(new THREE.CylinderGeometry(0.16, 0.2, ARM, 10), 0xb07a4a, { outline: 0.03 });
    handle.rotation.x = Math.PI / 2;
    handle.position.z = ARM / 2;
    const head = toonMesh(new THREE.CylinderGeometry(HEAD_R, HEAD_R, TILE * 3 - 0.1, 20), 0x8a8fa8, { outline: 0.05 });
    head.rotation.z = Math.PI / 2;
    head.position.z = ARM;
    for (const side of [-1, 1]) {
      const band = toonMesh(new THREE.CylinderGeometry(HEAD_R + 0.06, HEAD_R + 0.06, 0.3, 20), Palette.coral, { outline: 0.02 });
      band.rotation.z = Math.PI / 2;
      band.position.set(side * (TILE * 1.5 - 0.35), 0, ARM);
      this.arm.add(band);
    }
    const hinge = toonMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), Palette.ink, { outline: false });
    this.arm.add(handle, head);
    this.arm.rotation.x = RAISED;
    this.hammer.add(this.arm, hinge);
    this.hammer.position.y = HEAD_R;
    this.scene.add(this.hammer);
    this.placeHammer(this.aim, 1);

    const solo = this.solo;
    solo.character.position.set(HALF + 1.9, 1.2, -HALF + 1.2);
    solo.character.rotation.y = -Math.PI / 2;
    this.runners.forEach((p, i) => {
      p.data.vel = new THREE.Vector3();
      p.data.wander = new THREE.Vector3();
      p.data.wanderT = 0;
      p.data.seen = false;
      p.data.react = 0;
      p.character.position.set(tileX(1 + i * 2), 0, tileZ(5));
      p.character.rotation.y = Math.PI;
    });

    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, -0.6);
  }

  /** Hinge sits ARM behind the target so the head lands on it. */
  private placeHammer(s: Strike, k: number): void {
    const target = new THREE.Vector3(tileX(s.col), HEAD_R, tileZ(s.row));
    const back = s.across ? new THREE.Vector3(0, 0, -ARM) : new THREE.Vector3(-ARM, 0, 0);
    const yaw = s.across ? 0 : Math.PI / 2;
    this.hammer.position.lerp(target.add(back), k);
    let diff = yaw - this.hammer.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.hammer.rotation.y += diff * k;
  }

  private start(s: Strike): void {
    this.strike = { ...s };
    this.phase = 'windup';
    this.phaseT = 0;
    this.windup = THREE.MathUtils.lerp(WINDUP_MAX, WINDUP_MIN, Math.min(1, this.playT / this.timeLimit));
    this.solo.character.pose = 'jump';
    this.game.audio.play('jump');
    const rng = this.game.rng;
    for (const r of this.runners) {
      r.data.seen = rng.next() < 0.78;
      r.data.react = rng.range(0.05, 0.25);
    }
  }

  private impact(s: Strike): void {
    this.shake = 0.35;
    this.game.audio.play('boom');
    for (const r of this.runners) {
      if (!r.alive) continue;
      const c = r.character;
      if (!under(s, c.position.x, c.position.z)) continue;
      r.alive = false;
      c.position.y = 0.02;
      c.scale.set(1.35, 0.18, 1.35);
      c.pose = 'sulk';
      c.setExpression('surprised');
    }
    const squashed = this.runners.filter((r) => !r.alive).length;
    if (squashed > (this.solo.data.squashed as number | undefined ?? 0)) {
      this.solo.data.squashed = squashed;
      this.solo.character.pose = 'cheer';
      this.game.audio.play('pop');
    }
  }

  /** Human solo: stick steps the target tile by tile (hold to repeat), B flips it, A slams. */
  private humanAim(dt: number): boolean {
    const c = this.solo.controller!;
    const s = stick(this.solo);
    const step = new THREE.Vector2(Math.abs(s.x) > 0.5 ? Math.sign(s.x) : 0, Math.abs(s.z) > 0.5 ? Math.sign(s.z) : 0);
    this.stepT -= dt;
    if (step.lengthSq() > 0 && (!step.equals(this.lastStep) || this.stepT <= 0)) {
      this.aim.col = clampCell(this.aim.col + step.x);
      this.aim.row = clampCell(this.aim.row + step.y);
      this.stepT = step.equals(this.lastStep) ? STEP_REPEAT : STEP_REPEAT * 2.2;
    }
    this.lastStep.copy(step);
    if (c.pressed('b')) this.aim.across = !this.aim.across;
    return c.pressed('a');
  }

  /** CPU solo: every so often pick the strike that covers the most runners, walk the target there, slam. */
  private cpuAim(dt: number): boolean {
    this.cpuThink -= dt;
    if (!this.cpuGoal || this.cpuThink <= 0) {
      this.cpuThink = 0.45;
      let best: Strike = this.aim;
      let bestScore = -1;
      const rng = this.game.rng;
      const lead = this.windup * 0.5;
      for (let c = 0; c < GRID; c++) {
        for (let r = 0; r < GRID; r++) {
          for (const across of [true, false]) {
            const s = { col: c, row: r, across };
            let score = rng.next() * 0.4 - (Math.abs(c - this.aim.col) + Math.abs(r - this.aim.row)) * 0.05;
            for (const p of this.runners) {
              if (!p.alive) continue;
              const pos = p.character.position.clone().addScaledVector(p.data.vel as THREE.Vector3, lead);
              if (under(s, pos.x, pos.z, -0.1)) score += 1;
            }
            if (score > bestScore) {
              bestScore = score;
              best = s;
            }
          }
        }
      }
      this.cpuGoal = best;
    }
    const g = this.cpuGoal;
    this.aim.across = g.across;
    this.stepT -= dt;
    if (this.stepT <= 0 && (g.col !== this.aim.col || g.row !== this.aim.row)) {
      this.aim.col += Math.sign(g.col - this.aim.col);
      this.aim.row += Math.sign(g.row - this.aim.row);
      this.stepT = STEP_REPEAT;
    }
    if (g.col !== this.aim.col || g.row !== this.aim.row) return false;
    this.cpuGoal = null;
    return this.runners.some((p) => p.alive && under(this.aim, p.character.position.x, p.character.position.z, 0.6));
  }

  /** CPU runner: drift between random tiles, and dive out sideways when a hammer is coming down on them. */
  private cpuRun(p: MinigamePlayer, dt: number): THREE.Vector3 {
    const pos = p.character.position;
    const s = this.strike;
    if (s && this.phase === 'windup' && p.data.seen && this.phaseT > (p.data.react as number) && under(s, pos.x, pos.z, 0.55)) {
      // Escape across the short side of the strip, toward whichever edge is nearer.
      const dir = new THREE.Vector3();
      if (s.across) dir.z = pos.z >= tileZ(s.row) ? 1 : -1;
      else dir.x = pos.x >= tileX(s.col) ? 1 : -1;
      // No room past the edge of the courtyard on that side: go the other way.
      const center = s.across ? tileZ(s.row) : tileX(s.col);
      const side = s.across ? dir.z : dir.x;
      if (Math.abs(center + side * (TILE / 2 + HIT_MARGIN + 0.5)) > HALF - 0.3) dir.negate();
      return dir;
    }
    p.data.wanderT = (p.data.wanderT as number) - dt;
    const w = p.data.wander as THREE.Vector3;
    if ((p.data.wanderT as number) <= 0) {
      const rng = this.game.rng;
      w.set(tileX(rng.int(0, GRID - 1)), 0, tileZ(rng.int(0, GRID - 1)));
      p.data.wanderT = rng.range(1.2, 2.6);
    }
    const to = w.clone().sub(pos).setY(0);
    const d = to.length();
    if (d < 0.3) return new THREE.Vector3();
    const dir = to.divideScalar(d).multiplyScalar(Math.min(1, d) * 0.85);
    // Don't stroll under a hammer you've seen coming.
    const ahead = pos.clone().addScaledVector(dir, 0.6);
    if (s && this.phase !== 'recover' && p.data.seen && under(s, ahead.x, ahead.z, 0.5)) return new THREE.Vector3();
    return dir;
  }

  play(dt: number): void {
    const solo = this.solo;
    this.playT += dt;
    let fire = false;
    if (this.phase === 'ready') fire = solo.controller ? this.humanAim(dt) : this.cpuAim(dt);
    this.phaseT += dt;
    if (this.phase === 'ready') {
      this.placeHammer(this.aim, Math.min(1, dt * 14));
      this.arm.rotation.x = RAISED + Math.sin(this.t * 3) * 0.05;
      if (fire) this.start(this.aim);
    } else if (this.phase === 'windup') {
      this.arm.rotation.x = THREE.MathUtils.lerp(RAISED, -1.75, Math.min(1, this.phaseT / this.windup));
      if (this.phaseT >= this.windup) {
        this.phase = 'slam';
        this.phaseT = 0;
      }
    } else if (this.phase === 'slam') {
      const k = Math.min(1, this.phaseT / SLAM);
      this.arm.rotation.x = -1.75 * (1 - k * k);
      if (k >= 1) {
        this.impact(this.strike!);
        this.phase = 'recover';
        this.phaseT = 0;
      }
    } else if (this.phaseT >= RECOVER) {
      this.phase = 'ready';
      this.phaseT = 0;
      this.strike = null;
      solo.character.pose = 'idle';
    } else {
      this.arm.rotation.x = THREE.MathUtils.lerp(0, RAISED, this.phaseT / RECOVER);
    }

    for (const r of this.runners) {
      if (!r.alive) continue;
      const move = r.controller ? stick(r) : this.cpuRun(r, dt);
      (r.data.vel as THREE.Vector3).copy(move).multiplyScalar(RUN_SPEED);
      const c = r.character;
      c.position.addScaledVector(move, RUN_SPEED * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF + 0.3, HALF - 0.3);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HALF + 0.3, HALF - 0.3);
      face(r, move, dt);
      moveAnim(r, move.length());
      const danger = this.strike && this.phase !== 'recover' && under(this.strike, c.position.x, c.position.z);
      c.setExpression(danger ? 'surprised' : 'determined');
    }
    separate(this.alive.filter((p) => p.team === 1), 0.42);

    if (this.runners.every((p) => !p.alive)) this.finish([solo]);
  }

  animate(dt: number): void {
    super.animate(dt);
    // Struck tiles blink red during the wind-up; the aimed strip glows softly.
    const warn = this.strike && this.phase === 'windup' ? cells(this.strike) : [];
    const aimed = this.phase === 'ready' ? cells(this.aim) : [];
    const blink = 0.55 + 0.45 * Math.sin(this.t * 30);
    const red = new THREE.Color(Palette.coral);
    const glow = new THREE.Color(this.solo.character.def.colors.accent);
    for (let c = 0; c < GRID; c++) {
      for (let r = 0; r < GRID; r++) {
        const mat = this.tiles[c][r].material as THREE.MeshToonMaterial;
        mat.color.copy(this.tileColors[c][r]);
        if (warn.some(([wc, wr]) => wc === c && wr === r)) mat.color.lerp(red, blink);
        else if (aimed.some(([ac, ar]) => ac === c && ar === r)) mat.color.lerp(glow, 0.45);
      }
    }
    this.shake = Math.max(0, this.shake - dt);
    const j = this.shake * 0.9;
    this.camera.position.set(this.camBase.x + Math.sin(this.t * 70) * j, this.camBase.y + Math.cos(this.t * 55) * j, this.camBase.z);
  }

  timeout(): number[] {
    return this.runners.map((p) => p.seat);
  }
}

export const hammerDrop: MinigameDef = {
  id: 'hammerdrop',
  name: 'Hammer Drop',
  kind: '1v3',
  song: hammerTheme,
  rules: 'Hammer: slam the giant mallet down on three tiles at a time and flatten all three runners! Runners: watch for the flashing tiles and stay out from under it until time runs out.',
  controls: 'Hammer: stick to aim, B to turn the hammer, A to slam · Runners: stick to run',
  create: () => new HammerDrop(),
};
