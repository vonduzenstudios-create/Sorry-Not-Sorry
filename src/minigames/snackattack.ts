import * as THREE from 'three';
import { snackTheme } from '../audio/songs/kartSnackThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, ring, scorePanel, separate, stick, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF = 7;
const SPEED = 6.2;
const STINK_SPEED = 2.8;
const CATCH = 0.85;
const BASKET_Y = 2.15;
const FRENZY = 10;

type FruitKind = 'apple' | 'orange' | 'banana' | 'grapes' | 'golden' | 'rotten';
const VALUES: Record<FruitKind, number> = { apple: 1, orange: 1, banana: 1, grapes: 1, golden: 3, rotten: -2 };

interface Fruit {
  mesh: THREE.Object3D;
  shadow: THREE.Mesh;
  kind: FruitKind;
  vy: number;
  spin: number;
  /** Rotates which CPU backs off when two are equally close. */
  id: number;
}

interface Splat {
  mesh: THREE.Mesh;
  life: number;
}

/**
 * Snacks drop from a giant tree. Catch them in the basket on your head before
 * they splat: golden fruit is worth 3, rotten fruit costs 2 and leaves you
 * stinky and slow. Most snacks when time runs out wins.
 */
class SnackAttack extends Minigame {
  readonly timeLimit = 35;
  private fruit: Fruit[] = [];
  private splats: Splat[] = [];
  private spawn = 0.4;
  private dropped = 0;
  private board!: HTMLDivElement;
  private shadowGeo = new THREE.CircleGeometry(0.4, 16);
  private shadowMat = new THREE.MeshBasicMaterial({ color: Palette.ink, transparent: true, opacity: 0.25 });
  private canopy = new THREE.Group();

