import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { glowSprite, Smoke } from './decor';
import { box, cyl, live, put, signPlane } from './westernProps';

/*
 * Set pieces for Frostbite Peak. Builders return groups facing +z (toward
 * the board camera). Animated parts are tagged `live` and handed back via
 * `userData` (or the return value); everything else gets baked by the board.
 */

export const SNOW = 0xf6f9ff;
export const SNOW_SHADE = 0xdfe7f8;
export const ICE = 0xbfe6f7;
export const ICE_DEEP = 0x8fcdec;
export const ROCK = 0xb3aed6;
export const ROCK_DARK = 0x938dc0;
export const PINE = 0x6cc39c;
export const PINE_DARK = 0x4fa889;
export const LOG = 0xc0876a;
export const LOG_DARK = 0x9a6a58;
export const WINDOW_WARM = 0xffe08a;

/** A pitched roof of two slabs, each with a snow blanket on top. */
export function snowRoof(w: number, d: number, pitch: number, color: number, y: number): THREE.Group {
  const g = new THREE.Group();
  const half = w / 2 + 0.25;
  const ang = Math.atan2(pitch, w / 2);
  const len = Math.hypot(half, pitch * (half / (w / 2))) + 0.05;
  for (const side of [-1, 1]) {
    const slab = new THREE.Group();
    put(slab, box(len, 0.16, d + 0.5, color, 0.025), 0, 0, 0);
    put(slab, box(len - 0.05, 0.16, d + 0.42, SNOW, 0.02), 0.02 * side, 0.15, 0);
    slab.position.set(side * (len / 2) * Math.cos(ang), y + pitch - (len / 2) * Math.sin(ang), 0);
    slab.rotation.z = -side * ang;
    g.add(slab);
  }
  // Icicles along both eaves.
  const n = Math.max(3, Math.round(d * 1.6));
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const h = 0.18 + ((i * 7) % 5) * 0.06;
      const ic = put(g, toonMesh(new THREE.ConeGeometry(0.06, h, 5), ICE, { outline: false }), side * (half - 0.05), y - 0.05 - h / 2, -d / 2 + (i + 0.5) * (d / n));
      ic.rotation.x = Math.PI;
    }
  }
  return g;
}

/** Gable triangle that closes the end of a pitched roof. */
function gable(w: number, pitch: number, color: number): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, pitch);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
  return toonMesh(geo, color, { outline: 0.02 });
}

function windowPane(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  put(g, box(w + 0.16, h + 0.16, 0.06, Palette.cream, 0.012), 0, 0, 0);
  put(g, toonMesh(new THREE.BoxGeometry(w, h, 0.08), WINDOW_WARM, { emissive: 0x6a4a10, outline: false }), 0, 0, 0.01);
  put(g, box(0.05, h, 0.1, Palette.cream, false), 0, 0, 0.02);
  put(g, box(w, 0.05, 0.1, Palette.cream, false), 0, 0, 0.02);
  return g;
}

export interface ChaletOpts {
  w: number;
  d: number;
  h: number;
  wall: number;
  roof: number;
  trim?: number;
  sign?: string;
  chimney?: boolean;
}

/** Snowy chalet: log walls, steep roof, warm windows, optional chimney. */
export function chalet(o: ChaletOpts): { group: THREE.Group; chimneyTop: THREE.Vector3 | null } {
  const g = new THREE.Group();
  const { w, d, h } = o;
  const trim = o.trim ?? Palette.cream;
  put(g, box(w, h, d, o.wall, 0.04), 0, h / 2, 0);
  // Log bands.
  for (let y = 0.45; y < h - 0.2; y += 0.55) put(g, box(w + 0.06, 0.06, d + 0.06, LOG_DARK, false), 0, y, 0);
  // Stone footing.
  put(g, box(w + 0.2, 0.35, d + 0.2, ROCK, 0.025), 0, 0.17, 0);
  const pitch = w * 0.55;
  g.add(snowRoof(w, d, pitch, o.roof, h));
  for (const z of [d / 2 - 0.02, -d / 2 - 0.1]) put(g, gable(w, pitch, o.wall), 0, h, z);
  const fz = d / 2 + 0.05;
  // Door with a little canopy and a wreath-free porch light.
  put(g, box(0.85, 1.45, 0.08, LOG_DARK, 0.015), 0, 0.72 + 0.17, fz);
  put(g, box(1.05, 0.1, 0.6, o.roof, 0.015), 0, 1.75, fz + 0.25);
  put(g, toonMesh(new THREE.SphereGeometry(0.06, 8, 6), Palette.yellow, { emissive: 0x806000, outline: false }), 0.6, 1.5, fz + 0.04);
  for (const x of [-1, 1]) put(g, windowPane(0.7, 0.7), x * w * 0.3, 1.4, fz + 0.02);
  if (h > 3) put(g, windowPane(0.7, 0.6), 0, h - 0.55, fz + 0.02);
  else put(g, windowPane(0.5, 0.5), 0, h + pitch * 0.35, fz + 0.08);
  // Shutters.
  for (const x of [-1, 1]) for (const s of [-1, 1]) put(g, box(0.18, 0.78, 0.05, trim, 0.01), x * w * 0.3 + s * 0.52, 1.4, fz + 0.03);
  if (o.sign) put(g, signPlane(o.sign, Math.min(w * 0.7, 3), 0.5, '#fff6e6', '#5a4a7a', 36), 0, h > 3 ? 2.35 : h - 0.1, fz + 0.12);
  // Snow banked against the front.
  for (const x of [-1, 1]) {
    const bank = put(g, toonMesh(new THREE.SphereGeometry(0.6, 10, 6), SNOW, { outline: 0.02 }), x * (w / 2 - 0.2), 0.05, fz + 0.2);
    bank.scale.set(1.2, 0.45, 0.8);
  }
  let chimneyTop: THREE.Vector3 | null = null;
  if (o.chimney) {
    const cx = w * 0.22;
    const ch = h + pitch * 0.75;
    put(g, box(0.55, ch - h + 0.8, 0.55, ROCK_DARK, 0.02), cx, h + (ch - h + 0.8) / 2 - 0.2, -d * 0.15);
    put(g, box(0.68, 0.18, 0.68, SNOW, 0.015), cx, ch + 0.3, -d * 0.15);
    chimneyTop = new THREE.Vector3(cx, ch + 0.4, -d * 0.15);
  }
  return { group: g, chimneyTop };
}

