import * as THREE from 'three';
import { bridgeTheme } from '../audio/songs/ghostBridgeThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, separate } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const COLS = 3;
const ROWS = 18;
const COL_W = 1.3;
const ROW_D = 1.1;
/** Center of the first plank row; the runners start on the cliff behind it. */
const ROW0_Z = 9.4;
const BRIDGE_END_Z = ROW0_Z - ROWS * ROW_D + ROW_D / 2;
const START_Z = 11.2;
const GOAL_Z = BRIDGE_END_Z - 0.4;
const HALF_W = (COLS * COL_W) / 2 - 0.25;
const RUN_SPEED = 3.4;
const JUMP_V = 6.4;
const GRAVITY = 22;
const JUMP_COOL = 0.8;
const AIM_SPEED = 10;
const CUT_COOL = 0.18;
/** A cut plank smolders this long, then drops. */
const BURN = 0.55;
/** Dropped planks grow back after this long. */
const REGROW = 5;
const FALL_TIME = 1.1;
const NEEDED = 3;
const CUTTER = new THREE.Vector3(0, 0, BRIDGE_END_Z - 2.6);

type Phase = 'ok' | 'burn' | 'gone';

interface Plank {
  mesh: THREE.Mesh;
  phase: Phase;
  t: number;
  x: number;
  z: number;
}

const colX = (c: number) => (c - (COLS - 1) / 2) * COL_W;
const rowZ = (r: number) => ROW0_Z - r * ROW_D;

/**
 * Side view: stick right runs across. The camera looks along -X, so screen
 * right is world -Z and screen up is world -X.
 */
function sideStick(p: MinigamePlayer): THREE.Vector3 {
  const c = p.controller;
  if (!c) return new THREE.Vector3();
  const v = new THREE.Vector3(-c.stickY, 0, -c.stickX);
  if (v.lengthSq() > 1) v.normalize();
  return v;
}

/**
 * 1 vs 3. The runners dash across a plank bridge over a lava canyon while the
 * solo player picks planks to set alight. Burning planks drop away a moment
 * later; runners can hop a gap. Two runs across and the runners win; hold
 * them off until time runs out and the cutter wins.
 */
