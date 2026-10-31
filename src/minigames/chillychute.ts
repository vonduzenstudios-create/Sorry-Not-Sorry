import * as THREE from 'three';
import { chuteTheme } from '../audio/songs/sledTank';
import { css, Palette } from '../render/palette';
import { addLights, skyDome } from '../render/environment';
import { toon, toonMesh } from '../render/toon';
import { scorePanel } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Track length to the finish line, plus a run-out past it. */
const FINISH = 380;
const RUNOUT = 60;
/** Course as [length, curvature]; positive curvature bends left. */
const COURSE: [number, number][] = [
  [25, 0],
  [35, 1 / 24],
  [10, 0],
  [45, -1 / 22],
  [15, 0],
  [30, 1 / 20],
  [30, -1 / 20],
  [20, 0],
  [40, 1 / 26],
  [15, 0],
  [35, -1 / 24],
  [25, 1 / 22],
  [20, 0],
  [25, -1 / 22],
  [RUNOUT + 10, 0],
];
const SLOPE = 0.14;
/** Lane centers either side of the divider, and half the room in each. */
const LANE = 1.75;
const ROOM = 1.05;
const ACCEL = 6.2;
const DRAG = 0.26;
/** How hard curves fling a sled outward, and how hard leaning pulls back. */
const CF = 0.36;
const LEAN = 14;
const SWAY_DAMP = 3;
const BOOST = 4.5;
const BOOST_CD = 2.5;
/** Two A presses this close together count as one push. */
const SYNC = 0.25;

interface Sled {
  team: number;
  crew: MinigamePlayer[];
  group: THREE.Group;
  s: number;
  v: number;
  /** Sideways offset from the lane center, positive to the left. */
  lat: number;
  latV: number;
  latA: number;
  boostCd: number;
  hitCd: number;
}

/** Track centerline sampled every unit: position, heading and curvature. */
class Course {
  readonly x: number[] = [];
  readonly z: number[] = [];
  readonly heading: number[] = [];
  readonly curve: number[] = [];

  constructor() {
    const raw: number[] = [];
    for (const [len, k] of COURSE) for (let i = 0; i < len; i++) raw.push(k);
    // Ease in and out of every bend so the push builds up instead of snapping.
    const W = 5;
    for (let i = 0; i < raw.length; i++) {
      let sum = 0;
      for (let j = -W; j <= W; j++) sum += raw[THREE.MathUtils.clamp(i + j, 0, raw.length - 1)];
      this.curve.push(sum / (W * 2 + 1));
    }
    let x = 0;
    let z = 0;
    let h = 0;
    for (let i = 0; i < this.curve.length; i++) {
      this.x.push(x);
      this.z.push(z);
      this.heading.push(h);
      x += Math.sin(h);
      z -= Math.cos(h);
      h -= this.curve[i];
    }
  }

  private lerp(arr: number[], s: number): number {
    const c = THREE.MathUtils.clamp(s, 0, arr.length - 1.001);
    const i = Math.floor(c);
    return arr[i] + (arr[i + 1] - arr[i]) * (c - i);
  }

  curveAt(s: number): number {
    return this.lerp(this.curve, s);
  }

  headingAt(s: number): number {
    return this.lerp(this.heading, s);
  }

  /** World point `off` to the left of the centerline at distance `s`, `up` above the ice. */
  point(s: number, off = 0, up = 0, out = new THREE.Vector3()): THREE.Vector3 {
    const h = this.headingAt(s);
    // Before the start the line carries straight on uphill (camera room).
    const back = Math.min(0, s);
    return out.set(
      this.lerp(this.x, s) - Math.cos(h) * off + Math.sin(h) * back,
      -s * SLOPE + up,
      this.lerp(this.z, s) - Math.sin(h) * off - Math.cos(h) * back,
    );
  }

  get length(): number {
    return this.curve.length - 1;
  }
}

/**
 * 2 vs 2 bobsled race down an icy chute. Both teammates steer by leaning, and
 * the sled only follows the average: one rider leaning alone can't hold a
 * bend. Bang the walls and you lose speed. Press A together for a push.
 */
class ChillyChute extends Minigame {
  readonly timeLimit = 45;
  private course = new Course();
  private sleds: Sled[] = [];
  private clock = 0;
  private board!: HTMLDivElement;
  private sun!: THREE.DirectionalLight;
  private sky!: THREE.Mesh;
  private teamColors: number[] = [];
  private camAt = new THREE.Vector3();
  private camLook = new THREE.Vector3();

