import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const R0 = 2.7;
/** A platform smaller than this crumbles into the sea. */
const MIN_R = 0.75;
const SHRINK = 0.32;
const GAP = 6.3;
const SPEED = 4.6;
const JUMP_V = 8.6;
const GRAVITY = 25;
const POUND_V = -20;
const SHOCK_R = 2.6;
const SHOCK_PUSH = 7.5;
const STUN = 0.55;
const BODY_R = 0.35;

interface Pad {
  owner: MinigamePlayer;
  center: THREE.Vector3;
  r: number;
  top: THREE.Group;
  pillar: THREE.Mesh;
  /** Screen-shake left after a pound. */
  shake: number;
  sinking: boolean;
}

interface Body {
  vy: number;
  kick: THREE.Vector3;
  pounding: boolean;
  stun: number;
  grounded: boolean;
}

/** Platform Pop: bouncy staccato tune in A minor over a stomping beat. */
const platformTheme: Song = {
  name: 'Platform Pop',
  bpm: 140,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'pulse',
      volume: 0.14,
      pattern: [
        'A4 . C5 . E5 . . A5 . . G5 . E5 . C5 .',
        'D5 . F5 . A5 . . G5 . . F5 . E5 . D5 .',
        'C5 . E5 . G5 . . C6 . . B5 . G5 . E5 .',
        'E5 . G#5 . B5 . . E6 . D6 . B5 . G#5 . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.45,
      pattern: [
        'A1 . A2 . A1 . A2 . A1 . A2 . E2 . G2 .',
        'D2 . D3 . D2 . D3 . D2 . D3 . A2 . C3 .',
        'C2 . C3 . C2 . C3 . G1 . G2 . G1 . B1 .',
        'E2 . E3 . E2 . E3 . E2 . D3 . B2 . G#2 .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.1, pattern: Array(4).fill('. . E4 . . . E4 . . . E4 . . . E4 .').join(' ') },
    { instrument: 'kick', volume: 0.65, pattern: Array(4).fill('x . . . x . . . x . . . x . x .').join(' ') },
    { instrument: 'snare', volume: 0.24, pattern: Array(4).fill('. . . . x . . . . . . . x . . x').join(' ') },
    { instrument: 'hat', volume: 0.07, pattern: Array(4).fill('x . x . x . x . x . x . x . x .').join(' ') },
  ],
};

/**
 * Everyone owns a platform. Jump over to a rival's and ground-pound it: each
 * pound shrinks it and knocks anyone nearby toward the edge. Pounding your own
 * platform only sends out the shockwave. Fall in the sea and you're out!
 */
class PlatformPop extends Minigame {
  readonly timeLimit = 45;
  private pads: Pad[] = [];
  private bodies = new Map<MinigamePlayer, Body>();
  private rings: THREE.Mesh[] = [];

  protected setup(): void {
    arenaBasics(this.scene, [0xffc9a8, 0xfff0d8], 0x6fb8e8, -6);
    // Rocks and floats bobbing in the sea below.
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39;
      const r = 9 + (i % 4) * 2.2;
      const rock = i % 3
        ? toonMesh(new THREE.DodecahedronGeometry(0.5 + (i % 3) * 0.3), 0xa8a0b8, { outline: 0.03 })
        : toonMesh(new THREE.TorusGeometry(0.5, 0.2, 8, 16), i % 2 ? Palette.coral : Palette.cream, { outline: 0.02 });
      rock.position.set(Math.cos(a) * r, -5.9, Math.sin(a) * r * 0.7);
      if (!(i % 3)) rock.rotation.x = Math.PI / 2;
      this.scene.add(rock);
    }
    const n = this.players.length;
    const spots =
      n <= 2
        ? [new THREE.Vector3(-GAP / 2, 0, 0), new THREE.Vector3(GAP / 2, 0, 0)]
        : [
            new THREE.Vector3(-GAP / 2, 0, -GAP / 2),
            new THREE.Vector3(GAP / 2, 0, -GAP / 2),
            new THREE.Vector3(GAP / 2, 0, GAP / 2),
            new THREE.Vector3(-GAP / 2, 0, GAP / 2),
          ];
    this.players.forEach((p, i) => {
      const center = spots[i];
      const accent = p.character.def.colors.accent;
      const top = new THREE.Group();
      // Thin outline: the whole top is scaled up by its radius.
      const slab = toonMesh(new THREE.CylinderGeometry(1, 1, 0.5, 40), Palette.cream, { outline: 0.02 });
      slab.position.y = -0.25;
      const band = toonMesh(new THREE.CylinderGeometry(1.01, 1.01, 0.18, 40), accent, { outline: false });
      band.position.y = -0.3;
      const spot = toonMesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 24), accent, { outline: false });
      spot.position.y = 0.01;
      top.add(slab, band, spot);
      top.position.copy(center);
      top.scale.set(R0, 1, R0);
      const pillar = toonMesh(new THREE.CylinderGeometry(0.8, 0.5, 6, 20), 0xc9a27a, { outline: 0.05 });
      pillar.position.set(center.x, -3.5, center.z);
      this.scene.add(top, pillar);
      this.pads.push({ owner: p, center, r: R0, top, pillar, shake: 0, sinking: false });

      p.character.position.set(center.x * 0.85, 0, center.z * 0.85);
      p.character.rotation.y = Math.atan2(-center.x, -center.z);
      this.bodies.set(p, { vy: 0, kick: new THREE.Vector3(), pounding: false, stun: 0, grounded: true });
      p.data.think = 0.4 + this.game.rng.next() * 0.6;
      p.data.target = null;
    });

    this.camera.position.set(0, 17, 13.5);
    this.camera.lookAt(0, -0.5, 0.6);
  }

  private padUnder(pos: THREE.Vector3): Pad | null {
    for (const pad of this.pads) {
      if (pad.sinking) continue;
      if (Math.hypot(pos.x - pad.center.x, pos.z - pad.center.z) <= pad.r) return pad;
    }
    return null;
  }

  private ownPad(p: MinigamePlayer): Pad {
    return this.pads.find((pad) => pad.owner === p)!;
  }

  /**
   * CPUs pick a rival's platform (bigger is juicier, closer is easier), hop
   * over, and pound it from the top of a hop. Shoved near an edge, they scurry
   * back toward the middle first.
   */
  private cpu(p: MinigamePlayer, body: Body, dt: number): { move: THREE.Vector3; jump: boolean; pound: boolean } {
    const rng = this.game.rng;
    const pos = p.character.position;
    const none = { move: new THREE.Vector3(), jump: false, pound: false };
    const here = this.padUnder(pos);

    let target = p.data.target as Pad | null;
    if (!target || target.sinking) {
      const options = this.pads.filter((pad) => pad.owner !== p && !pad.sinking);
      if (!options.length) target = this.ownPad(p);
      else {
        const rank = (pad: Pad) => pad.r * 2 - pad.center.distanceTo(pos) * 0.4 + (pad.owner.alive ? 0.6 : 0) + rng.next() * 1.5;
        target = options.reduce((a, b) => (rank(b) > rank(a) ? b : a));
      }
      p.data.target = target;
    }

    p.data.think = (p.data.think as number) - dt;
    if (!body.grounded) {
      // In the air: steer for the pad we leapt toward, pound once over the target.
      const goal = (p.data.goal as Pad | null) ?? target;
      const to = new THREE.Vector3(goal.center.x - pos.x, 0, goal.center.z - pos.z);
      const over = here === target && to.length() < target.r * 0.6;
      const pound = over && body.vy < 2 && !body.pounding && target.owner !== p;
      return { move: to.length() > 0.2 ? to.normalize() : new THREE.Vector3(), jump: false, pound };
    }
    if (!here) return none;

    // Diagonal pads are too far to clear in one leap, so hop via a neighbor.
    let goal = target;
    if (here !== target && !this.reachable(here, target)) {
      goal = this.pads.find((pad) => pad !== here && this.reachable(here, pad) && this.reachable(pad, target)) ?? here;
    }
    p.data.goal = goal;
    const toGoal = new THREE.Vector3(goal.center.x - pos.x, 0, goal.center.z - pos.z);
    const distG = toGoal.length();

    // Too close to the edge of a platform we aren't heading off: back to the middle.
    const fromHere = new THREE.Vector3(pos.x - here.center.x, 0, pos.z - here.center.z);
    if (here !== goal && fromHere.length() > here.r - 0.5) {
      const away = toGoal.clone().normalize();
      const outward = fromHere.clone().normalize();
      if (away.dot(outward) < 0.6) return { move: outward.multiplyScalar(-1), jump: false, pound: false };
    }

    if ((p.data.think as number) > 0) return { move: fromHere.clone().multiplyScalar(-0.3), jump: false, pound: false };

    if (here === goal) {
      // On the target: hop in place near its middle, then pound at the top.
      if (distG > goal.r * 0.45) return { move: toGoal.normalize(), jump: false, pound: false };
      p.data.think = 0.15 + rng.next() * 0.5;
      if (goal !== target || rng.next() < 0.15) p.data.target = null;
      return { move: new THREE.Vector3(), jump: goal === target, pound: false };
    }
    // Run toward the next pad and leap from the near edge.
    const dir = toGoal.clone().normalize();
    const edgeDist = here.r - fromHere.dot(dir);
    const jump = edgeDist < 0.55 + rng.next() * 0.2;
    return { move: dir, jump, pound: false };
  }

  /** Can a running jump clear the gap between two pads? */
  private reachable(a: Pad, b: Pad): boolean {
    return !b.sinking && a.center.distanceTo(b.center) - a.r - b.r < 2.4;
  }

  play(dt: number): void {
    for (const p of this.alive) {
      const c = p.character;
      const body = this.bodies.get(p)!;
      body.stun = Math.max(0, body.stun - dt);
      let move = new THREE.Vector3();
      let jump = false;
      let pound = false;
      if (body.stun <= 0) {
        if (p.controller) {
          move = stick(p);
          const a = p.controller.pressed('a');
          jump = a && body.grounded;
          pound = (a || p.controller.pressed('b')) && !body.grounded;
        } else ({ move, jump, pound } = this.cpu(p, body, dt));
      }

      if (jump && body.grounded) {
        body.vy = JUMP_V;
        body.grounded = false;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      if (pound && !body.grounded && !body.pounding) {
        body.pounding = true;
        body.vy = POUND_V;
        body.kick.set(0, 0, 0);
        this.game.audio.note('square', 'C4', 0.08, 0.15);
      }

      if (!body.pounding) c.position.addScaledVector(move, SPEED * dt);
      c.position.addScaledVector(body.kick, dt);
      body.kick.multiplyScalar(Math.max(0, 1 - dt * (body.grounded ? 5 : 1)));
      face(p, move, dt);
      if (body.pounding) c.rotation.x = Math.min(0.6, c.rotation.x + dt * 6);

      const pad = this.padUnder(c.position);
      if (body.grounded) {
        if (!pad) body.grounded = false;
        else moveAnim(p, move.length());
      }
      if (!body.grounded) {
        body.vy -= GRAVITY * dt;
        const wasAbove = c.position.y >= 0;
        c.position.y += body.vy * dt;
        if (wasAbove && c.position.y <= 0 && pad) {
          c.position.y = 0;
          body.vy = 0;
          body.grounded = true;
          c.land();
          c.pose = 'idle';
          c.rotation.x = 0;
          if (body.pounding) this.slam(p, pad);
          body.pounding = false;
        } else if (c.position.y < -1.2) {
          body.pounding = false;
          c.rotation.x = 0;
          knockOut(p, body.kick.clone().multiplyScalar(0.3));
          this.game.audio.play('back');
        }
      }
    }

    // Bump bodies apart on the same level.
    const live = this.alive;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].character.position;
        const b = live[j].character.position;
        if (Math.abs(a.y - b.y) > 0.8) continue;
        const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
        const len = d.length();
        if (len > 0 && len < BODY_R * 2) {
          d.multiplyScalar((BODY_R * 2 - len) / len / 2);
          a.sub(d);
          b.add(d);
        }
      }
    }

    for (const p of this.players) if (!p.alive) fall(p, dt);
    if (this.alive.length <= 1 && this.players.length > 1) {
      for (const p of this.alive) p.character.pose = 'cheer';
      this.finish(this.alive);
    }
  }

  /** A ground-pound lands: shockwave, and a rival's platform shrinks. */
  private slam(p: MinigamePlayer, pad: Pad): void {
    const at = p.character.position;
    this.game.audio.play('boom');
    pad.shake = 0.35;
    this.shockRing(at);
    for (const o of this.alive) {
      if (o === p) continue;
      const ob = this.bodies.get(o)!;
      const d = new THREE.Vector3(o.character.position.x - at.x, 0, o.character.position.z - at.z);
      const len = d.length();
      if (!ob.grounded || len > SHOCK_R || this.padUnder(o.character.position) !== pad) continue;
      if (len < 0.01) d.set(1, 0, 0);
      ob.kick.copy(d.normalize().multiplyScalar(SHOCK_PUSH * (1.2 - len / SHOCK_R)));
      ob.stun = STUN;
      // A little hop so they can't just stand firm.
      ob.vy = 3.5;
      ob.grounded = false;
      o.character.pose = 'jump';
      o.character.setExpression('surprised');
    }
    if (pad.owner === p) return;
    pad.r -= SHRINK;
    if (pad.r < MIN_R) {
      pad.sinking = true;
      this.game.audio.play('pop');
      for (const o of this.alive) {
        if (Math.hypot(o.character.position.x - pad.center.x, o.character.position.z - pad.center.z) <= pad.r + BODY_R) {
          const ob = this.bodies.get(o)!;
          ob.grounded = false;
          ob.vy = Math.min(ob.vy, 0);
        }
      }
    }
  }

  private shockRing(at: THREE.Vector3): void {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: Palette.cream, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.05, at.z);
    mesh.userData.life = 0;
    this.scene.add(mesh);
    this.rings.push(mesh);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const pad of this.pads) {
      const s = pad.r;
      pad.top.scale.x += (s - pad.top.scale.x) * Math.min(1, dt * 12);
      pad.top.scale.z = pad.top.scale.x;
      pad.shake = Math.max(0, pad.shake - dt);
      const jiggle = pad.shake > 0 ? Math.sin(this.t * 70) * pad.shake * 0.25 : 0;
      pad.top.position.set(pad.center.x + jiggle, pad.center.y - (pad.shake > 0 ? 0.06 : 0), pad.center.z);
      if (pad.sinking) {
        pad.top.position.y = pad.center.y = pad.center.y - dt * 6;
        pad.pillar.position.y -= dt * 6;
      }
    }
    this.rings = this.rings.filter((ring) => {
      ring.userData.life += dt;
      const k = ring.userData.life / 0.4;
      ring.scale.setScalar(0.4 + k * SHOCK_R);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k < 1) return true;
      this.scene.remove(ring);
      return false;
    });
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const platformPop: MinigameDef = {
  id: 'platformpop',
  name: 'Platform Pop',
  kind: 'ffa',
  duel: true,
  song: platformTheme,
  rules: "Jump onto rivals' platforms and ground-pound them smaller. Every pound shoves nearby players toward the edge. Last one dry wins!",
  controls: 'Stick: move · A: jump · A/B in the air: ground-pound',
  create: () => new PlatformPop(),
};
