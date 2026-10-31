import * as THREE from 'three';
import { raftTheme } from '../audio/songs/volleyRaftThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { scorePanel } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** River length; rafts start at z = 0 and race toward -Z. */
const COURSE = 150;
const LANE_X = 4;
/** How far a raft can drift from its lane's middle. */
const DRIFT = 2.2;
const RAFT_W = 1;
const RAFT_L = 1.4;
const ROCK_R = 0.55;
/** The drum beat: strokes on it, together, go fastest. */
const BEAT = 0.75;
const STROKE = 1.7;
const SYNC_BONUS = 2;
const SYNC_WINDOW = 0.22;
const COOLDOWN = 0.25;
const DRAG = 0.9;
const CURRENT = 1;
const STEER = 3.2;

interface Raft {
  team: number;
  group: THREE.Group;
  paddles: THREE.Group[];
  drum: THREE.Mesh;
  flash: THREE.Mesh;
  z: number;
  x: number;
  v: number;
  bump: number;
  hit: Set<number>;
  /** CPU crews decide once per rock whether they spot it in time. */
  dodge: Map<number, boolean>;
  crew: MinigamePlayer[];
}

/**
 * 2 vs 2 river race. Each teammate paddles one side of the raft: stroke with A
 * on the drum beat, and stroke together for a big surge. Steer around rocks.
 */
