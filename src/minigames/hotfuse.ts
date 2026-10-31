import * as THREE from 'three';
import { hotFuseTheme } from '../audio/songs/beamFuseThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, fall, knockOut, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 7;
const SPEED = 4.6;
/** Whoever has the bomb runs a little faster, so it can always be passed on. */
const HOLDER_SPEED = 5.3;
const DASH_SPEED = 11;
const DASH_TIME = 0.18;
const DASH_COOLDOWN = 1.6;
/** Touch distance for a pass. */
const TAG = 0.95;
/** No passing straight back. */
const PASS_LOCK = 0.8;
const BOMB_Y = 2.15;

/**
 * A lit bomb starts on someone's head. Touch another player to pass it on; B
 * gives a short dash. When the fuse runs out, whoever holds it is blown out of
 * the arena and a fresh bomb is lit. Last one standing wins.
 */
class HotFuse extends Minigame {
  readonly timeLimit = 60;
  private holder: MinigamePlayer | null = null;
  private fuse = 0;
  private fuseLength = 1;
  private lock = 0;
  private relight = 0;
  private tick = 0;
  private bomb = new THREE.Group();
  private bombBody!: THREE.Mesh;
  private spark!: THREE.Mesh;
  /** Where the bomb flies from on a pass, and how far along it is (1 = landed). */
  private hopFrom = new THREE.Vector3();
  private hop = 1;

