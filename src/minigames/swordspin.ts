import * as THREE from 'three';
import { swordTheme } from '../audio/songs/graveSwordThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, scorePanel, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 7;
/** The inner disc never crumbles. */
const CORE = 4.2;
const SEGMENTS = 12;
const CRUMBLE_FROM = 22;
const CRUMBLE_EVERY = 2.2;
const SPEED = 4.2;
const DRAG = 3.2;
const SWING_TIME = 0.32;
const SWING_COOL = 0.65;
const SWING_REACH = 1.7;
const SPIN_TIME = 0.5;
const SPIN_COOL = 2.4;
const SPIN_REACH = 1.75;
const KNOCK = 5;
/** Every hit you take makes the next one send you further. */
const KNOCK_GROWTH = 0.28;
const TAU = Math.PI * 2;

type Attack = 'swing' | 'spin';

interface Fighter {
  vel: THREE.Vector3;
  pivot: THREE.Group;
  attack: Attack | null;
  attackT: number;
  swingCool: number;
  spinCool: number;
  hitThisAttack: Set<MinigamePlayer>;
  hits: number;
  stun: number;
}

interface Segment {
  mesh: THREE.Mesh;
  /** Seconds until it falls; shakes for the last one. */
  fallIn: number;
  gone: boolean;
  drop: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Foam-sword brawl on a round platform. A slashes in front of you, B is a
 * spinning sweep that hits everyone close by. Each hit you take makes you
 * fly further, and the outer ring crumbles away. Last one standing wins.
 */
class SwordSpin extends Minigame {
  readonly timeLimit = 60;
  private fighters = new Map<MinigamePlayer, Fighter>();
  private segments: Segment[] = [];
  private clock = 0;
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xffc9a8, 0xfff2d8], 0x7cc8ec, -14);
    const core = toonMesh(new THREE.CylinderGeometry(CORE, CORE, 0.6, 48), Palette.butter, { outline: 0.06 });
    core.position.y = -0.3;
    const crest = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 6), new THREE.MeshBasicMaterial({ color: Palette.peach }));
    crest.rotation.x = -Math.PI / 2;
    crest.position.y = 0.01;
    const base = toonMesh(new THREE.ConeGeometry(CORE, 7, 48), 0xc9a27a, { outline: 0.06 });
    base.rotation.x = Math.PI;
    base.position.y = -4.1;
    this.scene.add(core, crest, base);

    // The outer ring, in wedges that fall away one by one (order is seeded).
    const order = Array.from({ length: SEGMENTS }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.game.rng.int(0, i);
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const geo = new THREE.CylinderGeometry(RADIUS, RADIUS, 0.6, 8, 1, false, (i / SEGMENTS) * TAU, TAU / SEGMENTS - 0.02);
      const mesh = toonMesh(geo, i % 2 ? Palette.rose : Palette.cream, { outline: false });
      mesh.position.y = -0.31;
      this.scene.add(mesh);
      this.segments.push({ mesh, fallIn: CRUMBLE_FROM + order.indexOf(i) * CRUMBLE_EVERY, gone: false, drop: 0 });
    }
    // Pennant poles around the edge, for show.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26;
      const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), Palette.cream, { outline: 0.02 });
      pole.position.set(Math.cos(a) * (RADIUS + 1.6), 0, Math.sin(a) * (RADIUS + 1.6));
      const flag = toonMesh(new THREE.ConeGeometry(0.35, 0.9, 3), [Palette.coral, Palette.violet, Palette.green][i % 3], { outline: 0.02 });
      flag.rotation.z = -Math.PI / 2;
      flag.position.set(0.45, 1.2, 0);
      pole.add(flag);
      this.scene.add(pole);
    }

    ring(this.players, 4.6);
    for (const p of this.players) {
      // Foam sword: a fat squishy blade in the player's color on a pivot at the shoulder.
      const pivot = new THREE.Group();
      pivot.position.set(0.32, 0.75, 0.05);
      const blade = toonMesh(new THREE.CapsuleGeometry(0.11, 0.95, 4, 10), p.character.def.colors.accent, { outline: 0.025 });
      blade.rotation.x = Math.PI / 2;
      blade.position.z = 0.78;
      const guard = toonMesh(new THREE.BoxGeometry(0.36, 0.08, 0.08), Palette.cream, { outline: 0.02 });
      guard.position.z = 0.22;
      const grip = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), Palette.ink, { outline: false });
      grip.rotation.x = Math.PI / 2;
      grip.position.z = 0.1;
      pivot.add(blade, guard, grip);
      p.character.add(pivot);
      this.fighters.set(p, {
        vel: new THREE.Vector3(),
        pivot,
        attack: null,
        attackT: 0,
        swingCool: 0,
        spinCool: 0,
        hitThisAttack: new Set(),
        hits: 0,
        stun: 0,
      });
      p.data.slack = 0.35 + this.game.rng.next() * 0.3;
    }
    this.camera.position.set(0, 18, 14);
    this.camera.lookAt(0, 0, 0.4);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => {
        const f = this.fighters.get(p)!;
        return `<span style="color:${css(p.character.def.colors.accent)};opacity:${p.alive ? 1 : 0.4}">⚔ ${p.alive ? `${100 + Math.round(f.hits * KNOCK_GROWTH * 100)}%` : 'out'}</span>`;
      })
      .join('');
  }

  /** Is there floor under this point? */
  private solid(pos: THREE.Vector3): boolean {
    const r = Math.hypot(pos.x, pos.z);
    if (r <= CORE) return true;
    if (r > RADIUS) return false;
    // Cylinder theta starts at +Z and runs toward +X.
    const theta = (Math.atan2(pos.x, pos.z) + TAU) % TAU;
    return !this.segments[Math.floor((theta / TAU) * SEGMENTS) % SEGMENTS].gone;
  }

  private facing(p: MinigamePlayer): THREE.Vector3 {
    const y = p.character.rotation.y;
    return new THREE.Vector3(Math.sin(y), 0, Math.cos(y));
  }

  /**
   * CPUs circle round to the center side of their target so hits send them
   * outward, swing when lined up, and spin when crowded.
   */
  private cpu(p: MinigamePlayer, f: Fighter): { move: THREE.Vector3; swing: boolean; spin: boolean } {
    const pos = p.character.position;
    const rng = this.game.rng;
    let target: MinigamePlayer | null = null;
    let best = Infinity;
    let crowd = 0;
    for (const o of this.alive) {
      if (o === p) continue;
      const d = o.character.position.distanceTo(pos);
      if (d < SPIN_REACH) crowd++;
      // Prefer rivals near the edge.
      const score = d - Math.hypot(o.character.position.x, o.character.position.z) * 0.25;
      if (score < best) {
        best = score;
        target = o;
      }
    }
    const move = new THREE.Vector3();
    if (!target) return { move, swing: false, spin: false };
    const tp = target.character.position;
    const out = new THREE.Vector3(tp.x, 0, tp.z);
    if (out.lengthSq() < 0.01) out.set(1, 0, 0);
    out.normalize();
    const spot = tp.clone().addScaledVector(out, -1.2);
    const toSpot = spot.sub(pos).setY(0);
    const dist = pos.distanceTo(tp);
    if (toSpot.length() > 0.3) move.copy(toSpot.normalize());
    // Keep clear of the edge and of crumbling floor.
    const r = Math.hypot(pos.x, pos.z);
    const ahead = pos.clone().addScaledVector(move, 1.2);
    if (r > RADIUS - 1.5 || !this.solid(ahead)) move.addScaledVector(new THREE.Vector3(-pos.x, 0, -pos.z).normalize(), 1.4);
    if (move.length() > 1) move.normalize();
    const toT = tp.clone().sub(pos).setY(0).normalize();
    const lined = Math.abs(wrap(Math.atan2(toT.x, toT.z) - p.character.rotation.y)) < 0.5;
    const swing = dist < SWING_REACH - 0.15 && lined && rng.next() < (p.data.slack as number) * 0.12;
    const spin = f.spinCool <= 0 && rng.next() < (crowd >= 2 ? 0.04 : dist < SPIN_REACH - 0.2 ? 0.008 : 0);
    // Close in facing the target, not the movement.
    if (dist < 2.6) move.lerp(toT.multiplyScalar(0.15), 0.3);
    return { move, swing, spin };
  }

  private hit(attacker: MinigamePlayer, target: MinigamePlayer, scale: number): void {
    const f = this.fighters.get(target)!;
    const dir = target.character.position.clone().sub(attacker.character.position).setY(0);
    if (dir.lengthSq() < 0.0001) dir.copy(this.facing(attacker));
    dir.normalize();
    f.vel.addScaledVector(dir, KNOCK * scale * (1 + f.hits * KNOCK_GROWTH));
    f.hits++;
    f.stun = 0.35;
    f.attack = null;
    target.character.setExpression('surprised');
    this.game.audio.play('pop');
    this.renderScore();
  }

  play(dt: number): void {
    this.clock += dt;
    for (const s of this.segments) {
      if (s.gone || this.clock < s.fallIn) continue;
      s.gone = true;
      this.game.audio.play('boom');
    }

    for (const p of this.alive) {
      const f = this.fighters.get(p)!;
      const c = p.character;
      f.swingCool = Math.max(0, f.swingCool - dt);
      f.spinCool = Math.max(0, f.spinCool - dt);
      let move = new THREE.Vector3();
      let swing = false;
      let spin = false;
      if (f.stun > 0) {
        f.stun -= dt;
        c.pose = 'jump';
      } else if (p.controller) {
        move = stick(p);
        swing = p.controller.pressed('a');
        spin = p.controller.pressed('b');
      } else {
        ({ move, swing, spin } = this.cpu(p, f));
      }
      if (!f.attack && spin && f.spinCool <= 0) {
        f.attack = 'spin';
        f.attackT = 0;
        f.spinCool = SPIN_COOL;
        f.hitThisAttack.clear();
        this.game.audio.play('jump');
      } else if (!f.attack && swing && f.swingCool <= 0) {
        f.attack = 'swing';
        f.attackT = 0;
        f.swingCool = SWING_COOL;
        f.hitThisAttack.clear();
        this.game.audio.note('saw', 'A3', 0.08, 0.15);
      }

      const slow = f.attack === 'spin' ? 0.45 : f.attack === 'swing' ? 0.6 : 1;
      c.position.addScaledVector(move, SPEED * slow * dt);
      c.position.addScaledVector(f.vel, dt);
      f.vel.multiplyScalar(Math.exp(-DRAG * dt));
      if (f.attack === 'spin') c.rotation.y += dt * 26;
      else if (f.stun <= 0) {
        face(p, move, dt);
        moveAnim(p, move.length());
      }

      if (f.attack) {
        f.attackT += dt;
        const len = f.attack === 'spin' ? SPIN_TIME : SWING_TIME;
        const live = f.attack === 'spin' ? f.attackT > 0.05 : f.attackT > 0.06 && f.attackT < 0.24;
        if (live) {
          for (const o of this.alive) {
            if (o === p || f.hitThisAttack.has(o)) continue;
            const d = o.character.position.clone().sub(c.position).setY(0);
            const dist = d.length();
            if (f.attack === 'spin') {
              if (dist > SPIN_REACH) continue;
            } else {
              if (dist > SWING_REACH) continue;
              if (dist > 0.3 && Math.abs(wrap(Math.atan2(d.x, d.z) - c.rotation.y)) > 1.1) continue;
            }
            f.hitThisAttack.add(o);
            this.hit(p, o, f.attack === 'spin' ? 0.85 : 1);
          }
        }
        if (f.attackT >= len) f.attack = null;
      }
    }
    separate(this.alive, 0.42);

    const before = this.alive;
    for (const p of before) {
      if (this.solid(p.character.position)) continue;
      knockOut(p, this.fighters.get(p)!.vel.clone().multiplyScalar(0.6));
      this.game.audio.play('back');
      this.renderScore();
    }
    for (const p of this.players) if (!p.alive) fall(p, dt);
    // Everyone left fell together: they share the win.
    if (before.length > 0 && this.alive.length === 0) this.finish(before);
    else if (this.alive.length <= 1 && this.players.length > 1) this.finish(this.alive);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const s of this.segments) {
      const left = s.fallIn - this.clock;
      if (s.gone) {
        s.drop += dt;
        s.mesh.position.y = -0.31 - s.drop * s.drop * 12;
        s.mesh.visible = s.drop < 2;
      } else if (left < 1.2 && this.clock > 0) {
        // Shake before it goes so players can get off.
        s.mesh.position.y = -0.31 + Math.sin(this.t * 60) * 0.05;
        (s.mesh.material as THREE.MeshToonMaterial).color.setHex(Math.sin(this.t * 20) > 0 ? Palette.coral : Palette.rose);
      }
    }
    for (const [p, f] of this.fighters) {
      const pv = f.pivot;
      if (f.attack === 'swing') {
        // Wide horizontal slash, right to left.
        const k = Math.min(1, f.attackT / SWING_TIME);
        pv.rotation.set(0, 1.5 - Math.sin(k * Math.PI * 0.5) * 3, 0);
      } else if (f.attack === 'spin') {
        pv.rotation.set(0, -Math.PI / 2 + 0.3, 0);
      } else {
        // Held up at the ready.
        pv.rotation.x += (-0.9 - pv.rotation.x) * Math.min(1, dt * 10);
        pv.rotation.y += (0.35 - pv.rotation.y) * Math.min(1, dt * 10);
        pv.rotation.z = 0;
      }
      if (p.alive && f.stun <= 0 && !f.attack && p.character.pose === 'jump') p.character.pose = 'idle';
    }
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const swordSpin: MinigameDef = {
  id: 'swordspin',
  name: 'Sword Spin',
  kind: 'ffa',
  duel: true,
  song: swordTheme,
  rules: 'Bonk rivals off the platform with your foam sword! Every hit sends them further, and the outer ring crumbles. Last one standing wins!',
  controls: 'Stick: move · A: slash · B: spin attack',
  create: () => new SwordSpin(),
};
