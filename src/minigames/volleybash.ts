import * as THREE from 'three';
import { volleyTheme } from '../audio/songs/volleyRaftThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Court half length (X, either side of the net) and half width (Z). */
const HX = 6;
const HZ = 3.8;
const NET_H = 2.3;
const BALL_R = 0.3;
const GRAV = 14;
const SPEED = 6;
const JUMP_V = 7.5;
const PLAYER_GRAV = 22;
/** Highest point a standing player can still touch the ball. */
const REACH = 2.3;
const HIT_R = 1.05;
const WIN_SCORE = 5;
const BUMP_Y = 1;
const SPIKE_Y = 2.9;

/** Team 0 plays on -X, team 1 on +X. */
const sideOf = (team: number) => (team === 0 ? -1 : 1);

/**
 * 2 vs 2 beach volleyball. Players bump the ball automatically when they get
 * under it: the first touch sets it up for your partner, the second sends it
 * over. Jump with A near the net to spike it down hard. First to 5 points wins.
 */
class VolleyBash extends Minigame {
  readonly timeLimit = 60;
  private ball = new THREE.Group();
  private vel = new THREE.Vector3();
  private shadow!: THREE.Mesh;
  private ring!: THREE.Mesh;
  private land = new THREE.Vector3();
  private score = [0, 0];
  private teamColors: number[] = [];
  private board!: HTMLDivElement;
  /** Team that touched the ball last, how many touches in a row, and who. */
  private lastTeam = 0;
  private touches = 0;
  private lastToucher: MinigamePlayer | null = null;
  private cooldown = 0;
  /** Ball in play; otherwise counting down to the next serve. */
  private live = false;
  private pause = 0;
  private server = 0;
  private serveTeam = 0;
  private done = false;