class RaftRally extends Minigame {
  readonly timeLimit = 40;
  private rafts: Raft[] = [];
  private rocks: { x: number; z: number }[] = [];
  private clock = 0;
  private lastBeat = -1;
  private board!: HTMLDivElement;
  private teamColors: number[] = [];
  private done = false;

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xf6fff0], 0x6fbfe0, -2);
    const len = COURSE + 60;
    const midZ = -COURSE / 2;
    for (const lane of [-1, 1]) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry((DRIFT + RAFT_W) * 2 + 0.6, len), new THREE.MeshBasicMaterial({ color: Palette.water }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(lane * LANE_X, -0.05, midZ);
      this.scene.add(water);
      // Outer bank.
      const bank = toonMesh(new THREE.BoxGeometry(10, 1, len), Palette.grass, { outline: false });
      bank.position.set(lane * (LANE_X + DRIFT + RAFT_W + 0.3 + 5), -0.3, midZ);
      this.scene.add(bank);
    }
    const island = toonMesh(new THREE.BoxGeometry((LANE_X - DRIFT - RAFT_W - 0.3) * 2, 0.8, len), Palette.sand, { outline: false });
    island.position.set(0, -0.3, midZ);
    this.scene.add(island);

    const r = this.game.rng;
    // Foam streaks, trees and reeds along the course.
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    for (let z = 10; z > -COURSE - 30; z -= 2.6) {
      for (const lane of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.08, r.range(0.6, 1.6)), foamMat);
        f.rotation.x = -Math.PI / 2;
        f.position.set(lane * LANE_X + r.range(-2.2, 2.2), -0.02, z + r.range(-1, 1));
        this.scene.add(f);
      }
    }
    for (let z = 8; z > -COURSE - 30; z -= 7) {
      for (const lane of [-1, 1]) {
        const tree = new THREE.Group();
        const trunk = toonMesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), 0xb08058, { outline: 0.02 });
        trunk.position.y = 0.5;
        const top = toonMesh(new THREE.ConeGeometry(0.9, 2.2, 7), r.next() < 0.5 ? Palette.grassDark : 0x6cbf7a, { outline: 0.02 });
        top.position.y = 2;
        tree.add(trunk, top);
        tree.position.set(lane * (LANE_X + 4.3 + r.range(0, 3)), 0.2, z + r.range(-2, 2));
        this.scene.add(tree);
      }
    }

    // Rocks: one layout, copied into both lanes so it's fair.
    for (let z = -16; z > -COURSE + 8; z -= r.range(9, 13)) {
      this.rocks.push({ x: r.range(-DRIFT + 0.6, DRIFT - 0.6), z });
    }
    for (const lane of [-1, 1]) {
      for (const rock of this.rocks) {
        const m = toonMesh(new THREE.DodecahedronGeometry(ROCK_R, 0), 0x9a94a8, { outline: 0.03 });
        m.position.set(lane * LANE_X + rock.x, 0.1, rock.z);
        m.rotation.set(rock.z, rock.x, 0);
        this.scene.add(m);
      }
    }

    // Finish arch with a checkered banner.
    for (const x of [-LANE_X - 2.8, 0, LANE_X + 2.8]) {
      const post = toonMesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 8), Palette.cream, { outline: 0.02 });
      post.position.set(x, 2, -COURSE);
      this.scene.add(post);
    }
    const span = (LANE_X + 2.8) * 2;
    const squares = 16;
    for (let i = 0; i < squares; i++) {
      for (let row = 0; row < 2; row++) {
        const sq = toonMesh(new THREE.BoxGeometry(span / squares, 0.4, 0.1), (i + row) % 2 ? Palette.ink : Palette.cream, { outline: false });
        sq.position.set(-span / 2 + (i + 0.5) * (span / squares), 3.6 + row * 0.4, -COURSE);
        this.scene.add(sq);
      }
    }

    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      const crew = this.players.filter((p) => p.team === team);
      const group = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const log = toonMesh(new THREE.CylinderGeometry(0.24, 0.24, RAFT_L * 2, 10), 0xc89a68, { outline: 0.02 });
        log.rotation.x = Math.PI / 2;
        log.position.set(-0.75 + i * 0.5, 0, 0);
        group.add(log);
      }
      for (const z of [-RAFT_L + 0.3, RAFT_L - 0.3]) {
        const strap = toonMesh(new THREE.BoxGeometry(2.1, 0.08, 0.2), this.teamColors[team], { outline: 0.01 });
        strap.position.set(0, 0.24, z);
        group.add(strap);
      }
      const mast = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), Palette.ink, { outline: false });
      mast.position.set(0, 0.9, RAFT_L - 0.2);
      const flag = toonMesh(new THREE.ConeGeometry(0.22, 0.6, 3), this.teamColors[team], { outline: 0.015 });
      flag.rotation.z = -Math.PI / 2;
      flag.position.set(0.3, 1.4, RAFT_L - 0.2);
      const drum = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 14), Palette.coral, { outline: 0.02 });
      drum.position.set(0, 0.4, -RAFT_L + 0.35);
      group.add(mast, flag, drum);
      const flash = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 32), new THREE.MeshBasicMaterial({ color: Palette.yellow, transparent: true, opacity: 0 }));
      flash.rotation.x = -Math.PI / 2;
      flash.position.y = 0.05;
      group.add(flash);

      const paddles: THREE.Group[] = [];
      crew.forEach((p, i) => {
        const sx = crew.length === 1 ? 0 : i === 0 ? -1 : 1;
        p.character.position.set(sx * 0.5, 0.25, 0.1);
        p.character.rotation.y = Math.PI;
        group.add(p.character);
        const paddle = new THREE.Group();
        const shaft = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), 0x8a6040, { outline: 0.01 });
        shaft.position.y = -0.4;
        const blade = toonMesh(new THREE.BoxGeometry(0.06, 0.6, 0.3), this.teamColors[team], { outline: 0.01 });
        blade.position.y = -1.2;
        paddle.add(shaft, blade);
        paddle.position.set((sx || 1) * 1.15, 1.1, 0.1);
        paddle.rotation.z = (sx || 1) * 0.35;
        group.add(paddle);
        paddles.push(paddle);
        p.data.since = 9;
        p.data.swing = 0;
        p.data.next = BEAT + this.game.rng.range(-0.1, 0.1);
        p.data.jitter = this.game.rng.range(0.03, 0.16);
      });
      group.position.set(sideX(team), 0.15, 0);
      this.scene.add(group);
      this.rafts.push({ team, group, paddles, drum, flash, z: 0, x: 0, v: 0, bump: 0, hit: new Set(), dodge: new Map(), crew });
    }

    this.board = scorePanel(this.overlay);
    this.updateCamera(1);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.rafts
      .map((raft) => {
        const pct = THREE.MathUtils.clamp(Math.round((-raft.z / COURSE) * 100), 0, 100);
        return `<span style="color:${css(this.teamColors[raft.team])};-webkit-text-stroke:1px #2b2440">⛵ ${pct}%</span>`;
      })
      .join('<span>·</span>');
  }

  private updateCamera(k: number): void {
    const lead = Math.min(...this.rafts.map((r) => r.z));
    const trail = Math.max(...this.rafts.map((r) => r.z));
    const mid = (lead + trail) / 2;
    const spread = trail - lead;
    const target = new THREE.Vector3(0, 8 + spread * 0.3, mid + 11 + spread * 0.25);
    this.camera.position.lerp(target, k);
    this.camera.lookAt(0, 0, this.camera.position.z - 17 - spread * 0.1);
  }

  private stroke(raft: Raft, p: MinigamePlayer): void {
    const power = THREE.MathUtils.clamp((p.data.since as number) / BEAT, 0.25, 1);
    p.data.since = 0;
    p.data.swing = 1;
    raft.v += STROKE * power;
    const mate = raft.crew.find((o) => o !== p);
    if (mate && (mate.data.since as number) < SYNC_WINDOW) {
      raft.v += SYNC_BONUS * power;
      (raft.flash.material as THREE.MeshBasicMaterial).opacity = 1;
      raft.flash.scale.setScalar(0.6);
      this.game.audio.play('coin');
      for (const c of raft.crew) c.character.setExpression('happy');
    } else {
      this.game.audio.play('select');
    }
  }

  /** CPU crews steer away from the next rock in their path. */
  private cpuSteer(raft: Raft): number {
    const ahead = this.rocks
      .map((rock, i) => ({ rock, i }))
      .find(({ rock }) => rock.z < raft.z + RAFT_L && rock.z > raft.z - 12);
    if (!ahead) return THREE.MathUtils.clamp(-raft.x, -1, 1) * 0.3;
    const { rock, i } = ahead;
    if (!raft.dodge.has(i)) raft.dodge.set(i, this.game.rng.next() < 0.8);
    if (!raft.dodge.get(i)) return 0;
    const dx = raft.x - rock.x;
    if (Math.abs(dx) > RAFT_W + ROCK_R + 0.3) return 0;
    let dir = dx >= 0 ? 1 : -1;
    // Pinned against the bank: go round the other way.
    if (Math.abs(rock.x + dir * (RAFT_W + ROCK_R + 0.3)) > DRIFT) dir = -dir;
    return dir;
  }

  play(dt: number): void {
    if (this.done) return;
    this.clock += dt;
    const beat = Math.floor(this.clock / BEAT);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      for (const raft of this.rafts) raft.drum.scale.set(1.35, 1.6, 1.35);
      this.game.audio.note('triangle', 'D3', 0.08, 0.18);
    }

    for (const raft of this.rafts) {
      let steer = 0;
      let human = false;
      for (const p of raft.crew) {
        p.data.since = (p.data.since as number) + dt;
        let go: boolean;
        if (p.controller) {
          human = true;
          steer += p.controller.stickX;
          go = p.controller.pressed('a');
        } else {
          go = this.clock >= (p.data.next as number);
          if (go) {
            const j = p.data.jitter as number;
            p.data.next = (Math.floor(this.clock / BEAT) + 1) * BEAT + this.game.rng.range(-j, j);
          }
        }
        if (go && (p.data.since as number) >= COOLDOWN) this.stroke(raft, p);
      }
      if (!human) steer = this.cpuSteer(raft);
      steer = THREE.MathUtils.clamp(steer, -1, 1);

      raft.v *= Math.exp(-DRAG * dt);
      raft.bump = Math.max(0, raft.bump - dt);
      raft.z -= (raft.v + CURRENT) * dt;
      raft.x = THREE.MathUtils.clamp(raft.x + steer * STEER * dt, -DRIFT, DRIFT);

      this.rocks.forEach((rock, i) => {
        if (raft.hit.has(i)) return;
        if (Math.abs(rock.x - raft.x) < RAFT_W + ROCK_R && Math.abs(rock.z - raft.z) < RAFT_L + ROCK_R) {
          raft.hit.add(i);
          raft.v = -1.5;
          raft.bump = 0.6;
          this.game.audio.play('boom');
          for (const c of raft.crew) c.character.setExpression('surprised');
        }
      });

      raft.group.position.x = sideX(raft.team) + raft.x;
      raft.group.position.z = raft.z;
      raft.group.rotation.y = -steer * 0.15 + Math.sin(raft.bump * 25) * raft.bump * 0.3;

      if (raft.z <= -COURSE) {
        this.done = true;
        this.game.audio.play('star');
        for (const p of this.players) {
          const won = p.team === raft.team;
          p.character.pose = won ? 'cheer' : 'sulk';
          p.character.setExpression(won ? 'happy' : 'sad');
        }
        this.finish(raft.crew);
        break;
      }
    }
    this.renderScore();
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const raft of this.rafts) {
      raft.group.position.y = 0.15 + Math.sin(this.t * 3 + raft.team * 1.7) * 0.05;
      raft.group.rotation.z = Math.sin(this.t * 2.3 + raft.team) * 0.04;
      raft.drum.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 10));
      const fm = raft.flash.material as THREE.MeshBasicMaterial;
      fm.opacity = Math.max(0, fm.opacity - dt * 2.5);
      raft.flash.scale.multiplyScalar(1 + dt * 1.5);
      raft.crew.forEach((p, i) => {
        const swing = Math.max(0, (p.data.swing as number) - dt * 2.5);
        p.data.swing = swing;
        // Dig the blade in and sweep it back.
        raft.paddles[i].rotation.x = -Math.sin(swing * Math.PI) * 0.9;
        if (!this.done) p.character.pose = swing > 0 ? 'walk' : 'idle';
      });
    }
    this.updateCamera(Math.min(1, dt * 3));
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return -this.rafts.find((r) => r.crew.includes(p))!.z;
  }

  timeout(): number[] {
    const [a, b] = this.rafts;
    if (Math.abs(a.z - b.z) < 0.5) return [];
    const lead = a.z < b.z ? a : b;
    return lead.crew.map((p) => p.seat);
  }
}

const sideX = (team: number) => (team === 0 ? -LANE_X : LANE_X);

export const raftRally: MinigameDef = {
  id: 'raftrally',
  name: 'Raft Rally',
  kind: '2v2',
  song: raftTheme,
  rules: 'Race your raft downriver! Press A to paddle on the drum beat, and stroke at the same time as your partner for a big surge. Steer around the rocks!',
  controls: 'A: paddle · Stick: steer',
  create: () => new RaftRally(),
};