  protected setup(): void {
    this.sky = skyDome(0x9fd0ff, 0xf4f0ff);
    this.scene.add(this.sky);
    this.sun = addLights(this.scene);
    this.scene.add(this.sun.target);
    this.camera.far = 600;
    this.buildTrack();

    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      const crew = this.players.filter((p) => p.team === team);
      const group = this.buildSled(this.teamColors[team]);
      crew.forEach((p, i) => {
        p.data.stick = 0;
        p.data.aT = -99;
        // CPU riders: how far ahead they read the track and how twitchy they are.
        p.data.look = 0.12 + this.game.rng.next() * 0.3;
        p.data.resp = 5 + this.game.rng.next() * 6;
        p.data.wob = 1.5 + this.game.rng.next() * 2;
        p.data.slack = 0.15 + this.game.rng.next() * 0.25;
        p.data.react = 0.08 + this.game.rng.next() * 0.26;
        const c = p.character;
        c.scale.setScalar(0.72);
        c.position.set(0, 0.12, i === 0 ? 0.45 : -0.5);
        c.rotation.set(0, 0, 0);
        c.pose = 'idle';
        c.setExpression('determined');
        group.add(c);
      });
      this.scene.add(group);
      this.sleds.push({ team, crew, group, s: 2, v: 0, lat: 0, latV: 0, latA: 0, boostCd: 0, hitCd: 0 });
    }
    this.placeSleds();
    this.followCamera(1);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  /** Ribbon along the course between two (offset, height) edges. */
  private strip(offA: number, upA: number, offB: number, upB: number, color: number, from = 0, to = this.course.length): THREE.Mesh {
    const pos: number[] = [];
    const idx: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let n = 0;
    for (let s = from; s <= to; s += 1) {
      this.course.point(s, offA, upA, a);
      this.course.point(s, offB, upB, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (n > 0) {
        const i = n * 2;
        idx.push(i - 2, i - 1, i, i - 1, i + 1, i);
      }
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, toon(color));
    (mesh.material as THREE.Material).side = THREE.DoubleSide;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private buildTrack(): void {
    const edge = LANE + ROOM + 0.45;
    // Ice floor, the walls either side, and the divider down the middle.
    this.strip(-edge, 0, edge, 0, 0xdff6ff);
    for (const side of [-1, 1]) {
      this.strip(side * edge, 0, side * edge, 0.9, 0x9fd4ff);
      this.strip(side * edge, 0.9, side * (edge + 0.4), 0.9, Palette.cream);
      this.strip(side * (edge + 0.4), 0.9, side * (edge + 0.4), -0.3, 0x9fd4ff);
      this.strip(side * 0.22, 0, side * 0.22, 0.55, Palette.cream);
      // Snowy shoulders the chute is carved into.
      this.strip(side * (edge + 0.4), -0.3, side * 15, -1.2, 0xf6f8ff);
    }
    this.strip(-0.22, 0.55, 0.22, 0.55, 0xc8e6ff);
    const valley = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0xe6e8ff }));
    valley.rotation.x = -Math.PI / 2;
    valley.position.set(0, -75, -150);
    this.scene.add(valley);

