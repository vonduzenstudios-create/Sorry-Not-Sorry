import * as THREE from 'three';
import { kartTheme } from '../audio/songs/kartSnackThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { scorePanel, stick, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 11;
const KART = 0.95;
const ACCEL = 17;
const DRAG = 1.6;
const GRIP = 6;
const TURN = 3.6;
const BOOST = 9;
const BOOST_COOLDOWN = 2;
const BALLOONS = 3;
const SAFE = 2;

interface Kart {
  group: THREE.Group;
  body: THREE.Mesh;
  balloons: THREE.Group[];
  heading: number;
  vel: THREE.Vector3;
  cooldown: number;
  /** Seconds of invulnerability after losing a balloon. */
  safe: number;
}

interface Puff {
  mesh: THREE.Mesh;
  life: number;
}

const forward = (h: number) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Bumper karts in a walled arena. Each kart trails three balloons; ram a rival
 * harder than they ram you to pop one. Lose them all and you're out.
 */
class KartClash extends Minigame {
  readonly timeLimit = 45;
  private karts = new Map<MinigamePlayer, Kart>();
  private puffs: Puff[] = [];
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xffd9b0, 0xfff3d6], 0xf2c48d, -6);
    const floor = toonMesh(new THREE.CylinderGeometry(RADIUS + 0.6, RADIUS + 1, 0.6, 64), Palette.lavender, { outline: 0.06 });
    floor.position.y = -0.3;
    this.scene.add(floor);
    // Checkered start ring and a bullseye in the middle.
    for (let i = 0; i < 24; i++) {
      const tile = new THREE.Mesh(
        new THREE.RingGeometry(6, 6.6, 4, 1, (i / 24) * Math.PI * 2, Math.PI / 12),
        new THREE.MeshBasicMaterial({ color: i % 2 ? Palette.ink : Palette.cream }),
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.y = 0.01;
      this.scene.add(tile);
    }
    const eye = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: Palette.rose }));
    eye.rotation.x = -Math.PI / 2;
    eye.position.y = 0.01;
    this.scene.add(eye);
    // A ring of striped bumper posts makes the wall.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const post = toonMesh(new THREE.CylinderGeometry(0.45, 0.5, 1, 12), i % 2 ? Palette.coral : Palette.cream, { outline: 0.04 });
      post.position.set(Math.cos(a) * (RADIUS + 0.4), 0.5, Math.sin(a) * (RADIUS + 0.4));
      this.scene.add(post);
    }

    this.players.forEach((p, i) => {
      const a = (i / this.players.length) * Math.PI * 2 + Math.PI / 2;
      const kart = this.buildKart(p);
      kart.group.position.set(Math.cos(a) * 7.5, 0, Math.sin(a) * 7.5);
      kart.heading = Math.atan2(-kart.group.position.x, -kart.group.position.z);
      this.karts.set(p, kart);
      p.data.balloons = BALLOONS;
      p.character.scale.setScalar(0.7);
    });
    this.syncRiders(0);

    this.camera.position.set(0, 25, 21);
    this.camera.lookAt(0, 0, 0.8);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private buildKart(p: MinigamePlayer): Kart {
    const accent = p.character.def.colors.accent;
    const group = new THREE.Group();
    const body = toonMesh(new THREE.BoxGeometry(1.3, 0.45, 1.8), accent, { outline: 0.05 });
    body.position.y = 0.45;
    const nose = toonMesh(new THREE.CylinderGeometry(0.65, 0.65, 0.45, 16, 1, false, -Math.PI / 2, Math.PI), accent, { outline: 0.05 });
    nose.position.set(0, 0.45, 0.9);
    const bumper = toonMesh(new THREE.TorusGeometry(0.95, 0.14, 8, 24), Palette.ink, { outline: false });
    bumper.rotation.x = Math.PI / 2;
    bumper.scale.set(1, 1.25, 1);
    bumper.position.y = 0.3;
    const seat = toonMesh(new THREE.BoxGeometry(0.8, 0.5, 0.3), Palette.cream, { outline: 0.03 });
    seat.position.set(0, 0.85, -0.45);
    group.add(body, nose, bumper, seat);
    for (const [x, z] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6], [0.7, -0.6]]) {
      const wheel = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 14), Palette.ink, { outline: false });
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.28, z);
      group.add(wheel);
    }
    // Balloons on strings tied to a pole at the back.
    const pole = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), Palette.ink, { outline: false });
    pole.position.set(0, 1.2, -0.85);
    group.add(pole);
    const balloons: THREE.Group[] = [];
    for (let i = 0; i < BALLOONS; i++) {
      const b = new THREE.Group();
      const ball = toonMesh(new THREE.SphereGeometry(0.38, 16, 12), accent, { outline: 0.03 });
      ball.scale.y = 1.2;
      ball.position.y = 0.9;
      const knot = toonMesh(new THREE.ConeGeometry(0.08, 0.14, 6), accent, { outline: false });
      knot.position.y = 0.45;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), new THREE.MeshBasicMaterial({ color: Palette.ink }));
      string.position.y = 0.0;
      b.add(ball, knot, string);
      b.position.set((i - 1) * 0.45, 1.8, -0.9);
      b.rotation.z = (i - 1) * -0.3;
      group.add(b);
      balloons.push(b);
    }
    this.scene.add(group);
    return { group, body, balloons, heading: 0, vel: new THREE.Vector3(), cooldown: 0, safe: 0 };
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => {
        const n = p.data.balloons as number;
        return `<span style="color:${css(p.character.def.colors.accent)}">${n > 0 ? '●'.repeat(n) : '✕'}</span>`;
      })
      .join('');
  }

  /** Stick steers toward that direction; A boosts. CPUs return the same. */
  private intent(p: MinigamePlayer, kart: Kart): { dir: THREE.Vector3; boost: boolean } {
    if (p.controller) return { dir: stick(p), boost: p.controller.pressed('a') };
    const pos = kart.group.position;
    let target: THREE.Vector3 | null = null;
    let best = Infinity;
    for (const o of this.alive) {
      if (o === p) continue;
      const k = this.karts.get(o)!;
      // Aim behind rivals, where they can't ram back.
      const aim = k.group.position.clone().addScaledVector(forward(k.heading), -1.5);
      const d = aim.distanceTo(pos) + (k.safe > 0 ? 6 : 0) + (o.data.balloons as number) * 0.5;
      if (d < best) {
        best = d;
        target = aim;
      }
    }
    const dir = target ? target.sub(pos).setY(0) : new THREE.Vector3(-pos.x, 0, -pos.z);
    if (dir.lengthSq() > 0.001) dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.t * 1.7 + p.seat * 2) * 0.35);
    const flat = Math.hypot(pos.x, pos.z);
    if (flat > RADIUS - 2.5) dir.addScaledVector(new THREE.Vector3(-pos.x, 0, -pos.z).normalize(), 1.2);
    if (dir.lengthSq() > 1) dir.normalize();
    // CPUs cruise a little under full throttle so humans can outrun them.
    dir.multiplyScalar(0.8);
    const aligned = Math.abs(wrap(Math.atan2(dir.x, dir.z) - kart.heading)) < 0.3;
    return { dir, boost: aligned && best < 4.5 && kart.cooldown <= 0 && Math.sin(this.t * 0.9 + p.seat * 1.7) > 0 && flat < RADIUS - 3 };
  }

  private pop(p: MinigamePlayer, by: MinigamePlayer): void {
    const kart = this.karts.get(p)!;
    const n = (p.data.balloons as number) - 1;
    p.data.balloons = n;
    const b = kart.balloons[n];
    const at = new THREE.Vector3();
    b.getWorldPosition(at);
    at.y += 0.9;
    b.visible = false;
    const puff = toonMesh(new THREE.IcosahedronGeometry(0.4, 1), Palette.cream, { outline: false });
    puff.position.copy(at);
    this.scene.add(puff);
    this.puffs.push({ mesh: puff, life: 0.3 });
    kart.safe = SAFE;
    this.game.audio.play('pop');
    by.character.setExpression('happy');
    p.character.setExpression(n > 0 ? 'surprised' : 'sad');
    if (n <= 0) {
      p.alive = false;
      p.character.pose = 'sulk';
      ((kart.body.material as THREE.MeshToonMaterial).color as THREE.Color).lerp(new THREE.Color(0x888899), 0.6);
      this.game.audio.play('back');
    }
    this.renderScore();
  }

  play(dt: number): void {
    for (const p of this.players) {
      const kart = this.karts.get(p)!;
      kart.cooldown = Math.max(0, kart.cooldown - dt);
      kart.safe = Math.max(0, kart.safe - dt);
      const f = forward(kart.heading);
      if (p.alive) {
        const { dir, boost } = this.intent(p, kart);
        const mag = Math.min(1, dir.length());
        if (mag > 0.15) {
          const diff = wrap(Math.atan2(dir.x, dir.z) - kart.heading);
          kart.heading += THREE.MathUtils.clamp(diff, -TURN * dt, TURN * dt);
          kart.vel.addScaledVector(f, ACCEL * mag * (Math.cos(diff) > 0 ? 1 : 0.35) * dt);
        }
        if (boost && kart.cooldown <= 0) {
          kart.vel.addScaledVector(f, BOOST);
          kart.cooldown = BOOST_COOLDOWN;
          this.game.audio.play('jump');
        }
      }
      // Tyres grip: sideways slide bleeds off quickly.
      const along = kart.vel.dot(f);
      const lateral = kart.vel.clone().addScaledVector(f, -along);
      kart.vel.addScaledVector(lateral, -Math.min(1, GRIP * dt));
      kart.vel.multiplyScalar(Math.exp(-(p.alive ? DRAG : DRAG * 2.5) * dt));
      kart.group.position.addScaledVector(kart.vel, dt);

      const pos = kart.group.position;
      const flat = Math.hypot(pos.x, pos.z);
      if (flat > RADIUS - KART) {
        const n = new THREE.Vector3(pos.x / flat, 0, pos.z / flat);
        pos.x = n.x * (RADIUS - KART);
        pos.z = n.z * (RADIUS - KART);
        const vn = kart.vel.dot(n);
        if (vn > 0) {
          kart.vel.addScaledVector(n, -vn * 1.6);
          if (vn > 4) this.game.audio.play('select');
        }
      }
    }

    // Kart-vs-kart: the one driving harder into the other pops a balloon.
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const pa = this.players[i];
        const pb = this.players[j];
        const a = this.karts.get(pa)!;
        const b = this.karts.get(pb)!;
        const n = b.group.position.clone().sub(a.group.position).setY(0);
        const d = n.length();
        if (d === 0 || d > KART * 2) continue;
        n.divideScalar(d);
        const overlap = KART * 2 - d;
        a.group.position.addScaledVector(n, -overlap / 2);
        b.group.position.addScaledVector(n, overlap / 2);
        const hitA = a.vel.dot(n);
        const hitB = -b.vel.dot(n);
        const rel = hitA + hitB;
        if (rel <= 0) continue;
        const impulse = rel * 0.8 + 2;
        a.vel.addScaledVector(n, -impulse);
        b.vel.addScaledVector(n, impulse);
        this.game.audio.play('jump');
        if (!pa.alive || !pb.alive) continue;
        if (hitA > 5 && hitA > hitB + 2.5 && b.safe <= 0) this.pop(pb, pa);
        else if (hitB > 5 && hitB > hitA + 2.5 && a.safe <= 0) this.pop(pa, pb);
      }
    }

    this.syncRiders(dt);
    if (this.alive.length <= 1) this.finish(this.alive);
  }

  /** Riders sit in their karts; balloons bob and invulnerable karts blink. */
  private syncRiders(dt: number): void {
    for (const p of this.players) {
      const kart = this.karts.get(p)!;
      kart.group.rotation.y = kart.heading;
      kart.group.visible = kart.safe <= 0 || Math.floor(kart.safe * 12) % 2 === 0;
      kart.balloons.forEach((b, i) => {
        b.rotation.x = Math.sin(this.t * 3 + i + p.seat) * 0.12 + Math.min(0.5, kart.vel.length() * 0.04);
      });
      const c = p.character;
      c.visible = kart.group.visible;
      c.position.copy(kart.group.position).addScaledVector(forward(kart.heading), -0.1).setY(0.65);
      c.rotation.y = kart.heading;
      if (p.alive) c.pose = 'idle';
    }
    for (const puff of [...this.puffs]) {
      puff.life -= dt;
      puff.mesh.scale.setScalar(1 + (0.3 - puff.life) * 8);
      if (puff.life <= 0) {
        this.scene.remove(puff.mesh);
        this.puffs.splice(this.puffs.indexOf(puff), 1);
      }
    }
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p.data.balloons as number;
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => p.data.balloons as number, 0);
  }
}

export const kartClash: MinigameDef = {
  id: 'kartclash',
  name: 'Kart Clash',
  kind: 'ffa',
  duel: true,
  rules: 'Ram rivals harder than they ram you to pop their balloons. Lose all three and you are out. Last kart rolling wins!',
  controls: 'Stick: steer · A: boost',
  song: kartTheme,
  create: () => new KartClash(),
};
