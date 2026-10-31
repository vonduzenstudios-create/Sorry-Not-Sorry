import * as THREE from 'three';
import { lavaTheme } from '../audio/songs/rocketLavaThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { addLights, skyDome } from '../render/environment';
import { face, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const LEVELS = 44;
const STEP = 1.15;
const PER_LEVEL = 3;
const FLOOR = 6;
const SPEED = 4.6;
const JUMP_V = 9.2;
const GRAVITY = 24;
const BODY = 0.4;

interface Ledge {
  x: number;
  z: number;
  y: number;
  r: number;
  level: number;
  mesh: THREE.Mesh;
}

/**
 * Lava floods a volcano shaft. Hop up the stone ledges (A to jump) faster
 * than it rises, and shove rivals off on the way. Touch the lava and you're out.
 */
class LavaRise extends Minigame {
  readonly timeLimit = 50;
  private ledges: Ledge[] = [];
  private lava!: THREE.Mesh;
  private lavaY = -1.2;
  private clock = 0;
  private camY = 0;
  private bubbles: THREE.Mesh[] = [];

  protected setup(): void {
    this.scene.add(skyDome(0x3b2450, 0xff9a6a));
    addLights(this.scene);
    const glow = new THREE.PointLight(0xff8040, 30, 18, 1.5);
    glow.name = 'glow';
    this.scene.add(glow);

    const rock = [Palette.lavender, Palette.peach, Palette.rose];
    const floor = toonMesh(new THREE.CylinderGeometry(FLOOR, FLOOR, 0.5, 40), 0x9a86c8, { outline: 0.06 });
    floor.position.y = -0.25;
    this.scene.add(floor);
    this.ledges.push({ x: 0, z: 0, y: 0, r: FLOOR, level: 0, mesh: floor });

    // Three ledges per level, rotating around the shaft so every level has
    // a reachable ledge next to one on the level below.
    const rng = this.game.rng;
    for (let level = 1; level <= LEVELS; level++) {
      for (let k = 0; k < PER_LEVEL; k++) {
        const a = (k / PER_LEVEL) * Math.PI * 2 + level * 0.55 + rng.range(-0.15, 0.15);
        const dist = rng.range(2.4, 4.2);
        const r = Math.max(0.9, rng.range(1.15, 1.6) - level * 0.008);
        const mesh = toonMesh(new THREE.CylinderGeometry(r, r * 0.8, 0.4, 14), rock[(level + k) % 3], { outline: 0.04 });
        const y = level * STEP;
        mesh.position.set(Math.cos(a) * dist, y - 0.2, Math.sin(a) * dist);
        this.scene.add(mesh);
        this.ledges.push({ x: mesh.position.x, z: mesh.position.z, y, r, level, mesh });
      }
    }
    // Craggy shaft wall behind the ledges for a sense of height.
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (i / 25 - 0.5) * Math.PI * 0.75;
      const crag = toonMesh(new THREE.DodecahedronGeometry(1.8 + (i % 3) * 0.4, 0), i % 2 ? 0x6e5a99 : 0x7d68aa, { outline: 0.05 });
      for (let h = 0; h < 6; h++) {
        const c = h === 0 ? crag : crag.clone();
        c.position.set(Math.cos(a) * 11, h * 9 + (i % 4) * 2, Math.sin(a) * 9 - 2);
        c.rotation.set(i, h, i * h);
        this.scene.add(c);
      }
    }

    this.lava = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 40, 40), new THREE.MeshBasicMaterial({ color: 0xff6a3a }));
    this.scene.add(this.lava);
    const crust = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    crust.rotation.x = -Math.PI / 2;
    crust.position.y = 20.01;
    this.lava.add(crust);
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3 + (i % 3) * 0.15, 10, 6), new THREE.MeshBasicMaterial({ color: Palette.butter }));
      this.bubbles.push(b);
      this.lava.add(b);
    }

    ring(this.players, 3.2);
    for (const p of this.players) {
      p.data.vy = 0;
      p.data.on = this.ledges[0];
      p.data.speed = 0.85 + ((p.seat * 37) % 10) / 100;
    }
    this.placeLava();
    this.placeCamera(1);
  }

  /** Lava speeds up as time goes on. */
  private lavaSpeed(): number {
    return Math.min(1.1, 0.35 + this.clock * 0.028);
  }

  private placeLava(): void {
    this.lava.position.y = this.lavaY - 20;
    const glow = this.scene.getObjectByName('glow')!;
    glow.position.set(0, this.lavaY + 1.5, 2);
  }

  private placeCamera(blend: number): void {
    const live = this.alive;
    const top = live.length ? Math.max(...live.map((p) => p.character.position.y)) : this.lavaY;
    const want = Math.max(this.lavaY + 3.5, (top + this.lavaY) / 2 + 1.5);
    this.camY += (want - this.camY) * blend;
    this.camera.position.set(0, this.camY + 9, 17);
    this.camera.lookAt(0, this.camY + 0.5, 0);
  }

  /** The ledge whose top a body at `pos` (feet) stands on, if any. */
  private ledgeUnder(pos: THREE.Vector3, prevY: number): Ledge | null {
    let found: Ledge | null = null;
    for (const l of this.ledges) {
      if (prevY < l.y - 0.01 || pos.y > l.y) continue;
      if (Math.hypot(pos.x - l.x, pos.z - l.z) > l.r + 0.1) continue;
      if (!found || l.y > found.y) found = l;
    }
    return found;
  }

  /** CPU: pick a ledge a level or two up, walk to its edge, jump on. */
  private cpu(p: MinigamePlayer): { move: THREE.Vector3; jump: boolean } {
    const c = p.character.position;
    const on = p.data.on as Ledge | null;
    let goal = p.data.goal as Ledge | undefined;
    if (on && (!goal || goal.y <= on.y || goal.y - on.y > STEP * 1.5)) {
      // Rest a beat on each ledge when the lava's far below.
      const calm = c.y - this.lavaY > 6;
      p.data.wait = calm ? this.game.rng.range(0.1, 0.6) : this.game.rng.range(0, 0.15);
      let best: Ledge | undefined;
      let bestScore = Infinity;
      for (const l of this.ledges) {
        const up = l.y - on.y;
        if (up < STEP * 0.5 || up > STEP * 1.5) continue;
        const gap = Math.hypot(l.x - c.x, l.z - c.z) - l.r;
        const crowd = this.alive.filter((o) => o !== p && o.data.goal === l).length;
        const score = gap + crowd * 1.2 + this.game.rng.next() * 0.6;
        if (score < bestScore) {
          bestScore = score;
          best = l;
        }
      }
      goal = best;
      p.data.goal = goal;
    }
    if (!goal) return { move: new THREE.Vector3(-c.x, 0, -c.z).multiplyScalar(0.1), jump: false };
    const to = new THREE.Vector3(goal.x - c.x, 0, goal.z - c.z);
    const dist = to.length();
    if (on && (p.data.wait as number) > 0) return { move: new THREE.Vector3(), jump: false };
    const move = dist > 0.2 ? to.normalize().multiplyScalar(p.data.speed as number) : new THREE.Vector3();
    // Stay on the current ledge until close enough to make the hop.
    const jump = !!on && dist < goal.r + 2.1;
    if (on && !jump) {
      const next = c.clone().addScaledVector(move, SPEED * 0.15);
      if (Math.hypot(next.x - on.x, next.z - on.z) > on.r - 0.2) move.set(0, 0, 0);
    }
    return { move, jump };
  }

  play(dt: number): void {
    this.clock += dt;
    this.lavaY += this.lavaSpeed() * dt;
    this.placeLava();
    const before = this.alive;

    for (const p of this.alive) {
      const c = p.character;
      let move: THREE.Vector3;
      let jump: boolean;
      if (p.controller) {
        move = stick(p);
        jump = p.controller.pressed('a');
      } else {
        p.data.wait = Math.max(0, ((p.data.wait as number | undefined) ?? 0) - dt);
        ({ move, jump } = this.cpu(p));
      }
      const on = p.data.on as Ledge | null;
      if (jump && on) {
        p.data.vy = JUMP_V;
        p.data.on = null;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      c.position.addScaledVector(move, SPEED * dt);
      face(p, move, dt);
      if (p.data.on) moveAnim(p, move.length());
    }
    separate(this.alive, BODY);

    for (const p of this.alive) {
      const c = p.character;
      const on = p.data.on as Ledge | null;
      // Walked (or got shoved) off the ledge.
      if (on && Math.hypot(c.position.x - on.x, c.position.z - on.z) > on.r + 0.1) p.data.on = null;
      if (!p.data.on) {
        const prevY = c.position.y;
        p.data.vy = (p.data.vy as number) - GRAVITY * dt;
        c.position.y += (p.data.vy as number) * dt;
        if ((p.data.vy as number) <= 0) {
          const l = this.ledgeUnder(c.position, prevY);
          if (l) {
            c.position.y = l.y;
            p.data.vy = 0;
            p.data.on = l;
            c.land();
            c.pose = 'idle';
          }
        }
      }
      if (c.position.y < this.lavaY + 0.1) {
        knockOut(p, new THREE.Vector3(0, 8, 0));
        c.setExpression('surprised');
        this.game.audio.play('boom');
      }
    }

    // Everyone left went in on the same frame: they share the win.
    if (this.alive.length === 0) this.finish(before);
    else if (this.alive.length === 1 && this.players.length > 1) this.finish(this.alive);
  }

  animate(dt: number): void {
    super.animate(dt);
    this.placeCamera(Math.min(1, dt * 3));
    this.bubbles.forEach((b, i) => {
      const phase = (this.t * (0.6 + (i % 4) * 0.15) + i * 0.37) % 1;
      const a = i * 2.1;
      const r = 2 + (i % 5) * 2;
      b.position.set(Math.cos(a) * r, 20 + Math.sin(phase * Math.PI) * 0.4 - 0.2, Math.sin(a) * r);
      b.scale.setScalar(Math.sin(phase * Math.PI) + 0.01);
    });
    for (const p of this.players) {
      if (p.alive) continue;
      // Scorched: pop up, then sink out of sight.
      const f = p.data.fall as { vel: THREE.Vector3 } | undefined;
      if (!f) continue;
      f.vel.y -= 18 * dt;
      p.character.position.addScaledVector(f.vel, dt);
      p.character.rotation.x += dt * 5;
      if (p.character.position.y < this.lavaY - 2) p.character.visible = false;
    }
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const lavaRise: MinigameDef = {
  id: 'lavarise',
  name: 'Lava Rise',
  kind: 'ffa',
  duel: true,
  song: lavaTheme,
  rules: 'The lava is rising! Jump up the ledges with A and shove rivals off. Touch the lava and you are out. Last one above it wins!',
  controls: 'Stick: move · A: jump',
  create: () => new LavaRise(),
};