  protected setup(): void {
    arenaBasics(this.scene, [0x7fd0ff, 0xfff1d6], 0x5ec4e8, -0.6);
    const beach = toonMesh(new THREE.BoxGeometry(44, 1, 28), Palette.sand, { outline: false });
    beach.position.set(0, -0.5, -6);
    this.scene.add(beach);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshBasicMaterial({ color: 0xf9e9c0 }));
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.005;
    this.scene.add(court);
    const line = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: Palette.cream }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      this.scene.add(m);
    };
    line(HX * 2 + 0.12, 0.12, 0, -HZ);
    line(HX * 2 + 0.12, 0.12, 0, HZ);
    line(0.12, HZ * 2, -HX, 0);
    line(0.12, HZ * 2, HX, 0);

    // The net: two poles, a mesh panel and a white top band.
    for (const z of [-HZ - 0.4, HZ + 0.4]) {
      const pole = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, NET_H + 0.3, 10), Palette.coral, { outline: 0.02 });
      pole.position.set(0, (NET_H + 0.3) / 2, z);
      this.scene.add(pole);
    }
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(HZ * 2 + 0.8, 1.1, 18, 4),
      new THREE.MeshBasicMaterial({ color: Palette.ink, wireframe: true, transparent: true, opacity: 0.55 }),
    );
    net.rotation.y = Math.PI / 2;
    net.position.set(0, NET_H - 0.55, 0);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.1, HZ * 2 + 0.8),
      new THREE.MeshBasicMaterial({ color: Palette.cream, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    panel.position.set(0, NET_H - 0.55, 0);
    this.scene.add(panel);
    const band = toonMesh(new THREE.BoxGeometry(0.3, 0.18, HZ * 2 + 0.8), Palette.cream, { outline: 0.02 });
    band.position.set(0, NET_H, 0);
    this.scene.add(net, band);

    // Palms and the sea along the back.
    for (const [x, z, lean] of [
      [-12, -12, 0.2],
      [-8.5, -13.5, -0.15],
      [9.5, -12.5, -0.25],
      [13, -13.5, 0.1],
    ]) {
      const palm = new THREE.Group();
      const trunk = toonMesh(new THREE.CylinderGeometry(0.18, 0.28, 4.5, 8), 0xc89a68, { outline: 0.02 });
      trunk.position.y = 2.25;
      palm.add(trunk);
      for (let i = 0; i < 5; i++) {
        const leaf = toonMesh(new THREE.ConeGeometry(0.35, 2.4, 4), Palette.grassDark, { outline: 0.015 });
        leaf.position.y = 4.4;
        leaf.rotation.set(Math.PI / 2.6, (i / 5) * Math.PI * 2, 0, 'YXZ');
        leaf.translateY(1);
        palm.add(leaf);
      }
      palm.position.set(x, 0, z);
      palm.rotation.z = lean;
      this.scene.add(palm);
    }
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshBasicMaterial({ color: 0x6fd0f0 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.3, -44);
    this.scene.add(sea);

    // Ball: cream sphere with two colored bands.
    this.ball.add(toonMesh(new THREE.SphereGeometry(BALL_R, 18, 14), Palette.cream, { outline: 0.02 }));
    for (const [rot, color] of [
      [0, Palette.yellow],
      [Math.PI / 2, Palette.sky],
    ] as const) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 1.01, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color }));
      b.rotation.y = rot;
      this.ball.add(b);
    }
    this.scene.add(this.ball);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R, 20), new THREE.MeshBasicMaterial({ color: Palette.ink, transparent: true, opacity: 0.3 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 28), new THREE.MeshBasicMaterial({ color: Palette.coral, transparent: true, opacity: 0.7 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.025;
    this.scene.add(this.shadow, this.ring);

    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      // A little team flag on each baseline.
      const flag = toonMesh(new THREE.ConeGeometry(0.3, 0.8, 3), this.teamColors[team], { outline: 0.02 });
      flag.position.set(sideOf(team) * (HX + 1.2), 0.4, -HZ - 0.6);
      this.scene.add(flag);
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          p.data.home = new THREE.Vector3(sideOf(team) * (i === 0 ? 2.2 : 4.4), 0, i === 0 ? -1.4 : 1.4);
          p.data.vy = 0;
          p.data.err = new THREE.Vector3();
          p.data.react = 0;
          p.data.spike = false;
        });
    }

    this.camera.position.set(0, 9.5, 14);
    this.camera.lookAt(0, 1.4, 0);
    this.board = scorePanel(this.overlay);
    this.renderScore();
    this.serveTeam = this.game.rng.int(0, 1);
    this.startServe();
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1]
      .map((t) => `<span style="color:${css(this.teamColors[t])};-webkit-text-stroke:1px #2b2440">${this.score[t]}</span>`)
      .join('<span>–</span>');
  }

  private startServe(): void {
    this.live = false;
    this.pause = 1.1;
    for (const p of this.players) {
      p.character.position.copy(p.data.home as THREE.Vector3);
      p.character.rotation.y = p.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      p.data.vy = 0;
    }
    const servers = this.players.filter((p) => p.team === this.serveTeam);
    const s = servers[this.server++ % servers.length];
    s.character.position.set(sideOf(this.serveTeam) * (HX - 0.4), 0, s.character.position.z);
    this.lastToucher = s;
    this.lastTeam = this.serveTeam;
    this.touches = 1;
    this.ball.position.copy(s.character.position).setY(2.4);
    this.vel.set(0, 0, 0);
    this.ring.visible = false;
  }

  /** Throws the ball from where it is so it lands on `to`, clearing the net if it has to cross. */
  private launch(to: THREE.Vector3, apex: number, spike = false): void {
    const from = this.ball.position;
    let h = Math.max(apex, from.y + 0.15);
    for (let tries = 0; tries < 12; tries++) {
      const vy = Math.sqrt(2 * GRAV * (h - from.y));
      const t = vy / GRAV + Math.sqrt((2 * (h - BALL_R)) / GRAV);
      this.vel.set((to.x - from.x) / t, vy, (to.z - from.z) / t);
      if (Math.sign(from.x) === Math.sign(to.x) || this.vel.x === 0) break;
      const tc = -from.x / this.vel.x;
      if (from.y + vy * tc - 0.5 * GRAV * tc * tc > NET_H + 0.4) break;
      h += 0.4;
    }
    this.land.set(to.x, 0, to.z);
    this.ring.visible = true;
    this.ring.position.x = to.x;
    this.ring.position.z = to.z;
    // CPUs read the new shot with a little error and a reaction delay.
    for (const p of this.players) {
      const r = this.game.rng;
      // Now and then a CPU misjudges badly, more often against spikes.
      const e = r.next() < (spike ? 0.55 : 0.25) ? 2 : 0.55;
      (p.data.err as THREE.Vector3).set(r.range(-e, e), 0, r.range(-e, e));
      p.data.react = spike ? r.range(0.2, 0.42) : r.range(0.08, 0.3);
      p.data.spike = r.next() < 0.7;
    }
  }

  /** Where the ball will be when it next falls through height `h`. */
  private predictAt(h: number): THREE.Vector3 {
    const y0 = this.ball.position.y;
    const vy = this.vel.y;
    const disc = vy * vy + 2 * GRAV * (y0 - h);
    const t = disc > 0 ? (vy + Math.sqrt(disc)) / GRAV : 0;
    return new THREE.Vector3(this.ball.position.x + this.vel.x * t, 0, this.ball.position.z + this.vel.z * t);
  }

  /** A spot on `team`'s sand, picked from a few tries as far from its players as possible. */
  private randomTarget(team: number): THREE.Vector3 {
    const r = this.game.rng;
    const defenders = this.players.filter((p) => p.team === team);
    let best = new THREE.Vector3();
    let bestGap = -1;
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Vector3(sideOf(team) * r.range(1.8, HX - 0.6), BALL_R, r.range(-HZ + 0.6, HZ - 0.6));
      const gap = Math.min(...defenders.map((p) => Math.hypot(p.character.position.x - v.x, p.character.position.z - v.z)));
      if (gap > bestGap) {
        bestGap = gap;
        best = v;
      }
    }
    return best;
  }

  private hit(p: MinigamePlayer): void {
    const side = sideOf(p.team);
    if (this.lastTeam !== p.team) this.touches = 0;
    this.touches++;
    this.lastTeam = p.team;
    this.lastToucher = p;
    this.cooldown = 0.2;
    const airborne = p.character.position.y > 0.35;
    const mate = this.players.find((o) => o.team === p.team && o !== p);
    if (airborne && Math.abs(p.character.position.x) < 3.2 && this.ball.position.y > 2.1) {
      this.launch(this.randomTarget(1 - p.team), 0, true);
      this.game.audio.play('boom');
      p.character.setExpression('determined');
    } else if (this.touches === 1 && mate) {
      // Set it up near the net for the partner.
      const z = THREE.MathUtils.clamp(mate.character.position.z, -HZ + 1, HZ - 1);
      this.launch(new THREE.Vector3(side * 1.7, BALL_R, z), 5.2);
      this.game.audio.play('pop');
    } else {
      this.launch(this.randomTarget(1 - p.team), this.game.rng.range(4, 5.2));
      this.game.audio.play('select');
    }
  }

  private point(team: number): void {
    this.score[team]++;
    this.renderScore();
    this.game.audio.play('star');
    for (const p of this.players) {
      p.character.pose = p.team === team ? 'cheer' : 'sulk';
      p.character.setExpression(p.team === team ? 'happy' : 'sad');
    }
    this.ring.visible = false;
    this.live = false;
    if (this.score[team] >= WIN_SCORE) {
      this.done = true;
      this.finish(this.players.filter((p) => p.team === team));
      return;
    }
    this.serveTeam = team;
    this.pause = -1.5;
  }

  /** CPU: who on each side goes for the ball, the rest drift home. */
  private cpuIntent(p: MinigamePlayer): { dir: THREE.Vector3; jump: boolean } {
    const pos = p.character.position;
    let target = p.data.home as THREE.Vector3;
    let jump = false;
    const mine = Math.sign(this.land.x) === sideOf(p.team);
    if (this.live && mine) {
      const mates = this.players.filter((o) => o.team === p.team);
      const allowed = mates.filter((o) => !(this.lastTeam === p.team && o === this.lastToucher));
      const chaser = allowed.reduce((a, b) => (a.character.position.distanceTo(this.land) <= b.character.position.distanceTo(this.land) ? a : b));
      if (chaser === p) {
        const second = this.lastTeam === p.team && this.touches === 1;
        const spike = second && (p.data.spike as boolean) && Math.abs(this.land.x) < 2.8;
        target = this.predictAt(spike ? SPIKE_Y : BUMP_Y).add(p.data.err as THREE.Vector3);
        if (spike) {
          const b = this.ball.position;
          const near = Math.hypot(b.x - pos.x, b.z - pos.z) < 1.4;
          jump = near && this.vel.y < 0 && b.y < SPIKE_Y + 1.1;
        }
        if ((p.data.react as number) > 0) target = pos;
      }
    }
    const v = target.clone().sub(pos).setY(0);
    const len = v.length();
    return { dir: len > 0.15 ? v.divideScalar(Math.max(len, 0.6)) : new THREE.Vector3(), jump };
  }

  play(dt: number): void {
    if (this.done) return;
    if (!this.live) {
      if (this.pause < 0) {
        // After a point: celebrate, then line up for the next serve.
        this.pause += dt;
        if (this.pause >= 0) this.startServe();
        return;
      }
      this.pause -= dt;
      if (this.pause <= 0) {
        this.live = true;
        this.launch(this.randomTarget(1 - this.serveTeam), 5);
        this.game.audio.play('pop');
      }
    }

    this.cooldown -= dt;
    for (const p of this.players) {
      p.data.react = (p.data.react as number) - dt;
      const pos = p.character.position;
      let dir: THREE.Vector3;
      let jump: boolean;
      if (p.controller) {
        dir = stick(p);
        jump = p.controller.pressed('a');
      } else {
        ({ dir, jump } = this.cpuIntent(p));
      }
      const grounded = pos.y <= 0;
      if (jump && grounded) {
        p.data.vy = JUMP_V;
        this.game.audio.play('jump');
      }
      const side = sideOf(p.team);
      pos.addScaledVector(dir, SPEED * dt * (grounded ? 1 : 0.7));
      pos.x = side < 0 ? THREE.MathUtils.clamp(pos.x, -HX - 1.2, -0.45) : THREE.MathUtils.clamp(pos.x, 0.45, HX + 1.2);
      pos.z = THREE.MathUtils.clamp(pos.z, -HZ - 1, HZ + 1);
      let vy = p.data.vy as number;
      if (vy !== 0 || pos.y > 0) {
        vy -= PLAYER_GRAV * dt;
        pos.y += vy * dt;
        if (pos.y <= 0) {
          pos.y = 0;
          vy = 0;
        }
        p.data.vy = vy;
      }
      if (dir.lengthSq() > 0.01) face(p, dir, dt);
      else face(p, new THREE.Vector3(-side, 0, 0), dt);
      if (pos.y > 0) p.character.pose = 'jump';
      else moveAnim(p, dir.length());

      // Touch the ball when it comes down within reach on your own side.
      if (!this.live || this.cooldown > 0) continue;
      if (this.lastTeam === p.team && this.lastToucher === p) continue;
      const b = this.ball.position;
      if (Math.sign(b.x) !== side) continue;
      if (Math.hypot(b.x - pos.x, b.z - pos.z) > HIT_R) continue;
      if (b.y < 0.35 || b.y > REACH + pos.y) continue;
      if (this.vel.y > 0 && pos.y <= 0.35) continue;
      if (this.lastTeam === p.team && this.touches >= 3) continue;
      this.hit(p);
    }

    if (!this.live) return;
    const b = this.ball.position;
    const prevX = b.x;
    this.vel.y -= GRAV * dt;
    b.addScaledVector(this.vel, dt);
    // A ball that crosses under the top of the net is a fault.
    if (Math.sign(prevX) !== Math.sign(b.x) && b.y < NET_H) {
      this.point(1 - this.lastTeam);
      return;
    }
    if (b.y <= BALL_R) {
      b.y = BALL_R;
      const out = Math.abs(b.x) > HX + 0.3 || Math.abs(b.z) > HZ + 0.3;
      // Out: the hitter loses the point. In: whoever's sand it hit loses it.
      const team = out ? 1 - this.lastTeam : b.x < 0 ? 1 : 0;
      this.point(team);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    const b = this.ball.position;
    this.ball.rotation.x += dt * 6;
    this.ball.rotation.z += dt * 3;
    this.shadow.position.x = b.x;
    this.shadow.position.z = b.z;
    const s = THREE.MathUtils.clamp(1.4 - b.y * 0.12, 0.6, 1.4);
    this.shadow.scale.setScalar(s);
    this.ring.scale.setScalar(1 + Math.sin(this.t * 10) * 0.08);
  }

  timeout(): number[] {
    if (this.score[0] === this.score[1]) return [];
    const team = this.score[0] > this.score[1] ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const volleyBash: MinigameDef = {
  id: 'volleybash',
  name: 'Volley Bash',
  kind: '2v2',
  song: volleyTheme,
  rules: 'Beach volleyball! Run under the ball to bump it: the first touch sets up your partner, the next sends it over. Jump near the net to spike! First to 5 wins.',
  controls: 'Stick: run · A: jump / spike',
  create: () => new VolleyBash(),
};