class BridgeBurn extends Minigame {
  readonly timeLimit = 25;
  private planks: Plank[][] = [];
  private aim = new THREE.Vector3(0, 0, rowZ(4));
  private cursor!: THREE.Mesh;
  private cool = 0;
  private made = 0;
  private cpuErr = new THREE.Vector3();
  private flames: THREE.Mesh[] = [];
  private board!: HTMLDivElement;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0x6a5ac8, 0xffb488], 0xd8442a, -16);
    // Canyon walls on either end, lava glow far below.
    for (const [z, len] of [
      [START_Z + 2, 7],
      [BRIDGE_END_Z - 3.2, 6.4],
    ] as const) {
      const cliff = toonMesh(new THREE.BoxGeometry(12, 16, len), 0xd8946a, { outline: 0.05 });
      cliff.position.set(0, -8, z);
      const top = toonMesh(new THREE.BoxGeometry(12.2, 0.4, len + 0.2), 0xe8b880, { outline: 0.04 });
      top.position.set(0, -0.2, z);
      this.scene.add(cliff, top);
    }
    for (let i = 0; i < 6; i++) {
      const rock = toonMesh(new THREE.DodecahedronGeometry(1.2 + (i % 3) * 0.5, 0), 0xc07a52, { outline: 0.04 });
      rock.position.set(-9 + (i % 2) * 2, -6 - i * 1.3, 8 - i * 3.3);
      this.scene.add(rock);
    }
    const glow = new THREE.PointLight(0xff7030, 30, 30, 1.2);
    glow.position.set(0, -10, 0);
    this.scene.add(glow);

    for (let r = 0; r < ROWS; r++) {
      const row: Plank[] = [];
      for (let c = 0; c < COLS; c++) {
        const mesh = toonMesh(new THREE.BoxGeometry(COL_W - 0.08, 0.2, ROW_D - 0.14), (r + c) % 2 ? 0xb07a4a : 0xc08a56, { outline: 0.02 });
        mesh.position.set(colX(c), -0.1, rowZ(r));
        this.scene.add(mesh);
        row.push({ mesh, phase: 'ok', t: 0, x: colX(c), z: rowZ(r) });
      }
      this.planks.push(row);
    }
    // Rope rails and posts.
    const railZ = (ROW0_Z + BRIDGE_END_Z) / 2;
    const railLen = ROW0_Z - BRIDGE_END_Z + 1.6;
    for (const x of [-(COLS * COL_W) / 2 - 0.15, (COLS * COL_W) / 2 + 0.15]) {
      const rail = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, railLen, 6), 0xe8d0a0, { outline: false });
      rail.rotation.x = Math.PI / 2;
      rail.position.set(x, 0.75, railZ);
      this.scene.add(rail);
      for (let i = 0; i <= 6; i++) {
        const post = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), 0x7a4a2a, { outline: 0.02 });
        post.position.set(x, 0.3, ROW0_Z + 0.8 - (i / 6) * railLen);
        this.scene.add(post);
      }
    }
    const goal = new THREE.Mesh(new THREE.PlaneGeometry(COLS * COL_W + 1, 0.4), new THREE.MeshBasicMaterial({ color: Palette.green }));
    goal.rotation.x = -Math.PI / 2;
    goal.position.set(0, 0.02, GOAL_Z);
    this.scene.add(goal);

    const solo = this.solo;
    solo.character.position.copy(CUTTER);
    solo.character.rotation.y = 0;
    // A brazier the cutter lights planks from.
    const brazier = toonMesh(new THREE.CylinderGeometry(0.45, 0.3, 0.7, 12), 0x5a4a5a, { outline: 0.03 });
    brazier.position.set(1.3, 0.35, CUTTER.z);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 10), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    fire.position.set(1.3, 1.05, CUTTER.z);
    this.flames.push(fire);
    this.scene.add(brazier, fire);

    this.runners.forEach((p, i) => {
      p.data.vy = 0;
      p.data.air = false;
      p.data.jumpCool = 0;
      p.data.fallT = -1;
      this.respawn(p, i);
    });
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.6, 4, 1), new THREE.MeshBasicMaterial({ color: solo.character.def.colors.accent }));
    this.cursor.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    this.cursor.scale.set(1.3, 1, 1);
    this.scene.add(this.cursor);

    this.camera.position.set(19.5, 14, -0.2);
    this.camera.lookAt(0, -1.4, -0.2);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private respawn(p: MinigamePlayer, i = this.runners.indexOf(p)): void {
    p.character.position.set(colX(i), 0, START_Z);
    p.character.rotation.set(0, Math.PI, 0);
    p.data.fallT = -1;
    p.data.vy = 0;
    p.data.air = false;
    p.data.react = this.game.rng.range(0.25, 0.55);
  }

  private renderScore(): void {
    this.board.textContent = `Across: ${'⚑'.repeat(this.made)}${'·'.repeat(NEEDED - this.made)}`;
  }

  /** The plank under a point, or null off the bridge (on a cliff). */
  private plankAt(x: number, z: number): Plank | null {
    const r = Math.round((ROW0_Z - z) / ROW_D);
    if (z > ROW0_Z + ROW_D / 2 || r < 0 || r >= ROWS) return null;
    const c = THREE.MathUtils.clamp(Math.round(x / COL_W + (COLS - 1) / 2), 0, COLS - 1);
    return this.planks[r][c];
  }

  private cut(pl: Plank): void {
    pl.phase = 'burn';
    pl.t = 0;
    this.solo.character.pose = 'jump';
    this.game.audio.play('pop');
  }

  /** CPU cutter: set fire to the plank the leading runner is about to reach. */
  private cpuCut(): { dir: THREE.Vector3; fire: boolean } {
    let lead: MinigamePlayer | null = null;
    for (const r of this.runners) {
      if ((r.data.fallT as number) >= 0) continue;
      if (!lead || r.character.position.z < lead.character.position.z) lead = r;
    }
    if (!lead) return { dir: new THREE.Vector3(), fire: false };
    const p = lead.character.position;
    const z = Math.max(BRIDGE_END_Z + 0.3, Math.min(ROW0_Z, p.z - RUN_SPEED * (BURN + 0.25)));
    const target = this.plankAt(p.x, z);
    if (!target) return { dir: new THREE.Vector3(), fire: false };
    const goal = new THREE.Vector3(target.x, 0, target.z).add(this.cpuErr);
    const dir = goal.sub(this.aim).setY(0);
    const d = dir.length();
    const under = this.plankAt(this.aim.x, this.aim.z);
    return {
      dir: d > 0.1 ? dir.divideScalar(d).multiplyScalar(Math.min(1, d * 2)) : new THREE.Vector3(),
      fire: d < 0.4 && under?.phase === 'ok',
    };
  }

  /** Can a runner (who notices fires after `react` seconds) safely stand here? */
  private safe(pl: Plank | null, react: number): boolean {
    return !pl || pl.phase === 'ok' || (pl.phase === 'burn' && pl.t < react);
  }

  /** CPU runner: keep running, switch lanes around fires, hop gaps it can't dodge. */
  private cpuRun(p: MinigamePlayer): { dir: THREE.Vector3; jump: boolean } {
    const pos = p.character.position;
    const react = p.data.react as number;
    const c = THREE.MathUtils.clamp(Math.round(pos.x / COL_W + (COLS - 1) / 2), 0, COLS - 1);
    const r = pos.z > ROW0_Z + ROW_D / 2 ? -1 : Math.round((ROW0_Z - pos.z) / ROW_D);
    const at = (row: number, col: number) => (row >= 0 && row < ROWS ? this.planks[row][col] : null);
    const lane = (col: number) => this.safe(at(r, col), react) && this.safe(at(r + 1, col), react);
    const dir = new THREE.Vector3(0, 0, -1);
    let jump = false;
    if (!lane(c)) {
      // Pick the nearest lane that's clear here and one row on.
      let best = -1;
      for (const col of [c - 1, c + 1, c - 2, c + 2]) {
        if (col >= 0 && col < COLS && lane(col) && (best < 0 || Math.abs(col - c) < Math.abs(best - c))) best = col;
      }
      if (best >= 0 && Math.abs(best - c) === 1) {
        dir.set(Math.sign(colX(best) - pos.x) * 1.4, 0, -0.25);
      } else if (this.safe(at(r + 2, c), react) && this.safe(at(r, c), react)) {
        // Gap just ahead: run up and hop it.
        const edge = r >= 0 ? pos.z - (rowZ(r) - ROW_D / 2) : pos.z - (ROW0_Z + ROW_D / 2);
        jump = edge < 0.45;
      } else if (this.safe(at(r, c), react)) {
        dir.set(0, 0, 0);
      } else {
        // Standing on a burning plank: get off any way possible.
        dir.set(best >= 0 ? Math.sign(colX(best) - pos.x) : 0, 0, this.safe(at(r - 1, c), react) ? 1 : -1);
      }
    } else {
      dir.x = THREE.MathUtils.clamp((colX(c) - pos.x) * 2, -0.6, 0.6);
    }
    if (dir.lengthSq() > 1) dir.normalize();
    return { dir, jump };
  }

  play(dt: number): void {
    const solo = this.solo;
    this.cool = Math.max(0, this.cool - dt);
    let dir: THREE.Vector3;
    let fire: boolean;
    if (solo.controller) {
      dir = sideStick(solo);
      fire = solo.controller.pressed('a');
    } else ({ dir, fire } = this.cpuCut());
    this.aim.addScaledVector(dir, AIM_SPEED * dt);
    this.aim.x = THREE.MathUtils.clamp(this.aim.x, colX(0), colX(COLS - 1));
    this.aim.z = THREE.MathUtils.clamp(this.aim.z, rowZ(ROWS - 1), rowZ(0));
    const target = this.plankAt(this.aim.x, this.aim.z)!;
    this.cursor.position.set(target.x, 0.05, target.z);
    if (fire && this.cool <= 0 && target.phase === 'ok') {
      this.cut(target);
      this.cool = CUT_COOL;
      const rng = this.game.rng;
      this.cpuErr.set(rng.range(-1, 1) * 0.35, 0, rng.range(-1, 1) * 0.5);
    }
    if (this.cool < CUT_COOL - 0.2) solo.character.pose = 'idle';
    solo.character.rotation.y = Math.atan2(this.aim.x - solo.character.position.x, this.aim.z - solo.character.position.z);

    for (const row of this.planks) {
      for (const pl of row) {
        if (pl.phase === 'ok') continue;
        pl.t += dt;
        if (pl.phase === 'burn' && pl.t >= BURN) {
          pl.phase = 'gone';
          pl.t = 0;
        } else if (pl.phase === 'gone' && pl.t >= REGROW) {
          pl.phase = 'ok';
          pl.t = 0;
        }
      }
    }

    for (const r of this.runners) {
      const c = r.character;
      const fallT = r.data.fallT as number;
      if (fallT >= 0) {
        r.data.fallT = fallT + dt;
        r.data.vy = (r.data.vy as number) - GRAVITY * dt;
        c.position.y += (r.data.vy as number) * dt;
        c.rotation.x += dt * 5;
        if (fallT + dt >= FALL_TIME) this.respawn(r);
        continue;
      }
      r.data.jumpCool = Math.max(0, (r.data.jumpCool as number) - dt);
      let move: THREE.Vector3;
      let jump: boolean;
      if (r.controller) {
        move = sideStick(r);
        jump = r.controller.pressed('a');
      } else ({ dir: move, jump } = this.cpuRun(r));
      if (jump && !r.data.air && (r.data.jumpCool as number) <= 0) {
        r.data.air = true;
        r.data.vy = JUMP_V;
        r.data.jumpCool = JUMP_COOL;
        c.pose = 'jump';
        this.game.audio.play('jump');
        // CPUs commit to a hop straight ahead.
        if (!r.controller) move.set(0, 0, -1);
      }
      if (r.data.air) {
        r.data.vy = (r.data.vy as number) - GRAVITY * dt;
        c.position.y += (r.data.vy as number) * dt;
        if (!r.controller) move.set(0, 0, -1);
        if (c.position.y <= 0) {
          c.position.y = 0;
          r.data.air = false;
          c.land();
        }
      }
      c.position.addScaledVector(move, RUN_SPEED * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_W, HALF_W);
      c.position.z = Math.min(START_Z + 1, c.position.z);
      face(r, move, dt);
      if (!r.data.air) moveAnim(r, move.length());
      c.setExpression('determined');
      const under = this.plankAt(c.position.x, c.position.z);
      if (!r.data.air && under?.phase === 'gone') {
        r.data.fallT = 0;
        r.data.vy = 0;
        c.pose = 'jump';
        c.setExpression('surprised');
        this.game.audio.play('back');
        continue;
      }
      if (c.position.z <= GOAL_Z) {
        this.made++;
        r.data.across = ((r.data.across as number | undefined) ?? 0) + 1;
        this.game.audio.play('star');
        this.renderScore();
        if (this.made >= NEEDED) return this.finish(this.runners);
        this.respawn(r);
      }
    }
    separate(
      this.runners.filter((r) => (r.data.fallT as number) < 0),
      0.38,
    );
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const row of this.planks) {
      for (const pl of row) {
        const m = pl.mesh;
        const mat = m.material as THREE.MeshToonMaterial;
        if (pl.phase === 'ok') {
          m.visible = true;
          m.position.y += (-0.1 - m.position.y) * Math.min(1, dt * 8);
          m.rotation.z = 0;
          mat.emissive.setHex(0x000000);
        } else if (pl.phase === 'burn') {
          const k = pl.t / BURN;
          mat.emissive.setRGB(0.9 * k + Math.sin(this.t * 30) * 0.15, 0.3 * k, 0);
          m.position.y = -0.1 + Math.sin(this.t * 50) * 0.03 * k;
        } else {
          // Tumble into the canyon, then pop back in from below when regrown.
          mat.emissive.setRGB(0.4, 0.1, 0);
          m.position.y = -0.1 - pl.t * pl.t * 10;
          m.rotation.z = pl.t * 3;
          m.visible = pl.t < 1.2;
          if (pl.t > REGROW - 0.4) {
            m.visible = true;
            m.rotation.z = 0;
            m.position.y = -1.5;
            mat.emissive.setHex(0x000000);
          }
        }
      }
    }
    for (const f of this.flames) f.scale.set(1 + Math.sin(this.t * 17) * 0.1, 1 + Math.sin(this.t * 11) * 0.2, 1);
    this.cursor.rotation.z = Math.PI / 4 + Math.sin(this.t * 4) * 0.1;
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return (p.data.across as number | undefined) ?? 0;
  }

  timeout(): number[] {
    return [this.solo.seat];
  }
}

export const bridgeBurn: MinigameDef = {
  id: 'bridgeburn',
  name: 'Bridge Burn',
  kind: '1v3',
  song: bridgeTheme,
  rules: 'Runners: race across the rickety bridge and hop over gaps. Get 3 runs across to win! Burner: set planks alight so they drop away, and keep the runners back until time runs out.',
  controls: 'Burner: stick to aim, A to burn · Runners: stick to run, A to hop',
  create: () => new BridgeBurn(),
};
