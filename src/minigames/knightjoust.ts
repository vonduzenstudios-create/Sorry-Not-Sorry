import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { fall, knockOut, ring, scorePanel, stick } from './common';
import type { MinigameDef, MinigamePlayer } from './types';
import { Minigame } from './types';

const RADIUS = 9;
const HP = 3;
const TROT = 4.2;
const TURN = 3.2;
const CHARGE_TURN = 1.1;
const CHARGE_SPEED = 11;
const CHARGE_TIME = 0.65;
const COOLDOWN = 2;
/** Lance tip distance ahead of the rider. */
const REACH = 2;
const HIT_R = 0.6;
const STUN = 0.5;
const SAFE = 1.6;
const BODY = 0.55;
/** How squarely you must face a charge to block it (dot product). */
const SHIELD = 0.55;

/** Knight Joust: a galloping D major fanfare in triplets. */
const joustTheme: Song = {
  name: 'Knight Joust',
  bpm: 126,
  stepsPerBeat: 3,
  tracks: [
    {
      instrument: 'reed',
      volume: 0.18,
      pattern: [
        'D5 . D5 D5 . A4 D5 . F#5 A5 - -',
        'G5 . F#5 E5 . D5 E5 - - A4 . .',
        'B4 . D5 G5 . F#5 E5 . D5 C#5 . A4',
        'D5 . F#5 E5 . C#5 D5 - - . . .',
      ].join(' '),
    },
    {
      instrument: 'square',
      volume: 0.07,
      pattern: [
        'A4 . A4 A4 . F#4 A4 . A4 D5 . .',
        'B4 . B4 G4 . G4 A4 . . E4 . .',
        'G4 . G4 D5 . D5 C#5 . B4 A4 . E4',
        'F#4 . A4 G4 . E4 F#4 . . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.42,
      pattern: [
        'D2 . . A2 . . D2 . . A2 . .',
        'G2 . . D2 . . A2 . . E2 . .',
        'G2 . . D3 . . A2 . . E2 . .',
        'D2 . . A1 . . D2 . . D2 . .',
      ].join(' '),
    },
    // Hoofbeats.
    { instrument: 'kick', volume: 0.5, pattern: 'x . x x . . x . x x . .' },
    { instrument: 'hat', volume: 0.1, pattern: 'x . x x . x x . x x . x' },
    { instrument: 'snare', volume: 0.16, pattern: '. . . x . . . . . x . .' },
  ],
};

interface Knight {
  heading: number;
  speed: number;
  charge: number;
  cool: number;
  stun: number;
  safe: number;
  hp: number;
  knock: THREE.Vector3;
  lance: THREE.Group;
  horse: THREE.Group;
}

const fwd = (h: number) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Hobby-horse jousting in a round tiltyard. Steer your steed, press A to
 * lower your lance and charge. Spear a rival and they lose a heart; lose all
 * three and you're unhorsed. Facing a charge blocks it on your shield, and
 * lances meeting head on just clang apart. Last knight riding wins.
 */
class KnightJoust extends Minigame {
  readonly timeLimit = 50;
  private knights = new Map<MinigamePlayer, Knight>();
  private board!: HTMLDivElement;
  private lastHud = '';
  private sparks: { mesh: THREE.Mesh; life: number }[] = [];

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xfff0d6], 0x9fe3a8, -0.3);
    const yard = toonMesh(new THREE.CylinderGeometry(RADIUS + 0.6, RADIUS + 0.6, 0.4, 64), Palette.sand, { outline: 0.06 });
    yard.position.y = -0.2;
    this.scene.add(yard);
    // Raked rings in the sand and a center crest.
    for (const r of [3, 6]) {
      const line = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r + 0.08, 64), new THREE.MeshBasicMaterial({ color: 0xe8d29a }));
      line.rotation.x = -Math.PI / 2;
      line.position.y = 0.01;
      this.scene.add(line);
    }
    const crest = new THREE.Mesh(new THREE.CircleGeometry(1.2, 6), new THREE.MeshBasicMaterial({ color: Palette.rose }));
    crest.rotation.x = -Math.PI / 2;
    crest.position.y = 0.02;
    this.scene.add(crest);

    // Fence of posts and rails, with pennant poles.
    const postGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const post = toonMesh(postGeo, Palette.cream, { outline: 0.02 });
      post.position.set(Math.cos(a) * (RADIUS + 0.4), 0.55, Math.sin(a) * (RADIUS + 0.4));
      this.scene.add(post);
    }
    for (const y of [0.5, 0.95]) {
      const rail = toonMesh(new THREE.TorusGeometry(RADIUS + 0.4, 0.07, 6, 80), Palette.peach, { outline: 0.02 });
      rail.rotation.x = Math.PI / 2;
      rail.position.y = y;
      this.scene.add(rail);
    }
    const flagColors = [Palette.coral, Palette.violet, Palette.green, Palette.yellow];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const pole = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), Palette.cream, { outline: 0.02 });
      const at = new THREE.Vector3(Math.cos(a) * (RADIUS + 1.6), 2, Math.sin(a) * (RADIUS + 1.6));
      pole.position.copy(at);
      const flag = toonMesh(new THREE.ConeGeometry(0.45, 1.3, 3), flagColors[k % 4], { outline: 0.02 });
      flag.rotation.z = -Math.PI / 2;
      flag.scale.set(1, 1, 0.2);
      flag.position.set(0.6, 1.6, 0);
      pole.add(flag);
      this.scene.add(pole);
    }

    ring(this.players, 6);
    for (const p of this.players) {
      const color = p.character.def.colors.accent;
      const horse = this.makeHorse(color);
      const lance = this.makeLance(color);
      const shield = toonMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 6), color, { outline: 0.03 });
      shield.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      shield.position.set(-0.5, 1.05, 0.25);
      const boss = toonMesh(new THREE.SphereGeometry(0.12, 10, 8), Palette.cream, { outline: false });
      boss.position.y = 0.06;
      shield.add(boss);
      p.character.add(horse, lance, shield);
      p.character.scale.setScalar(0.95);
      p.data.skill = 0.86 + this.game.rng.next() * 0.1;
      this.knights.set(p, {
        heading: p.character.rotation.y,
        speed: 0,
        charge: 0,
        cool: 0.6 + p.seat * 0.15,
        stun: 0,
        safe: 0,
        hp: HP,
        knock: new THREE.Vector3(),
        lance,
        horse,
      });
    }

    this.camera.position.set(0, 23, 13.5);
    this.camera.lookAt(0, 0, 0.4);
    this.board = scorePanel(this.overlay);
    this.renderHud();
  }

  /** Stick horse: a pole between the legs, a head out front and a yarn mane. */
  private makeHorse(color: number): THREE.Group {
    const g = new THREE.Group();
    const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8), 0xc89060, { outline: 0.02 });
    pole.rotation.x = Math.PI / 2 - 0.35;
    pole.position.set(0, 0.5, 0.1);
    const head = toonMesh(new THREE.BoxGeometry(0.34, 0.42, 0.7), Palette.cream, { outline: 0.03 });
    head.position.set(0, 0.95, 0.95);
    head.rotation.x = 0.35;
    const snout = toonMesh(new THREE.BoxGeometry(0.3, 0.28, 0.32), Palette.peach, { outline: 0.03 });
    snout.position.set(0, -0.12, 0.42);
    head.add(snout);
    for (const x of [-0.11, 0.11]) {
      const ear = toonMesh(new THREE.ConeGeometry(0.07, 0.2, 6), Palette.cream, { outline: 0.02 });
      ear.position.set(x, 0.28, -0.15);
      head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: Palette.ink }));
      eye.position.set(x * 1.6, 0.08, 0.12);
      head.add(eye);
    }
    const mane = toonMesh(new THREE.BoxGeometry(0.1, 0.18, 0.6), color, { outline: 0.02 });
    mane.position.set(0, 0.24, -0.08);
    head.add(mane);
    const bridle = toonMesh(new THREE.TorusGeometry(0.17, 0.03, 6, 14), color, { outline: false });
    bridle.position.set(0, -0.08, 0.3);
    head.add(bridle);
    g.add(pole, head);
    return g;
  }

  /** Striped lance with a hand guard, held at the hip pointing forward. */
  private makeLance(color: number): THREE.Group {
    const g = new THREE.Group();
    const shaft = toonMesh(new THREE.ConeGeometry(0.13, 2.3, 10), color, { outline: 0.02 });
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 1.0;
    const stripe = toonMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 10), Palette.cream, { outline: false });
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = 0.6;
    const guard = toonMesh(new THREE.ConeGeometry(0.28, 0.35, 12), Palette.cream, { outline: 0.02 });
    guard.rotation.x = -Math.PI / 2;
    guard.position.z = -0.05;
    g.add(shaft, stripe, guard);
    g.position.set(0.4, 1.0, 0.1);
    return g;
  }

  private tip(p: MinigamePlayer, k: Knight): THREE.Vector3 {
    return p.character.position.clone().addScaledVector(fwd(k.heading), REACH);
  }

  /** CPUs line up on the weakest nearby rival, charge when lined up, and sidestep incoming lances. */
  private cpu(p: MinigamePlayer, k: Knight): { dir: THREE.Vector3; charge: boolean } {
    const pos = p.character.position;
    let target: MinigamePlayer | null = null;
    let best = Infinity;
    for (const o of this.alive) {
      if (o === p) continue;
      const ok = this.knights.get(o)!;
      const d = o.character.position.distanceTo(pos) + ok.hp * 1.5 + ((o.seat + p.seat) % 3) * 0.8;
      if (d < best) {
        best = d;
        target = o;
      }
    }
    if (!target) return { dir: new THREE.Vector3(), charge: false };
    // A rival charging straight at us: turn to take it on the shield, or sidestep.
    for (const o of this.alive) {
      if (o === p) continue;
      const ok = this.knights.get(o)!;
      if (ok.charge <= 0) continue;
      const to = pos.clone().sub(o.character.position);
      const d = to.length();
      if (d < 6 && fwd(ok.heading).dot(to.normalize()) > 0.7) {
        if ((p.seat + o.seat + Math.floor(this.t / 4)) % 2 === 0) return { dir: to.negate(), charge: false };
        const side = new THREE.Vector3(to.z, 0, -to.x);
        if (p.seat % 2) side.negate();
        return { dir: side, charge: false };
      }
    }
    const to = target.character.position.clone().sub(pos);
    const d = to.length();
    // Circle in from a little to the side, then straighten for the charge.
    const aim = to.clone().normalize();
    if (d > 4) aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.t * 0.8 + p.seat * 2) * 0.5);
    // Stay off the fence.
    if (pos.length() > RADIUS - 1.5) aim.addScaledVector(pos.clone().normalize(), -1).normalize();
    const facing = fwd(k.heading).dot(to.normalize());
    const skill = p.data.skill as number;
    // A beat of hesitation before couching the lance, so charges aren't frame-perfect.
    const lined = d < 4.5 + skill && facing > skill && k.cool <= 0;
    return { dir: aim, charge: lined && this.game.rng.next() < 0.05 };
  }

  play(dt: number): void {
    for (const p of this.players) {
      const k = this.knights.get(p)!;
      const c = p.character;
      if (!p.alive) {
        fall(p, dt);
        continue;
      }
      k.cool = Math.max(0, k.cool - dt);
      k.safe = Math.max(0, k.safe - dt);
      k.charge = Math.max(0, k.charge - dt);

      // Knockback slides off whatever else is going on.
      c.position.addScaledVector(k.knock, dt);
      k.knock.multiplyScalar(Math.exp(-5 * dt));

      if (k.stun > 0) {
        k.stun -= dt;
        k.speed = 0;
        k.charge = 0;
        c.pose = 'sulk';
        this.keepIn(c.position, k);
        continue;
      }

      let dir: THREE.Vector3;
      let charge: boolean;
      if (p.controller) {
        dir = stick(p);
        charge = p.controller.pressed('a');
      } else {
        ({ dir, charge } = this.cpu(p, k));
      }

      if (charge && k.cool <= 0 && k.charge <= 0) {
        k.charge = CHARGE_TIME;
        k.cool = COOLDOWN;
        this.game.audio.note('reed', 'A5', 0.1, 0.18);
        this.game.audio.note('reed', 'D6', 0.2, 0.18);
      }

      const want = dir.lengthSq() > 0.04;
      if (want) {
        const diff = wrapAngle(Math.atan2(dir.x, dir.z) - k.heading);
        const rate = k.charge > 0 ? CHARGE_TURN : TURN;
        k.heading += THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
      }
      const target = k.charge > 0 ? CHARGE_SPEED : want ? TROT * Math.min(1, dir.length()) : 0;
      k.speed += (target - k.speed) * Math.min(1, dt * (k.charge > 0 ? 10 : 5));
      c.position.addScaledVector(fwd(k.heading), k.speed * dt);
      this.keepIn(c.position, k);
      c.rotation.y = k.heading;
      c.pose = k.speed > 0.4 ? 'walk' : 'idle';
      c.moveSpeed = Math.min(1, k.speed / TROT);
      c.setExpression(k.charge > 0 ? 'determined' : 'happy');
    }

    this.collide();
    this.strikes();
    this.renderHud();
    if (this.alive.length <= 1) this.finish(this.alive);
  }

  /** The fence turns you back toward the middle. */
  private keepIn(pos: THREE.Vector3, k: Knight): void {
    const r = Math.hypot(pos.x, pos.z);
    if (r <= RADIUS - 0.4) return;
    pos.multiplyScalar((RADIUS - 0.4) / r);
    const inward = Math.atan2(-pos.x, -pos.z);
    if (k.charge > 0) {
      k.charge = 0;
      k.speed *= 0.3;
    }
    k.heading += wrapAngle(inward - k.heading) * 0.15;
  }

  private collide(): void {
    const live = this.alive;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].character.position;
        const b = live[j].character.position;
        const n = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
        const d = n.length();
        if (d === 0 || d > BODY * 2) continue;
        n.multiplyScalar((BODY * 2 - d) / d / 2);
        a.sub(n);
        b.add(n);
      }
    }
  }

  /** Charging lance tips against rival bodies, and lance against lance. */
  private strikes(): void {
    const live = this.alive;
    for (const p of live) {
      const k = this.knights.get(p)!;
      if (k.charge <= 0 || !p.alive) continue;
      const tip = this.tip(p, k);
      for (const o of live) {
        if (o === p || !o.alive) continue;
        const ok = this.knights.get(o)!;
        // Head-on: both charging and facing each other, tips cross.
        if (ok.charge > 0 && fwd(k.heading).dot(fwd(ok.heading)) < -0.75 && tip.distanceTo(this.tip(o, ok)) < 1.4) {
          this.clang(p, k, o, ok);
          break;
        }
        if (ok.safe > 0) continue;
        const body = o.character.position.clone().setY(0);
        if (tip.setY(0).distanceTo(body) > HIT_R + BODY * 0.6) continue;
        // Facing the charge takes it on the shield.
        const toAttacker = p.character.position.clone().sub(o.character.position).setY(0).normalize();
        if (ok.stun <= 0 && fwd(ok.heading).dot(toAttacker) > SHIELD) this.block(p, k, ok);
        else this.hit(p, k, o, ok);
        break;
      }
    }
  }

  private clang(p: MinigamePlayer, k: Knight, o: MinigamePlayer, ok: Knight): void {
    for (const [who, kn, other] of [
      [p, k, o],
      [o, ok, p],
    ] as const) {
      kn.charge = 0;
      kn.speed = 0;
      kn.stun = 0.35;
      kn.knock.copy(who.character.position.clone().sub(other.character.position).setY(0).normalize().multiplyScalar(7));
    }
    const mid = this.tip(p, k).lerp(this.tip(o, ok), 0.5);
    this.spark(mid, Palette.butter);
    this.game.audio.note('bell', 'E6', 0.25, 0.3);
    this.game.audio.note('bell', 'B6', 0.3, 0.2);
  }

  private block(p: MinigamePlayer, k: Knight, ok: Knight): void {
    k.charge = 0;
    k.speed = 0;
    k.stun = 0.6;
    k.knock.copy(fwd(k.heading).multiplyScalar(-8));
    ok.knock.copy(fwd(k.heading).multiplyScalar(3));
    this.spark(this.tip(p, k).setY(1), Palette.cream);
    this.game.audio.note('bell', 'G5', 0.2, 0.3);
    this.game.audio.play('jump');
  }

  private hit(p: MinigamePlayer, k: Knight, o: MinigamePlayer, ok: Knight): void {
    const push = fwd(k.heading).multiplyScalar(9);
    k.charge = 0;
    k.speed *= 0.3;
    ok.hp--;
    ok.stun = STUN;
    ok.safe = SAFE;
    ok.knock.copy(push);
    o.character.setExpression('surprised');
    this.spark(this.tip(p, k).setY(1.2), o.character.def.colors.accent);
    if (ok.hp <= 0) {
      ok.lance.visible = false;
      knockOut(o, push.clone().multiplyScalar(0.6));
      this.game.audio.play('boom');
    } else {
      this.game.audio.play('pop');
    }
  }

  private spark(at: THREE.Vector3, color: number): void {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color, transparent: true }));
    mesh.position.copy(at).setY(Math.max(at.y, 1));
    this.scene.add(mesh);
    this.sparks.push({ mesh, life: 0.4 });
  }

  private renderHud(): void {
    const html = this.players
      .map((p) => {
        const hp = this.knights.get(p)!.hp;
        const plumes = hp > 0 ? '♥'.repeat(hp) + '♡'.repeat(HP - hp) : '✖';
        return `<span style="color:${css(p.character.def.colors.accent)}">${plumes}</span>`;
      })
      .join('');
    if (html !== this.lastHud) {
      this.board.innerHTML = html;
      this.lastHud = html;
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) {
      const k = this.knights.get(p)!;
      if (!p.alive) continue;
      // Gallop bounce, lance dips while charging, blink when just hit.
      const bounce = Math.abs(Math.sin(this.t * (6 + k.speed))) * Math.min(1, k.speed / TROT) * 0.18;
      p.character.position.y = bounce;
      k.horse.rotation.x = Math.sin(this.t * (6 + k.speed)) * 0.08 * Math.min(1, k.speed / TROT);
      const lower = k.charge > 0 ? 1 : 0;
      k.lance.rotation.x += ((lower ? 0.08 : -0.35) - k.lance.rotation.x) * Math.min(1, dt * 12);
      k.lance.position.x += ((lower ? 0.15 : 0.4) - k.lance.position.x) * Math.min(1, dt * 12);
      p.character.visible = k.safe <= 0 || Math.floor(k.safe * 14) % 2 === 0;
    }
    for (const s of this.sparks) {
      s.life -= dt;
      s.mesh.scale.setScalar(1 + (0.4 - s.life) * 5);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life / 0.4);
      if (s.life <= 0) this.scene.remove(s.mesh);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  timeout(): number[] {
    // Most plumes left among those still riding.
    const live = this.alive;
    const best = Math.max(...live.map((p) => this.knights.get(p)!.hp));
    return live.filter((p) => this.knights.get(p)!.hp === best).map((p) => p.seat);
  }
}

export const knightJoust: MinigameDef = {
  id: 'knightjoust',
  name: 'Knight Joust',
  kind: 'ffa',
  duel: true,
  song: joustTheme,
  rules: 'Saddle up your hobby horse! Press A to lower your lance and charge. Face a charge to block it with your shield, so strike from the side. Each hit costs a heart; lose all three and you’re unhorsed. Last knight riding wins.',
  controls: 'Stick: steer · A: charge',
  create: () => new KnightJoust(),
};
