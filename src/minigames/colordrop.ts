import * as THREE from 'three';
import { colorDropTheme } from '../audio/songs/dropClimbThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const GRID = 6;
const TILE = 1.7;
const HALF = (GRID * TILE) / 2;
const SPEED = 5;
const DASH_SPEED = 12;
const DASH_TIME = 0.22;
const DASH_COOLDOWN = 1.1;
const SHOVE = 9;
/** Tiles that never come back after each drop, so the floor shrinks. */
const MIN_TILES = 10;
const COLORS = [
  { name: 'Cherry', hex: Palette.coral },
  { name: 'Sky', hex: 0x6cc4ff },
  { name: 'Lime', hex: Palette.green },
  { name: 'Lemon', hex: Palette.yellow },
  { name: 'Grape', hex: Palette.violet },
];

interface Tile {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  color: number;
  gone: boolean;
}

type Phase = 'roll' | 'call' | 'drop' | 'rise';

/**
 * A spinning sign rolls through colors and lands on one; every other tile
 * falls into the sea. A few tiles never come back, and A shoves rivals off.
 */
class ColorDrop extends Minigame {
  readonly timeLimit = 60;
  private tiles: Tile[] = [];
  private phase: Phase = 'rise';
  private phaseTime = 1;
  private called = 0;
  private round = 0;
  private sign!: HTMLDivElement;
  private board!: THREE.Mesh;

