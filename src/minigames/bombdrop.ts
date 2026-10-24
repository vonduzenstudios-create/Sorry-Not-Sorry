import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 6.5;
const SPEED = 5;
const BLAST = 1.7;
const DROP_HEIGHT = 14;
const FALL_TIME = 1.3;

interface Bomb {
  group: THREE.Group;
  shadow: THREE.Mesh;
  target: THREE.Vector3;
  t: number;
}

interface Blast {
  mesh: THREE.Mesh;
  t: number;
}

function makeBomb(): THREE.Group {
  const g = new THREE.Group();
  const body = toonMesh(new THREE.SphereGeometry(0.5, 20, 14), 0x3a3352, { outline: 0.03 });
  const cap = toonMesh(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 12), 0x8a84a0, { outline: 0.02 });
  cap.position.y = 0.52;
  const fuse = toonMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), Palette.sand, { outline: false });
  fuse.position.set(0.06, 0.72, 0);
  fuse.rotation.z = -0.4;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  spark.position.set(0.15, 0.88, 0);
  g.add(body, cap, fuse, spark);
  return g;
}

/** Bombs rain onto a tiny island. Watch the shadows and survive. */
class BombDrop extends Minigame {
  readonly timeLimit = 30;
  private bombs: Bomb[] = [];
  private blasts: Blast[] = [];
  private spawnTimer = 0.6;

  protected setup(): void {
    arenaBasics(this.scene, [0x8ec9ff, 0xfde4f2], 0x7cc8ec, -2);
    const island = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS * 1.1, 2.4, 48), Palette.sand, { outline: 0.07 });
    island.position.y = -1.2;
    const grass = toonMesh(new THREE.CylinderGeometry(RADIUS - 0.6, RADIUS - 0.6, 0.12, 48), Palette.grass, { outline: false });
    grass.position.y = 0.02;
    this.scene.add(island, grass);
    ring(this.players, 3);
    this.camera.position.set(0, 15, 13);
    this.camera.lookAt(0, 0, 0.6);
  }

  private spawn(): void {
    // Half the bombs aim near a random survivor so nobody can just stand still.
    const alive = this.alive;
    const target = new THREE.Vector3();
    if (alive.length && this.game.rng.next() < 0.5) {
      target.copy(this.game.rng.pick(alive).character.position);
      target.x += this.game.rng.range(-1.2, 1.2);
      target.z += this.game.rng.range(-1.2, 1.2);
    } else {
      const r = Math.sqrt(this.game.rng.next()) * (RADIUS - 0.5);
      const a = this.game.rng.range(0, Math.PI * 2);
      target.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    target.y = 0;
    const group = makeBomb();
    group.position.copy(target).setY(DROP_HEIGHT);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BLAST, 32),
      new THREE.MeshBasicMaterial({ color: Palette.ink, transparent: true, opacity: 0.15 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.copy(target).setY(0.1);
    this.scene.add(group, shadow);
    this.bombs.push({ group, shadow, target, t: 0 });
  }

  private explode(b: Bomb): void {
    this.scene.remove(b.group, b.shadow);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BLAST, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 }),
    );
    mesh.position.copy(b.target);
    this.scene.add(mesh);
    this.blasts.push({ mesh, t: 0 });
    this.game.audio.play('boom');
    for (const p of this.alive) {
      const d = p.character.position.clone().setY(0).sub(b.target);
      if (d.length() < BLAST) knockOut(p, d.setY(0).normalize().multiplyScalar(8));
    }
  }

  private cpuIntent(p: MinigamePlayer): THREE.Vector3 {
    const pos = p.character.position;
    const away = new THREE.Vector3();
    for (const b of this.bombs) {
      const d = pos.clone().setY(0).sub(b.target);
      const len = d.length();
      // Reaction gets sharper as the bomb gets lower, with a little per-CPU slack.
      if (len < BLAST + 1 && b.t > 0.15 + (p.seat % 3) * 0.12) away.addScaledVector(d.normalize(), (BLAST + 1 - len) * 2);
    }
    const flat = Math.hypot(pos.x, pos.z);
    if (flat > RADIUS - 1.6) away.add(new THREE.Vector3(-pos.x, 0, -pos.z).normalize().multiplyScalar(1.5));
    return away.lengthSq() > 1 ? away.normalize() : away;
  }

  play(dt: number): void {
    const progress = this.t / this.timeLimit;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = Math.max(0.22, 0.75 - progress * 0.6);
    }

    for (const b of [...this.bombs]) {
      b.t += dt / FALL_TIME;
      b.group.position.y = DROP_HEIGHT * (1 - b.t * b.t);
      b.group.rotation.z = b.t * 3;
      (b.shadow.material as THREE.MeshBasicMaterial).opacity = 0.1 + b.t * 0.35;
      if (b.t >= 1) {
        this.bombs.splice(this.bombs.indexOf(b), 1);
        this.explode(b);
      }
    }
    for (const bl of [...this.blasts]) {
      bl.t += dt * 3;
      bl.mesh.scale.setScalar(0.5 + bl.t);
      (bl.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - bl.t);
      if (bl.t >= 1) {
        this.blasts.splice(this.blasts.indexOf(bl), 1);
        this.scene.remove(bl.mesh);
      }
    }

    for (const p of this.alive) {
      const dir = p.controller ? stick(p) : this.cpuIntent(p);
      const pos = p.character.position;
      pos.addScaledVector(dir, SPEED * dt);
      // The island edge is a wall: no falling off by accident.
      const flat = Math.hypot(pos.x, pos.z);
      if (flat > RADIUS - 0.5) pos.multiplyScalar((RADIUS - 0.5) / flat);
      pos.y = 0;
      face(p, dir, dt);
      moveAnim(p, dir.length());
    }
    separate(this.alive, 0.4);
    for (const p of this.players) if (!p.alive) fall(p, dt);

    if (this.alive.length <= 1) this.finish(this.alive);
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const bombDrop: MinigameDef = {
  id: 'bombdrop',
  name: 'Bomb Drop',
  kind: 'ffa',
  duel: true,
  rules: 'Bombs are raining down! Watch the shadows and be the last one standing.',
  controls: 'Stick: run',
  create: () => new BombDrop(),
};
