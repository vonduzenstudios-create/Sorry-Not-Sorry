import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Field half-extents: X across the screen, Z toward the camera. */
const HX = 6.5;
const HZ = 5;
const SPEED = 4.6;
const JUMP_V = 8.5;
const GRAVITY = 26;
/** Logs start this far outside the field so they can be seen coming. */
const ENTER = 4;
const BODY = 0.35;

type Axis = 'x' | 'z';

interface Log {
  group: THREE.Group;
  roller: THREE.Group;
  /** Direction of travel; the log spans the other axis. */
  axis: Axis;
  dir: number;
  pos: number;
  speed: number;
  /** Small logs can be hopped; big ones can't. */
  big: boolean;
  radius: number;
  /** Feet above this clear the log. */
  clear: number;
  /** Open stretch (in the spanning axis) a big log leaves, or null. */
  gap: [number, number] | null;
}

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Spike Roller: driving lumberjack stomp in A minor. */
export const spikeTheme: Song = {
  name: 'Spike Roller',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.14,
      pattern: [
        'A4 . . A4 C5 . A4 . E5 . D5 . C5 . B4 .',
        'A4 . . A4 C5 . E5 . G5 - F5 . E5 . D5 .',
        'F4 . . F4 A4 . F4 . C5 . B4 . A4 . G4 .',
        'E4 . G#4 . B4 . E5 . D5 . B4 . G#4 - - .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'A1 . A2 . A1 . A2 . A1 . A2 . G1 . G2 .',
        'A1 . A2 . A1 . A2 . C2 . C3 . D2 . D3 .',
        'F1 . F2 . F1 . F2 . F1 . F2 . G1 . G2 .',
        'E1 . E2 . E1 . E2 . E1 . E2 . G#1 . G#2 .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.1, pattern: repeat('. . E5 . . . E5 . . . E5 . . . E5 .', 2) + ' ' + repeat('. . C5 . . . C5 . . . B4 . . . B4 .', 2) },
    { instrument: 'kick', volume: 0.62, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.24, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.07, pattern: repeat('x x x x', 16) },
  ],
};

const spikeGeo = new THREE.ConeGeometry(0.11, 0.32, 6);

/**
 * Spiked logs roll across the field from every side. Hop the small ones,
 * find the gap in the big ones. They come faster and more at once.
 * Last one standing wins.
 */