/** The big ski lodge: an A-frame hall with a deck, sign and a tall chimney. */
export function lodge(): { group: THREE.Group; chimneyTop: THREE.Vector3 } {
  const g = new THREE.Group();
  const w = 6.4;
  const d = 4;
  const h = 2.6;
  put(g, box(w + 0.3, 0.4, d + 0.3, ROCK, 0.03), 0, 0.2, 0);
  put(g, box(w, h, d, 0xf0c6a8, 0.04), 0, h / 2 + 0.2, 0);
  for (let y = 0.7; y < h; y += 0.55) put(g, box(w + 0.06, 0.07, d + 0.06, LOG, false), 0, y, 0);
  const pitch = 3.4;
  g.add(snowRoof(w, d, pitch, 0xa77ec0, h + 0.2));
  // Big glass gable front: the A-frame's signature.
  const fz = d / 2;
  put(g, gable(w, pitch, 0xf0c6a8), 0, h + 0.2, fz - 0.1);
  const glass = new THREE.Shape();
  glass.moveTo(-1.6, 0);
  glass.lineTo(1.6, 0);
  glass.lineTo(0, 1.7 * 1.6 * (pitch / (w / 2)) * 0.5);
  glass.closePath();
  const gm = toonMesh(new THREE.ExtrudeGeometry(glass, { depth: 0.08, bevelEnabled: false }), WINDOW_WARM, { emissive: 0x6a4a10, outline: 0.015 });
  put(g, gm, 0, h + 0.4, fz + 0.04);
  for (const x of [-0.8, 0, 0.8]) put(g, box(0.06, 1.8, 0.1, Palette.cream, false), x, h + 0.4 + 0.9 - Math.abs(x) * 0.8, fz + 0.12).scale.y = 1 - Math.abs(x) * 0.6;
  for (const z of [-fz - 0.1]) put(g, gable(w, pitch, 0xf0c6a8), 0, h + 0.2, z);
  // Doors and ground-floor windows.
  put(g, box(1.4, 1.6, 0.08, LOG_DARK, 0.015), 0, 1.0, fz + 0.03);
  put(g, box(0.06, 1.6, 0.1, Palette.cream, false), 0, 1.0, fz + 0.06);
  for (const x of [-1, 1]) {
    put(g, windowPane(0.9, 0.8), x * 2.1, 1.4, fz + 0.03);
  }
  // Deck with railing across the front.
  put(g, box(w + 1, 0.18, 1.6, LOG, 0.02), 0, 0.45, fz + 0.8);
  for (let i = 0; i <= 10; i++) {
    const x = -w / 2 - 0.4 + (i / 10) * (w + 0.8);
    if (Math.abs(x) < 0.9) continue;
    put(g, box(0.08, 0.6, 0.08, LOG_DARK, false), x, 0.8, fz + 1.5);
  }
  for (const s of [-1, 1]) put(g, box(w / 2 - 0.5, 0.08, 0.1, LOG_DARK, 0.01), s * (w / 4 + 0.45), 1.08, fz + 1.5);
  put(g, signPlane('SKI LODGE', 3, 0.6, '#5a4a7a', '#fff6e6', 40), 0, h + 0.15, fz + 0.2);
  // Crossed skis by the door.
  for (const [x, c] of [
    [-1.05, Palette.coral],
    [-0.9, Palette.coral],
    [0.95, 0x7fa8ff],
    [1.1, 0x7fa8ff],
  ] as const) {
    const ski = put(g, box(0.1, 1.7, 0.05, c, 0.01), x, 1.3, fz + 0.15);
    ski.rotation.z = x < 0 ? 0.08 : -0.08;
  }
  // Chimney.
  const cx = -w * 0.28;
  put(g, box(0.8, 4.8, 0.8, ROCK_DARK, 0.025), cx, h + 2.2, -0.6);
  put(g, box(0.95, 0.22, 0.95, SNOW, 0.015), cx, h + 4.7, -0.6);
  return { group: g, chimneyTop: new THREE.Vector3(cx, h + 4.85, -0.6) };
}

