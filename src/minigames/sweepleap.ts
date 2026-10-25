import * as THREE from 'three';
import { sweepTheme } from '../audio/songs/minigameThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 7;
const INNER = 1.4;
const SPEED = 4;
const JUMP_V = 8.5;
const GRAVITY = 26;
/** Feet above this clear the bar. */
const CLEAR = 0.6;
const BAR_Y = 0.35;
const SECOND_BAR_AT = 14;

interface Bar {
  pivot: THREE.Group;
  angle: number;
  /** Signed angular speed multiplier. */
  dir: number;
  on: boolean;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const TAU = Math.PI * 2;

/**
 * Spinning logs sweep the platform. Press A to hop over them; get clipped and
 * you're sent flying. They speed up, and a second one joins. Last one standing wins.
 */
class SweepLeap extends Minigame {
  readonly timeLimit = 45;
  private bars: Bar[] = [];
  private speed = 1.5;
  private clock = 0;

  protected setup(): void {
    arenaBasics(this.scene, [0x9fe0ff, 0xfff4c8], 0x6fc0e8, -14);
    const top = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.6, 48), Palette.grass, { outline: 0.08 });
    top.position.y = -0.3;
    const base = toonMesh(new THREE.ConeGeometry(RADIUS, 6, 48), 0xc9a27a, { outline: 0.08 });
    base.rotation.x = Math.PI;
    base.position.y = -3.6;
    this.scene.add(top, base);
    for (let i = 0; i < 10; i++) {
      const flower = toonMesh(new THREE.SphereGeometry(0.12, 8, 6), [Palette.rose, Palette.butter, Palette.cream][i % 3], { outline: false });
      const a = i * 2.4;
      const r = 2 + (i % 4) * 1.2;
      flower.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      this.scene.add(flower);
    }
    const post = toonMesh(new THREE.CylinderGeometry(0.6, 0.8, 1.6, 20), Palette.peach, { outline: 0.04 });
    post.position.y = 0.8;
    const cap = toonMesh(new THREE.SphereGeometry(0.62, 20, 12, 0, TAU, 0, Math.PI / 2), Palette.coral, { outline: 0.03 });
    cap.position.y = 1.6;
    this.scene.add(post, cap);

