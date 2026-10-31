import * as THREE from 'three';
import { ghostTheme } from '../audio/songs/ghostBridgeThemes';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { skyDome } from '../render/environment';
import { face, moveAnim, scorePanel, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 7.5;
const HALF_Z = 5.5;
const HUNTER_SPEED = 3.2;
const GHOST_SPEED = 5;
/** Flashlight beam: how far it reaches and its half-angle. */
const BEAM_RANGE = 5;
const BEAM_ANGLE = 0.34;
const ZAP_RANGE = 6;
const SPARK_SPEED = 11;
const SPARK_HIT = 0.75;
const ZAP_COOL = 1.4;
const BOO_RADIUS = 2.4;
const BOO_COOL = 3;
const STUN = 1.5;
/** Hunter turn speed, radians per second. */
const TURN = 3;
const HITS = 3;
/** Invulnerable flicker after a zap. */
const SAFE = 3;
/** The ghost drips ectoplasm every so often, a clue where it went. */
const DRIP = 2.2;
const FURNITURE: [number, number, number][] = [
  [-4.2, -2.6, 0.9],
  [3.6, -3, 0.8],
  [0.2, 0.4, 1.1],
  [-4.6, 3, 0.7],
  [4.4, 2.6, 0.9],
];

interface Drip {
  mesh: THREE.Mesh;
  age: number;
}

/** Sheet ghost: dome head, wavy skirt, two dark eyes and a scarf in the player's color. */
function ghostMesh(accent: number): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * 0.55, 1.15 + Math.cos(a) * 0.55));
  }
  pts.reverse();
  pts.push(new THREE.Vector2(0.62, 0.55), new THREE.Vector2(0.75, 0.1));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshToonMaterial({ color: 0xf4f2ff, emissive: 0x9a90d8, side: THREE.DoubleSide }));
  g.add(body);
  for (const x of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    eye.scale.set(1, 1.5, 0.6);
    eye.position.set(x, 1.3, 0.5);
    g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: Palette.ink }));
  mouth.scale.set(1, 1.3, 0.5);
  mouth.position.set(0, 1.05, 0.56);
  g.add(mouth);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 8, 24), new THREE.MeshToonMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.3 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.8;
  g.add(scarf);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.Material;
      m.transparent = true;
      m.depthWrite = false;
    }
  });
  return g;
}

/**
 * 1 vs 3. The solo player is a ghost, nearly invisible in a dark manor.
 * The hunters sweep flashlights to reveal it and zap it; three zaps and they
 * win. The ghost can shout "Boo!" to stun hunters who get too close, and
 * wins if it lasts until time runs out.
 */
