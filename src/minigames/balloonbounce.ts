import * as THREE from 'three';
import { balloonTheme } from '../audio/songs/ropeBalloonThemes';
import { makeCloud } from '../render/props';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, scorePanel, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Radius of a floating platform balloon. */
const R = 1.25;
/** Bounces a platform balloon takes before it pops. */
const HP = 5;
const BOUNCE = 10;
const BIG_BOUNCE = 13.5;
/** A press this long before touching down still counts as a big bounce. */
const BUFFER = 0.3;
const AIR_SPEED = 4.5;
/** Gravity by personal balloons left: fewer balloons, heavier you fall. */
const GRAVITY = [24, 20, 18, 16];
/** Stomp zone above a rival's feet: from head to top of their balloons. */
const STOMP_LO = 1.6;
const STOMP_HI = 3.4;
const STOMP_REACH = 0.8;
const NO_RESPAWN_AFTER = 22;
const SEA_Y = -5;
const COLORS = [Palette.rose, Palette.sky, Palette.butter, Palette.mint, Palette.lavender, Palette.peach];

interface Platform {
  mesh: THREE.Mesh;
  knot: THREE.Mesh;
  spot: number;
  hp: number;
  /** Grows in from 0 after a respawn; can't be landed on until it's big. */
  grow: number;
  /** Seconds until it reappears after popping; <0 means gone for good. */
  respawn: number;
  alive: boolean;
  squash: number;
}