/** Pine with three tiers and snow on each. */
export function pine(h = 3, color: number = PINE): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.12, 0.16, h * 0.25, LOG_DARK, 6, 0.015), 0, h * 0.12, 0);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const r = h * (0.36 - i * 0.08);
    const th = h * (0.42 - i * 0.06);
    const y = h * 0.2 + i * h * 0.24;
    put(g, toonMesh(new THREE.ConeGeometry(r, th, 7), color, { outline: 0.025 }), 0, y + th / 2, 0);
    put(g, toonMesh(new THREE.ConeGeometry(r * 0.55, th * 0.42, 7), SNOW, { outline: 0.015 }), 0, y + th * 0.8, 0);
  }
  return g;
}

/** The decorated pine in the village square, with strung lights. */
export function bigPine(lights: THREE.Mesh[]): THREE.Group {
  const g = pine(6.2, PINE_DARK);
  const cols = [Palette.coral, Palette.yellow, 0x7fd8ff, Palette.violet, Palette.green];
  for (let i = 0; i < 26; i++) {
    const k = i / 26;
    const y = 1.5 + k * 4;
    const r = (1 - (y - 1.2) / 5.4) * 2.1 + 0.08;
    const a = k * Math.PI * 7;
    const bulb = live(toonMesh(new THREE.SphereGeometry(0.1, 8, 6), cols[i % cols.length], { emissive: 0x333333, outline: false }));
    put(g, bulb, Math.cos(a) * r, y, Math.sin(a) * r);
    lights.push(bulb);
  }
  const star = put(g, toonMesh(new THREE.OctahedronGeometry(0.35, 0), Palette.yellow, { emissive: 0x806000, outline: 0.02 }), 0, 6.5, 0);
  star.scale.set(1, 1.3, 0.5);
  return g;
}

export function snowman(scarf: number = Palette.coral, hat = true): THREE.Group {
  const g = new THREE.Group();
  const balls: [number, number][] = [
    [0.55, 0.5],
    [0.42, 1.3],
    [0.3, 1.95],
  ];
  for (const [r, y] of balls) put(g, toonMesh(new THREE.SphereGeometry(r, 14, 10), SNOW, { outline: 0.025 }), 0, y, 0);
  const nose = put(g, toonMesh(new THREE.ConeGeometry(0.06, 0.32, 6), 0xff9a5a, { outline: 0.01 }), 0, 1.95, 0.42);
  nose.rotation.x = Math.PI / 2;
  for (const x of [-0.1, 0.1]) put(g, toonMesh(new THREE.SphereGeometry(0.04, 6, 4), Palette.ink, { outline: false }), x, 2.05, 0.26);
  for (const y of [1.2, 1.4, 1.6]) put(g, toonMesh(new THREE.SphereGeometry(0.045, 6, 4), Palette.ink, { outline: false }), 0, y, 0.41 - Math.abs(y - 1.3) * 0.2);
  put(g, toonMesh(new THREE.TorusGeometry(0.27, 0.07, 6, 14), scarf, { outline: 0.012 }), 0, 1.68, 0).rotation.x = Math.PI / 2;
  put(g, box(0.14, 0.45, 0.05, scarf, 0.01), 0.15, 1.45, 0.25).rotation.z = 0.2;
  for (const s of [-1, 1]) {
    const arm = put(g, cyl(0.025, 0.03, 0.8, LOG_DARK, 5, 0.01), s * 0.65, 1.45, 0);
    arm.rotation.z = s * 1.0;
  }
  if (hat) {
    put(g, cyl(0.32, 0.32, 0.05, Palette.ink, 12, 0.01), 0, 2.2, 0);
    put(g, cyl(0.2, 0.2, 0.35, Palette.ink, 12, 0.012), 0, 2.38, 0);
    put(g, cyl(0.205, 0.205, 0.07, scarf, 12, false), 0, 2.27, 0);
  }
  return g;
}

/** Igloo: a dome of ice blocks with an entrance tunnel. */
export function igloo(r = 1.6): THREE.Group {
  const g = new THREE.Group();
  put(g, toonMesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), SNOW, { outline: 0.03 }), 0, 0, 0);
  // Block seams as thin rings.
  for (let i = 1; i < 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    const ring = put(g, new THREE.Mesh(new THREE.TorusGeometry(r * Math.cos(a) + 0.01, 0.025, 4, 28), toon(SNOW_SHADE)), 0, r * Math.sin(a), 0);
    ring.rotation.x = Math.PI / 2;
  }
  const tunnel = put(g, toonMesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12, 1, false, 0, Math.PI), SNOW, { outline: 0.02 }), 0, 0, r - 0.1);
  tunnel.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  put(g, toonMesh(new THREE.CircleGeometry(0.45, 12, 0, Math.PI), 0x5a5a8a, { outline: false }), 0, 0.01, r + 0.51);
  return g;
}