class GhostHunt extends Minigame {
  readonly timeLimit = 30;
  private ghost!: THREE.Group;
  private beams = new Map<MinigamePlayer, { light: THREE.SpotLight; cone: THREE.Mesh }>();
  private sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; left: number }[] = [];
  private drips: Drip[] = [];
  private booRing!: THREE.Mesh;
  private hits = 0;
  private safe = 0;
  private booCool = 1;
  private booFlash = 0;
  private dripT = 0;
  private lit = false;
  private ghostVel = new THREE.Vector3();
  /** What CPU hunters know: where the ghost was last seen, and how long ago. */
  private lastSeen = new THREE.Vector3();
  private seenAge = 99;
  private board!: HTMLDivElement;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get hunters(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    this.scene.add(skyDome(0x0e0a24, 0x2a1d4a));
    this.scene.add(new THREE.HemisphereLight(0x8a7ad8, 0x1a1030, 0.55));
    const moon = new THREE.DirectionalLight(0x9aa8ff, 0.35);
    moon.position.set(-6, 12, 4);
    this.scene.add(moon);

    // Checkered manor floor with walls on three sides.
    const floor = new THREE.Group();
    for (let x = 0; x < 15; x++) {
      for (let z = 0; z < 11; z++) {
        const tile = toonMesh(new THREE.BoxGeometry(1, 0.4, 1), (x + z) % 2 ? 0x7a6a9a : 0x5e5080, { outline: false });
        tile.position.set(-7 + x, -0.2, -5 + z);
        floor.add(tile);
      }
    }
    this.scene.add(floor);
    const wallMat = 0x4a3a6a;
    const back = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 1.6, 3.2, 0.5), wallMat, { outline: 0.04 });
    back.position.set(0, 1.4, -HALF_Z - 0.6);
    this.scene.add(back);
    for (const x of [-HALF_X - 0.6, HALF_X + 0.6]) {
      const side = toonMesh(new THREE.BoxGeometry(0.5, 1.4, HALF_Z * 2 + 1.6), wallMat, { outline: 0.04 });
      side.position.set(x, 0.5, 0);
      this.scene.add(side);
    }
    // Portraits and candles on the back wall.
    for (const x of [-4.5, 0, 4.5]) {
      const frame = toonMesh(new THREE.BoxGeometry(1.4, 1.6, 0.1), 0xc8a050, { outline: 0.02 });
      frame.position.set(x, 1.8, -HALF_Z - 0.3);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), new THREE.MeshBasicMaterial({ color: 0x3a2a4a }));
      art.position.set(x, 1.8, -HALF_Z - 0.24);
      const head = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshBasicMaterial({ color: 0x8a7a9a }));
      head.position.set(x, 1.95, -HALF_Z - 0.23);
      this.scene.add(frame, art, head);
    }
    for (const x of [-2.25, 2.25]) {
      const candle = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), Palette.cream, { outline: false });
      candle.position.set(x, 2.1, -HALF_Z - 0.2);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
      flame.scale.y = 1.6;
      flame.position.set(x, 2.4, -HALF_Z - 0.2);
      const glow = new THREE.PointLight(0xffb050, 1.5, 4);
      glow.position.set(x, 2.4, -HALF_Z + 0.2);
      this.scene.add(candle, flame, glow);
    }
    // Dusty furniture: hunters walk around it, the ghost floats right through.
    for (const [x, z, r] of FURNITURE) {
      const piece = new THREE.Group();
      const top = toonMesh(new THREE.CylinderGeometry(r, r, 0.15, 16), 0x8a5a3a, { outline: 0.03 });
      top.position.y = 0.75;
      const leg = toonMesh(new THREE.CylinderGeometry(0.12, 0.2, 0.75, 8), 0x6a4028, { outline: 0.02 });
      leg.position.y = 0.37;
      const sheet = toonMesh(new THREE.ConeGeometry(r * 0.5, 0.5, 12), 0xe8e0f0, { outline: 0.02 });
      sheet.position.y = 1.07;
      piece.add(top, leg, sheet);
      piece.position.set(x, 0, z);
      this.scene.add(piece);
    }

    const solo = this.solo;
    solo.character.visible = false;
    solo.character.position.set(0, 0, -3.8);
    this.ghost = ghostMesh(solo.character.def.colors.accent);
    this.scene.add(this.ghost);
    this.booRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), new THREE.MeshBasicMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0, depthWrite: false }));
    this.booRing.rotation.x = -Math.PI / 2;
    this.booRing.position.y = 0.05;
    this.scene.add(this.booRing);

    this.hunters.forEach((p, i) => {
      p.character.position.set((i - 1) * 3.5, 0, HALF_Z - 0.5);
      p.character.rotation.y = Math.PI;
      p.data.stun = 0;
      p.data.zap = 0;
      p.data.lock = 0;
      p.data.react = 0.45 + i * 0.1;
      p.data.goal = new THREE.Vector3((i - 1) * 4, 0, 0);
      const light = new THREE.SpotLight(0xfff0b0, 5, BEAM_RANGE + 2, BEAM_ANGLE + 0.08, 0.4, 0);
      light.position.set(0.3, 0.9, 0.2);
      light.target.position.set(0.3, 0, BEAM_RANGE);
      p.character.add(light, light.target);
      const geo = new THREE.ConeGeometry(Math.tan(BEAM_ANGLE) * BEAM_RANGE, BEAM_RANGE, 24, 1, true);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, BEAM_RANGE / 2);
      const cone = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      cone.position.set(0.3, 0.9, 0.2);
      cone.rotation.x = 0.12;
      p.character.add(cone);
      this.beams.set(p, { light, cone });
    });

    this.camera.position.set(0, 15, 12.5);
    this.camera.lookAt(0, 0, 0.3);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.textContent = `Zaps: ${'⚡'.repeat(this.hits)}${'·'.repeat(HITS - this.hits)}`;
  }

  private forward(p: MinigamePlayer): THREE.Vector3 {
    const r = p.character.rotation.y;
    return new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
  }

  /** Is the ghost inside this hunter's flashlight beam (within `range`)? */
  private inBeam(p: MinigamePlayer, range: number): boolean {
    if ((p.data.stun as number) > 0) return false;
    const d = this.solo.character.position.clone().sub(p.character.position).setY(0);
    const len = d.length();
    if (len > range) return false;
    if (len < 0.7) return true;
    return d.divideScalar(len).dot(this.forward(p)) > Math.cos(BEAM_ANGLE + 0.1);
  }

  /** Hunters swing their flashlights at a capped turn speed, so a darting ghost can slip out. */
  private turn(p: MinigamePlayer, dir: THREE.Vector3, dt: number): void {
    if (dir.lengthSq() < 0.01) return;
    const r = p.character.rotation;
    const diff = Math.atan2(Math.sin(Math.atan2(dir.x, dir.z) - r.y), Math.cos(Math.atan2(dir.x, dir.z) - r.y));
    r.y += THREE.MathUtils.clamp(diff, -TURN * dt, TURN * dt);
  }

  /** Fire a spark ball along the flashlight beam. */
  private zap(p: MinigamePlayer): void {
    p.data.zap = ZAP_COOL;
    // CPUs misjudge the lead a bit differently every shot.
    p.data.leadK = this.game.rng.range(-1, 1.2);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color: 0xa8f4ff }));
    mesh.position.copy(p.character.position).addScaledVector(this.forward(p), 0.6).setY(0.9);
    this.scene.add(mesh);
    this.sparks.push({ mesh, vel: this.forward(p).multiplyScalar(SPARK_SPEED), left: ZAP_RANGE / SPARK_SPEED });
    this.game.audio.play('pop');
  }

  private moveSparks(dt: number): void {
    const g = this.solo.character.position;
    for (const s of [...this.sparks]) {
      s.mesh.position.addScaledVector(s.vel, dt);
      s.left -= dt;
      const hit = this.safe <= 0 && Math.hypot(s.mesh.position.x - g.x, s.mesh.position.z - g.z) < SPARK_HIT;
      if (hit) {
        this.hits++;
        this.safe = SAFE;
        this.renderScore();
        this.solo.character.setExpression('surprised');
        this.game.audio.play('boom');
        // Knocked back along the spark's path.
        this.solo.data.knock = s.vel.clone().setY(0).normalize().multiplyScalar(7);
        if (this.hits >= HITS) this.finish(this.hunters);
      }
      if (hit || s.left <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(this.sparks.indexOf(s), 1);
      }
    }
  }

  /** Where a spark from this hunter would meet the ghost if it keeps going (what CPUs aim at). */
  private leadPoint(p: MinigamePlayer): THREE.Vector3 {
    const g = this.solo.character.position;
    const t = g.distanceTo(p.character.position) / SPARK_SPEED;
    return g.clone().addScaledVector(this.ghostVel, t * ((p.data.leadK as number | undefined) ?? 0.6));
  }

  /** CPU ghost: drift away from hunters, dodge beams, Boo anyone who corners it. */
  private cpuGhost(): { dir: THREE.Vector3; boo: boolean } {
    const g = this.solo.character.position;
    const dir = new THREE.Vector3(Math.sin(this.t * 0.9) * 0.4, 0, Math.cos(this.t * 0.7) * 0.4);
    let boo = false;
    for (const h of this.hunters) {
      const away = g.clone().sub(h.character.position).setY(0);
      const d = Math.max(0.3, away.length());
      const stunned = (h.data.stun as number) > 0;
      if (stunned) continue;
      let w = 4 / (d * d);
      if (this.inBeam(h, BEAM_RANGE)) {
        w *= 3;
        // Slip sideways out of the beam rather than straight down it.
        const side = new THREE.Vector3(-away.z, 0, away.x).normalize();
        if (side.dot(new THREE.Vector3(-g.x, 0, -g.z)) < 0) side.negate();
        dir.addScaledVector(side, 1.2);
      }
      dir.addScaledVector(away.normalize(), w);
      if (d < BOO_RADIUS - 0.4) boo = true;
    }
    // Sidestep sparks flying this way.
    for (const s of this.sparks) {
      const to = g.clone().sub(s.mesh.position).setY(0);
      const d = to.length();
      if (d > 3.5 || to.dot(s.vel) <= 0) continue;
      const side = new THREE.Vector3(-s.vel.z, 0, s.vel.x).normalize();
      if (side.dot(to) < 0) side.negate();
      dir.addScaledVector(side, 3 / Math.max(0.8, d));
    }
    // Walls are dead ends: pull back toward the middle near the edges.
    if (Math.abs(g.x) > HALF_X - 2) dir.x -= Math.sign(g.x) * (Math.abs(g.x) - (HALF_X - 2)) * 1.2;
    if (Math.abs(g.z) > HALF_Z - 1.6) dir.z -= Math.sign(g.z) * (Math.abs(g.z) - (HALF_Z - 1.6)) * 1.2;
    const len = dir.length();
    return { dir: len > 1 ? dir.divideScalar(len) : dir, boo };
  }

  /** CPU hunter: chase the last sighting or clue, otherwise sweep the room. */
  private cpuHunter(p: MinigamePlayer, dt: number): { dir: THREE.Vector3; fire: boolean } {
    const pos = p.character.position;
    const goal = p.data.goal as THREE.Vector3;
    let target: THREE.Vector3;
    if (this.seenAge < 1.5) {
      // Fan out around the sighting instead of piling up in one spot.
      const k = this.hunters.indexOf(p) - 1;
      target = this.lastSeen.clone().add(new THREE.Vector3(k * 2.2, 0, Math.abs(k) * 0.8));
    } else {
      if (pos.distanceTo(goal) < 1) goal.set(this.game.rng.range(-HALF_X + 1, HALF_X - 1), 0, this.game.rng.range(-HALF_Z + 1, HALF_Z - 1));
      target = goal;
    }
    const to = target.clone().sub(pos).setY(0);
    const d = to.length();
    const dir = d > 0.01 ? to.divideScalar(d) : to;
    // Close in to zapping range, then mostly just turn to aim.
    if (this.seenAge < 1.5 && d < ZAP_RANGE - 1) dir.multiplyScalar(0.15);
    for (const [x, z, r] of FURNITURE) {
      const away = new THREE.Vector3(pos.x - x, 0, pos.z - z);
      const ad = away.length();
      if (ad < r + 0.9) dir.addScaledVector(away.normalize(), (r + 0.9 - ad) * 1.5);
    }
    // Hold the ghost in the beam a moment before zapping (reaction time).
    p.data.lock = this.inBeam(p, ZAP_RANGE) && this.safe <= 0 ? (p.data.lock as number) + dt : 0;
    const lead = this.leadPoint(p).sub(pos).setY(0).normalize();
    const fire = (p.data.lock as number) > (p.data.react as number) && lead.dot(this.forward(p)) > Math.cos(0.15);
    return { dir, fire };
  }

  play(dt: number): void {
    const solo = this.solo;
    const g = solo.character.position;
    this.safe = Math.max(0, this.safe - dt);
    this.booCool = Math.max(0, this.booCool - dt);

    let gdir: THREE.Vector3;
    let boo: boolean;
    if (solo.controller) {
      gdir = stick(solo);
      boo = solo.controller.pressed('a');
    } else ({ dir: gdir, boo } = this.cpuGhost());
    const knock = solo.data.knock as THREE.Vector3 | undefined;
    if (knock) {
      g.addScaledVector(knock, dt);
      knock.multiplyScalar(Math.max(0, 1 - dt * 5));
      if (knock.length() < 0.2) solo.data.knock = undefined;
    }
    const before = g.clone();
    g.addScaledVector(gdir, GHOST_SPEED * dt);
    g.x = THREE.MathUtils.clamp(g.x, -HALF_X, HALF_X);
    g.z = THREE.MathUtils.clamp(g.z, -HALF_Z, HALF_Z);
    if (dt > 0) this.ghostVel.copy(g).sub(before).divideScalar(dt);
    face(solo, gdir, dt);
    if (boo && this.booCool <= 0) {
      this.booCool = BOO_COOL;
      this.booFlash = 0.5;
      this.game.audio.play('jump');
      for (const h of this.hunters) {
        if (h.character.position.distanceTo(g) < BOO_RADIUS) {
          h.data.stun = STUN;
          h.character.setExpression('surprised');
        }
      }
    }
    this.dripT += dt;
    if (this.dripT >= DRIP) {
      this.dripT = 0;
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0x9cff9a, transparent: true, opacity: 0.8, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(g.x, 0.03, g.z);
      this.scene.add(mesh);
      this.drips.push({ mesh, age: 0 });
      // A fresh drip tells CPU hunters roughly where to look.
      if (this.seenAge > 1) {
        this.lastSeen.set(g.x, 0, g.z);
        this.seenAge = 1;
      }
    }

    for (const h of this.hunters) {
      const c = h.character;
      h.data.zap = Math.max(0, (h.data.zap as number) - dt);
      if ((h.data.stun as number) > 0) {
        h.data.stun = (h.data.stun as number) - dt;
        c.rotation.y += dt * 10;
        c.pose = 'sulk';
        continue;
      }
      let dir: THREE.Vector3;
      let fire: boolean;
      if (h.controller) {
        dir = stick(h);
        fire = h.controller.pressed('a');
      } else ({ dir, fire } = this.cpuHunter(h, dt));
      c.position.addScaledVector(dir, HUNTER_SPEED * dt);
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_X, HALF_X);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HALF_Z, HALF_Z);
      for (const [x, z, r] of FURNITURE) {
        const away = new THREE.Vector3(c.position.x - x, 0, c.position.z - z);
        if (away.length() < r + 0.35) c.position.set(x, 0, z).addScaledVector(away.normalize(), r + 0.35);
      }
      // CPUs turn toward a ghost they can see even while standing still.
      const aim = !h.controller && this.seenAge < 1.5 ? (this.lit ? this.leadPoint(h) : this.lastSeen.clone()).sub(c.position).setY(0).normalize() : dir;
      this.turn(h, aim, dt);
      moveAnim(h, dir.length());
      c.setExpression('determined');
      if (fire && (h.data.zap as number) <= 0) {
        this.zap(h);
      }
    }
    separate(this.hunters, 0.42);
    this.moveSparks(dt);
    if (this.winners) return;

    // Right after a zap the ghost slips away unseen.
    this.lit = this.safe <= 0 && this.hunters.some((h) => this.inBeam(h, BEAM_RANGE));
    this.seenAge += dt;
    if (this.lit) {
      this.lastSeen.set(g.x, 0, g.z);
      this.seenAge = 0;
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    const solo = this.solo;
    const g = solo.character.position;
    this.ghost.position.set(g.x, 0.15 + Math.sin(this.t * 3) * 0.12, g.z);
    this.ghost.rotation.y = solo.character.rotation.y;
    this.booFlash = Math.max(0, this.booFlash - dt);
    // Faint shimmer in the dark; plain as day in a flashlight; flickers when zapped.
    const finished = solo.character.visible;
    let target = this.lit || this.booFlash > 0 ? 0.92 : 0.06;
    if (this.safe > SAFE - 0.5) target = Math.sin(this.t * 40) > 0 ? 0.9 : 0.2;
    this.ghost.visible = !finished;
    this.ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.Material;
        m.opacity += (target - m.opacity) * Math.min(1, dt * 10);
      }
    });
    const k = this.booFlash / 0.5;
    (this.booRing.material as THREE.MeshBasicMaterial).opacity = k * 0.8;
    this.booRing.scale.setScalar(BOO_RADIUS * (1 - k * 0.6));
    this.booRing.position.set(g.x, 0.05, g.z);
    for (const h of this.hunters) {
      const b = this.beams.get(h)!;
      const on = (h.data.stun as number) <= 0;
      b.light.visible = on;
      b.cone.visible = on;
    }
    for (const s of this.sparks) s.mesh.scale.setScalar(1 + Math.sin(this.t * 50) * 0.25);
    for (const d of [...this.drips]) {
      d.age += dt;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - d.age * 0.3);
      if (d.age > 2.7) {
        this.scene.remove(d.mesh);
        this.drips.splice(this.drips.indexOf(d), 1);
      }
    }
  }

  timeout(): number[] {
    return [this.solo.seat];
  }
}

export const ghostHunt: MinigameDef = {
  id: 'ghosthunt',
  name: 'Ghost Hunt',
  kind: '1v3',
  song: ghostTheme,
  rules: 'Ghost: you are nearly invisible! Dodge the flashlights and Boo hunters who get close until time runs out. Hunters: sweep your flashlights to reveal the ghost and zap it 3 times to win.',
  controls: 'Ghost: stick to float, A to Boo · Hunters: stick to walk and aim, A to zap',
  create: () => new GhostHunt(),
};
