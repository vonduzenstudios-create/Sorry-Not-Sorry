import * as THREE from 'three';
import { giantTheme } from '../audio/songs/minigameThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, scorePanel, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 7.2;
const DRAG = 2.4;
const DASH_COOLDOWN = 1.3;
const DASH_TIME = 0.3;
const BOUNCE = 0.7;
/** Knockback lives in its own vector so the walking speed cap can't erase it. */
const KNOCK_DRAG = 3;
/** Knockback speed (and hit strength) that causes a stagger. */
const STAGGER_AT = 3;

interface Body {
  vel: THREE.Vector3;
  mass: number;
  r: number;
  accel: number;
  max: number;
  dashPower: number;
  dash: number;
  cool: number;
  /** Knockback velocity from hits; decays on its own, never capped by `max`. */
  push: THREE.Vector3;
  /** Most knockback this body can take in one go. */
  maxPush: number;
  /** Stagger time left: steering and charging are weakened. */
  stun: number;
  /** How much a hit staggers this body (the giant shrugs hits off faster). */
  grit: number;
}

/**
 * 1 vs 3 sumo. The solo player is a giant: heavy and hard to move. The other
 * three work together to shove them out of the ring, while the giant tries to
 * sweep them off. A dashes. If the giant's still in at the end, the giant wins.
 */