/** Snow-capped boulder. */
export function snowRock(s = 1, color: number = ROCK): THREE.Group {
  const g = new THREE.Group();
  const r = put(g, toonMesh(new THREE.DodecahedronGeometry(0.8, 0), color, { outline: 0.03 }), 0, 0.45, 0);
  r.scale.set(1.2, 0.8, 1);
  const cap = put(g, toonMesh(new THREE.DodecahedronGeometry(0.62, 0), SNOW, { outline: 0.02 }), 0, 0.82, 0);
  cap.scale.set(1.25, 0.38, 1.05);
  g.scale.setScalar(s);
  return g;
}

/** Long low rocky outcrop with snow along the top. */
export function ridge(len: number, h: number, rand: () => number): THREE.Group {
  const g = new THREE.Group();
  let x = -len / 2;
  while (x < len / 2) {
    const w = 1.6 + rand() * 1.8;
    const hh = h * (0.55 + rand() * 0.6);
    const z = rand() * 1.4 - 0.7;
    const ry = rand() * 3;
    const rock = put(g, toonMesh(new THREE.DodecahedronGeometry(1, 0), rand() < 0.5 ? ROCK : ROCK_DARK, { outline: 0.04 }), x + w / 2, hh * 0.45, z, ry);
    rock.scale.set(w * 0.6, hh * 0.6, 1.2 + rand() * 0.6);
    const cap = put(g, toonMesh(new THREE.DodecahedronGeometry(1, 0), SNOW, { outline: 0.025 }), x + w / 2, hh * 0.95, z, ry);
    cap.scale.set(w * 0.42, hh * 0.14, 0.9);
    x += w * 0.7;
  }
  return g;
}

/** Glowing ice crystal cluster. */
export function crystals(color: number = 0x9fe8ff, s = 1): THREE.Group {
  const g = new THREE.Group();
  const spikes: [number, number, number, number][] = [
    [0, 0, 1.4, 0],
    [0.35, 0.15, 0.9, 0.4],
    [-0.3, 0.1, 1, -0.35],
    [0.1, -0.35, 0.7, 0.2],
    [-0.2, -0.25, 0.6, -0.5],
  ];
  for (const [x, z, h, tilt] of spikes) {
    const c = put(g, toonMesh(new THREE.ConeGeometry(0.18, h, 6), color, { emissive: 0x1a4a5a, outline: 0.015 }), x, h / 2 - 0.05, z);
    c.rotation.z = tilt;
    c.rotation.x = z * 0.6;
  }
  g.scale.setScalar(s);
  return g;
}

/** Mouth of the ice cave: a rocky hill with a dark arch, icicles and crystals. */
export function iceCave(glows: THREE.Sprite[]): THREE.Group {
  const g = new THREE.Group();
  // A rocky mound piled from boulders, snow on the high ones.
  const rocks: [number, number, number, number, number, number, boolean][] = [
    [-2.1, 0.9, 1.0, 1.7, 1.5, 1.6, false],
    [2.1, 0.8, 1.0, 1.6, 1.4, 1.6, false],
    [0, 1.3, -0.6, 3.2, 2.4, 2.2, true],
    [-2.6, 1.1, -1.4, 1.6, 1.6, 1.6, true],
    [2.5, 1.0, -1.4, 1.5, 1.5, 1.5, true],
    [-0.4, 3.1, -1.2, 1.6, 1.0, 1.4, true],
    [1.2, 2.6, 0.2, 1.1, 0.8, 1.0, true],
  ];
  rocks.forEach(([x, y, z, sx, sy, sz, snowy], i) => {
    const r = put(g, toonMesh(new THREE.DodecahedronGeometry(1, 0), i % 2 ? ROCK : ROCK_DARK, { outline: 0.04 }), x, y, z, i * 0.7);
    r.scale.set(sx, sy, sz);
    if (snowy) {
      const cap = put(g, toonMesh(new THREE.DodecahedronGeometry(1, 0), SNOW, { outline: 0.025 }), x, y + sy * 0.72, z, i * 0.7);
      cap.scale.set(sx * 0.8, sy * 0.32, sz * 0.8);
    }
  });
  // Dark hollow behind the mouth.
  put(g, box(2.4, 2.1, 0.8, 0x3f4a7a, false), 0, 1.05, 1.6);
  const arch = new THREE.Shape();
  arch.moveTo(-1.1, 0);
  arch.lineTo(-1.1, 1.0);
  arch.absarc(0, 1.0, 1.1, Math.PI, 0, true);
  arch.lineTo(1.1, 0);
  arch.closePath();
  put(g, toonMesh(new THREE.ShapeGeometry(arch), 0x3f4a7a, { outline: false }), 0, 0.02, 2.62);
  const rim = put(g, toonMesh(new THREE.TorusGeometry(1.2, 0.18, 6, 14, Math.PI), ICE, { outline: 0.02 }), 0, 1.0, 2.6);
  rim.scale.set(1, 1, 0.6);
  for (const x of [-1.2, 1.2]) put(g, box(0.36, 1.05, 0.3, ICE, 0.02), x, 0.5, 2.6);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI - (i / 8) * Math.PI;
    const h = 0.3 + ((i * 5) % 4) * 0.12;
    const ic = put(g, toonMesh(new THREE.ConeGeometry(0.07, h, 5), ICE, { outline: false }), Math.cos(a) * 1.05, 1.0 + Math.sin(a) * 1.05 - h / 2, 2.7);
    ic.rotation.x = Math.PI;
  }
  put(g, crystals(0x9fe8ff, 0.9), -2.4, 0, 2.3);
  put(g, crystals(0xc8b4ff, 0.7), 2.3, 0, 2.2);
  put(g, crystals(0x9fe8ff, 0.6), 1.6, 2.9, 0.1);
  const glow = live(glowSprite(0x8fe0ff, 2.6, 0.7));
  put(g, glow, 0, 0.9, 2.5);
  glows.push(glow);
  put(g, signPlane('ICE CAVE', 1.5, 0.42, '#5a4a7a', '#bfe6f7', 34), 0, 2.45, 2.75);
  return g;
}

