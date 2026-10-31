import * as THREE from 'three';
import { jumpRopeTheme } from '../audio/songs/ropeBalloonThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { fall, knockOut, scorePanel } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Half the rope's span; the turners stand just past it. */
const HALF = 6.5;
/** How far the rope bows out from its axle line at the middle. */
const BOW = 2.6;
/** Axle height: the rope's lowest point skims the ground. */
const AXLE = BOW + 0.15;
const JUMP_V = 7.5;
const GRAVITY = 26;
/** Feet must be this high as the rope passes underneath, wherever you stand. */
const CLEAR = 0.3;
const TAU = Math.PI * 2;

/** Flat across the middle so every jumper faces the same rope height. */
const bow = (x: number) => BOW * (1 - (x / HALF) ** 4);
/** 0..TAU, how far the rope still has to turn before it hits the bottom. */
const toBottom = (a: number) => (((Math.PI - a) % TAU) + TAU) % TAU;

interface Turner {
  arm: THREE.Group;
  body: THREE.Group;
}

/**
 * Two giant turners swing a huge rope. Press A to jump it as it sweeps under
 * your feet. It speeds up and lurches without warning. Trip and you're out.
 */
class JumpRopeJam extends Minigame {
  readonly timeLimit = 40;
  private rope = new THREE.Group();
  private turners: Turner[] = [];
  /** Rope angle around the axle; PI is the bottom of the swing. */
  private angle = 0;
  private omega = 3;
  /** Temporary tempo change: multiplier and seconds left. */
  private surge = { mult: 1, left: 0, next: 6 };
  private clock = 0;
  private jumps = 0;
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xfff0d8], 0x9fe3a8, -0.02);
    // Schoolyard: a sandy pad on a lawn with a hopscotch strip and a fence.
    const pad = toonMesh(new THREE.CylinderGeometry(9, 9, 0.2, 48), Palette.sand, { outline: 0.05 });
    pad.scale.z = 0.55;
    pad.position.y = -0.1;
    this.scene.add(pad);
    for (let i = 0; i < 6; i++) {
      const tile = toonMesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), [Palette.rose, Palette.sky, Palette.butter][i % 3], { outline: false });
      tile.position.set(-2.5 + i * 1, 0.01, 4.4);
      this.scene.add(tile);
    }
    for (let i = 0; i < 15; i++) {
      const picket = toonMesh(new THREE.BoxGeometry(0.5, 1.6, 0.12), Palette.cream, { outline: 0.03 });
      picket.position.set(-10.5 + i * 1.5, 0.8, -6);
      const tip = toonMesh(new THREE.ConeGeometry(0.36, 0.4, 4), Palette.cream, { outline: 0.03 });
      tip.position.set(picket.position.x, 1.8, -6);
      tip.rotation.y = Math.PI / 4;
      this.scene.add(picket, tip);
    }
    const rail = toonMesh(new THREE.BoxGeometry(22, 0.16, 0.1), Palette.peach, { outline: 0.02 });
    rail.position.set(0, 1.1, -5.92);
    this.scene.add(rail);
    for (const [x, z] of [[-11, -9], [11, -10], [-7, -11]]) {
      const trunk = toonMesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 10), 0xb08060, { outline: 0.03 });
      trunk.position.set(x, 1.2, z);
      const crown = toonMesh(new THREE.IcosahedronGeometry(2, 1), Palette.grassDark, { outline: 0.05 });
      crown.position.set(x, 3.6, z);
      this.scene.add(trunk, crown);
    }

    // The rope: a bowed tube spinning about the axle line between the turners.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const x = -HALF + (i / 32) * HALF * 2;
      pts.push(new THREE.Vector3(x, bow(x), 0));
    }
    const tube = toonMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.09, 8), Palette.coral, { outline: 0.03 });
    this.rope.add(tube);
    for (let i = 1; i < 8; i++) {
      const x = -HALF + (i / 8) * HALF * 2;
      const band = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), Palette.cream, { outline: false });
      band.position.set(x, bow(x), 0);
      this.rope.add(band);
    }
    this.rope.position.y = AXLE;
    this.scene.add(this.rope);

    for (const side of [-1, 1]) this.turners.push(this.makeTurner(side));

    const n = this.players.length;
    const gap = n > 2 ? 2 : 2.4;
    this.players.forEach((p, i) => {
      p.character.position.set((i - (n - 1) / 2) * gap, 0, 0);
      p.character.rotation.y = 0;
      p.data.vy = 0;
      p.data.react = 0.2;
    });

    this.camera.position.set(0, 4.2, 15);
    this.camera.lookAt(0, 1.8, 0);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  /** A big round turner, cranking the rope's end with one arm. */
  private makeTurner(side: number): Turner {
    const body = new THREE.Group();
    const color = side < 0 ? Palette.lavender : Palette.mint;
    const belly = toonMesh(new THREE.SphereGeometry(1.3, 24, 18), color, { outline: 0.05 });
    belly.scale.set(1, 1.15, 0.9);
    belly.position.y = 1.5;
    const head = toonMesh(new THREE.SphereGeometry(0.9, 24, 18), color, { outline: 0.05 });
    head.position.y = 3.3;
    body.add(belly, head);
    for (const e of [-1, 1]) {
      const eye = toonMesh(new THREE.SphereGeometry(0.12, 10, 8), Palette.ink, { outline: false });
      eye.position.set(e * 0.3, 3.45, 0.82);
      const foot = toonMesh(new THREE.SphereGeometry(0.45, 14, 10), Palette.peach, { outline: 0.03 });
      foot.scale.set(1, 0.5, 1.3);
      foot.position.set(e * 0.6, 0.2, 0.2);
      body.add(eye, foot);
    }
    const smile = toonMesh(new THREE.TorusGeometry(0.28, 0.05, 6, 12, Math.PI), Palette.ink, { outline: false });
    smile.rotation.z = Math.PI;
    smile.position.set(0, 3.15, 0.84);
    const cheekL = toonMesh(new THREE.SphereGeometry(0.12, 8, 6), Palette.rose, { outline: false });
    cheekL.position.set(-0.5, 3.15, 0.72);
    const cheekR = cheekL.clone();
    cheekR.position.x = 0.5;
    body.add(smile, cheekL, cheekR);
    body.position.set(side * (HALF + 1.3), 0, 0);
    body.rotation.y = -side * 0.5;

    // Crank arm: pivots at the axle, its fist rides the rope's end.
    const arm = new THREE.Group();
    arm.position.set(side * (HALF + 0.05), AXLE, 0);
    const fist = toonMesh(new THREE.SphereGeometry(0.32, 14, 10), color, { outline: 0.03 });
    fist.position.y = 0.25;
    const handle = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), Palette.butter, { outline: 0.02 });
    handle.rotation.z = Math.PI / 2;
    handle.position.y = 0.25;
    arm.add(fist, handle);
    const shoulder = toonMesh(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 10), color, { outline: 0.03 });
    shoulder.rotation.z = Math.PI / 2;
    shoulder.position.set(side * (HALF + 0.75), AXLE, 0);
    this.scene.add(body, arm, shoulder);
    return { arm, body };
  }

  private renderScore(): void {
    this.board.innerHTML =
      `<span>Jumps ${this.jumps}</span>` +
      this.players.map((p) => `<span style="color:${css(p.character.def.colors.accent)};opacity:${p.alive ? 1 : 0.35}">${p.alive ? '●' : '✕'}</span>`).join('');
  }

  /** CPUs hop when the rope is a reaction time away; sometimes way too early or late. */
  private cpuJump(p: MinigamePlayer): boolean {
    const c = p.character;
    if (c.position.y > 0 || (p.data.vy as number) !== 0) return false;
    const eta = toBottom(this.angle) / this.omega;
    if (eta > (p.data.react as number)) return false;
    const rng = this.game.rng;
    const flub = rng.next() < 0.03 + this.clock * 0.0035;
    p.data.react = flub ? (rng.next() < 0.5 ? 0.01 : 0.75) : 0.12 + rng.next() * 0.26;
    return true;
  }

  play(dt: number): void {
    this.clock += dt;
    // Tempo climbs, with sudden lurches faster (or a sneaky slowdown) now and then.
    const s = this.surge;
    s.next -= dt;
    if (s.left > 0) s.left -= dt;
    else s.mult = 1;
    if (s.next <= 0) {
      const rng = this.game.rng;
      s.mult = rng.next() < 0.7 ? 1.35 + rng.next() * 0.25 : 0.7;
      s.left = 1.2 + rng.next() * 1.2;
      s.next = 4 + rng.next() * 3;
    }
    const target = (3 + this.clock * 0.11) * s.mult;
    this.omega += (target - this.omega) * Math.min(1, dt * 3);
    const left = toBottom(this.angle);
    this.angle = (this.angle + this.omega * dt) % TAU;
    const swept = left < this.omega * dt + 1e-9;
    this.rope.rotation.x = this.angle;
    for (const t of this.turners) t.arm.rotation.x = this.angle;

    const before = this.alive;
    for (const p of before) {
      const c = p.character;
      const jump = p.controller ? p.controller.pressed('a') : this.cpuJump(p);
      if (jump && c.position.y === 0 && (p.data.vy as number) === 0) {
        p.data.vy = JUMP_V;
        c.pose = 'jump';
        this.game.audio.play('jump');
      }
      if (c.position.y > 0 || (p.data.vy as number) > 0) {
        p.data.vy = (p.data.vy as number) - GRAVITY * dt;
        c.position.y += (p.data.vy as number) * dt;
        if (c.position.y <= 0) {
          c.position.y = 0;
          p.data.vy = 0;
          c.land();
          c.pose = 'idle';
        }
      }
      c.setExpression(this.omega > 5.5 ? 'surprised' : 'determined');
    }

    // The rope just passed the bottom: anyone with feet down trips.
    if (swept) {
      let tripped = false;
      for (const p of this.alive) {
        const c = p.character;
        if (c.position.y >= CLEAR) continue;
        // The rope sweeps toward -Z at the bottom, so it whips them that way.
        knockOut(p, new THREE.Vector3(Math.sign(c.position.x) * 2, 2, -6));
        tripped = true;
      }
      if (tripped) this.game.audio.play('boom');
      else this.game.audio.note('pluck', this.jumps % 2 ? 'G4' : 'D5', 0.08, 0.15);
      if (!tripped) this.jumps++;
      this.renderScore();
    }

    const now = this.alive;
    if (now.length <= 1) {
      // Everyone left tripped on the same swing: they share the win.
      const winners = now.length ? now : before;
      for (const p of winners) {
        p.character.pose = 'cheer';
        p.character.setExpression('happy');
      }
      this.finish(winners);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    // Turners rock with the swing.
    for (const t of this.turners) t.body.position.y = Math.abs(Math.sin(this.angle)) * 0.12;
    for (const p of this.players) if (!p.alive) fall(p, dt);
  }

  timeout(): number[] {
    return this.alive.map((p) => p.seat);
  }
}

export const jumpRopeJam: MinigameDef = {
  id: 'jumprope',
  name: 'Jump Rope Jam',
  kind: 'ffa',
  duel: true,
  song: jumpRopeTheme,
  rules: 'Two giants swing a huge rope! Press A to jump it as it sweeps under your feet. It speeds up and lurches without warning. Trip and you are out. Last one standing wins!',
  controls: 'A: jump',
  create: () => new JumpRopeJam(),
};
