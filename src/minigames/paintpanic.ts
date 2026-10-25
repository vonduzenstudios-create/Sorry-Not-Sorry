import * as THREE from 'three';
import { paintTheme } from '../audio/songs/minigameThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, separate, stick, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const N = 11;
const TILE = 1.1;
const HALF = (N * TILE) / 2;
const SPEED = 5;
const DASH_SPEED = 11;
const DASH_TIME = 0.28;
const DASH_COOLDOWN = 1.4;
const STUN = 0.9;

/**
 * Every tile you run over turns your color. Dash with A to cover ground fast,
 * or ram a rival to make them drop their roller. Most tiles at the end wins.
 */
class PaintPanic extends Minigame {
  readonly timeLimit = 30;
  private tiles: THREE.Mesh[] = [];
  private owner: number[] = [];
  private count: number[] = [];
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xc8b8ff, 0xffe8f4], 0xa98bff, -6);
    const base = toonMesh(new THREE.BoxGeometry(N * TILE + 0.6, 1, N * TILE + 0.6), Palette.lavender, { outline: 0.06 });
    base.position.y = -0.55;
    this.scene.add(base);
    const geo = new THREE.BoxGeometry(TILE * 0.94, 0.12, TILE * 0.94);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: Palette.cream }));
        m.receiveShadow = true;
        m.position.set(-HALF + (c + 0.5) * TILE, -0.05, -HALF + (r + 0.5) * TILE);
        this.scene.add(m);
        this.tiles.push(m);
        this.owner.push(-1);
      }
    }
    // Paint buckets in the corners, for show.
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bucket = toonMesh(new THREE.CylinderGeometry(0.45, 0.38, 0.7, 16), Palette.sky, { outline: 0.03 });
      bucket.position.set(x * (HALF + 0.9), 0, z * (HALF + 0.9));
      this.scene.add(bucket);
    }
    const corners = [
      [-1, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = corners[i];
      p.character.position.set(x * (HALF - 1), 0, z * (HALF - 1));
      p.character.rotation.y = Math.atan2(-x, -z);
      p.data.dash = 0;
      p.data.cool = 0;
      p.data.stun = 0;
      p.data.target = -1;
      p.data.retarget = 0;
      // A paint roller in each player's color.
      const roller = toonMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12), p.character.def.colors.accent, { outline: 0.02 });
      roller.rotation.z = Math.PI / 2;
      roller.position.set(0, 0.16, 0.55);
      p.character.add(roller);
      p.data.roller = roller;
      this.count.push(0);
    });
    this.camera.position.set(0, 18, 12.5);
    this.camera.lookAt(0, 0, 0.3);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private tileAt(pos: THREE.Vector3): number {
    const c = Math.floor((pos.x + HALF) / TILE);
    const r = Math.floor((pos.z + HALF) / TILE);
    if (c < 0 || r < 0 || c >= N || r >= N) return -1;
    return r * N + c;
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p, i) => `<span style="color:${css(p.character.def.colors.accent)}">■ ${this.count[i]}</span>`)
      .join('');
  }

  /** CPUs head for unpainted or rival tiles nearby, preferring the leader's. */
  private cpu(p: MinigamePlayer, i: number, dt: number): { dir: THREE.Vector3; dash: boolean } {
    const pos = p.character.position;
    p.data.retarget = (p.data.retarget as number) - dt;
    let target = p.data.target as number;
    if ((p.data.retarget as number) <= 0 || target < 0 || this.owner[target] === i) {
      p.data.retarget = 0.5;
      const leader = this.count.indexOf(Math.max(...this.count));
      let best = -Infinity;
      for (let t = 0; t < this.tiles.length; t++) {
        const o = this.owner[t];
        if (o === i) continue;
        const tp = this.tiles[t].position;
        const d = Math.hypot(tp.x - pos.x, tp.z - pos.z);
        const s = -d + (o === -1 ? 1 : 0.4) + (o === leader ? 1.2 : 0) + Math.sin(t * 1.7 + i * 2.3) * 0.6;
        if (s > best) {
          best = s;
          target = t;
        }
      }
      p.data.target = target;
    }
    if (target < 0) return { dir: new THREE.Vector3(), dash: false };
    const tp = this.tiles[target].position;
    const dir = new THREE.Vector3(tp.x - pos.x, 0, tp.z - pos.z);
    const d = dir.length();
    if (d > 0.05) dir.divideScalar(d);
    return { dir: dir.multiplyScalar(0.9), dash: d > 3.5 };
  }

  play(dt: number): void {
    this.players.forEach((p, i) => {
      const c = p.character;
      const roller = p.data.roller as THREE.Mesh;
      p.data.cool = Math.max(0, (p.data.cool as number) - dt);
      if ((p.data.stun as number) > 0) {
        p.data.stun = (p.data.stun as number) - dt;
        c.rotation.y += dt * 14;
        c.pose = 'sulk';
        roller.visible = false;
        return;
      }
      roller.visible = true;
      let move: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        move = stick(p);
        dash = p.controller.pressed('a');
      } else {
        ({ dir: move, dash } = this.cpu(p, i, dt));
      }
      if (dash && (p.data.cool as number) <= 0 && (p.data.dash as number) <= 0) {
        p.data.dash = DASH_TIME;
        p.data.cool = DASH_COOLDOWN;
        // Dash the way you face if the stick is idle.
        p.data.dashDir = move.lengthSq() > 0.01 ? move.clone().normalize() : new THREE.Vector3(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
        this.game.audio.play('jump');
      }
      if ((p.data.dash as number) > 0) {
        p.data.dash = (p.data.dash as number) - dt;
        c.position.addScaledVector(p.data.dashDir as THREE.Vector3, DASH_SPEED * dt);
        moveAnim(p, 1);
        face(p, p.data.dashDir as THREE.Vector3, dt);
        // Ram anyone in the way.
        for (const o of this.players) {
          if (o === p || (o.data.stun as number) > 0 || (o.data.dash as number) > 0) continue;
          if (o.character.position.distanceTo(c.position) < 0.85) {
            o.data.stun = STUN;
            o.character.setExpression('surprised');
            o.character.position.addScaledVector(p.data.dashDir as THREE.Vector3, 0.8);
            this.game.audio.play('pop');
          }
        }
      } else {
        c.position.addScaledVector(move, SPEED * dt);
        face(p, move, dt);
        moveAnim(p, move.length());
      }
      const lim = HALF - 0.3;
      c.position.x = THREE.MathUtils.clamp(c.position.x, -lim, lim);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -lim, lim);
    });
    separate(this.players, 0.4);

    let changed = false;
    this.players.forEach((p, i) => {
      if ((p.data.stun as number) > 0) return;
      const t = this.tileAt(p.character.position);
      if (t < 0 || this.owner[t] === i) return;
      if (this.owner[t] >= 0) this.count[this.owner[t]]--;
      this.owner[t] = i;
      this.count[i]++;
      (this.tiles[t].material as THREE.MeshToonMaterial).color.setHex(p.character.def.colors.accent);
      this.tiles[t].userData.splash = 1;
      changed = true;
    });
    if (changed) this.renderScore();
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const tile of this.tiles) {
      const s = (tile.userData.splash as number | undefined) ?? 0;
      if (s <= 0) continue;
      tile.userData.splash = Math.max(0, s - dt * 5);
      tile.position.y = -0.05 + Math.sin(s * Math.PI) * 0.12;
    }
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => this.count[this.players.indexOf(p)], 0);
  }
}

export const paintPanic: MinigameDef = {
  id: 'paintpanic',
  name: 'Paint Panic',
  kind: 'ffa',
  duel: true,
  song: paintTheme,
  rules: 'Roll over tiles to paint them your color. Dash into rivals to knock their roller away. Most tiles wins!',
  controls: 'Stick: run · A: dash',
  create: () => new PaintPanic(),
};
