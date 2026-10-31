import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, scorePanel, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 8;
const HALF_Z = 4.5;
const PLAYER_R = 0.45;
const BALL_R = 0.3;
const SPEED = 5.2;
const HOLD_SPEED = 4.4;
const DASH_SPEED = 14;
const DASH_TIME = 0.2;
const DASH_COOLDOWN = 1.1;
const THROW_SPEED = 15;
const THROW_COOLDOWN = 0.35;
const PICK_R = 0.85;
const HP = 2;
const INVUL = 1.1;
const BALL_Y = 1.05;

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Dodge Dash: driving gym-class rock in E minor. */
const dodgeTheme: Song = {
  name: 'Dodge Dash',
  bpm: 152,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'saw',
      volume: 0.16,
      pattern: [
        'E5 . . E5 . . G5 . A5 . G5 . E5 . D5 .',
        'E5 . . E5 . . G5 . B5 . A5 . G5 - . .',
        'C6 . . B5 . . A5 . G5 . A5 . B5 . G5 .',
        'A5 . . G5 . . F#5 . E5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.44,
      pattern: [
        'E2 . E2 . E3 . E2 . E2 . E2 . D3 . E3 .',
        'E2 . E2 . E3 . E2 . G2 . G2 . A2 . B2 .',
        'C3 . C3 . C3 . C3 . A2 . A2 . A2 . A2 .',
        'D3 . D3 . D3 . D3 . B2 . B2 . B2 . D3 .',
      ].join(' '),
    },
    { instrument: 'pulse', volume: 0.07, pattern: repeat('. . B4 . . . B4 . . . B4 . . . B4 .', 2) + ' ' + repeat('. . G4 . . . G4 . . . A4 . . . F#4 .', 2) },
    { instrument: 'kick', volume: 0.62, pattern: repeat('x . . . x . . . x . . . x . x .', 4) },
    { instrument: 'snare', volume: 0.26, pattern: repeat('. . . . x . . . . . . . x . . x', 4) },
    { instrument: 'hat', volume: 0.1, pattern: repeat('x . x . x . x . x . x . x . x .', 4) },
  ],
};

type BallState = 'free' | 'held' | 'flying';

interface Ball {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  vel: THREE.Vector3;
  state: BallState;
  /** Thrower's team while flying. */
  team: number;
  /** CPU opponents who spotted this throw (decided when it's thrown). */
  seen: Set<MinigamePlayer>;
}

interface Dodger {
  hp: number;
  ball: Ball | null;
  dash: number;
  dashCd: number;
  dashDir: THREE.Vector3;
  throwCd: number;
  invul: number;
  /** CPU: seconds until it throws the ball it holds. */
  cpuThrow: number;
  cpuWander: THREE.Vector3;
  cpuWanderT: number;
}

/**
 * 2 vs 2 dodgeball. Grab a ball, throw it across the line, dash to dodge.
 * Two hits and you're out; knock out both rivals to win.
 */
class DodgeDash extends Minigame {
  readonly timeLimit = 50;
  private balls: Ball[] = [];
  private dodgers = new Map<MinigamePlayer, Dodger>();
  private teamColors: number[] = [];
  private board!: HTMLDivElement;

  /** Team 0 plays the left half (-X), team 1 the right. */
  private side(p: MinigamePlayer): number {
    return p.team === 0 ? -1 : 1;
  }