    for (let i = 0; i < 2; i++) {
      const pivot = new THREE.Group();
      const log = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, RADIUS - 0.4, 16), i ? 0xc97a5a : 0xa06a40, { outline: 0.04 });
      log.rotation.z = Math.PI / 2;
      log.position.set((RADIUS - 0.4) / 2 + 0.4, BAR_Y, 0);
      pivot.add(log);
      for (let k = 1; k < 5; k++) {
        const band = toonMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16), Palette.cream, { outline: false });
        band.rotation.z = Math.PI / 2;
        band.position.set(k * 1.4 + 0.4, BAR_Y, 0);
        pivot.add(band);
      }
      pivot.visible = i === 0;
      this.scene.add(pivot);
      // Start between the players, never on top of one.
      this.bars.push({ pivot, angle: Math.PI / 4 + i * Math.PI, dir: i ? -0.8 : 1, on: i === 0 });
    }

    ring(this.players, 4.2);
    for (const p of this.players) {
      p.data.vy = 0;
      p.data.react = 0.25;
    }
    this.camera.position.set(0, 15, 14);
    this.camera.lookAt(0, 0, 0.5);
  }

  /** Seconds until a bar sweeps into this spot (ignores bars that are off). */
  private eta(pos: THREE.Vector3): number {
    const phi = Math.atan2(pos.z, pos.x);
    const r = Math.max(INNER, Math.hypot(pos.x, pos.z));
    const w = Math.asin(Math.min(1, 0.5 / r));
    let best = Infinity;
    for (const b of this.bars) {
      if (!b.on) continue;
      const ahead = b.dir > 0 ? phi - w - b.angle : b.angle - (phi + w);
      const gap = ((ahead % TAU) + TAU) % TAU;
      best = Math.min(best, gap / (this.speed * Math.abs(b.dir)));
    }
    return best;
  }

  /** CPUs hop at a reaction time drawn per jump; now and then they mistime it. */
  private cpu(p: MinigamePlayer): { move: THREE.Vector3; jump: boolean } {
    const pos = p.character.position;
    const r = Math.hypot(pos.x, pos.z);
    const want = 4 + (p.seat % 2) * 0.6;
    const move = new THREE.Vector3(pos.x, 0, pos.z).normalize().multiplyScalar(THREE.MathUtils.clamp((want - r) * 0.4, -0.5, 0.5));
    const jump = (p.data.vy as number) === 0 && pos.y === 0 && this.eta(pos) < (p.data.react as number);
    if (jump) {
      const rng = this.game.rng;
      const flub = rng.next() < 0.04 + this.clock * 0.004;
      p.data.react = flub ? (rng.next() < 0.5 ? 0.02 : 0.75) : 0.1 + rng.next() * 0.2;
    }
    return { move, jump };
  }

  play(dt: number): void {
    this.clock += dt;
    this.speed = 1.5 + this.clock * 0.07;
    const prev = this.bars.map((b) => b.angle);
    for (const b of this.bars) {
      if (!b.on && this.clock >= SECOND_BAR_AT && b.dir < 0) {
        b.on = true;
        b.pivot.visible = true;
        this.game.audio.play('boom');
      }
      if (b.on) b.angle = wrap(b.angle + this.speed * b.dir * dt);
      b.pivot.rotation.y = -b.angle;
    }

    for (const p of this.alive) {
      const c = p.character;
      let move: THREE.Vector3;
      let jump: boolean;
      if (p.controller) {
        move = stick(p);
        jump = p.controller.pressed('a');
      } else {
        ({ move, jump } = this.cpu(p));
      }
      const grounded = c.position.y === 0;
      if (jump && grounded) {
        p.data.vy = JUMP_V;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      c.position.addScaledVector(move, SPEED * dt);
      const r = Math.hypot(c.position.x, c.position.z);
      if (r > RADIUS - 0.5) c.position.multiplyScalar((RADIUS - 0.5) / r);
      if (r < INNER) c.position.multiplyScalar(INNER / Math.max(0.01, r));
      face(p, move, dt);
      if (!grounded || (p.data.vy as number) > 0) {
        p.data.vy = (p.data.vy as number) - GRAVITY * dt;
        c.position.y += (p.data.vy as number) * dt;
        if (c.position.y <= 0) {
          c.position.y = 0;
          p.data.vy = 0;
          c.land();
        }
      } else moveAnim(p, move.length());
    }
    separate(this.alive, 0.45);

    // Did a log sweep through anyone with their feet down? Checked in substeps so fast logs can't skip over.
    for (const p of this.alive) {
      const c = p.character;
      if (c.position.y > CLEAR) continue;
      const phi = Math.atan2(c.position.z, c.position.x);
      const r = Math.hypot(c.position.x, c.position.z);
      const w = Math.asin(Math.min(1, 0.45 / r));
      this.bars.forEach((b, i) => {
        if (!b.on || !p.alive) return;
        const step = wrap(b.angle - prev[i]);
        for (let s = 1; s <= 4; s++) {
          if (Math.abs(wrap(phi - (prev[i] + (step * s) / 4))) < w) {
            const tangent = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(Math.sign(b.dir) * 9);
            knockOut(p, tangent.add(new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi)).multiplyScalar(3)));
            this.game.audio.play('boom');
            return;
          }
        }
      });
    }
    for (const p of this.alive) if (p.character.pose === 'jump' && p.character.position.y === 0) p.character.pose = 'idle';

    if (this.alive.length <= 1) this.finish(this.alive);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) if (!p.alive) fall(p, dt);
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const sweepLeap: MinigameDef = {
  id: 'sweepleap',
  name: 'Sweep Leap',
  kind: 'ffa',
  duel: true,
  song: sweepTheme,
  rules: 'Spinning logs sweep the platform! Jump over them with A. They speed up, and a second log joins in. Last one standing wins!',
  controls: 'Stick: move · A: jump',
  create: () => new SweepLeap(),
};
