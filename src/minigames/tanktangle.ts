import * as THREE from 'three';
import { tankTheme } from '../audio/songs/sledTank';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 12;
const HALF_Z = 8;
const TANK_R = 1.1;
const DRIVE = 4.6;
const TURN = 2.4;
const AIM = 2.6;
const SHELL_SPEED = 15;
const RELOAD = 1.1;
const HP = 5;
/** Crates as [x, z, half size]: a mirrored layout so neither side has the edge. */
const CRATES: [number, number, number][] = [
  [0, 0, 1],
  [-5, -4, 0.8],
  [5, 4, 0.8],
  [-5, 4, 0.8],
  [5, -4, 0.8],
  [0, -6, 0.7],
  [0, 6, 0.7],
];

interface Tank {
  team: number;
  driver: MinigamePlayer;
  gunner: MinigamePlayer;
  hull: THREE.Group;
  turret: THREE.Group;
  /** Hull yaw and turret aim, both in world space. */
  yaw: number;
  aim: number;
  vel: THREE.Vector3;
  hp: number;
  reload: number;
  flash: number;
  /** CPU gunner's aim error for the next shot. */
  miss: number;
  /** CPU driver's preferred circling direction. */
  orbit: number;
}

interface Shell {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  team: number;
}

interface Blast {
  mesh: THREE.Mesh;
  t: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Yaw that points a +Z-facing object along a direction. */
const yawOf = (x: number, z: number) => Math.atan2(x, z);
const turnToward = (from: number, to: number, max: number) => from + THREE.MathUtils.clamp(wrap(to - from), -max, max);

/**
 * 2 vs 2 tank duel. Each team shares one tank: one player drives, the other
 * swings the turret and fires. Knock out the other tank's armor to win.
 */
class TankTangle extends Minigame {
  readonly timeLimit = 50;
  private tanks: Tank[] = [];
  private shells: Shell[] = [];
  private blasts: Blast[] = [];
  private board!: HTMLDivElement;
  private teamColors: number[] = [];

