import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import type { Space } from './types';

/*
 * Shared set-dressing helpers for the boards. Everything here is cosmetic:
 * scatter uses its own fixed-seed generator (never the game RNG) and every
 * animation is a pure function of the board clock, so online peers stay in
 * lockstep and see the same scenery.
 */

/** Small fixed-seed generator (mulberry32) for scattering props. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when (x, z) is at least `min` away from every space. */
export function clearOfPath(spaces: Space[], x: number, z: number, min: number): boolean {
  for (const s of spaces) {
    const dx = s.pos.x - x;
    const dz = s.pos.z - z;
    if (dx * dx + dz * dz < min * min) return false;
  }
  return true;
}

export interface ScatterOptions {
  count: number;
  /** Square area to scatter over, centred on the origin. */
  extent: number;
  /** Keep this far from every space. */
  clearance: number;
  /** Extra rejection test, e.g. "not on top of the town". */
  reject?: (x: number, z: number) => boolean;
}

/** Fixed-seed scatter that keeps the path clear. */
export function scatter(rand: () => number, spaces: Space[], opts: ScatterOptions): [number, number][] {
  const out: [number, number][] = [];
  for (let tries = 0; out.length < opts.count && tries < opts.count * 40; tries++) {
    const x = (rand() * 2 - 1) * opts.extent;
    const z = (rand() * 2 - 1) * opts.extent;
    if (!clearOfPath(spaces, x, z, opts.clearance)) continue;
    if (opts.reject?.(x, z)) continue;
    out.push([x, z]);
  }
  return out;
}

/**
 * Lots of one small prop in a single draw call (no outlines: they are tiny,
 * and ink hulls on hundreds of pebbles would be wasted fill).
 */
export function instanced(geo: THREE.BufferGeometry, color: number, items: { x: number; y: number; z: number; s: number; ry?: number; sy?: number }[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, toon(color), items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  items.forEach((it, i) => {
    q.setFromEuler(e.set(0, it.ry ?? 0, 0));
    m.compose(v.set(it.x, it.y, it.z), q, sc.set(it.s, it.s * (it.sy ?? 1), it.s));
    mesh.setMatrixAt(i, m);
  });
  mesh.receiveShadow = true;
  return mesh;
}

/** A flying bird: body plus two wings that flap. */
export interface Bird {
  group: THREE.Group;
  wings: THREE.Object3D[];
}

export function bird(body: number, wing: number = body, beak: number = Palette.yellow): Bird {
  const group = new THREE.Group();
  const torso = toonMesh(new THREE.SphereGeometry(0.28, 12, 8), body, { outline: 0.02 });
  torso.scale.set(1, 0.8, 1.6);
  const head = toonMesh(new THREE.SphereGeometry(0.18, 10, 8), body, { outline: 0.02 });
  head.position.set(0, 0.12, 0.42);
  const bill = toonMesh(new THREE.ConeGeometry(0.06, 0.2, 6), beak, { outline: 0.01 });
  bill.rotation.x = Math.PI / 2;
  bill.position.set(0, 0.1, 0.62);
  group.add(torso, head, bill);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.18, 0.08, 0);
    const w = toonMesh(new THREE.BoxGeometry(0.8, 0.04, 0.34), wing, { outline: 0.012 });
    w.position.x = side * 0.4;
    pivot.add(w);
    pivot.userData.side = side;
    group.add(pivot);
    wings.push(pivot);
  }
  return { group, wings };
}

/** Circle a bird around a centre point, flapping as it goes. */
export function flyBird(b: Bird, t: number, cx: number, cz: number, r: number, y: number, speed: number, phase: number): void {
  const a = t * speed + phase;
  const dir = Math.sign(speed) || 1;
  b.group.position.set(cx + Math.cos(a) * r, y + Math.sin(t * 1.3 + phase) * 0.6, cz + Math.sin(a) * r);
  // Face along the circle's tangent and bank into the turn.
  b.group.rotation.set(0, -a + (dir > 0 ? 0 : Math.PI), 0.35 * dir);
  // Flap in bursts, then glide.
  const flap = Math.sin(t * 5 + phase) > -0.3 ? Math.sin(t * 14 + phase) * 0.6 : 0.15;
  for (const w of b.wings) w.rotation.z = flap * (w.userData.side as number);
}

/**
 * A loop of smoke puffs. The puffs are placed by time alone (no state), so
 * they never drift out of sync or pile up.
 */
export class Smoke {
  readonly group = new THREE.Group();
  private puffs: THREE.Mesh[] = [];

  constructor(
    count: number,
    private size: number,
    private rise: number,
    private rate: number,
    color: number = 0xffffff,
    private drift = new THREE.Vector3(0.6, 0, 0),
  ) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const mat = toon(color, { transparent: true });
      mat.depthWrite = false;
      const m = new THREE.Mesh(geo, mat);
      m.userData.offset = i / count;
      this.puffs.push(m);
      this.group.add(m);
    }
  }

  update(t: number): void {
    for (const p of this.puffs) {
      const k = (t * this.rate + (p.userData.offset as number)) % 1;
      p.position.set(this.drift.x * k * this.rise, k * this.rise, this.drift.z * k * this.rise);
      p.scale.setScalar(this.size * (0.4 + k * 1.2));
      (p.material as THREE.MeshToonMaterial).opacity = Math.min(1, (1 - k) * 1.6) * 0.85;
    }
  }
}

/** Sideways-scuttling little crab. */
export function crab(color: number = Palette.coral): THREE.Group {
  const c = new THREE.Group();
  const body = toonMesh(new THREE.SphereGeometry(0.22, 12, 8), color, { outline: 0.015 });
  body.scale.set(1.3, 0.6, 1);
  body.position.y = 0.14;
  c.add(body);
  for (const side of [-1, 1]) {
    const claw = toonMesh(new THREE.SphereGeometry(0.09, 8, 6), color, { outline: 0.012 });
    claw.position.set(side * 0.3, 0.2, 0.16);
    const eye = toonMesh(new THREE.SphereGeometry(0.045, 8, 6), 0xffffff, { outline: 0.01 });
    eye.position.set(side * 0.07, 0.3, 0.14);
    c.add(claw, eye);
  }
  return c;
}

/** Flat canvas sign. */
export function textTexture(text: string, bg: string, fg: string, w = 256, h = 64, font = '900 40px system-ui, sans-serif'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft round glow sprite (nebulae, lamps, engine glows). */
let glowTex: THREE.CanvasTexture | null = null;
export function glowSprite(color: number, scale: number, opacity = 1): THREE.Sprite {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.setScalar(scale);
  return s;
}
