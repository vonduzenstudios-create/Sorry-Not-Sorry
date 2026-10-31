import * as THREE from 'three';
import { moleTheme } from '../audio/songs/skyMoleThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, separate, stick, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const COLS = 4;
const ROWS = 3;
const GAP = 2.6;
const HALF_W = 6.4;
const HALF_D = 4.6;
const SPEED = 5.5;
/** How far in front of a player the mallet lands. */
const REACH = 0.95;
const HIT = 0.85;
const COOLDOWN = 0.35;
/** Popped-up height and hidden depth of whatever is in a hole. */
const UP_Y = 0.15;
const DOWN_Y = -1.1;

type Popper = 'mole' | 'gold' | 'bomb';

interface Hole {
  pos: THREE.Vector3;
  mole: THREE.Group;
  gold: THREE.Group;
  bomb: THREE.Group;
  kind: Popper | null;
  /** Seconds left before it ducks back down. */
  up: number;
  /** 0 hidden .. 1 fully up (animation only reads it). */
  rise: number;
  /** Seconds since it popped up, so CPUs don't react instantly. */
  age: number;
  /** Squash after a bonk. */
  squash: number;
}

/**
 * Moles pop out of the lawn: bonk them with your mallet. Brown is 1 point,
 * golden is 3. Bonk a bomb and you lose 2 and get blown back. Bonking a rival
 * dizzies them. Most points wins.
 */
class MoleBonk extends Minigame {
  readonly timeLimit = 30;
  private holes: Hole[] = [];
  private spawn = 0.4;
  private board!: HTMLDivElement;
  private mallets = new Map<MinigamePlayer, THREE.Group>();

