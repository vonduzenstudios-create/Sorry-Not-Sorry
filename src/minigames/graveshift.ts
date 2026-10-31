import * as THREE from 'three';
import { graveTheme } from '../audio/songs/graveSwordThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, scorePanel, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 8;
const HALF_Z = 5.5;
const SPEED = 4.4;
const SHOT_SPEED = 15;
const SHOT_LIFE = 0.45;
const COOLDOWN = 0.32;
const STUN = 0.7;
/** A zombie this close catches you. */
const CATCH = 0.62;
const ZOMBIE_SKIN = 0x9fdc8c;
const SHIRTS = [Palette.lavender, Palette.peach, Palette.sky, Palette.rose];

interface Zombie {
  mesh: THREE.Group;
  hp: number;
  speed: number;
  size: number;
  /** 0..1 while climbing out of the ground. */
  rise: number;
  /** Seconds left of a stagger after being hit. */
  stagger: number;
  push: THREE.Vector3;
}

interface Shot {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  owner: MinigamePlayer;
}

interface Puff {
  mesh: THREE.Mesh;
  life: number;
}

/** A chubby, wide-eyed cartoon zombie with its arms out for a hug. */
function makeZombie(shirt: number, size: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  for (const x of [-0.14, 0.14]) {
    const leg = toonMesh(new THREE.CapsuleGeometry(0.1, 0.18, 4, 8), 0x7b8fb8, { outline: 0.02 });
    leg.position.set(x, 0.2, 0);
    body.add(leg);
  }
  const torso = toonMesh(new THREE.CapsuleGeometry(0.3, 0.22, 6, 14), shirt, { outline: 0.03 });
  torso.position.y = 0.62;
  body.add(torso);
  const head = toonMesh(new THREE.SphereGeometry(0.38, 20, 14), ZOMBIE_SKIN, { outline: 0.03 });
  head.position.y = 1.18;
  body.add(head);
  // Mismatched googly eyes and a little stitched frown keep it silly, not scary.
  for (const [x, r] of [
    [-0.14, 0.11],
    [0.15, 0.085],
  ]) {
    const eye = toonMesh(new THREE.SphereGeometry(r, 12, 8), Palette.cream, { outline: false });
    eye.position.set(x, 1.24, 0.31);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 8, 6), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    pupil.position.set(x + (x < 0 ? 0.02 : -0.02), 1.22, 0.31 + r * 0.8);
    body.add(eye, pupil);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: Palette.ink }));
  mouth.position.set(0, 1.03, 0.36);
  body.add(mouth);
  for (const x of [-0.26, 0.26]) {
    const arm = toonMesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 8), ZOMBIE_SKIN, { outline: 0.02 });
    arm.rotation.x = Math.PI / 2;
    arm.position.set(x, 0.78, 0.32);
    body.add(arm);
  }
  g.scale.setScalar(size);
  g.userData.body = body;
  return g;
}

/**
 * Cartoon zombies climb out of the graves around the yard and shuffle after
 * whoever is closest. Fling candy with A to pop them; candy also stuns rivals.
 * Get hugged and you're out. Waves grow faster and thicker. Last one standing wins.
 */
class GraveyardShift extends Minigame {
  readonly timeLimit = 60;
  private zombies: Zombie[] = [];
  private shots: Shot[] = [];
  private puffs: Puff[] = [];
  private graves: THREE.Vector3[] = [];
  private spawnIn = 1.2;
  private spawned = 0;
  private clock = 0;
  private popped: number[] = [];
  private board!: HTMLDivElement;
  private shotGeo = new THREE.SphereGeometry(0.15, 10, 8);
  private puffGeo = new THREE.SphereGeometry(0.5, 12, 8);

