import * as THREE from 'three';
import { fuseTheme } from '../audio/songs/fuseStompThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const TILE = 1.2;
const RADIUS = 7.4;
const SPEED = 4.6;
const GRAVITY = 24;
const COOLDOWN = 1.1;
const FUSE = 1.7;
const THROW_SPEED = 8;
const THROW_VY = 7;
const BLAST = 2.6;
/** Tiles within this of a blast take a hit; two hits and they crumble. */
const CRACK = 1.3;
const SHRINK_AT = 16;
const SHRINK_EVERY = 3;
const MIN_RING = 2.4;

interface Tile {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  hp: number;
  /** Seconds left shaking before it drops; -1 when solid. */
  crumble: number;
  gone: boolean;
  vy: number;
}

interface Bomb {
  group: THREE.Group;
  marker: THREE.Mesh;
  vel: THREE.Vector3;
  fuse: number;
  landed: boolean;
}

interface Blast {
  mesh: THREE.Mesh;
  t: number;
}

function makeBomb(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = toonMesh(new THREE.SphereGeometry(0.32, 18, 12), 0x3a3352, { outline: 0.03 });
  const band = toonMesh(new THREE.TorusGeometry(0.31, 0.05, 6, 20), color, { outline: false });
  band.rotation.x = Math.PI / 2;
  const cap = toonMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 10), 0x8a84a0, { outline: 0.02 });
  cap.position.y = 0.34;
  const fuse = toonMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), Palette.sand, { outline: false });
  fuse.position.set(0.04, 0.47, 0);
  fuse.rotation.z = -0.4;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: Palette.yellow }));
  spark.position.set(0.1, 0.58, 0);
  spark.name = 'spark';
  g.add(body, band, cap, fuse, spark);
  return g;
}

/**
 * Everyone carries an endless supply of bombs. Lob them at your rivals: blasts
 * knock players flying and crack the tiles, and the arena crumbles from the
 * edge in. Last one standing wins.
 */
class FuseFrenzy extends Minigame {
  readonly timeLimit = 50;
  private tiles: Tile[] = [];
  private grid = new Map<string, Tile>();
  private bombs: Bomb[] = [];
  private blasts: Blast[] = [];
  private held = new Map<MinigamePlayer, THREE.Group>();
  private clock = 0;
  private ringR = RADIUS;
  private nextShrink = SHRINK_AT;

