import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, scorePanel, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Half the plank's length and width. */
const HALF = 8;
const HALF_W = 2;
/** Height of the plank's top surface at the pivot. */
const TOP = 3.2;
const MAX_TILT = 0.38;
/** Plank response to where everyone stands. */
const TORQUE = 0.2;
const DAMP = 1.3;
const RESTORE = 0.5;
/** Downhill pull and how quickly feet grip the slippery planks. */
const SLIDE = 30;
const GRIP = 3;
const RUN = 5;
const JUMP = 7.5;
const GRAVITY = 24;
/** Spin a landing stomp adds, scaled by how far out you land. */
const STOMP = 0.55;
const DASH = 9;
const DASH_TIME = 0.25;
const DASH_COOLDOWN = 1;
const KNOCK = 8;
const RADIUS = 0.45;
const TEAM_COLORS = [Palette.coral, Palette.violet];

interface Rider {
  /** Position along the plank (+ is the right end) and across it. */
  s: number;
  z: number;
  vs: number;
  vz: number;
  /** Height above the plank, and vertical speed while airborne. */
  h: number;
  vy: number;
  dash: number;
  dashCooldown: number;
  dashDir: THREE.Vector2;
}

const rider = (p: MinigamePlayer): Rider => p.data.rider as Rider;

/**
 * 2 vs 2 on a giant seesaw over a pond. Wherever people stand, the plank
 * tips, and everyone slides toward the low end. Stomp to tip it your way,
 * shove rivals, and keep your footing: the last team on board wins.
 */