/** Ice fishing hut with a hole and a little rod. */
export function fishingHut(color: number): { group: THREE.Group; bob: THREE.Object3D } {
  const g = new THREE.Group();
  put(g, box(1.4, 1.3, 1.2, color, 0.03), 0, 0.65, 0);
  g.add(snowRoof(1.4, 1.2, 0.6, 0x7a6a9a, 1.3));
  put(g, box(0.5, 0.9, 0.06, LOG_DARK, 0.012), 0, 0.45, 0.61);
  put(g, toonMesh(new THREE.CircleGeometry(0.3, 14), ICE_DEEP, { outline: false }), 0.9, 0.02, 0.9).rotation.x = -Math.PI / 2;
  put(g, toonMesh(new THREE.TorusGeometry(0.3, 0.06, 5, 14), SNOW, { outline: 0.01 }), 0.9, 0.03, 0.9).rotation.x = Math.PI / 2;
  put(g, box(0.4, 0.3, 0.3, Palette.coral, 0.01), 1.4, 0.15, 0.4);
  const rod = put(g, cyl(0.02, 0.02, 1.3, LOG_DARK, 4, false), 1.25, 0.6, 0.6);
  rod.rotation.set(0.3, 0, 0.7);
  const bob = live(put(new THREE.Group(), toonMesh(new THREE.SphereGeometry(0.06, 8, 6), Palette.coral, { outline: 0.008 }), 0.9, 0.05, 0.9));
  g.add(bob);
  return { group: g, bob };
}

/** Penguin with flippers that can flap. */
export function penguin(): THREE.Group {
  const g = new THREE.Group();
  const body = put(g, toonMesh(new THREE.SphereGeometry(0.32, 12, 10), 0x4a4a7a, { outline: 0.02 }), 0, 0.42, 0);
  body.scale.set(1, 1.35, 0.95);
  const belly = put(g, toonMesh(new THREE.SphereGeometry(0.26, 12, 10), Palette.cream, { outline: false }), 0, 0.4, 0.09);
  belly.scale.set(0.95, 1.3, 0.85);
  const head = put(g, toonMesh(new THREE.SphereGeometry(0.2, 12, 10), 0x4a4a7a, { outline: 0.02 }), 0, 0.88, 0.02);
  for (const x of [-0.08, 0.08]) {
    put(head, toonMesh(new THREE.SphereGeometry(0.05, 6, 4), 0xffffff, { outline: false }), x, 0.04, 0.16);
    put(head, toonMesh(new THREE.SphereGeometry(0.025, 6, 4), Palette.ink, { outline: false }), x, 0.04, 0.2);
  }
  const beak = put(head, toonMesh(new THREE.ConeGeometry(0.05, 0.14, 6), Palette.yellow, { outline: 0.008 }), 0, -0.02, 0.22);
  beak.rotation.x = Math.PI / 2;
  for (const x of [-0.1, 0.1]) {
    const foot = put(g, box(0.12, 0.04, 0.16, 0xffa65c, false), x, 0.02, 0.08);
    foot.castShadow = false;
  }
  const flippers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = put(new THREE.Group(), new THREE.Group(), side * 0.3, 0.62, 0);
    const f = toonMesh(new THREE.BoxGeometry(0.06, 0.38, 0.18), 0x4a4a7a, { outline: 0.01 });
    f.position.y = -0.18;
    pivot.add(f);
    pivot.userData.side = side;
    g.add(pivot);
    flippers.push(pivot);
  }
  g.userData.flippers = flippers;
  g.userData.head = head;
  return g;
}

/** Little skier: puffy jacket, beanie, skis and poles. */
export function skier(jacket: number, hat: number): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.12, 0.12]) {
    const ski = put(g, box(0.08, 0.03, 1.1, hat, 0.01), x, 0.02, 0.05);
    ski.castShadow = false;
    put(g, cyl(0.06, 0.06, 0.4, 0x5a5a8a, 6, 0.01), x, 0.24, 0);
  }
  const torso = put(g, toonMesh(new THREE.SphereGeometry(0.22, 10, 8), jacket, { outline: 0.015 }), 0, 0.6, 0);
  torso.scale.set(1, 1.2, 0.9);
  put(g, toonMesh(new THREE.SphereGeometry(0.15, 10, 8), 0xf2c6a0, { outline: 0.012 }), 0, 0.95, 0.02);
  put(g, toonMesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hat, { outline: 0.01 }), 0, 0.98, 0);
  put(g, toonMesh(new THREE.SphereGeometry(0.06, 6, 4), SNOW, { outline: false }), 0, 1.16, 0);
  put(g, box(0.24, 0.07, 0.05, 0x5a5a8a, false), 0, 0.97, 0.15);
  for (const s of [-1, 1]) {
    const pole = put(g, cyl(0.015, 0.015, 0.8, 0x5a5a8a, 4, false), s * 0.28, 0.4, -0.1);
    pole.rotation.x = -0.4;
  }
  return g;
}

