import * as THREE from 'three';
import { beamHopTheme } from '../audio/songs/beamFuseThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 7.5;
const INNER = 1.5;
const SPEED = 4;
const DUCK_SPEED = 1.6;
const JUMP_V = 8.5;
const GRAVITY = 26;
/** Feet above this clear a low beam. */
const CLEAR = 0.6;
const LOW_Y = 0.35;
const HIGH_Y = 1.05;
/** Squashed below this height scale, a high beam passes overhead. */
const DUCKED = 0.7;
/** Seconds a beam blinks before it swaps height. */
const WARN = 1.1;
const LOW_COLOR = 0xff5f7a;
const HIGH_COLOR = 0x5fc8ff;
const TAU = Math.PI * 2;

interface Beam {
  pivot: THREE.Group;
  glow: THREE.MeshBasicMaterial;
  core: THREE.MeshBasicMaterial;
  angle: number;
  high: boolean;
  on: boolean;
  /** Game clock when it switches on. */
  onAt: number;
  /** Game clock of its next height swap. */
  flipAt: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Laser beams sweep around a lab platform, some at ankle height, some at head
 * height. Jump the low red ones with A, hold B to duck under the high blue
 * ones. Beams blink before they swap height. Last one standing wins.
 */
class BeamHop extends Minigame {
  readonly timeLimit = 50;
  private beams: Beam[] = [];
  private speed = 1.4;
  private clock = 0;

