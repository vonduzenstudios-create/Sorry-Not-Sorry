import * as THREE from 'three';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HEX = 1.25;
const RINGS = 3;
const SPEED = 5.2;
const COLORS = [
  { name: 'Mint', hex: Palette.green },
  { name: 'Peach', hex: 0xffa577 },
  { name: 'Lavender', hex: Palette.violet },
  { name: 'Butter', hex: Palette.yellow },
];

interface Tile {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  color: number;
}

type Phase = 'call' | 'drop' | 'rise';

/** A color is called; every hex of another color drops. Stand on the right one! */
class HexHop extends Minigame {
  readonly timeLimit = 50;
  private tiles: Tile[] = [];
  private phase: Phase = 'rise';
  private phaseTime = 1;
  private called = 0;
  private round = 0;
  private sign!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xffd9b8, 0xffeef5], 0x7a5aa8, -14);
    const geo = new THREE.CylinderGeometry(HEX * 0.93, HEX * 0.93, 0.5, 6);
    for (let q = -RINGS; q <= RINGS; q++) {
      for (let r = -RINGS; r <= RINGS; r++) {
        if (Math.abs(q + r) > RINGS) continue;
        // Pointy-top along Z (CylinderGeometry puts a corner on +Z).
        const x = HEX * Math.sqrt(3) * (q + r / 2);
        const z = HEX * 1.5 * r;
        const mesh = toonMesh(geo, Palette.cream, { outline: 0.04 });
        (mesh.material as THREE.MeshToonMaterial) = (mesh.material as THREE.MeshToonMaterial).clone();
        mesh.position.set(x, -0.25, z);
        this.scene.add(mesh);
        this.tiles.push({ mesh, home: mesh.position.clone(), color: 0 });
      }
    }
    this.paint();
    ring(this.players, 3.5);
    this.camera.position.set(0, 16, 13);
    this.camera.lookAt(0, 0, 0.8);
    this.sign = document.createElement('div');
    this.sign.className = 'mg-score panel';
    this.overlay.appendChild(this.sign);
    this.sign.style.display = 'none';
  }

  /** Random colors, but every color appears a fair number of times. */
  private paint(): void {
    const order = this.tiles.map((_, i) => i % COLORS.length);
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.game.rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.tiles.forEach((t, i) => {
      t.color = order[i];
      (t.mesh.material as THREE.MeshToonMaterial).color.setHex(COLORS[t.color].hex);
    });
  }

  private tileUnder(pos: THREE.Vector3): Tile | null {
    let best: Tile | null = null;
    let bestD = HEX;
    for (const t of this.tiles) {
      const d = Math.hypot(t.home.x - pos.x, t.home.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private cpuIntent(p: MinigamePlayer): THREE.Vector3 {
    const pos = p.character.position;
    if (this.phase === 'drop') return new THREE.Vector3();
    if (this.phase === 'rise') {
      // Drift toward the middle between calls.
      return new THREE.Vector3(-pos.x, 0, -pos.z).multiplyScalar(0.08);
    }
    // React after a short, per-CPU delay; sometimes misread the color.
    const callAge = this.phaseLength() - this.phaseTime;
    if (callAge < 0.35 + (p.seat % 3) * 0.2) return new THREE.Vector3();
    if (p.data.goalRound !== this.round) {
      p.data.goalRound = this.round;
      const color = this.game.rng.next() < 0.12 ? this.game.rng.int(0, COLORS.length - 1) : this.called;
      let best: Tile | null = null;
      let bestD = Infinity;
      for (const t of this.tiles) {
        if (t.color !== color) continue;
        const d = Math.hypot(t.home.x - pos.x, t.home.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      p.data.goal = best?.home.clone();
    }
    const goal = p.data.goal as THREE.Vector3 | undefined;
    if (!goal) return new THREE.Vector3();
    const v = goal.clone().sub(pos).setY(0);
    return v.length() < 0.3 ? new THREE.Vector3() : v.normalize();
  }

  /** Calls get quicker as rounds go on. */
  private phaseLength(): number {
    return Math.max(1.4, 3.2 - this.round * 0.25);
  }

  play(dt: number): void {
    this.phaseTime -= dt;
    if (this.phaseTime <= 0) this.nextPhase();
    if (this.phase === 'call') {
      // Wrong tiles shake as a warning in the last second.
      const shake = this.phaseTime < 1 ? Math.sin(this.t * 60) * 0.05 : 0;
      for (const t of this.tiles) t.mesh.position.x = t.home.x + (t.color === this.called ? 0 : shake);
    } else if (this.phase === 'drop') {
      for (const t of this.tiles) if (t.color !== this.called) t.mesh.position.y -= 18 * dt;
    }

    for (const p of this.alive) {
      const dir = p.controller ? stick(p) : this.cpuIntent(p);
      p.character.position.addScaledVector(dir, SPEED * dt);
      face(p, dir, dt);
      moveAnim(p, dir.length());
      p.character.position.y = 0;
    }
    separate(this.alive, 0.4);
    for (const p of this.players) if (!p.alive) fall(p, dt);

    // Anyone off the grid falls too.
    for (const p of this.alive) {
      const t = this.tileUnder(p.character.position);
      if (!t || (this.phase !== 'call' && t.mesh.position.y < -0.8)) this.drop(p);
    }
    if (this.alive.length <= 1 && this.players.length > 1) this.finish(this.alive);
  }

  private drop(p: MinigamePlayer): void {
    knockOut(p, new THREE.Vector3(0, -4, 0));
    this.game.audio.play('back');
  }

  private nextPhase(): void {
    if (this.phase === 'rise') {
      this.phase = 'call';
      this.round++;
      this.called = this.game.rng.int(0, COLORS.length - 1);
      this.phaseTime = this.phaseLength();
      const c = COLORS[this.called];
      this.sign.style.display = '';
      this.sign.innerHTML = `Stand on <span style="color:${css(c.hex)};-webkit-text-stroke:1px #2b2440">${c.name}</span>!`;
      this.game.audio.play('select');
    } else if (this.phase === 'call') {
      this.phase = 'drop';
      this.phaseTime = 1.4;
      this.sign.style.display = 'none';
      this.game.audio.play('boom');
      for (const t of this.tiles) {
        t.mesh.position.x = t.home.x;
        if (t.color !== this.called) t.mesh.position.y -= 0.01;
      }
    } else {
      this.phase = 'rise';
      this.phaseTime = 0.8;
      for (const t of this.tiles) t.mesh.position.copy(t.home);
      this.paint();
    }
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const hexHop: MinigameDef = {
  id: 'hexhop',
  name: 'Hex Hop',
  kind: 'ffa',
  rules: 'A color is called. Get onto a hex of that color before the rest drop away!',
  controls: 'Stick: move',
  create: () => new HexHop(),
};
