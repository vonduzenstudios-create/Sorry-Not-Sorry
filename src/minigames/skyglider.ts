import * as THREE from 'three';
import { gliderTheme } from '../audio/songs/skyMoleThemes';
import { css, Palette } from '../render/palette';
import { makeCloud } from '../render/props';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { scorePanel, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** How fast the sky scrolls toward the players. */
const FORWARD = 11;
const STEER = 7;
const X_MAX = 8;
const Y_MIN = 1.5;
const Y_MAX = 10;
/** Rings and storms appear this far ahead. */
const SPAWN_Z = -70;
/** Gliders hang at this depth; the world moves past them. */
const LANE_Z = 0;
/** Body center offset from the character's feet, for ring checks. */
const BODY_Y = 1.1;

interface Ring {
  mesh: THREE.Mesh;
  radius: number;
  value: number;
  taken: boolean;
  /** Fade/scale animation after being taken. */
  fade: number;
}

interface Storm {
  mesh: THREE.Group;
  radius: number;
  bolt: THREE.Mesh;
}

/**
 * Everyone hang-glides through the sky at the same speed. Steer through
 * rings to score: blue is 1, gold is 3, and the first glider through a ring
 * takes it. Storm clouds zap you and send you spinning. Most points wins.
 */
class SkyGlider extends Minigame {
  readonly timeLimit = 30;
  private rings: Ring[] = [];
  private storms: Storm[] = [];
  private scenery: THREE.Group[] = [];
  private spawn = 0;
  private stormSpawn = 2.5;
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x8ec9ff, 0xffe6f2], 0xb8e2ff, -30);
    // Fluffy cloud floor drifting far below, purely for speed.
    for (let i = 0; i < 26; i++) {
      const c = makeCloud(2.2 + (i % 4) * 0.6);
      c.position.set(((i * 37) % 60) - 30, -11 - (i % 3) * 2, -90 + i * 4);
      this.scene.add(c);
      this.scenery.push(c);
    }

    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * 3;
      p.character.position.set(x, 5, LANE_Z);
      p.character.rotation.y = Math.PI;
      p.character.pose = 'jump';
      p.data.score = 0;
      p.data.vx = 0;
      p.data.vy = 0;
      p.data.stun = 0;
      // CPUs favor their own side of the sky so they don't all clump together.
      p.data.home = x;
      p.character.add(this.glider(p.character.def.colors.accent));
    });

    this.camera.position.set(0, 8.5, 15);
    this.camera.lookAt(0, 5, -8);
    this.board = scorePanel(this.overlay);
    this.renderScore();
    // A few rings already on the way so the start isn't empty.
    for (let z = -25; z > SPAWN_Z; z -= 12) this.addRing(z);
  }

  /** A delta wing in the player's color, with a bar to hold. */
  private glider(color: number): THREE.Group {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.3);
    shape.lineTo(1.9, -0.6);
    shape.lineTo(0, -0.25);
    shape.lineTo(-1.9, -0.6);
    shape.closePath();
    const wing = toonMesh(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }), color, { outline: 0.03 });
    wing.rotation.x = Math.PI / 2 - 0.15;
    wing.position.y = 2.25;
    const stripe = toonMesh(new THREE.BoxGeometry(0.12, 0.02, 1.5), Palette.cream, { outline: false });
    stripe.position.set(0, 2.27, 0.3);
    const bar = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), Palette.ink, { outline: false });
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.55, 0.25);
    for (const s of [-1, 1]) {
      const strut = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), Palette.ink, { outline: false });
      strut.position.set(s * 0.6, 1.9, 0.2);
      strut.rotation.z = s * 0.3;
      g.add(strut);
    }
    g.add(wing, stripe, bar);
    return g;
  }

  private addRing(z: number): void {
    const rng = this.game.rng;
    const gold = rng.next() < 0.2;
    const radius = gold ? 0.95 : 1.35;
    const mesh = toonMesh(new THREE.TorusGeometry(radius, gold ? 0.16 : 0.2, 10, 32), gold ? Palette.yellow : 0x6fb8ff, {
      outline: 0.04,
    });
    mesh.position.set((rng.next() * 2 - 1) * (X_MAX - 1), Y_MIN + 0.8 + rng.next() * (Y_MAX - Y_MIN - 1.6), z);
    this.scene.add(mesh);
    this.rings.push({ mesh, radius, value: gold ? 3 : 1, taken: false, fade: 0 });
  }

  private addStorm(): void {
    const rng = this.game.rng;
    const mesh = new THREE.Group();
    const puffs: [number, number, number, number][] = [
      [0, 0, 0, 1],
      [0.85, -0.15, 0.1, 0.75],
      [-0.85, -0.1, 0, 0.75],
      [0.25, 0.5, -0.1, 0.65],
    ];
    for (const [x, y, z, r] of puffs) {
      const puff = toonMesh(new THREE.SphereGeometry(r, 16, 12), 0x6b6585, { outline: 0.05 });
      puff.castShadow = false;
      puff.position.set(x, y, z);
      mesh.add(puff);
    }
    const bolt = toonMesh(new THREE.ConeGeometry(0.22, 1.2, 4), Palette.yellow, { outline: 0.02 });
    bolt.rotation.x = Math.PI;
    bolt.position.y = -1.1;
    mesh.add(bolt);
    mesh.position.set((rng.next() * 2 - 1) * (X_MAX - 1.5), Y_MIN + 1 + rng.next() * (Y_MAX - Y_MIN - 2), SPAWN_Z);
    this.scene.add(mesh);
    this.storms.push({ mesh, radius: 1.3, bolt });
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">◯ ${p.data.score as number}</span>`)
      .join('');
  }

  /** Where a player's body is, for hit checks. */
  private body(p: MinigamePlayer): THREE.Vector3 {
    const c = p.character.position;
    return new THREE.Vector3(c.x, c.y + BODY_Y, c.z);
  }

  /** CPUs line up with the best ring they can reach first, and dodge storms. */
  private cpu(p: MinigamePlayer): [number, number] {
    const me = this.body(p);
    let best: Ring | null = null;
    let score = -Infinity;
    for (const r of this.rings) {
      if (r.taken) continue;
      const ahead = me.z - r.mesh.position.z;
      if (ahead < 1 || ahead > 40) continue;
      const time = ahead / FORWARD;
      const off = Math.hypot(r.mesh.position.x - me.x, r.mesh.position.y - me.y);
      // Can't get there in time: skip it.
      if (off > STEER * time * 1.1 + r.radius) continue;
      const rival = this.players.some((o) => {
        if (o === p) return false;
        const ob = this.body(o);
        return Math.hypot(r.mesh.position.x - ob.x, r.mesh.position.y - ob.y) < off - 1;
      });
      const s = r.value * 3 - off * 0.6 - time * 2 - (rival ? 3 : 0) - Math.abs(r.mesh.position.x - (p.data.home as number)) * 0.15 + Math.sin(p.seat * 2.3 + r.mesh.position.x) * 0.7;
      if (s > score) {
        score = s;
        best = r;
      }
    }
    let tx = best ? best.mesh.position.x : me.x * 0.9;
    let ty = best ? best.mesh.position.y : 5.5;
    for (const s of this.storms) {
      const ahead = me.z - s.mesh.position.z;
      if (ahead < -1 || ahead > 14) continue;
      const dx = me.x - s.mesh.position.x;
      const dy = me.y - s.mesh.position.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) {
        const push = (3 - d) * 3;
        tx += (dx / (d || 1)) * push;
        ty += (dy / (d || 1)) * push;
      }
    }
    const dx = tx - me.x;
    const dy = ty - me.y;
    const len = Math.hypot(dx, dy);
    // Slightly sluggish hands so humans can win the close ones.
    const k = Math.min(1, len / 1.2) * 0.85;
    return len < 0.05 ? [0, 0] : [(dx / len) * k, (dy / len) * k];
  }

  play(dt: number): void {
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.addRing(SPAWN_Z);
      this.spawn = 0.45 + this.game.rng.next() * 0.35;
    }
    this.stormSpawn -= dt;
    if (this.stormSpawn <= 0) {
      this.addStorm();
      this.stormSpawn = 1.4 + this.game.rng.next() * 1.2;
    }

    for (const p of this.players) {
      const c = p.character;
      const stun = p.data.stun as number;
      let ix = 0;
      let iy = 0;
      if (stun > 0) {
        p.data.stun = stun - dt;
        c.rotation.z += dt * 14;
        if ((p.data.stun as number) <= 0) c.setExpression('determined');
        // Drop a little while dazed.
        iy = -0.6;
      } else if (p.controller) {
        ix = p.controller.stickX;
        iy = p.controller.stickY;
        const l = Math.hypot(ix, iy);
        if (l > 1) {
          ix /= l;
          iy /= l;
        }
      } else {
        [ix, iy] = this.cpu(p);
      }
      const ease = Math.min(1, dt * 6);
      const vx = (p.data.vx as number) + (ix * STEER - (p.data.vx as number)) * ease;
      const vy = (p.data.vy as number) + (iy * STEER - (p.data.vy as number)) * ease;
      p.data.vx = vx;
      p.data.vy = vy;
      c.position.x = THREE.MathUtils.clamp(c.position.x + vx * dt, -X_MAX, X_MAX);
      c.position.y = THREE.MathUtils.clamp(c.position.y + vy * dt, Y_MIN, Y_MAX);
      if (stun <= 0) {
        // Bank into turns, nose up when climbing.
        c.rotation.z = THREE.MathUtils.lerp(c.rotation.z, (vx / STEER) * 0.45, ease);
        c.rotation.x = THREE.MathUtils.lerp(c.rotation.x, (vy / STEER) * -0.25, ease);
      }
    }

    // Gliders nudge each other apart so they can't stack in one ring.
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i].character.position;
        const b = this.players[j].character.position;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < 1.6) {
          const k = (1.6 - d) / d / 2;
          a.x -= dx * k;
          a.y -= dy * k;
          b.x += dx * k;
          b.y += dy * k;
        }
      }
    }

    const step = FORWARD * dt;
    for (const r of [...this.rings]) {
      const before = r.mesh.position.z;
      r.mesh.position.z += step;
      if (r.taken) {
        r.fade += dt;
        r.mesh.scale.setScalar(1 + r.fade * 3);
        r.mesh.visible = r.fade < 0.3;
      } else if (before < LANE_Z && r.mesh.position.z >= LANE_Z) {
        // Crossed the gliders' plane this frame: whoever is closest inside it takes it.
        let winner: MinigamePlayer | null = null;
        let near = Infinity;
        for (const p of this.players) {
          if ((p.data.stun as number) > 0) continue;
          const b = this.body(p);
          const d = Math.hypot(b.x - r.mesh.position.x, b.y - r.mesh.position.y);
          if (d < r.radius && d < near) {
            near = d;
            winner = p;
          }
        }
        if (winner) {
          r.taken = true;
          winner.data.score = (winner.data.score as number) + r.value;
          winner.character.setExpression('happy');
          this.game.audio.play(r.value > 1 ? 'star' : 'coin');
          this.renderScore();
        }
      }
      // Missed rings shrink away instead of flying into the camera.
      if (!r.taken && r.mesh.position.z > LANE_Z + 0.5) r.mesh.scale.setScalar(Math.max(0.01, 1 - (r.mesh.position.z - LANE_Z) / 4));
      if (r.mesh.position.z > LANE_Z + 4) {
        this.scene.remove(r.mesh);
        this.rings.splice(this.rings.indexOf(r), 1);
      }
    }

    for (const s of [...this.storms]) {
      s.mesh.position.z += step;
      const sz = s.mesh.position.z;
      if (Math.abs(sz - LANE_Z) < 0.9) {
        for (const p of this.players) {
          if ((p.data.stun as number) > 0) continue;
          const b = this.body(p);
          if (Math.hypot(b.x - s.mesh.position.x, b.y - s.mesh.position.y) < s.radius + 0.4) {
            p.data.stun = 1.1;
            p.data.vx = 0;
            p.data.vy = 0;
            p.character.setExpression('surprised');
            this.game.audio.play('boom');
          }
        }
      }
      if (sz > LANE_Z + 1) s.mesh.scale.setScalar(Math.max(0.01, 1 - (sz - LANE_Z - 1) / 3));
      if (sz > LANE_Z + 4) {
        this.scene.remove(s.mesh);
        this.storms.splice(this.storms.indexOf(s), 1);
      }
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) {
      p.character.pose = 'jump';
      // Gentle bob so they look airborne before the start too.
      p.character.rig.body.position.y = Math.sin(this.t * 2.5 + p.seat) * 0.08;
    }
    for (const c of this.scenery) {
      c.position.z += dt * FORWARD * 0.5;
      if (c.position.z > 20) c.position.z -= 110;
    }
    for (const s of this.storms) s.bolt.visible = Math.floor(this.t * 6 + s.mesh.position.x) % 3 !== 0;
    for (const r of this.rings) if (!r.taken) r.mesh.rotation.z += dt * (r.value > 1 ? 3 : 1);
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p.data.score as number;
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => p.data.score as number, 0);
  }
}

export const skyGlider: MinigameDef = {
  id: 'skyglider',
  name: 'Sky Glider',
  kind: 'ffa',
  duel: true,
  song: gliderTheme,
  rules: 'Hang-glide through the rings! Blue is 1 point, gold is 3, and only the first glider through gets it. Storm clouds zap you. Most points wins!',
  controls: 'Stick: steer up, down, left and right',
  create: () => new SkyGlider(),
};
