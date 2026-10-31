import * as THREE from 'three';
import { rocketTheme } from '../audio/songs/rocketLavaThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { fall, knockOut, ring, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 9;
const MIN_RADIUS = 5.5;
const SHRINK_FROM = 12;
const HIT = 1;
const THRUST = 9;
const BOOST = 15;
const BOOST_TIME = 0.45;
const BOOST_COOLDOWN = 2.2;
const TURN = 2.3;
const DRAG = 1.1;
/** Sideways grip: low, so rockets drift through turns. */
const GRIP = 1.6;
const RIDE_Y = 0.75;

interface Rocket {
  mesh: THREE.Group;
  flame: THREE.Mesh;
  heading: number;
  vel: THREE.Vector3;
  boost: number;
  cooldown: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Everyone rides a rocket that never stops pushing forward and turns like a
 * shopping cart. Steer into rivals (A for a burst) to knock them off the
 * floating arena, which shrinks as the clock runs. Last rider left wins.
 */
class RocketRodeo extends Minigame {
  readonly timeLimit = 50;
  private rockets = new Map<MinigamePlayer, Rocket>();
  private clock = 0;
  private radius = RADIUS;
  private deck!: THREE.Group;

  protected setup(): void {
    arenaBasics(this.scene, [0x2c2a5c, 0xffb8d8], 0x55488f, -16);
    // Stars in the sky, kept low-key.
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: Palette.cream }));
      const a = i * 2.39996;
      const r = 30 + (i % 7) * 6;
      s.position.set(Math.cos(a) * r, 4 + (i % 11) * 2.5, Math.sin(a) * r - 20);
      this.scene.add(s);
    }

    // The deck is scaled down as the arena shrinks.
    this.deck = new THREE.Group();
    const top = toonMesh(new THREE.CylinderGeometry(1, 1, 0.6, 64), Palette.butter, { outline: 0.06 });
    top.scale.set(RADIUS, 1, RADIUS);
    top.position.y = -0.3;
    const under = toonMesh(new THREE.ConeGeometry(1, 1, 64), Palette.lavender, { outline: 0.06 });
    under.scale.set(RADIUS * 0.96, 5, RADIUS * 0.96);
    under.rotation.x = Math.PI;
    under.position.y = -3.1;
    this.deck.add(top, under);
    for (const [r, color] of [
      [0.75, Palette.peach],
      [0.45, Palette.rose],
      [0.15, Palette.coral],
    ] as const) {
      const band = new THREE.Mesh(new THREE.RingGeometry(r * RADIUS - 0.25, r * RADIUS + 0.25, 64), new THREE.MeshBasicMaterial({ color }));
      band.rotation.x = -Math.PI / 2;
      band.position.y = 0.01;
      this.deck.add(band);
    }
    // Hazard studs around the rim.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const stud = toonMesh(new THREE.SphereGeometry(0.22, 10, 6), i % 2 ? Palette.coral : Palette.cream, { outline: false });
      stud.position.set(Math.cos(a) * (RADIUS - 0.25), 0.05, Math.sin(a) * (RADIUS - 0.25));
      this.deck.add(stud);
    }
    this.scene.add(this.deck);

    ring(this.players, 5.5);
    for (const p of this.players) {
      const pos = p.character.position;
      const heading = Math.atan2(-pos.x, -pos.z);
      const { mesh, flame } = this.buildRocket(p.character.def.colors.accent);
      mesh.position.set(pos.x, RIDE_Y, pos.z);
      mesh.rotation.y = heading;
      p.character.position.y = RIDE_Y + 0.25;
      this.scene.add(mesh);
      this.rockets.set(p, { mesh, flame, heading, vel: new THREE.Vector3(), boost: 0, cooldown: 0.5 + p.seat * 0.2 });
      p.character.scale.setScalar(0.75);
      p.data.react = 0;
    }
    this.camera.position.set(0, 19, 16);
    this.camera.lookAt(0, 0, 0.5);
  }

  /** A chunky toy rocket pointing along +Z, with a flame out the back. */
  private buildRocket(color: number): { mesh: THREE.Group; flame: THREE.Mesh } {
    const g = new THREE.Group();
    const body = toonMesh(new THREE.CylinderGeometry(0.42, 0.42, 1.8, 20), Palette.cream, { outline: 0.04 });
    body.rotation.x = Math.PI / 2;
    const nose = toonMesh(new THREE.ConeGeometry(0.42, 0.75, 20), color, { outline: 0.04 });
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.27;
    const stripe = toonMesh(new THREE.CylinderGeometry(0.44, 0.44, 0.25, 20), color, { outline: false });
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = -0.3;
    g.add(body, nose, stripe);
    for (let i = 0; i < 3; i++) {
      const fin = toonMesh(new THREE.BoxGeometry(0.08, 0.5, 0.6), color, { outline: 0.03 });
      const pivot = new THREE.Group();
      fin.position.set(0, 0.5, 0);
      pivot.add(fin);
      pivot.rotation.z = (i / 3) * Math.PI * 2 + Math.PI;
      pivot.position.z = -0.7;
      g.add(pivot);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1, 12), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -1.35;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.6, 10), new THREE.MeshBasicMaterial({ color: Palette.butter }));
    core.position.y = 0.15;
    flame.add(core);
    g.add(flame);
    return { mesh: g, flame };
  }

  /** CPU: steer for a rival, but bail toward the middle when the edge looms. */
  private cpu(p: MinigamePlayer, r: Rocket): { dir: THREE.Vector3; boost: boolean } {
    const pos = r.mesh.position;
    const ahead = pos.clone().addScaledVector(r.vel, 0.7);
    const forward = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
    if (Math.hypot(ahead.x, ahead.z) > this.radius - 1.8) {
      return { dir: new THREE.Vector3(-pos.x, 0, -pos.z).normalize(), boost: false };
    }
    let target: THREE.Vector3 | null = null;
    let best = Infinity;
    for (const o of this.alive) {
      if (o === p) continue;
      const op = this.rockets.get(o)!.mesh.position;
      // Rivals near the edge are juicier targets.
      const d = op.distanceTo(pos) - Math.hypot(op.x, op.z) * 0.4;
      if (d < best) {
        best = d;
        target = op;
      }
    }
    if (!target) return { dir: new THREE.Vector3(-pos.x, 0, -pos.z), boost: false };
    const to = target.clone().sub(pos).setY(0);
    const dist = to.length();
    to.normalize();
    // A slow per-seat wobble so CPUs miss now and then.
    to.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.clock * 1.3 + p.seat * 2) * 0.35);
    const aligned = to.dot(forward) > 0.93;
    let boost = false;
    if (aligned && dist < 5 && r.cooldown <= 0) {
      p.data.react = (p.data.react as number) + 1;
      boost = (p.data.react as number) > 8 + p.seat * 3 && this.game.rng.next() < 0.5;
      if (boost) p.data.react = 0;
    }
    return { dir: to, boost };
  }

  play(dt: number): void {
    this.clock += dt;
    if (this.clock > SHRINK_FROM) {
      const before = this.radius;
      this.radius = Math.max(MIN_RADIUS, this.radius - 0.12 * dt);
      if (before > MIN_RADIUS && this.radius === MIN_RADIUS) this.game.audio.play('boom');
      const s = this.radius / RADIUS;
      this.deck.scale.set(s, 1, s);
    }

    for (const p of this.alive) {
      const r = this.rockets.get(p)!;
      let dir: THREE.Vector3;
      let boost: boolean;
      if (p.controller) {
        dir = stick(p);
        boost = p.controller.pressed('a');
      } else ({ dir, boost } = this.cpu(p, r));
      // Turn toward the stick at a fixed, sluggish rate.
      if (dir.lengthSq() > 0.04) {
        const diff = wrap(Math.atan2(dir.x, dir.z) - r.heading);
        r.heading += THREE.MathUtils.clamp(diff, -TURN * dt, TURN * dt);
      }
      r.cooldown -= dt;
      if (boost && r.cooldown <= 0) {
        r.boost = BOOST_TIME;
        r.cooldown = BOOST_COOLDOWN;
        this.game.audio.play('dice');
      }
      r.boost = Math.max(0, r.boost - dt);
      const forward = new THREE.Vector3(Math.sin(r.heading), 0, Math.cos(r.heading));
      r.vel.addScaledVector(forward, (r.boost > 0 ? BOOST : THRUST) * dt);
      // Bleed off sideways speed slowly (drift), forward speed via drag.
      const fwd = r.vel.dot(forward);
      const side = r.vel.clone().addScaledVector(forward, -fwd);
      r.vel.addScaledVector(side, -Math.min(1, GRIP * dt));
      r.vel.multiplyScalar(Math.exp(-DRAG * dt));
    }

    // Rocket-vs-rocket: bounce, with the faster (or boosting) one hitting harder.
    const live = this.alive;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = this.rockets.get(live[i])!;
        const b = this.rockets.get(live[j])!;
        const n = b.mesh.position.clone().sub(a.mesh.position).setY(0);
        const d = n.length();
        if (d === 0 || d > HIT * 2) continue;
        n.divideScalar(d);
        const overlap = HIT * 2 - d;
        a.mesh.position.addScaledVector(n, -overlap / 2);
        b.mesh.position.addScaledVector(n, overlap / 2);
        const rel = a.vel.clone().sub(b.vel).dot(n);
        if (rel > 0) {
          const impulse = rel * 1.2 + 2;
          const aHits = a.vel.dot(n) * (a.boost > 0 ? 1.6 : 1);
          const bHits = -b.vel.dot(n) * (b.boost > 0 ? 1.6 : 1);
          // The harder hitter keeps more of its line.
          const share = THREE.MathUtils.clamp(0.5 + (aHits - bHits) * 0.06, 0.2, 0.8);
          a.vel.addScaledVector(n, -impulse * (1 - share) * 2);
          b.vel.addScaledVector(n, impulse * share * 2);
          this.game.audio.play('jump');
        }
      }
    }

    for (const p of this.players) {
      const r = this.rockets.get(p)!;
      const m = r.mesh;
      if (p.alive) {
        m.position.addScaledVector(r.vel, dt);
        if (Math.hypot(m.position.x, m.position.z) > this.radius + 0.3) {
          knockOut(p, r.vel.clone().multiplyScalar(0.6));
          r.vel.y = 2;
          this.game.audio.play('back');
        }
        m.rotation.set(0, r.heading, 0);
        // Lean into turns.
        const side = new THREE.Vector3(Math.cos(r.heading), 0, -Math.sin(r.heading));
        m.rotateZ(THREE.MathUtils.clamp(r.vel.dot(side) * 0.08, -0.4, 0.4));
        p.character.position.set(m.position.x, RIDE_Y + 0.25, m.position.z);
        p.character.rotation.y = r.heading;
        p.character.pose = 'idle';
      } else {
        r.vel.y -= 25 * dt;
        m.position.addScaledVector(r.vel, dt);
        m.rotation.x += dt * 3;
        fall(p, dt);
      }
    }

    if (this.alive.length <= 1) this.finish(this.alive);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) {
      const r = this.rockets.get(p)!;
      const size = (r.boost > 0 ? 1.8 : 1) * (0.85 + Math.sin(this.t * 40 + p.seat) * 0.15);
      r.flame.scale.set(1, size, 1);
      r.flame.position.z = -0.9 - size * 0.5;
      r.flame.visible = p.alive;
      if (p.alive) r.mesh.position.y = RIDE_Y + Math.sin(this.t * 6 + p.seat) * 0.06;
    }
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const rocketRodeo: MinigameDef = {
  id: 'rocketrodeo',
  name: 'Rocket Rodeo',
  kind: 'ffa',
  duel: true,
  song: rocketTheme,
  rules: 'Your rocket never stops and turns wide! Ram rivals off the floating arena (A for a burst) before it shrinks. Last rider left wins!',
  controls: 'Stick: steer · A: burst',
  create: () => new RocketRodeo(),
};
