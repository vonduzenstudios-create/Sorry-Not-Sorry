import * as THREE from 'three';
import { pinballTheme } from '../audio/songs/pinballMagnetThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, scorePanel, stick, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HW = 6; // half width of the table (x)
const HL = 9; // half length (z); the drain is at +z, nearest the camera
const BALL = 0.5;
const SLOPE = 8; // the table's tilt pulls every ball toward the drain
const ACCEL = 10.5;
const DRAG = 0.35;
const MAX_SPEED = 20;
const DASH = 9;
const DASH_COOLDOWN = 1.5;
const BUMPER = 0.75;
const BUMPER_KICK = 9;
const POINTS = 10;
const GOLD_POINTS = 30;
const GOLD_EVERY = 6;
const DRAIN_PENALTY = 20;
const RESPAWN = 1.2;
const FLIP_LEN = 2;
const FLIP_REST = 0.45;
const FLIP_UP = -0.5;
const FLIP_KICK = 15;
const SUBSTEPS = 3;

const BUMPERS: [number, number][] = [
  [0, -6.2],
  [-3, -4],
  [3, -4],
  [0, -1.6],
  [-3.6, 1.4],
  [3.6, 1.4],
];
const BUMPER_NOTES = ['E6', 'C#6', 'B5', 'A5', 'F#5', 'G#5'];

interface Seg {
  a: THREE.Vector3;
  b: THREE.Vector3;
  bounce: number;
}

interface Flipper {
  pivot: THREE.Vector3;
  /** +1 left flipper (points right), -1 right flipper. */
  side: number;
  angle: number;
  hold: number;
  cool: number;
  mesh: THREE.Group;
}

interface Ball {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  cool: number;
  /** Seconds until a drained ball comes back; 0 while in play. */
  out: number;
}

const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);

