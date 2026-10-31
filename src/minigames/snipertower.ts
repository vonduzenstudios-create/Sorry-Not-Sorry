import * as THREE from 'three';
import { sniperTheme } from '../audio/songs/towerThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 6.2;
/** Runners start near the camera and race up the yard to the foot of the tower. */
const START_Z = 9;
const GOAL_Z = -6.6;
const TOWER_Z = -9;
const MUZZLE = new THREE.Vector3(0, 4.6, TOWER_Z + 0.6);
const RUN_SPEED = 3.6;
const AIM_SPEED = 12;
const SHOT_SPEED = 28;
const COOLDOWN = 0.45;
const STUN = 0.75;
const KNOCKBACK = 1.6;
const LIVES = 2;
const BODY_R = 0.5;
const BODY_H = 1.75;
/** Cover crates: center x, center z, width. All the same height and depth. */
const COVER: [number, number, number][] = [
  [-3.8, 5, 2],
  [0.6, 4.4, 2.2],
  [4.2, 5.4, 1.8],
  [-1.8, 1.6, 2],
  [2.6, 1, 2],
  [-4.4, -1.4, 1.8],
  [0.2, -2, 2.4],
  [4.4, -2.6, 1.8],
  [-2, -4.6, 1.8],
  [2.6, -5, 1.6],
];
const COVER_H = 1.5;
const COVER_D = 0.8;

interface Shot {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Time left until it reaches the ground at the aim point. */
  left: number;
}

const boxes = COVER.map(([x, z, w]) => new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - COVER_D / 2), new THREE.Vector3(x + w / 2, COVER_H, z + COVER_D / 2)));

/** Crates are solid: moves a runner's spot back out of any crate along the shallower axis. */
function pushOut(p: THREE.Vector3): THREE.Vector3 {
  for (const [x, z, w] of COVER) {
    const ox = w / 2 + 0.35 - Math.abs(p.x - x);
    const oz = COVER_D / 2 + 0.35 - Math.abs(p.z - z);
    if (ox > 0 && oz > 0) {
      if (ox < oz) p.x += Math.sign(p.x - x || 1) * ox;
      else p.z += Math.sign(p.z - z || 1) * oz;
    }
  }
  return p;
}

function blocked(p: THREE.Vector3): boolean {
  return boxes.some((b) => b.containsPoint(p));
}

/**
 * 1 vs 3. The solo player is perched on a paint tower, picking off the three
 * as they dash from crate to crate up the yard. Two splats and you're out.
 * One runner touching the tower's base wins it for the trio; paint them all
 * out, or hold them off until time's up, and the tower wins.
 */
