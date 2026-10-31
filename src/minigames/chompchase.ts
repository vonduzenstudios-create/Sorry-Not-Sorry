import * as THREE from 'three';
import { chompTheme } from '../audio/songs/chompWallThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const ARENA_R = 8.5;
const PILLARS: [number, number][] = [
  [0, 0],
  [-4.6, -3],
  [4.6, -3],
  [-3.4, 4.2],
  [3.4, 4.2],
];
const PILLAR_R = 0.7;
const MONSTER_R = 1.05;
const RUNNER_R = 0.35;
const MONSTER_SPEED = 4.3;
const RUNNER_SPEED = 5.1;
const LUNGE_SPEED = 13;
const LUNGE_TIME = 0.38;
const LUNGE_COOL = 1.75;
/** Stuck in place for a moment after a lunge: the runners' chance to slip by. */
const RECOVER = 0.32;

/** Keeps a point inside the arena and outside the pillars. */
function confine(pos: THREE.Vector3, r: number): void {
  const d = Math.hypot(pos.x, pos.z);
  if (d > ARENA_R - r) pos.multiplyScalar((ARENA_R - r) / d);
  for (const [x, z] of PILLARS) {
    const dx = pos.x - x;
    const dz = pos.z - z;
    const len = Math.hypot(dx, dz);
    const min = PILLAR_R + r;
    if (len > 0 && len < min) {
      pos.x = x + (dx / len) * min;
      pos.z = z + (dz / len) * min;
    }
  }
}

/**
 * 1 vs 3. The solo player rides a big chomping monster around a ring of
 * pillars and lunges at the runners. Eat all three to win; anyone still
 * running when the clock hits zero wins for the runners.
 */