    // Pines along the shoulders, placed by a fixed hash so every peer agrees.
    const spots: THREE.Vector3[] = [];
    for (let s = 4; s < this.course.length; s += 3.5) {
      const h = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
      const side = Math.floor(s / 3.5) % 2 ? 1 : -1;
      spots.push(this.course.point(s, side * (edge + 2.2 + h * 9), -0.6 - h * 0.6));
    }
    const dummy = new THREE.Object3D();
    const tiers = [
      { geo: new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6), color: 0x8a6040, y: 0.4, scale: 1 },
      { geo: new THREE.ConeGeometry(1.1, 1.8, 8), color: 0x5fb08a, y: 1.4, scale: 1 },
      { geo: new THREE.ConeGeometry(0.8, 1.4, 8), color: 0x6cc39a, y: 2.2, scale: 1 },
      { geo: new THREE.ConeGeometry(0.45, 0.6, 8), color: Palette.cream, y: 2.85, scale: 1 },
    ];
    for (const tier of tiers) {
      const inst = new THREE.InstancedMesh(tier.geo, toon(tier.color), spots.length);
      inst.castShadow = true;
      spots.forEach((p, i) => {
        const k = 0.8 + (i % 4) * 0.15;
        dummy.position.set(p.x, p.y + tier.y * k, p.z);
        dummy.scale.setScalar(k);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      this.scene.add(inst);
    }

    // Start gate, finish arch and distance flags.
    for (const [s, color] of [
      [0, Palette.cream],
      [FINISH, Palette.coral],
    ] as const) {
      const h = this.course.headingAt(s);
      const arch = new THREE.Group();
      for (const side of [-1, 1]) {
        const post = toonMesh(new THREE.CylinderGeometry(0.15, 0.15, 3.6, 10), Palette.ink, { outline: false });
        post.position.set(side * (edge + 0.2), 1.8, 0);
        arch.add(post);
      }
      const banner = toonMesh(new THREE.BoxGeometry(edge * 2 + 0.8, 0.7, 0.12), color, { outline: 0.03 });
      banner.position.y = 3.4;
      arch.add(banner);
      if (s === FINISH) {
        for (let i = 0; i < 8; i++) {
          const check = new THREE.Mesh(new THREE.PlaneGeometry(edge / 4, 0.6), new THREE.MeshBasicMaterial({ color: i % 2 ? Palette.ink : Palette.cream }));
          check.rotation.x = -Math.PI / 2;
          check.position.set(-edge + (i + 0.5) * (edge / 4), 0.02, 0);
          arch.add(check);
        }
      }
      arch.position.copy(this.course.point(s));
      arch.rotation.y = -h;
      this.scene.add(arch);
    }
    for (let s = 40; s < FINISH; s += 40) {
      for (const side of [-1, 1]) {
        const flag = toonMesh(new THREE.ConeGeometry(0.22, 0.6, 3), side > 0 ? Palette.coral : Palette.violet, { outline: 0.02 });
        flag.position.copy(this.course.point(s, side * (edge + 0.2), 1.3));
        this.scene.add(flag);
      }
    }
  }

  private buildSled(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = toonMesh(new THREE.BoxGeometry(0.95, 0.45, 2.1), color, { outline: 0.03 });
    body.position.y = 0.3;
    const nose = toonMesh(new THREE.SphereGeometry(0.48, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), color, { outline: 0.03 });
    nose.rotation.x = Math.PI / 2;
    nose.scale.set(1, 1.3, 0.48);
    nose.position.set(0, 0.3, 1.05);
    const stripe = toonMesh(new THREE.BoxGeometry(0.97, 0.1, 2.12), Palette.cream, { outline: false });
    stripe.position.y = 0.38;
    g.add(body, nose, stripe);
    for (const side of [-1, 1]) {
      const runner = toonMesh(new THREE.BoxGeometry(0.08, 0.08, 2.3), Palette.ink, { outline: false });
      runner.position.set(side * 0.35, 0.04, 0.05);
      g.add(runner);
    }
    g.rotation.order = 'YXZ';
    return g;
  }

  private placeSleds(): void {
    for (const sl of this.sleds) {
      const off = (sl.team === 0 ? LANE : -LANE) + sl.lat;
      this.course.point(sl.s, off, 0, sl.group.position);
      const h = this.course.headingAt(sl.s);
      sl.group.rotation.set(Math.atan(SLOPE), Math.atan2(Math.sin(h), -Math.cos(h)), THREE.MathUtils.clamp(-sl.latA * 0.012, -0.25, 0.25));
    }
  }

  private followCamera(k: number): void {
    const [a, b] = this.sleds;
    const mid = (a.s + b.s) / 2;
    const gap = Math.abs(a.s - b.s);
    const back = 9 + Math.min(gap, 40) * 0.4;
    const at = this.course.point(mid - back, 0, 5 + Math.min(gap, 40) * 0.3);
    const look = this.course.point(mid + 5 + gap * 0.25, 0, 0.5);
    this.camAt.lerp(at, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camAt);
    this.camera.lookAt(this.camLook);
    this.sky.position.copy(this.camAt);
    this.course.point(mid, 0, 0, this.sun.target.position);
    this.sun.position.copy(this.sun.target.position).add(new THREE.Vector3(8, 14, 6));
  }

  private renderScore(): void {
    this.board.innerHTML = this.sleds
      .map((sl) => {
        const pct = Math.min(100, Math.round((sl.s / FINISH) * 100));
        const ready = sl.boostCd <= 0 ? ' ⚡' : '';
        return `<span style="color:${css(this.teamColors[sl.team])}">● ${pct}%${ready}</span>`;
      })
      .join('');
  }

  /** CPU rider: lean to cancel the bend coming up and drift back to the middle. */
  private cpuLean(p: MinigamePlayer, sl: Sled, dt: number): number {
    const k = this.course.curveAt(sl.s + sl.v * (p.data.look as number));
    const push = -sl.v * sl.v * k * CF;
    const want = -7 * sl.lat - 2.4 * sl.latV;
    // Every so often a rider's focus drifts: some stretches they lean hard, some half-heartedly.
    if (this.clock >= ((p.data.refocus as number) ?? 0)) {
      p.data.focus = 0.35 + this.game.rng.next() * 0.7;
      p.data.refocus = this.clock + 0.8 + this.game.rng.next() * 1.6;
    }
    let lean = ((push - want) / LEAN) * (p.data.focus as number);
    // Sloppy riders ease off when they're nearly on line.
    if (Math.abs(lean) < (p.data.slack as number)) lean *= 0.4;
    lean += Math.sin(this.clock * (p.data.wob as number) + p.seat * 1.7) * 0.3;
    const stick = (p.data.stick as number) + (THREE.MathUtils.clamp(lean, -1, 1) - (p.data.stick as number)) * Math.min(1, dt * (p.data.resp as number));
    p.data.stick = stick;
    return stick;
  }

  /** CPU push: lead when the bend ahead is gentle, or answer a teammate's press. */
  private cpuPush(p: MinigamePlayer, sl: Sled): boolean {
    if (sl.boostCd > 0) return false;
    const mate = sl.crew.find((o) => o !== p)!;
    const since = this.clock - (mate.data.aT as number);
    // Answer a teammate's push after a human-ish reaction time; slow ones miss it.
    if (since > (p.data.react as number) && since < (p.data.react as number) + 1 / 30) {
      p.data.react = 0.08 + this.game.rng.next() * 0.26;
      return true;
    }
    if (mate.controller || sl.crew[0] !== p) return false;
    const ahead = Math.abs(this.course.curveAt(sl.s + sl.v * 0.6));
    return ahead < 0.01 && Math.abs(sl.lat) < 0.5 && this.game.rng.next() < 0.03;
  }

  play(dt: number): void {
    this.clock += dt;
    for (const sl of this.sleds) {
      let lean = 0;
      for (const p of sl.crew) {
        const stick = p.controller ? THREE.MathUtils.clamp(p.controller.stickX, -1, 1) : this.cpuLean(p, sl, dt);
        p.data.lean = stick;
        lean += stick / sl.crew.length;
        const pushed = p.controller ? p.controller.pressed('a') : this.cpuPush(p, sl);
        if (pushed) {
          const mate = sl.crew.find((o) => o !== p);
          if (sl.boostCd <= 0 && mate && this.clock - (mate.data.aT as number) < SYNC) {
            sl.v += BOOST;
            sl.boostCd = BOOST_CD;
            mate.data.aT = -99;
            p.data.aT = -99;
            this.game.audio.play('pop');
          } else p.data.aT = this.clock;
        }
      }
      sl.boostCd = Math.max(0, sl.boostCd - dt);
      sl.hitCd = Math.max(0, sl.hitCd - dt);
      sl.v += (ACCEL - DRAG * sl.v) * dt;

      const k = this.course.curveAt(sl.s);
      sl.latA = -sl.v * sl.v * k * CF - lean * LEAN;
      sl.latV += sl.latA * dt;
      sl.latV *= Math.exp(-SWAY_DAMP * dt);
      sl.lat += sl.latV * dt;
      if (Math.abs(sl.lat) > ROOM) {
        sl.lat = Math.sign(sl.lat) * ROOM;
        if (sl.hitCd <= 0 && Math.abs(sl.latV) > 0.4) {
          sl.v *= 0.72;
          sl.hitCd = 0.35;
          this.game.audio.play('jump');
          for (const p of sl.crew) p.character.setExpression('surprised');
        }
        sl.latV *= -0.3;
      } else if (sl.hitCd <= 0) for (const p of sl.crew) p.character.setExpression('determined');
      sl.s += sl.v * dt;
    }
    this.placeSleds();
    this.followCamera(Math.min(1, dt * 5));
    this.renderScore();

    const done = this.sleds.filter((sl) => sl.s >= FINISH).sort((a, b) => b.s - a.s);
    if (done.length) {
      const team = done[0].team;
      for (const p of this.players) {
        p.character.pose = p.team === team ? 'cheer' : 'sulk';
        p.character.setExpression(p.team === team ? 'happy' : 'sad');
      }
      this.game.audio.play('star');
      this.finish(this.players.filter((p) => p.team === team));
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const sl of this.sleds) {
      for (const p of sl.crew) {
        const c = p.character;
        // Riders tip into their own lean, so you can see who isn't helping.
        c.rotation.z += ((((p.data.lean as number) ?? 0) * 0.45) - c.rotation.z) * Math.min(1, dt * 10);
      }
    }
    // Sleds coast through the run-out once the race is called.
    if (this.winners) {
      for (const sl of this.sleds) {
        sl.v *= Math.exp(-1.2 * dt);
        sl.s = Math.min(this.course.length - 2, sl.s + sl.v * dt);
        sl.latA = 0;
      }
      this.placeSleds();
      this.followCamera(Math.min(1, dt * 3));
    }
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return this.sleds.find((s) => s.team === p.team)!.s;
  }

  timeout(): number[] {
    const [a, b] = this.sleds;
    if (Math.abs(a.s - b.s) < 0.5) return [];
    const team = a.s > b.s ? a.team : b.team;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const chillyChute: MinigameDef = {
  id: 'chillychute',
  name: 'Chilly Chute',
  kind: '2v2',
  song: chuteTheme,
  rules: 'Race your bobsled down the icy chute. The sled follows both riders\' lean, so lean into the bends together or slam the walls! Press A at the same time for a push.',
  controls: 'Stick: lean · A: push (together!)',
  create: () => new ChillyChute(),
};