  protected setup(): void {
    arenaBasics(this.scene, [0xffd8b0, 0xfff4e8], 0xf0c8a0, -0.5);
    const floor = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 1, 0.4, HALF_Z * 2 + 1), 0xf3d29a, { outline: 0.05 });
    floor.position.y = -0.2;
    this.scene.add(floor);
    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      const half = new THREE.Mesh(
        new THREE.PlaneGeometry(HALF_X - 0.2, HALF_Z * 2 - 0.4),
        new THREE.MeshBasicMaterial({ color: this.teamColors[team], transparent: true, opacity: 0.22 }),
      );
      half.rotation.x = -Math.PI / 2;
      half.position.set((team === 0 ? -1 : 1) * (HALF_X / 2), 0.01, 0);
      this.scene.add(half);
    }
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.2, HALF_Z * 2), new THREE.MeshBasicMaterial({ color: Palette.cream }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.02;
    this.scene.add(line);
    const circle = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.35, 40), new THREE.MeshBasicMaterial({ color: Palette.cream }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.02;
    this.scene.add(circle);
    // Low padded walls all round.
    for (const z of [-HALF_Z - 0.2, HALF_Z + 0.2]) {
      const w = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 0.8, 0.7, 0.4), Palette.lavender, { outline: 0.03 });
      w.position.set(0, 0.35, z);
      this.scene.add(w);
    }
    for (const x of [-HALF_X - 0.2, HALF_X + 0.2]) {
      const w = toonMesh(new THREE.BoxGeometry(0.4, 0.7, HALF_Z * 2), Palette.lavender, { outline: 0.03 });
      w.position.set(x, 0.35, 0);
      this.scene.add(w);
    }
    // Bleachers behind the far wall.
    for (let i = 0; i < 3; i++) {
      const step = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 2, 0.6, 1), [Palette.sky, Palette.mint, Palette.rose][i], { outline: 0.03 });
      step.position.set(0, 0.3 + i * 0.6, -HALF_Z - 1.2 - i);
      this.scene.add(step);
    }

    for (const team of [0, 1]) {
      const sx = team === 0 ? -1 : 1;
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          p.character.position.set(sx * 5.5, 0, i === 0 ? -1.8 : 1.8);
          p.character.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
          this.dodgers.set(p, {
            hp: HP,
            ball: null,
            dash: 0,
            dashCd: 0,
            dashDir: new THREE.Vector3(),
            throwCd: 0,
            invul: 0,
            cpuThrow: 0,
            cpuWander: new THREE.Vector3(sx * 5, 0, 0),
            cpuWanderT: 0,
          });
        });
      for (const z of [-1.6, 1.6]) this.addBall(new THREE.Vector3(sx * 2.4, 0, z));
    }

    this.camera.position.set(0, 14, 13.5);
    this.camera.lookAt(0, 0, 0.6);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private addBall(at: THREE.Vector3): void {
    const mesh = toonMesh(new THREE.SphereGeometry(BALL_R, 16, 12), 0xff8a5c, { outline: 0.02 });
    mesh.position.set(at.x, BALL_R, at.z);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 0.9, 16), new THREE.MeshBasicMaterial({ color: Palette.ink, transparent: true, opacity: 0.25 }));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(mesh, shadow);
    this.balls.push({ mesh, shadow, vel: new THREE.Vector3(), state: 'free', team: -1, seen: new Set() });
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1]
      .map((t) => {
        const hearts = this.players
          .filter((p) => p.team === t)
          .map((p) => {
            const hp = this.dodgers.get(p)!.hp;
            return '♥'.repeat(hp) + '♡'.repeat(HP - hp);
          })
          .join(' ');
        return `<span style="color:${css(this.teamColors[t])}">${hearts}</span>`;
      })
      .join('');
  }

  private facing(p: MinigamePlayer): THREE.Vector3 {
    const r = p.character.rotation.y;
    return new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
  }

  private opponents(p: MinigamePlayer): MinigamePlayer[] {
    return this.players.filter((o) => o.team !== p.team && o.alive);
  }

  /** Soft lock-on: the rival closest to where the thrower is facing. */
  private autoAim(p: MinigamePlayer): THREE.Vector3 {
    const fwd = this.facing(p);
    let best: THREE.Vector3 | null = null;
    let bestDot = Math.cos(THREE.MathUtils.degToRad(55));
    for (const o of this.opponents(p)) {
      const to = o.character.position.clone().sub(p.character.position).setY(0).normalize();
      const dot = to.dot(fwd);
      if (dot > bestDot) {
        bestDot = dot;
        best = to;
      }
    }
    return best ?? fwd;
  }

  private throwBall(p: MinigamePlayer, d: Dodger, dir: THREE.Vector3): void {
    const b = d.ball!;
    d.ball = null;
    d.throwCd = THROW_COOLDOWN;
    b.state = 'flying';
    b.team = p.team;
    b.vel.copy(dir).setY(0).normalize().multiplyScalar(THROW_SPEED);
    b.seen = new Set(this.opponents(p).filter(() => this.game.rng.next() < 0.5));
    p.character.pose = 'jump';
    face(p, dir, 1);
    this.game.audio.play('jump');
  }

  private startDash(d: Dodger, dir: THREE.Vector3): void {
    d.dash = DASH_TIME;
    d.dashCd = DASH_COOLDOWN;
    d.dashDir.copy(dir).setY(0).normalize();
    this.game.audio.note('triangle', 'G5', 0.06, 0.18);
  }

  /** CPU: dodge throws it saw coming, fetch balls, then wind up and fire. */
  private cpu(p: MinigamePlayer, d: Dodger, dt: number): { move: THREE.Vector3; fire: THREE.Vector3 | null } {
    const pos = p.character.position;
    const sx = this.side(p);
    if (d.dashCd <= 0) {
      for (const b of this.balls) {
        if (b.state !== 'flying' || b.team === p.team || !b.seen.has(p)) continue;
        const rel = pos.clone().sub(b.mesh.position).setY(0);
        const along = rel.dot(b.vel) / THROW_SPEED;
        if (along < 0) continue;
        const miss = rel.addScaledVector(b.vel, -along / THROW_SPEED).length();
        if (along / THROW_SPEED < 0.32 && miss < PLAYER_R + BALL_R + 0.3) {
          const side = Math.abs(pos.z) > HALF_Z - 1.5 ? -Math.sign(pos.z) : pos.z >= b.mesh.position.z ? 1 : -1;
          this.startDash(d, new THREE.Vector3(0, 0, side));
          return { move: new THREE.Vector3(), fire: null };
        }
      }
    }
    if (d.ball) {
      d.cpuThrow -= dt;
      const targets = this.opponents(p);
      const target = targets.length ? targets[p.seat % targets.length] : null;
      const goal = new THREE.Vector3(sx * 2.2, 0, target ? target.character.position.z * 0.5 : 0);
      const move = goal.sub(pos).setY(0);
      move.multiplyScalar(move.length() > 0.3 ? 1 / move.length() : 0);
      if (target && d.cpuThrow <= 0 && d.throwCd <= 0) {
        const aim = target.character.position.clone();
        aim.z += (this.game.rng.next() * 2 - 1) * 1.6;
        return { move, fire: aim.sub(pos) };
      }
      return { move, fire: null };
    }
    // Nearest loose ball on our side that our teammate isn't already chasing.
    const mate = this.players.find((o) => o !== p && o.team === p.team && o.alive);
    let best: Ball | null = null;
    let bestD = Infinity;
    for (const b of this.balls) {
      if (b.state !== 'free' || b.mesh.position.x * sx < -0.6) continue;
      const dist = b.mesh.position.distanceTo(pos);
      const mateD = mate && !this.dodgers.get(mate)!.ball ? b.mesh.position.distanceTo(mate.character.position) : Infinity;
      if (mateD < dist - 0.5) continue;
      if (dist < bestD) {
        bestD = dist;
        best = b;
      }
    }
    d.cpuWanderT -= dt;
    if (d.cpuWanderT <= 0) {
      const rng = this.game.rng;
      d.cpuWanderT = rng.range(0.9, 1.8);
      d.cpuWander.set(sx * rng.range(3.5, 7), 0, rng.range(-HALF_Z + 1, HALF_Z - 1));
    }
    const goal = best ? best.mesh.position.clone() : d.cpuWander.clone();
    const move = goal.sub(pos).setY(0);
    const len = move.length();
    move.multiplyScalar(len > 0.25 ? 1 / len : 0);
    if (!best) move.multiplyScalar(0.6);
    return { move, fire: null };
  }

  play(dt: number): void {
    for (const p of this.players) {
      const d = this.dodgers.get(p)!;
      if (!p.alive) {
        fall(p, dt);
        continue;
      }
      d.dashCd = Math.max(0, d.dashCd - dt);
      d.throwCd = Math.max(0, d.throwCd - dt);
      d.invul = Math.max(0, d.invul - dt);
      const c = p.character;
      c.visible = d.invul <= 0 || Math.floor(d.invul * 12) % 2 === 0;

      let move: THREE.Vector3;
      let fire: THREE.Vector3 | null = null;
      if (p.controller) {
        move = stick(p);
        if (d.ball && d.throwCd <= 0 && p.controller.pressed('a')) fire = this.autoAim(p);
        if (d.dashCd <= 0 && d.dash <= 0 && p.controller.pressed('b')) this.startDash(d, move.lengthSq() > 0.04 ? move : this.facing(p));
      } else ({ move, fire } = this.cpu(p, d, dt));

      if (d.dash > 0) {
        d.dash -= dt;
        c.position.addScaledVector(d.dashDir, DASH_SPEED * dt);
        c.pose = 'jump';
      } else {
        c.position.addScaledVector(move, (d.ball ? HOLD_SPEED : SPEED) * dt);
        face(p, move, dt);
        if (d.throwCd < THROW_COOLDOWN - 0.2) moveAnim(p, move.length());
      }
      if (fire) this.throwBall(p, d, fire);
      // Stay on our own half.
      const sx = this.side(p);
      const lo = sx < 0 ? -HALF_X + PLAYER_R : PLAYER_R;
      const hi = sx < 0 ? -PLAYER_R : HALF_X - PLAYER_R;
      c.position.x = THREE.MathUtils.clamp(c.position.x, lo, hi);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HALF_Z + PLAYER_R, HALF_Z - PLAYER_R);
      if (!d.ball && d.throwCd <= 0) {
        for (const b of this.balls) {
          if (b.state !== 'free' || b.vel.length() > 4) continue;
          const dx = b.mesh.position.x - c.position.x;
          const dz = b.mesh.position.z - c.position.z;
          if (dx * dx + dz * dz > PICK_R * PICK_R) continue;
          b.state = 'held';
          b.vel.set(0, 0, 0);
          d.ball = b;
          d.cpuThrow = this.game.rng.range(0.7, 1.6);
          this.game.audio.play('select');
          break;
        }
      }
      if (d.ball) d.ball.mesh.position.copy(c.position).addScaledVector(this.facing(p), 0.5).setY(1.2);
    }
    // Teammates bump apart; rivals never meet.
    for (const team of [0, 1]) {
      const [a, b] = this.players.filter((p) => p.team === team && p.alive);
      if (!a || !b) continue;
      const pa = a.character.position;
      const pb = b.character.position;
      const gap = new THREE.Vector3(pb.x - pa.x, 0, pb.z - pa.z);
      const len = gap.length();
      if (len > 0 && len < PLAYER_R * 2) {
        gap.multiplyScalar((PLAYER_R * 2 - len) / len / 2);
        pa.sub(gap);
        pb.add(gap);
      }
    }

    for (const b of this.balls) this.updateBall(b, dt);
    this.renderScore();

    for (const team of [0, 1]) {
      if (!this.players.some((p) => p.team === team && p.alive)) {
        return this.finish(this.players.filter((p) => p.team !== team));
      }
    }
  }

  private updateBall(b: Ball, dt: number): void {
    const pos = b.mesh.position;
    if (b.state === 'flying') {
      pos.addScaledVector(b.vel, dt);
      pos.y = BALL_Y;
      // Side walls bank the throw; the end walls kill it.
      if (Math.abs(pos.z) > HALF_Z - BALL_R) {
        pos.z = Math.sign(pos.z) * (HALF_Z - BALL_R);
        b.vel.z = -b.vel.z;
      }
      if (Math.abs(pos.x) > HALF_X - BALL_R) {
        pos.x = Math.sign(pos.x) * (HALF_X - BALL_R);
        b.vel.set(-b.vel.x * 0.25, 0, b.vel.z * 0.25);
        b.state = 'free';
        this.game.audio.note('triangle', 'C3', 0.08, 0.25);
      }
      for (const o of this.players) {
        if (b.state !== 'flying' || o.team === b.team || !o.alive) continue;
        const d = this.dodgers.get(o)!;
        if (d.invul > 0 || d.dash > 0) continue;
        const c = o.character.position;
        if (Math.hypot(c.x - pos.x, c.z - pos.z) > PLAYER_R + BALL_R + 0.1) continue;
        this.hit(o, d, b);
      }
    } else if (b.state === 'free') {
      pos.addScaledVector(b.vel, dt);
      b.vel.multiplyScalar(Math.exp(-2.5 * dt));
      pos.y += (BALL_R - pos.y) * Math.min(1, dt * 10);
      for (const [axis, lim] of [['x', HALF_X], ['z', HALF_Z]] as const) {
        if (Math.abs(pos[axis]) > lim - BALL_R) {
          pos[axis] = Math.sign(pos[axis]) * (lim - BALL_R);
          b.vel[axis] = -b.vel[axis] * 0.5;
        }
      }
    }
    b.shadow.position.set(pos.x, 0.03, pos.z);
  }

  private hit(o: MinigamePlayer, d: Dodger, b: Ball): void {
    const push = b.vel.clone().normalize();
    d.hp--;
    d.invul = INVUL;
    b.state = 'free';
    b.vel.set(-b.vel.x * 0.2, 0, b.vel.z * 0.2 + (this.game.rng.next() - 0.5) * 3);
    this.game.audio.play('pop');
    if (d.ball) {
      d.ball.state = 'free';
      d.ball.vel.copy(push).multiplyScalar(2);
      d.ball = null;
    }
    if (d.hp <= 0) {
      o.character.visible = true;
      knockOut(o, push.multiplyScalar(5));
      this.game.audio.play('boom');
    } else {
      o.character.setExpression('surprised');
      o.character.position.addScaledVector(push, 0.6);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const b of this.balls) if (b.state !== 'held') b.mesh.rotation.x += b.vel.length() * dt * 2;
  }

  timeout(): number[] {
    const hp = [0, 1].map((t) => this.players.filter((p) => p.team === t).reduce((s, p) => s + this.dodgers.get(p)!.hp, 0));
    if (hp[0] === hp[1]) return [];
    const team = hp[0] > hp[1] ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const dodgeDash: MinigameDef = {
  id: 'dodgedash',
  name: 'Dodge Dash',
  kind: '2v2',
  song: dodgeTheme,
  rules: 'Run over a ball to grab it and throw it at the other team. Dash to dodge! Two hits and you are out. Knock out both rivals to win.',
  controls: 'Stick: move · A: throw · B: dash',
  create: () => new DodgeDash(),
};
