import * as THREE from 'three';
import { sawTheme } from '../audio/songs/sawFishThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, separate, stick, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const LENGTH = 96;
const HALF_W = 5;
const SPEED = 5.2;
const JUMP_V = 8;
const GRAVITY = 26;
const PIT_LEN = 2.4;
/** Swinging saws hang from this height on an arm this long. */
const PIVOT_Y = 7.6;
const ARM = 7.1;
const BLADE_R = 0.85;
const LANES = [-3.75, -1.25, 1.25, 3.75];

type Hazard =
  | { kind: 'pit'; z: number }
  | { kind: 'swing' | 'slide'; z: number; amp: number; w: number; phase: number; blade: THREE.Group; arm?: THREE.Group };

type Saw = Extract<Hazard, { kind: 'swing' | 'slide' }>;

const TAU = Math.PI * 2;

/**
 * An obstacle course over the sea: hop the pits, slip past swinging saws and
 * the saws that slide along floor grooves. A hit knocks you back and dazes
 * you. First across the finish wins; at time up, whoever got furthest.
 */
class SawSprint extends Minigame {
  readonly timeLimit = 50;
  private hazards: Hazard[] = [];
  private clock = 0;
  private board!: HTMLDivElement;
  private camZ = 4;
  private camSpread = 0;