class ChompChase extends Minigame {
  readonly timeLimit = 30;
  private monster = new THREE.Group();
  private jaw = new THREE.Group();
  private head = new THREE.Group();
  private vel = new THREE.Vector3();
  private heading = new THREE.Vector3(0, 0, 1);
  private lunge = 0;
  private recover = 0;
  private cool = 0;
  private chomp = 0;
  private target: MinigamePlayer | null = null;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0x9ad0ff, 0xffe8f0], Palette.water, -6);
    const ground = toonMesh(new THREE.CylinderGeometry(ARENA_R, ARENA_R - 0.6, 1.2, 48), Palette.grass, { outline: 0.06 });
    ground.position.y = -0.6;
    this.scene.add(ground);
    const ringMark = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.5, ARENA_R - 0.3, 64), new THREE.MeshBasicMaterial({ color: Palette.grassDark }));
    ringMark.rotation.x = -Math.PI / 2;
    ringMark.position.y = 0.01;
    this.scene.add(ringMark);
    for (const [x, z] of PILLARS) {
      const stump = toonMesh(new THREE.CylinderGeometry(PILLAR_R, PILLAR_R + 0.1, 1.4, 16), 0xc89060, { outline: 0.04 });
      stump.position.set(x, 0.7, z);
      const top = toonMesh(new THREE.CylinderGeometry(PILLAR_R - 0.08, PILLAR_R - 0.08, 0.06, 16), 0xf6d9a8, { outline: false });
      top.position.set(x, 1.43, z);
      this.scene.add(stump, top);
    }
    this.buildMonster();

    const solo = this.solo;
    this.monster.position.set(0, 0, -6);
    this.monster.add(solo.character);
    solo.character.position.set(0, MONSTER_R * 1.75, -0.35);
    solo.character.scale.setScalar(0.8);
    this.scene.add(this.monster);
    this.runners.forEach((p, i) => {
      const a = Math.PI / 2 + (i - 1) * 0.9;
      p.character.position.set(Math.cos(a) * 6, 0, Math.sin(a) * 6);
      p.character.rotation.y = Math.PI;
      p.data.juke = 0;
    });

    this.camera.position.set(0, 16, 15.5);
    this.camera.lookAt(0, 0, 0.8);
  }

  /** A round purple chomper: a lid-like top that flips open over a red mouth, teeth and big eyes. */
  private buildMonster(): void {
    const purple = 0x8a5cd6;
    const R = MONSTER_R;
    const lower = toonMesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), purple, { outline: 0.05 });
    this.head.add(lower);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(R * 0.96, 24), new THREE.MeshBasicMaterial({ color: 0xc23a5a }));
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.y = 0.01;
    const tongue = toonMesh(new THREE.SphereGeometry(0.4, 12, 8), 0xff8aa8, { outline: false });
    tongue.scale.set(1, 0.3, 1.3);
    tongue.position.set(0, 0.02, 0.2);
    this.head.add(mouth, tongue);
    // The top hinges at the back of the head so the mouth opens forward.
    this.jaw.position.set(0, 0.02, -R);
    const dome = toonMesh(new THREE.SphereGeometry(R, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), purple, { outline: 0.05 });
    dome.position.z = R;
    this.jaw.add(dome);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI;
      const up = toonMesh(new THREE.ConeGeometry(0.11, 0.26, 6), 0xffffff, { outline: 0.015 });
      up.rotation.x = Math.PI;
      up.position.set(Math.sin(a) * R * 0.85, -0.1, R + Math.cos(a) * R * 0.85);
      this.jaw.add(up);
      const low = toonMesh(new THREE.ConeGeometry(0.1, 0.22, 6), 0xffffff, { outline: 0.015 });
      low.position.set(Math.sin(a) * R * 0.82, 0.1, Math.cos(a) * R * 0.82);
      this.head.add(low);
    }
    for (const side of [-1, 1]) {
      const eye = toonMesh(new THREE.SphereGeometry(0.28, 14, 10), 0xffffff, { outline: 0.02 });
      eye.position.set(side * 0.42, R * 0.7, R + R * 0.62);
      const pupil = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), Palette.ink, { outline: false });
      pupil.position.set(side * 0.42, R * 0.72, R + R * 0.85);
      const horn = toonMesh(new THREE.ConeGeometry(0.16, 0.5, 8), Palette.butter, { outline: 0.02 });
      horn.position.set(side * 0.62, R * 0.95, R - 0.1);
      horn.rotation.z = -side * 0.4;
      this.jaw.add(eye, pupil, horn);
    }
    this.head.position.y = R * 0.9;
    this.head.add(this.jaw);
    this.monster.add(this.head);
    for (const side of [-1, 1]) {
      const foot = toonMesh(new THREE.SphereGeometry(0.3, 12, 8), 0x6f44b8, { outline: 0.03 });
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(side * 0.55, 0.18, 0.1);
      foot.name = side < 0 ? 'footL' : 'footR';
      this.monster.add(foot);
    }
  }

  /** CPU monster: stalk the closest runner, lunge when lined up and close. */
  private cpuMonster(): { dir: THREE.Vector3; lunge: boolean } {
    const pos = this.monster.position;
    const alive = this.runners.filter((r) => r.alive);
    const dist = (r: MinigamePlayer) => r.character.position.distanceTo(pos);
    // Stick with the current prey unless another one is much closer.
    const best = alive.reduce<MinigamePlayer | null>((b, r) => (!b || dist(r) < dist(b) ? r : b), null);
    if (!this.target?.alive || (best && dist(best) < dist(this.target) - 2)) this.target = best;
    const t = this.target;
    if (!t) return { dir: new THREE.Vector3(), lunge: false };
    const lead = t.character.position.clone().addScaledVector((t.data.vel as THREE.Vector3 | undefined) ?? new THREE.Vector3(), 0.35);
    const dir = lead.sub(pos).setY(0);
    const d = dir.length();
    dir.normalize();
    // Steer around pillars in the way.
    for (const [x, z] of PILLARS) {
      const away = new THREE.Vector3(pos.x - x, 0, pos.z - z);
      const len = away.length();
      if (len < PILLAR_R + MONSTER_R + 0.6) dir.addScaledVector(away.normalize(), 0.8);
    }
    const lined = this.heading.dot(dir.clone().normalize()) > 0.93;
    const lunge = lined && d < 4.6 && d > 1.4 && this.game.rng.next() < 0.18;
    return { dir: dir.normalize(), lunge };
  }

  /** CPU runner: keep away from the monster, off the edge, and dodge sideways when it lunges. */
  private cpuRun(p: MinigamePlayer): THREE.Vector3 {
    const pos = p.character.position;
    const m = this.monster.position;
    const away = pos.clone().sub(m).setY(0);
    const d = Math.max(0.1, away.length());
    away.normalize();
    const dir = away.clone().multiplyScalar(Math.min(2.5, 7 / d));
    // Circle around the arena rather than running straight into the wall.
    const side = p.seat % 2 === 0 ? 1 : -1;
    dir.add(new THREE.Vector3(-away.z * side, 0, away.x * side).multiplyScalar(0.7));
    const r = Math.hypot(pos.x, pos.z);
    if (r > ARENA_R - 2.2) dir.addScaledVector(new THREE.Vector3(-pos.x / r, 0, -pos.z / r), (r - (ARENA_R - 2.2)) * 1.6);
    for (const [x, z] of PILLARS) {
      const off = new THREE.Vector3(pos.x - x, 0, pos.z - z);
      const len = off.length();
      if (len < 1.5) dir.addScaledVector(off.normalize(), 1.5 - len);
    }
    for (const o of this.runners) {
      if (o === p || !o.alive) continue;
      const off = pos.clone().sub(o.character.position).setY(0);
      const len = off.length();
      if (len > 0 && len < 1.6) dir.addScaledVector(off.normalize(), (1.6 - len) * 0.8);
    }
    // A lunge is coming: step out of its line, decided once per lunge.
    let juke = p.data.juke as number;
    if (this.lunge > 0 && d < 5) {
      if (juke === 0) juke = this.game.rng.next() < 0.7 ? (this.game.rng.next() < 0.5 ? -1 : 1) : 2;
      if (juke !== 2) dir.add(new THREE.Vector3(-this.heading.z * juke, 0, this.heading.x * juke).multiplyScalar(3));
    } else juke = 0;
    p.data.juke = juke;
    dir.x += Math.sin(this.t * 1.3 + p.seat * 1.9) * 0.3;
    return dir.lengthSq() > 0.01 ? dir.normalize() : dir;
  }

  play(dt: number): void {
    const solo = this.solo;
    const m = this.monster.position;
    this.cool = Math.max(0, this.cool - dt);
    let dir: THREE.Vector3;
    let wantLunge: boolean;
    if (solo.controller) {
      dir = stick(solo);
      wantLunge = solo.controller.pressed('a');
    } else ({ dir, lunge: wantLunge } = this.cpuMonster());

    if (this.lunge > 0) {
      this.lunge -= dt;
      this.vel.copy(this.heading).multiplyScalar(LUNGE_SPEED);
      if (this.lunge <= 0) this.recover = RECOVER;
    } else if (this.recover > 0) {
      this.recover -= dt;
      this.vel.set(0, 0, 0);
    } else {
      if (dir.lengthSq() > 0.01) {
        // Turn the heading toward the stick at a monster-ish rate.
        const want = Math.atan2(dir.x, dir.z);
        const cur = Math.atan2(this.heading.x, this.heading.z);
        let diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        diff = THREE.MathUtils.clamp(diff, -dt * 7, dt * 7);
        this.heading.set(Math.sin(cur + diff), 0, Math.cos(cur + diff));
      }
      this.vel.copy(this.heading).multiplyScalar(MONSTER_SPEED * Math.min(1, dir.length()));
      if (wantLunge && this.cool <= 0) {
        this.lunge = LUNGE_TIME;
        this.cool = LUNGE_COOL;
        this.game.audio.play('jump');
      }
    }
    m.addScaledVector(this.vel, dt);
    confine(m, MONSTER_R);
    this.monster.rotation.y = Math.atan2(this.heading.x, this.heading.z);

    for (const r of this.runners) {
      if (!r.alive) continue;
      const c = r.character;
      const move = r.controller ? stick(r) : this.cpuRun(r);
      r.data.vel = move.clone().multiplyScalar(RUNNER_SPEED);
      c.position.addScaledVector(move, RUNNER_SPEED * dt);
      confine(c.position, RUNNER_R);
      face(r, move, dt);
      moveAnim(r, move.length());
      const d = Math.hypot(c.position.x - m.x, c.position.z - m.z);
      c.setExpression(d < 3 ? 'surprised' : 'determined');
      if (d < MONSTER_R + RUNNER_R) {
        // Chomped: flung out of the arena.
        const push = new THREE.Vector3(c.position.x - m.x, 0, c.position.z - m.z).normalize().multiplyScalar(7);
        knockOut(r, push);
        this.chomp = 0.3;
        this.game.audio.play('pop');
        solo.character.setExpression('happy');
      }
    }
    separate(this.runners.filter((r) => r.alive), RUNNER_R + 0.05);
    solo.character.pose = this.lunge > 0 ? 'jump' : 'idle';
    if (this.chomp <= 0) solo.character.setExpression('determined');
    if (this.runners.every((r) => !r.alive)) this.finish([solo]);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const r of this.runners) if (!r.alive) fall(r, dt);
    this.chomp = Math.max(0, this.chomp - dt);
    // Jaw: wide open while lunging, snaps shut on a bite, idle chomping otherwise.
    const idle = (Math.sin(this.t * 9) * 0.5 + 0.5) * 0.35;
    const open = this.lunge > 0 ? 0.75 : this.chomp > 0 ? 0 : idle;
    this.jaw.rotation.x += (-open - this.jaw.rotation.x) * Math.min(1, dt * 20);
    const speed = this.vel.length();
    this.head.position.y = MONSTER_R * 0.9 + Math.abs(Math.sin(this.t * 10)) * 0.12 * Math.min(1, speed / MONSTER_SPEED);
    for (const name of ['footL', 'footR']) {
      const foot = this.monster.getObjectByName(name)!;
      foot.position.z = 0.1 + Math.sin(this.t * 12 + (name === 'footL' ? 0 : Math.PI)) * 0.25 * Math.min(1, speed / MONSTER_SPEED);
    }
  }

  timeout(): number[] {
    return this.runners.filter((r) => r.alive).map((r) => r.seat);
  }
}

export const chompChase: MinigameDef = {
  id: 'chompchase',
  name: 'Chomp Chase',
  kind: '1v3',
  song: chompTheme,
  rules: 'Monster rider: steer the chomper and lunge to gobble all three runners! Runners: dodge around the stumps until time runs out.',
  controls: 'Rider: stick to steer, A to lunge · Runners: stick to run',
  create: () => new ChompChase(),
};