class SeesawScramble extends Minigame {
  readonly timeLimit = 40;
  /** Tilt: positive means the right (+X) end is down. */
  private tilt = 0;
  private spin = 0;
  private plank = new THREE.Group();
  private board!: HTMLDivElement;
  private splashes: { mesh: THREE.Mesh; life: number }[] = [];

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xfde4f2], Palette.water, -0.6);
    // Plank: alternating boards with striped danger ends.
    const boards = 5;
    for (let i = 0; i < boards; i++) {
      const w = (HALF_W * 2) / boards;
      const strip = toonMesh(new THREE.BoxGeometry(HALF * 2, 0.4, w * 0.96), i % 2 ? 0xe2b07a : 0xd29b62, { outline: 0.03 });
      strip.position.set(0, -0.2, -HALF_W + w * (i + 0.5));
      this.plank.add(strip);
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.35, HALF_W * 2), new THREE.MeshBasicMaterial({ color: k % 2 ? Palette.cream : Palette.coral }));
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(side * (HALF - 0.2 - k * 0.38), 0.005, 0);
        this.plank.add(stripe);
      }
      // Handlebar posts at each end, just for looks.
      const post = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8), Palette.ink, { outline: false });
      post.position.set(side * (HALF - 1.4), 0.45, -HALF_W + 0.15);
      const bar = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), Palette.yellow, { outline: 0.02 });
      bar.rotation.z = Math.PI / 2;
      bar.position.set(side * (HALF - 1.4), 0.9, -HALF_W + 0.15);
      this.plank.add(post, bar);
    }
    this.plank.position.y = TOP;
    this.scene.add(this.plank);

    const fulcrum = toonMesh(new THREE.CylinderGeometry(1.8, 1.8, 3.2, 3), Palette.yellow, { outline: 0.05 });
    fulcrum.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    fulcrum.scale.set(1, 1, 0.8);
    fulcrum.position.y = TOP - 1.95;
    this.scene.add(fulcrum);
    const axle = toonMesh(new THREE.CylinderGeometry(0.3, 0.3, HALF_W * 2 + 0.6, 12), Palette.ink, { outline: 0.02 });
    axle.rotation.x = Math.PI / 2;
    axle.position.y = TOP - 0.45;
    this.scene.add(axle);
    // Lily pads and a far shore.
    const padGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.06, 14);
    for (let i = 0; i < 8; i++) {
      const pad = toonMesh(padGeo, Palette.grassDark, { outline: 0.02 });
      const a = i * 0.8 + 0.3;
      pad.position.set(Math.cos(a) * (10 + (i % 3) * 2), -0.55, Math.sin(a) * 6 - 2);
      this.scene.add(pad);
    }
    const shore = toonMesh(new THREE.BoxGeometry(80, 2, 10), Palette.grass, { outline: 0.05 });
    shore.position.set(0, -0.2, -18);
    this.scene.add(shore);

    for (const team of [0, 1]) {
      const side = team === 0 ? -1 : 1;
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          p.data.rider = { s: side * (2.5 + i * 2.5), z: (i - 0.5) * 1.2, vs: 0, vz: 0, h: 0, vy: 0, dash: 0, dashCooldown: 0.5, dashDir: new THREE.Vector2() } satisfies Rider;
          p.data.role = i;
          p.character.rotation.y = -side * Math.PI / 2;
        });
    }
    this.placeAll();

    this.camera.position.set(0, 10, 17);
    this.camera.lookAt(0, 2.4, 0);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private placeAll(): void {
    this.plank.rotation.z = -this.tilt;
    const cos = Math.cos(this.tilt);
    const sin = Math.sin(this.tilt);
    for (const p of this.players) {
      if (!p.alive) continue;
      const r = rider(p);
      p.character.position.set(r.s * cos, TOP - r.s * sin + r.h, r.z);
    }
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1]
      .map((t) => {
        const team = this.players.filter((p) => p.team === t);
        return `<span style="color:${css(TEAM_COLORS[t])}">${team.map((p) => (p.alive ? '●' : '○')).join('')}</span>`;
      })
      .join('<span>vs</span>');
  }

  /** CPU: stand between the middle and the rivals, run uphill when slipping, stomp and shove when it pays. */
  private cpu(p: MinigamePlayer, dt: number): { move: THREE.Vector2; jump: boolean; dash: boolean } {
    const r = rider(p);
    const rng = this.game.rng;
    const enemies = this.alive.filter((o) => o.team !== p.team);
    const move = new THREE.Vector2();
    if (!enemies.length) return { move, jump: false, dash: false };
    const em = enemies.reduce((n, e) => n + rider(e).s, 0) / enemies.length;
    const downhill = Math.sign(this.tilt);
    // Teammates stagger, mirrored per team so neither side gets the better spot.
    const homeSide = p.team === 0 ? -1 : 1;
    let target = THREE.MathUtils.clamp(em * 0.45, -3.5, 3.5) + homeSide * ((p.data.role as number) - 0.5) * 0.8;
    // Slipping toward the low end: scramble uphill.
    if (downhill !== 0 && Math.sign(r.s) === downhill && Math.abs(this.tilt) > 0.12 && Math.abs(r.s) > 2.5) target = -downhill * 1.5;
    move.x = THREE.MathUtils.clamp((target - r.s) * 1.2, -1, 1);
    move.y = THREE.MathUtils.clamp((((p.data.role as number) - 0.5) * 0.6 - r.z) * 1.5, -1, 1);

    let dash = false;
    const near = enemies.find((e) => Math.hypot(rider(e).s - r.s, rider(e).z - r.z) < 1.7);
    if (near && r.dashCooldown <= 0) {
      const e = rider(near);
      // Worth a shove when they're nearer an edge than we are.
      const edgeward = Math.abs(e.s) > Math.abs(r.s) || Math.abs(e.z) > HALF_W * 0.5;
      if (edgeward && rng.next() < dt * 4) {
        move.set(e.s - r.s, e.z - r.z).normalize();
        dash = true;
      }
    }
    const sameSide = Math.sign(r.s) === Math.sign(em) && Math.abs(em) > Math.abs(r.s) + 1 && Math.abs(r.s) > 0.8;
    const jump = r.h <= 0 && sameSide && rng.next() < dt * 1.3;
    return { move, jump, dash };
  }

  play(dt: number): void {
    const sin = Math.sin(this.tilt);
    for (const p of this.players) {
      if (!p.alive) {
        fall(p, dt, -3);
        continue;
      }
      const r = rider(p);
      r.dashCooldown -= dt;
      r.dash -= dt;
      let move: THREE.Vector2;
      let jump: boolean;
      let dash: boolean;
      if (p.controller) {
        const s = stick(p);
        move = new THREE.Vector2(s.x, s.z);
        jump = p.controller.pressed('a');
        dash = p.controller.pressed('b');
      } else {
        ({ move, jump, dash } = this.cpu(p, dt));
      }
      if (move.lengthSq() > 1) move.normalize();
      const grounded = r.h <= 0;

      if (dash && r.dashCooldown <= 0) {
        const dir = move.lengthSq() > 0.01 ? move.clone().normalize() : new THREE.Vector2(Math.sin(p.character.rotation.y), Math.cos(p.character.rotation.y));
        r.vs = dir.x * DASH;
        r.vz = dir.y * DASH;
        r.dash = DASH_TIME;
        r.dashDir.copy(dir);
        r.dashCooldown = DASH_COOLDOWN;
        this.game.audio.play('select');
      }
      if (grounded) {
        if (jump) {
          r.vy = JUMP;
          r.h = 0.001;
          this.game.audio.play('jump');
        }
        if (r.dash <= 0) {
          const k = Math.min(1, GRIP * dt);
          r.vs += (move.x * RUN - r.vs) * k;
          r.vz += (move.y * RUN - r.vz) * k;
        }
        r.vs += SLIDE * sin * dt;
      }
      if (r.h > 0) {
        r.vy -= GRAVITY * dt;
        r.h += r.vy * dt;
        if (r.h <= 0) {
          r.h = 0;
          // Stomp: the plank dips under the landing.
          if (Math.abs(r.s) <= HALF && Math.abs(r.z) <= HALF_W) {
            this.spin += (STOMP * r.s) / HALF;
            this.game.audio.play('boom');
          }
        }
      }
      r.s += r.vs * dt;
      r.z += r.vz * dt;

      face(p, new THREE.Vector3(r.vs, 0, r.vz), dt);
      if (r.h > 0) p.character.pose = 'jump';
      else moveAnim(p, Math.hypot(r.vs, r.vz) / RUN);
      const slipping = Math.sign(r.s) === Math.sign(this.tilt) && Math.abs(this.tilt) > 0.2;
      p.character.setExpression(slipping ? 'surprised' : 'determined');

      if (r.h <= 0 && (Math.abs(r.s) > HALF || Math.abs(r.z) > HALF_W)) {
        const push = new THREE.Vector3(r.vs, 0, r.vz).multiplyScalar(0.4);
        knockOut(p, push);
        this.splashes.push({ mesh: this.splash(p.character.position.x, p.character.position.z), life: 0.9 });
        this.game.audio.play('pop');
        this.renderScore();
      }
    }
    this.collide();

    // Plank physics: everyone standing on it weighs down their side.
    let load = 0;
    for (const p of this.alive) if (rider(p).h <= 0) load += rider(p).s;
    this.spin += (TORQUE * load - DAMP * this.spin - RESTORE * this.tilt) * dt;
    this.tilt += this.spin * dt;
    if (Math.abs(this.tilt) > MAX_TILT) {
      this.tilt = Math.sign(this.tilt) * MAX_TILT;
      this.spin = 0;
    }
    this.placeAll();

    for (const team of [0, 1]) {
      if (!this.players.some((p) => p.team === team && p.alive)) {
        const winTeam = 1 - team;
        const winners = this.players.filter((p) => p.team === winTeam);
        for (const p of winners) if (p.alive) p.character.pose = 'cheer';
        this.finish(winners.some((p) => p.alive) ? winners : []);
        return;
      }
    }
  }

  /** Bodies bump apart; a dashing body sends the other flying. */
  private collide(): void {
    const live = this.alive;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = rider(live[i]);
        const b = rider(live[j]);
        if (Math.abs(a.h - b.h) > 0.8) continue;
        const ds = b.s - a.s;
        const dz = b.z - a.z;
        const d = Math.hypot(ds, dz);
        if (d === 0 || d > RADIUS * 2) continue;
        const nx = ds / d;
        const nz = dz / d;
        const overlap = (RADIUS * 2 - d) / 2;
        a.s -= nx * overlap;
        a.z -= nz * overlap;
        b.s += nx * overlap;
        b.z += nz * overlap;
        const shove = (from: Rider, to: Rider, toP: MinigamePlayer) => {
          to.vs = from.dashDir.x * KNOCK;
          to.vz = from.dashDir.y * KNOCK;
          from.vs *= 0.2;
          from.vz *= 0.2;
          from.dash = 0;
          toP.character.setExpression('surprised');
          this.game.audio.play('jump');
        };
        if (a.dash > 0 && b.dash <= 0) shove(a, b, live[j]);
        else if (b.dash > 0 && a.dash <= 0) shove(b, a, live[i]);
      }
    }
  }

  private splash(x: number, z: number): THREE.Mesh {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.6, 20), new THREE.MeshBasicMaterial({ color: Palette.cream, transparent: true }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, -0.5, z);
    this.scene.add(ring);
    return ring;
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const s of [...this.splashes]) {
      s.life -= dt;
      s.mesh.scale.multiplyScalar(1 + dt * 3);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.splashes.splice(this.splashes.indexOf(s), 1);
      }
    }
  }

  timeout(): number[] {
    const left = [0, 1].map((t) => this.players.filter((p) => p.team === t && p.alive).length);
    if (left[0] === left[1]) return [];
    const team = left[0] > left[1] ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

/** Seesaw Scramble: a bouncy, lopsided 6/8 romp in Bb with a bell lead. */
const seesawTheme: Song = {
  name: 'Seesaw Scramble',
  bpm: 108,
  stepsPerBeat: 3,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.22,
      pattern: [
        'F5 . D5 Bb4 . D5 F5 . G5 F5 . D5',
        'Eb5 . C5 A4 . C5 Eb5 . F5 Eb5 . C5',
        'D5 . F5 Bb5 . A5 G5 . F5 Eb5 . G5',
        'F5 . Eb5 D5 . C5 Bb4 - - . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'Bb1 . . F2 . . Bb1 . . F2 . .',
        'F1 . . C2 . . F1 . . C2 . .',
        'G1 . . D2 . . Eb2 . . Bb2 . .',
        'F1 . . C2 . . Bb1 . F2 Bb1 . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.13,
      pattern: [
        '. D4 F4 . D4 F4 . D4 F4 . D4 F4',
        '. C4 Eb4 . C4 Eb4 . C4 Eb4 . A3 C4',
        '. D4 G4 . D4 G4 . Eb4 G4 . Eb4 G4',
        '. C4 Eb4 . C4 A3 . D4 F4 . D4 F4',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.55, pattern: Array(4).fill('x . . . . . x . . . . .').join(' ') },
    { instrument: 'hat', volume: 0.08, pattern: Array(4).fill('. . x . x x . . x . x x').join(' ') },
  ],
};

export const seesawScramble: MinigameDef = {
  id: 'seesawscramble',
  name: 'Seesaw Scramble',
  kind: '2v2',
  song: seesawTheme,
  rules: 'The giant seesaw tips toward wherever people stand, and everyone slides downhill. Stomp to tip it, shove rivals, and be the last team on board!',
  controls: 'Stick: run · A: jump & stomp · B: shove',
  create: () => new SeesawScramble(),
};