interface Scrap {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

/** Landing spots: a hex of seven plus a looser outer ring. */
const SPOTS: [number, number, number][] = [
  [0, 0, 0.6],
  ...Array.from({ length: 6 }, (_, i): [number, number, number] => [Math.cos((i * Math.PI) / 3) * 3.3, Math.sin((i * Math.PI) / 3) * 3.3, (i % 2) * 0.9]),
  ...Array.from({ length: 6 }, (_, i): [number, number, number] => [
    Math.cos(((i + 0.5) * Math.PI) / 3) * 5.6,
    Math.sin(((i + 0.5) * Math.PI) / 3) * 5.6,
    0.3 + (i % 3) * 0.5,
  ]),
];

/**
 * Bounce from balloon to balloon high above the sea. Each platform balloon
 * pops after a few bounces. Stomp on rivals to pop the balloons tied to them;
 * lose all three, or fall in, and you're out. Last one aloft wins.
 */
class BalloonBounce extends Minigame {
  readonly timeLimit = 45;
  private platforms: Platform[] = [];
  private scraps: Scrap[] = [];
  private clouds: THREE.Group[] = [];
  private clock = 0;
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x8ec9ff, 0xffe4f2], 0x7cc8ec, SEA_Y);
    for (let i = 0; i < 7; i++) {
      // Drifting below the arena, to sell the height.
      const cloud = makeCloud(1 + (i % 3) * 0.3);
      const a = i * 0.9 + 0.4;
      cloud.position.set(Math.cos(a) * 11, SEA_Y + 1.2 + (i % 2) * 0.6, Math.sin(a) * 9 - 2);
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }

    const start = this.players.length > 2 ? [1, 2, 4, 5] : [0, 3];
    // The inner hex plus every other outer spot to begin.
    for (const s of [0, 1, 2, 3, 4, 5, 6, 7, 9, 11]) {
      this.platforms.push(this.makePlatform(s));
    }

    this.players.forEach((p, i) => {
      const spot = SPOTS[start[i]];
      p.character.position.set(spot[0], this.top(start[i], 0) + 0.01, spot[1]);
      p.character.rotation.y = Math.atan2(-spot[0], -spot[1]);
      p.data.vy = 0;
      p.data.vel = new THREE.Vector3();
      p.data.balloons = 3;
      p.data.buffer = 0;
      p.data.safe = 0;
      p.data.think = 0;
      p.data.aim = new THREE.Vector3(spot[0], 0, spot[1]);
      p.data.big = false;
      p.data.bunch = this.makeBunch(p);
    });

    this.camera.position.set(0, 17, 20);
    this.camera.lookAt(0, 2.4, 0);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private makePlatform(spot: number): Platform {
    const color = COLORS[spot % COLORS.length];
    const mesh = toonMesh(new THREE.SphereGeometry(R, 28, 20), color, { outline: 0.04 });
    const knot = toonMesh(new THREE.ConeGeometry(0.16, 0.3, 8), color, { outline: 0.02 });
    knot.rotation.x = Math.PI;
    const shine = toonMesh(new THREE.SphereGeometry(0.22, 10, 8), Palette.cream, { outline: false });
    shine.position.set(-0.45, 0.6, 0.65);
    shine.scale.set(1, 1.5, 0.6);
    mesh.add(shine);
    this.scene.add(mesh, knot);
    const pl: Platform = { mesh, knot, spot, hp: HP, grow: 1, respawn: 0, alive: true, squash: 0 };
    this.place(pl);
    return pl;
  }

  /** Center height of a spot's balloon, bobbing on the breeze. */
  private center(spot: number, clock: number): number {
    return SPOTS[spot][2] + Math.sin(clock * 1.3 + spot * 1.7) * 0.25;
  }

  private top(spot: number, clock: number): number {
    return this.center(spot, clock) + R * 0.9;
  }

  private place(pl: Platform): void {
    const [x, z] = SPOTS[pl.spot];
    const y = this.center(pl.spot, this.clock);
    // Deflates as it wears out, squashes when bounced on.
    const wear = 0.8 + (pl.hp / HP) * 0.2;
    const s = pl.grow * wear;
    pl.mesh.position.set(x, y, z);
    pl.mesh.scale.set(s * (1 + pl.squash * 0.2), s * 0.9 * (1 - pl.squash * 0.25), s * (1 + pl.squash * 0.2));
    pl.knot.position.set(x, y - R * 0.9 * s - 0.1, z);
    pl.knot.scale.setScalar(pl.grow);
  }

  /** Three balloons on strings, tied to the player's back. */
  private makeBunch(p: MinigamePlayer): THREE.Group {
    const bunch = new THREE.Group();
    const color = p.character.def.colors.accent;
    for (let i = 0; i < 3; i++) {
      const one = new THREE.Group();
      const x = (i - 1) * 0.36;
      const y = 2.75 + (i === 1 ? 0.25 : 0);
      const ball = toonMesh(new THREE.SphereGeometry(0.3, 16, 12), color, { outline: 0.02 });
      ball.scale.y = 1.15;
      ball.position.set(x, y, -0.25);
      const len = y - 1.3;
      const string = toonMesh(new THREE.CylinderGeometry(0.015, 0.015, len, 4), Palette.ink, { outline: false });
      string.position.set(x / 2, 1.3 + len / 2, -0.25);
      string.rotation.z = -Math.atan2(x, len) * 0.5;
      one.add(ball, string);
      bunch.add(one);
    }
    p.character.add(bunch);
    return bunch;
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => {
        const n = p.alive ? (p.data.balloons as number) : 0;
        return `<span style="color:${css(p.character.def.colors.accent)};opacity:${p.alive ? 1 : 0.35}">${p.alive ? '●'.repeat(n) + '○'.repeat(3 - n) : '✕'}</span>`;
      })
      .join('');
  }

  private burst(at: THREE.Vector3, color: number, count: number): void {
    // Visual only, so Math.random is fine here.
    for (let i = 0; i < count; i++) {
      const mesh = toonMesh(new THREE.TetrahedronGeometry(0.16), color, { outline: false });
      mesh.position.copy(at);
      this.scene.add(mesh);
      this.scraps.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5 + 1, (Math.random() - 0.5) * 8), life: 1.2 });
    }
  }

  private popPlatform(pl: Platform): void {
    pl.alive = false;
    pl.mesh.visible = false;
    pl.knot.visible = false;
    pl.respawn = this.clock < NO_RESPAWN_AFTER ? 1.2 + this.game.rng.next() * 1.2 : -1;
    this.burst(pl.mesh.position, (pl.mesh.material as THREE.MeshToonMaterial).color.getHex(), 10);
    this.game.audio.play('pop');
  }

  /** Pops one of `p`'s own balloons; out of balloons means out of the game. */
  private popPlayer(p: MinigamePlayer): void {
    const left = (p.data.balloons as number) - 1;
    p.data.balloons = left;
    p.data.safe = 0.7;
    const bunch = p.data.bunch as THREE.Group;
    const one = bunch.children[left];
    const at = new THREE.Vector3();
    one.children[0].getWorldPosition(at);
    one.visible = false;
    this.burst(at, p.character.def.colors.accent, 8);
    this.game.audio.play('pop');
    p.character.setExpression('surprised');
    if (left <= 0) {
      knockOut(p, (p.data.vel as THREE.Vector3).clone().setY(0));
      this.game.audio.play('boom');
    }
  }

  private respawnPlatforms(dt: number): void {
    for (const pl of this.platforms) {
      if (pl.alive) {
        pl.grow = Math.min(1, pl.grow + dt * 2);
        continue;
      }
      if (pl.respawn < 0) continue;
      pl.respawn -= dt;
      if (pl.respawn > 0) continue;
      // Pick a free spot so balloons wander around the arena.
      const taken = new Set(this.platforms.filter((o) => o.alive).map((o) => o.spot));
      const free = SPOTS.map((_, i) => i).filter((i) => !taken.has(i));
      pl.spot = free[this.game.rng.int(0, free.length - 1)];
      pl.hp = HP;
      pl.grow = 0;
      pl.alive = true;
      pl.mesh.visible = true;
      pl.knot.visible = true;
    }
  }

  /** Seconds until `p` falls to height `y`, or Infinity if it never gets that low... or high. */
  private fallTime(p: MinigamePlayer, y: number): number {
    const g = GRAVITY[p.data.balloons as number];
    const vy = p.data.vy as number;
    const disc = vy * vy + 2 * g * (p.character.position.y - y);
    return disc < 0 ? Infinity : (vy + Math.sqrt(disc)) / g;
  }

  /**
   * CPUs steer for a sturdy balloon they can still reach before touching
   * down, and dive on rivals who are bouncing below them.
   */
  private cpu(p: MinigamePlayer, dt: number): { move: THREE.Vector3; big: boolean } {
    const c = p.character;
    const rng = this.game.rng;
    const aim = p.data.aim as THREE.Vector3;
    p.data.think = (p.data.think as number) - dt;
    if ((p.data.think as number) <= 0) {
      p.data.think = 0.12 + rng.next() * 0.1;
      let best: THREE.Vector3 | null = null;
      let bestScore = -Infinity;
      for (const pl of this.platforms) {
        if (!pl.alive || pl.grow < 0.7) continue;
        const [x, z] = SPOTS[pl.spot];
        const d = Math.hypot(x - c.position.x, z - c.position.z);
        const reach = AIR_SPEED * this.fallTime(p, this.top(pl.spot, this.clock)) * 0.75 + 0.6;
        const crowd = this.alive.filter((o) => o !== p && Math.hypot(o.character.position.x - x, o.character.position.z - z) < 1.2).length;
        const score = pl.hp * 1.2 - d * 0.5 - (x * x + z * z) * 0.04 - crowd * 1.5 - (d < reach ? 0 : 20);
        if (score > bestScore) {
          bestScore = score;
          best = new THREE.Vector3(x, 0, z);
        }
      }
      p.data.big = false;
      for (const o of this.alive) {
        if (o === p || (o.data.safe as number) > 0) continue;
        const b = o.character.position;
        const d = Math.hypot(b.x - c.position.x, b.z - c.position.z);
        // Only dive if they're over a balloon, so there's something to land on after.
        const overBalloon = this.platforms.some((pl) => pl.alive && Math.hypot(SPOTS[pl.spot][0] - b.x, SPOTS[pl.spot][1] - b.z) < R);
        const reach = AIR_SPEED * this.fallTime(p, b.y + STOMP_HI) * 0.75;
        if (overBalloon && d < reach && c.position.y > b.y + STOMP_HI && rng.next() < 0.5) {
          best = b.clone().setY(0);
          break;
        }
        if (d < 3 && rng.next() < 0.25) p.data.big = true;
      }
      if (best) {
        const miss = 0.1 + rng.next() * 0.35;
        const a = rng.next() * Math.PI * 2;
        aim.set(best.x + Math.cos(a) * miss, 0, best.z + Math.sin(a) * miss);
      }
    }
    const to = new THREE.Vector3(aim.x - c.position.x, 0, aim.z - c.position.z);
    const move = to.lengthSq() > 0.01 ? to.normalize().multiplyScalar(Math.min(1, to.length() * 1.5)) : to;
    return { move, big: p.data.big as boolean };
  }

  play(dt: number): void {
    this.clock += dt;
    this.respawnPlatforms(dt);
    for (const pl of this.platforms) {
      pl.squash = Math.max(0, pl.squash - dt * 4);
      if (pl.alive) this.place(pl);
    }

    const before = this.alive;
    for (const p of before) {
      const c = p.character;
      let move: THREE.Vector3;
      let big: boolean;
      if (p.controller) {
        move = stick(p);
        if (p.controller.pressed('a')) p.data.buffer = BUFFER;
        big = (p.data.buffer as number) > 0;
      } else ({ move, big } = this.cpu(p, dt));
      p.data.buffer = Math.max(0, (p.data.buffer as number) - dt);
      p.data.safe = Math.max(0, (p.data.safe as number) - dt);

      const vel = p.data.vel as THREE.Vector3;
      vel.lerp(move.clone().multiplyScalar(AIR_SPEED), Math.min(1, dt * 4));
      c.position.addScaledVector(vel, dt);
      face(p, move, dt);

      const prevY = c.position.y;
      p.data.vy = (p.data.vy as number) - GRAVITY[p.data.balloons as number] * dt;
      c.position.y += (p.data.vy as number) * dt;
      c.pose = 'jump';

      // Touchdown on a platform balloon: boing, and wear it down.
      if ((p.data.vy as number) < 0) {
        for (const pl of this.platforms) {
          if (!pl.alive || pl.grow < 0.6) continue;
          const [x, z] = SPOTS[pl.spot];
          const d = Math.hypot(c.position.x - x, c.position.z - z);
          if (d > R * 0.92) continue;
          const top = pl.mesh.position.y + R * pl.mesh.scale.y * Math.sqrt(1 - (d / R) ** 2);
          if (prevY >= top - 0.05 && c.position.y <= top) {
            c.position.y = top;
            p.data.vy = big ? BIG_BOUNCE : BOUNCE;
            p.data.buffer = 0;
            c.land();
            pl.squash = 1;
            pl.hp--;
            this.game.audio.note('triangle', big ? 'C6' : ['E5', 'G5', 'A5'][pl.hp % 3], 0.12, 0.22);
            if (big) this.game.audio.play('jump');
            if (pl.hp <= 0) this.popPlatform(pl);
            else this.place(pl);
            break;
          }
        }
      }
      c.setExpression((p.data.vy as number) > 4 ? 'happy' : 'determined');
    }

    // Stomps: coming down onto a rival's balloons pops one of them.
    for (const p of this.alive) {
      if (!p.alive || (p.data.vy as number) >= 0) continue;
      for (const o of this.alive) {
        if (o === p || !o.alive || (o.data.safe as number) > 0) continue;
        const a = p.character.position;
        const b = o.character.position;
        const dy = a.y - b.y;
        if (dy < STOMP_LO || dy > STOMP_HI || Math.hypot(a.x - b.x, a.z - b.z) > STOMP_REACH) continue;
        p.data.vy = BIG_BOUNCE * 0.85;
        o.data.vy = Math.min(o.data.vy as number, -4);
        this.popPlayer(o);
        break;
      }
    }

    // Bump apart at similar heights so nobody shares a spot.
    const live = this.alive;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].character.position;
        const b = live[j].character.position;
        if (Math.abs(a.y - b.y) > 1.4) continue;
        const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
        const len = d.length();
        if (len > 0 && len < 0.9) {
          d.multiplyScalar((0.9 - len) / len / 2);
          a.sub(d);
          b.add(d);
        }
      }
    }

    for (const p of this.alive) {
      if (p.character.position.y < SEA_Y + 1) {
        knockOut(p, new THREE.Vector3());
       
        this.game.audio.play('boom');
      }
    }
    this.renderScore();

    const now = this.alive;
    if (now.length <= 1) {
      // Everyone left went down on the same frame: they share it.
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
    for (const p of this.players) {
      if (!p.alive) fall(p, dt, SEA_Y - 20);
      const bunch = p.data.bunch as THREE.Group | undefined;
      if (bunch) bunch.children.forEach((b, i) => (b.rotation.z = Math.sin(this.t * 2 + i + p.seat) * 0.08));
    }
    for (const [i, cloud] of this.clouds.entries()) cloud.position.x += Math.sin(this.t * 0.2 + i) * dt * 0.3;
    this.scraps = this.scraps.filter((s) => {
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 8;
      if (s.life > 0) return true;
      this.scene.remove(s.mesh);
      return false;
    });
  }

  timeout(): number[] {
    const left = this.alive;
    const best = Math.max(0, ...left.map((p) => p.data.balloons as number));
    return left.filter((p) => p.data.balloons === best).map((p) => p.seat);
  }
}

export const balloonBounce: MinigameDef = {
  id: 'balloonbounce',
  name: 'Balloon Bounce',
  kind: 'ffa',
  duel: true,
  song: balloonTheme,
  rules: 'Bounce from balloon to balloon high above the sea! Each one pops after a few bounces. Press A just before landing for a big bounce, then stomp rivals to pop the balloons tied to them. Lose all three or fall in and you are out!',
  controls: 'Stick: steer · A (before landing): big bounce',
  create: () => new BalloonBounce(),
};