  protected setup(): void {
    arenaBasics(this.scene, [0xbfe8ff, 0xfff0f6], 0x5aa8d8, -14);
    const geo = new THREE.BoxGeometry(TILE * 0.94, 0.6, TILE * 0.94);
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const mesh = toonMesh(geo, Palette.cream, { outline: 0.04 });
        mesh.material = (mesh.material as THREE.MeshToonMaterial).clone();
        mesh.position.set(-HALF + TILE * (i + 0.5), -0.3, -HALF + TILE * (j + 0.5));
        this.scene.add(mesh);
        this.tiles.push({ mesh, home: mesh.position.clone(), color: 0, gone: false });
      }
    }
    this.paint();

    // The color sign on a post behind the floor.
    const post = toonMesh(new THREE.CylinderGeometry(0.18, 0.22, 2.4, 12), 0xc9a27a, { outline: 0.03 });
    post.position.set(0, -0.5, -HALF - 1.2);
    const frame = toonMesh(new THREE.BoxGeometry(3.4, 2, 0.3), Palette.cream, { outline: 0.05 });
    frame.position.set(0, 1.4, -HALF - 1.2);
    this.board = toonMesh(new THREE.BoxGeometry(2.9, 1.5, 0.34), Palette.cream, { outline: false });
    this.board.material = (this.board.material as THREE.MeshToonMaterial).clone();
    this.board.position.copy(frame.position);
    this.scene.add(post, frame, this.board);

    ring(this.players, 2.6);
    for (const p of this.players) {
      p.data.dash = 0;
      p.data.cool = 0;
      p.data.push = new THREE.Vector3();
    }
    this.camera.position.set(0, 15, 12.5);
    this.camera.lookAt(0, 0, 0.4);
    this.sign = document.createElement('div');
    this.sign.className = 'mg-score panel';
    this.overlay.appendChild(this.sign);
    this.sign.style.display = 'none';
  }

  private get present(): Tile[] {
    return this.tiles.filter((t) => !t.gone);
  }

  /** Shuffle colors over the remaining tiles, each color a fair share. */
  private paint(): void {
    const tiles = this.present;
    const order = tiles.map((_, i) => i % COLORS.length);
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.game.rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    tiles.forEach((t, i) => {
      t.color = order[i];
      (t.mesh.material as THREE.MeshToonMaterial).color.setHex(COLORS[t.color].hex);
    });
  }

  /** Knock out a couple of tiles for good once the drop is over. */
  private crumble(): void {
    const n = Math.min(3, 1 + Math.floor(this.round / 2));
    for (let k = 0; k < n; k++) {
      const left = this.present;
      if (left.length <= MIN_TILES) return;
      const t = left[this.game.rng.int(0, left.length - 1)];
      t.gone = true;
      t.mesh.visible = false;
    }
  }

  private tileUnder(pos: THREE.Vector3): Tile | null {
    const i = Math.floor((pos.x + HALF) / TILE);
    const j = Math.floor((pos.z + HALF) / TILE);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return null;
    const t = this.tiles[i * GRID + j];
    return t.gone ? null : t;
  }

  /** Calls get quicker as rounds go on. */
  private phaseLength(): number {
    return Math.max(1.3, 3 - this.round * 0.2);
  }

  private nearest(pos: THREE.Vector3, color: number | null): Tile | null {
    let best: Tile | null = null;
    let bestD = Infinity;
    for (const t of this.present) {
      if (color !== null && t.color !== color) continue;
      const d = Math.hypot(t.home.x - pos.x, t.home.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private cpu(p: MinigamePlayer): { move: THREE.Vector3; dash: boolean } {
    const pos = p.character.position;
    const none = { move: new THREE.Vector3(), dash: false };
    if (this.phase === 'drop') return none;
    if (this.phase !== 'call') {
      // Wander toward the middle of the floor that's left.
      const t = this.nearest(new THREE.Vector3(), null);
      if (!t) return none;
      return { move: t.home.clone().sub(pos).setY(0).multiplyScalar(0.12), dash: false };
    }
    const rng = this.game.rng;
    if (p.data.reactRound !== this.round) {
      p.data.reactRound = this.round;
      p.data.react = 0.3 + rng.next() * 0.4;
    }
    if (this.phaseLength() - this.phaseTime < (p.data.react as number)) return none;
    if (p.data.goalRound !== this.round) {
      p.data.goalRound = this.round;
      const color = rng.next() < 0.1 ? rng.int(0, COLORS.length - 1) : this.called;
      p.data.goal = this.nearest(pos, color)?.home.clone();
      p.data.bully = rng.next() < 0.35;
    }
    const goal = p.data.goal as THREE.Vector3 | undefined;
    if (!goal) return none;
    // A bully, safe on its own tile, rushes a neighbour who isn't.
    if (p.data.bully && (p.data.cool as number) <= 0 && this.tileUnder(pos)?.color === this.called) {
      for (const o of this.alive) {
        if (o === p) continue;
        const d = o.character.position.clone().sub(pos).setY(0);
        if (d.length() < 1.6 && this.tileUnder(o.character.position)?.color === this.called) {
          return { move: d.normalize(), dash: true };
        }
      }
    }
    const v = goal.clone().sub(pos).setY(0);
    return { move: v.length() < 0.25 ? new THREE.Vector3() : v.normalize(), dash: false };
  }

  play(dt: number): void {
    this.phaseTime -= dt;
    if (this.phaseTime <= 0) this.nextPhase();
    if (this.phase === 'roll') {
      const flick = Math.floor(this.t * (8 + (1 - this.phaseTime) * 6)) % COLORS.length;
      (this.board.material as THREE.MeshToonMaterial).color.setHex(COLORS[flick].hex);
    } else if (this.phase === 'call') {
      const shake = this.phaseTime < 0.9 ? Math.sin(this.t * 60) * 0.05 : 0;
      for (const t of this.tiles) t.mesh.position.x = t.home.x + (t.color === this.called ? 0 : shake);
    } else if (this.phase === 'drop') {
      for (const t of this.tiles) if (t.color !== this.called) t.mesh.position.y -= 18 * dt;
    }

    for (const p of this.alive) {
      const c = p.character;
      let move: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        move = stick(p);
        dash = p.controller.pressed('a');
      } else ({ move, dash } = this.cpu(p));
      p.data.cool = (p.data.cool as number) - dt;
      if (dash && (p.data.cool as number) <= 0) {
        p.data.dash = DASH_TIME;
        p.data.cool = DASH_COOLDOWN;
        if (move.lengthSq() > 0.01) face(p, move, 1);
        this.game.audio.play('jump');
      }
      const push = p.data.push as THREE.Vector3;
      if ((p.data.dash as number) > 0) {
        p.data.dash = (p.data.dash as number) - dt;
        const fwd = new THREE.Vector3(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
        c.position.addScaledVector(fwd, DASH_SPEED * dt);
        c.pose = 'jump';
        this.shoveFrom(p, fwd);
      } else {
        c.position.addScaledVector(move, SPEED * dt);
        face(p, move, dt);
        moveAnim(p, move.length());
      }
      c.position.addScaledVector(push, dt);
      push.multiplyScalar(Math.max(0, 1 - dt * 5));
      c.position.y = 0;
    }
    separate(this.alive, 0.4);

    for (const p of this.alive) {
      const t = this.tileUnder(p.character.position);
      if (!t || t.mesh.position.y < -0.8) this.drop(p);
    }
    if (this.alive.length <= 1 && this.players.length > 1) this.finish(this.alive);
  }

  private shoveFrom(p: MinigamePlayer, fwd: THREE.Vector3): void {
    for (const o of this.alive) {
      if (o === p || (o.data.hitBy === p.seat && (o.data.push as THREE.Vector3).length() > 1)) continue;
      const d = o.character.position.clone().sub(p.character.position).setY(0);
      if (d.length() > 0.95) continue;
      const dir = d.lengthSq() > 0.0001 ? d.normalize().add(fwd).normalize() : fwd.clone();
      (o.data.push as THREE.Vector3).copy(dir.multiplyScalar(SHOVE));
      o.data.hitBy = p.seat;
      p.data.dash = 0;
      o.character.setExpression('surprised');
      this.game.audio.play('pop');
    }
  }

  private drop(p: MinigamePlayer): void {
    knockOut(p, (p.data.push as THREE.Vector3).clone().multiplyScalar(0.3).add(new THREE.Vector3(0, -4, 0)));
    this.game.audio.play('back');
  }

  private nextPhase(): void {
    const mat = this.board.material as THREE.MeshToonMaterial;
    if (this.phase === 'rise') {
      this.phase = 'roll';
      this.round++;
      this.phaseTime = 1;
      this.sign.style.display = '';
      this.sign.textContent = 'Which color…?';
      this.game.audio.play('dice');
    } else if (this.phase === 'roll') {
      this.phase = 'call';
      // Only call a color that's still on the floor.
      const left = [...new Set(this.present.map((t) => t.color))];
      this.called = left[this.game.rng.int(0, left.length - 1)];
      this.phaseTime = this.phaseLength();
      const c = COLORS[this.called];
      mat.color.setHex(c.hex);
      this.sign.innerHTML = `<span style="color:${css(c.hex)};-webkit-text-stroke:1px #2b2440">${c.name}</span>!`;
      this.game.audio.play('select');
    } else if (this.phase === 'call') {
      this.phase = 'drop';
      this.phaseTime = 1.4;
      this.sign.style.display = 'none';
      this.game.audio.play('boom');
      for (const t of this.tiles) t.mesh.position.x = t.home.x;
    } else {
      this.phase = 'rise';
      this.phaseTime = 0.8;
      mat.color.setHex(Palette.cream);
      for (const t of this.tiles) t.mesh.position.copy(t.home);
      this.crumble();
      this.paint();
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) if (!p.alive) fall(p, dt);
    for (const p of this.alive) if (p.character.pose === 'jump' && (p.data.dash as number) <= 0) p.character.pose = 'idle';
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const colorDrop: MinigameDef = {
  id: 'colordrop',
  name: 'Color Drop',
  kind: 'ffa',
  duel: true,
  song: colorDropTheme,
  rules: 'The sign spins and lands on a color. Every other tile falls into the sea! Tiles crumble away for good each round, and A shoves rivals. Last one standing wins!',
  controls: 'Stick: move · A: shove',
  create: () => new ColorDrop(),
};