  protected setup(): void {
    arenaBasics(this.scene, [0xffb88a, 0xfff0c8], 0xff9a6a, -16);
    const geo = new THREE.BoxGeometry(TILE * 0.94, 0.5, TILE * 0.94);
    const n = Math.ceil(RADIUS / TILE);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const x = i * TILE;
        const z = j * TILE;
        if (Math.hypot(x, z) > RADIUS) continue;
        const mesh = toonMesh(geo, (i + j) % 2 === 0 ? Palette.peach : Palette.cream, { outline: 0.03 });
        mesh.position.set(x, -0.25, z);
        this.scene.add(mesh);
        const tile: Tile = { mesh, x, z, hp: 2, crumble: -1, gone: false, vy: 0 };
        this.tiles.push(tile);
        this.grid.set(`${i},${j}`, tile);
      }
    }
    // A rocky pillar under the arena so it doesn't float in the void.
    const rock = toonMesh(new THREE.ConeGeometry(RADIUS * 0.9, 9, 10), 0xb07a5a, { outline: 0.06 });
    rock.rotation.x = Math.PI;
    rock.position.y = -5.4;
    this.scene.add(rock);

    ring(this.players, 4.2);
    for (const p of this.players) {
      p.data.vel = new THREE.Vector3();
      p.data.vy = 0;
      p.data.cd = 0.6;
      p.data.stun = 0;
      p.data.aim = 0;
      // CPU personality, rolled fresh each game so no seat has an edge.
      const rng = this.game.rng;
      p.data.range = rng.range(4.2, 5.4);
      p.data.orbit = rng.range(0.2, 0.45) * (rng.next() < 0.5 ? -1 : 1);
      p.data.react = rng.range(0.3, 0.7);
      p.data.patience = rng.int(5, 16);
      const bomb = makeBomb(p.character.def.colors.accent);
      this.scene.add(bomb);
      this.held.set(p, bomb);
    }
    this.camera.position.set(0, 17, 13);
    this.camera.lookAt(0, 0, 0.8);
  }

  private tileAt(x: number, z: number): Tile | undefined {
    const t = this.grid.get(`${Math.round(x / TILE)},${Math.round(z / TILE)}`);
    return t && !t.gone ? t : undefined;
  }

  private startCrumble(t: Tile, delay: number): void {
    if (t.crumble < 0 && !t.gone) t.crumble = delay;
  }

  private throwBomb(p: MinigamePlayer): void {
    const r = p.character.rotation.y;
    const dir = new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
    const group = makeBomb(p.character.def.colors.accent);
    group.position.copy(p.character.position).add(dir.clone().multiplyScalar(0.5)).setY(p.character.position.y + 1.9);
    // Where it will come down, shown as a warning ring.
    const flight = (THROW_VY + Math.sqrt(THROW_VY * THROW_VY + 2 * GRAVITY * (group.position.y - 0.3))) / GRAVITY;
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(BLAST * 0.85, BLAST, 32),
      new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.copy(group.position).addScaledVector(dir, THROW_SPEED * flight).setY(0.03);
    this.scene.add(group, marker);
    this.bombs.push({ group, marker, vel: dir.multiplyScalar(THROW_SPEED).setY(THROW_VY), fuse: FUSE, landed: false });
    p.data.cd = COOLDOWN;
    p.data.patience = this.game.rng.int(5, 16);
    this.game.audio.note('pluck', 'G4', 0.08, 0.25);
  }

  private explode(b: Bomb): void {
    this.scene.remove(b.group, b.marker);
    const at = b.group.position.clone().setY(0);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BLAST, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }),
    );
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.blasts.push({ mesh, t: 0 });
    this.game.audio.play('boom');
    for (const p of this.alive) {
      const d = p.character.position.clone().setY(0).sub(at);
      const len = d.length();
      if (len > BLAST) continue;
      if (len < 0.05) d.set(this.game.rng.range(-1, 1), 0, this.game.rng.range(-1, 1));
      d.setY(0).normalize();
      (p.data.vel as THREE.Vector3).addScaledVector(d, 5 + 11 * (1 - len / BLAST));
      p.data.vy = 5.5;
      p.data.stun = 0.55;
      p.character.pose = 'jump';
      p.character.setExpression('surprised');
    }
    for (const t of this.tiles) {
      if (t.gone || Math.hypot(t.x - at.x, t.z - at.z) > CRACK) continue;
      t.hp--;
      if (t.hp <= 0) this.startCrumble(t, 0.6);
      else (t.mesh.material as THREE.MeshToonMaterial) = toonCracked;
    }
  }

  /** Is there floor a little way along this direction? */
  private safe(pos: THREE.Vector3, dir: THREE.Vector3, ahead: number): boolean {
    const t = this.tileAt(pos.x + dir.x * ahead, pos.z + dir.z * ahead);
    return !!t && t.crumble < 0;
  }

  /** CPUs keep throwing range on the nearest rival, dodge warning rings and stay off crumbling floor. */
  private cpu(p: MinigamePlayer): { move: THREE.Vector3; aim: THREE.Vector3 | null; fire: boolean } {
    const pos = p.character.position;
    const rivals = this.alive.filter((o) => o !== p);
    let target: MinigamePlayer | null = null;
    let best = Infinity;
    for (const o of rivals) {
      const d = o.character.position.distanceTo(pos);
      if (d < best) {
        best = d;
        target = o;
      }
    }
    const want = new THREE.Vector3();
    let aim: THREE.Vector3 | null = null;
    if (target) {
      const to = target.character.position.clone().sub(pos).setY(0);
      aim = to.clone().normalize();
      const range = p.data.range as number;
      want.addScaledVector(aim, THREE.MathUtils.clamp((best - range) * 0.6, -1, 1));
      // Circle a little so fights don't freeze in place.
      want.add(new THREE.Vector3(-aim.z, 0, aim.x).multiplyScalar(p.data.orbit as number));
    }
    const react = p.data.react as number;
    for (const b of this.bombs) {
      const d = pos.clone().sub(b.marker.position).setY(0);
      const len = d.length();
      if (len < BLAST + 0.6 && b.fuse < FUSE - react) want.addScaledVector(d.normalize(), (BLAST + 0.6 - len) * 1.6);
    }
    // Drift back toward the middle when near the edge of what's left.
    const home = new THREE.Vector3(-pos.x, 0, -pos.z);
    if (home.length() > this.ringR - 2.2) want.addScaledVector(home.normalize(), 1);
    let move = want.lengthSq() > 1 ? want.normalize() : want;
    if (move.lengthSq() > 0.01 && !this.safe(pos, move.clone().normalize(), 0.9)) {
      // Try nearby headings and take the first that has floor.
      const base = Math.atan2(move.x, move.z);
      move = new THREE.Vector3();
      for (const off of [0.5, -0.5, 1.1, -1.1, 1.7, -1.7, Math.PI]) {
        const d = new THREE.Vector3(Math.sin(base + off), 0, Math.cos(base + off));
        if (this.safe(pos, d, 0.9)) {
          move = d.multiplyScalar(0.8);
          break;
        }
      }
    }
    let fire = false;
    if (aim && (p.data.cd as number) <= 0 && best > 2.6 && best < 6.8) {
      const r = p.character.rotation.y;
      const facing = Math.atan2(aim.x, aim.z);
      const off = Math.abs(Math.atan2(Math.sin(facing - r), Math.cos(facing - r)));
      p.data.aim = off < 0.3 ? (p.data.aim as number) + 1 : 0;
      fire = (p.data.aim as number) > (p.data.patience as number);
    }
    return { move, aim, fire };
  }

  play(dt: number): void {
    this.clock += dt;
    if (this.clock >= this.nextShrink && this.ringR > MIN_RING) {
      this.nextShrink += SHRINK_EVERY;
      this.ringR -= TILE;
      for (const t of this.tiles) if (Math.hypot(t.x, t.z) > this.ringR) this.startCrumble(t, 1.2);
    }

    for (const t of this.tiles) {
      if (t.gone) {
        if (t.mesh.visible) {
          t.vy -= GRAVITY * dt;
          t.mesh.position.y += t.vy * dt;
          t.mesh.rotation.x += dt * 1.5;
          if (t.mesh.position.y < -20) t.mesh.visible = false;
        }
        continue;
      }
      if (t.crumble < 0) continue;
      t.crumble -= dt;
      t.mesh.position.x = t.x + Math.sin(this.clock * 60 + t.z) * 0.05;
      if (t.crumble <= 0) t.gone = true;
    }

    for (const b of [...this.bombs]) {
      b.fuse -= dt;
      const pos = b.group.position;
      if (!b.landed) {
        b.vel.y -= GRAVITY * dt;
        pos.addScaledVector(b.vel, dt);
        b.group.rotation.x += dt * 8;
        if (pos.y <= 0.3 && b.vel.y < 0 && this.tileAt(pos.x, pos.z)) {
          pos.y = 0.3;
          b.landed = true;
          b.vel.set(b.vel.x * 0.25, 0, b.vel.z * 0.25);
          b.group.rotation.x = 0;
          b.marker.position.set(pos.x, 0.03, pos.z);
        }
      } else {
        pos.addScaledVector(b.vel, dt);
        b.vel.multiplyScalar(Math.exp(-5 * dt));
        b.marker.position.set(pos.x, 0.03, pos.z);
        if (!this.tileAt(pos.x, pos.z)) b.landed = false;
      }
      const pulse = 1 + Math.max(0, 0.6 - b.fuse) * Math.abs(Math.sin(b.fuse * 30)) * 0.5;
      b.group.scale.setScalar(pulse);
      (b.marker.material as THREE.MeshBasicMaterial).opacity = 0.25 + (1 - b.fuse / FUSE) * 0.45;
      if (pos.y < -4) {
        this.bombs.splice(this.bombs.indexOf(b), 1);
        this.scene.remove(b.group, b.marker);
      } else if (b.fuse <= 0) {
        this.bombs.splice(this.bombs.indexOf(b), 1);
        this.explode(b);
      }
    }
    for (const bl of [...this.blasts]) {
      bl.t += dt * 3;
      bl.mesh.scale.setScalar(0.4 + bl.t * 0.7);
      (bl.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - bl.t);
      if (bl.t >= 1) {
        this.blasts.splice(this.blasts.indexOf(bl), 1);
        this.scene.remove(bl.mesh);
      }
    }

    for (const p of this.alive) {
      const c = p.character;
      const vel = p.data.vel as THREE.Vector3;
      p.data.cd = (p.data.cd as number) - dt;
      p.data.stun = (p.data.stun as number) - dt;
      let move = new THREE.Vector3();
      let fire = false;
      if (p.controller) {
        move = stick(p);
        fire = p.controller.pressed('a');
        face(p, move, dt);
      } else {
        const intent = this.cpu(p);
        move = intent.move;
        fire = intent.fire;
        face(p, intent.aim && move.lengthSq() < 0.5 ? intent.aim : move.lengthSq() > 0.01 ? move : (intent.aim ?? move), dt);
      }
      const stunned = (p.data.stun as number) > 0;
      if (stunned) move.set(0, 0, 0);
      if (fire && !stunned && (p.data.cd as number) <= 0) this.throwBomb(p);

      c.position.addScaledVector(move, SPEED * dt).addScaledVector(vel, dt);
      vel.multiplyScalar(Math.exp(-3.2 * dt));
      const floor = this.tileAt(c.position.x, c.position.z);
      const vy = p.data.vy as number;
      if (c.position.y > 0 || vy > 0 || !floor) {
        p.data.vy = vy - GRAVITY * dt;
        c.position.y += (p.data.vy as number) * dt;
        if (c.position.y <= 0 && floor) {
          c.position.y = 0;
          p.data.vy = 0;
          c.land();
          c.pose = 'idle';
          c.setExpression('determined');
        } else if (c.position.y < -0.4) {
          knockOut(p, vel.clone().setY(0));
          this.game.audio.play('back');
        }
      } else moveAnim(p, move.length());
    }
    separate(this.alive.filter((p) => p.character.position.y >= 0), 0.42);

    if (this.alive.length <= 1) this.finish(this.alive);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) if (!p.alive) fall(p, dt);
    for (const [p, bomb] of this.held) {
      const ready = p.alive && ((p.data.cd as number) ?? 0) <= 0 && p.character.visible;
      bomb.visible = ready;
      if (ready) bomb.position.copy(p.character.position).setY(p.character.position.y + 1.9 + Math.sin(this.t * 6) * 0.04);
    }
    for (const b of this.bombs) {
      const spark = b.group.getObjectByName('spark');
      if (spark) spark.scale.setScalar(0.7 + Math.abs(Math.sin(this.t * 25)) * 0.8);
    }
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

/** Shared look for tiles that have taken one hit. */
const toonCracked = (() => {
  const m = toonMesh(new THREE.BoxGeometry(1, 1, 1), 0xd99a7a, { outline: false });
  return m.material as THREE.MeshToonMaterial;
})();

export const fuseFrenzy: MinigameDef = {
  id: 'fusefrenzy',
  name: 'Fuse Frenzy',
  kind: 'ffa',
  duel: true,
  song: fuseTheme,
  rules: 'Lob bombs at your rivals! Blasts send players flying and crack the floor, and the arena crumbles from the edge in. Last one standing wins!',
  controls: 'Stick: move · A: throw a bomb',
  create: () => new FuseFrenzy(),
};
