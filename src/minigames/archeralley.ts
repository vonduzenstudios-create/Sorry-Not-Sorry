import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { scorePanel, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Depth of the target wall; reticles and targets live on this plane. */
const WALL_Z = -10;
const HALF_W = 11;
const AIM_X = 9;
const AIM_Y: [number, number] = [0.6, 6.6];
const AIM_SPEED = 9;
const ARROW_SPEED = 34;
const RELOAD = 0.55;
const SPACING = 3;

interface Lane {
  y: number;
  radius: number;
  points: number;
  speed: number;
  color: number;
  count: number;
}

const LANES: Lane[] = [
  { y: 1.3, radius: 0.85, points: 1, speed: 2.4, color: 0xf2c46a, count: 3 },
  { y: 3.2, radius: 0.62, points: 2, speed: -3.6, color: Palette.cream, count: 3 },
  { y: 5.1, radius: 0.45, points: 3, speed: 5, color: Palette.rose, count: 2 },
];
const BIRD = { y: 6.3, radius: 0.5, points: 5, speed: 8.5 };

interface Target {
  mesh: THREE.Group;
  lane: number;
  x: number;
  y: number;
  radius: number;
  points: number;
  speed: number;
  /** Seconds until it pops back up after a hit. */
  down: number;
  bird: boolean;
}

interface Arrow {
  mesh: THREE.Group;
  owner: MinigamePlayer;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  /** Already resolved against the targets; now just flying on and out. */
  spent: boolean;
}

interface Rig {
  reticle: THREE.Group;
  bow: THREE.Group;
  aim: THREE.Vector3;
  reload: number;
  pull: number;
}

/** Archer Alley: a jaunty fairground march in G with a bright bell lead. */
const archerTheme: Song = {
  name: 'Archer Alley',
  bpm: 132,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.18,
      pattern: [
        'G5 . D5 . G5 . B5 . A5 . G5 . F#5 . D5 .',
        'E5 . G5 . C6 . B5 . A5 - - . . . . .',
        'G5 . B5 . D6 . B5 . C6 . A5 . F#5 . A5 .',
        'G5 . D5 . B4 . D5 . G5 - - . . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        'G2 . . . D3 . . . G2 . . . D3 . . .',
        'C2 . . . G2 . . . D2 . . . A2 . . .',
        'G2 . . . B2 . . . C3 . . . D3 . . .',
        'G2 . . . D3 . . . G2 . D2 . G2 . . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.12,
      pattern: [
        '. . B4 . . . B4 . . . B4 . . . A4 .',
        '. . C5 . . . C5 . . . A4 . . . A4 .',
        '. . B4 . . . D5 . . . E5 . . . F#4 .',
        '. . B4 . . . B4 . . . B4 . . . . .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.55, pattern: Array(4).fill('x . . . . . . . x . . . . . . .').join(' ') },
    { instrument: 'snare', volume: 0.2, pattern: Array(4).fill('. . . . x . . . . . . . x . x .').join(' ') },
    { instrument: 'hat', volume: 0.07, pattern: Array(4).fill('. . x . . . x . . . x . . . x .').join(' ') },
  ],
};

/**
 * Targets slide along the fairground wall. Steer your crosshair and press A
 * to loose an arrow: higher, faster targets are worth more, and a golden bird
 * sometimes flaps by. Most points when time runs out wins.
 */
class ArcherAlley extends Minigame {
  readonly timeLimit = 30;
  private targets: Target[] = [];
  private arrows: Arrow[] = [];
  private rigs = new Map<MinigamePlayer, Rig>();
  private bird!: Target;
  private birdTimer = 6;
  private board!: HTMLDivElement;
  private bits: THREE.Mesh[] = [];

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xffeccc], 0x8fd3a0, -0.02);
    const ground = toonMesh(new THREE.BoxGeometry(30, 0.4, 22), Palette.grass, { outline: false });
    ground.position.set(0, -0.2, -2);
    this.scene.add(ground);
    const lane = toonMesh(new THREE.BoxGeometry(14, 0.06, 4), Palette.sand, { outline: false });
    lane.position.set(0, 0.02, 4);
    this.scene.add(lane);

    // Striped wall with a rail for each lane of targets.
    for (let i = 0; i < 14; i++) {
      const plank = toonMesh(new THREE.BoxGeometry(1.7, 8, 0.4), i % 2 ? 0x8fc6e8 : Palette.cream, { outline: false });
      plank.position.set(-11 + i * 1.7, 4, WALL_Z - 0.8);
      this.scene.add(plank);
    }
    const trim = toonMesh(new THREE.BoxGeometry(24, 0.5, 0.6), Palette.coral, { outline: 0.04 });
    trim.position.set(0, 8.1, WALL_Z - 0.7);
    this.scene.add(trim);
    for (const l of LANES) {
      const rail = toonMesh(new THREE.BoxGeometry(24, 0.14, 0.2), 0x8a6a50, { outline: false });
      rail.position.set(0, l.y - l.radius - 0.15, WALL_Z - 0.45);
      this.scene.add(rail);
    }
    // Hay bales flank the shooting line.
    for (const x of [-7.6, 7.6]) {
      const bale = toonMesh(new THREE.BoxGeometry(1.4, 0.9, 1), 0xf0d27a, { outline: 0.04 });
      bale.position.set(x, 0.45, 4);
      this.scene.add(bale);
    }

    LANES.forEach((l, li) => {
      for (let k = 0; k < l.count; k++) {
        const t = this.makeTarget(li, l.radius, l.color, l.points, false);
        t.x = -HALF_W + ((k + li * 0.37) / l.count) * HALF_W * 2;
        t.y = l.y;
        t.speed = l.speed;
        this.targets.push(t);
      }
    });
    this.bird = this.makeTarget(-1, BIRD.radius, Palette.yellow, BIRD.points, true);
    this.bird.y = BIRD.y;
    this.bird.down = Infinity;
    this.bird.mesh.visible = false;
    this.targets.push(this.bird);

    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * SPACING;
      p.character.position.set(x, 0, 4);
      p.character.rotation.y = Math.PI;
      p.data.score = 0;
      p.data.skill = 0.25 + this.game.rng.next() * 0.35;
      p.data.think = 0.3;
      const accent = p.character.def.colors.accent;

      const reticle = new THREE.Group();
      const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: accent }));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: accent }));
      reticle.add(ringMesh, dot);
      for (let k = 0; k < 4; k++) {
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), new THREE.MeshBasicMaterial({ color: accent }));
        const a = (k * Math.PI) / 2;
        tick.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
        tick.rotation.z = a + Math.PI / 2;
        reticle.add(tick);
      }
      this.scene.add(reticle);

      const bow = new THREE.Group();
      const limb = toonMesh(new THREE.TorusGeometry(0.5, 0.045, 6, 16, Math.PI), 0x8a5a3a, { outline: 0.015 });
      // Arc bows out toward the target (+Z once the bow looks at the crosshair).
      limb.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
      const string = toonMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), Palette.cream, { outline: false });
      string.name = 'string';
      bow.add(limb, string);
      this.scene.add(bow);

      const aim = new THREE.Vector3(x, 3, WALL_Z + 0.05);
      this.rigs.set(p, { reticle, bow, aim, reload: 0, pull: 0 });
    });

    this.camera.position.set(0, 5.2, 13);
    this.camera.lookAt(0, 3, -4);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private makeTarget(lane: number, radius: number, color: number, points: number, bird: boolean): Target {
    const mesh = new THREE.Group();
    if (bird) {
      const body = toonMesh(new THREE.SphereGeometry(radius, 16, 12), color, { outline: 0.03 });
      const beak = toonMesh(new THREE.ConeGeometry(0.12, 0.3, 8), Palette.coral, { outline: false });
      beak.rotation.z = -Math.PI / 2;
      beak.position.x = radius;
      for (const s of [-1, 1]) {
        const wing = toonMesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), 0xffe680, { outline: 0.02 });
        wing.position.set(-0.05, 0.1, s * radius * 0.9);
        wing.name = 'wing';
        mesh.add(wing);
      }
      mesh.add(body, beak);
    } else {
      // Bullseye: concentric discs facing the camera, on a little post.
      const rings = [color, Palette.coral, Palette.cream, Palette.coral];
      rings.forEach((c, k) => {
        const disc = toonMesh(new THREE.CylinderGeometry(radius * (1 - k * 0.24), radius * (1 - k * 0.24), 0.1, 24), c, { outline: k === 0 ? 0.03 : false });
        disc.rotation.x = Math.PI / 2;
        disc.position.z = k * 0.03;
        mesh.add(disc);
      });
      const post = toonMesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), 0x8a6a50, { outline: false });
      post.position.y = -radius - 0.08;
      mesh.add(post);
    }
    mesh.position.z = WALL_Z;
    this.scene.add(mesh);
    return { mesh, lane, x: 0, y: 0, radius, points, speed: 0, down: 0, bird };
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">${p.data.score as number}</span>`)
      .join('');
  }

  private bowPos(p: MinigamePlayer): THREE.Vector3 {
    return p.character.position.clone().add(new THREE.Vector3(0.55, 1.2, -0.3));
  }

  /** Where a target will be after `secs`, wrapping round the alley. */
  private predict(t: Target, secs: number): number {
    let x = t.x + t.speed * secs;
    if (!t.bird) x = ((((x + HALF_W) % (HALF_W * 2)) + HALF_W * 2) % (HALF_W * 2)) - HALF_W;
    return x;
  }

  /** CPUs pick a target, lead it by the arrow's flight time, and loose when lined up. */
  private cpu(p: MinigamePlayer, rig: Rig, dt: number): { move: THREE.Vector2; shoot: boolean } {
    const rng = this.game.rng;
    let goal = p.data.goal as Target | undefined;
    if (!goal || goal.down > 0 || Math.abs(goal.x) > AIM_X - 0.3) {
      // Prefer close targets; brave CPUs go for the high ones and the bird.
      const live = this.targets.filter((t) => t.down <= 0 && Math.abs(t.x) < AIM_X - 1);
      if (!live.length) return { move: new THREE.Vector2(), shoot: false };
      const scoreOf = (t: Target) => Math.hypot(t.x - rig.aim.x, t.y - rig.aim.y) - t.points * (p.data.skill as number) * 2.5 + rng.next() * 2;
      goal = live.reduce((a, b) => (scoreOf(b) < scoreOf(a) ? b : a));
      p.data.goal = goal;
      p.data.err = new THREE.Vector2((rng.next() - 0.5) * 1.1, (rng.next() - 0.5) * 1.1).multiplyScalar(1 - (p.data.skill as number));
    }
    const flight = this.bowPos(p).distanceTo(rig.aim) / ARROW_SPEED;
    const err = p.data.err as THREE.Vector2;
    const want = new THREE.Vector2(this.predict(goal, flight) + err.x, goal.y + err.y);
    const d = want.clone().sub(new THREE.Vector2(rig.aim.x, rig.aim.y));
    const move = d.length() > 0.12 ? d.clone().normalize().multiplyScalar(Math.min(1, d.length() * 2)) : new THREE.Vector2();
    p.data.think = (p.data.think as number) - dt;
    const shoot = d.length() < 0.35 && rig.reload <= 0 && (p.data.think as number) <= 0;
    if (shoot) {
      p.data.think = 0.15 + rng.next() * 0.45;
      p.data.goal = undefined;
    }
    return { move, shoot };
  }

  play(dt: number): void {
    // Targets slide; the bird flaps across now and then.
    for (const t of this.targets) {
      if (t.bird) continue;
      if (t.down > 0) {
        t.down -= dt;
        t.mesh.visible = t.down <= 0;
      }
      t.x = this.predict(t, dt);
    }
    this.birdTimer -= dt;
    if (this.birdTimer <= 0 && this.bird.down === Infinity) {
      const dir = this.game.rng.next() < 0.5 ? 1 : -1;
      this.bird.speed = BIRD.speed * dir;
      this.bird.x = -dir * (HALF_W + 1);
      this.bird.down = 0;
      this.bird.mesh.visible = true;
      this.bird.mesh.rotation.y = dir > 0 ? 0 : Math.PI;
      this.game.audio.play('star');
    }
    if (this.bird.down === 0) {
      this.bird.x += this.bird.speed * dt;
      if (Math.abs(this.bird.x) > HALF_W + 1.5) this.hideBird();
    }

    for (const p of this.players) {
      const rig = this.rigs.get(p)!;
      rig.reload -= dt;
      let move: THREE.Vector2;
      let shoot: boolean;
      if (p.controller) {
        move = new THREE.Vector2(p.controller.stickX, p.controller.stickY);
        if (move.lengthSq() > 1) move.normalize();
        shoot = p.controller.pressed('a') && rig.reload <= 0;
      } else ({ move, shoot } = this.cpu(p, rig, dt));
      rig.aim.x = THREE.MathUtils.clamp(rig.aim.x + move.x * AIM_SPEED * dt, -AIM_X, AIM_X);
      rig.aim.y = THREE.MathUtils.clamp(rig.aim.y + move.y * AIM_SPEED * dt, AIM_Y[0], AIM_Y[1]);
      if (shoot) this.loose(p, rig);
    }

    for (const a of this.arrows) {
      a.t += dt;
      if (!a.spent && a.t >= a.dur) {
        a.spent = true;
        this.resolve(a);
      }
    }
    this.renderScore();
  }

  private loose(p: MinigamePlayer, rig: Rig): void {
    rig.reload = RELOAD;
    rig.pull = 1;
    const from = this.bowPos(p);
    const to = rig.aim.clone();
    const mesh = new THREE.Group();
    const shaft = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), 0xc9a27a, { outline: false });
    shaft.rotation.x = Math.PI / 2;
    const tip = toonMesh(new THREE.ConeGeometry(0.06, 0.18, 6), 0x8a8aa0, { outline: false });
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.5;
    const fletch = toonMesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), p.character.def.colors.accent, { outline: false });
    fletch.position.z = 0.4;
    mesh.add(shaft, tip, fletch);
    mesh.position.copy(from);
    mesh.lookAt(from.clone().multiplyScalar(2).sub(to));
    this.scene.add(mesh);
    this.arrows.push({ mesh, owner: p, from, to, t: 0, dur: from.distanceTo(to) / ARROW_SPEED, spent: false });
    this.game.audio.note('triangle', 'A5', 0.06, 0.12);
  }

  /** The arrow reached the wall: did it hit anything? Nearest-center target wins ties. */
  private resolve(a: Arrow): void {
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of this.targets) {
      if (t.down > 0) continue;
      const d = Math.hypot(t.x - a.to.x, t.y - a.to.y);
      if (d < t.radius + 0.08 && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return;
    const p = a.owner;
    p.data.score = (p.data.score as number) + best.points;
    p.character.pose = 'cheer';
    p.data.cheer = 0.6;
    this.game.audio.play(best.bird ? 'star' : 'pop');
    this.game.audio.note('bell', ['C6', 'E6', 'G6', 'G6', 'C7'][best.points - 1], 0.12, 0.2);
    this.burst(best);
    a.mesh.visible = false;
    if (best.bird) this.hideBird();
    else {
      best.down = 1.2;
      best.mesh.visible = false;
    }
  }

  private hideBird(): void {
    this.bird.down = Infinity;
    this.bird.mesh.visible = false;
    this.birdTimer = 5 + this.game.rng.next() * 3;
  }

  /** Splinters fly off a hit target (visual only). */
  private burst(t: Target): void {
    for (let i = 0; i < 8; i++) {
      const bit = toonMesh(new THREE.TetrahedronGeometry(0.12), i % 2 ? Palette.coral : Palette.cream, { outline: false });
      bit.position.set(t.x, t.y, WALL_Z + 0.2);
      bit.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 1, Math.random() * 3);
      bit.userData.life = 0.9;
      this.scene.add(bit);
      this.bits.push(bit);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const t of this.targets) {
      t.mesh.position.set(t.x, t.y + (t.bird ? Math.sin(this.t * 6) * 0.25 : 0), WALL_Z);
      if (t.bird) for (const c of t.mesh.children) if (c.name === 'wing') c.rotation.x = Math.sin(this.t * 22) * 0.7 * Math.sign(c.position.z);
    }
    for (const [p, rig] of this.rigs) {
      rig.reticle.position.copy(rig.aim);
      rig.reticle.rotation.z += dt * 1.5;
      rig.reticle.scale.setScalar(rig.reload > 0 ? 0.8 : 1);
      rig.pull = Math.max(0, rig.pull - dt * 4);
      const from = this.bowPos(p);
      rig.bow.position.copy(from);
      rig.bow.lookAt(rig.aim);
      const string = rig.bow.getObjectByName('string')!;
      string.position.z = -0.08 - (rig.reload > 0 ? 0 : 0.18) + rig.pull * 0.1;
      // Archers turn a little toward their crosshair.
      const yaw = Math.atan2(rig.aim.x - p.character.position.x, rig.aim.z - p.character.position.z);
      p.character.rotation.y += (Math.atan2(Math.sin(yaw - p.character.rotation.y), Math.cos(yaw - p.character.rotation.y))) * Math.min(1, dt * 8);
      const cheer = ((p.data.cheer as number | undefined) ?? 0) - dt;
      p.data.cheer = cheer;
      if (cheer <= 0 && p.character.pose === 'cheer') p.character.pose = 'idle';
    }
    for (const a of this.arrows) {
      const k = a.t / a.dur;
      a.mesh.position.lerpVectors(a.from, a.to, k);
      if (a.spent && k > 1.6) a.mesh.visible = false;
    }
    this.arrows = this.arrows.filter((a) => {
      if (a.mesh.visible) return true;
      this.scene.remove(a.mesh);
      return false;
    });
    this.bits = this.bits.filter((b) => {
      const v = b.userData.vel as THREE.Vector3;
      v.y -= 18 * dt;
      b.position.addScaledVector(v, dt);
      b.rotation.x += dt * 8;
      b.userData.life -= dt;
      if (b.userData.life > 0) return true;
      this.scene.remove(b);
      return false;
    });
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p.data.score as number;
  }

  timeout(): number[] {
    const winners = topScorers(this.players, (p) => p.data.score as number, 0);
    for (const p of this.players) p.character.pose = winners.includes(p.seat) ? 'cheer' : 'sulk';
    return winners;
  }
}

export const archerAlley: MinigameDef = {
  id: 'archeralley',
  name: 'Archer Alley',
  kind: 'ffa',
  duel: true,
  song: archerTheme,
  rules: 'Aim your crosshair and shoot the sliding targets. High ones score more, and the golden bird is worth 5! Most points wins.',
  controls: 'Stick: aim · A: shoot',
  create: () => new ArcherAlley(),
};