class SniperTower extends Minigame {
  readonly timeLimit = 30;
  private aim = new THREE.Vector3(0, 0, 3);
  private reticle!: THREE.Group;
  private shots: Shot[] = [];
  private splats: THREE.Mesh[] = [];
  private cool = 0;
  private cpuErr = new THREE.Vector3();
  private board!: HTMLDivElement;
  private paint = 0xff5fa2;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    this.paint = this.solo.character.def.colors.accent;
    arenaBasics(this.scene, [0x8fc4ff, 0xfff0d8], 0x9fe3a8, -0.5);
    const yard = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 1, 0.6, 22), 0xf2dcae, { outline: 0.05 });
    yard.position.set(0, -0.3, 0);
    this.scene.add(yard);
    const goal = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2, 0.5), new THREE.MeshBasicMaterial({ color: Palette.green }));
    goal.rotation.x = -Math.PI / 2;
    goal.position.set(0, 0.01, GOAL_Z);
    this.scene.add(goal);
    const start = goal.clone();
    start.material = new THREE.MeshBasicMaterial({ color: Palette.cream });
    start.position.z = START_Z + 0.6;
    this.scene.add(start);

    // Tower: striped wooden column with a crow's nest on top.
    const tower = toonMesh(new THREE.CylinderGeometry(1.1, 1.5, 3.6, 12), 0xc98a5a, { outline: 0.05 });
    tower.position.set(0, 1.8, TOWER_Z);
    const nest = toonMesh(new THREE.CylinderGeometry(1.6, 1.3, 0.7, 14), Palette.butter, { outline: 0.04 });
    nest.position.set(0, 3.7, TOWER_Z);
    this.scene.add(tower, nest);
    const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), Palette.ink, { outline: false });
    pole.position.set(1.2, 5, TOWER_Z - 0.6);
    const flag = toonMesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), Palette.coral, { outline: 0.02 });
    flag.position.set(1.65, 5.75, TOWER_Z - 0.6);
    this.scene.add(pole, flag);
    const door = toonMesh(new THREE.BoxGeometry(1, 1.5, 0.1), 0x6a4a3a, { outline: 0.02 });
    door.position.set(0, 0.75, TOWER_Z + 1.35);
    this.scene.add(door);

    for (const [x, z, w] of COVER) {
      const crate = toonMesh(new THREE.BoxGeometry(w, COVER_H, COVER_D), 0xd9a066, { outline: 0.04 });
      crate.position.set(x, COVER_H / 2, z);
      const slat = toonMesh(new THREE.BoxGeometry(w + 0.02, 0.16, COVER_D + 0.02), 0xa8703e, { outline: false });
      slat.position.set(x, COVER_H * 0.7, z);
      this.scene.add(crate, slat);
    }

    const solo = this.solo;
    solo.character.position.set(0, 4.05, TOWER_Z);
    this.runners.forEach((p, i) => {
      p.data.vel = new THREE.Vector3();
      p.data.stun = 0;
      p.data.hits = 0;
      p.data.wait = 0;
      p.data.dodge = 0;
      p.data.target = null;
      p.character.position.set((i - 1) * 3.4, 0, START_Z);
      p.character.rotation.y = Math.PI;
    });

    // Crosshair: ring plus four ticks.
    this.reticle = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: this.paint });
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 28), mat);
    this.reticle.add(ringMesh);
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.35), mat);
      const a = (i / 4) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0);
      tick.rotation.z = a + Math.PI / 2;
      this.reticle.add(tick);
    }
    this.reticle.rotation.x = -Math.PI / 2;
    this.scene.add(this.reticle);

    this.camera.position.set(0, 21, 18);
    this.camera.lookAt(0, 0, -2.2);
    this.board = scorePanel(this.overlay);
    // The tower stands top-center, so the hearts go along the bottom instead.
    this.board.style.top = 'auto';
    this.board.style.bottom = '16px';
    this.renderScore();
  }

  private renderScore(): void {
    this.board.textContent = this.runners.map((r) => `${r.character.def.name} ${'♥'.repeat(LIVES - (r.data.hits as number))}${'·'.repeat(r.data.hits as number)}`).join('   ');
  }

  private fire(): void {
    const pos = MUZZLE.clone();
    const to = this.aim.clone();
    const dist = pos.distanceTo(to);
    const mesh = toonMesh(new THREE.SphereGeometry(0.2, 10, 8), this.paint, { outline: 0.02 });
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.shots.push({ mesh, pos, vel: to.sub(pos).multiplyScalar(SHOT_SPEED / dist), left: dist / SHOT_SPEED });
    this.solo.character.pose = 'jump';
    this.game.audio.play('jump');
    // Runners who spot the shot coming duck sideways (decided at the trigger, so every peer agrees).
    const rng = this.game.rng;
    for (const r of this.runners) if (rng.next() < 0.45) r.data.dodge = rng.next() < 0.5 ? -0.35 : 0.35;
  }

  /** Whether a straight shot from the tower at `to` would reach `target` before any crate. */
  private lineOfFire(to: THREE.Vector3, target: MinigamePlayer): boolean {
    const step = new THREE.Vector3().subVectors(to, MUZZLE);
    const n = Math.ceil(step.length() / 0.15);
    const p = new THREE.Vector3();
    for (let i = 1; i <= n; i++) {
      p.copy(MUZZLE).addScaledVector(step, i / n);
      if (this.touches(target, p)) return true;
      if (blocked(p)) return false;
    }
    return false;
  }

  private touches(r: MinigamePlayer, p: THREE.Vector3): boolean {
    const c = r.character.position;
    return p.y < BODY_H && Math.hypot(p.x - c.x, p.z - c.z) < BODY_R;
  }

  /** CPU tower: track the most advanced runner it can see, leading their run, and fire once on target. */
  private cpuAim(): { dir: THREE.Vector3; fire: boolean } {
    let target: MinigamePlayer | null = null;
    let fallback: MinigamePlayer | null = null;
    for (const r of this.runners) {
      if (!r.alive || (r.data.stun as number) > 0) continue;
      const at = r.character.position.clone();
      if (!fallback || at.z < fallback.character.position.z) fallback = r;
      if (!this.lineOfFire(at, r)) continue;
      if (!target || at.z < target.character.position.z) target = r;
    }
    const t = target ?? fallback;
    if (!t) return { dir: new THREE.Vector3(), fire: false };
    const flight = MUZZLE.distanceTo(t.character.position) / SHOT_SPEED;
    const lead = t.character.position.clone().addScaledVector(t.data.vel as THREE.Vector3, flight * 0.85).add(this.cpuErr).setY(0);
    const dir = lead.clone().sub(this.aim).setY(0);
    const d = dir.length();
    return {
      dir: d > 0.1 ? dir.divideScalar(d).multiplyScalar(Math.min(1, d * 2.5)) : new THREE.Vector3(),
      fire: target !== null && d < 0.5,
    };
  }

  /** CPU runner: hop from crate to crate toward the tower, wait behind each a moment, sidestep shots. */
  private cpuRun(p: MinigamePlayer, dt: number): THREE.Vector3 {
    const pos = p.character.position;
    const rng = this.game.rng;
    let target = p.data.target as THREE.Vector3 | null;
    if (!target) {
      // Next hiding spot: just behind (tower-side away) a crate further up the yard.
      const ahead = COVER.filter(([, z]) => z < pos.z - 1.5).sort((a, b) => Math.abs(a[0] - pos.x) + (pos.z - a[1]) * 0.4 - (Math.abs(b[0] - pos.x) + (pos.z - b[1]) * 0.4));
      if (ahead.length) {
        const [x, z, w] = ahead[Math.min(ahead.length - 1, rng.int(0, 1))];
        target = new THREE.Vector3(x + rng.range(-w / 3, w / 3), 0, z + COVER_D / 2 + 0.55);
      } else target = new THREE.Vector3(THREE.MathUtils.clamp(pos.x, -3, 3), 0, GOAL_Z - 1);
      p.data.target = target;
    }
    if ((p.data.wait as number) > 0) {
      p.data.wait = (p.data.wait as number) - dt;
      return new THREE.Vector3();
    }
    const to = target.clone().sub(pos).setY(0);
    if (to.length() < 0.25) {
      p.data.target = null;
      p.data.wait = rng.range(0.15, 0.9);
      return new THREE.Vector3();
    }
    const dir = to.normalize();
    const dodge = p.data.dodge as number;
    if (dodge !== 0) {
      dir.x += Math.sign(dodge) * 1.4;
      p.data.dodge = dodge - Math.sign(dodge) * Math.min(Math.abs(dodge), dt);
    }
    // Slide around crates rather than into them.
    for (const [x, z, w] of COVER) {
      if (Math.abs(pos.z - z) < COVER_D / 2 + 0.6 && Math.abs(pos.x - x) < w / 2 + 0.5 && pos.z > z) {
        if (target.z < z - 0.2) dir.x += pos.x >= x ? 1.2 : -1.2;
      }
    }
    return dir.normalize();
  }

  private splat(at: THREE.Vector3, size = 0.55): void {
    const s = new THREE.Mesh(new THREE.CircleGeometry(size, 14), new THREE.MeshBasicMaterial({ color: this.paint }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(at.x, 0.02 + this.splats.length * 0.0004, at.z);
    this.scene.add(s);
    this.splats.push(s);
    if (this.splats.length > 40) this.scene.remove(this.splats.shift()!);
  }

  private hit(r: MinigamePlayer, at: THREE.Vector3): void {
    r.data.hits = (r.data.hits as number) + 1;
    r.data.stun = STUN;
    r.data.target = null;
    r.data.wait = 0;
    const c = r.character;
    c.position.z = Math.min(START_Z, c.position.z + KNOCKBACK);
    pushOut(c.position);
    // A blob of paint stuck where it landed.
    const blob = toonMesh(new THREE.SphereGeometry(0.22, 10, 8), this.paint, { outline: false });
    blob.position.set(at.x - c.position.x, Math.max(0.4, at.y), 0.25);
    blob.scale.set(1.2, 0.8, 0.5);
    c.add(blob);
    c.setExpression('surprised');
    this.game.audio.play('pop');
    if ((r.data.hits as number) >= LIVES) {
      r.alive = false;
      c.pose = 'sulk';
      c.setExpression('sad');
      this.solo.character.pose = 'cheer';
    }
    this.renderScore();
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
    this.aim.z = THREE.MathUtils.clamp(this.aim.z, GOAL_Z - 1.5, START_Z + 0.8);
    if (fire && this.cool <= 0) {
      this.fire();
      this.cool = COOLDOWN;
      const rng = this.game.rng;
      this.cpuErr.set(rng.range(-0.55, 0.55), 0, rng.range(-0.55, 0.55));
    }
    if (this.cool < COOLDOWN - 0.2 && solo.character.pose === 'jump') solo.character.pose = 'idle';
    solo.character.rotation.y = Math.atan2(this.aim.x - solo.character.position.x, this.aim.z - solo.character.position.z);

    for (const r of this.runners) {
      if (!r.alive) continue;
      const c = r.character;
      if ((r.data.stun as number) > 0) {
        r.data.stun = (r.data.stun as number) - dt;
        (r.data.vel as THREE.Vector3).set(0, 0, 0);
        c.pose = 'sulk';
        continue;
      }
      const move = r.controller ? stick(r) : this.cpuRun(r, dt);
      (r.data.vel as THREE.Vector3).copy(move).multiplyScalar(RUN_SPEED);
      const next = c.position.clone().addScaledVector(move, RUN_SPEED * dt);
      next.x = THREE.MathUtils.clamp(next.x, -HALF_X + 0.3, HALF_X - 0.3);
      next.z = Math.min(START_Z + 0.5, next.z);
      c.position.copy(pushOut(next));
      face(r, move, dt);
      moveAnim(r, move.length());
      c.setExpression('determined');
      if (c.position.z <= GOAL_Z) {
        this.game.audio.play('star');
        return this.finish(this.runners);
      }
    }
    separate(this.alive.filter((p) => p.team === 1), 0.42);

    for (const s of [...this.shots]) {
      const steps = Math.max(1, Math.ceil((SHOT_SPEED * Math.min(dt, s.left)) / 0.15));
      const sub = Math.min(dt, s.left) / steps;
      let done = false;
      for (let i = 0; i < steps && !done; i++) {
        s.pos.addScaledVector(s.vel, sub);
        s.left -= sub;
        const victim = this.runners.find((r) => r.alive && (r.data.stun as number) <= 0 && this.touches(r, s.pos));
        if (victim) {
          this.hit(victim, s.pos);
          done = true;
        } else if (blocked(s.pos)) {
          this.game.audio.play('select');
          done = true;
        }
      }
      if (!done && s.left <= 1e-4) {
        this.splat(s.pos);
        done = true;
      }
      s.mesh.position.copy(s.pos);
      if (done) {
        this.scene.remove(s.mesh);
        this.shots.splice(this.shots.indexOf(s), 1);
      }
    }

    if (this.runners.every((r) => !r.alive)) this.finish([solo]);
  }

  animate(dt: number): void {
    super.animate(dt);
    this.reticle.position.set(this.aim.x, 0.04, this.aim.z);
    this.reticle.rotation.z += dt * 1.5;
    const k = 1 + (this.cool > 0 ? 0.25 * (this.cool / COOLDOWN) : 0);
    this.reticle.scale.setScalar(k);
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p === this.solo ? 0 : -(p.data.hits as number);
  }

  timeout(): number[] {
    return [this.solo.seat];
  }
}

export const sniperTower: MinigameDef = {
  id: 'snipertower',
  name: 'Sniper Tower',
  kind: '1v3',
  song: sniperTheme,
  rules: 'Runners: dash from crate to crate and touch the base of the tower. One of you makes it and you all win! Tower: paint them as they run. Two splats and a runner is out; hold them off until time runs out.',
  controls: 'Tower: stick to aim, A to fire · Runners: stick to run',
  create: () => new SniperTower(),
};