/** Shaggy snow beast that peeks out from behind rocks. */
export function yeti(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0xf8f4ff;
  const body = put(g, toonMesh(new THREE.SphereGeometry(1, 14, 10), fur, { outline: 0.04 }), 0, 1.4, 0);
  body.scale.set(1, 1.3, 0.85);
  const face = put(g, toonMesh(new THREE.SphereGeometry(0.5, 12, 8), 0x9ab8f0, { outline: 0.02 }), 0, 2.15, 0.62);
  face.scale.set(1.1, 0.85, 0.5);
  for (const x of [-0.2, 0.2]) {
    put(g, toonMesh(new THREE.SphereGeometry(0.12, 8, 6), 0xffffff, { outline: 0.01 }), x, 2.25, 0.82);
    put(g, toonMesh(new THREE.SphereGeometry(0.06, 6, 4), Palette.ink, { outline: false }), x, 2.25, 0.92);
  }
  put(g, box(0.3, 0.06, 0.05, Palette.ink, false), 0, 1.98, 0.86);
  for (const x of [-0.12, 0.12]) put(g, box(0.07, 0.08, 0.04, 0xffffff, false), x, 1.94, 0.87);
  // Tufts on top.
  for (let i = 0; i < 5; i++) {
    const t = put(g, toonMesh(new THREE.ConeGeometry(0.16, 0.45, 6), fur, { outline: 0.012 }), (i - 2) * 0.2, 2.75 - Math.abs(i - 2) * 0.08, 0.1);
    t.rotation.z = (2 - i) * 0.3;
  }
  const arms: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = put(new THREE.Group(), new THREE.Group(), side * 0.9, 1.9, 0);
    const a = toonMesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), fur, { outline: 0.025 });
    a.position.y = -0.55;
    pivot.add(a);
    pivot.userData.side = side;
    g.add(pivot);
    arms.push(pivot);
  }
  g.userData.arms = arms;
  return g;
}

/** Lift pylon: a lattice tower with a crossbar for the cable. */
export function liftTower(h: number): THREE.Group {
  const g = new THREE.Group();
  put(g, box(0.4, h, 0.4, 0x8f88bf, 0.02), 0, h / 2, 0);
  for (let y = 1; y < h - 0.5; y += 1.2) {
    const brace = put(g, box(0.06, 1.4, 0.44, 0x6f68a0, false), 0, y, 0);
    brace.rotation.z = 0.5 * (Math.floor(y) % 2 ? 1 : -1);
  }
  put(g, box(3, 0.22, 0.3, 0x6f68a0, 0.02), 0, h, 0);
  for (const x of [-1.25, 1.25]) put(g, cyl(0.16, 0.16, 0.12, Palette.ink, 10, false), x, h + 0.08, 0).rotation.x = Math.PI / 2;
  put(g, box(0.46, 0.18, 0.46, SNOW, 0.012), 0, h + 0.2, 0);
  return g;
}

/** Lift station hut with a big bullwheel. */
export function liftStation(sign?: string): { group: THREE.Group; wheel: THREE.Object3D } {
  const g = new THREE.Group();
  put(g, box(3.4, 2, 2.4, 0xc8d4f0, 0.03), 0, 1, 0);
  g.add(snowRoof(3.4, 2.4, 0.9, Palette.coral, 2));
  put(g, windowPane(1.2, 0.6), -0.6, 1.3, 1.22);
  put(g, box(0.7, 1.4, 0.08, LOG_DARK, 0.012), 0.9, 0.7, 1.22);
  // Bullwheel on a post beside the hut (axis vertical, chairs swing round it).
  put(g, cyl(0.2, 0.25, 3.2, 0x8f88bf, 8, 0.02), 0, 1.6, -2);
  const wheel = live(new THREE.Group());
  wheel.position.set(0, 3.3, -2);
  wheel.add(toonMesh(new THREE.TorusGeometry(1.25, 0.12, 6, 18), 0x6f68a0, { outline: 0.015 }));
  (wheel.children[0] as THREE.Mesh).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const s = box(2.5, 0.08, 0.1, 0x6f68a0, false);
    s.rotation.y = (i / 3) * Math.PI;
    wheel.add(s);
  }
  g.add(wheel);
  if (sign) put(g, signPlane(sign, 2.4, 0.45, '#5a4a7a', '#fff6e6', 32), 0, 2.15, 1.24);
  return { group: g, wheel };
}

