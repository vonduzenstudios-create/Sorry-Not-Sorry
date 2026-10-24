import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, separate } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const LANES = [-4, -2, 0, 2, 4];
const TOP_Z = -14;
const SLOPE_END_Z = 4;
const BOTTOM_Z = 12;
const ROCK_R = 0.85;
const ROCK_SPEED = 10;
const RUNNER_SPEED = 5.5;
const RUNNER_Z = 8;

/** Height of the ground at z: a ramp down to a flat run-out. */
function groundY(z: number): number {
  if (z >= SLOPE_END_Z) return 0;
  return ((SLOPE_END_Z - z) / (SLOPE_END_Z - TOP_Z)) * 7;
}

interface Rock {
  mesh: THREE.Mesh;
  lane: number;
}

/**
 * 1 vs 3. The solo player (team 0) rolls boulders down the hill from the top;
 * the three runners at the bottom dodge left and right.
 */
class RollingRock extends Minigame {
  readonly timeLimit = 30;
  private rocks: Rock[] = [];
  private lane = 2;
  private cooldown = 1;
  private cart!: THREE.Group;
  private latch = 0;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0xa8d8ff, 0xfff0d8], Palette.sand, -2);
    // Ramp + run-out as one extruded side profile.
    const profile = new THREE.Shape();
    profile.moveTo(TOP_Z - 2, groundY(TOP_Z));
    profile.lineTo(TOP_Z, groundY(TOP_Z));
    profile.lineTo(SLOPE_END_Z, 0);
    profile.lineTo(BOTTOM_Z, 0);
    profile.lineTo(BOTTOM_Z, -1.5);
    profile.lineTo(TOP_Z - 2, -1.5);
    const geo = new THREE.ExtrudeGeometry(profile, { depth: 12, bevelEnabled: false });
    // Shape x -> world z, shape y -> world y, extrude depth -> world x.
    geo.rotateY(-Math.PI / 2);
    geo.translate(6, 0, 0);
    geo.computeVertexNormals();
    const hill = toonMesh(geo, Palette.grass, { outline: 0.06 });
    this.scene.add(hill);

    // Lane stripes down the slope.
    for (const x of LANES) {
      const len = Math.hypot(SLOPE_END_Z - TOP_Z, 7);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len), new THREE.MeshBasicMaterial({ color: Palette.grassDark }));
      stripe.position.set(x, 3.5 + 0.02, (TOP_Z + SLOPE_END_Z) / 2);
      stripe.rotation.x = -Math.PI / 2 + Math.atan2(7, SLOPE_END_Z - TOP_Z);
      this.scene.add(stripe);
    }

    // The solo player's rock cart at the top.
    this.cart = new THREE.Group();
    const bin = toonMesh(new THREE.BoxGeometry(1.8, 0.8, 1.4), 0xb5784a, { outline: 0.04 });
    bin.position.y = 0.4;
    const pile = toonMesh(new THREE.DodecahedronGeometry(0.6), 0xa69cb8, { outline: 0.03 });
    pile.position.set(0, 1, 0);
    this.cart.add(bin, pile);
    this.cart.position.set(LANES[this.lane], groundY(TOP_Z), TOP_Z - 0.5);
    this.scene.add(this.cart);

    const solo = this.solo;
    solo.character.position.set(LANES[this.lane], groundY(TOP_Z), TOP_Z - 1.6);
    solo.character.rotation.y = 0;
    this.runners.forEach((p, i) => {
      p.character.position.set((i - 1) * 3, 0, RUNNER_Z);
      p.character.rotation.y = Math.PI;
    });

    this.camera.position.set(0, 15, 25);
    this.camera.lookAt(0, 1.5, -2.5);
  }

  private dropRock(): void {
    const mesh = toonMesh(new THREE.DodecahedronGeometry(ROCK_R, 1), 0xa69cb8, { outline: 0.04 });
    mesh.position.set(LANES[this.lane], groundY(TOP_Z + 0.5) + ROCK_R, TOP_Z + 0.5);
    this.scene.add(mesh);
    this.rocks.push({ mesh, lane: this.lane });
    this.cooldown = 0.85;
    this.game.audio.play('boom');
  }

  private soloControl(dt: number): void {
    const p = this.solo;
    this.cooldown -= dt;
    let move = 0;
    let drop = false;
    if (p.controller) {
      const x = p.controller.stickX;
      if (Math.abs(x) > 0.5 && this.latch === 0) move = Math.sign(x);
      this.latch = Math.abs(x) > 0.5 ? Math.sign(x) : 0;
      drop = p.controller.pressed('a');
    } else {
      // Aim at a runner's lane, leading slightly toward where they're heading.
      const alive = this.runners.filter((r) => r.alive);
      if (alive.length) {
        if (p.data.targetTimer === undefined || (p.data.targetTimer as number) <= 0) {
          p.data.target = this.game.rng.pick(alive);
          p.data.targetTimer = 1.2;
        }
        p.data.targetTimer = (p.data.targetTimer as number) - dt;
        const target = p.data.target as MinigamePlayer;
        const x = target.character.position.x;
        let want = 0;
        LANES.forEach((lx, i) => {
          if (Math.abs(lx - x) < Math.abs(LANES[want] - x)) want = i;
        });
        p.data.stepTimer = ((p.data.stepTimer as number) ?? 0) - dt;
        if (want !== this.lane && (p.data.stepTimer as number) <= 0) {
          move = Math.sign(want - this.lane);
          p.data.stepTimer = 0.18;
        }
        drop = want === this.lane && this.cooldown < -0.25;
      }
    }
    if (move) {
      this.lane = THREE.MathUtils.clamp(this.lane + move, 0, LANES.length - 1);
      this.game.audio.play('select');
    }
    if (drop && this.cooldown <= 0) this.dropRock();
    const tx = LANES[this.lane];
    this.cart.position.x += (tx - this.cart.position.x) * Math.min(1, dt * 14);
    p.character.position.x = this.cart.position.x;
    p.character.pose = this.cooldown > 0.6 ? 'cheer' : 'idle';
  }

  private runnerIntent(p: MinigamePlayer): number {
    if (p.controller) return p.controller.stickX;
    const x = p.character.position.x;
    let threat: Rock | null = null;
    for (const r of this.rocks) {
      const z = r.mesh.position.z;
      // Notice rocks once they're about halfway down; per-CPU reaction differs.
      if (z > -4 - (p.seat % 3) * 2 && z < RUNNER_Z + 1 && Math.abs(r.mesh.position.x - x) < ROCK_R + 0.9) threat = r;
    }
    if (!threat) return (Math.sin(this.t * 0.7 + p.seat) * 0.3);
    const away = x >= threat.mesh.position.x ? 1 : -1;
    // Don't run into the side wall.
    if (Math.abs(x + away) > 5.5) return -away;
    return away;
  }

  play(dt: number): void {
    this.soloControl(dt);

    for (const p of this.runners) {
      if (!p.alive) {
        fall(p, dt);
        continue;
      }
      const x = THREE.MathUtils.clamp(this.runnerIntent(p), -1, 1);
      p.character.position.x = THREE.MathUtils.clamp(p.character.position.x + x * RUNNER_SPEED * dt, -5.6, 5.6);
      face(p, new THREE.Vector3(x, 0, Math.abs(x) < 0.1 ? -1 : 0), dt);
      moveAnim(p, Math.abs(x));
    }
    separate(this.runners.filter((r) => r.alive), 0.45);

    for (const r of [...this.rocks]) {
      const m = r.mesh;
      m.position.z += ROCK_SPEED * dt;
      m.position.y = groundY(m.position.z) + ROCK_R;
      m.rotation.x += (ROCK_SPEED / ROCK_R) * dt;
      for (const p of this.runners) {
        if (p.alive && m.position.distanceTo(p.character.position.clone().setY(ROCK_R)) < ROCK_R + 0.45) {
          knockOut(p, new THREE.Vector3(0, 2, 9));
          this.game.audio.play('back');
        }
      }
      if (m.position.z > BOTTOM_Z + 3) {
        this.scene.remove(m);
        this.rocks.splice(this.rocks.indexOf(r), 1);
      }
    }

    if (this.runners.every((p) => !p.alive)) this.finish([this.solo]);
  }

  timeout(): number[] {
    return this.runners.map((p) => p.seat);
  }
}

export const rollingRock: MinigameDef = {
  id: 'rollingrock',
  name: 'Rolling Rock',
  kind: '1v3',
  rules: 'Solo: roll boulders and flatten all three runners! Runners: dodge until time runs out.',
  controls: 'Solo: Left/Right + A to drop · Runners: Left/Right to dodge',
  create: () => new RollingRock(),
};