  protected setup(): void {
    arenaBasics(this.scene, [0xa8e0ff, 0xf4ffe0], Palette.grassDark, -2);
    // Picnic blanket: a checkered square on the lawn.
    const lawn = toonMesh(new THREE.BoxGeometry(HALF * 2 + 6, 0.6, HALF * 2 + 6), Palette.grass, { outline: 0.05 });
    lawn.position.y = -0.3;
    this.scene.add(lawn);
    const tiles = 8;
    const size = (HALF * 2) / tiles;
    for (let x = 0; x < tiles; x++) {
      for (let z = 0; z < tiles; z++) {
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: (x + z) % 2 ? Palette.cream : Palette.coral }));
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(-HALF + size * (x + 0.5), 0.01, -HALF + size * (z + 0.5));
        this.scene.add(tile);
      }
    }
    // The tree: trunk behind the blanket, a leafy canopy overhead (kept high so it doesn't block the view).
    const trunk = toonMesh(new THREE.CylinderGeometry(1.1, 1.6, 14, 12), 0xb07a52, { outline: 0.06 });
    trunk.position.set(0, 7, -HALF - 3);
    this.scene.add(trunk);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = toonMesh(new THREE.IcosahedronGeometry(2.6 + (i % 3) * 0.5, 1), i % 2 ? Palette.green : Palette.grassDark, { outline: 0.06 });
      leaf.position.set(Math.cos(a) * 6, 13 + (i % 3), -HALF - 2 + Math.sin(a) * 3);
      this.canopy.add(leaf);
    }
    this.scene.add(this.canopy);

    ring(this.players, 3.5);
    for (const p of this.players) {
      p.data.snacks = 0;
      p.data.stink = 0;
      const basket = new THREE.Group();
      const bowl = toonMesh(new THREE.CylinderGeometry(0.55, 0.38, 0.4, 16, 1, true), 0xd9a066, { outline: 0.03 });
      bowl.material = (bowl.material as THREE.MeshToonMaterial).clone();
      (bowl.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
      const bottom = toonMesh(new THREE.CircleGeometry(0.38, 16), 0xb07a52, { outline: false });
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = -0.19;
      const band = toonMesh(new THREE.TorusGeometry(0.55, 0.06, 6, 20), p.character.def.colors.accent, { outline: false });
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.2;
      basket.add(bowl, bottom, band);
      basket.position.y = BASKET_Y;
      p.character.add(basket);
      p.data.basket = basket;
    }
    this.camera.position.set(0, 16, 13.5);
    this.camera.lookAt(0, 0.6, 0.4);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">● ${p.data.snacks as number}</span>`)
      .join('');
  }

  private makeFruit(kind: FruitKind): THREE.Object3D {
    const g = new THREE.Group();
    const stem = (y: number) => {
      const s = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5), 0x7a5230, { outline: false });
      s.position.y = y;
      g.add(s);
    };
    switch (kind) {
      case 'apple': {
        g.add(toonMesh(new THREE.SphereGeometry(0.34, 16, 12), 0xff5a5a, { outline: 0.03 }));
        stem(0.38);
        const leaf = toonMesh(new THREE.SphereGeometry(0.1, 8, 6), Palette.green, { outline: false });
        leaf.scale.set(1.4, 0.4, 0.8);
        leaf.position.set(0.12, 0.4, 0);
        g.add(leaf);
        break;
      }
      case 'orange':
        g.add(toonMesh(new THREE.SphereGeometry(0.34, 16, 12), 0xffa63f, { outline: 0.03 }));
        stem(0.36);
        break;
      case 'banana': {
        const b = toonMesh(new THREE.TorusGeometry(0.32, 0.11, 8, 16, Math.PI * 0.9), 0xffe14a, { outline: 0.03 });
        b.rotation.z = Math.PI * 1.05;
        g.add(b);
        break;
      }
      case 'grapes':
        for (const [x, y, z] of [[0, 0.15, 0], [-0.14, 0, 0.05], [0.14, 0, 0.05], [0, 0, -0.12], [-0.07, -0.15, 0], [0.07, -0.15, 0], [0, -0.28, 0]]) {
          const grape = toonMesh(new THREE.SphereGeometry(0.12, 10, 8), 0xa66bff, { outline: 0.02 });
          grape.position.set(x, y, z);
          g.add(grape);
        }
        stem(0.3);
        break;
      case 'golden': {
        const body = toonMesh(new THREE.SphereGeometry(0.34, 16, 12), Palette.yellow, { outline: 0.03, emissive: 0x6a5200 });
        body.scale.y = 1.3;
        g.add(body);
        for (let i = 0; i < 5; i++) {
          const blade = toonMesh(new THREE.ConeGeometry(0.07, 0.4, 5), Palette.green, { outline: false });
          blade.position.set(Math.cos(i * 1.26) * 0.08, 0.6, Math.sin(i * 1.26) * 0.08);
          blade.rotation.set(Math.sin(i * 1.26) * 0.5, 0, -Math.cos(i * 1.26) * 0.5);
          g.add(blade);
        }
        break;
      }
      case 'rotten': {
        const body = toonMesh(new THREE.SphereGeometry(0.36, 12, 10), 0x7f8a4a, { outline: 0.03 });
        body.scale.set(1.1, 0.85, 1);
        g.add(body);
        for (let i = 0; i < 4; i++) {
          const spot = toonMesh(new THREE.SphereGeometry(0.1, 6, 5), 0x4a3a2a, { outline: false });
          spot.position.set(Math.cos(i * 1.6) * 0.33, Math.sin(i * 2.3) * 0.15, Math.sin(i * 1.6) * 0.33);
          g.add(spot);
        }
        // Little flies buzzing around it.
        const flies = new THREE.Group();
        flies.name = 'flies';
        for (let i = 0; i < 3; i++) {
          const fly = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: Palette.ink }));
          fly.position.set(Math.cos(i * 2.1) * 0.55, 0.25 + i * 0.1, Math.sin(i * 2.1) * 0.55);
          flies.add(fly);
        }
        g.add(flies);
        break;
      }
    }
    return g;
  }

  private drop(): void {
    const rng = this.game.rng;
    const r = rng.next();
    const frenzy = this.timeLimit - this.t < FRENZY;
    const kind: FruitKind =
      r < (frenzy ? 0.3 : 0.22) ? 'rotten' : r < (frenzy ? 0.4 : 0.3) ? 'golden' : rng.pick(['apple', 'orange', 'banana', 'grapes'] as const);
    const mesh = this.makeFruit(kind);
    mesh.position.set(rng.range(-HALF + 0.7, HALF - 0.7), 11 + rng.next() * 2, rng.range(-HALF + 0.7, HALF - 0.7));
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(mesh.position.x, 0.03, mesh.position.z);
    this.scene.add(mesh, shadow);
    this.fruit.push({ mesh, shadow, kind, vy: -2 - rng.next() * 2, spin: rng.range(-3, 3), id: this.dropped++ });
  }

  private remove(f: Fruit): void {
    this.scene.remove(f.mesh, f.shadow);
    this.fruit.splice(this.fruit.indexOf(f), 1);
  }

  private splat(f: Fruit): void {
    const color = f.kind === 'rotten' ? 0x6b6a3a : f.kind === 'golden' ? Palette.yellow : f.kind === 'grapes' ? 0xa66bff : f.kind === 'orange' ? 0xffa63f : f.kind === 'banana' ? 0xffe14a : 0xff5a5a;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 10), new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(f.mesh.position.x, 0.02, f.mesh.position.z);
    this.scene.add(mesh);
    this.splats.push({ mesh, life: 1.5 });
  }

  /** Seconds until a fruit falls to basket height. */
  private eta(f: Fruit): number {
    const h = f.mesh.position.y - BASKET_Y;
    if (h <= 0) return 0;
    // Solve h = -vy*t + 4.5*t^2 for t (gravity 9).
    const v = -f.vy;
    return (-v + Math.sqrt(v * v + 18 * h)) / 9;
  }

  /** CPUs pick the best snack they can get under in time, and steer around rotten ones. */
  private cpu(p: MinigamePlayer): THREE.Vector3 {
    const pos = p.character.position;
    const speed = (p.data.stink as number) > 0 ? STINK_SPEED : SPEED;
    let best: Fruit | null = null;
    let score = -Infinity;
    for (const f of this.fruit) {
      if (f.kind === 'rotten') continue;
      const dist = Math.hypot(f.mesh.position.x - pos.x, f.mesh.position.z - pos.z);
      const eta = this.eta(f);
      // Hopeless if it'll land before we get there.
      if (dist / speed > eta + 0.15) continue;
      const rivalCloser = this.players.some((o) => {
        if (o === p) return false;
        const od = Math.hypot(f.mesh.position.x - o.character.position.x, f.mesh.position.z - o.character.position.z);
        return od < dist - 0.4 || (od < dist + 0.4 && (o.seat + f.id) % 4 < (p.seat + f.id) % 4);
      });
      const s = VALUES[f.kind] * 2.5 - dist * 0.6 - eta * 0.8 - (rivalCloser ? 5 : 0) + Math.sin(p.seat * 2.3 + f.mesh.position.z) * 0.7;
      if (s > score) {
        score = s;
        best = f;
      }
    }
    const dir = best ? new THREE.Vector3(best.mesh.position.x - pos.x, 0, best.mesh.position.z - pos.z) : new THREE.Vector3(-pos.x * 0.3, 0, -pos.z * 0.3);
    if (dir.length() < 0.15) dir.set(0, 0, 0);
    else dir.normalize();
    for (const f of this.fruit) {
      if (f.kind !== 'rotten' || this.eta(f) > 1.2) continue;
      const away = new THREE.Vector3(pos.x - f.mesh.position.x, 0, pos.z - f.mesh.position.z);
      const d = away.length();
      if (d < 1.6) dir.addScaledVector(away.normalize(), 2.5 / Math.max(0.3, d));
    }
    if (dir.lengthSq() < 0.02) return new THREE.Vector3();
    return dir.lengthSq() > 1 ? dir.normalize().multiplyScalar(0.9) : dir.multiplyScalar(0.9);
  }

  play(dt: number): void {
    const frenzy = this.timeLimit - this.t < FRENZY;
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.drop();
      this.spawn = frenzy ? 0.16 : 0.26;
    }

    for (const p of this.players) {
      const c = p.character;
      const stink = p.data.stink as number;
      if (stink > 0) p.data.stink = Math.max(0, stink - dt);
      const move = p.controller ? stick(p) : this.cpu(p);
      c.position.addScaledVector(move, (stink > 0 ? STINK_SPEED : SPEED) * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF + 0.4, HALF - 0.4);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HALF + 0.4, HALF - 0.4);
      face(p, move, dt);
      moveAnim(p, move.length());
      if (stink > 0) c.pose = move.length() > 0.08 ? 'walk' : 'sulk';
    }
    separate(this.players, 0.5);

    for (const f of [...this.fruit]) {
      f.vy -= 9 * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.rotation.y += f.spin * dt;
      f.shadow.scale.setScalar(Math.max(0.3, 1 - f.mesh.position.y / 13));
      if (f.mesh.position.y < 0.3) {
        this.splat(f);
        this.remove(f);
        continue;
      }
      // Into the basket: fruit near basket height and over a player.
      const y = f.mesh.position.y;
      if (y > BASKET_Y + 0.5 || y < BASKET_Y - 0.6) continue;
      // Closest basket gets it, so crowding under one fruit is fair.
      let p: MinigamePlayer | null = null;
      let near = CATCH * CATCH;
      for (const o of this.players) {
        const dx = o.character.position.x - f.mesh.position.x;
        const dz = o.character.position.z - f.mesh.position.z;
        if (dx * dx + dz * dz > near) continue;
        near = dx * dx + dz * dz;
        p = o;
      }
      if (p) {
        p.data.snacks = Math.max(0, (p.data.snacks as number) + VALUES[f.kind]);
        if (f.kind === 'rotten') {
          p.data.stink = 1.6;
          p.character.setExpression('sad');
          this.game.audio.play('back');
          this.splat(f);
        } else {
          p.character.setExpression('happy');
          this.game.audio.play(f.kind === 'golden' ? 'star' : 'coin');
        }
        this.renderScore();
        this.remove(f);
      }
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    this.canopy.rotation.z = Math.sin(this.t * 0.8) * 0.01;
    this.canopy.position.y = Math.sin(this.t * 1.3) * 0.08;
    for (const f of this.fruit) {
      const flies = f.mesh.getObjectByName('flies');
      if (flies) flies.rotation.y = this.t * 9;
    }
    for (const p of this.players) {
      // Stinky players wobble their basket.
      const basket = p.data.basket as THREE.Group;
      basket.rotation.z = (p.data.stink as number) > 0 ? Math.sin(this.t * 20) * 0.15 : 0;
    }
    for (const s of [...this.splats]) {
      s.life -= dt;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.life);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.splats.splice(this.splats.indexOf(s), 1);
      }
    }
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p.data.snacks as number;
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => p.data.snacks as number, 0);
  }
}

export const snackAttack: MinigameDef = {
  id: 'snackattack',
  name: 'Snack Attack',
  kind: 'ffa',
  duel: true,
  rules: 'Catch falling fruit in your basket before it splats. Golden fruit is worth 3. Rotten fruit costs 2 and makes you stinky and slow. Most snacks wins!',
  controls: 'Stick: run',
  song: snackTheme,
  create: () => new SnackAttack(),
};
