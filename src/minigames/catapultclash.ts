import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { moveAnim, scorePanel } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Castle front walls sit this far out on X; team 0 on the left (-X). */
const CASTLE_X = 10.5;
const CATAPULT_X = 5.5;
const CATAPULT_Z = [-2.6, 2.6];
const COLUMNS_Z = [-4, -2, 0, 2, 4];
const LEVELS = 4;
const BLOCK = 1.6;
const LAUNCH_Y = 1.6;
const ELEVATION = (50 * Math.PI) / 180;
const GRAVITY = 16;
const MIN_SPEED = 8;
const MAX_SPEED = 20;
/** Seconds for the power meter to fill once; holding longer swings it back down. */
const CHARGE_HALF = 0.9;
const AIM_RATE = 1.1;
const AIM_MAX = 0.75;
const RELOAD = 1;
const BOULDER_R = 0.42;
const TEAM_COLORS = [Palette.coral, Palette.violet];
const ARC_DOTS = 14;

interface Block {
  mesh: THREE.Mesh;
  team: number;
  column: number;
}

interface Boulder {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  team: number;
}

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

interface Crew {
  p: MinigamePlayer;
  /** +1 fires toward +X (team 0), -1 toward -X. */
  side: number;
  pos: THREE.Vector3;
  /** Yaw away from straight ahead; positive aims toward +Z. */
  aim: number;
  /** Seconds A has been held, or -1 when not winding up. */
  charge: number;
  reload: number;
  rig: THREE.Group;
  arm: THREE.Group;
  loaded: THREE.Mesh;
  arc: THREE.Mesh[];
  /** CPU plan for the current shot. */
  plan: { aim: number; power: number } | null;
}

/** Power meter: rises 0 to 1 over CHARGE_HALF, then falls back, and repeats. */
function powerAt(charge: number): number {
  const t = (charge / CHARGE_HALF) % 2;
  return t < 1 ? t : 2 - t;
}

function speedFor(power: number): number {
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power;
}

/**
 * 2 vs 2. Each team mans two catapults in front of its castle. Aim, wind up
 * and fling boulders across the field to knock blocks out of the other
 * team's castle. Flatten it first to win.
 */
