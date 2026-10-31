import * as THREE from 'three';
import { magnetTheme } from '../audio/songs/pinballMagnetThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, ring, scorePanel, separate, stick, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 9;
const SPEED = 5.5;
const DASH_SPEED = 12;
const DASH_TIME = 0.25;
const DASH_COOLDOWN = 1.3;
const STUN = 0.8;
const GRAB = 0.75;
const PULL = 4.5;
const MAGNET_SPEED = 2.6;
const HOVER = 4.2;
const ZAP = 2.6;
const MIN_SCRAP = 26;
const MAX_SCRAP = 44;

type Phase = 'roam' | 'warn' | 'surge';

interface Scrap {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  /** Can't be grabbed while > 0 (just knocked loose). */
  cool: number;
  state: 'floor' | 'air' | 'lifted';
  /** Fixed offset in the clump under the magnet while lifted. */
  slot: THREE.Vector3;
}

const METALS = [0xc9d3e0, 0xf0a878, 0xb8c4d6, 0xe8d28a];

/** A bolt, a nut or a gear, built from primitives. */
function scrapMesh(kind: number, color: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 0) {
    const head = toonMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 6), color, { outline: 0.02 });
    const shaft = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), color, { outline: 0.02 });
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = 0.28;
    head.rotation.z = Math.PI / 2;
    g.add(head, shaft);
  } else if (kind === 1) {
    const nut = toonMesh(new THREE.TorusGeometry(0.17, 0.08, 6, 6), color, { outline: 0.02 });
    nut.rotation.x = Math.PI / 2;
    g.add(nut);
  } else {
    const hub = toonMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 12), color, { outline: 0.02 });
    g.add(hub);
    for (let t = 0; t < 6; t++) {
      const tooth = toonMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), color, { outline: false });
      const a = (t / 6) * Math.PI * 2;
      tooth.position.set(Math.cos(a) * 0.29, 0, Math.sin(a) * 0.29);
      tooth.rotation.y = -a;
      g.add(tooth);
    }
  }
  g.position.y = 0.1;
  g.scale.setScalar(1.4);
  return g;
}

/**
 * A giant magnet roams the junkyard dragging loose scrap into piles. Grab the
 * most scrap, but get clear when it surges: anyone underneath gets zapped and
 * drops some. Dash into rivals to knock scrap out of their hands.
 */