  protected setup(): void {
    arenaBasics(this.scene, [0xa8dcff, 0xfff4cc], 0x9fe3a8, -0.4);
    const lawn = toonMesh(new THREE.BoxGeometry(HALF_W * 2 + 1.6, 0.6, HALF_D * 2 + 1.6), Palette.grass, { outline: 0.05 });
    lawn.position.y = -0.3;
    this.scene.add(lawn);
    // Picket fence on three sides.
    for (let i = 0; i < 24; i++) {
      const picket = toonMesh(new THREE.BoxGeometry(0.25, 0.9, 0.12), Palette.cream, { outline: 0.02 });
      picket.position.set(-HALF_W - 0.6 + (i / 23) * (HALF_W * 2 + 1.2), 0.45, -HALF_D - 0.7);
      this.scene.add(picket);
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const picket = toonMesh(new THREE.BoxGeometry(0.12, 0.9, 0.25), Palette.cream, { outline: 0.02 });
        picket.position.set(s * (HALF_W + 0.7), 0.45, -HALF_D - 0.6 + (i / 9) * (HALF_D * 2 + 1));
        this.scene.add(picket);
      }
    }
    // Flowers dotted around the edge.
    for (let i = 0; i < 14; i++) {
      const flower = toonMesh(new THREE.SphereGeometry(0.16, 8, 6), [Palette.rose, Palette.yellow, Palette.lavender][i % 3], { outline: 0.02 });
      const a = (i / 14) * Math.PI * 2;
      flower.position.set(Math.cos(a) * (HALF_W + 0.1), 0.12, Math.sin(a) * (HALF_D + 0.15));
      this.scene.add(flower);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const pos = new THREE.Vector3((c - (COLS - 1) / 2) * GAP, 0, (r - (ROWS - 1) / 2) * GAP);
        const dirt = toonMesh(new THREE.TorusGeometry(0.6, 0.16, 8, 20), 0xa07050, { outline: 0.03 });
        dirt.rotation.x = Math.PI / 2;
        dirt.position.set(pos.x, 0.03, pos.z);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), new THREE.MeshBasicMaterial({ color: Palette.ink }));
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(pos.x, 0.02, pos.z);
        const mole = this.makeMole(0x9a6a48);
        const gold = this.makeMole(Palette.yellow);
        const bomb = this.makeBomb();
        for (const m of [mole, gold, bomb]) {
          m.position.set(pos.x, DOWN_Y, pos.z);
          m.visible = false;
        }
        this.scene.add(dirt, hole, mole, gold, bomb);
        this.holes.push({ pos, mole, gold, bomb, kind: null, up: 0, rise: 0, age: 0, squash: 0 });
      }
    }

    const n = this.players.length;
    this.players.forEach((p, i) => {
      p.character.position.set((i - (n - 1) / 2) * GAP, 0, HALF_D - 0.3);
      p.character.rotation.y = Math.PI;
      p.data.score = 0;
      p.data.stun = 0;
      p.data.cool = 0;
      p.data.swing = 0;
      p.data.react = 0.25 + this.game.rng.next() * 0.2;
      const mallet = this.makeMallet(p.character.def.colors.accent);
      p.character.rig.armR.add(mallet);
      this.mallets.set(p, mallet);
    });

    this.camera.position.set(0, 14, 11.5);
    this.camera.lookAt(0, 0, 0.5);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private makeMole(color: number): THREE.Group {
    const g = new THREE.Group();
    const body = toonMesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 14), color, { outline: 0.03 });
    body.position.y = 0.45;
    const snout = toonMesh(new THREE.SphereGeometry(0.2, 12, 8), Palette.peach, { outline: 0.02 });
    snout.position.set(0, 0.6, 0.36);
    const nose = toonMesh(new THREE.SphereGeometry(0.08, 8, 6), Palette.rose, { outline: false });
    nose.position.set(0, 0.66, 0.54);
    g.add(body, snout, nose);
    for (const s of [-1, 1]) {
      const eye = toonMesh(new THREE.SphereGeometry(0.06, 8, 6), Palette.ink, { outline: false });
      eye.position.set(s * 0.15, 0.85, 0.36);
      const paw = toonMesh(new THREE.SphereGeometry(0.12, 8, 6), Palette.peach, { outline: 0.02 });
      paw.position.set(s * 0.32, 0.25, 0.32);
      g.add(eye, paw);
    }
    return g;
  }

  private makeBomb(): THREE.Group {
    const g = new THREE.Group();
    const ball = toonMesh(new THREE.SphereGeometry(0.48, 18, 14), Palette.ink, { outline: 0.03 });
    ball.position.y = 0.5;
    const cap = toonMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 10), 0x8a8aa0, { outline: 0.02 });
    cap.position.y = 1.0;
    const fuse = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6), Palette.sand, { outline: false });
    fuse.position.y = 1.18;
    const spark = toonMesh(new THREE.OctahedronGeometry(0.12), Palette.coral, { outline: false, emissive: 0xff5030 });
    spark.position.y = 1.34;
    spark.name = 'spark';
    const shine = toonMesh(new THREE.SphereGeometry(0.1, 8, 6), 0xffffff, { outline: false });
    shine.position.set(-0.18, 0.72, 0.32);
    g.add(ball, cap, fuse, spark, shine);
    return g;
  }

  /** A carnival mallet in the right hand; head sits at the end of the arm. */
  private makeMallet(color: number): THREE.Group {
    const g = new THREE.Group();
    const handle = toonMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 6), 0xc98a5a, { outline: 0.015 });
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, -0.42, 0.4);
    const head = toonMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 14), color, { outline: 0.025 });
    head.rotation.z = Math.PI / 2;
    head.position.set(0, -0.42, 0.85);
    g.add(handle, head);
    return g;
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">✦ ${p.data.score as number}</span>`)
      .join('');
  }

  private forward(p: MinigamePlayer): THREE.Vector3 {
    const r = p.character.rotation.y;
    return new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
  }

  private hitPoint(p: MinigamePlayer): THREE.Vector3 {
    return p.character.position.clone().addScaledVector(this.forward(p), REACH);
  }

  /** The hole a swing right now would land on, if anything is up in it. */
  private target(at: THREE.Vector3): Hole | null {
    for (const h of this.holes) {
      if (!h.kind || h.up <= 0 || h.rise < 0.5) continue;
      if (Math.hypot(h.pos.x - at.x, h.pos.z - at.z) < HIT) return h;
    }
    return null;
  }

  private popUp(): void {
    const rng = this.game.rng;
    const free = this.holes.filter((h) => !h.kind);
    if (!free.length) return;
    const h = free[Math.floor(rng.next() * free.length)];
    const r = rng.next();
    h.kind = r < 0.2 ? 'bomb' : r < 0.32 ? 'gold' : 'mole';
    h.up = h.kind === 'gold' ? 0.9 : 1.3 + rng.next() * 0.5;
    h.age = 0;
    h.squash = 0;
    h.mole.visible = h.kind === 'mole';
    h.gold.visible = h.kind === 'gold';
    h.bomb.visible = h.kind === 'bomb';
  }

  private swing(p: MinigamePlayer): void {
    p.data.cool = COOLDOWN;
    p.data.swing = 1;
    const at = this.hitPoint(p);
    // Rivals in the way get dizzy.
    for (const o of this.players) {
      if (o === p || (o.data.stun as number) > 0) continue;
      if (Math.hypot(o.character.position.x - at.x, o.character.position.z - at.z) < 0.6) {
        o.data.stun = 0.8;
        o.character.setExpression('surprised');
        this.game.audio.play('pop');
      }
    }
    const h = this.target(at);
    if (!h) {
      this.game.audio.note('triangle', 'G3', 0.04, 0.08);
      return;
    }
    if (h.kind === 'bomb') {
      p.data.score = (p.data.score as number) - 2;
      p.data.stun = 1.3;
      p.data.knock = this.forward(p).multiplyScalar(-7);
      p.character.setExpression('sad');
      this.game.audio.play('boom');
    } else {
      p.data.score = (p.data.score as number) + (h.kind === 'gold' ? 3 : 1);
      p.character.setExpression('happy');
      this.game.audio.play(h.kind === 'gold' ? 'star' : 'coin');
    }
    h.up = 0;
    h.squash = 1;
    this.renderScore();
  }

  /** CPUs walk up to the best mole, face it and swing. Bombs are left alone. */
  private cpu(p: MinigamePlayer): { move: THREE.Vector3; look: THREE.Vector3 | null; bonk: boolean } {
    const pos = p.character.position;
    let best: Hole | null = null;
    let score = -Infinity;
    for (const h of this.holes) {
      if (!h.kind || h.kind === 'bomb' || h.up <= 0.15 || h.age < (p.data.react as number)) continue;
      const dist = Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z);
      if (dist / SPEED > h.up + 0.2) continue;
      const rival = this.players.some((o) => o !== p && Math.hypot(h.pos.x - o.character.position.x, h.pos.z - o.character.position.z) < dist - 0.8);
      const s = (h.kind === 'gold' ? 6 : 2) - dist - (rival ? 3 : 0) + Math.sin(p.seat * 1.9 + h.pos.x) * 0.5;
      if (s > score) {
        score = s;
        best = h;
      }
    }
    if (!best) {
      // Drift back toward the middle of the lawn.
      const home = new THREE.Vector3(-pos.x * 0.3, 0, -pos.z * 0.3);
      return { move: home.lengthSq() > 0.3 ? home.normalize().multiplyScalar(0.5) : new THREE.Vector3(), look: null, bonk: false };
    }
    const to = new THREE.Vector3(best.pos.x - pos.x, 0, best.pos.z - pos.z);
    const dist = to.length();
    const dir = to.clone().normalize();
    const move = dist > REACH + 0.1 ? dir.clone().multiplyScalar(0.9) : new THREE.Vector3();
    // Only swing once lined up, and never into a bomb.
    const lined = this.forward(p).dot(dir) > 0.94 && Math.abs(dist - REACH) < 0.45;
    const t = lined ? this.target(this.hitPoint(p)) : null;
    return { move, look: dir, bonk: !!t && t.kind !== 'bomb' };
  }

  play(dt: number): void {
    this.spawn -= dt;
    const upCount = this.holes.filter((h) => h.kind && h.up > 0).length;
    if (this.spawn <= 0 && upCount < 6) {
      this.popUp();
      this.spawn = 0.28 + this.game.rng.next() * 0.25;
    }
    for (const h of this.holes) {
      if (!h.kind) continue;
      h.age += dt;
      h.up -= dt;
      // Fully back down: the hole is free again.
      if (h.up <= 0 && h.rise <= 0.02) {
        h.kind = null;
        h.mole.visible = h.gold.visible = h.bomb.visible = false;
      }
    }

    for (const p of this.players) {
      const c = p.character;
      p.data.cool = Math.max(0, (p.data.cool as number) - dt);
      const stun = p.data.stun as number;
      if (stun > 0) {
        p.data.stun = stun - dt;
        const knock = p.data.knock as THREE.Vector3 | undefined;
        if (knock) {
          c.position.addScaledVector(knock, dt);
          knock.multiplyScalar(Math.max(0, 1 - dt * 5));
        }
        c.rotation.y += dt * 10;
        c.pose = 'sulk';
        if ((p.data.stun as number) <= 0) {
          p.data.knock = undefined;
          c.setExpression('determined');
        }
      } else {
        let move: THREE.Vector3;
        let look: THREE.Vector3 | null = null;
        let bonk: boolean;
        if (p.controller) {
          move = stick(p);
          bonk = p.controller.pressed('a');
        } else {
          ({ move, look, bonk } = this.cpu(p));
        }
        c.position.addScaledVector(move, SPEED * dt);
        if (look && move.lengthSq() < 0.01) {
          // Turn fast on the spot to line up a bonk.
          face(p, look, dt * 2);
        } else face(p, move, dt);
        moveAnim(p, move.length());
        if (bonk && (p.data.cool as number) <= 0) this.swing(p);
      }
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_W, HALF_W);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HALF_D, HALF_D);
    }
    separate(this.players, 0.45);
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const h of this.holes) {
      const want = h.kind && h.up > 0 ? 1 : 0;
      h.rise = THREE.MathUtils.clamp(h.rise + (want ? dt * 7 : -dt * 5), 0, 1);
      h.squash = Math.max(0, h.squash - dt * 4);
      const y = DOWN_Y + (UP_Y - DOWN_Y) * h.rise;
      for (const m of [h.mole, h.gold, h.bomb]) {
        m.position.y = y;
        m.scale.set(1 + h.squash * 0.4, 1 - h.squash * 0.5, 1 + h.squash * 0.4);
        m.rotation.y = Math.sin(this.t * 3 + h.pos.x) * 0.3;
      }
      const spark = h.bomb.getObjectByName('spark');
      if (spark) spark.scale.setScalar(0.8 + Math.abs(Math.sin(this.t * 20)) * 0.6);
    }
    for (const [p, mallet] of this.mallets) {
      const s = Math.max(0, (p.data.swing as number) - dt * 5);
      p.data.swing = s;
      // Raised overhead, then slammed down to the ground in front.
      const raise = s > 0.6 ? (1 - s) / 0.4 : s / 0.6;
      p.character.rig.armR.rotation.x = -0.6 - raise * 2.2;
      mallet.rotation.x = s > 0 ? 0.9 - raise * 0.4 : 0.9;
    }
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p.data.score as number;
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => p.data.score as number, 0);
  }
}

export const moleBonk: MinigameDef = {
  id: 'molebonk',
  name: 'Mole Bonk',
  kind: 'ffa',
  duel: true,
  song: moleTheme,
  rules: 'Bonk the moles as they pop up! Brown is 1 point, gold is 3. Bonk a bomb and you lose 2. Bonking a rival makes them dizzy. Most points wins!',
  controls: 'Stick: run · A: bonk',
  create: () => new MoleBonk(),
};