class CatapultClash extends Minigame {
  readonly timeLimit = 45;
  private crews: Crew[] = [];
  /** columns[team][column] = blocks bottom to top. */
  private columns: Block[][][] = [[], []];
  private flags: THREE.Group[][] = [[], []];
  private boulders: Boulder[] = [];
  private debris: Debris[] = [];
  private board!: HTMLDivElement;
  private shots = 0;

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xfff1d6], 0x7cc8ec, -2);
    const field = toonMesh(new THREE.BoxGeometry(CASTLE_X * 2 + 10, 2, 16), Palette.grass, { outline: 0.05 });
    field.position.y = -1;
    this.scene.add(field);
    // A dirt path down the middle and a row of hay bales as the halfway line.
    const path = new THREE.Mesh(new THREE.PlaneGeometry(CASTLE_X * 2, 2.2), new THREE.MeshBasicMaterial({ color: 0xe9cf98 }));
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.01;
    this.scene.add(path);
    const hayGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12);
    for (let z = -6; z <= 6; z += 2) {
      const hay = toonMesh(hayGeo, Palette.butter, { outline: 0.03 });
      hay.rotation.x = Math.PI / 2;
      hay.position.set(0, 0.45, z);
      this.scene.add(hay);
    }

    const blockGeo = new THREE.BoxGeometry(BLOCK * 0.98, BLOCK * 0.98, BLOCK * 0.98);
    for (const team of [0, 1]) {
      const side = team === 0 ? -1 : 1;
      const stone = team === 0 ? 0xf3d9c8 : 0xdcd4f2;
      const roof = TEAM_COLORS[team];
      COLUMNS_Z.forEach((z, ci) => {
        const col: Block[] = [];
        for (let lv = 0; lv < LEVELS; lv++) {
          const mesh = toonMesh(blockGeo, (lv + ci) % 2 ? stone : new THREE.Color(stone).multiplyScalar(0.92).getHex(), { outline: 0.03 });
          mesh.position.set(side * (CASTLE_X + BLOCK / 2), lv * BLOCK + BLOCK / 2, z);
          this.scene.add(mesh);
          col.push({ mesh, team, column: ci });
        }
        this.columns[team].push(col);
        // A pennant rides the top of each column and drops with it.
        const flag = new THREE.Group();
        const pole = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), Palette.ink, { outline: false });
        pole.position.y = 0.55;
        const cloth = toonMesh(new THREE.ConeGeometry(0.28, 0.6, 3), roof, { outline: 0.02 });
        cloth.rotation.z = -side * Math.PI / 2;
        cloth.position.set(-side * 0.3, 0.85, 0);
        flag.add(pole, cloth);
        if (ci === 2) {
          const crown = toonMesh(new THREE.ConeGeometry(0.55, 0.7, 4), roof, { outline: 0.03 });
          crown.position.y = 0.35;
          crown.rotation.y = Math.PI / 4;
          flag.add(crown);
          pole.position.y = 1.1;
          cloth.position.y = 1.4;
        }
        this.scene.add(flag);
        this.flags[team].push(flag);
      });
      // Back wall decoration so the castle reads as a castle.
      const keep = toonMesh(new THREE.BoxGeometry(2, BLOCK * 2.2, 11), new THREE.Color(stone).multiplyScalar(0.8).getHex(), { outline: 0.04 });
      keep.position.set(side * (CASTLE_X + BLOCK + 1.6), BLOCK * 1.1, 0);
      this.scene.add(keep);
    }

    for (const team of [0, 1]) {
      const side = team === 0 ? 1 : -1;
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => this.crews.push(this.makeCrew(p, side, i)));
    }
    this.placeFlags();

    this.camera.position.set(0, 19, 23.5);
    this.camera.lookAt(0, 1.6, 0.5);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private makeCrew(p: MinigamePlayer, side: number, i: number): Crew {
    const pos = new THREE.Vector3(-side * CATAPULT_X, 0, CATAPULT_Z[i]);
    const rig = new THREE.Group();
    const wood = 0xc8915a;
    const base = toonMesh(new THREE.BoxGeometry(1, 0.3, 1.6), wood, { outline: 0.03 });
    base.position.y = 0.45;
    rig.add(base);
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.14, 12);
    for (const wx of [-0.58, 0.58]) {
      for (const wz of [-0.55, 0.55]) {
        const wheel = toonMesh(wheelGeo, 0x8a5a36, { outline: 0.02 });
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.32, wz);
        rig.add(wheel);
      }
    }
    for (const ux of [-0.4, 0.4]) {
      const upright = toonMesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), wood, { outline: 0.02 });
      upright.position.set(ux, 1, 0.1);
      rig.add(upright);
    }
    // The throwing arm pivots on the crossbar; local +Z is the throw direction.
    const arm = new THREE.Group();
    arm.position.set(0, 1.35, 0.1);
    const beam = toonMesh(new THREE.BoxGeometry(0.16, 0.16, 1.9), 0xa8743f, { outline: 0.02 });
    beam.position.z = -0.75;
    const cup = toonMesh(new THREE.CylinderGeometry(0.34, 0.22, 0.22, 10), 0x8a5a36, { outline: 0.02 });
    cup.position.set(0, 0.12, -1.6);
    const loaded = toonMesh(new THREE.DodecahedronGeometry(BOULDER_R * 0.85), 0x9a958c, { outline: 0.02 });
    loaded.position.set(0, 0.4, -1.6);
    arm.add(beam, cup, loaded);
    rig.add(arm);
    rig.position.copy(pos);
    this.scene.add(rig);

    const accent = p.character.def.colors.accent;
    const dotGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const arc: THREE.Mesh[] = [];
    for (let k = 0; k < ARC_DOTS; k++) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85 }));
      dot.visible = false;
      this.scene.add(dot);
      arc.push(dot);
    }
    p.data.role = i;
    const crew: Crew = { p, side, pos, aim: -Math.sign(CATAPULT_Z[i]) * 0.1, charge: -1, reload: 0.4, rig, arm, loaded, arc, plan: null };
    this.placeCrew(crew);
    return crew;
  }

  private dir(c: Crew): THREE.Vector3 {
    return new THREE.Vector3(c.side * Math.cos(c.aim), 0, Math.sin(c.aim));
  }

  private placeCrew(c: Crew): void {
    const d = this.dir(c);
    c.rig.rotation.y = Math.atan2(d.x, d.z);
    // Crew member stands beside the catapult, a little behind it.
    const right = new THREE.Vector3(-d.z, 0, d.x);
    const ch = c.p.character;
    ch.position.copy(c.pos).addScaledVector(d, -0.6).addScaledVector(right, (c.pos.z < 0 ? -1 : 1) * 1.1);
    ch.rotation.y = Math.atan2(d.x, d.z);
  }

  private blocksLeft(team: number): number {
    return this.columns[team].reduce((n, col) => n + col.length, 0);
  }

  private renderScore(): void {
    const total = COLUMNS_Z.length * LEVELS;
    this.board.innerHTML = [0, 1]
      .map((t) => {
        const pct = Math.round((this.blocksLeft(t) / total) * 100);
        return `<span style="color:${css(TEAM_COLORS[t])}">🏰 ${pct}%</span>`;
      })
      .join('<span>vs</span>');
  }

  private placeFlags(): void {
    for (const team of [0, 1]) {
      this.columns[team].forEach((col, ci) => {
        const flag = this.flags[team][ci];
        const top = col.length ? col[col.length - 1].mesh.position.y + BLOCK / 2 : 0;
        flag.position.set((team === 0 ? -1 : 1) * (CASTLE_X + BLOCK / 2), top, COLUMNS_Z[ci]);
        flag.visible = col.length > 0;
      });
    }
  }

  private launchVelocity(c: Crew, power: number): THREE.Vector3 {
    const v = speedFor(power);
    return this.dir(c).multiplyScalar(v * Math.cos(ELEVATION)).setY(v * Math.sin(ELEVATION));
  }

  private fire(c: Crew, power: number): void {
    const mesh = toonMesh(new THREE.DodecahedronGeometry(BOULDER_R), 0x9a958c, { outline: 0.03 });
    mesh.position.copy(c.pos).setY(LAUNCH_Y);
    this.scene.add(mesh);
    this.boulders.push({ mesh, vel: this.launchVelocity(c, power), team: c.p.team });
    c.reload = RELOAD;
    c.charge = -1;
    c.plan = null;
    c.loaded.visible = false;
    c.arm.rotation.x = 2.1;
    c.p.character.pose = 'jump';
    for (const dot of c.arc) dot.visible = false;
    this.game.audio.play('jump');
  }

  /** Shows the predicted flight path while a human winds up. */
  private drawArc(c: Crew, power: number): void {
    const vel = this.launchVelocity(c, power);
    const pos = c.pos.clone().setY(LAUNCH_Y);
    const step = 0.09;
    for (let k = 0; k < ARC_DOTS; k++) {
      const t = (k + 1) * step * 1.4;
      const dot = c.arc[k];
      dot.position.set(pos.x + vel.x * t, pos.y + vel.y * t - 0.5 * GRAVITY * t * t, pos.z + vel.z * t);
      dot.visible = dot.position.y > 0;
    }
  }

  /** CPU: pick the tallest column (spread out by role), work out the shot, then fumble it a little. */
  private planShot(c: Crew): { aim: number; power: number } | null {
    const enemy = 1 - c.p.team;
    const cols = this.columns[enemy];
    const role = c.p.data.role as number;
    let best = -1;
    let score = -Infinity;
    cols.forEach((col, ci) => {
      if (!col.length) return;
      const s = col.length * 2 - Math.abs(COLUMNS_Z[ci] - CATAPULT_Z[role] * 0.8) * 0.4 + this.game.rng.next() * 0.8;
      if (s > score) {
        score = s;
        best = ci;
      }
    });
    if (best < 0) return null;
    const col = cols[best];
    const faceX = c.side * (CASTLE_X - 0.1);
    const targetY = col[col.length - 1].mesh.position.y;
    const dx = (faceX - c.pos.x) * c.side;
    const dz = COLUMNS_Z[best] - c.pos.z;
    const d = Math.hypot(dx, dz);
    const cos = Math.cos(ELEVATION);
    const lift = LAUNCH_Y + d * Math.tan(ELEVATION) - targetY;
    const v = Math.sqrt((GRAVITY * d * d) / (2 * cos * cos * lift));
    const power = THREE.MathUtils.clamp((v - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0, 1);
    return {
      aim: THREE.MathUtils.clamp(Math.atan2(dz, dx) + this.game.rng.range(-0.05, 0.05), -AIM_MAX, AIM_MAX),
      power: THREE.MathUtils.clamp(power + this.game.rng.range(-0.06, 0.05), 0.02, 0.98),
    };
  }

  private crewStep(c: Crew, dt: number): void {
    c.reload -= dt;
    // Arm swings back to the loading position after a throw.
    c.arm.rotation.x += (0 - c.arm.rotation.x) * Math.min(1, dt * (c.reload > 0 ? 2 : 8));
    if (c.reload > 0) {
      moveAnim(c.p, 0);
      if (c.reload < RELOAD - 0.35) c.p.character.pose = 'idle';
      return;
    }
    c.loaded.visible = true;
    let turn = 0;
    let hold = false;
    if (c.p.controller) {
      turn = -c.p.controller.stickY;
      hold = c.p.controller.down('a');
    } else {
      c.plan ??= this.planShot(c);
      if (!c.plan) return;
      const diff = c.plan.aim - c.aim;
      turn = Math.abs(diff) < 0.01 ? 0 : THREE.MathUtils.clamp(diff * 6, -1, 1);
      // Wind up once lined up; let go when the meter passes the planned power.
      hold = Math.abs(diff) < 0.04 && !(c.charge >= 0 && powerAt(c.charge) >= c.plan.power);
    }
    c.aim = THREE.MathUtils.clamp(c.aim + turn * AIM_RATE * dt, -AIM_MAX, AIM_MAX);
    moveAnim(c.p, Math.abs(turn) * 0.6);
    if (hold) {
      c.charge = c.charge < 0 ? 0 : c.charge + dt;
      const power = powerAt(c.charge);
      c.arm.rotation.x = -power * 0.45;
      c.p.character.setExpression('determined');
      if (c.p.controller) this.drawArc(c, power);
    } else if (c.charge >= 0) {
      this.fire(c, powerAt(c.charge));
    }
    this.placeCrew(c);
  }

  private smash(block: Block): void {
    const col = this.columns[block.team][block.column];
    col.splice(col.indexOf(block), 1);
    this.scene.remove(block.mesh);
    const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    for (let k = 0; k < 6; k++) {
      this.shots++;
      const mesh = toonMesh(geo, (block.mesh.material as THREE.MeshToonMaterial).color.getHex(), { outline: 0.02 });
      mesh.position.copy(block.mesh.position);
      this.scene.add(mesh);
      const a = k * 1.047 + this.shots * 0.7;
      this.debris.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * 3, 5 + (k % 3), Math.sin(a) * 3), life: 1.2 });
    }
    this.game.audio.play('boom');
    for (const c of this.crews) {
      if (c.p.team !== block.team) c.p.character.setExpression('happy');
      else c.p.character.setExpression('surprised');
    }
    this.renderScore();
  }

  play(dt: number): void {
    for (const c of this.crews) this.crewStep(c, dt);

    for (const b of [...this.boulders]) {
      b.vel.y -= GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 5;
      b.mesh.rotation.z += dt * 3;
      const p = b.mesh.position;
      let gone = false;
      const enemy = 1 - b.team;
      for (const col of this.columns[enemy]) {
        // Topmost block first, so a lob that clips a stack takes the top off.
        for (let lv = col.length - 1; lv >= 0; lv--) {
          const bp = col[lv].mesh.position;
          const h = BLOCK / 2;
          const cx = THREE.MathUtils.clamp(p.x, bp.x - h, bp.x + h);
          const cy = THREE.MathUtils.clamp(p.y, bp.y - h, bp.y + h);
          const cz = THREE.MathUtils.clamp(p.z, bp.z - h, bp.z + h);
          if ((cx - p.x) ** 2 + (cy - p.y) ** 2 + (cz - p.z) ** 2 < BOULDER_R * BOULDER_R) {
            this.smash(col[lv]);
            gone = true;
            break;
          }
        }
        if (gone) break;
      }
      if (!gone && p.y < BOULDER_R) {
        gone = true;
        this.game.audio.play('pop');
      }
      if (gone) {
        this.scene.remove(b.mesh);
        this.boulders.splice(this.boulders.indexOf(b), 1);
      }
    }

    for (const team of [0, 1]) {
      if (this.blocksLeft(team) === 0) {
        const winners = this.players.filter((p) => p.team !== team);
        for (const p of this.players) {
          p.character.pose = p.team !== team ? 'cheer' : 'sulk';
          p.character.setExpression(p.team !== team ? 'happy' : 'sad');
        }
        this.finish(winners);
        return;
      }
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    // Blocks above a smashed one tumble down to fill the gap.
    for (const team of [0, 1]) {
      for (const col of this.columns[team]) {
        col.forEach((b, lv) => {
          const target = lv * BLOCK + BLOCK / 2;
          const y = b.mesh.position.y;
          if (y > target) b.mesh.position.y = Math.max(target, y - dt * 9);
        });
      }
    }
    this.placeFlags();
    for (const team of [0, 1]) for (const f of this.flags[team]) f.rotation.y = Math.sin(this.t * 3 + f.position.z) * 0.15;
    for (const d of [...this.debris]) {
      d.life -= dt;
      d.vel.y -= 20 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += dt * 6;
      if (d.mesh.position.y < 0.2) {
        d.mesh.position.y = 0.2;
        d.vel.multiplyScalar(0.4);
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.debris.splice(this.debris.indexOf(d), 1);
      }
    }
  }

  timeout(): number[] {
    const a = this.blocksLeft(0);
    const b = this.blocksLeft(1);
    if (a === b) return [];
    const team = a > b ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

/** Catapult Clash: a brassy medieval march in G with a snare-roll pickup. */
const catapultTheme: Song = {
  name: 'Catapult Clash',
  bpm: 126,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'reed',
      volume: 0.2,
      pattern: [
        'G4 . . D5 . . B4 . G4 . A4 B4 C5 . B4 .',
        'A4 . . E5 . . C5 . A4 . B4 C5 D5 - - .',
        'B4 . D5 . G5 . F#5 . E5 . D5 . C5 . B4 .',
        'A4 . C5 . B4 . A4 . G4 - - - . . D4 .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'G2 . . . D3 . . . G2 . . . D3 . . .',
        'A2 . . . E3 . . . D2 . . . A2 . . .',
        'E2 . . . B2 . . . C3 . . . G2 . . .',
        'D2 . . . A2 . . . G2 . D2 . G2 . . .',
      ].join(' '),
    },
    {
      instrument: 'square',
      volume: 0.07,
      pattern: [
        '. . B3 . . . B3 . . . D4 . . . D4 .',
        '. . C4 . . . C4 . . . F#4 . . . F#4 .',
        '. . G4 . . . G4 . . . E4 . . . E4 .',
        '. . F#4 . . . F#4 . . . D4 . . . D4 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.6, pattern: Array(4).fill('x . . . . . . . x . . . . . . .').join(' ') },
    {
      instrument: 'snare',
      volume: 0.2,
      pattern: [
        '. . . . x . . . . . . . x . x x',
        '. . . . x . . . . . . . x . . .',
        '. . . . x . . . . . . . x . x x',
        '. . . . x . . . . . . . x x x x',
      ].join(' '),
    },
  ],
};

export const catapultClash: MinigameDef = {
  id: 'catapultclash',
  name: 'Catapult Clash',
  kind: '2v2',
  song: catapultTheme,
  rules: "Aim your catapult and fling boulders across the field to knock down the other team's castle. Flatten it first to win!",
  controls: 'Stick ↑↓: aim · Hold A: wind up, release: fling',
  create: () => new CatapultClash(),
};