class GiantShove extends Minigame {
  readonly timeLimit = 25;
  private bodies = new Map<MinigamePlayer, Body>();
  private board!: HTMLDivElement;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0xffd0a0, 0xfff4e0], 0xd89a6a, -10);
    const ringTop = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS + 0.4, 0.8, 48), 0xf0d8a8, { outline: 0.07 });
    ringTop.position.y = -0.4;
    const base = toonMesh(new THREE.CylinderGeometry(RADIUS + 0.4, RADIUS + 1.6, 3, 48), 0xc99a6b, { outline: 0.07 });
    base.position.y = -2.3;
    const rope = toonMesh(new THREE.TorusGeometry(RADIUS - 0.2, 0.14, 8, 64), 0xe6c98a, { outline: 0.02 });
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.05;
    this.scene.add(ringTop, base, rope);
    for (const s of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.15), new THREE.MeshBasicMaterial({ color: Palette.ink }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.01, s * 1.2);
      this.scene.add(line);
    }
    // Paper lanterns on poles around the ring.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pole = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), 0xa06a40, { outline: 0.02 });
      pole.position.set(Math.cos(a) * (RADIUS + 1), 1, Math.sin(a) * (RADIUS + 1));
      const lantern = toonMesh(new THREE.SphereGeometry(0.4, 14, 10), [Palette.coral, Palette.yellow][i % 2], { outline: 0.02, emissive: 0x442200 });
      lantern.scale.y = 1.3;
      lantern.position.set(pole.position.x, 3.2, pole.position.z);
      this.scene.add(pole, lantern);
    }

    const solo = this.solo;
    solo.character.scale.setScalar(1.7);
    solo.character.position.set(0, 0, -1.5);
    solo.character.rotation.y = 0;
    this.bodies.set(solo, { vel: new THREE.Vector3(), mass: 3.6, r: 0.85, accel: 14, max: 4.8, dashPower: 9.5, dash: 0, cool: 0, push: new THREE.Vector3(), maxPush: 5, stun: 0, grit: 0.5 });
    this.runners.forEach((p, i) => {
      const a = Math.PI / 2 + (i - 1) * 0.8;
      p.character.position.set(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5);
      p.character.rotation.y = Math.PI;
      this.bodies.set(p, { vel: new THREE.Vector3(), mass: 1, r: 0.45, accel: 17, max: 5.6, dashPower: 8, dash: 0, cool: 0, push: new THREE.Vector3(), maxPush: 15, stun: 0, grit: 1 });
    });
    this.camera.position.set(0, 15, 14);
    this.camera.lookAt(0, 0, 0.4);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.textContent = `In the ring: ${this.runners.filter((r) => r.alive).length} vs ${this.solo.alive ? 'the Giant' : '—'}`;
  }

  private cpuGiant(): { dir: THREE.Vector3; dash: boolean } {
    const pos = this.solo.character.position;
    const r = Math.hypot(pos.x, pos.z);
    if (r > RADIUS - 2) return { dir: new THREE.Vector3(-pos.x, 0, -pos.z).normalize(), dash: false };
    let target: MinigamePlayer | null = null;
    let best = Infinity;
    for (const o of this.runners) {
      if (!o.alive) continue;
      // Prefer runners near the edge: easier to finish off.
      const op = o.character.position;
      const s = op.distanceTo(pos) - Math.hypot(op.x, op.z) * 0.4;
      if (s < best) {
        best = s;
        target = o;
      }
    }
    if (!target) return { dir: new THREE.Vector3(), dash: false };
    const dir = target.character.position.clone().sub(pos).setY(0);
    const d = dir.length();
    return { dir: dir.normalize(), dash: d < 2.4 };
  }

  /** Runners circle around behind the giant (away from the edge it's closest to) and shove outward. */
  private cpuRunner(p: MinigamePlayer): { dir: THREE.Vector3; dash: boolean } {
    const pos = p.character.position;
    const r = Math.hypot(pos.x, pos.z);
    if (r > RADIUS - 1.5) return { dir: new THREE.Vector3(-pos.x, 0, -pos.z).normalize(), dash: false };
    const g = this.solo.character.position;
    const gr = Math.hypot(g.x, g.z);
    const out = gr > 0.6 ? new THREE.Vector3(g.x, 0, g.z).divideScalar(gr) : new THREE.Vector3(Math.cos(p.seat * 2.1), 0, Math.sin(p.seat * 2.1));
    // Fan the three out a little so they don't stack.
    const spread = (this.runners.indexOf(p) - 1) * 0.6;
    const behind = out.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread).multiplyScalar(-2.1).add(g).setY(0);
    const toSpot = behind.clone().sub(pos);
    const toGiant = g.clone().sub(pos).setY(0);
    const dist = toGiant.length();
    if (toSpot.length() < 1.1 && dist < 2.8) return { dir: toGiant.normalize(), dash: true };
    const dir = toSpot.normalize();
    // Too close and on the wrong side: skirt around the giant.
    if (dist < 2) {
      const tangent = new THREE.Vector3(-toGiant.z, 0, toGiant.x).normalize();
      if (tangent.dot(toSpot) < 0) tangent.negate();
      dir.add(tangent.multiplyScalar(1.5)).addScaledVector(toGiant.normalize(), -0.8).normalize();
    }
    return { dir: dir.multiplyScalar(0.95), dash: false };
  }

  play(dt: number): void {
    for (const p of this.alive) {
      const b = this.bodies.get(p)!;
      const c = p.character;
      b.cool = Math.max(0, b.cool - dt);
      b.dash = Math.max(0, b.dash - dt);
      if (b.stun > 0) {
        b.stun = Math.max(0, b.stun - dt);
        if (b.stun === 0) c.setExpression('neutral');
      }
      let dir: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        dir = stick(p);
        dash = p.controller.pressed('a');
      } else ({ dir, dash } = p === this.solo ? this.cpuGiant() : this.cpuRunner(p));
      if (dash && b.cool <= 0 && b.stun <= 0) {
        const d = dir.lengthSq() > 0.01 ? dir.clone().normalize() : new THREE.Vector3(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
        b.vel.addScaledVector(d, b.dashPower);
        b.dash = DASH_TIME;
        b.cool = DASH_COOLDOWN;
        this.game.audio.play('jump');
      }
      b.vel.addScaledVector(dir, b.accel * dt * (b.stun > 0 ? 0.3 : 1));
      b.vel.multiplyScalar(Math.exp(-DRAG * dt));
      // Ease back down to walking speed after a charge rather than stopping dead.
      const cap = b.dash > 0 ? b.max + b.dashPower : b.max;
      const speed = b.vel.length();
      if (speed > cap) b.vel.setLength(Math.max(cap, speed - 30 * dt));
      b.push.multiplyScalar(Math.exp(-KNOCK_DRAG * dt));
    }

    // Mass-weighted bumps; dashing hits land harder.
    const live = this.alive;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const pa = live[i];
        const pb = live[j];
        const a = this.bodies.get(pa)!;
        const b = this.bodies.get(pb)!;
        const n = pb.character.position.clone().sub(pa.character.position).setY(0);
        const d = n.length();
        const min = a.r + b.r;
        if (d === 0 || d > min) continue;
        n.divideScalar(d);
        const overlap = min - d;
        const wa = b.mass / (a.mass + b.mass);
        pa.character.position.addScaledVector(n, -overlap * wa);
        pb.character.position.addScaledVector(n, overlap * (1 - wa));
        const rel = a.vel.clone().add(a.push).sub(b.vel).sub(b.push).dot(n);
        if (rel <= 0) continue;
        const punch = a.dash > 0 || b.dash > 0 ? 1.6 : 1;
        const jImp = ((1 + BOUNCE) * rel * punch) / (1 / a.mass + 1 / b.mass);
        // Each side's walking velocity into the other stops; the hit goes into knockback.
        this.absorb(a, n, true);
        this.absorb(b, n, false);
        this.knock(pa, a, n.clone().negate(), jImp / a.mass);
        this.knock(pb, b, n, jImp / b.mass);
        if (punch > 1) this.game.audio.play('pop');
      }
    }

    for (const p of this.players) {
      const c = p.character;
      if (!p.alive) continue;
      const b = this.bodies.get(p)!;
      c.position.addScaledVector(b.vel, dt).addScaledVector(b.push, dt);
      face(p, b.vel, dt);
      moveAnim(p, b.vel.length() / b.max);
      if (Math.hypot(c.position.x, c.position.z) > RADIUS + 0.1) {
        knockOut(p, b.vel.clone().add(b.push).multiplyScalar(0.6));
        this.game.audio.play(p === this.solo ? 'boom' : 'back');
        this.renderScore();
      }
    }

    if (!this.solo.alive) this.finish(this.runners);
    else if (this.runners.every((r) => !r.alive)) this.finish([this.solo]);
  }

  /** Removes the part of a body's walking velocity heading into the contact. */
  private absorb(b: Body, n: THREE.Vector3, towardN: boolean): void {
    const into = b.vel.dot(n) * (towardN ? 1 : -1);
    if (into > 0) b.vel.addScaledVector(n, towardN ? -into : into);
  }

  private knock(p: MinigamePlayer, b: Body, dir: THREE.Vector3, amount: number): void {
    b.push.addScaledVector(dir, amount);
    if (b.push.length() > b.maxPush) b.push.setLength(b.maxPush);
    if (amount > STAGGER_AT) {
      b.stun = Math.max(b.stun, Math.min(0.45, 0.12 + amount * 0.03) * b.grit);
      p.character.setExpression('surprised');
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) if (!p.alive) fall(p, dt);
  }

  timeout(): number[] {
    return this.solo.alive ? [this.solo.seat] : this.runners.map((r) => r.seat);
  }
}

export const giantShove: MinigameDef = {
  id: 'giantshove',
  name: 'Giant Shove',
  kind: '1v3',
  song: giantTheme,
  rules: 'One player is a heavy giant! The other three team up to shove them out of the ring. The giant wins by knocking everyone out or lasting until time runs out.',
  controls: 'Stick: move · A: charge',
  create: () => new GiantShove(),
};
