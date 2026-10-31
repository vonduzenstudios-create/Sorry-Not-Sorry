import * as THREE from 'three';
import { fishTheme } from '../audio/songs/sawFishThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { cpuMash, scorePanel, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const SPACING = 3;
const WATER_Y = -0.35;
/** Seconds the bobber stays under once a fish bites. */
const BITE_WINDOW = 0.7;
const THRASH_LEN = 0.7;
/** Reels during one thrash that snap the line. */
const SNAP_AT = 3;

type State = 'ready' | 'cast' | 'wait' | 'bite' | 'reel' | 'land' | 'snap';

interface Catch {
  name: string;
  weight: number;
  color: number;
}

interface Rig {
  rod: THREE.Group;
  tip: THREE.Object3D;
  line: THREE.Line;
  bobber: THREE.Group;
  alert: THREE.Group;
  bar: THREE.Group;
  fill: THREE.Mesh;
  bucket: THREE.Group;
  fish: THREE.Group | null;
  callout: HTMLDivElement;
  calloutT: number;
  /** Where the bobber landed, and where the cast started. */
  spot: THREE.Vector3;
  from: THREE.Vector3;
}

interface Angler {
  st: State;
  /** Time in the current state. */
  t: number;
  /** When the current state ends or acts (bite time, CPU reaction...). */
  at: number;
  total: number;
  catch: Catch | null;
  pulls: number;
  need: number;
  thrash: number;
  nextThrash: number;
  tension: number;
  rate: number;
}

/**
 * Everyone fishes off the dock. Cast with A, wait for the bobber to dip, hook
 * it with A, then mash to reel in, easing off when the fish thrashes or the
 * line snaps. Heaviest total haul when time's up wins.
 */