class MagnetMayhem extends Minigame {
  readonly timeLimit = 35;
  private scraps: Scrap[] = [];
  private count: number[] = [];
  private magnet!: THREE.Group;
  private zone!: THREE.Mesh;
  private magPos = new THREE.Vector3();
  private magTarget = new THREE.Vector3();
  private phase: Phase = 'roam';
  private phaseT = 4;
  private spawnT = 0;
  private board!: HTMLDivElement;
  private callout!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xffd9a8, 0xfff2e0], 0xc9a77a, -6);
    const floor = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS * 0.96, 0.8, 64), Palette.sand, { outline: 0.08 });
    floor.position.y = -0.4;
    this.scene.add(floor);
    // Hazard stripes around the rim.
    for (let i = 0; i < 32; i++) {
      const stripe = new THREE.Mesh(
        new THREE.RingGeometry(RADIUS - 0.5, RADIUS - 0.05, 4, 1, (i / 32) * Math.PI * 2, Math.PI / 32),
        new THREE.MeshBasicMaterial({ color: i % 2 ? Palette.ink : Palette.yellow }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.y = 0.01;
      this.scene.add(stripe);
    }
    // Junk piles and tires dressing the rim.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const tire = toonMesh(new THREE.TorusGeometry(0.55, 0.25, 8, 16), Palette.ink, { outline: false });
      tire.rotation.x = Math.PI / 2;
      tire.position.set(Math.cos(a) * (RADIUS + 1.2), -0.2, Math.sin(a) * (RADIUS + 1.2));
      const pile = toonMesh(new THREE.ConeGeometry(0.9, 1.1, 6), METALS[i % METALS.length], { outline: 0.04 });
      pile.position.set(Math.cos(a + 0.5) * (RADIUS + 1.4), 0.1, Math.sin(a + 0.5) * (RADIUS + 1.4));
      this.scene.add(tire, pile);
    }

    // The horseshoe magnet, poles down, on a cable from the sky.
    this.magnet = new THREE.Group();
    const arch = toonMesh(new THREE.TorusGeometry(0.9, 0.36, 12, 24, Math.PI), Palette.coral, { outline: 0.05 });
    arch.position.y = 0.6;
    this.magnet.add(arch);
    for (const x of [-0.9, 0.9]) {
      const leg = toonMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.8, 14), Palette.coral, { outline: 0.05 });
      leg.position.set(x, 0.2, 0);
      const tip = toonMesh(new THREE.CylinderGeometry(0.37, 0.37, 0.35, 14), Palette.cream, { outline: 0.05 });
      tip.position.set(x, -0.35, 0);
      this.magnet.add(leg, tip);
    }
    const cable = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 20, 6), Palette.ink, { outline: false });
    cable.position.y = 11.5;
    cable.castShadow = false;
    this.magnet.add(cable);
    this.scene.add(this.magnet);
    this.zone = new THREE.Mesh(
      new THREE.RingGeometry(PULL - 0.25, PULL, 48),
      new THREE.MeshBasicMaterial({ color: Palette.coral, transparent: true, opacity: 0.45 }),
    );
    this.zone.rotation.x = -Math.PI / 2;
    this.zone.position.y = 0.03;
    this.scene.add(this.zone);

    const rng = this.game.rng;
    this.magPos.set(0, 0, 0);
    this.pickTarget();
    for (let i = 0; i < MIN_SCRAP; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 1.5 + Math.sqrt(rng.next()) * (RADIUS - 2.3);
      this.spawn(new THREE.Vector3(Math.cos(a) * d, 0.1, Math.sin(a) * d), 'floor');
    }

    ring(this.players, 6);
    for (const p of this.players) {
      p.data.dash = 0;
      p.data.cool = 0;
      p.data.stun = 0;
      this.count.push(0);
      // A little scrap basket on each player's back.
      const basket = toonMesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 10), p.character.def.colors.accent, { outline: 0.02 });
      basket.position.set(0, 0.9, -0.3);
      p.character.add(basket);
    }
    this.camera.position.set(0, 21, 16);
    this.camera.lookAt(0, 0, -0.3);
    this.board = scorePanel(this.overlay);
    this.callout = document.createElement('div');
    this.callout.className = 'mg-callout';
    this.overlay.appendChild(this.callout);
    this.renderScore();
  }

  private spawn(pos: THREE.Vector3, state: Scrap['state'], vel = new THREE.Vector3()): Scrap {
    const rng = this.game.rng;
    const mesh = scrapMesh(rng.int(0, 2), METALS[rng.int(0, METALS.length - 1)]);
    mesh.position.copy(pos);
    mesh.rotation.y = rng.next() * Math.PI * 2;
    this.scene.add(mesh);
    const s: Scrap = { mesh, vel, cool: state === 'air' ? 0.35 : 0, state, slot: new THREE.Vector3() };
    this.scraps.push(s);
    return s;
  }

  private remove(s: Scrap): void {
    this.scene.remove(s.mesh);
    this.scraps.splice(this.scraps.indexOf(s), 1);
  }

  private pickTarget(): void {
    const rng = this.game.rng;
    const a = rng.next() * Math.PI * 2;
    const d = rng.range(1, RADIUS - 3);
    this.magTarget.set(Math.cos(a) * d, 0, Math.sin(a) * d);
  }

  /** Knocks up to `n` scrap out of a player's hands, flying outward. */
  private drop(p: MinigamePlayer, n: number, away: THREE.Vector3): void {
    const i = this.players.indexOf(p);
    const k = Math.min(n, this.count[i]);
    if (k <= 0) return;
    this.count[i] -= k;
    const rng = this.game.rng;
    for (let j = 0; j < k; j++) {
      const dir = away.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(-1, 1)).setY(0);
      if (dir.lengthSq() < 0.01) dir.set(Math.cos(j * 2.1), 0, Math.sin(j * 2.1));
      dir.normalize().multiplyScalar(rng.range(2.5, 4.5));
      dir.y = rng.range(5, 7);
      this.spawn(p.character.position.clone().setY(0.6), 'air', dir);
    }
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p, i) => `<span style="color:${css(p.character.def.colors.accent)}">⚙ ${this.count[i]}</span>`)
      .join('');
  }

  /** CPUs flee a charging magnet, shove nearby rich rivals, else go for scrap. */
  private cpu(p: MinigamePlayer, i: number): { dir: THREE.Vector3; dash: boolean } {
    const pos = p.character.position;
    const toMag = new THREE.Vector3(pos.x - this.magPos.x, 0, pos.z - this.magPos.z);
    if (this.phase !== 'roam' && toMag.length() < ZAP + 1.2) {
      if (toMag.lengthSq() < 0.01) toMag.set(1, 0, 0);
      // Run away, but bend toward the middle near the rim.
      const dir = toMag.normalize().addScaledVector(pos.clone().setY(0).normalize(), Math.hypot(pos.x, pos.z) > RADIUS - 2 ? -1.2 : 0);
      return { dir: dir.normalize(), dash: false };
    }
    for (const o of this.players) {
      if (o === p || (o.data.stun as number) > 0) continue;
      const oi = this.players.indexOf(o);
      const d = o.character.position.distanceTo(pos);
      if (d < 2 && this.count[oi] >= 3 && this.count[oi] >= this.count[i] && (p.data.cool as number) <= 0) {
        return { dir: o.character.position.clone().sub(pos).setY(0).normalize(), dash: true };
      }
    }
    let best: Scrap | null = null;
    let bestScore = -Infinity;
    for (const s of this.scraps) {
      if (s.state !== 'floor') continue;
      const sp = s.mesh.position;
      const nearMag = Math.hypot(sp.x - this.magPos.x, sp.z - this.magPos.z);
      // Piles under the magnet are tempting, unless it's about to surge.
      const score = -sp.distanceTo(pos) + (this.phase === 'roam' && this.phaseT > 2 && nearMag < PULL ? 1.2 : 0) + Math.sin(i * 3.1 + sp.x) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (!best) return { dir: this.magPos.clone().sub(pos).setY(0).normalize().multiplyScalar(0.5), dash: false };
    const dir = best.mesh.position.clone().sub(pos).setY(0);
    const d = dir.length();
    if (d > 0.05) dir.divideScalar(d);
    return { dir: dir.multiplyScalar(0.88), dash: false };
  }

  play(dt: number): void {
    const rng = this.game.rng;

    // The magnet cycles: roam and drag scrap, warn, then surge.
    this.phaseT -= dt;
    if (this.phaseT <= 0) {
      if (this.phase === 'roam') {
        this.phase = 'warn';
        this.phaseT = 1.1;
        this.callout.textContent = 'Magnet surge!';
        this.game.audio.play('dice');
      } else if (this.phase === 'warn') {
        this.phase = 'surge';
        this.phaseT = 1.3;
        this.surge();
      } else {
        this.phase = 'roam';
        this.phaseT = rng.range(4.5, 6.5);
        this.callout.textContent = '';
        this.release();
      }
    }
    if (this.phase === 'roam') {
      const to = this.magTarget.clone().sub(this.magPos);
      const d = to.length();
      if (d < 0.3) this.pickTarget();
      else this.magPos.addScaledVector(to, Math.min(1, (MAGNET_SPEED * dt) / d));
    }

    for (const s of [...this.scraps]) {
      const pos = s.mesh.position;
      s.cool = Math.max(0, s.cool - dt);
      if (s.state === 'lifted') {
        pos.lerp(this.magPos.clone().add(s.slot), Math.min(1, dt * 8));
        continue;
      }
      if (s.state === 'air') {
        s.vel.y -= 22 * dt;
        pos.addScaledVector(s.vel, dt);
        if (pos.y <= 0.1) {
          pos.y = 0.1;
          s.vel.set(s.vel.x * 0.3, 0, s.vel.z * 0.3);
          s.state = 'floor';
        }
      } else {
        const to = new THREE.Vector3(this.magPos.x - pos.x, 0, this.magPos.z - pos.z);
        const d = to.length();
        if (this.phase === 'roam' && d < PULL && d > 0.4) s.vel.addScaledVector(to.divideScalar(d), (1.5 + 6 * (1 - d / PULL)) * dt);
        s.vel.multiplyScalar(Math.exp(-2.5 * dt));
        pos.addScaledVector(s.vel, dt);
      }
      // Off the edge: gone for good.
      if (Math.hypot(pos.x, pos.z) > RADIUS + 0.3 && s.state === 'floor') this.remove(s);
    }

    // Keep the yard stocked: fresh scrap drops in from above.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.scraps.length < MAX_SCRAP) {
      this.spawnT = this.scraps.length < MIN_SCRAP ? 0.25 : 0.7;
      const a = rng.next() * Math.PI * 2;
      const d = Math.sqrt(rng.next()) * (RADIUS - 1.2);
      this.spawn(new THREE.Vector3(Math.cos(a) * d, 9, Math.sin(a) * d), 'air', new THREE.Vector3(0, -2, 0));
    }

    let changed = false;
    this.players.forEach((p, i) => {
      const c = p.character;
      p.data.cool = Math.max(0, (p.data.cool as number) - dt);
      if ((p.data.stun as number) > 0) {
        p.data.stun = (p.data.stun as number) - dt;
        c.rotation.y += dt * 14;
        c.pose = 'sulk';
        if ((p.data.stun as number) <= 0) c.setExpression('happy');
        return;
      }
      let move: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        move = stick(p);
        dash = p.controller.pressed('a');
      } else {
        ({ dir: move, dash } = this.cpu(p, i));
      }
      if (dash && (p.data.cool as number) <= 0 && (p.data.dash as number) <= 0) {
        p.data.dash = DASH_TIME;
        p.data.cool = DASH_COOLDOWN;
        p.data.dashDir = move.lengthSq() > 0.01 ? move.clone().normalize() : new THREE.Vector3(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
        this.game.audio.play('jump');
      }
      if ((p.data.dash as number) > 0) {
        p.data.dash = (p.data.dash as number) - dt;
        const dd = p.data.dashDir as THREE.Vector3;
        c.position.addScaledVector(dd, DASH_SPEED * dt);
        moveAnim(p, 1);
        face(p, dd, dt);
        for (const o of this.players) {
          if (o === p || (o.data.stun as number) > 0 || (o.data.dash as number) > 0) continue;
          if (o.character.position.distanceTo(c.position) < 0.9) {
            o.data.stun = STUN;
            o.character.setExpression('surprised');
            o.character.position.addScaledVector(dd, 0.8);
            this.drop(o, 2, dd);
            this.game.audio.play('pop');
          }
        }
      } else {
        c.position.addScaledVector(move, SPEED * dt);
        face(p, move, dt);
        moveAnim(p, move.length());
      }
      const r = Math.hypot(c.position.x, c.position.z);
      if (r > RADIUS - 0.4) c.position.multiplyScalar((RADIUS - 0.4) / r);
      c.position.y = 0;

      for (const s of [...this.scraps]) {
        if (s.state !== 'floor' || s.cool > 0) continue;
        const sp = s.mesh.position;
        if (Math.hypot(sp.x - c.position.x, sp.z - c.position.z) < GRAB) {
          this.remove(s);
          this.count[i]++;
          changed = true;
          this.game.audio.play('coin');
        }
      }
    });
    separate(this.players, 0.4);
    if (changed) this.renderScore();
  }

  /** Lifts nearby scrap into a clump and zaps anyone underneath. */
  private surge(): void {
    const rng = this.game.rng;
    for (const s of this.scraps) {
      if (s.state !== 'floor') continue;
      const p = s.mesh.position;
      if (Math.hypot(p.x - this.magPos.x, p.z - this.magPos.z) > PULL) continue;
      s.state = 'lifted';
      s.slot.set(rng.range(-0.9, 0.9), HOVER - 1 - rng.range(0, 0.7), rng.range(-0.5, 0.5));
    }
    for (const p of this.players) {
      const pos = p.character.position;
      const away = new THREE.Vector3(pos.x - this.magPos.x, 0, pos.z - this.magPos.z);
      if (away.length() > ZAP) continue;
      p.data.stun = 1;
      p.data.dash = 0;
      p.character.setExpression('surprised');
      this.drop(p, 3, away);
    }
    this.game.audio.play('boom');
  }

  /** The surge ends and the clump rains back down around the magnet. */
  private release(): void {
    const rng = this.game.rng;
    for (const s of this.scraps) {
      if (s.state !== 'lifted') continue;
      s.state = 'air';
      s.cool = 0.2;
      const a = rng.next() * Math.PI * 2;
      s.vel.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rng.range(1.5, 5));
      s.vel.y = rng.range(2, 5);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    const shake = this.phase === 'warn' ? Math.sin(this.t * 60) * 0.12 : 0;
    const dip = this.phase === 'surge' ? -0.8 : 0;
    this.magnet.position.set(this.magPos.x + shake, HOVER + dip + Math.sin(this.t * 2) * 0.1, this.magPos.z);
    this.magnet.rotation.y += dt * (this.phase === 'roam' ? 0.6 : 3);
    this.zone.position.set(this.magPos.x, 0.03, this.magPos.z);
    const mat = this.zone.material as THREE.MeshBasicMaterial;
    mat.opacity = this.phase === 'roam' ? 0.35 : 0.5 + Math.sin(this.t * 30) * 0.3;
    mat.color.setHex(this.phase === 'roam' ? Palette.sky : Palette.coral);
    for (const s of this.scraps) {
      if (s.state === 'floor') s.mesh.rotation.y += s.vel.length() * dt * 2;
      else s.mesh.rotation.y += dt * 6;
    }
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return this.count[this.players.indexOf(p)];
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => this.count[this.players.indexOf(p)], 0);
  }
}

export const magnetMayhem: MinigameDef = {
  id: 'magnet',
  name: 'Magnet Mayhem',
  kind: 'ffa',
  duel: true,
  song: magnetTheme,
  rules: 'A giant magnet drags scrap into piles. Grab the most! Get clear when it surges or you drop your haul. Dash into rivals to knock scrap loose.',
  controls: 'Stick: run · A: dash',
  create: () => new MagnetMayhem(),
};
