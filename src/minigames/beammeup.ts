import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 8;
const RUN_SPEED = 5.2;
const UFO_SPEED = 6.5;
/** The beam slows the saucer down while it's on. */
const BEAM_SPEED = 3.2;
const BEAM_R = 1.3;
/** Seconds inside the beam before a runner is lifted away. */
const LIFT_TIME = 0.9;
const UFO_Y = 5;

/**
 * 1 vs 3. The solo player flies a saucer and holds A to switch on the tractor
 * beam; anyone caught in it long enough gets beamed up. Runners win if anyone
 * is still on the ground when time runs out.
 */
class BeamMeUp extends Minigame {
  readonly timeLimit = 25;
  private ufo = new THREE.Group();
  private beam!: THREE.Mesh;
  private beamOn = false;
  private board!: HTMLDivElement;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0x8f78d2, 0x231f52], 0x231f52, -6);
    const floor = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS * 0.8, 1, 8), 0xd8d4ee, { outline: 0.06 });
    floor.position.y = -0.5;
    this.scene.add(floor);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(2, 24), new THREE.MeshBasicMaterial({ color: 0xbdb6e0 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(-3, 0.01, -2);
    this.scene.add(crater);

    // Saucer: the solo player rides in the glass dome.
    const disc = toonMesh(new THREE.SphereGeometry(1.6, 28, 12), 0xb8c0d8, { outline: 0.05 });
    disc.scale.y = 0.3;
    const rim = toonMesh(new THREE.TorusGeometry(1.6, 0.12, 8, 32), Palette.yellow, { outline: 0.02 });
    rim.rotation.x = Math.PI / 2;
    const dome = toonMesh(new THREE.SphereGeometry(0.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), Palette.sky, {
      outline: 0.02,
      transparent: true,
      opacity: 0.45,
    });
    dome.position.y = 0.25;
    this.ufo.add(disc, rim, dome);
    for (let i = 0; i < 6; i++) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? Palette.coral : Palette.mint }));
      const a = (i / 6) * Math.PI * 2;
      light.position.set(Math.cos(a) * 1.3, -0.2, Math.sin(a) * 1.3);
      this.ufo.add(light);
    }
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, BEAM_R, UFO_Y, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beam.position.y = -UFO_Y / 2;
    this.beam.visible = false;
    this.ufo.add(this.beam);
    this.ufo.position.set(0, UFO_Y, -5);
    this.scene.add(this.ufo);

    const solo = this.solo;
    solo.character.scale.setScalar(0.55);
    solo.character.position.set(0, 0.05, 0);
    solo.character.rotation.y = 0;
    this.ufo.add(solo.character);

    this.runners.forEach((p, i) => {
      p.character.position.set((i - 1) * 3, 0, 3);
      p.data.caught = 0;
    });
    this.camera.position.set(0, 16, 14);
    this.camera.lookAt(0, 0.5, 0.5);
    this.board = document.createElement('div');
    this.board.className = 'mg-score panel';
    this.overlay.appendChild(this.board);
    this.renderScore();
  }

  private renderScore(): void {
    const left = this.runners.filter((p) => p.alive).length;
    this.board.textContent = `On the ground: ${left}`;
  }

  /** CPU saucer chases the nearest runner and beams when overhead. */
  private cpuSaucer(): { dir: THREE.Vector3; beam: boolean } {
    const at = new THREE.Vector3(this.ufo.position.x, 0, this.ufo.position.z);
    let target: MinigamePlayer | null = null;
    let best = Infinity;
    for (const r of this.runners) {
      if (!r.alive) continue;
      const d = r.character.position.distanceTo(at);
      if (d < best) {
        best = d;
        target = r;
      }
    }
    if (!target) return { dir: new THREE.Vector3(), beam: false };
    const lead = (target.data.vel as THREE.Vector3 | undefined)?.clone().multiplyScalar(0.35) ?? new THREE.Vector3();
    const dir = target.character.position.clone().add(lead).sub(at).setY(0);
    const dist = dir.length();
    return { dir: dist > 0.2 ? dir.normalize() : new THREE.Vector3(), beam: dist < BEAM_R * 0.9 };
  }

  /** CPU runners flee from the saucer's shadow, and keep off the edge. */
  private cpuRunner(p: MinigamePlayer): THREE.Vector3 {
    const pos = p.character.position;
    const away = new THREE.Vector3(pos.x - this.ufo.position.x, 0, pos.z - this.ufo.position.z);
    const d = away.length();
    const dir = new THREE.Vector3();
    if (d < 5.5) dir.addScaledVector(away.normalize(), (5.5 - d) / 2);
    const flat = Math.hypot(pos.x, pos.z);
    if (flat > RADIUS - 2.5) dir.add(new THREE.Vector3(-pos.x, 0, -pos.z).normalize().multiplyScalar(1.2));
    // Circle-strafe so they don't pin themselves against the edge.
    dir.add(new THREE.Vector3(-away.z, 0, away.x).normalize().multiplyScalar(0.4 * (p.seat % 2 ? 1 : -1)));
    if (dir.lengthSq() > 1) dir.normalize();
    return dir.multiplyScalar(0.92);
  }

  play(dt: number): void {
    const solo = this.solo;
    let dir: THREE.Vector3;
    if (solo.controller) {
      dir = stick(solo);
      this.beamOn = solo.controller.down('a');
    } else {
      const ai = this.cpuSaucer();
      dir = ai.dir;
      this.beamOn = ai.beam;
    }
    this.ufo.position.addScaledVector(dir, (this.beamOn ? BEAM_SPEED : UFO_SPEED) * dt);
    const flat = Math.hypot(this.ufo.position.x, this.ufo.position.z);
    if (flat > RADIUS) {
      this.ufo.position.x *= RADIUS / flat;
      this.ufo.position.z *= RADIUS / flat;
    }
    this.ufo.rotation.y += dt * 2;
    this.ufo.position.y = UFO_Y + Math.sin(this.t * 3) * 0.15;
    this.beam.visible = this.beamOn;
    solo.character.pose = this.beamOn ? 'cheer' : 'idle';

    for (const r of this.runners) {
      const c = r.character;
      if (!r.alive) {
        // Floating up into the saucer.
        if (c.visible) {
          c.position.lerp(new THREE.Vector3(this.ufo.position.x, this.ufo.position.y - 0.4, this.ufo.position.z), Math.min(1, dt * 3));
          c.rotation.y += dt * 8;
          c.scale.multiplyScalar(1 - dt * 1.5);
          if (c.scale.x < 0.15) c.visible = false;
        }
        continue;
      }
      const move = r.controller ? stick(r) : this.cpuRunner(r);
      r.data.vel = move.clone().multiplyScalar(RUN_SPEED);
      c.position.addScaledVector(move, RUN_SPEED * dt);
      const f = Math.hypot(c.position.x, c.position.z);
      if (f > RADIUS - 0.6) c.position.multiplyScalar((RADIUS - 0.6) / f);
      face(r, move, dt);
      moveAnim(r, move.length());

      const inBeam = this.beamOn && Math.hypot(c.position.x - this.ufo.position.x, c.position.z - this.ufo.position.z) < BEAM_R;
      r.data.caught = inBeam ? (r.data.caught as number) + dt : Math.max(0, (r.data.caught as number) - dt * 0.5);
      c.position.y = Math.min(1.2, (r.data.caught as number) * 1.3);
      if (inBeam) c.setExpression('surprised');
      if ((r.data.caught as number) >= LIFT_TIME) {
        r.alive = false;
        r.data.ground = c.position.clone().setY(0);
        c.pose = 'jump';
        this.game.audio.play('star');
        this.renderScore();
      }
    }
    separate(this.runners.filter((r) => r.alive), 0.45);

    if (this.runners.every((r) => !r.alive)) this.finish([solo]);
  }

  /** Time's up with someone still down there: the whole runner team wins. */
  timeout(): number[] {
    for (const r of this.runners) {
      if (r.alive) continue;
      // Beam the caught ones back down for the victory pose.
      r.character.position.copy(r.data.ground as THREE.Vector3);
      r.character.scale.setScalar(1);
      r.character.rotation.set(0, 0, 0);
    }
    return this.runners.map((r) => r.seat);
  }
}

export const beamMeUp: MinigameDef = {
  id: 'beammeup',
  name: 'Beam Me Up',
  kind: '1v3',
  rules: 'The saucer pilot holds A to fire a tractor beam and lift the runners away. Runners win if anyone is still on the ground at the end!',
  controls: 'Pilot: stick to fly, hold A to beam · Runners: stick to run',
  create: () => new BeamMeUp(),
};