class SpikeRoller extends Minigame {
  readonly timeLimit = 50;
  private logs: Log[] = [];
  private clock = 0;
  private nextWave = 1.2;
  private waves = 0;
  private spikeMat = new THREE.MeshToonMaterial({ color: 0xe8e8f0 });

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xffeccc], 0x7cc0a0, -10);
    const field = toonMesh(new THREE.BoxGeometry(HX * 2 + 0.4, 1, HZ * 2 + 0.4), Palette.grass, { outline: 0.06 });
    field.position.y = -0.5;
    this.scene.add(field);
    // Mown stripes so speed and position read at a glance.
    for (let i = 0; i < 7; i++) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, (HZ * 2) / 14), new THREE.MeshBasicMaterial({ color: Palette.grassDark }));
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.01, -HZ + ((i * 2 + 0.5) * HZ * 2) / 14);
      this.scene.add(stripe);
    }
    const cliff = toonMesh(new THREE.BoxGeometry(HX * 2 + 0.4, 8, HZ * 2 + 0.4), 0xc9a27a, { outline: 0.06 });
    cliff.position.y = -5;
    this.scene.add(cliff);
    // Ramps the logs roll in on, one per side.
    for (const [x, z, w, d] of [
      [0, -HZ - ENTER / 2 - 0.2, HX * 2 + 0.4, ENTER],
      [0, HZ + ENTER / 2 + 0.2, HX * 2 + 0.4, ENTER],
      [-HX - ENTER / 2 - 0.2, 0, ENTER, HZ * 2 + 0.4],
      [HX + ENTER / 2 + 0.2, 0, ENTER, HZ * 2 + 0.4],
    ]) {
      const ramp = toonMesh(new THREE.BoxGeometry(w, 0.4, d), 0xd9b48a, { outline: 0.04 });
      ramp.position.set(x, -0.2, z);
      this.scene.add(ramp);
    }
    for (let i = 0; i < 8; i++) {
      const tuft = toonMesh(new THREE.ConeGeometry(0.12, 0.3, 5), Palette.grassDark, { outline: false });
      tuft.position.set(-HX + 0.6 + ((i * 5.3) % (HX * 2 - 1.2)), 0.15, -HZ + 0.6 + ((i * 3.7) % (HZ * 2 - 1.2)));
      this.scene.add(tuft);
    }

    const n = this.players.length;
    this.players.forEach((p, i) => {
      p.character.position.set((i - (n - 1) / 2) * 2.4, 0, 0.5);
      p.character.rotation.y = 0;
      p.data.vy = 0;
      p.data.react = 0.2;
      p.data.home = new THREE.Vector3((i - (n - 1) / 2) * 2.4, 0, 0.5);
    });
    this.camera.position.set(0, 17, 15);
    this.camera.lookAt(0, 0, 0.8);
  }

  private buildLog(axis: Axis, big: boolean, gap: [number, number] | null): { group: THREE.Group; roller: THREE.Group } {
    const span = axis === 'z' ? HX : HZ;
    const radius = big ? 0.85 : 0.32;
    const group = new THREE.Group();
    // Pieces of log along the span, leaving out the gap.
    const pieces: [number, number][] = gap ? [[-span - 0.3, gap[0]], [gap[1], span + 0.3]] : [[-span - 0.3, span + 0.3]];
    const color = big ? 0x8a5a30 : 0xb07a48;
    const rollers: THREE.Group[] = [];
    for (const [a, b] of pieces) {
      if (b - a < 0.2) continue;
      const roller = new THREE.Group();
      roller.position.x = (a + b) / 2;
      const len = b - a;
      const wood = toonMesh(new THREE.CylinderGeometry(radius, radius, len, 18), color, { outline: 0.04 });
      wood.rotation.z = Math.PI / 2;
      roller.add(wood);
      for (const s of [-1, 1]) {
        const end = toonMesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.02, 18), Palette.butter, { outline: false });
        end.rotation.z = Math.PI / 2;
        end.position.x = (s * len) / 2 + s * 0.01;
        roller.add(end);
      }
      const rings = Math.max(1, Math.floor(len / 0.9));
      for (let k = 0; k < rings; k++) {
        const x = -len / 2 + ((k + 0.5) * len) / rings;
        for (let j = 0; j < 6; j++) {
          const a2 = (j / 6) * Math.PI * 2 + (k % 2) * 0.5;
          const spike = new THREE.Mesh(spikeGeo, this.spikeMat);
          spike.position.set(x, Math.cos(a2) * (radius + 0.12), Math.sin(a2) * (radius + 0.12));
          spike.rotation.x = a2;
          roller.add(spike);
        }
      }
      rollers.push(roller);
    }
    // One wrapper so the whole log spins about its own length.
    const roller = new THREE.Group();
    for (const r of rollers) roller.add(r);
    roller.position.y = radius;
    group.add(roller);
    // Local X maps onto world Z for logs rolling along X.
    if (axis === 'x') group.rotation.y = -Math.PI / 2;
    return { group, roller };
  }

  private spawn(axis: Axis, big: boolean): void {
    const rng = this.game.rng;
    const dir = rng.next() < 0.5 ? 1 : -1;
    const span = axis === 'z' ? HX : HZ;
    let gap: [number, number] | null = null;
    if (big) {
      const w = 2.6 - Math.min(0.8, this.clock * 0.02);
      const c = rng.range(-span + w / 2 + 0.4, span - w / 2 - 0.4);
      gap = [c - w / 2, c + w / 2];
    }
    const { group, roller } = this.buildLog(axis, big, gap);
    const half = axis === 'z' ? HZ : HX;
    const pos = -dir * (half + ENTER);
    const speed = (big ? 3.6 : 4.8) + this.clock * 0.07 + rng.range(0, 0.6);
    const radius = big ? 0.85 : 0.32;
    this.logs.push({ group, roller, axis, dir, pos, speed, big, radius, clear: big ? 99 : 0.6, gap });
    this.place(this.logs[this.logs.length - 1]);
    this.scene.add(group);
    this.game.audio.note('bass', big ? 'D2' : 'A2', 0.2, 0.35);
  }

  private place(l: Log): void {
    if (l.axis === 'z') l.group.position.set(0, 0, l.pos);
    else l.group.position.set(l.pos, 0, 0);
  }

  /** Decides what rolls in next; more at once and more big logs as time passes. */
  private wave(): void {
    const rng = this.game.rng;
    this.waves++;
    const axis: Axis = rng.next() < 0.5 ? 'x' : 'z';
    const big = this.waves > 2 && !this.logs.some((l) => l.big) && rng.next() < 0.35 + Math.min(0.2, this.clock * 0.006);
    this.spawn(axis, big);
    // Later on, a second log from the cross direction.
    if (this.clock > 15 && rng.next() < Math.min(0.6, (this.clock - 15) * 0.03)) this.spawn(axis === 'x' ? 'z' : 'x', false);
    this.nextWave = this.clock + Math.max(1.0, 2.4 - this.clock * 0.035) + rng.range(0, 0.5);
  }

  /** Where a player sits along a log's path, and across it. */
  private coords(l: Log, pos: THREE.Vector3): { along: number; across: number } {
    return l.axis === 'z' ? { along: pos.z, across: pos.x } : { along: pos.x, across: pos.z };
  }

  private inGap(l: Log, across: number, margin = 0): boolean {
    return !!l.gap && across > l.gap[0] + BODY + margin && across < l.gap[1] - BODY - margin;
  }

  /** CPUs line up with gaps in big logs and hop small ones, now and then mistiming it. */
  private cpu(p: MinigamePlayer): { move: THREE.Vector3; jump: boolean } {
    const pos = p.character.position;
    const move = new THREE.Vector3();
    let jump = false;
    let threat = Infinity;
    for (const l of this.logs) {
      const { along, across } = this.coords(l, pos);
      const ahead = (along - l.pos) * l.dir;
      // Fully rolled past?
      if (ahead < -l.radius - BODY - 0.3) continue;
      const eta = (ahead - l.radius - BODY) / l.speed;
      if (l.big) {
        if (eta < 3.2 && eta < threat) {
          threat = eta;
          const want = (l.gap![0] + l.gap![1]) / 2 + (p.seat - 1.5) * 0.25;
          const d = this.inGap(l, across, 0.2) ? 0 : THREE.MathUtils.clamp((want - across) * 3, -1, 1);
          move.set(0, 0, 0);
          if (l.axis === 'z') move.x = d;
          else move.z = d;
        }
      } else if (eta > -0.05 && eta < (p.data.react as number) && pos.y === 0 && (p.data.vy as number) === 0) {
        jump = true;
      }
    }
    if (threat === Infinity) {
      // Nothing big coming: drift home, stepping away from the edges.
      const home = p.data.home as THREE.Vector3;
      move.set(home.x - pos.x, 0, home.z - pos.z).multiplyScalar(0.3);
      if (move.lengthSq() > 0.36) move.setLength(0.6);
    }
    if (jump) {
      const rng = this.game.rng;
      const flub = rng.next() < 0.035 + this.clock * 0.003;
      p.data.react = flub ? (rng.next() < 0.5 ? 0.0 : 0.7) : 0.1 + rng.next() * 0.14;
    }
    return { move, jump };
  }

  play(dt: number): void {
    this.clock += dt;
    if (this.clock >= this.nextWave) this.wave();

    for (const p of this.alive) {
      const c = p.character;
      let move: THREE.Vector3;
      let jump: boolean;
      if (p.controller) {
        move = stick(p);
        jump = p.controller.pressed('a');
      } else ({ move, jump } = this.cpu(p));
      const grounded = c.position.y === 0;
      if (jump && grounded) {
        p.data.vy = JUMP_V;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      c.position.addScaledVector(move, SPEED * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HX + 0.4, HX - 0.4);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HZ + 0.4, HZ - 0.4);
      face(p, move, dt);
      if (!grounded || (p.data.vy as number) > 0) {
        p.data.vy = (p.data.vy as number) - GRAVITY * dt;
        c.position.y += (p.data.vy as number) * dt;
        if (c.position.y <= 0) {
          c.position.y = 0;
          p.data.vy = 0;
          c.land();
          c.pose = 'idle';
        }
      } else moveAnim(p, move.length());
    }
    separate(this.alive, 0.42);

    for (const l of this.logs) {
      l.pos += l.dir * l.speed * dt;
      l.roller.rotation.x += (l.speed / l.radius) * dt * (l.axis === 'z' ? l.dir : -l.dir);
      this.place(l);
      for (const p of this.alive) {
        const c = p.character;
        const { along, across } = this.coords(l, c.position);
        if (Math.abs(along - l.pos) > l.radius + BODY) continue;
        if (c.position.y > l.clear || this.inGap(l, across)) continue;
        const push = new THREE.Vector3();
        if (l.axis === 'z') push.set(0, 2, l.dir * 8);
        else push.set(l.dir * 8, 2, 0);
        knockOut(p, push);
        this.game.audio.play('boom');
      }
    }
    // Retire logs that have rolled off the far side.
    this.logs = this.logs.filter((l) => {
      const half = l.axis === 'z' ? HZ : HX;
      if (l.pos * l.dir < half + ENTER) return true;
      this.scene.remove(l.group);
      return false;
    });

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

export const spikeRoller: MinigameDef = {
  id: 'spikeroller',
  name: 'Spike Roller',
  kind: 'ffa',
  duel: true,
  song: spikeTheme,
  rules: 'Spiked logs roll across the field from every side! Jump over the small ones with A, and find the gap in the big ones. Last one standing wins!',
  controls: 'Stick: move · A: jump',
  create: () => new SpikeRoller(),
};