class FishFrenzy extends Minigame {
  readonly timeLimit = 40;
  private rigs = new Map<MinigamePlayer, Rig>();
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xfff0d0], 0x7cc6e0, WATER_Y);
    const shore = toonMesh(new THREE.BoxGeometry(120, 1, 30), Palette.grass, { outline: false });
    shore.position.set(0, -0.6, 17);
    this.scene.add(shore);
    // Far bank, hills and reeds.
    const bank = toonMesh(new THREE.BoxGeometry(120, 1.2, 20), Palette.grassDark, { outline: false });
    bank.position.set(0, -0.4, -40);
    this.scene.add(bank);
    for (let i = 0; i < 6; i++) {
      const hill = toonMesh(new THREE.SphereGeometry(8 + (i % 3) * 3, 20, 12), i % 2 ? Palette.grass : Palette.mint, { outline: false });
      hill.position.set(-40 + i * 16, -3, -42 - (i % 2) * 6);
      this.scene.add(hill);
    }
    for (let i = 0; i < 14; i++) {
      const reed = toonMesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), 0x6fb070, { outline: false });
      const x = i < 7 ? -9 - (i % 3) * 0.5 : 9 + (i % 3) * 0.5;
      reed.position.set(x, 0.3, -2 - (i % 7) * 1.4);
      reed.rotation.z = ((i % 3) - 1) * 0.15;
      const top = toonMesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), 0x9a6a40, { outline: false });
      top.position.y = 0.8;
      reed.add(top);
      this.scene.add(reed);
    }
    for (let i = 0; i < 8; i++) {
      const pad = toonMesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16, 1, false, 0, Math.PI * 1.8), Palette.green, { outline: 0.02 });
      pad.position.set(-10 + ((i * 7) % 20), WATER_Y + 0.03, -6 - ((i * 5) % 12));
      pad.rotation.y = i;
      this.scene.add(pad);
    }

    // The dock.
    const n = this.players.length;
    const width = n * SPACING + 1.5;
    const deck = toonMesh(new THREE.BoxGeometry(width, 0.25, 2.6), 0xc98a5a, { outline: 0.04 });
    deck.position.set(0, -0.12, 0.4);
    this.scene.add(deck);
    for (let i = 0; i < Math.round(width / 0.6); i++) {
      const seam = toonMesh(new THREE.BoxGeometry(0.03, 0.01, 2.6), 0xa06a40, { outline: false });
      seam.position.set(-width / 2 + i * 0.6, 0.01, 0.4);
      this.scene.add(seam);
    }
    for (const x of [-width / 2 + 0.3, 0, width / 2 - 0.3]) {
      for (const z of [-0.8, 1.6]) {
        const post = toonMesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 10), 0x8a5a36, { outline: 0.02 });
        post.position.set(x, -0.6, z);
        this.scene.add(post);
      }
    }

    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * SPACING;
      p.character.position.set(x, 0, 0.2);
      p.character.rotation.y = Math.PI;
      const a: Angler = { st: 'ready', t: 0, at: 0.2 + this.game.rng.next() * 0.4, total: 0, catch: null, pulls: 0, need: 0, thrash: 0, nextThrash: 0, tension: 0, rate: 6.5 + this.game.rng.next() * 2 };
      p.data.a = a;
      this.rigs.set(p, this.buildRig(p, x));
    });

    this.camera.position.set(0, 8, 9.5);
    this.camera.lookAt(0, 0, -4.5);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private buildRig(p: MinigamePlayer, x: number): Rig {
    const accent = p.character.def.colors.accent;
    const rod = new THREE.Group();
    const pole = toonMesh(new THREE.CylinderGeometry(0.025, 0.05, 2.4, 8), 0x8a5a36, { outline: 0.015 });
    pole.position.y = 1.2;
    const reel = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), accent, { outline: 0.015 });
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.06, 0.35, 0);
    const tip = new THREE.Object3D();
    tip.position.y = 2.4;
    rod.add(pole, reel, tip);
    rod.position.set(x + 0.32, 0.75, -0.15);
    rod.rotation.x = -0.9;
    this.scene.add(rod);

    const bobber = new THREE.Group();
    const top = toonMesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), Palette.coral, { outline: 0.015 });
    const bottom = toonMesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), Palette.cream, { outline: 0.015 });
    bobber.add(top, bottom);
    bobber.visible = false;
    this.scene.add(bobber);

    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    line.visible = false;
    this.scene.add(line);

    const alert = new THREE.Group();
    const stem = toonMesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), Palette.yellow, { outline: 0.02 });
    stem.position.y = 0.45;
    const dot = toonMesh(new THREE.SphereGeometry(0.1, 8, 6), Palette.yellow, { outline: 0.02 });
    alert.add(stem, dot);
    alert.visible = false;
    this.scene.add(alert);

    const bar = new THREE.Group();
    const back = toonMesh(new THREE.BoxGeometry(1.2, 0.16, 0.05), Palette.ink, { outline: false });
    const fill = toonMesh(new THREE.BoxGeometry(1.1, 0.1, 0.06), accent, { outline: false });
    fill.position.z = 0.01;
    bar.add(back, fill);
    bar.position.set(x, 2.5, 0.2);
    bar.visible = false;
    this.scene.add(bar);

    const bucket = new THREE.Group();
    const pail = toonMesh(new THREE.CylinderGeometry(0.32, 0.25, 0.5, 14), Palette.sky, { outline: 0.02 });
    pail.position.y = 0.25;
    const rim = toonMesh(new THREE.TorusGeometry(0.32, 0.03, 6, 16), Palette.cream, { outline: false });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.5;
    bucket.add(pail, rim);
    bucket.position.set(x - 0.75, 0, 1.1);
    this.scene.add(bucket);

    const callout = document.createElement('div');
    callout.style.cssText = `position:absolute;transform:translate(-50%,-100%);font-weight:800;font-size:22px;white-space:nowrap;color:${css(accent)};text-shadow:0 2px 0 #2b2440,0 0 6px #fff;pointer-events:none;opacity:0`;
    this.overlay.appendChild(callout);

    return { rod, tip, line, bobber, alert, bar, fill, bucket, fish: null, callout, calloutT: 0, spot: new THREE.Vector3(), from: new THREE.Vector3() };
  }

  private roll(): Catch {
    const rng = this.game.rng;
    const r = rng.next();
    if (r < 0.08) return { name: 'Old boot', weight: 0, color: 0x8a5a36 };
    if (r < 0.5) return { name: 'Minnow', weight: rng.int(1, 3), color: 0x9fd0e8 };
    if (r < 0.82) return { name: 'Perch', weight: rng.int(4, 7), color: 0xffb870 };
    if (r < 0.96) return { name: 'Big bass', weight: rng.int(9, 13), color: 0x7cc08a };
    return { name: 'Golden carp', weight: rng.int(18, 22), color: Palette.yellow };
  }

  private fishMesh(c: Catch): THREE.Group {
    const g = new THREE.Group();
    if (c.weight === 0) {
      const leg = toonMesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), c.color, { outline: 0.02 });
      leg.position.y = 0.15;
      const foot = toonMesh(new THREE.BoxGeometry(0.25, 0.18, 0.5), c.color, { outline: 0.02 });
      foot.position.set(0, -0.1, 0.12);
      g.add(leg, foot);
      return g;
    }
    const s = 0.35 + Math.sqrt(c.weight) * 0.16;
    const body = toonMesh(new THREE.SphereGeometry(0.5, 16, 10), c.color, { outline: 0.02 });
    body.scale.set(1.5, 0.8, 0.45);
    const tail = toonMesh(new THREE.ConeGeometry(0.32, 0.45, 4), c.color, { outline: 0.02 });
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.85;
    const eye = toonMesh(new THREE.SphereGeometry(0.07, 8, 6), Palette.ink, { outline: false });
    eye.position.set(0.48, 0.1, 0.2);
    g.add(body, tail, eye);
    g.scale.setScalar(s);
    return g;
  }

  private say(p: MinigamePlayer, text: string): void {
    const rig = this.rigs.get(p)!;
    rig.callout.textContent = text;
    rig.calloutT = 1.4;
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">${(p.data.a as Angler).total} lb</span>`)
      .join('');
  }

  private enter(a: Angler, st: State, at = 0): void {
    a.st = st;
    a.t = 0;
    a.at = at;
  }

  play(dt: number): void {
    const rng = this.game.rng;
    for (const p of this.players) {
      const a = p.data.a as Angler;
      const rig = this.rigs.get(p)!;
      const c = p.character;
      a.t += dt;
      const human = p.controller;
      const press = human ? human.pressed('a') : false;

      switch (a.st) {
        case 'ready':
          if (human ? press : a.t >= a.at) {
            rig.from.copy(c.position).add(new THREE.Vector3(0.32, 2, -1.6));
            rig.spot.set(c.position.x + rng.range(-0.8, 0.8), WATER_Y, -rng.range(4.5, 8.5));
            this.enter(a, 'cast', 0.5);
            c.pose = 'jump';
            this.game.audio.play('jump');
          }
          break;
        case 'cast':
          if (a.t >= a.at) {
            this.enter(a, 'wait', rng.range(1, 3.4));
            c.pose = 'idle';
            this.game.audio.note('pluck', 'C4', 0.1, 0.25);
          }
          break;
        case 'wait':
          if (press) {
            // Too eager: reel the empty line back in.
            this.say(p, 'Too soon!');
            this.game.audio.play('back');
            this.enter(a, 'ready', 0.3);
          } else if (a.t >= a.at) {
            this.enter(a, 'bite', human ? BITE_WINDOW : rng.range(0.15, 0.85));
            this.game.audio.note('bell', 'A5', 0.12, 0.3);
          }
          break;
        case 'bite':
          if (human ? press : a.t >= a.at && a.t < BITE_WINDOW) {
            a.catch = this.roll();
            a.pulls = 0;
            a.need = 8 + Math.round(a.catch.weight * 1.1);
            a.tension = 0;
            a.thrash = 0;
            a.nextThrash = rng.range(0.6, 1.4);
            // CPUs notice a thrash after a moment.
            a.at = rng.range(0.1, 0.4);
            this.enter(a, 'reel', a.at);
            c.setExpression('determined');
            this.game.audio.play('select');
          } else if (a.t >= BITE_WINDOW) {
            this.say(p, 'Got away...');
            this.enter(a, 'wait', rng.range(0.8, 2.4));
          }
          break;
        case 'reel': {
          if (a.thrash > 0) {
            a.thrash -= dt;
            if (a.thrash <= 0) {
              a.tension = 0;
              a.nextThrash = rng.range(0.7, 1.8);
            }
          } else {
            a.nextThrash -= dt;
            if (a.nextThrash <= 0 && a.catch!.weight > 0) {
              a.thrash = THRASH_LEN;
              a.at = rng.next() < 0.12 ? 0.6 : rng.range(0.08, 0.35);
              this.game.audio.note('square', 'E3', 0.15, 0.2);
            }
          }
          const thrashing = a.thrash > 0;
          const cpuHolds = !human && thrashing && THRASH_LEN - a.thrash >= a.at;
          const reeled = human ? press : !cpuHolds && cpuMash(p, a.rate, dt);
          if (!reeled) break;
          if (thrashing) {
            a.tension++;
            this.game.audio.note('saw', 'C3', 0.08, 0.15);
            if (a.tension >= SNAP_AT) {
              this.say(p, 'Snap!');
              this.game.audio.play('boom');
              c.pose = 'sulk';
              c.setExpression('sad');
              a.catch = null;
              this.enter(a, 'snap', 1);
            }
            break;
          }
          a.pulls++;
          this.game.audio.note('pluck', ['E5', 'G5', 'B5'][a.pulls % 3], 0.04, 0.12);
          if (a.pulls >= a.need) {
            const got = a.catch!;
            a.total += got.weight;
            this.say(p, got.weight ? `${got.name} ${got.weight} lb!` : `${got.name}!`);
            this.game.audio.play(got.weight >= 9 ? 'star' : got.weight ? 'coin' : 'back');
            c.pose = got.weight ? 'cheer' : 'sulk';
            c.setExpression(got.weight ? 'happy' : 'sad');
            this.enter(a, 'land', 0.8);
            this.renderScore();
          }
          break;
        }
        case 'land':
        case 'snap':
          if (a.t >= a.at) {
            a.catch = null;
            c.pose = 'idle';
            c.setExpression('neutral');
            this.enter(a, 'ready', human ? 0 : rng.range(0.15, 0.5));
          }
          break;
      }
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    const v = new THREE.Vector3();
    for (const [p, rig] of this.rigs) {
      const a = p.data.a as Angler;
      const st = a.st;
      const fishing = st === 'wait' || st === 'bite' || st === 'reel';
      rig.bobber.visible = st === 'cast' || fishing;
      rig.line.visible = rig.bobber.visible;
      rig.alert.visible = st === 'bite';
      rig.bar.visible = st === 'reel';
      // Rod: flick back to cast, dip while reeling.
      const target = st === 'cast' ? -0.4 + Math.min(1, a.t * 6) * -0.6 : st === 'reel' ? -0.55 + Math.sin(this.t * 30) * (a.thrash > 0 ? 0.08 : 0.02) : -0.9;
      rig.rod.rotation.x += (target - rig.rod.rotation.x) * Math.min(1, dt * 14);

      if (st === 'cast') {
        const k = Math.min(1, a.t / 0.5);
        rig.bobber.position.lerpVectors(rig.from, rig.spot, k);
        rig.bobber.position.y += Math.sin(k * Math.PI) * 2.5;
      } else if (fishing) {
        const pos = rig.bobber.position.copy(rig.spot);
        if (st === 'reel') {
          // Bobber is drawn toward the dock as you reel, darting about when the fish thrashes.
          const k = a.pulls / a.need;
          pos.lerp(new THREE.Vector3(p.character.position.x + 0.3, WATER_Y, -0.9), k * 0.9);
          if (a.thrash > 0) pos.x += Math.sin(this.t * 40) * 0.25;
          rig.fill.scale.x = Math.max(0.01, k);
          rig.fill.position.x = -0.55 * (1 - k);
        }
        pos.y = WATER_Y + (st === 'bite' ? -0.12 + Math.sin(this.t * 25) * 0.05 : Math.sin(this.t * 3 + p.seat) * 0.03);
        rig.alert.position.set(pos.x, pos.y + 0.4, pos.z);
      }
      (rig.line.material as THREE.LineBasicMaterial).color.setHex(st === 'reel' && a.thrash > 0 ? Palette.coral : 0xffffff);
      rig.tip.getWorldPosition(v);
      const attr = rig.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, v.x, v.y, v.z);
      attr.setXYZ(1, rig.bobber.position.x, rig.bobber.position.y + 0.1, rig.bobber.position.z);
      attr.needsUpdate = true;

      // The landed catch arcs over into the bucket.
      if (st === 'land' && a.catch && !rig.fish) {
        rig.fish = this.fishMesh(a.catch);
        this.scene.add(rig.fish);
      }
      if (rig.fish) {
        if (st !== 'land') {
          this.scene.remove(rig.fish);
          rig.fish = null;
          rig.bucket.scale.setScalar(1.15);
        } else {
          const k = Math.min(1, a.t / 0.8);
          const start = new THREE.Vector3(p.character.position.x + 0.3, WATER_Y, -1);
          rig.fish.position.lerpVectors(start, rig.bucket.position, k);
          rig.fish.position.y += Math.sin(k * Math.PI) * 3 + 0.4;
          rig.fish.rotation.z = Math.sin(this.t * 20) * 0.5;
          rig.fish.rotation.y = Math.PI / 2;
        }
      }
      rig.bucket.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));

      rig.calloutT = Math.max(0, rig.calloutT - dt);
      rig.callout.style.opacity = String(Math.min(1, rig.calloutT * 3));
      v.copy(p.character.position).setY(2.9 + (1.4 - rig.calloutT) * 0.3).project(this.camera);
      rig.callout.style.left = `${(v.x + 1) * 50}%`;
      rig.callout.style.top = `${(1 - v.y) * 50}%`;
    }
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => (p.data.a as Angler).total, 0);
  }
}

export const fishFrenzy: MinigameDef = {
  id: 'fishfrenzy',
  name: 'Fish Frenzy',
  kind: 'ffa',
  duel: true,
  song: fishTheme,
  rules: 'Press A to cast. When the bobber dips, press A to hook! Mash A to reel in, but stop while the line turns red or it snaps. Heaviest haul wins!',
  controls: 'A: cast · hook · reel (mash!)',
  create: () => new FishFrenzy(),
};