  protected setup(): void {
    arenaBasics(this.scene, [0x4b3f86, 0xf7b8d6], 0x3a3470, -3);
    const yard = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 3, 0.6, HALF_Z * 2 + 3), 0x86c79a, { outline: 0.06 });
    yard.position.y = -0.3;
    this.scene.add(yard);
    // A worn dirt path across the middle.
    const path = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2 + 3, 1.6), new THREE.MeshToonMaterial({ color: 0xc9b08a }));
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.01;
    this.scene.add(path);

    const moon = toonMesh(new THREE.SphereGeometry(3, 24, 16), Palette.butter, { outline: false, emissive: 0x8a7a30 });
    moon.position.set(-14, 16, -40);
    this.scene.add(moon);

    // Picket fence round the yard, with gaps where the graves are.
    const picket = new THREE.BoxGeometry(0.16, 0.8, 0.08);
    for (let x = -HALF_X - 1.3; x <= HALF_X + 1.3; x += 0.55) {
      for (const z of [-HALF_Z - 1.4, HALF_Z + 1.4]) {
        if (Math.abs(Math.abs(x) - 4) < 0.8 || Math.abs(x) < 0.5) continue;
        const p = toonMesh(picket, Palette.cream, { outline: 0.02 });
        p.position.set(x, 0.4, z);
        this.scene.add(p);
      }
    }

    // Graves the zombies climb out of: around the edge of the yard.
    const spots: [number, number][] = [
      [-4, -HALF_Z - 1],
      [0, -HALF_Z - 1],
      [4, -HALF_Z - 1],
      [-4, HALF_Z + 1],
      [0, HALF_Z + 1],
      [4, HALF_Z + 1],
      [-HALF_X - 1, -2.5],
      [-HALF_X - 1, 2.5],
      [HALF_X + 1, -2.5],
      [HALF_X + 1, 2.5],
    ];
    spots.forEach(([x, z], i) => {
      const stone = toonMesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 12), i % 2 ? 0xc8c2dc : 0xb4b0cc, { outline: 0.03 });
      stone.scale.set(1, 1, 0.35);
      const back = z < -HALF_Z ? -0.5 : z > HALF_Z ? 0.5 : 0;
      const side = x < -HALF_X ? -0.5 : x > HALF_X ? 0.5 : 0;
      stone.position.set(x + side, 0.55, z + back);
      if (side) stone.rotation.y = Math.PI / 2;
      const mound = toonMesh(new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a7a5a, { outline: 0.02 });
      mound.scale.set(1, 0.35, 1.3);
      mound.position.set(x, 0, z);
      if (side) mound.rotation.y = Math.PI / 2;
      this.scene.add(stone, mound);
      this.graves.push(new THREE.Vector3(x, 0, z));
    });

    // Jack-o'-lanterns in the corners, for show.
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const pumpkin = toonMesh(new THREE.SphereGeometry(0.5, 16, 10), 0xffa860, { outline: 0.03, emissive: 0x402000 });
      pumpkin.scale.y = 0.8;
      pumpkin.position.set(x * (HALF_X + 1.2), 0.4, z * (HALF_Z + 1.2));
      const stem = toonMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 6), 0x6a9a50, { outline: false });
      stem.position.set(0, 0.5, 0);
      pumpkin.add(stem);
      this.scene.add(pumpkin);
    }

    const starts: [number, number][] = [
      [-2, -1.5],
      [2, 1.5],
      [2, -1.5],
      [-2, 1.5],
    ];
    this.players.forEach((p, i) => {
      const [x, z] = starts[i];
      p.character.position.set(x, 0, z);
      p.character.rotation.y = Math.atan2(x, z);
      p.data.cool = 0;
      p.data.stun = 0;
      p.data.aim = new THREE.Vector3(Math.sin(p.character.rotation.y), 0, Math.cos(p.character.rotation.y));
      // CPUs differ a little in nerve and aim.
      p.data.nerve = 3.6 + this.game.rng.next() * 1.4;
      p.data.slack = 0.08 + this.game.rng.next() * 0.12;
      // A candy bucket so you can tell whose candy is whose.
      const bucket = toonMesh(new THREE.CylinderGeometry(0.14, 0.11, 0.2, 12), p.character.def.colors.accent, { outline: 0.02 });
      bucket.position.set(0.38, 0.5, 0.15);
      p.character.add(bucket);
      this.popped.push(0);
    });
    this.camera.position.set(0, 17, 12.5);
    this.camera.lookAt(0, 0, 0.6);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p, i) => `<span style="color:${css(p.character.def.colors.accent)};opacity:${p.alive ? 1 : 0.4}">🍬 ${this.popped[i]}</span>`)
      .join('');
  }

  private spawn(): void {
    const rng = this.game.rng;
    const grave = rng.pick(this.graves);
    const big = this.clock > 18 && this.spawned % 7 === 6;
    const size = big ? 1.45 : 0.95 + rng.next() * 0.15;
    const mesh = makeZombie(rng.pick(SHIRTS), size);
    mesh.position.copy(grave).setY(-1.4 * size);
    mesh.rotation.y = Math.atan2(-grave.x, -grave.z);
    this.scene.add(mesh);
    this.zombies.push({
      mesh,
      hp: big ? 5 : this.clock > 30 ? 2 : 1,
      speed: (1.5 + Math.min(this.clock, 50) * 0.04) * (big ? 0.7 : 1),
      size,
      rise: 0,
      stagger: 0,
      push: new THREE.Vector3(),
    });
    this.spawned++;
  }

  private nearestZombie(pos: THREE.Vector3, within: number): Zombie | null {
    let best: Zombie | null = null;
    let bd = within;
    for (const z of this.zombies) {
      if (z.rise < 1) continue;
      const d = z.mesh.position.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  /** CPUs back away from the crowd and the fence while flinging candy at the closest zombie. */
  private cpu(p: MinigamePlayer): { move: THREE.Vector3; aim: THREE.Vector3 | null; fire: boolean } {
    const pos = p.character.position;
    const nerve = p.data.nerve as number;
    const move = new THREE.Vector3();
    for (const z of this.zombies) {
      const d = new THREE.Vector3(pos.x - z.mesh.position.x, 0, pos.z - z.mesh.position.z);
      const len = d.length();
      if (len > nerve || len === 0) continue;
      move.addScaledVector(d, (z.size / (len * len)) * 2);
    }
    // Fence and center pull so they don't get cornered.
    const wall = (v: number, lim: number) => (Math.abs(v) > lim - 1.8 ? -Math.sign(v) * (Math.abs(v) - (lim - 1.8)) * 1.2 : 0);
    move.x += wall(pos.x, HALF_X) - pos.x * 0.04;
    move.z += wall(pos.z, HALF_Z) - pos.z * 0.04;
    if (move.length() > 1) move.normalize();
    else if (move.length() < 0.15) move.set(0, 0, 0);

    const target = this.nearestZombie(pos, 6);
    if (!target) return { move, aim: null, fire: false };
    const aim = target.mesh.position.clone().sub(pos).setY(0).normalize();
    aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.clock * 3.1 + p.seat * 1.7) * (p.data.slack as number));
    return { move, aim, fire: true };
  }

  private fire(p: MinigamePlayer, dir: THREE.Vector3): void {
    p.data.cool = p.controller ? COOLDOWN : COOLDOWN + 0.18;
    const mesh = toonMesh(this.shotGeo, p.character.def.colors.accent, { outline: false, emissive: 0x222222 });
    mesh.position.copy(p.character.position).addScaledVector(dir, 0.5).setY(0.7);
    this.scene.add(mesh);
    this.shots.push({ mesh, vel: dir.clone().multiplyScalar(SHOT_SPEED), life: SHOT_LIFE, owner: p });
    this.game.audio.note('pluck', 'E6', 0.06, 0.18);
  }

  private poof(at: THREE.Vector3, size: number): void {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: i ? Palette.cream : Palette.mint, transparent: true }));
      mesh.position.copy(at).add(new THREE.Vector3((i - 1) * 0.3 * size, 0.6 * size + i * 0.15, 0));
      mesh.scale.setScalar(0.3 * size);
      this.scene.add(mesh);
      this.puffs.push({ mesh, life: 1 });
    }
  }

  play(dt: number): void {
    this.clock += dt;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawn();
      // Ramps from a trickle to a horde; a second zombie per wave late on.
      this.spawnIn = Math.max(0.22, 1.0 - this.clock * 0.022);
      if (this.clock > 22 && this.spawned % 2 === 0) this.spawn();
    }

    for (const p of this.alive) {
      const c = p.character;
      p.data.cool = Math.max(0, (p.data.cool as number) - dt);
      if ((p.data.stun as number) > 0) {
        p.data.stun = (p.data.stun as number) - dt;
        c.rotation.y += dt * 12;
        c.pose = 'sulk';
        continue;
      }
      let move: THREE.Vector3;
      let aim: THREE.Vector3 | null;
      let fire: boolean;
      if (p.controller) {
        move = stick(p);
        aim = move.lengthSq() > 0.04 ? move.clone().normalize() : null;
        fire = p.controller.down('a');
      } else {
        ({ move, aim, fire } = this.cpu(p));
      }
      if (aim) (p.data.aim as THREE.Vector3).copy(aim);
      c.position.addScaledVector(move, SPEED * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_X, HALF_X);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HALF_Z, HALF_Z);
      face(p, p.data.aim as THREE.Vector3, dt);
      moveAnim(p, move.length());
      if (fire && (p.data.cool as number) <= 0) this.fire(p, p.data.aim as THREE.Vector3);
    }
    separate(this.alive, 0.4);

    // Candy flies, pops zombies and stuns rivals.
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.y += dt * 20;
      let hit = s.life <= 0;
      for (const z of this.zombies) {
        if (hit) break;
        if (z.hp <= 0 || z.rise < 1) continue;
        if (Math.hypot(z.mesh.position.x - s.mesh.position.x, z.mesh.position.z - s.mesh.position.z) > 0.45 * z.size + 0.15) continue;
        hit = true;
        z.hp--;
        z.stagger = 0.25;
        z.push.copy(s.vel).setY(0).normalize().multiplyScalar(z.size > 1.2 ? 1.5 : 3);
        if (z.hp <= 0) {
          this.popped[this.players.indexOf(s.owner)]++;
          this.poof(z.mesh.position, z.size);
          this.game.audio.play('pop');
          this.renderScore();
        } else this.game.audio.play('select');
      }
      for (const o of this.alive) {
        if (hit) break;
        if (o === s.owner || (o.data.stun as number) > 0) continue;
        const op = o.character.position;
        if (Math.hypot(op.x - s.mesh.position.x, op.z - s.mesh.position.z) > 0.5) continue;
        hit = true;
        o.data.stun = STUN;
        o.character.setExpression('surprised');
        op.addScaledVector(s.vel.clone().setY(0).normalize(), 0.5);
        this.game.audio.play('jump');
      }
      if (hit) {
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }

    // Zombies rise, then shuffle after the nearest survivor.
    const caught: MinigamePlayer[] = [];
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const m = z.mesh;
      if (z.hp <= 0) {
        this.scene.remove(m);
        this.zombies.splice(i, 1);
        continue;
      }
      if (z.rise < 1) {
        z.rise = Math.min(1, z.rise + dt);
        m.position.y = (z.rise - 1) * 1.4 * z.size;
        continue;
      }
      let target: MinigamePlayer | null = null;
      let best = Infinity;
      for (const p of this.alive) {
        const d = p.character.position.distanceTo(m.position);
        if (d < best) {
          best = d;
          target = p;
        }
      }
      if (z.stagger > 0) {
        z.stagger -= dt;
        m.position.addScaledVector(z.push, dt);
      } else if (target) {
        const dir = target.character.position.clone().sub(m.position).setY(0);
        if (dir.lengthSq() > 0.0001) dir.normalize();
        m.position.addScaledVector(dir, z.speed * dt);
        const want = Math.atan2(dir.x, dir.z);
        m.rotation.y += Math.atan2(Math.sin(want - m.rotation.y), Math.cos(want - m.rotation.y)) * Math.min(1, dt * 6);
        if (best < CATCH * z.size && !caught.includes(target)) caught.push(target);
      }
    }
    // Zombies shove each other apart so they come as a crowd, not a single blob.
    for (let i = 0; i < this.zombies.length; i++) {
      for (let j = i + 1; j < this.zombies.length; j++) {
        const a = this.zombies[i];
        const b = this.zombies[j];
        if (a.rise < 1 || b.rise < 1) continue;
        const r = 0.32 * (a.size + b.size);
        const dx = b.mesh.position.x - a.mesh.position.x;
        const dz = b.mesh.position.z - a.mesh.position.z;
        const len = Math.hypot(dx, dz);
        if (len === 0 || len >= r) continue;
        const k = (r - len) / len / 2;
        a.mesh.position.x -= dx * k;
        a.mesh.position.z -= dz * k;
        b.mesh.position.x += dx * k;
        b.mesh.position.z += dz * k;
      }
    }

    if (caught.length) {
      const before = this.alive;
      for (const p of caught) {
        knockOut(p, new THREE.Vector3(-p.character.position.x, 0, -p.character.position.z).normalize().multiplyScalar(2));
        this.game.audio.play('back');
      }
      this.renderScore();
      // Everyone left got caught at once: they share the win.
      if (this.alive.length === 0) this.finish(before);
    }
    for (const p of this.players) if (!p.alive) fall(p, dt);
    if (this.alive.length <= 1 && this.players.length > 1) this.finish(this.alive);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const z of this.zombies) {
      const body = z.mesh.userData.body as THREE.Group;
      const ph = this.t * 6 + z.mesh.id;
      body.rotation.z = Math.sin(ph) * 0.12;
      body.position.y = Math.abs(Math.sin(ph)) * 0.05;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const f = this.puffs[i];
      f.life -= dt * 2.5;
      f.mesh.scale.multiplyScalar(1 + dt * 4);
      f.mesh.position.y += dt * 1.2;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life);
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.puffs.splice(i, 1);
      }
    }
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const graveyardShift: MinigameDef = {
  id: 'graveshift',
  name: 'Graveyard Shift',
  kind: 'ffa',
  duel: true,
  song: graveTheme,
  rules: 'Zombies climb out of the graves and want a hug! Fling candy to pop them (it stuns rivals too). Last one standing wins!',
  controls: 'Stick: run and aim · A: fling candy',
  create: () => new GraveyardShift(),
};