  protected setup(): void {
    arenaBasics(this.scene, [0xffb48a, 0xfff0c8], 0xe89a6a, -10);
    const floor = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.6, 40), Palette.sand, { outline: 0.08 });
    floor.position.y = -0.3;
    this.scene.add(floor);
    // Checker tiles and a low wall of crates around the edge.
    for (let i = 0; i < 8; i++) {
      const wedge = new THREE.Mesh(
        new THREE.RingGeometry(1.5, RADIUS - 0.4, 8, 1, (i / 8) * Math.PI * 2, Math.PI / 8),
        new THREE.MeshBasicMaterial({ color: 0xf0d69c }),
      );
      wedge.rotation.x = -Math.PI / 2;
      wedge.position.y = 0.01;
      this.scene.add(wedge);
    }
    const hub = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: Palette.coral }));
    hub.rotation.x = -Math.PI / 2;
    hub.position.y = 0.02;
    this.scene.add(hub);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const crate = toonMesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), i % 2 ? 0xc98a5a : 0xb0744a, { outline: 0.03 });
      crate.position.set(Math.cos(a) * (RADIUS + 0.1), 0.35, Math.sin(a) * (RADIUS + 0.1));
      crate.rotation.y = -a + Math.PI / 2;
      this.scene.add(crate);
    }

    this.bombBody = toonMesh(new THREE.SphereGeometry(0.42, 20, 14), 0x3a3550, { outline: 0.03 });
    const cap = toonMesh(new THREE.CylinderGeometry(0.14, 0.16, 0.16, 12), 0x9a94b8, { outline: 0.02 });
    cap.position.y = 0.44;
    const wick = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 6), 0xe8d0a0, { outline: false });
    wick.position.set(0.05, 0.62, 0);
    wick.rotation.z = -0.3;
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: Palette.yellow }));
    this.spark.position.set(0.1, 0.78, 0);
    this.bomb.add(this.bombBody, cap, wick, this.spark);
    this.bomb.visible = false;
    this.scene.add(this.bomb);

    ring(this.players, 4.2);
    for (const p of this.players) {
      p.data.dash = 0;
      p.data.dashCool = 0;
      p.data.dashDir = new THREE.Vector3();
      p.data.jitter = new THREE.Vector3();
      p.data.jitterT = 0;
    }
    this.light();
    this.camera.position.set(0, 16, 13);
    this.camera.lookAt(0, 0, 0.6);
  }

  /** A new bomb on a random survivor; fuses get shorter as players drop. */
  private light(): void {
    const alive = this.alive;
    if (alive.length < 2) return;
    const rng = this.game.rng;
    this.holder = rng.pick(alive);
    this.fuseLength = this.fuse = (alive.length > 2 ? 9 : 11) + rng.next() * 5;
    this.lock = 1;
    this.hop = 1;
    this.tick = 0;
    this.bomb.visible = true;
    this.game.audio.play('select');
  }

  private pass(to: MinigamePlayer): void {
    const from = this.holder!;
    this.hopFrom.copy(from.character.position).setY(BOMB_Y);
    this.hop = 0;
    this.holder = to;
    this.lock = PASS_LOCK;
    from.character.setExpression('happy');
    to.character.setExpression('surprised');
    this.game.audio.play('pop');
  }

  private nearest(p: MinigamePlayer, among: MinigamePlayer[]): MinigamePlayer | null {
    let best: MinigamePlayer | null = null;
    let bestD = Infinity;
    for (const o of among) {
      if (o === p) continue;
      const d = o.character.position.distanceTo(p.character.position);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /** Holder chases the nearest rival; the rest run from the holder and keep off the wall. */
  private cpu(p: MinigamePlayer, dt: number): { move: THREE.Vector3; dash: boolean } {
    const pos = p.character.position;
    const rng = this.game.rng;
    // A little wander, rerolled now and then, so CPUs don't move like clockwork.
    p.data.jitterT = (p.data.jitterT as number) - dt;
    if ((p.data.jitterT as number) <= 0) {
      p.data.jitterT = 0.4 + rng.next() * 0.5;
      (p.data.jitter as THREE.Vector3).set(rng.next() * 2 - 1, 0, rng.next() * 2 - 1).multiplyScalar(0.35);
    }
    const move = (p.data.jitter as THREE.Vector3).clone();
    const holder = this.holder;
    if (!holder) return { move: move.add(new THREE.Vector3(-pos.x, 0, -pos.z).multiplyScalar(0.1)), dash: false };
    if (holder === p) {
      const target = this.nearest(p, this.alive);
      if (!target) return { move, dash: false };
      const to = target.character.position.clone().sub(pos).setY(0);
      const d = to.length();
      move.add(to.normalize());
      // Hurry more as the fuse burns down.
      const urgent = this.fuse < 3;
      return { move: move.normalize(), dash: d < (urgent ? 3 : 2) && rng.next() < (urgent ? 0.2 : 0.06) };
    }
    const away = pos.clone().sub(holder.character.position).setY(0);
    const d = away.length();
    if (d < 6) move.addScaledVector(away.normalize(), (6 - d) / 3);
    const flat = Math.hypot(pos.x, pos.z);
    // Near the wall, slide around it instead of getting pinned.
    if (flat > RADIUS - 2.2) {
      const inward = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
      const side = new THREE.Vector3(-inward.z, 0, inward.x);
      if (side.dot(away) < 0) side.negate();
      move.addScaledVector(inward, 0.7).addScaledVector(side, 0.9);
    }
    if (move.lengthSq() > 1) move.normalize();
    return { move, dash: d < 1.8 && rng.next() < 0.05 };
  }

  play(dt: number): void {
    for (const p of this.alive) {
      const c = p.character;
      let move: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        move = stick(p);
        dash = p.controller.pressed('b');
      } else {
        ({ move, dash } = this.cpu(p, dt));
      }
      p.data.dashCool = Math.max(0, (p.data.dashCool as number) - dt);
      if (dash && (p.data.dashCool as number) === 0) {
        const dir = move.lengthSq() > 0.01 ? move.clone().normalize() : new THREE.Vector3(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
        (p.data.dashDir as THREE.Vector3).copy(dir);
        p.data.dash = DASH_TIME;
        p.data.dashCool = DASH_COOLDOWN;
        this.game.audio.play('jump');
      }
      if ((p.data.dash as number) > 0) {
        p.data.dash = (p.data.dash as number) - dt;
        c.position.addScaledVector(p.data.dashDir as THREE.Vector3, DASH_SPEED * dt);
        moveAnim(p, 1);
      } else {
        c.position.addScaledVector(move, (p === this.holder ? HOLDER_SPEED : SPEED) * dt);
        face(p, move, dt);
        moveAnim(p, move.length());
      }
      const r = Math.hypot(c.position.x, c.position.z);
      if (r > RADIUS - 0.5) c.position.multiplyScalar((RADIUS - 0.5) / r);
    }
    separate(this.alive, 0.4);

    if (this.holder) {
      this.lock = Math.max(0, this.lock - dt);
      if (this.lock === 0) {
        const other = this.nearest(this.holder, this.alive);
        if (other && other.character.position.distanceTo(this.holder.character.position) < TAG) this.pass(other);
      }
      this.fuse -= dt;
      // Ticks speed up as the fuse burns down.
      this.tick -= dt;
      if (this.tick <= 0) {
        const left = this.fuse / this.fuseLength;
        this.tick = 0.12 + left * 0.6;
        this.game.audio.note('pluck', left < 0.3 ? 'E6' : 'A5', 0.05, 0.18);
      }
      if (this.fuse <= 0) this.explode();
    } else if (this.relight > 0) {
      this.relight -= dt;
      if (this.relight <= 0) this.light();
    }

    if (this.alive.length <= 1) this.finish(this.alive);
  }

  private explode(): void {
    const p = this.holder!;
    this.holder = null;
    this.bomb.visible = false;
    const out = p.character.position.clone().setY(0);
    if (out.lengthSq() < 0.01) out.set(0, 0, 1);
    knockOut(p, out.normalize().multiplyScalar(7).setY(8));
    p.character.setExpression('surprised');
    this.game.audio.play('boom');
    for (const o of this.alive) o.character.setExpression('happy');
    this.relight = 1.4;
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) if (!p.alive) fall(p, dt, -20);
    if (!this.holder) return;
    const head = this.holder.character.position.clone().setY(BOMB_Y);
    this.hop = Math.min(1, this.hop + dt * 7);
    this.bomb.position.lerpVectors(this.hopFrom, head, this.hop);
    this.bomb.position.y += Math.sin(this.hop * Math.PI) * 1.2;
    const left = this.fuse / this.fuseLength;
    // Swells and flashes red faster as it gets close.
    const pulse = Math.sin(this.t * (6 + (1 - left) * 30));
    this.bomb.scale.setScalar(1 + Math.max(0, pulse) * (0.05 + (1 - left) * 0.15));
    (this.bombBody.material as THREE.MeshToonMaterial).color.setHex(left < 0.35 && pulse > 0 ? Palette.coral : 0x3a3550);
    this.spark.scale.setScalar(0.8 + Math.abs(Math.sin(this.t * 40)) * 0.6);
  }

  timeout(): number[] {
    return this.alive.filter((p) => p !== this.holder).map((p) => p.seat);
  }
}

export const hotFuse: MinigameDef = {
  id: 'hotfuse',
  name: 'Hot Fuse',
  kind: 'ffa',
  duel: true,
  song: hotFuseTheme,
  rules: 'A lit bomb is ticking on somebody\'s head! Touch a rival to pass it on, and press B to dash. Whoever holds it when it blows is out. Last one standing wins!',
  controls: 'Stick: move · B: dash',
  create: () => new HotFuse(),
};
