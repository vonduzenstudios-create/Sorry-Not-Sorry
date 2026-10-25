import * as THREE from 'three';
import { snowTheme } from '../audio/songs/minigameThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 6;
/** Runners start at the far end and run toward the camera; the fort sits at the near end. */
const START_Z = -8.5;
const GOAL_Z = 6.2;
const RUN_SPEED = 3.8;
const AIM_SPEED = 11;
const FLIGHT = 0.6;
const COOLDOWN = 0.42;
const SPLASH = 1.35;
const STUN = 0.6;
const NEEDED = 7;
const FORT = new THREE.Vector3(0, 1.6, 8.6);
const SNOWMEN: [number, number][] = [
  [-3.2, -3.5],
  [2.6, -1.2],
  [-1.2, 1.8],
  [3.8, 3.8],
  [-4.4, 4.2],
];

interface Snowball {
  mesh: THREE.Mesh;
  marker: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  /** CPU runners who spotted this one coming (decided when it's thrown). */
  seen: Set<MinigamePlayer>;
}

/**
 * 1 vs 3. The runners dash across the snowfield to the flag; the solo player
 * lobs snowballs from the fort. Seven runs across and they win;
 * hold them off until time runs out and the fort wins.
 */
class SnowballSiege extends Minigame {
  readonly timeLimit = 35;
  private aim = new THREE.Vector3(0, 0, -3);
  private reticle!: THREE.Mesh;
  private balls: Snowball[] = [];
  private cool = 0;
  private made = 0;
  private cpuErr = new THREE.Vector3();
  private board!: HTMLDivElement;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0x9fc8f0, 0xf0f6ff], 0xdfeaf8, -0.4);
    const field = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 1, 0.6, 22), 0xf6faff, { outline: 0.05 });
    field.position.set(0, -0.3, 0);
    this.scene.add(field);
    const goal = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, 0.5), new THREE.MeshBasicMaterial({ color: Palette.coral }));
    goal.rotation.x = -Math.PI / 2;
    goal.position.set(0, 0.01, GOAL_Z);
    this.scene.add(goal);
    for (const x of [-HALF_X, HALF_X]) {
      const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), Palette.ink, { outline: false });
      pole.position.set(x, 1.1, GOAL_Z);
      const flag = toonMesh(new THREE.BoxGeometry(0.8, 0.5, 0.04), Palette.coral, { outline: 0.02 });
      flag.position.set(x + (x < 0 ? 0.4 : -0.4), 1.95, GOAL_Z);
      this.scene.add(pole, flag);
    }
    // Snow fort the solo player throws from.
    const fort = toonMesh(new THREE.BoxGeometry(4, 1.4, 1.6), 0xe0ecff, { outline: 0.05 });
    fort.position.set(0, 0.7, FORT.z);
    this.scene.add(fort);
    for (let i = 0; i < 5; i++) {
      const crenel = toonMesh(new THREE.BoxGeometry(0.5, 0.5, 1.6), 0xe0ecff, { outline: 0.03 });
      crenel.position.set(-1.8 + i * 0.9, 1.65, FORT.z);
      this.scene.add(crenel);
    }
    for (const [x, z] of SNOWMEN) {
      const low = toonMesh(new THREE.SphereGeometry(0.6, 16, 12), 0xffffff, { outline: 0.03 });
      low.position.set(x, 0.5, z);
      const high = toonMesh(new THREE.SphereGeometry(0.4, 16, 12), 0xffffff, { outline: 0.03 });
      high.position.set(x, 1.3, z);
      const nose = toonMesh(new THREE.ConeGeometry(0.07, 0.3, 6), 0xff9a4a, { outline: false });
      nose.rotation.x = Math.PI / 2;
      nose.position.set(x, 1.3, z + 0.45);
      this.scene.add(low, high, nose);
    }

    const solo = this.solo;
    solo.character.position.set(0, 1.4, FORT.z - 0.2);
    solo.character.rotation.y = Math.PI;
    this.runners.forEach((p, i) => {
      p.data.stun = 0;
      p.data.vel = new THREE.Vector3();
      this.respawn(p, i);
    });
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 24), new THREE.MeshBasicMaterial({ color: solo.character.def.colors.accent }));
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.position.y = 0.03;
    this.scene.add(this.reticle);

    this.camera.position.set(0, 17, 14.5);
    this.camera.lookAt(0, 0, -0.4);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private respawn(p: MinigamePlayer, i = this.runners.indexOf(p)): void {
    p.character.position.set((i - 1) * 3, 0, START_Z);
    p.character.rotation.y = 0;
  }

  private renderScore(): void {
    this.board.textContent = `Across: ${'⚑'.repeat(this.made)}${'·'.repeat(NEEDED - this.made)}`;
  }

  private throwBall(): void {
    const mesh = toonMesh(new THREE.SphereGeometry(0.28, 12, 10), 0xffffff, { outline: 0.02 });
    const marker = new THREE.Mesh(new THREE.CircleGeometry(SPLASH, 24), new THREE.MeshBasicMaterial({ color: Palette.sky, transparent: true, opacity: 0.35 }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(this.aim.x, 0.02, this.aim.z);
    const from = FORT.clone().add(new THREE.Vector3(0, 1, -0.6));
    mesh.position.copy(from);
    this.scene.add(mesh, marker);
    const seen = new Set(this.runners.filter(() => this.game.rng.next() < 0.45));
    this.balls.push({ mesh, marker, from, to: this.aim.clone().setY(0.2), t: 0, seen });
    this.solo.character.pose = 'jump';
    this.game.audio.play('jump');
  }

  /** CPU fort: lead the runner nearest the flag, with some wobble per throw. */
  private cpuAim(): { dir: THREE.Vector3; fire: boolean } {
    let target: MinigamePlayer | null = null;
    for (const r of this.runners) {
      if ((r.data.stun as number) > 0) continue;
      if (!target || r.character.position.z > target.character.position.z) target = r;
    }
    if (!target) return { dir: new THREE.Vector3(), fire: false };
    const lead = target.character.position.clone().addScaledVector(target.data.vel as THREE.Vector3, FLIGHT).add(this.cpuErr);
    const dir = lead.sub(this.aim).setY(0);
    const d = dir.length();
    return { dir: d > 0.15 ? dir.divideScalar(d).multiplyScalar(Math.min(1, d * 2)) : new THREE.Vector3(), fire: d < 0.45 };
  }

  /** CPU runner: head for the flag, weave, dodge landing spots and snowmen. */
  private cpuRun(p: MinigamePlayer): THREE.Vector3 {
    const pos = p.character.position;
    const dir = new THREE.Vector3(Math.sin(this.t * 1.8 + p.seat * 2) * 0.7, 0, 1);
    for (const b of this.balls) {
      if (!b.seen.has(p) || b.t < 0.28) continue;
      const away = pos.clone().sub(b.to).setY(0);
      const d = away.length();
      if (d < SPLASH + 0.4) dir.addScaledVector(away.normalize(), 2.5 * (1 - b.t / FLIGHT + 0.3));
    }
    for (const [x, z] of SNOWMEN) {
      const away = new THREE.Vector3(pos.x - x, 0, pos.z - z);
      const d = away.length();
      if (d < 1.5) dir.addScaledVector(away.normalize(), 1.4 - d * 0.6);
    }
    if (Math.abs(pos.x) > HALF_X - 1) dir.x -= Math.sign(pos.x);
    return dir.normalize();
  }

  play(dt: number): void {
    const solo = this.solo;
    this.cool = Math.max(0, this.cool - dt);
    let dir: THREE.Vector3;
    let fire: boolean;
    if (solo.controller) {
      dir = stick(solo);
      fire = solo.controller.pressed('a');
    } else ({ dir, fire } = this.cpuAim());
    this.aim.addScaledVector(dir, AIM_SPEED * dt);
    this.aim.x = THREE.MathUtils.clamp(this.aim.x, -HALF_X, HALF_X);
    this.aim.z = THREE.MathUtils.clamp(this.aim.z, START_Z - 1, GOAL_Z + 1);
    this.reticle.position.set(this.aim.x, 0.03, this.aim.z);
    if (fire && this.cool <= 0) {
      this.throwBall();
      this.cool = COOLDOWN;
      const rng = this.game.rng;
      this.cpuErr.set((rng.next() * 2 - 1) * 0.5, 0, (rng.next() * 2 - 1) * 0.5);
    }
    if (this.cool < COOLDOWN - 0.25) solo.character.pose = 'idle';

    for (const r of this.runners) {
      const c = r.character;
      if ((r.data.stun as number) > 0) {
        r.data.stun = (r.data.stun as number) - dt;
        (r.data.vel as THREE.Vector3).set(0, 0, 0);
        c.rotation.y += dt * 12;
        c.pose = 'sulk';
        continue;
      }
      const move = r.controller ? stick(r) : this.cpuRun(r);
      (r.data.vel as THREE.Vector3).copy(move).multiplyScalar(RUN_SPEED);
      c.position.addScaledVector(move, RUN_SPEED * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_X + 0.3, HALF_X - 0.3);
      c.position.z = Math.max(START_Z - 0.5, c.position.z);
      for (const [x, z] of SNOWMEN) {
        const away = new THREE.Vector3(c.position.x - x, 0, c.position.z - z);
        if (away.length() < 0.95) c.position.set(x, 0, z).addScaledVector(away.normalize(), 0.95);
      }
      face(r, move, dt);
      moveAnim(r, move.length());
      c.setExpression('determined');
      if (c.position.z >= GOAL_Z) {
        this.made++;
        this.game.audio.play('star');
        this.renderScore();
        if (this.made >= NEEDED) return this.finish(this.runners);
        this.respawn(r);
      }
    }
    separate(this.runners, 0.42);

    for (const b of [...this.balls]) {
      b.t += dt;
      const k = Math.min(1, b.t / FLIGHT);
      b.mesh.position.lerpVectors(b.from, b.to, k);
      b.mesh.position.y += Math.sin(k * Math.PI) * 3;
      if (k < 1) continue;
      for (const r of this.runners) {
        const c = r.character.position;
        if ((r.data.stun as number) > 0 || Math.hypot(c.x - b.to.x, c.z - b.to.z) > SPLASH) continue;
        // Splat: back to the start line.
        r.data.stun = STUN;
        this.respawn(r);
        r.character.setExpression('surprised');
      }
      this.game.audio.play('pop');
      this.scene.remove(b.mesh, b.marker);
      this.balls.splice(this.balls.indexOf(b), 1);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    this.reticle.rotation.z += dt * 2;
  }

  timeout(): number[] {
    return [this.solo.seat];
  }
}

export const snowballSiege: MinigameDef = {
  id: 'snowsiege',
  name: 'Snowball Siege',
  kind: '1v3',
  song: snowTheme,
  rules: 'Runners: dash across the snowfield to the flag. Get 7 runs across to win! Fort: throw snowballs to send them back to the start until time runs out.',
  controls: 'Fort: stick to aim, A to throw · Runners: stick to run',
  create: () => new SnowballSiege(),
};