  protected setup(): void {
    arenaBasics(this.scene, [0xb8e2ff, 0xfff0d8], 0x9fd8a0, -2);
    const floor = toonMesh(new THREE.BoxGeometry(HALF_X * 2, 0.4, HALF_Z * 2), 0xe6d2a0, { outline: 0.05 });
    floor.position.y = -0.2;
    this.scene.add(floor);
    for (let i = 0; i < 9; i++) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.6 + (i % 3) * 0.4, 12), new THREE.MeshBasicMaterial({ color: 0xd6be88 }));
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(Math.sin(i * 2.4) * 9, 0.01, Math.cos(i * 1.7) * 6);
      this.scene.add(patch);
    }
    // Low walls all round.
    for (const [w, d, x, z] of [
      [HALF_X * 2 + 1, 0.5, 0, -HALF_Z - 0.25],
      [HALF_X * 2 + 1, 0.5, 0, HALF_Z + 0.25],
      [0.5, HALF_Z * 2, -HALF_X - 0.25, 0],
      [0.5, HALF_Z * 2, HALF_X + 0.25, 0],
    ]) {
      const wall = toonMesh(new THREE.BoxGeometry(w, 0.8, d), 0xb89a6a, { outline: 0.03 });
      wall.position.set(x, 0.4, z);
      this.scene.add(wall);
    }
    for (const [x, z, h] of CRATES) {
      const crate = toonMesh(new THREE.BoxGeometry(h * 2, h * 1.6, h * 2), 0xd9a066, { outline: 0.04 });
      crate.position.set(x, h * 0.8, z);
      const band = toonMesh(new THREE.BoxGeometry(h * 2.04, h * 0.25, h * 2.04), 0x9a6a40, { outline: false });
      band.position.y = h * 0.3;
      crate.add(band);
      this.scene.add(crate);
    }

    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      const [driver, gunner] = this.players.filter((p) => p.team === team);
      const tank = this.buildTank(team, driver, gunner);
      this.tanks.push(tank);
    }
    this.camera.position.set(0, 21, 14);
    this.camera.lookAt(0, 0, 0.8);
    this.board = document.createElement('div');
    this.board.className = 'mg-score panel';
    this.overlay.appendChild(this.board);
    this.renderScore();
  }

  private buildTank(team: number, driver: MinigamePlayer, gunner: MinigamePlayer): Tank {
    const color = this.teamColors[team];
    const hull = new THREE.Group();
    const body = toonMesh(new THREE.BoxGeometry(1.5, 0.55, 2), color, { outline: 0.04 });
    body.position.y = 0.55;
    const deck = toonMesh(new THREE.BoxGeometry(1.3, 0.12, 1.7), Palette.cream, { outline: false });
    deck.position.y = 0.88;
    hull.add(body, deck);
    for (const side of [-1, 1]) {
      const tread = toonMesh(new THREE.BoxGeometry(0.4, 0.5, 2.3), Palette.ink, { outline: 0.02 });
      tread.position.set(side * 0.9, 0.3, 0);
      hull.add(tread);
      for (let i = 0; i < 4; i++) {
        const wheel = toonMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.42, 10), 0x6a6488, { outline: false });
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.9, 0.22, -0.8 + i * 0.53);
        hull.add(wheel);
      }
    }
    const turret = new THREE.Group();
    const dome = toonMesh(new THREE.CylinderGeometry(0.55, 0.65, 0.4, 16), color, { outline: 0.03 });
    dome.position.y = 0.2;
    const barrel = toonMesh(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 10), Palette.ink, { outline: 0.02 });
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.25, 0.95);
    turret.add(dome, barrel);
    turret.position.set(0, 0.94, -0.2);
    hull.add(turret);

    // Driver pokes out of the front hatch, gunner rides the turret.
    driver.character.scale.setScalar(0.55);
    driver.character.position.set(0, 0.6, 0.6);
    hull.add(driver.character);
    gunner.character.scale.setScalar(0.55);
    gunner.character.position.set(0, 0.3, -0.25);
    turret.add(gunner.character);
    for (const p of [driver, gunner]) {
      p.character.rotation.set(0, 0, 0);
      p.character.setExpression('determined');
    }

    const x = team === 0 ? -HALF_X + 2.5 : HALF_X - 2.5;
    hull.position.set(x, 0, 0);
    const yaw = team === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.scene.add(hull);
    return { team, driver, gunner, hull, turret, yaw, aim: yaw, vel: new THREE.Vector3(), hp: HP, reload: 1, flash: 0, miss: 0, orbit: team === 0 ? 1 : -1 };
  }

  private renderScore(): void {
    this.board.innerHTML = this.tanks
      .map((t) => {
        const name = (p: MinigamePlayer) => p.character.def.name;
        return `<span style="color:${css(this.teamColors[t.team])}">${'♥'.repeat(t.hp)}${'♡'.repeat(HP - t.hp)}<small style="display:block;font-size:11px">🚜 ${name(t.driver)} · 🎯 ${name(t.gunner)}</small></span>`;
      })
      .join('<span>vs</span>');
  }

  /** Does a straight line between two points clear every crate? */
  private clearShot(a: THREE.Vector3, b: THREE.Vector3): boolean {
    for (let k = 0.05; k < 1; k += 0.05) {
      const x = a.x + (b.x - a.x) * k;
      const z = a.z + (b.z - a.z) * k;
      if (CRATES.some(([cx, cz, h]) => Math.abs(x - cx) < h + 0.25 && Math.abs(z - cz) < h + 0.25)) return false;
    }
    return true;
  }

  /** CPU driver: hold a middling range, circle, slip sideways from shells, steer off crates. */
  private cpuDrive(t: Tank, foe: Tank): THREE.Vector3 {
    const pos = t.hull.position;
    const to = foe.hull.position.clone().sub(pos).setY(0);
    const dist = to.length();
    to.normalize();
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(t.orbit);
    const want = side.multiplyScalar(0.8).addScaledVector(to, THREE.MathUtils.clamp((dist - 9) * 0.25, -1, 1));
    for (const s of this.shells) {
      if (s.team === t.team) continue;
      const rel = pos.clone().sub(s.mesh.position).setY(0);
      const along = rel.dot(s.vel) / SHELL_SPEED;
      if (along <= 0 || along > 7) continue;
      const perp = rel.clone().addScaledVector(s.vel, -along / SHELL_SPEED);
      if (perp.length() < 1.6) want.addScaledVector(perp.lengthSq() > 0.01 ? perp.normalize() : side, 1.6);
    }
    for (const [cx, cz, h] of CRATES) {
      const away = new THREE.Vector3(pos.x - cx, 0, pos.z - cz);
      const d = away.length() - h - TANK_R;
      if (d < 1.8) want.addScaledVector(away.normalize(), (1.8 - d) * 0.9);
    }
    want.x += THREE.MathUtils.clamp((HALF_X - 2.5 - Math.abs(pos.x)) * 0.5, -1, 0) * Math.sign(pos.x);
    want.z += THREE.MathUtils.clamp((HALF_Z - 2.5 - Math.abs(pos.z)) * 0.5, -1, 0) * Math.sign(pos.z);
    // Switch circling direction now and then, when boxed in.
    if (Math.abs(pos.z) > HALF_Z - 2.2 && this.game.rng.next() < 0.02) t.orbit = -t.orbit;
    if (want.lengthSq() > 1) want.normalize();
    return want;
  }

  /** CPU gunner: lead the target a little, with a fresh wobble each shot. */
  private cpuAim(t: Tank, foe: Tank): { aim: number; fire: boolean } {
    const from = t.hull.position;
    const dist = foe.hull.position.distanceTo(from);
    const lead = foe.hull.position.clone().addScaledVector(foe.vel, (dist / SHELL_SPEED) * 0.8);
    const aim = yawOf(lead.x - from.x, lead.z - from.z) + t.miss;
    const ready = t.reload <= 0 && Math.abs(wrap(aim - t.aim)) < 0.06;
    return { aim, fire: ready && this.clearShot(from, foe.hull.position) };
  }

  private fire(t: Tank): void {
    const dir = new THREE.Vector3(Math.sin(t.aim), 0, Math.cos(t.aim));
    const mesh = toonMesh(new THREE.SphereGeometry(0.22, 12, 8), Palette.ink, { outline: 0.02 });
    mesh.position.copy(t.hull.position).addScaledVector(dir, 1.7).setY(1.2);
    this.scene.add(mesh);
    this.shells.push({ mesh, vel: dir.multiplyScalar(SHELL_SPEED), team: t.team });
    t.reload = RELOAD;
    t.miss = (this.game.rng.next() * 2 - 1) * 0.16;
    t.gunner.character.pose = 'jump';
    this.game.audio.play('boom');
  }

  private blast(at: THREE.Vector3, big: boolean): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 0.9 : 0.5, 14, 10),
      new THREE.MeshBasicMaterial({ color: big ? Palette.yellow : Palette.cream, transparent: true, opacity: 0.9 }),
    );
    mesh.position.copy(at);
    this.scene.add(mesh);
    this.blasts.push({ mesh, t: 0 });
  }

  play(dt: number): void {
    const [a, b] = this.tanks;
    for (const t of this.tanks) {
      const foe = t === a ? b : a;
      t.reload -= dt;
      t.flash = Math.max(0, t.flash - dt);

      const drive = t.driver.controller ? stick(t.driver) : this.cpuDrive(t, foe);
      const mag = drive.length();
      let speed = 0;
      if (mag > 0.2) {
        const want = yawOf(drive.x, drive.z);
        // Tanks can back up: steer to whichever end is nearer the stick.
        const fwd = Math.abs(wrap(want - t.yaw)) <= Math.PI * 0.6;
        t.yaw = turnToward(t.yaw, fwd ? want : want + Math.PI, TURN * dt);
        speed = Math.max(0, Math.cos(wrap((fwd ? want : want + Math.PI) - t.yaw))) * mag * DRIVE * (fwd ? 1 : -0.7);
      }
      t.vel.set(Math.sin(t.yaw) * speed, 0, Math.cos(t.yaw) * speed);
      const pos = t.hull.position;
      pos.addScaledVector(t.vel, dt);
      pos.x = THREE.MathUtils.clamp(pos.x, -HALF_X + TANK_R, HALF_X - TANK_R);
      pos.z = THREE.MathUtils.clamp(pos.z, -HALF_Z + TANK_R, HALF_Z - TANK_R);
      for (const [cx, cz, h] of CRATES) {
        // Push out of the crate's box, rounded by the tank's radius.
        const nx = THREE.MathUtils.clamp(pos.x, cx - h, cx + h);
        const nz = THREE.MathUtils.clamp(pos.z, cz - h, cz + h);
        const d = Math.hypot(pos.x - nx, pos.z - nz);
        if (d < TANK_R && d > 0) {
          pos.x = nx + ((pos.x - nx) / d) * TANK_R;
          pos.z = nz + ((pos.z - nz) / d) * TANK_R;
        }
      }
      t.hull.rotation.y = t.yaw;
      t.driver.character.pose = speed !== 0 ? 'walk' : 'idle';
      t.driver.character.moveSpeed = Math.abs(speed) / DRIVE;

      let fire: boolean;
      if (t.gunner.controller) {
        const s = stick(t.gunner);
        if (s.length() > 0.3) t.aim = turnToward(t.aim, yawOf(s.x, s.z), AIM * dt);
        fire = t.gunner.controller.pressed('a');
      } else {
        const ai = this.cpuAim(t, foe);
        t.aim = turnToward(t.aim, ai.aim, AIM * 0.85 * dt);
        fire = ai.fire;
      }
      t.turret.rotation.y = t.aim - t.yaw;
      if (fire && t.reload <= 0) this.fire(t);
      else if (t.reload < RELOAD - 0.3) t.gunner.character.pose = 'idle';
    }
    // Tanks shove each other apart.
    const gap = b.hull.position.clone().sub(a.hull.position).setY(0);
    const d = gap.length();
    if (d < TANK_R * 2 && d > 0) {
      gap.multiplyScalar((TANK_R * 2 - d) / d / 2);
      a.hull.position.sub(gap);
      b.hull.position.add(gap);
    }

    for (const s of [...this.shells]) {
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position;
      let gone = Math.abs(p.x) > HALF_X || Math.abs(p.z) > HALF_Z || CRATES.some(([cx, cz, h]) => Math.abs(p.x - cx) < h && Math.abs(p.z - cz) < h);
      const hit = this.tanks.find((t) => t.team !== s.team && Math.hypot(t.hull.position.x - p.x, t.hull.position.z - p.z) < TANK_R);
      if (hit) {
        hit.hp--;
        hit.flash = 0.3;
        for (const c of [hit.driver, hit.gunner]) c.character.setExpression('surprised');
        this.game.audio.play('pop');
        this.renderScore();
        gone = true;
      }
      if (gone) {
        this.blast(p, !!hit);
        this.scene.remove(s.mesh);
        this.shells.splice(this.shells.indexOf(s), 1);
      }
    }
    for (const t of this.tanks) {
      if (t.flash <= 0) for (const c of [t.driver, t.gunner]) c.character.setExpression('determined');
    }

    const dead = this.tanks.find((t) => t.hp <= 0);
    if (dead) {
      this.blast(dead.hull.position.clone().setY(1), true);
      this.game.audio.play('boom');
      dead.hull.rotation.z = 0.25;
      const win = this.tanks.find((t) => t !== dead)!;
      for (const p of [win.driver, win.gunner]) {
        p.character.pose = 'cheer';
        p.character.setExpression('happy');
      }
      for (const p of [dead.driver, dead.gunner]) {
        p.character.pose = 'sulk';
        p.character.setExpression('sad');
      }
      this.finish([win.driver, win.gunner]);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const bl of [...this.blasts]) {
      bl.t += dt;
      bl.mesh.scale.setScalar(1 + bl.t * 4);
      (bl.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - bl.t * 2.5);
      if (bl.t > 0.4) {
        this.scene.remove(bl.mesh);
        this.blasts.splice(this.blasts.indexOf(bl), 1);
      }
    }
    // Hit tanks blink.
    for (const t of this.tanks) t.hull.visible = t.flash <= 0 || Math.floor(t.flash * 20) % 2 === 0;
  }

  timeout(): number[] {
    const [a, b] = this.tanks;
    if (a.hp === b.hp) return [];
    const win = a.hp > b.hp ? a : b;
    return [win.driver.seat, win.gunner.seat];
  }
}

export const tankTangle: MinigameDef = {
  id: 'tanktangle',
  name: 'Tank Tangle',
  kind: '2v2',
  song: tankTheme,
  rules: 'Each team shares one tank. The first player drives, the second turns the turret and fires. Blast the other tank five times to win!',
  controls: 'Driver: stick to drive · Gunner: stick to aim, A to fire',
  create: () => new TankTangle(),
};
