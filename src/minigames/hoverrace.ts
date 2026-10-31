import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, scorePanel, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const SAMPLES = 220;
/** Half the track's width; past this (plus a little) you drop into the sea. */
const HALF_W = 2.3;
const EDGE = HALF_W + 0.35;
const LAPS = 3;
const ACCEL = 22;
const GRIP = 2.2;
const MAX = 8.5;
const TURBO_MAX = 11.5;
const BOOST_MAX = 15;
const BOOST_TIME = 0.9;
const TURBO_DRAIN = 0.55;
const TURBO_FILL = 0.12;
const FALL_TIME = 1.3;
const RIDE_Y = 0.55;
const RIDER = 0.55;
/** Sample indices that carry a boost pad. */
const PADS = [30, 95, 150, 195];

/** Control points of the loop, laid out to fit the overhead camera. */
const COURSE = [
  [-14, 6.5],
  [-5, 8.5],
  [2, 4.5],
  [9, 7.5],
  [16, 4],
  [16, -4],
  [9, -8],
  [1, -6.5],
  [-6, -3.5],
  [-13, -7.5],
  [-18, -1],
];

/** Hover Race: synthy A minor drive with a rolling saw arpeggio. */
const hoverTheme: Song = {
  name: 'Hover Race',
  bpm: 150,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'square',
      volume: 0.14,
      pattern: [
        'A4 . . C5 . . E5 . D5 . C5 . B4 . G4 .',
        'A4 . . C5 . . E5 . G5 - - . E5 . D5 .',
        'F4 . . A4 . . C5 . E5 . D5 . C5 . A4 .',
        'G4 . . B4 . . D5 . E5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'saw',
      volume: 0.07,
      pattern: [
        'A3 C4 E4 A4 A3 C4 E4 A4 A3 C4 E4 A4 A3 C4 E4 A4',
        'A3 C4 E4 A4 A3 C4 E4 A4 A3 C4 E4 A4 A3 C4 E4 A4',
        'F3 A3 C4 F4 F3 A3 C4 F4 F3 A3 C4 F4 F3 A3 C4 F4',
        'G3 B3 D4 G4 G3 B3 D4 G4 E3 G#3 B3 E4 E3 G#3 B3 E4',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'A1 . A2 . A1 . A2 . A1 . A2 . A1 . A2 .',
        'A1 . A2 . A1 . A2 . A1 . A2 . G1 . G2 .',
        'F1 . F2 . F1 . F2 . F1 . F2 . F1 . F2 .',
        'G1 . G2 . G1 . G2 . E1 . E2 . E1 . E2 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: 'x . . . x . . . x . . . x . . .' },
    { instrument: 'snare', volume: 0.22, pattern: '. . . . x . . . . . . . x . . x' },
    { instrument: 'hat', volume: 0.08, pattern: '. . x . . . x . . . x . . . x .' },
  ],
};

interface Rider {
  board: THREE.Group;
  vel: THREE.Vector3;
  /** Nearest centerline sample. */
  idx: number;
  /** Samples travelled since the start line (negative on the grid). */
  prog: number;
  turbo: number;
  boost: number;
  /** Seconds left of falling into the sea before respawning. */
  out: number;
  /** Blink after a respawn; can't be bumped. */
  safe: number;
  done: boolean;
}

const wrap = (i: number) => ((i % SAMPLES) + SAMPLES) % SAMPLES;

/**
 * Three laps around a floating track on hoverboards. Stick steers, hold A for
 * turbo, and boost pads fling you forward. Slide off the edge and you splash
 * down and lose time. First across the line wins.
 */
class HoverRace extends Minigame {
  readonly timeLimit = 45;
  private pts: THREE.Vector3[] = [];
  private tan: THREE.Vector3[] = [];
  private riders = new Map<MinigamePlayer, Rider>();
  private pads: THREE.Mesh[] = [];
  private board!: HTMLDivElement;
  private lastHud = '';

  protected setup(): void {
    arenaBasics(this.scene, [0x7fb0ff, 0xffd6ec], 0x6fc4ea, -3);
    const curve = new THREE.CatmullRomCurve3(
      COURSE.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.pts = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
    this.tan = this.pts.map((_, i) => this.pts[wrap(i + 1)].clone().sub(this.pts[wrap(i - 1)]).normalize());
    this.buildTrack();

    // Everyone side by side just behind the start line.
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const back = 3;
      const idx = wrap(-back);
      const lane = (i - (n - 1) / 2) * 1.1;
      const pos = this.pts[idx].clone().addScaledVector(this.side(idx), lane);
      const board = this.makeBoard(p.character.def.colors.accent);
      board.position.copy(pos);
      this.scene.add(board);
      p.character.scale.setScalar(0.62);
      p.data.skill = 0.9 + this.game.rng.next() * 0.1;
      p.character.position.copy(pos).setY(RIDE_Y);
      p.character.rotation.y = Math.atan2(this.tan[idx].x, this.tan[idx].z);
      this.riders.set(p, { board, vel: new THREE.Vector3(), idx, prog: -back, turbo: 1, boost: 0, out: 0, safe: 0, done: false });
    });

    this.camera.position.set(0, 39, 16.5);
    this.camera.lookAt(0, 0, -3.2);
    this.board = scorePanel(this.overlay);
    this.renderHud();
  }

  /** Unit vector pointing to the left of the track at a sample. */
  private side(i: number): THREE.Vector3 {
    const t = this.tan[wrap(i)];
    return new THREE.Vector3(t.z, 0, -t.x);
  }

  private buildTrack(): void {
    // Road surface: a ribbon along the centerline.
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const p = this.pts[i];
      const s = this.side(i);
      pos.push(p.x + s.x * HALF_W, 0, p.z + s.z * HALF_W, p.x - s.x * HALF_W, 0, p.z - s.z * HALF_W);
      const a = i * 2;
      const b = wrap(i + 1) * 2;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const road = toonMesh(geo, Palette.lavender, { outline: false });
    (road.material as THREE.Material).side = THREE.DoubleSide;
    this.scene.add(road);

    // Underside so the track reads as a floating slab.
    const under = road.clone();
    under.material = new THREE.MeshBasicMaterial({ color: 0x8d78d8, side: THREE.DoubleSide });
    under.position.y = -0.35;
    this.scene.add(under);

    // Striped curbs on both edges.
    const curbGeo = new THREE.BoxGeometry(0.32, 0.22, 0.5);
    const curbs = new THREE.InstancedMesh(curbGeo, new THREE.MeshToonMaterial(), SAMPLES * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const white = new THREE.Color(Palette.cream);
    const pink = new THREE.Color(Palette.coral);
    for (let i = 0; i < SAMPLES; i++) {
      q.setFromAxisAngle(up, Math.atan2(this.tan[i].x, this.tan[i].z));
      for (const k of [1, -1]) {
        const at = this.pts[i].clone().addScaledVector(this.side(i), k * (HALF_W + 0.1)).setY(0.08);
        const n = i * 2 + (k > 0 ? 0 : 1);
        curbs.setMatrixAt(n, m.compose(at, q, new THREE.Vector3(1, 1, 1)));
        curbs.setColorAt(n, Math.floor(i / 3) % 2 ? white : pink);
      }
    }
    curbs.castShadow = true;
    this.scene.add(curbs);

    // Checkered start line.
    const s0 = this.side(0);
    for (let k = 0; k < 8; k++) {
      for (let r = 0; r < 2; r++) {
        const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.45), new THREE.MeshBasicMaterial({ color: (k + r) % 2 ? Palette.ink : Palette.cream }));
        sq.rotation.set(-Math.PI / 2, 0, Math.atan2(this.tan[0].x, this.tan[0].z));
        sq.position.copy(this.pts[0]).addScaledVector(s0, -HALF_W + 0.29 + k * 0.575).addScaledVector(this.tan[0], (r - 0.5) * 0.45).setY(0.02);
        this.scene.add(sq);
      }
    }
    // Gate posts over the start line.
    for (const k of [1, -1]) {
      const post = toonMesh(new THREE.CylinderGeometry(0.18, 0.18, 2.6, 10), Palette.cream, { outline: 0.03 });
      post.position.copy(this.pts[0]).addScaledVector(s0, k * (HALF_W + 0.4)).setY(1.3);
      this.scene.add(post);
    }
    const banner = toonMesh(new THREE.BoxGeometry(HALF_W * 2 + 1, 0.5, 0.12), Palette.yellow, { outline: 0.03 });
    banner.position.copy(this.pts[0]).setY(2.6);
    banner.rotation.y = Math.atan2(s0.x, s0.z) + Math.PI / 2;
    this.scene.add(banner);

    // Boost pads: glowing chevron strips.
    for (const i of PADS) {
      const pad = toonMesh(new THREE.BoxGeometry(HALF_W * 1.3, 0.06, 1.4), Palette.butter, { outline: false, emissive: 0x806010 });
      pad.position.copy(this.pts[i]).setY(0.04);
      pad.rotation.y = Math.atan2(this.tan[i].x, this.tan[i].z);
      for (const z of [-0.35, 0.25]) {
        const chev = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.45, 3), new THREE.MeshBasicMaterial({ color: Palette.coral }));
        chev.rotation.x = Math.PI / 2;
        chev.scale.set(1.6, 1, 0.25);
        chev.position.set(0, 0.06, z);
        pad.add(chev);
      }
      this.scene.add(pad);
      this.pads.push(pad);
    }

    // Floating buoys in the sea for scenery.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const buoy = toonMesh(new THREE.SphereGeometry(0.5, 14, 10), k % 2 ? Palette.coral : Palette.cream, { outline: 0.03 });
      buoy.position.set(Math.cos(a) * 23, -2.7, Math.sin(a) * 14);
      this.scene.add(buoy);
    }
  }

  private makeBoard(color: number): THREE.Group {
    const g = new THREE.Group();
    const deck = toonMesh(new THREE.CapsuleGeometry(0.3, 0.8, 6, 12), color, { outline: 0.03 });
    deck.rotation.x = Math.PI / 2;
    deck.scale.set(1, 1, 0.35);
    deck.position.y = 0.4;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.6 }));
    glow.rotation.x = -Math.PI / 2;
    glow.scale.set(0.8, 1.4, 1);
    glow.position.y = 0.03;
    g.add(deck, glow);
    return g;
  }

  /** Nearest centerline sample, searched around the last known one. */
  private nearest(pos: THREE.Vector3, from: number): number {
    let best = from;
    let bestD = Infinity;
    for (let k = -8; k <= 14; k++) {
      const i = wrap(from + k);
      const d = (this.pts[i].x - pos.x) ** 2 + (this.pts[i].z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private lateral(pos: THREE.Vector3, i: number): number {
    const p = this.pts[i];
    const s = this.side(i);
    return (pos.x - p.x) * s.x + (pos.z - p.z) * s.z;
  }

  /** CPUs chase a point ahead on their own lane and save turbo for straights. */
  private cpu(p: MinigamePlayer, r: Rider): { dir: THREE.Vector3; turbo: boolean } {
    const skill = p.data.skill as number;
    const speed = r.vel.length();
    const look = wrap(r.idx + 5 + Math.round(speed * 0.5));
    const pos = p.character.position;
    // Drift back toward the middle when near an edge; otherwise weave a little.
    const off = this.lateral(pos, r.idx);
    const lane = Math.abs(off) > HALF_W * 0.55 ? 0 : Math.sin(this.t * 0.7 + p.seat * 1.9) * 0.7;
    const target = this.pts[look].clone().addScaledVector(this.side(look), lane);
    const dir = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z).normalize();
    // Counter-thrust into bends so momentum doesn't carry them over the edge.
    const bend = 1 - this.tan[r.idx].dot(this.tan[wrap(r.idx + 14)]);
    const limit = MAX * (bend > 0.35 ? 0.6 : bend > 0.15 ? 0.78 : 1.2) * (0.95 + skill * 0.1);
    if (speed > limit) dir.addScaledVector(r.vel, -0.6 / speed).normalize();
    const straight = bend < 0.06;
    return { dir: dir.multiplyScalar(skill), turbo: straight && r.turbo > 0.25 };
  }

  play(dt: number): void {
    const finished: MinigamePlayer[] = [];
    for (const p of this.players) {
      const r = this.riders.get(p)!;
      const c = p.character;
      if (r.done) {
        r.vel.multiplyScalar(Math.exp(-3 * dt));
        c.position.addScaledVector(r.vel, dt);
        r.board.position.set(c.position.x, 0, c.position.z);
        continue;
      }
      if (r.out > 0) {
        r.out -= dt;
        r.vel.y -= 20 * dt;
        c.position.addScaledVector(r.vel, dt);
        r.board.position.copy(c.position).setY(c.position.y - RIDE_Y);
        if (r.out <= 0) this.respawn(p, r);
        continue;
      }
      r.safe = Math.max(0, r.safe - dt);
      r.boost = Math.max(0, r.boost - dt);

      let dir: THREE.Vector3;
      let turbo: boolean;
      if (p.controller) {
        dir = stick(p);
        turbo = p.controller.down('a');
      } else {
        ({ dir, turbo } = this.cpu(p, r));
      }
      turbo = turbo && r.turbo > 0;
      r.turbo = turbo ? Math.max(0, r.turbo - TURBO_DRAIN * dt) : Math.min(1, r.turbo + TURBO_FILL * dt);

      // Hoverboards slide: push toward the stick, bleed off velocity slowly.
      const cap = r.boost > 0 ? BOOST_MAX : turbo ? TURBO_MAX : MAX;
      r.vel.addScaledVector(dir, (turbo || r.boost > 0 ? ACCEL * 1.4 : ACCEL) * dt);
      r.vel.multiplyScalar(Math.exp(-GRIP * dt * (dir.lengthSq() > 0.01 ? 0.6 : 1)));
      const speed = r.vel.length();
      if (speed > cap) r.vel.multiplyScalar(Math.max(cap, speed - 30 * dt) / speed);
      c.position.addScaledVector(r.vel, dt);

      const prev = r.idx;
      r.idx = this.nearest(c.position, r.idx);
      let delta = r.idx - prev;
      if (delta > SAMPLES / 2) delta -= SAMPLES;
      if (delta < -SAMPLES / 2) delta += SAMPLES;
      r.prog += delta;

      for (const i of PADS) {
        const d = c.position.distanceTo(this.pts[i].clone().setY(c.position.y));
        if (d < 1.2 && r.boost < BOOST_TIME - 0.3) {
          r.boost = BOOST_TIME;
          r.vel.copy(this.tan[i]).multiplyScalar(BOOST_MAX);
          this.game.audio.note('saw', 'E6', 0.12, 0.12);
          this.game.audio.note('saw', 'A6', 0.18, 0.1);
        }
      }

      if (Math.abs(this.lateral(c.position, r.idx)) > EDGE) {
        r.out = FALL_TIME;
        r.vel.y = 3;
        c.setExpression('surprised');
        c.pose = 'jump';
        this.game.audio.play('back');
        continue;
      }

      if (r.prog >= LAPS * SAMPLES) {
        r.done = true;
        finished.push(p);
      } else if (Math.floor(r.prog / SAMPLES) > Math.floor((r.prog - delta) / SAMPLES) && r.prog > 0) {
        this.game.audio.play('coin');
      }

      face(p, speed > 0.5 ? r.vel : dir, dt);
      c.pose = 'idle';
      // Lean into the turn a little.
      c.rotation.z = THREE.MathUtils.clamp(-r.vel.clone().cross(dir).y * 0.04, -0.3, 0.3);
    }

    this.bump();

    for (const p of this.players) {
      const r = this.riders.get(p)!;
      if (r.out > 0) continue;
      const c = p.character;
      r.board.position.set(c.position.x, 0, c.position.z);
      r.board.rotation.y = c.rotation.y;
      c.visible = r.safe <= 0 || Math.floor(r.safe * 12) % 2 === 0;
      r.board.visible = c.visible;
    }

    this.renderHud();
    if (finished.length) {
      this.game.audio.play('star');
      this.finish(finished);
    }
  }

  /** Riders who touch bounce apart; a fast hit can shove someone off the edge. */
  private bump(): void {
    const live = this.players.filter((p) => {
      const r = this.riders.get(p)!;
      return r.out <= 0 && !r.done;
    });
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = this.riders.get(live[i])!;
        const b = this.riders.get(live[j])!;
        if (a.safe > 0 || b.safe > 0) continue;
        const pa = live[i].character.position;
        const pb = live[j].character.position;
        const n = new THREE.Vector3(pb.x - pa.x, 0, pb.z - pa.z);
        const d = n.length();
        if (d === 0 || d > RIDER * 2) continue;
        n.divideScalar(d);
        pa.addScaledVector(n, -(RIDER * 2 - d) / 2);
        pb.addScaledVector(n, (RIDER * 2 - d) / 2);
        const rel = a.vel.clone().sub(b.vel).dot(n);
        if (rel > 0) {
          const impulse = rel * 0.8 + 1;
          a.vel.addScaledVector(n, -impulse);
          b.vel.addScaledVector(n, impulse);
          this.game.audio.play('jump');
        }
      }
    }
  }

  private respawn(p: MinigamePlayer, r: Rider): void {
    const c = p.character;
    const i = wrap(r.idx - 2);
    c.position.copy(this.pts[i]).setY(RIDE_Y);
    c.rotation.set(0, Math.atan2(this.tan[i].x, this.tan[i].z), 0);
    c.setExpression('happy');
    r.prog -= wrap(r.idx - i);
    r.idx = i;
    r.vel.set(0, 0, 0);
    r.safe = 1.2;
  }

  private renderHud(): void {
    const html = this.players
      .map((p) => {
        const r = this.riders.get(p)!;
        const lap = Math.min(LAPS, Math.max(1, Math.floor(r.prog / SAMPLES) + 1));
        const label = r.done ? '🏁' : `Lap ${lap}/${LAPS}`;
        const bar = '▮'.repeat(Math.round(r.turbo * 5)).padEnd(5, '▯');
        return `<span style="color:${css(p.character.def.colors.accent)}">${label} <small>${bar}</small></span>`;
      })
      .join('');
    if (html !== this.lastHud) {
      this.board.innerHTML = html;
      this.lastHud = html;
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    // Bob on the hover cushion; pads pulse.
    for (const p of this.players) {
      const r = this.riders.get(p)!;
      if (r.out > 0) continue;
      const bob = Math.sin(this.t * 6 + p.seat * 1.3) * 0.06;
      r.board.position.y = bob;
      p.character.position.y = RIDE_Y + bob;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8);
    for (const pad of this.pads) (pad.material as THREE.MeshToonMaterial).emissive.setRGB(0.5 * pulse, 0.38 * pulse, 0.05);
  }

  timeout(): number[] {
    // Whoever is furthest along wins.
    const prog = (p: MinigamePlayer) => this.riders.get(p)!.prog;
    const best = Math.max(...this.players.map(prog));
    return this.players.filter((p) => prog(p) === best).map((p) => p.seat);
  }
}

export const hoverRace: MinigameDef = {
  id: 'hoverrace',
  name: 'Hover Race',
  kind: 'ffa',
  duel: true,
  song: hoverTheme,
  rules: 'Three laps on hoverboards! Hit boost pads, save turbo for the straights and don’t slide off the edge. First across the line wins.',
  controls: 'Stick: steer · Hold A: turbo',
  create: () => new HoverRace(),
};
