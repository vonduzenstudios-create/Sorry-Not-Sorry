import * as THREE from 'three';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, separate } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_W = 7;
const LINE_Z = 4.5;
const BALLOON_Z = 8;
const BALLOON_X = [-6, -3, 0, 3, 6];
const SPEED = 5.5;
const BALL_SPEED = 11;
const COOLDOWN = 0.9;
const TEAM_COLORS = [Palette.coral, Palette.violet];

interface Ball {
  mesh: THREE.Mesh;
  /** +1 flies toward team 0's side (+z), -1 toward team 1's. */
  dir: number;
  team: number;
}

interface Balloon {
  mesh: THREE.Group;
  team: number;
  popped: boolean;
}

/**
 * 2 vs 2. Each team guards five balloons behind its line. Slide along your
 * line and fire cannonballs straight across; your body blocks shots coming
 * the other way. Pop all of the other team's balloons to win.
 */
class CannonVolley extends Minigame {
  readonly timeLimit = 45;
  private balls: Ball[] = [];
  private balloons: Balloon[] = [];
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xfde4f2], 0x7cc8ec, -1);
    for (const team of [0, 1]) {
      const side = team === 0 ? 1 : -1;
      const deck = toonMesh(new THREE.BoxGeometry(HALF_W * 2 + 2, 0.6, 6), team === 0 ? Palette.peach : Palette.lavender, { outline: 0.05 });
      deck.position.set(0, -0.3, side * 6.5);
      this.scene.add(deck);
      BALLOON_X.forEach((x) => {
        const b = new THREE.Group();
        const body = toonMesh(new THREE.SphereGeometry(0.55, 18, 14), TEAM_COLORS[team], { outline: 0.03 });
        body.scale.y = 1.2;
        body.position.y = 2;
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), new THREE.MeshBasicMaterial({ color: Palette.ink }));
        string.position.y = 0.7;
        b.add(body, string);
        b.position.set(x, 0, side * BALLOON_Z);
        this.scene.add(b);
        this.balloons.push({ mesh: b, team, popped: false });
      });
    }
    // Gap of water in the middle is the "net".
    const buoyGeo = new THREE.SphereGeometry(0.25, 10, 8);
    for (let x = -HALF_W; x <= HALF_W; x += 1.75) {
      const buoy = toonMesh(buoyGeo, Palette.cream, { outline: 0.02 });
      buoy.position.set(x, -0.6, 0);
      this.scene.add(buoy);
    }

    for (const team of [0, 1]) {
      const side = team === 0 ? 1 : -1;
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          p.character.position.set(i === 0 ? -3 : 3, 0, side * LINE_Z);
          p.character.rotation.y = team === 0 ? Math.PI : 0;
          p.data.cooldown = 0.5;
          p.data.role = i;
          const cannon = toonMesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 10), Palette.ink, { outline: 0.02 });
          cannon.rotation.x = Math.PI / 2;
          cannon.position.set(0.4, 0.9, 0.35);
          p.character.add(cannon);
        });
    }
    this.camera.position.set(0, 20, 15);
    this.camera.lookAt(0, 0, 1.6);
    this.board = document.createElement('div');
    this.board.className = 'mg-score panel';
    this.overlay.appendChild(this.board);
    this.renderScore();
  }

  private left(team: number): number {
    return this.balloons.filter((b) => b.team === team && !b.popped).length;
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1]
      .map((t) => `<span style="color:${css(TEAM_COLORS[t])}">${'●'.repeat(this.left(t))}${'○'.repeat(BALLOON_X.length - this.left(t))}</span>`)
      .join('<span>vs</span>');
  }

  private fire(p: MinigamePlayer): void {
    const side = p.team === 0 ? 1 : -1;
    const mesh = toonMesh(new THREE.SphereGeometry(0.3, 14, 10), Palette.ink, { outline: 0.02 });
    mesh.position.set(p.character.position.x, 0.9, p.character.position.z - side * 0.8);
    this.scene.add(mesh);
    this.balls.push({ mesh, dir: -side, team: p.team });
    p.data.cooldown = COOLDOWN;
    this.game.audio.play('boom');
  }

  /** Attacker CPUs line up on an enemy balloon; defenders shadow incoming shots. */
  private cpu(p: MinigamePlayer): { x: number; shoot: boolean } {
    const side = p.team === 0 ? 1 : -1;
    const x = p.character.position.x;
    const incoming = this.balls
      .filter((b) => b.team !== p.team && b.dir === side)
      .sort((a, b) => Math.abs(a.mesh.position.z - side * LINE_Z) - Math.abs(b.mesh.position.z - side * LINE_Z));
    const defend = incoming.find((b) => this.balloons.some((bl) => bl.team === p.team && !bl.popped && Math.abs(bl.mesh.position.x - b.mesh.position.x) < 0.9));
    if (defend && ((p.data.role as number) === 1 || Math.abs(defend.mesh.position.x - x) < 2.5)) {
      return { x: defend.mesh.position.x, shoot: false };
    }
    const enemies = this.players.filter((o) => o.team !== p.team);
    const targets = this.balloons.filter((b) => b.team !== p.team && !b.popped);
    let best = x;
    let score = -Infinity;
    for (const t of targets) {
      const tx = t.mesh.position.x;
      const blocked = enemies.some((e) => Math.abs(e.character.position.x - tx) < 0.8);
      const s = -Math.abs(tx - x) * 0.4 - (blocked ? 4 : 0) + Math.sin(p.seat * 2.3 + tx) * 0.6;
      if (s > score) {
        score = s;
        best = tx;
      }
    }
    const aligned = Math.abs(best - x) < 0.35;
    const clear = !enemies.some((e) => Math.abs(e.character.position.x - x) < 0.7);
    return { x: best, shoot: aligned && (clear || this.game.rng.next() < 0.02) };
  }

  play(dt: number): void {
    for (const p of this.players) {
      const c = p.character;
      p.data.cooldown = (p.data.cooldown as number) - dt;
      let vx = 0;
      let shoot = false;
      if (p.controller) {
        vx = p.controller.stickX;
        shoot = p.controller.pressed('a');
      } else {
        const ai = this.cpu(p);
        const dx = ai.x - c.position.x;
        vx = Math.abs(dx) < 0.1 ? 0 : THREE.MathUtils.clamp(dx * 2, -0.9, 0.9);
        shoot = ai.shoot;
      }
      c.position.x = THREE.MathUtils.clamp(c.position.x + vx * SPEED * dt, -HALF_W, HALF_W);
      moveAnim(p, Math.abs(vx));
      face(p, new THREE.Vector3(0, 0, p.team === 0 ? -1 : 1), dt);
      if (shoot && (p.data.cooldown as number) <= 0) this.fire(p);
    }
    separate(this.players, 0.45);

    for (const b of [...this.balls]) {
      b.mesh.position.z += b.dir * BALL_SPEED * dt;
      let gone = false;
      // Blocked by a body on the receiving side.
      for (const p of this.players) {
        if (p.team === b.team) continue;
        const d = Math.hypot(p.character.position.x - b.mesh.position.x, p.character.position.z - b.mesh.position.z);
        if (d < 0.75) {
          gone = true;
          p.character.setExpression('surprised');
          this.game.audio.play('jump');
          break;
        }
      }
      // Reached the balloons.
      if (!gone && Math.abs(b.mesh.position.z) >= BALLOON_Z) {
        const hit = this.balloons.find((bl) => bl.team !== b.team && !bl.popped && Math.abs(bl.mesh.position.x - b.mesh.position.x) < 0.75);
        if (hit) {
          hit.popped = true;
          hit.mesh.visible = false;
          this.game.audio.play('star');
          this.renderScore();
        }
        gone = true;
      }
      if (gone) {
        this.scene.remove(b.mesh);
        this.balls.splice(this.balls.indexOf(b), 1);
      }
    }

    for (const bl of this.balloons) if (!bl.popped) bl.mesh.position.y = Math.sin(this.t * 2 + bl.mesh.position.x) * 0.15;

    for (const team of [0, 1]) {
      if (this.left(team) === 0) {
        this.finish(this.players.filter((p) => p.team !== team));
        return;
      }
    }
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return this.left(p.team);
  }

  timeout(): number[] {
    const a = this.left(0);
    const b = this.left(1);
    if (a === b) return [];
    const team = a > b ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const cannonVolley: MinigameDef = {
  id: 'cannonvolley',
  name: 'Cannon Volley',
  kind: '2v2',
  rules: "Fire cannonballs across the water to pop the other team's balloons. Stand in the way of shots to block them!",
  controls: 'Stick: slide · A: fire',
  create: () => new CannonVolley(),
};