  protected setup(): void {
    arenaBasics(this.scene, [0x6d5fc0, 0x1f1d4a], 0x2a2560, -14);
    const top = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.6, 48), 0xdcd8f2, { outline: 0.08 });
    top.position.y = -0.3;
    const base = toonMesh(new THREE.CylinderGeometry(RADIUS * 0.9, RADIUS * 0.5, 4, 48), 0x8f88c2, { outline: 0.08 });
    base.position.y = -2.6;
    this.scene.add(top, base);
    // Floor rings and edge lights.
    for (const r of [3, 5.2]) {
      const band = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 64), new THREE.MeshBasicMaterial({ color: 0xb4acdf }));
      band.rotation.x = -Math.PI / 2;
      band.position.y = 0.01;
      this.scene.add(band);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? Palette.mint : Palette.butter }));
      lamp.position.set(Math.cos(a) * (RADIUS - 0.15), 0.05, Math.sin(a) * (RADIUS - 0.15));
      this.scene.add(lamp);
    }
    // The emitter in the middle.
    const post = toonMesh(new THREE.CylinderGeometry(0.9, 1.2, 1.8, 24), 0xb8c0d8, { outline: 0.04 });
    post.position.y = 0.9;
    const lens = toonMesh(new THREE.SphereGeometry(0.75, 20, 14), Palette.lavender, { outline: 0.03 });
    lens.position.y = 1.9;
    this.scene.add(post, lens);

    // Three spokes on one rotor, so beams never cross: one from the start, a high one soon after, a third later.
    const rng = this.game.rng;
    const specs = [
      { high: false, onAt: 0, angle: Math.PI / 4 },
      { high: true, onAt: 8, angle: Math.PI / 4 + TAU / 3 },
      { high: rng.next() < 0.5, onAt: 20, angle: Math.PI / 4 + (TAU * 2) / 3 },
    ];
    for (const s of specs) {
      const pivot = new THREE.Group();
      const len = RADIUS - INNER + 0.6;
      const glow = new THREE.MeshBasicMaterial({ color: s.high ? HIGH_COLOR : LOW_COLOR, transparent: true, opacity: 0.45, depthWrite: false });
      const core = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, len, 12), glow);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8), core);
      for (const m of [outer, inner]) {
        m.rotation.z = Math.PI / 2;
        m.position.x = INNER - 0.6 + len / 2;
        pivot.add(m);
      }
      pivot.position.y = s.high ? HIGH_Y : LOW_Y;
      pivot.visible = false;
      this.scene.add(pivot);
      this.beams.push({ pivot, glow, core, angle: s.angle, high: s.high, on: false, onAt: s.onAt, flipAt: 14 + rng.next() * 6 });
    }

    ring(this.players, 4.2);
    for (const p of this.players) {
      p.data.vy = 0;
      p.data.react = 0.25;
      p.data.duckUntil = 0;
    }
    this.camera.position.set(0, 15, 14);
    this.camera.lookAt(0, 0, 0.5);
  }

  /** Seconds until a beam sweeps into this spot. */
  private eta(b: Beam, pos: THREE.Vector3): number {
    const phi = Math.atan2(pos.z, pos.x);
    const r = Math.max(INNER, Math.hypot(pos.x, pos.z));
    const w = Math.asin(Math.min(1, 0.5 / r));
    const ahead = phi - w - b.angle;
    return (((ahead % TAU) + TAU) % TAU) / this.speed;
  }

  /** Whether a beam will be high when it gets here, counting a pending swap. */
  private highAt(b: Beam, eta: number): boolean {
    return this.clock + eta >= b.flipAt ? !b.high : b.high;
  }

  /** CPUs jump or duck at a reaction time drawn per dodge; now and then they flub it. */
  private cpu(p: MinigamePlayer): { move: THREE.Vector3; jump: boolean; duck: boolean } {
    const pos = p.character.position;
    const r = Math.hypot(pos.x, pos.z);
    const want = 4 + (p.seat % 2) * 0.8;
    const move = new THREE.Vector3(pos.x, 0, pos.z).normalize().multiplyScalar(THREE.MathUtils.clamp((want - r) * 0.4, -0.5, 0.5));
    let next: Beam | null = null;
    let soon = Infinity;
    for (const b of this.beams) {
      if (!b.on) continue;
      const e = this.eta(b, pos);
      if (e < soon) {
        soon = e;
        next = b;
      }
    }
    let jump = false;
    if (next && soon < (p.data.react as number) && pos.y === 0 && (p.data.duckUntil as number) <= this.clock) {
      const rng = this.game.rng;
      let high = this.highAt(next, soon);
      // A flub: misread the beam's height, or react far too early or late.
      const flub = rng.next() < 0.01 + this.clock * 0.001;
      if (flub && rng.next() < 0.3) high = !high;
      if (high) p.data.duckUntil = this.clock + soon + 0.3;
      else jump = true;
      p.data.react = flub ? (rng.next() < 0.5 ? 0.02 : 0.8) : 0.14 + rng.next() * 0.18;
    }
    return { move, jump, duck: (p.data.duckUntil as number) > this.clock };
  }

  play(dt: number): void {
    this.clock += dt;
    this.speed = Math.min(2.9, 1.4 + this.clock * 0.045);
    const prev = this.beams.map((b) => b.angle);
    for (const b of this.beams) {
      if (!b.on && this.clock >= b.onAt) {
        b.on = true;
        b.pivot.visible = true;
        this.game.audio.play('boom');
      }
      // Every spoke turns, lit or not, so the spacing stays even.
      b.angle = wrap(b.angle + this.speed * dt);
      if (!b.on) continue;
      if (this.clock >= b.flipAt) {
        b.high = !b.high;
        b.flipAt = this.clock + 4 + this.game.rng.next() * 4;
        this.game.audio.play('select');
      }
    }

    for (const p of this.alive) {
      const c = p.character;
      let move: THREE.Vector3;
      let jump: boolean;
      let duck: boolean;
      if (p.controller) {
        move = stick(p);
        jump = p.controller.pressed('a');
        duck = p.controller.down('b');
      } else {
        ({ move, jump, duck } = this.cpu(p));
      }
      const grounded = c.position.y === 0;
      duck = duck && grounded;
      if (jump && grounded && !duck) {
        p.data.vy = JUMP_V;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      const sy = c.scale.y + ((duck ? 0.5 : 1) - c.scale.y) * Math.min(1, dt * 20);
      c.scale.set(1 + (1 - sy) * 0.4, sy, 1 + (1 - sy) * 0.4);
      c.position.addScaledVector(move, (duck ? DUCK_SPEED : SPEED) * dt);
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
      } else moveAnim(p, duck ? move.length() * 0.4 : move.length());
    }
    separate(this.alive, 0.45);

    // Did a beam sweep through anyone at its height? Checked in substeps so fast beams can't skip over.
    for (const p of this.alive) {
      const c = p.character;
      const phi = Math.atan2(c.position.z, c.position.x);
      const r = Math.hypot(c.position.x, c.position.z);
      const w = Math.asin(Math.min(1, 0.45 / r));
      const ducked = c.position.y === 0 && c.scale.y < DUCKED;
      this.beams.forEach((b, i) => {
        if (!b.on || !p.alive) return;
        if (b.high ? ducked : c.position.y > CLEAR) return;
        const step = wrap(b.angle - prev[i]);
        for (let s = 1; s <= 4; s++) {
          if (Math.abs(wrap(phi - (prev[i] + (step * s) / 4))) < w) {
            const tangent = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(9);
            c.scale.set(1, 1, 1);
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
    for (const b of this.beams) {
      b.pivot.rotation.y = -b.angle;
      const y = b.high ? HIGH_Y : LOW_Y;
      b.pivot.position.y += (y - b.pivot.position.y) * Math.min(1, dt * 14);
      // Blink between both colors while a height swap is coming.
      const warn = b.on && b.flipAt - this.clock < WARN && Math.sin(this.t * 30) > 0;
      b.glow.color.setHex(b.high !== warn ? HIGH_COLOR : LOW_COLOR);
      b.glow.opacity = 0.55 + Math.sin(this.t * 14) * 0.08;
    }
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const beamHop: MinigameDef = {
  id: 'beamhop',
  name: 'Beam Hop',
  kind: 'ffa',
  duel: true,
  song: beamHopTheme,
  rules: 'Laser beams sweep the lab! Jump the low red beams with A and hold B to duck under the high blue ones. Beams blink before they swap height. Last one standing wins!',
  controls: 'Stick: move · A: jump · B (hold): duck',
  create: () => new BeamHop(),
};