/** Two-seater chair hanging from the cable. Origin is the cable grip. */
export function liftChair(color: number): THREE.Group {
  const g = new THREE.Group();
  put(g, box(0.06, 1.3, 0.06, Palette.ink, false), 0, -0.65, 0);
  put(g, box(1, 0.1, 0.5, color, 0.012), 0, -1.35, 0.05);
  put(g, box(1, 0.5, 0.08, color, 0.012), 0, -1.1, -0.2);
  put(g, box(1.02, 0.05, 0.05, Palette.ink, false), 0, -0.9, 0.35);
  return g;
}

/** Steaming hot spring ringed with rocks. */
export function hotSpring(): { group: THREE.Group; steam: Smoke[] } {
  const g = new THREE.Group();
  const water = put(g, toonMesh(new THREE.CircleGeometry(2.2, 24), 0x9fe0e8, { outline: false }), 0, 0.06, 0);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1.3, 1, 1);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = put(g, toonMesh(new THREE.DodecahedronGeometry(0.45, 0), i % 2 ? ROCK : ROCK_DARK, { outline: 0.02 }), Math.cos(a) * 2.9, 0.18, Math.sin(a) * 2.25);
    r.scale.set(1.1, 0.65, 0.9);
    r.rotation.y = a;
    if (i % 3 === 0) {
      const c = put(g, toonMesh(new THREE.DodecahedronGeometry(0.32, 0), SNOW, { outline: 0.01 }), r.position.x, 0.46, r.position.z);
      c.scale.set(1.2, 0.4, 1);
    }
  }
  const steam: Smoke[] = [];
  for (const [x, z] of [
    [-0.8, 0.2],
    [0.9, -0.4],
    [0.1, 0.8],
  ]) {
    const s = new Smoke(5, 0.55, 3.2, 0.25, 0xffffff, new THREE.Vector3(0.15, 0, 0.05));
    s.group.position.set(x, 0.1, z);
    g.add(live(s.group));
    steam.push(s);
  }
  return { group: g, steam };
}

/** Hot cocoa stand with a striped awning. */
export function cocoaStand(): { group: THREE.Group; steam: Smoke } {
  const g = new THREE.Group();
  put(g, box(1.9, 1, 0.9, LOG, 0.025), 0, 0.5, 0);
  put(g, box(2.1, 0.1, 1.1, LOG_DARK, 0.015), 0, 1.03, 0);
  for (const x of [-0.9, 0.9]) put(g, cyl(0.05, 0.05, 1.3, LOG_DARK, 6, 0.01), x, 1.7, 0.4);
  for (let i = 0; i < 5; i++) {
    const s = put(g, box(0.42, 0.08, 1.2, i % 2 ? Palette.cream : Palette.coral, 0.012), -0.84 + i * 0.42, 2.38, 0.05);
    s.rotation.x = 0.28;
  }
  put(g, signPlane('COCOA', 1.4, 0.38, '#fff6e6', '#b0506a', 34), 0, 0.62, 0.46);
  put(g, cyl(0.25, 0.25, 0.45, 0xb8b4e0, 12, 0.015), -0.45, 1.3, 0);
  for (let i = 0; i < 3; i++) put(g, cyl(0.08, 0.07, 0.14, [Palette.coral, 0x7fa8ff, Palette.yellow][i], 8, 0.008), 0.2 + i * 0.22, 1.15, 0.15);
  const steam = new Smoke(4, 0.18, 0.9, 0.5, 0xffffff, new THREE.Vector3(0.1, 0, 0));
  steam.group.position.set(-0.45, 1.55, 0);
  g.add(live(steam.group));
  return { group: g, steam };
}

/** Lantern post: dark iron, warm glow, snow on the cap. */
export function lanternPost(glows: THREE.Sprite[]): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.06, 0.09, 2.3, 0x5a5a8a, 6, 0.015), 0, 1.15, 0);
  put(g, toonMesh(new THREE.BoxGeometry(0.3, 0.38, 0.3), WINDOW_WARM, { emissive: 0x806000, outline: 0.014 }), 0, 2.48, 0);
  put(g, toonMesh(new THREE.ConeGeometry(0.28, 0.24, 4), 0x5a5a8a, { outline: 0.012 }), 0, 2.78, 0).rotation.y = Math.PI / 4;
  put(g, toonMesh(new THREE.ConeGeometry(0.2, 0.1, 4), SNOW, { outline: false }), 0, 2.9, 0).rotation.y = Math.PI / 4;
  const glow = live(glowSprite(0xffd27a, 1.5, 0.8));
  put(g, glow, 0, 2.48, 0);
  glows.push(glow);
  return g;
}

/** Wooden sled. */
export function sled(color: number = Palette.coral): THREE.Group {
  const g = new THREE.Group();
  put(g, box(0.7, 0.08, 1.4, color, 0.015), 0, 0.3, 0);
  for (const x of [-0.3, 0.3]) {
    put(g, box(0.06, 0.06, 1.5, 0x5a5a8a, false), x, 0.06, 0);
    for (const z of [-0.45, 0.45]) put(g, box(0.06, 0.26, 0.06, 0x5a5a8a, false), x, 0.18, z);
    const tip = put(g, box(0.06, 0.06, 0.35, 0x5a5a8a, false), x, 0.16, 0.85);
    tip.rotation.x = -0.8;
  }
  return g;
}