  protected setup(): void {
    arenaBasics(this.scene, [0xffc9a8, 0xfff4d8], 0x7fc8e8, -14);
    const rng = this.game.rng;
    // Layout: [z, kind] from start to finish. Pits split the floor into slabs.
    // Twin saws share a row and swing out of step with each other.
    const plan: [number, Hazard['kind'] | 'twin'][] = [
      [-8, 'pit'],
      [-14, 'swing'],
      [-19, 'slide'],
      [-24, 'pit'],
      [-30, 'twin'],
      [-35, 'slide'],
      [-39, 'swing'],
      [-44, 'pit'],
      [-50, 'twin'],
      [-55, 'slide'],
      [-59, 'pit'],
      [-65, 'swing'],
      [-69, 'slide'],
      [-73, 'twin'],
      [-78, 'pit'],
      [-84, 'twin'],
      [-89, 'slide'],
    ];
    let slabStart = 3;
    const slab = (from: number, to: number) => {
      const len = from - to;
      const floor = toonMesh(new THREE.BoxGeometry(HALF_W * 2, 0.6, len), 0xf0d2a8, { outline: 0.05 });
      floor.position.set(0, -0.3, (from + to) / 2);
      this.scene.add(floor);
      for (let z = from - 1; z > to; z -= 2) {
        const stripe = toonMesh(new THREE.BoxGeometry(HALF_W * 2, 0.02, 1), 0xe6c094, { outline: false });
        stripe.position.set(0, 0.01, z - 0.5);
        this.scene.add(stripe);
      }
      for (const x of [-2.5, 0, 2.5]) {
        const line = toonMesh(new THREE.BoxGeometry(0.06, 0.03, len), Palette.cream, { outline: false });
        line.position.set(x, 0.02, (from + to) / 2);
        this.scene.add(line);
      }
      for (const side of [-1, 1]) {
        const rail = toonMesh(new THREE.BoxGeometry(0.3, 0.5, len), Palette.coral, { outline: 0.03 });
        rail.position.set(side * (HALF_W + 0.15), 0.1, (from + to) / 2);
        this.scene.add(rail);
      }
      const pillar = toonMesh(new THREE.CylinderGeometry(1, 1.4, 13, 12), 0xc9a27a, { outline: 0.05 });
      pillar.position.set(0, -7, (from + to) / 2);
      this.scene.add(pillar);
    };
    for (const [z, entry] of plan) {
      if (entry === 'pit') {
        slab(slabStart, z);
        slabStart = z - PIT_LEN;
        this.hazards.push({ kind: 'pit', z });
        continue;
      }
      const amp = entry === 'slide' ? rng.range(3.6, 4.4) : rng.range(0.8, 0.95);
      const w = rng.range(1.9, 2.6);
      const phase = rng.next() * TAU;
      if (entry === 'slide') {
        const groove = toonMesh(new THREE.BoxGeometry(HALF_W * 2 - 0.4, 0.03, 0.3), Palette.ink, { outline: false });
        groove.position.set(0, 0.025, z);
        this.scene.add(groove);
        const blade = this.blade();
        blade.position.set(0, 0.05, z);
        this.scene.add(blade);
        this.hazards.push({ kind: 'slide', z, amp, w, phase, blade });
        continue;
      }
      for (const side of [-1, 1]) {
        const post = toonMesh(new THREE.BoxGeometry(0.4, PIVOT_Y + 0.4, 0.4), Palette.violet, { outline: 0.03 });
        post.position.set(side * (HALF_W + 0.6), (PIVOT_Y + 0.4) / 2, z);
        this.scene.add(post);
      }
      // A thin axle, so the camera can see through to the players.
      const beam = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, HALF_W * 2 + 1.2, 8), Palette.ink, { outline: false });
      beam.rotation.z = Math.PI / 2;
      beam.position.set(0, PIVOT_Y, z);
      this.scene.add(beam);
      // Twins hang a little apart and swing opposite each other.
      const arms: [number, number][] = entry === 'twin' ? [[z + 0.35, phase], [z - 0.35, phase + Math.PI]] : [[z, phase]];
      for (const [az, ph] of arms) {
        const arm = new THREE.Group();
        const rod = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, ARM, 8), Palette.ink, { outline: false });
        rod.position.y = -ARM / 2;
        const blade = this.blade();
        blade.position.y = -ARM;
        arm.add(rod, blade);
        arm.position.set(0, PIVOT_Y, az);
        this.scene.add(arm);
        this.hazards.push({ kind: 'swing', z: az, amp, w, phase: ph, blade, arm });
      }
    }
    slab(slabStart, -LENGTH - 4);

    // Finish arch with a checkered banner.
    for (const side of [-1, 1]) {
      const post = toonMesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 12), Palette.cream, { outline: 0.03 });
      post.position.set(side * (HALF_W + 0.3), 2, -LENGTH);
      this.scene.add(post);
    }
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 2; j++) {
        const w = (HALF_W * 2) / 12;
        const sq = toonMesh(new THREE.BoxGeometry(w, 0.4, 0.1), (i + j) % 2 ? Palette.ink : Palette.cream, { outline: false });
        sq.position.set(-HALF_W + (i + 0.5) * w, 3.6 + j * 0.4, -LENGTH);
        this.scene.add(sq);
      }
    }
    for (let i = 0; i < 10; i++) {
      const tile = toonMesh(new THREE.BoxGeometry(1, 0.03, 0.5), i % 2 ? Palette.ink : Palette.cream, { outline: false });
      tile.position.set(-HALF_W + 0.5 + i, 0.02, -LENGTH);
      this.scene.add(tile);
    }

    const n = this.players.length;
    this.players.forEach((p, i) => {
      const lane = n === 4 ? LANES[i] : (i - (n - 1) / 2) * 2.5;
      p.character.position.set(lane, 0, 1.5);
      p.character.rotation.y = Math.PI;
      Object.assign(p.data, { lane, vy: 0, stun: 0, inv: 0, kb: new THREE.Vector3(), sink: 0, best: 0, lead: 0.5, target: -1, flub: false });
    });
    this.camera.position.set(0, 13, 14);
    this.camera.lookAt(0, 0, -2.5);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private blade(): THREE.Group {
    const g = new THREE.Group();
    const disc = new THREE.Group();
    const saw = toonMesh(new THREE.CylinderGeometry(BLADE_R, BLADE_R, 0.1, 24), 0xd8dce8, { outline: 0.03 });
    saw.rotation.x = Math.PI / 2;
    const hub = toonMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), Palette.coral, { outline: 0.02 });
    hub.rotation.x = Math.PI / 2;
    disc.add(saw, hub);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const tooth = toonMesh(new THREE.ConeGeometry(0.12, 0.26, 4), 0xb8bccc, { outline: false });
      tooth.position.set(Math.cos(a) * (BLADE_R + 0.08), Math.sin(a) * (BLADE_R + 0.08), 0);
      tooth.rotation.z = a - Math.PI / 2;
      disc.add(tooth);
    }
    disc.name = 'disc';
    g.add(disc);
    return g;
  }

  /** Blade center in world X/Y at a given time. */
  private bladeAt(h: Saw, t: number): { x: number; y: number; vx: number } {
    const s = Math.sin(h.w * t + h.phase);
    const c = Math.cos(h.w * t + h.phase);
    if (h.kind === 'slide') return { x: h.amp * s, y: 0.05, vx: h.amp * h.w * c };
    const th = h.amp * s;
    return { x: ARM * Math.sin(th), y: PIVOT_Y - ARM * Math.cos(th), vx: ARM * Math.cos(th) * h.amp * h.w * c };
  }

  /** Would a blade at time t hit a standing player at x? */
  private danger(h: Saw, x: number, t: number): boolean {
    const b = this.bladeAt(h, t);
    return Math.abs(b.x - x) < 1.4 && b.y < 1.9;
  }

  private cpu(p: MinigamePlayer, dt: number): { move: THREE.Vector3; jump: boolean } {
    const pos = p.character.position;
    const rng = this.game.rng;
    const move = new THREE.Vector3(THREE.MathUtils.clamp(((p.data.lane as number) - pos.x) * 0.8, -0.6, 0.6), 0, -1);
    let jump = false;
    const idx = this.hazards.findIndex((h) => (h.kind === 'pit' ? h.z - PIT_LEN : h.z - 0.5) < pos.z);
    if (idx < 0) return { move, jump };
    const h = this.hazards[idx];
    if (idx !== p.data.target) {
      // New obstacle: decide how well we'll handle it. Mistakes get likelier as the clock runs.
      p.data.target = idx;
      p.data.flub = rng.next() < 0.1 + this.clock * 0.003;
      p.data.lead = p.data.flub ? rng.pick([-0.3, 1.8]) : rng.range(0.2, 0.7);
      p.data.waited = 0;
      p.data.patience = rng.range(1, 3);
    }
    const d = pos.z - h.z;
    if (h.kind === 'pit') {
      if (d < (p.data.lead as number) && pos.y === 0) jump = true;
      return { move, jump };
    }
    // Saws: hold back while the blade will be in our path on arrival, unless already committed.
    // Patience runs out after a while and they make a dash for it.
    if (d > 0.7 && d < 3.5 && !p.data.flub && (p.data.waited as number) < (p.data.patience as number)) {
      const row = this.hazards.filter((o): o is Saw => o.kind !== 'pit' && o.z <= h.z && o.z > h.z - 1);
      const arrive = (d - 0.6) / SPEED;
      for (let s = 0; s <= 6 && move.z; s++) {
        if (row.some((o) => this.danger(o, pos.x, this.clock + arrive + s * 0.08))) move.z = 0;
      }
      if (!move.z) p.data.waited = (p.data.waited as number) + dt;
    }
    return { move, jump };
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">${Math.min(100, Math.round(((p.data.best as number) / LENGTH) * 100))}%</span>`)
      .join('');
  }

  play(dt: number): void {
    this.clock += dt;
    for (const h of this.hazards) {
      if (h.kind === 'pit') continue;
      const b = this.bladeAt(h, this.clock);
      if (h.arm) h.arm.rotation.z = h.amp * Math.sin(h.w * this.clock + h.phase);
      else h.blade.position.x = b.x;
    }

    const crossed: MinigamePlayer[] = [];
    for (const p of this.players) {
      const c = p.character;
      const d = p.data;
      d.inv = Math.max(0, (d.inv as number) - dt);
      // Fell in a pit: drop, then climb back on at its near edge.
      if ((d.sink as number) > 0) {
        d.sink = (d.sink as number) - dt;
        d.vy = (d.vy as number) - GRAVITY * dt;
        c.position.y += (d.vy as number) * dt;
        if ((d.sink as number) <= 0) {
          const pit = d.pitZ as number;
          c.position.set(c.position.x, 0, pit + 0.8);
          d.vy = 0;
          d.inv = 0.8;
          d.target = -1;
          c.pose = 'idle';
          c.setExpression('determined');
        }
        continue;
      }
      let move = new THREE.Vector3();
      let jump = false;
      if ((d.stun as number) > 0) {
        d.stun = (d.stun as number) - dt;
        if ((d.stun as number) <= 0) c.setExpression('determined');
      } else if (p.controller) {
        move = stick(p);
        jump = p.controller.pressed('a');
      } else ({ move, jump } = this.cpu(p, dt));

      const grounded = c.position.y === 0;
      if (jump && grounded) {
        d.vy = JUMP_V;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      const kb = d.kb as THREE.Vector3;
      c.position.addScaledVector(move, SPEED * dt).addScaledVector(kb, dt);
      kb.multiplyScalar(Math.max(0, 1 - dt * 5));
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_W + 0.4, HALF_W - 0.4);
      c.position.z = Math.min(2, c.position.z);
      if ((d.stun as number) <= 0) face(p, move, dt);
      if (!grounded || (d.vy as number) > 0) {
        d.vy = (d.vy as number) - GRAVITY * dt;
        c.position.y += (d.vy as number) * dt;
        if (c.position.y <= 0) {
          c.position.y = 0;
          d.vy = 0;
          c.land();
          c.pose = 'idle';
        }
      } else moveAnim(p, (d.stun as number) > 0 ? 0 : move.length());

      if (c.position.y === 0) {
        const pit = this.hazards.find((h) => h.kind === 'pit' && c.position.z < h.z - 0.15 && c.position.z > h.z - PIT_LEN + 0.15);
        if (pit) {
          d.sink = 1.1;
          d.pitZ = pit.z;
          d.vy = 0;
          c.pose = 'jump';
          c.setExpression('surprised');
          this.game.audio.play('back');
          continue;
        }
      }

      if ((d.inv as number) <= 0) {
        for (const h of this.hazards) {
          if (h.kind === 'pit' || Math.abs(c.position.z - h.z) > 0.5) continue;
          const b = this.bladeAt(h, this.clock);
          const dx = c.position.x - b.x;
          const dy = c.position.y + 0.7 - b.y;
          const hit = h.kind === 'slide' ? c.position.y < 0.75 && Math.abs(dx) < BLADE_R + 0.3 : Math.hypot(dx, dy) < BLADE_R + 0.45;
          if (!hit) continue;
          d.stun = 1;
          d.inv = 1.6;
          kb.set(Math.sign(b.vx || dx) * 6, 0, 9);
          c.pose = 'sulk';
          c.setExpression('surprised');
          this.game.audio.play('boom');
          break;
        }
      }
      d.best = Math.max(d.best as number, Math.min(LENGTH, -c.position.z));
      if (c.position.z <= -LENGTH) crossed.push(p);
    }
    separate(
      this.players.filter((p) => (p.data.sink as number) <= 0),
      0.4,
    );
    this.renderScore();
    if (crossed.length) {
      for (const p of this.players) {
        const won = crossed.includes(p);
        p.character.pose = won ? 'cheer' : 'sulk';
        p.character.setExpression(won ? 'happy' : 'sad');
      }
      this.finish(crossed);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const h of this.hazards) {
      if (h.kind === 'pit') continue;
      const disc = h.blade.getObjectByName('disc')!;
      disc.rotation.z -= dt * 18;
    }
    // Dazed players blink.
    for (const p of this.players) p.character.visible = (p.data.inv as number) <= 0 || Math.floor(this.t * 14) % 2 === 0;
    // Frame the whole pack, leaning toward the leader.
    const zs = this.players.map((p) => p.character.position.z);
    const lead = Math.min(...zs);
    const trail = Math.max(...zs);
    const k = Math.min(1, dt * 3);
    this.camZ += ((lead * 0.6 + trail * 0.4) - this.camZ) * k;
    this.camSpread += (Math.min(18, trail - lead) - this.camSpread) * k;
    this.camera.position.set(0, 13 + this.camSpread * 0.4, this.camZ + 10 + this.camSpread * 0.45);
    this.camera.lookAt(0, 0, this.camZ - 4);
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => Math.round((p.data.best as number) * 4), 0);
  }
}

export const sawSprint: MinigameDef = {
  id: 'sawsprint',
  name: 'Saw Sprint',
  kind: 'ffa',
  duel: true,
  song: sawTheme,
  rules: 'Race to the finish! Jump the pits with A and time your dash past the swinging and sliding saws. Get clipped and you are knocked back. First across the line wins!',
  controls: 'Stick: run · A: jump',
  create: () => new SawSprint(),
};