/** Pushes a ball out of a segment and bounces it. Returns the contact normal, or null. */
function hitSegment(pos: THREE.Vector3, vel: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, bounce: number): THREE.Vector3 | null {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(pos.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  const closest = a.clone().addScaledVector(ab, t);
  const n = pos.clone().sub(closest).setY(0);
  const d = n.length();
  if (d >= BALL || d === 0) return null;
  n.divideScalar(d);
  pos.addScaledVector(n, BALL - d);
  const vn = vel.dot(n);
  if (vn < 0) vel.addScaledVector(n, -(1 + bounce) * vn);
  return n;
}

/**
 * Like hitSegment, but one-sided: the table's middle is always inside, so a
 * ball knocked fully past a rail still gets pushed back instead of escaping.
 */
function hitWall(pos: THREE.Vector3, vel: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, bounce: number): void {
  const ab = b.clone().sub(a);
  const t = pos.clone().sub(a).dot(ab) / ab.lengthSq();
  if (t < 0 || t > 1) {
    hitSegment(pos, vel, a, b, bounce);
    return;
  }
  const n = v(-ab.z, ab.x).normalize();
  if (n.dot(a) > 0) n.negate();
  const d = pos.clone().sub(a).dot(n);
  if (d >= BALL) return;
  pos.addScaledVector(n, BALL - d);
  const vn = vel.dot(n);
  if (vn < 0) vel.addScaledVector(n, -(1 + bounce) * vn);
}

/**
 * Everyone is a ball on a tilted pinball table. Nudge yourself into the pop
 * bumpers for points (the gold one pays triple) and don't fall down the drain.
 */
class PinballPanic extends Minigame {
  readonly timeLimit = 40;
  private balls: Ball[] = [];
  private score: number[] = [];
  private walls: Seg[] = [];
  private flippers: Flipper[] = [];
  private bumpers: THREE.Group[] = [];
  private flash: number[] = BUMPERS.map(() => 0);
  private gold = 0;
  private goldT = GOLD_EVERY;
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x8ec9ff, 0xffe1f0], 0x9d8bff, -8);
    const bed = toonMesh(new THREE.BoxGeometry(HW * 2 + 1, 1, HL * 2 + 1.5), Palette.violet, { outline: 0.08 });
    bed.position.set(0, -0.5, 0.4);
    this.scene.add(bed);
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HL * 2), new THREE.MeshToonMaterial({ color: 0x3d3470 }));
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.01;
    felt.receiveShadow = true;
    this.scene.add(felt);
    // Painted stars and lane arrows on the playfield.
    const deco = new THREE.MeshBasicMaterial({ color: 0x5a4d9a });
    for (const [x, z, s] of [[-4, -7, 0.6], [4.2, -7.2, 0.5], [-1.6, 3.5, 0.45], [1.8, 4.4, 0.55], [-4.4, -1.2, 0.4], [4.5, -1, 0.4]]) {
      const star = new THREE.Mesh(new THREE.CircleGeometry(s, 5), deco);
      star.rotation.x = -Math.PI / 2;
      star.position.set(x, 0.02, z);
      this.scene.add(star);
    }
    for (const x of [-1.2, 0, 1.2]) {
      const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 3), new THREE.MeshBasicMaterial({ color: Palette.butter }));
      arrow.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      arrow.position.set(x, 0.02, 5.2);
      this.scene.add(arrow);
    }

    // Walls: rails, angled top corners and the funnel down to the flippers.
    const pivotL = v(-2.9, 7.2);
    const pivotR = v(2.9, 7.2);
    const segs: [THREE.Vector3, THREE.Vector3, number][] = [
      [v(-HW, -HL), v(HW, -HL), 0.5],
      [v(-HW, -HL), v(-HW, 4.6), 0.5],
      [v(HW, -HL), v(HW, 4.6), 0.5],
      [v(-HW, -6.6), v(-3.6, -HL), 0.6],
      [v(HW, -6.6), v(3.6, -HL), 0.6],
      [v(-HW, 4.6), pivotL, 0.7],
      [v(HW, 4.6), pivotR, 0.7],
    ];
    for (const [a, b, bounce] of segs) {
      this.walls.push({ a, b, bounce });
      const len = a.distanceTo(b);
      const rail = toonMesh(new THREE.BoxGeometry(len + 0.3, 0.7, 0.3), Palette.cream, { outline: 0.04 });
      rail.position.set((a.x + b.x) / 2, 0.35, (a.z + b.z) / 2);
      rail.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
      this.scene.add(rail);
    }
    // The drain: a dark slot past the flippers.
    const drain = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    drain.rotation.x = -Math.PI / 2;
    drain.position.set(0, 0.03, HL - 0.2);
    this.scene.add(drain);

    for (const [pivot, side] of [[pivotL, 1], [pivotR, -1]] as const) {
      const mesh = new THREE.Group();
      mesh.position.copy(pivot).setY(0.3);
      const arm = toonMesh(new THREE.CapsuleGeometry(0.22, FLIP_LEN - 0.2, 4, 10), Palette.coral, { outline: 0.03 });
      arm.rotation.z = Math.PI / 2;
      arm.position.x = FLIP_LEN / 2;
      const cap = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 14), Palette.cream, { outline: 0.03 });
      mesh.add(arm, cap);
      this.scene.add(mesh);
      this.flippers.push({ pivot, side, angle: FLIP_REST, hold: 0, cool: 0, mesh });
    }

    for (const [x, z] of BUMPERS) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const base = toonMesh(new THREE.CylinderGeometry(BUMPER, BUMPER * 1.1, 0.5, 24), Palette.sky, { outline: 0.04 });
      base.position.y = 0.25;
      const cap = toonMesh(new THREE.CylinderGeometry(BUMPER * 0.8, BUMPER * 0.9, 0.3, 24), Palette.rose, { outline: 0.03 });
      cap.position.y = 0.65;
      const ring = toonMesh(new THREE.TorusGeometry(BUMPER * 0.95, 0.09, 8, 24), Palette.cream, { outline: false });
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.52;
      g.add(base, cap, ring);
      g.userData.cap = cap;
      this.scene.add(g);
      this.bumpers.push(g);
    }
    this.gold = this.game.rng.int(0, BUMPERS.length - 1);
    this.paintBumpers();

    this.players.forEach((p, i) => {
      const mesh = toonMesh(new THREE.SphereGeometry(BALL, 24, 16), p.character.def.colors.accent, { outline: 0.03 });
      this.scene.add(mesh);
      const ball: Ball = { mesh, vel: new THREE.Vector3(), cool: 0, out: 0 };
      this.balls.push(ball);
      this.score.push(0);
      this.launch(i);
      p.character.scale.setScalar(0.5);
    });
    this.camera.position.set(0, 26, 15);
    this.camera.lookAt(0, 0, -0.2);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  /** Puts a ball back in play along the top rail. */
  private launch(i: number): void {
    const ball = this.balls[i];
    const n = this.players.length;
    ball.mesh.position.set(-3 + (6 * (i + 0.5)) / n, BALL, -HL + 1.2);
    ball.vel.set(i % 2 ? 2 : -2, 0, 1);
    ball.out = 0;
    ball.mesh.visible = true;
    this.players[i].character.visible = true;
  }

  private paintBumpers(): void {
    this.bumpers.forEach((g, i) => {
      const mat = (g.userData.cap as THREE.Mesh).material as THREE.MeshToonMaterial;
      mat.color.setHex(i === this.gold ? Palette.yellow : Palette.rose);
    });
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p, i) => `<span style="color:${css(p.character.def.colors.accent)}">● ${this.score[i]}</span>`)
      .join('');
  }

  private flipperTip(f: Flipper): THREE.Vector3 {
    return f.pivot.clone().add(v(f.side * Math.cos(f.angle) * FLIP_LEN, Math.sin(f.angle) * FLIP_LEN));
  }

  /** CPUs steer for the gold bumper (or a much closer one) and fight the drain. */
  private cpu(p: MinigamePlayer, i: number): { dir: THREE.Vector3; dash: boolean } {
    const ball = this.balls[i];
    const pos = ball.mesh.position;
    if (pos.z > 3.8 && ball.vel.z > -2) {
      const dir = v(-pos.x * 0.15, -1).normalize();
      return { dir, dash: pos.z > 5.2 };
    }
    let target = this.gold;
    let best = Infinity;
    BUMPERS.forEach(([x, z], b) => {
      const d = Math.hypot(x - pos.x, z - pos.z) + (b === this.gold ? -3.5 : 0) + (((b + p.seat) % 3) * 0.6);
      if (d < best) {
        best = d;
        target = b;
      }
    });
    const [tx, tz] = BUMPERS[target];
    const dir = v(tx - pos.x, tz - pos.z);
    const d = dir.length();
    dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.t * 1.7 + p.seat * 2) * 0.35);
    return { dir: dir.multiplyScalar(0.92), dash: d > 6 && Math.sin(this.t * 0.9 + p.seat) > 0.6 };
  }

  play(dt: number): void {
    this.goldT -= dt;
    if (this.goldT <= 0) {
      this.goldT = GOLD_EVERY;
      this.gold = (this.gold + this.game.rng.int(1, BUMPERS.length - 1)) % BUMPERS.length;
      this.paintBumpers();
    }

    // Flippers fire on their own whenever a ball rolls over them.
    for (const f of this.flippers) {
      f.cool = Math.max(0, f.cool - dt);
      f.hold = Math.max(0, f.hold - dt);
      if (f.hold <= 0 && f.cool <= 0) {
        const mid = f.pivot.clone().add(v(f.side * FLIP_LEN * 0.5, 0.2));
        const near = this.balls.some((b) => b.out <= 0 && b.mesh.position.distanceTo(mid) < 1.7 && b.mesh.position.z < f.pivot.z + 1);
        if (near) {
          f.hold = 0.22;
          f.cool = 0.5;
          this.game.audio.play('jump');
        }
      }
    }

    this.players.forEach((p, i) => {
      const ball = this.balls[i];
      if (ball.out > 0) {
        ball.out -= dt;
        if (ball.out <= 0) this.launch(i);
        return;
      }
      ball.cool = Math.max(0, ball.cool - dt);
      let dir: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        dir = stick(p);
        dash = p.controller.pressed('a');
      } else {
        ({ dir, dash } = this.cpu(p, i));
      }
      ball.vel.addScaledVector(dir, ACCEL * dt);
      ball.vel.z += SLOPE * dt;
      if (dash && ball.cool <= 0) {
        ball.cool = DASH_COOLDOWN;
        ball.vel.addScaledVector(dir.lengthSq() > 0.01 ? dir.clone().normalize() : v(0, -1), DASH);
        this.game.audio.play('jump');
      }
      ball.vel.multiplyScalar(Math.exp(-DRAG * dt));
    });

    const h = dt / SUBSTEPS;
    let scored = false;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const f of this.flippers) {
        const target = f.hold > 0 ? FLIP_UP : FLIP_REST;
        const rate = f.hold > 0 ? 20 : 8;
        f.angle += THREE.MathUtils.clamp(target - f.angle, -rate * h, rate * h);
      }
      this.balls.forEach((ball, i) => {
        if (ball.out > 0) return;
        if (ball.vel.length() > MAX_SPEED) ball.vel.setLength(MAX_SPEED);
        const pos = ball.mesh.position;
        pos.addScaledVector(ball.vel, h);
        for (const w of this.walls) hitWall(pos, ball.vel, w.a, w.b, w.bounce);
        for (const f of this.flippers) {
          const n = hitSegment(pos, ball.vel, f.pivot, this.flipperTip(f), 0.3);
          // A rising flipper bats the ball up the table, harder near the tip.
          if (n && f.hold > 0 && f.angle > FLIP_UP + 0.05) {
            const along = THREE.MathUtils.clamp(Math.abs(pos.x - f.pivot.x) / FLIP_LEN, 0.3, 1);
            ball.vel.addScaledVector(n, FLIP_KICK * along);
          }
        }
        BUMPERS.forEach(([x, z], b) => {
          const n = v(pos.x - x, pos.z - z);
          const d = n.length();
          if (d >= BUMPER + BALL || d === 0) return;
          n.divideScalar(d);
          pos.x = x + n.x * (BUMPER + BALL);
          pos.z = z + n.z * (BUMPER + BALL);
          const vn = ball.vel.dot(n);
          if (vn < 0) ball.vel.addScaledVector(n, -vn);
          ball.vel.addScaledVector(n, BUMPER_KICK);
          this.score[i] += b === this.gold ? GOLD_POINTS : POINTS;
          this.flash[b] = 1;
          scored = true;
          this.game.audio.note('bell', BUMPER_NOTES[b], 0.18, b === this.gold ? 0.35 : 0.22);
          if (b === this.gold) this.game.audio.play('coin');
        });
        if (pos.z > HL + 0.6) {
          ball.out = RESPAWN;
          ball.mesh.visible = false;
          this.players[i].character.visible = false;
          this.score[i] = Math.max(0, this.score[i] - DRAIN_PENALTY);
          scored = true;
          this.game.audio.play('back');
        }
      });

      // Balls clack off each other.
      for (let i = 0; i < this.balls.length; i++) {
        for (let j = i + 1; j < this.balls.length; j++) {
          const a = this.balls[i];
          const b = this.balls[j];
          if (a.out > 0 || b.out > 0) continue;
          const n = b.mesh.position.clone().sub(a.mesh.position).setY(0);
          const d = n.length();
          if (d === 0 || d >= BALL * 2) continue;
          n.divideScalar(d);
          const overlap = BALL * 2 - d;
          a.mesh.position.addScaledVector(n, -overlap / 2);
          b.mesh.position.addScaledVector(n, overlap / 2);
          const rel = a.vel.clone().sub(b.vel).dot(n);
          if (rel > 0) {
            const impulse = rel * 1.1 + 1;
            a.vel.addScaledVector(n, -impulse);
            b.vel.addScaledVector(n, impulse);
          }
        }
      }
    }
    if (scored) this.renderScore();

    this.players.forEach((p, i) => {
      const ball = this.balls[i];
      if (ball.out > 0) return;
      const pos = ball.mesh.position;
      const axis = new THREE.Vector3(ball.vel.z, 0, -ball.vel.x);
      const speed = axis.length();
      if (speed > 0.001) ball.mesh.rotateOnWorldAxis(axis.normalize(), (speed * dt) / BALL);
      p.character.position.set(pos.x, BALL * 2 - 0.08, pos.z);
      face(p, ball.vel, dt);
      p.character.pose = 'idle';
    });
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const f of this.flippers) f.mesh.rotation.y = Math.atan2(-Math.sin(f.angle), f.side * Math.cos(f.angle));
    this.bumpers.forEach((g, i) => {
      this.flash[i] = Math.max(0, this.flash[i] - dt * 5);
      const pulse = i === this.gold ? 1 + Math.sin(this.t * 8) * 0.05 : 1;
      g.scale.set(pulse + this.flash[i] * 0.25, 1 - this.flash[i] * 0.2, pulse + this.flash[i] * 0.25);
    });
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return this.score[this.players.indexOf(p)];
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => this.score[this.players.indexOf(p)], 0);
  }
}

export const pinballPanic: MinigameDef = {
  id: 'pinball',
  name: 'Pinball Panic',
  kind: 'ffa',
  duel: true,
  song: pinballTheme,
  rules: 'You are the pinball! Roll into bumpers for points; the gold one pays triple. Drain and you lose points!',
  controls: 'Stick: nudge · A: boost',
  create: () => new PinballPanic(),
};
