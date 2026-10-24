import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, ring, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 8;
const BALL = 0.9;
const ACCEL = 14;
const DRAG = 0.6;

interface Ball {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
}

/** Ride a giant ball and bump everyone else off the platform. */
class BumperBrawl extends Minigame {
  readonly timeLimit = 45;
  private balls = new Map<MinigamePlayer, Ball>();

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xffe1f0], 0x7cc8ec);
    const top = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.6, 64), Palette.mint, { outline: 0.08 });
    top.position.y = -0.3;
    const rim = toonMesh(new THREE.TorusGeometry(RADIUS, 0.18, 10, 64), Palette.cream, { outline: 0.04 });
    rim.rotation.x = Math.PI / 2;
    const base = toonMesh(new THREE.CylinderGeometry(RADIUS * 0.95, 2, 6, 64), Palette.lavender, { outline: 0.08 });
    base.position.y = -3.6;
    this.scene.add(top, rim, base);
    // Concentric stripes help judge distance to the edge.
    for (const r of [3, 5.5]) {
      const stripe = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r + 0.15, 64), new THREE.MeshBasicMaterial({ color: Palette.cream }));
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.y = 0.01;
      this.scene.add(stripe);
    }

    ring(this.players, 5);
    for (const p of this.players) {
      const mesh = toonMesh(new THREE.SphereGeometry(BALL, 32, 20), p.character.def.colors.accent, { outline: 0.04 });
      mesh.position.copy(p.character.position).setY(BALL);
      this.scene.add(mesh);
      this.balls.set(p, { mesh, vel: new THREE.Vector3() });
      p.character.position.y = BALL * 2 - 0.15;
      p.character.scale.setScalar(0.8);
    }
    this.camera.position.set(0, 17, 15);
    this.camera.lookAt(0, 0, 0.5);
  }

  private intent(p: MinigamePlayer, ball: Ball): THREE.Vector3 {
    if (p.controller) return stick(p);
    const pos = ball.mesh.position;
    const flat = Math.hypot(pos.x, pos.z);
    // Near the edge: get back to the middle.
    if (flat > RADIUS - 2.2) return new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
    let target: THREE.Vector3 | null = null;
    let best = Infinity;
    for (const o of this.alive) {
      if (o === p) continue;
      const d = this.balls.get(o)!.mesh.position.distanceTo(pos);
      if (d < best) {
        best = d;
        target = this.balls.get(o)!.mesh.position;
      }
    }
    if (!target) return new THREE.Vector3();
    // Wobble so CPUs don't all beeline identically.
    const dir = target.clone().sub(pos).setY(0).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.t * 2 + p.seat) * 0.5);
    return dir.multiplyScalar(0.85);
  }

  play(dt: number): void {
    for (const p of this.alive) {
      const ball = this.balls.get(p)!;
      const dir = this.intent(p, ball);
      ball.vel.addScaledVector(dir, ACCEL * dt);
      ball.vel.multiplyScalar(Math.exp(-DRAG * dt));
    }

    // Ball-vs-ball bounces with a little extra kick so hits feel punchy.
    const live = this.alive;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = this.balls.get(live[i])!;
        const b = this.balls.get(live[j])!;
        const n = b.mesh.position.clone().sub(a.mesh.position).setY(0);
        const d = n.length();
        if (d === 0 || d > BALL * 2) continue;
        n.divideScalar(d);
        const overlap = BALL * 2 - d;
        a.mesh.position.addScaledVector(n, -overlap / 2);
        b.mesh.position.addScaledVector(n, overlap / 2);
        const rel = a.vel.clone().sub(b.vel).dot(n);
        if (rel > 0) {
          const impulse = rel * 1.35 + 1.5;
          a.vel.addScaledVector(n, -impulse);
          b.vel.addScaledVector(n, impulse);
          this.game.audio.play('jump');
        }
      }
    }

    for (const p of this.players) {
      const ball = this.balls.get(p)!;
      if (p.alive) {
        ball.mesh.position.addScaledVector(ball.vel, dt);
        const pos = ball.mesh.position;
        if (Math.hypot(pos.x, pos.z) > RADIUS + 0.2) {
          knockOut(p, ball.vel.clone().multiplyScalar(0.5));
          ball.vel.y = 0;
          this.game.audio.play('back');
        }
        // Roll the ball and keep the rider on top, facing travel.
        const axis = new THREE.Vector3(ball.vel.z, 0, -ball.vel.x);
        const speed = axis.length();
        if (speed > 0.001) ball.mesh.rotateOnWorldAxis(axis.normalize(), (speed * dt) / BALL);
        p.character.position.set(pos.x, BALL * 2 - 0.15, pos.z);
        face(p, ball.vel, dt);
        p.character.pose = 'idle';
      } else {
        // Ball drops with its rider.
        ball.vel.y -= 25 * dt;
        ball.mesh.position.addScaledVector(ball.vel, dt);
        fall(p, dt);
      }
    }

    if (this.alive.length <= 1) this.finish(this.alive);
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const bumperBrawl: MinigameDef = {
  id: 'bumper',
  name: 'Bumper Brawl',
  kind: 'ffa',
  rules: 'Bump everyone off the platform. Last one riding wins!',
  controls: 'Stick: roll',
  create: () => new BumperBrawl(),
};
