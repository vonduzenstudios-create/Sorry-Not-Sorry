import * as THREE from 'three';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 9;
const HALF_Z = 5.5;
const GOAL = 1.8;
const PLAYER_R = 0.5;
const PUCK_R = 0.38;
const ACCEL = 18;
const DRAG = 1.6;
const MAX = 7;
const WIN_SCORE = 3;

/** 2v2 ice hockey. Team 0 shoots right (+X), team 1 shoots left. */
class PuckRush extends Minigame {
  readonly timeLimit = 60;
  private puck!: THREE.Mesh;
  private puckVel = new THREE.Vector3();
  private score = [0, 0];
  private pause = 0;
  private board!: HTMLDivElement;
  private teamColors: number[] = [];

  protected setup(): void {
    arenaBasics(this.scene, [0xb8e2ff, 0xf3f0ff], 0xd8f1ff, -1);
    const ice = toonMesh(new THREE.BoxGeometry(HALF_X * 2, 0.4, HALF_Z * 2), 0xeaf8ff, { outline: 0.06 });
    ice.position.y = -0.2;
    this.scene.add(ice);
    const line = (x: number, color: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18, HALF_Z * 2), new THREE.MeshBasicMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, 0);
      this.scene.add(m);
    };
    line(0, Palette.coral);
    const circle = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.55, 48), new THREE.MeshBasicMaterial({ color: Palette.coral }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.01;
    this.scene.add(circle);

    // Walls with gaps for the goals.
    const wallMat = Palette.lavender;
    const long = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 0.6, 0.6, 0.3), wallMat, { outline: 0.03 });
    for (const z of [-HALF_Z - 0.15, HALF_Z + 0.15]) {
      const w = long.clone();
      w.position.set(0, 0.3, z);
      this.scene.add(w);
    }
    const sideLen = HALF_Z - GOAL;
    for (const x of [-HALF_X - 0.15, HALF_X + 0.15]) {
      for (const sign of [-1, 1]) {
        const w = toonMesh(new THREE.BoxGeometry(0.3, 0.6, sideLen), wallMat, { outline: 0.03 });
        w.position.set(x, 0.3, sign * (GOAL + sideLen / 2));
        this.scene.add(w);
      }
    }

    // Each team takes the accent color of its first player.
    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    [-1, 1].forEach((side, i) => {
      // Goal at x = side * HALF_X belongs to (defended by) team i.
      const net = toonMesh(new THREE.BoxGeometry(1.2, 1.2, GOAL * 2), this.teamColors[i], { outline: 0.03, transparent: true, opacity: 0.55 });
      net.position.set(side * (HALF_X + 0.75), 0.6, 0);
      this.scene.add(net);
    });

    this.puck = toonMesh(new THREE.CylinderGeometry(PUCK_R, PUCK_R, 0.22, 24), Palette.ink, { outline: 0.02 });
    this.scene.add(this.puck);
    this.resetPositions();

    this.camera.position.set(0, 15, 12);
    this.camera.lookAt(0, 0, 0.8);
    this.board = document.createElement('div');
    this.board.className = 'mg-score panel';
    this.overlay.appendChild(this.board);
    this.renderScore();
  }

  private resetPositions(): void {
    this.puck.position.set(0, 0.11, 0);
    this.puckVel.set(0, 0, 0);
    for (const team of [0, 1]) {
      const side = team === 0 ? -1 : 1;
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          p.character.position.set(side * (3 + i * 3), 0, i === 0 ? 0 : (i % 2 ? 2 : -2));
          p.character.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
          p.data.vel = new THREE.Vector3();
          p.data.dash = 0;
        });
    }
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1]
      .map((t) => `<span style="color:${css(this.teamColors[t])};-webkit-text-stroke:1px #2b2440">${this.score[t]}</span>`)
      .join('<span>–</span>');
  }

  /** CPU: first teammate attacks the puck from behind, the other guards the goal. */
  private cpuIntent(p: MinigamePlayer): { dir: THREE.Vector3; dash: boolean } {
    const pos = p.character.position;
    const attackX = p.team === 0 ? HALF_X : -HALF_X;
    const mates = this.players.filter((o) => o.team === p.team);
    const attacker = mates.length === 1 || mates[0] === p || this.puck.position.distanceTo(pos) < this.puck.position.distanceTo(mates[0].character.position) - 2;
    if (attacker) {
      const toGoal = new THREE.Vector3(attackX, 0, 0).sub(this.puck.position).setY(0).normalize();
      const behind = this.puck.position.clone().addScaledVector(toGoal, -0.9).setY(0);
      const v = behind.sub(pos).setY(0);
      const close = v.length() < 0.6;
      const dir = close ? toGoal : v.normalize();
      return { dir, dash: close && this.game.rng.next() < 0.04 };
    }
    const ownX = -attackX;
    const guard = new THREE.Vector3(ownX * 0.7, 0, THREE.MathUtils.clamp(this.puck.position.z, -GOAL, GOAL));
    const v = guard.sub(pos).setY(0);
    return { dir: v.length() > 0.3 ? v.normalize().multiplyScalar(0.8) : new THREE.Vector3(), dash: false };
  }

  play(dt: number): void {
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) this.resetPositions();
      return;
    }

    for (const p of this.players) {
      const vel = p.data.vel as THREE.Vector3;
      let dir: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        dir = stick(p);
        dash = p.controller.pressed('a');
      } else {
        ({ dir, dash } = this.cpuIntent(p));
      }
      p.data.dash = Math.max(0, (p.data.dash as number) - dt);
      if (dash && (p.data.dash as number) <= 0 && dir.lengthSq() > 0.01) {
        vel.addScaledVector(dir.clone().normalize(), 7);
        p.data.dash = 1;
        this.game.audio.play('jump');
      }
      vel.addScaledVector(dir, ACCEL * dt);
      vel.multiplyScalar(Math.exp(-DRAG * dt));
      const max = (p.data.dash as number) > 0.7 ? MAX * 1.8 : MAX;
      if (vel.length() > max) vel.setLength(max);
      const pos = p.character.position;
      pos.addScaledVector(vel, dt);
      pos.x = THREE.MathUtils.clamp(pos.x, -HALF_X + PLAYER_R, HALF_X - PLAYER_R);
      pos.z = THREE.MathUtils.clamp(pos.z, -HALF_Z + PLAYER_R, HALF_Z - PLAYER_R);
      face(p, vel, dt);
      moveAnim(p, vel.length() / MAX);

      // Hit the puck.
      const n = this.puck.position.clone().sub(pos).setY(0);
      const d = n.length();
      if (d > 0 && d < PLAYER_R + PUCK_R) {
        n.divideScalar(d);
        this.puck.position.copy(pos).addScaledVector(n, PLAYER_R + PUCK_R).setY(0.11);
        const push = Math.max(4, vel.dot(n) * 1.6 + 3);
        this.puckVel.copy(n).multiplyScalar(push).addScaledVector(vel, 0.3);
        this.game.audio.play('select');
      }
    }
    separate(this.players, PLAYER_R);

    // Puck physics: slides, bounces off walls, scores through goal mouths.
    this.puckVel.multiplyScalar(Math.exp(-0.5 * dt));
    if (this.puckVel.length() > 16) this.puckVel.setLength(16);
    const pp = this.puck.position;
    pp.addScaledVector(this.puckVel, dt);
    if (Math.abs(pp.z) > HALF_Z - PUCK_R) {
      pp.z = Math.sign(pp.z) * (HALF_Z - PUCK_R);
      this.puckVel.z *= -0.9;
    }
    if (Math.abs(pp.x) > HALF_X - PUCK_R) {
      if (Math.abs(pp.z) < GOAL) {
        if (Math.abs(pp.x) > HALF_X + 0.4) this.goal(pp.x > 0 ? 0 : 1);
      } else {
        pp.x = Math.sign(pp.x) * (HALF_X - PUCK_R);
        this.puckVel.x *= -0.9;
      }
    }
  }

  private goal(team: number): void {
    this.score[team]++;
    this.renderScore();
    this.game.audio.play('star');
    for (const p of this.players) {
      p.character.pose = p.team === team ? 'cheer' : 'sulk';
      p.character.setExpression(p.team === team ? 'happy' : 'sad');
    }
    if (this.score[team] >= WIN_SCORE) {
      this.finish(this.players.filter((p) => p.team === team));
      return;
    }
    this.puckVel.set(0, 0, 0);
    this.puck.position.set(0, -10, 0);
    this.pause = 1.6;
  }

  timeout(): number[] {
    if (this.score[0] === this.score[1]) return [];
    const team = this.score[0] > this.score[1] ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const puckRush: MinigameDef = {
  id: 'puckrush',
  name: 'Puck Rush',
  kind: '2v2',
  rules: 'Ice hockey! Shove the puck into the other team’s goal. First to 3 wins.',
  controls: 'Stick: skate · A: dash',
  create: () => new PuckRush(),
};