/** Signpost with arrow boards. */
export function signpost(labels: string[]): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.07, 0.08, 2.4, LOG_DARK, 6, 0.015), 0, 1.2, 0);
  labels.forEach((t, i) => {
    const b = put(g, signPlane(t, 1.5, 0.34, '#fff6e6', '#5a4a7a', 30), 0, 2 - i * 0.45, 0.09);
    b.rotation.y = (i % 2 ? -1 : 1) * 0.25;
    b.position.x = (i % 2 ? -1 : 1) * 0.35;
  });
  put(g, toonMesh(new THREE.SphereGeometry(0.16, 8, 6), SNOW, { outline: 0.01 }), 0, 2.42, 0).scale.y = 0.5;
  return g;
}

/** Stack of firewood under a little snowy lean-to. */
export function woodpile(): THREE.Group {
  const g = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const log = put(g, cyl(0.16, 0.16, 1.2, i % 2 ? LOG : LOG_DARK, 8, 0.012), (i - (3 - row) / 2) * 0.33, 0.16 + row * 0.29, 0);
      log.rotation.x = Math.PI / 2;
    }
  }
  const cap = put(g, toonMesh(new THREE.SphereGeometry(0.6, 10, 6), SNOW, { outline: 0.015 }), 0, 0.95, 0);
  cap.scale.set(1, 0.25, 1.1);
  return g;
}

/** Ski rack with a few pairs of skis. */
export function skiRack(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1, 1]) put(g, box(0.1, 1.2, 0.1, LOG_DARK, 0.01), x, 0.6, 0);
  put(g, box(2.2, 0.1, 0.12, LOG_DARK, 0.01), 0, 1.15, 0);
  const cols = [Palette.coral, 0x7fa8ff, Palette.yellow, Palette.violet, Palette.green];
  cols.forEach((c, i) => {
    const s = put(g, box(0.09, 1.6, 0.04, c, 0.008), -0.8 + i * 0.4, 0.8, 0.1);
    s.rotation.x = -0.12;
  });
  return g;
}

/** Bunting of pennants strung between two points. */
export function pennants(a: THREE.Vector3, b: THREE.Vector3, sag = 0.5): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push(new THREE.Vector3().lerpVectors(a, b, u).setY(a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * sag));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: Palette.ink })));
  const cols = [Palette.coral, Palette.yellow, 0x7fd8ff, Palette.violet, Palette.green];
  const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  for (let i = 1; i < 12; i++) {
    const tri = toonMesh(new THREE.ConeGeometry(0.16, 0.4, 3), cols[i % cols.length], { outline: false });
    tri.rotation.set(Math.PI, yaw, 0);
    tri.position.copy(pts[i]).add(new THREE.Vector3(0, -0.2, 0));
    g.add(tri);
  }
  return g;
}

/** Archway over the trail: two log posts and a carved name board. */
export function welcomeArch(name: string): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-2.3, 2.3]) {
    put(g, cyl(0.24, 0.28, 4.4, LOG_DARK, 8, 0.025), x, 2.2, 0);
    put(g, toonMesh(new THREE.SphereGeometry(0.3, 10, 6), SNOW, { outline: 0.015 }), x, 4.45, 0).scale.y = 0.6;
  }
  put(g, box(5.4, 0.3, 0.3, LOG, 0.025), 0, 4.1, 0);
  put(g, box(5.2, 0.16, 0.42, SNOW, 0.015), 0, 4.32, 0);
  put(g, signPlane(name, 4, 0.8, '#5a4a7a', '#fff6e6', 30), 0, 3.4, 0.17);
  put(g, box(4.2, 0.95, 0.2, LOG, 0.02), 0, 3.4, 0.04);
  for (let i = 0; i < 8; i++) {
    const h = 0.2 + ((i * 3) % 4) * 0.08;
    const ic = put(g, toonMesh(new THREE.ConeGeometry(0.06, h, 5), ICE, { outline: false }), -2.4 + (i / 7) * 4.8, 3.95 - h / 2, 0.15);
    ic.rotation.x = Math.PI;
  }
  return g;
}

/** Ski-jump ramp on the mountainside (built leaning down toward +z). */
export function skiJump(): THREE.Group {
  const g = new THREE.Group();
  const ramp = put(g, box(1.6, 0.25, 9, SNOW, 0.03), 0, 3, 0);
  ramp.rotation.x = 0.45;
  for (const s of [-1, 1]) {
    const rail = put(g, box(0.12, 0.4, 9, Palette.coral, 0.015), s * 0.86, 3.2, 0);
    rail.rotation.x = 0.45;
  }
  for (const [z, h] of [
    [-3.2, 4.8],
    [0, 3.1],
    [3, 1.3],
  ]) {
    for (const s of [-1, 1]) put(g, box(0.18, h, 0.18, 0x8f88bf, 0.015), s * 0.7, h / 2, z);
  }
  put(g, box(2.2, 0.2, 1.4, LOG, 0.02), 0, 5, -4.4);
  return g;
}
