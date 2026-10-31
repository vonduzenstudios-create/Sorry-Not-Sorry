import * as THREE from 'three';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const PEN_SPEED = 2.6;
const SAMPLES = 72;
/** How close the pen must pass to count a point on the outline as traced. */
const HIT = 0.32;
/** Beyond this distance from the outline the pen is off the line. */
const OFF = 0.45;
const BOARD = 2.6;
const TRAIL_MAX = 800;

type Shape = (t: number) => [number, number];

/** Outlines to trace, as closed parametric curves (t in 0..1). */
const SHAPES: Shape[] = [
  // Star
  (t) => {
    const a = t * Math.PI * 2 - Math.PI / 2;
    const r = 1.9 * (0.62 + 0.38 * Math.cos(5 * (a + Math.PI / 2)));
    return [Math.cos(a) * r, Math.sin(a) * r];
  },
  // Heart
  (t) => {
    const a = t * Math.PI * 2;
    const x = 16 * Math.sin(a) ** 3;
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    return [x * 0.11, -y * 0.11 - 0.2];
  },
  // Flower
  (t) => {
    const a = t * Math.PI * 2;
    const r = 1.4 + 0.45 * Math.sin(4 * a);
    return [Math.cos(a) * r, Math.sin(a) * r];
  },
];

interface Desk {
  origin: THREE.Vector3;
  pen: THREE.Mesh;
  /** Ink dots laid down behind the pen. */
  trail: THREE.InstancedMesh;
  inked: number;
  last: THREE.Vector3 | null;
  hit: boolean[];
  off: number;
  done: boolean;
  /** Pen position relative to the desk center (x, z). */
  at: THREE.Vector2;
}

/**
 * Everyone gets the same outline on their own desk and traces it with a pen.
 * Cover as much of the line as you can without wandering off; press A when
 * you're happy. Best score wins.
 */
class TraceRace extends Minigame {
  readonly timeLimit = 25;
  private desks = new Map<MinigamePlayer, Desk>();
  private outline: THREE.Vector2[] = [];
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xffe1f0, 0xd8c8ff], 0xd8c8ff, -3);
    const shape = this.game.rng.pick(SHAPES);
    for (let i = 0; i < SAMPLES; i++) {
      const [x, z] = shape(i / SAMPLES);
      this.outline.push(new THREE.Vector2(x, z));
    }
    const n = this.players.length;
    const cols = n <= 2 ? n : 2;
    this.players.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rows = Math.ceil(n / cols);
      const origin = new THREE.Vector3((col - (cols - 1) / 2) * 6.6, 0, (row - (rows - 1) / 2) * 6.2);
      this.desks.set(p, this.makeDesk(p, origin));
      p.character.position.copy(origin).add(new THREE.Vector3(-BOARD - 0.9, 0, 0.6));
      p.character.rotation.y = Math.PI / 2;
      p.character.scale.setScalar(0.8);
      p.data.path = 0;
    });
    this.camera.position.set(0, 17, 9);
    this.camera.lookAt(0, 0, 0.4);
    this.board = document.createElement('div');
    this.board.className = 'mg-score panel';
    this.overlay.appendChild(this.board);
    this.renderScore();
  }

  private makeDesk(p: MinigamePlayer, origin: THREE.Vector3): Desk {
    const paper = toonMesh(new THREE.BoxGeometry(BOARD * 2, 0.2, BOARD * 2), Palette.cream, { outline: 0.05 });
    paper.position.copy(origin).setY(-0.1);
    const edge = toonMesh(new THREE.BoxGeometry(BOARD * 2 + 0.4, 0.15, BOARD * 2 + 0.4), p.character.def.colors.accent, { outline: false });
    edge.position.copy(origin).setY(-0.2);
    this.scene.add(edge, paper);

    // Dotted outline to follow.
    const dotGeo = new THREE.CircleGeometry(0.07, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: Palette.ink });
    for (const v of this.outline) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(origin.x + v.x, 0.01, origin.z + v.y);
      this.scene.add(dot);
    }

    const pen = toonMesh(new THREE.ConeGeometry(0.16, 0.6, 10), p.character.def.colors.accent, { outline: 0.02 });
    pen.rotation.x = Math.PI;
    const start = this.outline[0];
    pen.position.set(origin.x + start.x, 0.35, origin.z + start.y);
    this.scene.add(pen);

    const inkGeo = new THREE.CircleGeometry(0.09, 10).rotateX(-Math.PI / 2);
    const trail = new THREE.InstancedMesh(inkGeo, new THREE.MeshBasicMaterial({ color: p.character.def.colors.accent }), TRAIL_MAX);
    trail.count = 0;
    trail.frustumCulled = false;
    this.scene.add(trail);
    return { origin, pen, trail, inked: 0, last: null, hit: this.outline.map(() => false), off: 0, done: false, at: start.clone() };
  }

  /** Percent traced, minus a penalty for time spent off the line. */
  private score(d: Desk): number {
    const covered = d.hit.filter(Boolean).length / SAMPLES;
    return Math.max(0, Math.round(covered * 100 - d.off * 12));
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => {
        const d = this.desks.get(p)!;
        return `<span style="color:${css(p.character.def.colors.accent)}">${this.score(d)}%${d.done ? ' ✓' : ''}</span>`;
      })
      .join('');
  }

  /** CPUs walk the outline point by point, with a little wobble. */
  private cpuMove(p: MinigamePlayer, d: Desk): THREE.Vector2 {
    const idx = Math.floor(p.data.path as number) % SAMPLES;
    const target = this.outline[(idx + 1) % SAMPLES];
    const dir = target.clone().sub(d.at);
    if (dir.length() < 0.15) p.data.path = (p.data.path as number) + 1;
    const skill = 0.75 + (p.seat % 3) * 0.08;
    const wobble = Math.sin(this.t * (3 + p.seat) + p.seat) * (1 - skill) * 1.4;
    dir.normalize().rotateAround(new THREE.Vector2(), wobble);
    if ((p.data.path as number) >= SAMPLES + 1 && !d.done) {
      d.done = true;
      this.game.audio.play('confirm');
    }
    return dir.multiplyScalar(skill);
  }

  play(dt: number): void {
    let changed = false;
    for (const p of this.players) {
      const d = this.desks.get(p)!;
      if (d.done) continue;
      let move: THREE.Vector2;
      if (p.controller) {
        move = new THREE.Vector2(p.controller.stickX, -p.controller.stickY);
        if (move.lengthSq() > 1) move.normalize();
        if (p.controller.pressed('a') && d.inked > 10) {
          d.done = true;
          changed = true;
          this.game.audio.play('confirm');
        }
      } else {
        move = this.cpuMove(p, d);
        if (d.done) changed = true;
      }
      d.at.addScaledVector(move, PEN_SPEED * dt);
      d.at.clampScalar(-BOARD + 0.1, BOARD - 0.1);
      d.pen.position.set(d.origin.x + d.at.x, 0.35, d.origin.z + d.at.y);
      p.character.pose = move.lengthSq() > 0.01 ? 'wave' : 'idle';

      if (move.lengthSq() > 0.01) {
        let nearest = Infinity;
        this.outline.forEach((v, i) => {
          const dist = v.distanceTo(d.at);
          nearest = Math.min(nearest, dist);
          if (dist < HIT && !d.hit[i]) {
            d.hit[i] = true;
            changed = true;
          }
        });
        if (nearest > OFF) {
          d.off += dt;
          changed = true;
        }
        const here = new THREE.Vector3(d.pen.position.x, 0.03, d.pen.position.z);
        if ((!d.last || d.last.distanceTo(here) > 0.1) && d.inked < TRAIL_MAX) {
          d.trail.setMatrixAt(d.inked++, new THREE.Matrix4().setPosition(here));
          d.trail.count = d.inked;
          d.trail.instanceMatrix.needsUpdate = true;
          d.last = here;
        }
      }
    }
    if (changed) this.renderScore();
    if (this.players.every((p) => this.desks.get(p)!.done)) this.finish(this.best());
  }

  private best(): MinigamePlayer[] {
    const scores = this.players.map((p) => this.score(this.desks.get(p)!));
    const top = Math.max(...scores);
    return top > 0 ? this.players.filter((_, i) => scores[i] === top) : [];
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return this.score(this.desks.get(p)!);
  }

  timeout(): number[] {
    return this.best().map((p) => p.seat);
  }
}

export const traceRace: MinigameDef = {
  id: 'tracerace',
  name: 'Trace Race',
  kind: 'ffa',
  duel: true,
  rules: 'Trace the dotted shape with your pen. Cover the whole line but stay on it! Press A when you are done. Best score wins.',
  controls: 'Stick: move pen · A: done',
  create: () => new TraceRace(),
};
