import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { glowSprite } from './decor';
import { box, cyl, live, put } from './westernProps';

/*
 * Set pieces for the Jade Temple. Builders return groups facing +z (toward
 * the board camera). Anything that animates is tagged `live` and handed back
 * through the return value or `userData`; the rest gets baked by the board.
 */

export const STONE = 0xd6cfb8;
export const STONE_MID = 0xc4bca2;
export const STONE_DARK = 0xa89f88;
export const MOSS = 0x93d79a;
export const MOSS_DARK = 0x6fc489;
export const LEAF = 0x6cc98a;
export const LEAF_LIGHT = 0x9fe3a8;
export const JADE = 0x5fe0b8;
export const BARK = 0xb98a62;
export const BARK_DARK = 0x8a6448;
export const EARTH = 0xd8b88c;
export const CLAY = 0xe8a080;
export const ROPE = 0xe6cf9a;

const rockGeo = new THREE.DodecahedronGeometry(1, 0);

/** Thin moss cap that sits on top of a stone surface. */
function mossPad(w: number, d: number, color = MOSS): THREE.Mesh {
  return box(w, 0.08, d, color, 0.012);
}

/** A hanging vine: a few kinked segments with leaves along it. */
export function vine(len: number, seed = 0): THREE.Group {
  const g = new THREE.Group();
  len = Math.max(0.4, len);
  seed = Math.abs(seed);
  const segs = Math.max(2, Math.round(len / 0.6));
  const step = len / segs;
  let x = 0;
  for (let i = 0; i < segs; i++) {
    const nx = Math.sin(seed * 3.1 + i * 1.7) * 0.08;
    const s = put(g, cyl(0.035, 0.035, step, MOSS_DARK, 5, false), (x + nx) / 2, -step * (i + 0.5), 0);
    s.rotation.z = (nx - x) / step;
    x = nx;
    if (i % 2 === (seed & 1)) {
      const leaf = put(g, toonMesh(new THREE.SphereGeometry(0.12, 6, 4), i % 3 ? MOSS : LEAF_LIGHT, { outline: 0.01 }), x + 0.08, -step * (i + 0.6), 0.04);
      leaf.scale.set(1, 0.45, 0.7);
      leaf.rotation.z = 0.6;
    }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* The temple                                                          */
/* ------------------------------------------------------------------ */

export interface Pyramid {
  group: THREE.Group;
  idol: THREE.Object3D;
  glows: THREE.Sprite[];
  flames: THREE.Object3D[];
  /** Height of the top platform. */
  top: number;
}

/** The great stepped pyramid: five tiers, a front stair, a shrine and the jade idol. */
export function pyramid(): Pyramid {
  const g = new THREE.Group();
  const tiers = 5;
  const tierH = 1.25;
  const w0 = 12;
  const d0 = 10;
  const shades = [STONE, STONE_MID, STONE, STONE_MID, STONE];
  for (let i = 0; i < tiers; i++) {
    const w = w0 - i * 2;
    const d = d0 - i * 1.7;
    const y = i * tierH;
    put(g, box(w, tierH, d, shades[i], 0.05), 0, y + tierH / 2, 0);
    // A carved band along each tier's face.
    put(g, box(w + 0.06, 0.22, d + 0.06, i % 2 ? CLAY : 0xe8c890, false), 0, y + tierH * 0.72, 0);
    // Moss creeping over the tier's ledge.
    for (let k = 0; k < 3; k++) {
      const mx = ((k - 1) * w) / 3.4 + Math.sin(i * 7 + k) * 0.6;
      put(g, mossPad(1.2 + ((i + k) % 3) * 0.5, 0.7, (i + k) % 2 ? MOSS : MOSS_DARK), mx, y + tierH + 0.03, d / 2 - 0.55 - ((k + i) % 2) * 0.3);
    }
    // Vines spilling down the front and sides.
    for (const vx of [-w / 2 + 0.6, w / 2 - 0.9]) {
      put(g, vine(tierH * (0.6 + (Math.abs(i * 3 + Math.round(vx)) % 3) * 0.3), i + Math.round(vx)), vx, y + tierH, d / 2 + 0.03);
    }
    put(g, vine(tierH * 0.8, i + 9), -w / 2 - 0.03, y + tierH, d * 0.2, Math.PI / 2);
    put(g, vine(tierH * 0.9, i + 4), w / 2 + 0.03, y + tierH, -d * 0.15, -Math.PI / 2);
  }
  const top = tiers * tierH;

  // Front stair from the plaza to the top platform.
  const stairW = 3;
  const steps = 15;
  const run = (d0 / 2 - (d0 - (tiers - 1) * 1.7) / 2) + 1.2;
  for (let i = 0; i < steps; i++) {
    const h = ((i + 1) / steps) * top;
    const z = d0 / 2 + 1.2 - (i / steps) * run;
    put(g, box(stairW, h, run / steps + 0.02, i % 2 ? STONE : 0xe2dcc8, 0.02), 0, h / 2, z - run / steps / 2);
  }
  // Stair-side balustrades with serpent-head caps.
  for (const side of [-1, 1]) {
    const rail = put(g, box(0.5, 0.5, Math.hypot(run, top) + 0.3, STONE_DARK, 0.03), side * (stairW / 2 + 0.25), top / 2 + 0.2, d0 / 2 + 1.2 - run / 2);
    rail.rotation.x = Math.atan2(top, run);
    const head = put(g, new THREE.Group(), side * (stairW / 2 + 0.25), 0.45, d0 / 2 + 1.5);
    put(head, box(0.7, 0.7, 0.9, JADE, 0.03), 0, 0, 0);
    put(head, box(0.72, 0.18, 0.5, 0x3fb890, 0.02), 0, -0.18, 0.25);
    for (const ex of [-0.22, 0.22]) put(head, box(0.14, 0.14, 0.05, Palette.ink, false), ex, 0.15, 0.46);
    put(head, box(0.12, 0.25, 0.04, Palette.coral, false), 0, -0.4, 0.43);
  }

  // The shrine on top.
  const shrine = put(g, new THREE.Group(), 0, top, -0.4);
  put(shrine, box(4.2, 2.2, 3.2, STONE_MID, 0.04), 0, 1.1, 0);
  put(shrine, box(4.6, 0.4, 3.6, CLAY, 0.04), 0, 2.4, 0);
  put(shrine, box(3.6, 0.6, 2.8, STONE, 0.04), 0, 2.9, 0);
  put(shrine, box(2.2, 0.5, 1.6, JADE, 0.03), 0, 3.45, 0);
  // Roof comb with notches.
  for (let i = 0; i < 5; i++) put(shrine, box(0.4, 0.7, 0.3, i % 2 ? STONE : STONE_MID, 0.02), -1.6 + i * 0.8, 4.0, 0);
  put(shrine, box(1.5, 1.6, 0.1, 0x4a4060, false), 0, 0.8, 1.6);
  for (const x of [-1.2, 1.2]) put(shrine, box(0.5, 2.2, 0.3, STONE, 0.02), x, 1.1, 1.62);
  put(shrine, vine(1.4, 3), -1.9, 2.2, 1.62);
  put(shrine, vine(1.1, 6), 1.7, 2.2, 1.62);

  // The jade idol sits in the doorway, glowing.
  const idol = live(new THREE.Group());
  put(shrine, idol, 0, 0.1, 1.2);
  put(idol, box(0.7, 0.2, 0.5, STONE_DARK, 0.015), 0, 0.1, 0);
  const idolMat = toon(JADE, { emissive: 0x1a6050 });
  const body = put(idol, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.36), idolMat), 0, 0.48, 0);
  const head = put(idol, new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.42), idolMat), 0, 0.98, 0);
  for (const m of [body, head]) m.castShadow = true;
  for (const ex of [-0.14, 0.14]) put(idol, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff6a8 })), ex, 1.02, 0.22);
  put(idol, new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), idolMat), 0, 1.28, 0);
  const glows: THREE.Sprite[] = [];
  const glow = live(glowSprite(0x7fffd0, 3.2, 0.7));
  put(shrine, glow, 0, 1.1, 1.4);
  glows.push(glow);

  // Fire bowls flanking the stair base and the shrine.
  const flames: THREE.Object3D[] = [];
  const bowls: [number, number, number, number][] = [
    [-2.6, 0, d0 / 2 + 1.7, 1],
    [2.6, 0, d0 / 2 + 1.7, 1],
    [-2.5, top, 1.3, 0.8],
    [2.5, top, 1.3, 0.8],
  ];
  for (const [x, y, z, s] of bowls) {
    const b = fireBowl();
    b.group.scale.setScalar(s);
    put(g, b.group, x, y, z);
    flames.push(b.flame);
    glows.push(b.glow);
  }
  return { group: g, idol, glows, flames, top };
}

/** Stone brazier on a short pillar. */
export function fireBowl(): { group: THREE.Group; flame: THREE.Object3D; glow: THREE.Sprite } {
  const g = new THREE.Group();
  put(g, box(0.5, 0.9, 0.5, STONE_DARK, 0.02), 0, 0.45, 0);
  put(g, cyl(0.42, 0.24, 0.32, STONE, 8, 0.02), 0, 1.06, 0);
  const flame = live(new THREE.Group());
  put(g, flame, 0, 1.2, 0);
  for (const [c, s, y] of [
    [0xff8a4a, 0.3, 0.28],
    [0xffd23f, 0.18, 0.26],
  ] as const) {
    const f = put(flame, new THREE.Mesh(new THREE.ConeGeometry(s, s * 3, 6), toon(c, { emissive: c })), 0, y, 0);
    f.castShadow = false;
  }
  const glow = live(glowSprite(0xffa050, 2.2, 0.55));
  put(g, glow, 0, 1.6, 0);
  return { group: g, flame, glow };
}

/* ------------------------------------------------------------------ */
/* Ruins                                                               */
/* ------------------------------------------------------------------ */

/** Carved column; `broken` snaps it off at a slant. */
export function column(h: number, broken = false, seed = 0): THREE.Group {
  const g = new THREE.Group();
  put(g, box(1, 0.3, 1, STONE_DARK, 0.025), 0, 0.15, 0);
  const shaft = broken ? h * 0.6 : h;
  const drums = Math.max(1, Math.round(shaft / 0.9));
  for (let i = 0; i < drums; i++) {
    const d = put(g, cyl(0.36, 0.38, shaft / drums - 0.04, i % 2 ? STONE : STONE_MID, 10, 0.02), 0, 0.3 + (i + 0.5) * (shaft / drums), 0);
    d.rotation.y = i * 0.4;
  }
  if (broken) {
    const cap = put(g, cyl(0.3, 0.36, 0.3, STONE, 10, 0.02), 0.03, 0.3 + shaft + 0.08, 0);
    cap.rotation.z = 0.25;
  } else {
    put(g, box(0.95, 0.28, 0.95, STONE_MID, 0.025), 0, 0.3 + shaft + 0.14, 0);
    put(g, mossPad(0.7, 0.6), 0.1, 0.3 + shaft + 0.31, 0.05);
  }
  put(g, vine(Math.min(shaft, 1.6), seed), 0.37, 0.3 + shaft - 0.05, 0.1, 0.3);
  return g;
}

/** A column toppled on its side, broken into drums. */
export function fallenColumn(len: number): THREE.Group {
  const g = new THREE.Group();
  const drums = Math.max(2, Math.round(len / 1));
  for (let i = 0; i < drums; i++) {
    const d = put(g, cyl(0.36, 0.36, len / drums - 0.1, i % 2 ? STONE : STONE_MID, 10, 0.02), -len / 2 + (i + 0.5) * (len / drums), 0.36, (i % 2) * 0.12);
    d.rotation.set(0, i * 0.12, Math.PI / 2);
  }
  put(g, mossPad(0.9, 0.5), 0.2, 0.73, 0);
  return g;
}

/** Two pillars and a lintel, half swallowed by vines. */
export function ruinArch(w = 3.6, h = 3.4, label?: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const x = (side * w) / 2;
    put(g, box(0.9, 0.35, 0.9, STONE_DARK, 0.025), x, 0.17, 0);
    for (let i = 0; i < 3; i++) put(g, box(0.72, h / 3 - 0.04, 0.72, i % 2 ? STONE_MID : STONE, 0.025), x, 0.35 + (i + 0.5) * (h / 3), 0);
  }
  put(g, box(w + 1.3, 0.7, 1, STONE, 0.035), 0, h + 0.7, 0);
  put(g, box(w + 1.5, 0.18, 1.06, CLAY, false), 0, h + 0.55, 0);
  put(g, box(1.2, 0.5, 0.8, STONE_MID, 0.025), 0, h + 1.3, 0);
  put(g, mossPad(1.6, 0.9), -0.8, h + 1.09, 0);
  put(g, vine(2.2, 1), -w / 2 + 0.2, h + 0.4, 0.51);
  put(g, vine(1.4, 2), w / 2 - 0.5, h + 0.4, 0.51);
  put(g, vine(1.8, 5), 0.6, h + 0.4, 0.51);
  if (label) put(g, label, 0, h + 0.72, 0.52);
  return g;
}

/** A great carved stone face, crowned with moss and ferns. */
export function stoneHead(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(3.6, 0.5, 3.2, STONE_DARK, 0.04), 0, 0.25, 0);
  put(g, box(3, 3.4, 2.6, STONE_MID, 0.05), 0, 2.2, 0);
  // Brow, nose, cheeks, lips.
  put(g, box(3.1, 0.5, 0.5, STONE, 0.03), 0, 3.0, 1.2);
  put(g, box(0.7, 1.1, 0.6, STONE, 0.03), 0, 2.25, 1.4);
  put(g, box(0.95, 0.35, 0.7, STONE, 0.03), 0, 1.75, 1.4);
  put(g, box(1.6, 0.42, 0.5, CLAY, 0.03), 0, 1.15, 1.35);
  put(g, box(1.3, 0.08, 0.05, Palette.ink, false), 0, 1.15, 1.61);
  for (const side of [-1, 1]) {
    put(g, box(0.8, 0.42, 0.1, 0xfff6e6, false), side * 0.8, 2.6, 1.31);
    put(g, box(0.3, 0.32, 0.05, Palette.ink, false), side * 0.72, 2.58, 1.37);
    // Ear spools.
    const ear = put(g, cyl(0.5, 0.5, 0.35, JADE, 12, 0.03), side * 1.62, 2.3, 0.2);
    ear.rotation.z = Math.PI / 2;
  }
  // Headdress band and a moss crown.
  put(g, box(3.2, 0.5, 2.8, JADE, 0.04), 0, 3.6, 0);
  put(g, box(2.8, 0.25, 2.4, MOSS_DARK, 0.03), 0, 4.0, 0);
  for (const [x, z, s] of [
    [-0.9, 0.3, 0.7],
    [0.4, -0.4, 0.9],
    [1, 0.5, 0.6],
    [-0.2, 0.6, 0.55],
  ]) {
    const tuft = put(g, toonMesh(rockGeo, x > 0 ? MOSS : LEAF, { outline: 0.03 }), x, 4.2, z);
    tuft.scale.set(s, s * 0.6, s);
  }
  put(g, fern(1.1), -0.7, 4.1, -0.5);
  put(g, vine(2.4, 2), -1.45, 3.8, 1.0);
  put(g, vine(1.6, 7), 1.5, 3.8, 0.9);
  return g;
}

/** A coiled stone serpent on a plinth. */
export function serpentStatue(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(1.8, 0.5, 1.8, STONE_DARK, 0.03), 0, 0.25, 0);
  put(g, box(1.5, 0.3, 1.5, STONE, 0.025), 0, 0.65, 0);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    const a = k * Math.PI * 4.5;
    const r = 0.55 - k * 0.3;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.9 + k * 1.6, Math.sin(a) * r));
  }
  const tube = toonMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.2, 8), JADE, { outline: 0.03 });
  g.add(tube);
  const end = pts[pts.length - 1];
  const head = put(g, new THREE.Group(), end.x, end.y + 0.25, end.z);
  head.rotation.y = 0.3;
  put(head, box(0.5, 0.42, 0.7, JADE, 0.025), 0, 0, 0.1);
  put(head, box(0.52, 0.12, 0.45, 0x3fb890, 0.015), 0, -0.16, 0.22);
  for (const ex of [-0.17, 0.17]) put(head, box(0.1, 0.1, 0.05, Palette.ink, false), ex, 0.1, 0.45);
  put(head, box(0.06, 0.06, 0.25, Palette.coral, false), 0, -0.1, 0.55);
  return g;
}

/** Tumbled blocks of masonry. */
export function rubble(rand: () => number, n = 5): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = 0.4 + rand() * 0.5;
    const b = put(g, box(s * 1.4, s, s, rand() < 0.5 ? STONE : STONE_MID, 0.02), (rand() - 0.5) * 2.2, s / 2, (rand() - 0.5) * 1.6);
    b.rotation.set(0, rand() * 3, (rand() - 0.5) * 0.3);
    if (rand() < 0.4) put(g, mossPad(s * 1.1, s * 0.7), b.position.x, s + 0.03, b.position.z).rotation.y = b.rotation.y;
  }
  return g;
}

/** Crumbling watchtower, overgrown, with a tree growing out of its top. */
export function ruinTower(): THREE.Group {
  const g = new THREE.Group();
  const levels: [number, number, number][] = [
    [4, 2, STONE_MID],
    [3.4, 1.8, STONE],
    [2.9, 1.6, STONE_MID],
  ];
  let y = 0;
  for (const [w, h, c] of levels) {
    put(g, box(w, h, w, c, 0.04), 0, y + h / 2, 0);
    put(g, box(w + 0.1, 0.2, w + 0.1, CLAY, false), 0, y + h - 0.25, 0);
    y += h;
  }
  // Broken crenellations.
  for (const [x, z, hh] of [
    [-1.2, 1.2, 0.6],
    [0, 1.2, 0.4],
    [1.2, 1.2, 0.7],
    [-1.2, -1.2, 0.5],
    [1.2, -1.2, 0.3],
  ]) {
    put(g, box(0.6, hh, 0.5, STONE, 0.02), x, y + hh / 2, z);
  }
  // Window slots.
  for (const yy of [1.1, 2.9]) put(g, box(0.5, 0.8, 0.1, 0x4a4060, false), 0, yy, levels[0][0] / 2 + 0.01 - (yy > 2 ? 0.3 : 0));
  // A tree bursting out of the top.
  put(g, cyl(0.2, 0.3, 1.8, BARK, 7, 0.02), 0.3, y + 0.9, -0.2).rotation.z = -0.15;
  for (const [x, yy, z, r] of [
    [0.5, y + 2.2, -0.2, 1.3],
    [-0.5, y + 1.9, 0.3, 0.95],
    [1.3, y + 1.8, 0.2, 0.85],
  ]) {
    const p = put(g, toonMesh(new THREE.IcosahedronGeometry(1, 1), LEAF, { outline: 0.04 }), x, yy, z);
    p.scale.setScalar(r);
  }
  // Roots and vines creeping down the walls.
  for (const [x, z, len, ry] of [
    [-1.6, 2.02, 3.5, 0],
    [0.9, 2.02, 2.5, 0],
    [2.02, -0.6, 3, -Math.PI / 2],
    [-2.02, 0.4, 2.8, Math.PI / 2],
  ]) {
    put(g, vine(len, Math.round(len * 3)), x, y - 0.1, z, ry);
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Plants                                                              */
/* ------------------------------------------------------------------ */

const leafGeo = new THREE.SphereGeometry(0.5, 10, 6);

/** Fern: a rosette of arching fronds. */
export function fern(size = 1, color = LEAF): THREE.Group {
  const g = new THREE.Group();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 0.3;
    const f = put(g, toonMesh(leafGeo, i % 2 ? color : MOSS, { outline: 0.012 }), Math.cos(a) * 0.45 * size, 0.28 * size, Math.sin(a) * 0.45 * size);
    f.scale.set(1.1 * size, 0.08 * size, 0.28 * size);
    f.rotation.set(0, -a, 0.45);
  }
  return g;
}

/** Big broad-leaf plant (banana-ish): a few stems with huge leaves. */
export function bigLeaf(size = 1, rand: () => number = Math.random): THREE.Group {
  const g = new THREE.Group();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.6;
    const h = (1 + rand() * 0.6) * size;
    const stem = put(g, cyl(0.04 * size, 0.06 * size, h, LEAF, 5, false), Math.cos(a) * 0.15 * size, h / 2, Math.sin(a) * 0.15 * size);
    stem.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    const leaf = put(g, toonMesh(leafGeo, i % 2 ? LEAF_LIGHT : LEAF, { outline: 0.018 }), Math.cos(a) * 0.75 * size, h + 0.05, Math.sin(a) * 0.75 * size);
    leaf.scale.set(1.8 * size, 0.07 * size, 0.7 * size);
    leaf.rotation.set(0, -a, -0.35);
  }
  return g;
}

/** Spotted toadstool. */
export function mushroom(s = 1, cap: number = Palette.coral): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.08 * s, 0.11 * s, 0.35 * s, Palette.cream, 8, 0.012), 0, 0.17 * s, 0);
  const c = put(g, toonMesh(new THREE.SphereGeometry(0.26 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, { outline: 0.015 }), 0, 0.32 * s, 0);
  c.scale.y = 0.7;
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    put(g, toonMesh(new THREE.SphereGeometry(0.045 * s, 6, 4), 0xffffff, { outline: false }), Math.cos(a) * 0.15 * s, 0.44 * s, Math.sin(a) * 0.15 * s);
  }
  return g;
}

/** Tall jungle tree with buttress roots and a broad layered canopy. */
export function canopyTree(size: number, shade: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const colors = [0x7fd49a, 0x6cc98a, 0x8fe0a0, 0x79cfa8, 0x66c49a];
  const h = 3.4 * size;
  put(t, cyl(0.22 * size, 0.38 * size, h, BARK, 8, 0.025), 0, h / 2, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const r = put(t, box(0.12 * size, 0.6 * size, 0.7 * size, BARK_DARK, 0.015), Math.cos(a) * 0.3 * size, 0.28 * size, Math.sin(a) * 0.3 * size, -a);
    r.rotation.z = 0.05;
  }
  const col = colors[shade % colors.length];
  const puffs: [number, number, number, number][] = [
    [0, h + 0.2 * size, 0, 1.5],
    [1.1, h - 0.2 * size, 0.4, 1.05],
    [-1.05, h - 0.1 * size, -0.3, 1.1],
    [0.2, h + 0.1 * size, 1.0, 0.95],
    [-0.3, h + 0.9 * size, -0.2, 0.9],
  ];
  for (const [x, y, z, r] of puffs) {
    const p = put(t, toonMesh(new THREE.IcosahedronGeometry(1, 1), col, { outline: 0.04 }), x * size, y, z * size);
    p.scale.set(r * size, r * size * 0.75, r * size);
    p.rotation.y = rand() * 3;
  }
  if (rand() < 0.6) put(t, vine(h * 0.6, Math.floor(rand() * 9)), 0.9 * size, h - 0.4 * size, 0.6 * size);
  return t;
}

/** A tall mossy karst pillar for the horizon. */
export function karst(w: number, h: number, rand: () => number, outline: number | false = 0.06): THREE.Group {
  const g = new THREE.Group();
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const r = w * (1 - i * 0.12);
    put(g, toonMesh(new THREE.CylinderGeometry(r * 0.88, r, h / layers, 8), i % 2 ? 0xc8c0b0 : 0xd8d0bc, { outline }), (rand() - 0.5) * 0.3 * w, (i + 0.5) * (h / layers), 0);
  }
  const cap = put(g, toonMesh(new THREE.IcosahedronGeometry(1, 1), [0x7fd49a, 0x6cc98a, 0x8fe0a0][Math.floor(rand() * 3)], { outline }), 0, h, 0);
  cap.scale.set(w * 0.95, w * 0.55, w * 0.95);
  return g;
}

/* ------------------------------------------------------------------ */
/* Explorer camp                                                       */
/* ------------------------------------------------------------------ */

/** Ridge tent with a striped flysheet. */
export function tent(color: number = 0xf6c98a): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape([new THREE.Vector2(-1.2, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(0, 1.6)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false });
  geo.translate(0, 0, -1.3);
  put(g, toonMesh(geo, color, { outline: 0.03 }), 0, 0, 0);
  // Stripes down the flysheet.
  for (const side of [-1, 1]) {
    for (const z of [-0.85, 0, 0.85]) {
      const st = put(g, box(0.03, 1.98, 0.32, 0xf08a6a, false), side * (0.6 + 0.8 * 0.03), 0.8 + 0.6 * 0.03, z);
      st.rotation.z = side * Math.atan2(1.2, 1.6);
    }
  }
  put(g, box(0.9, 0.95, 0.05, 0x7a5e70, false), 0, 0.48, 1.31);
  for (const z of [-1.4, 1.4]) put(g, cyl(0.04, 0.04, 1.9, BARK_DARK, 5, 0.01), 0, 0.95, z);
  return g;
}

/** Folding table with a map and a lantern. */
export function mapTable(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(1.6, 0.08, 1, BARK, 0.015), 0, 0.8, 0);
  for (const [x, z] of [
    [-0.7, -0.4],
    [0.7, -0.4],
    [-0.7, 0.4],
    [0.7, 0.4],
  ])
    put(g, cyl(0.04, 0.04, 0.8, BARK_DARK, 5, 0.01), x, 0.4, z);
  const map = put(g, box(1.1, 0.02, 0.7, 0xfff0c8, false), 0.05, 0.85, 0);
  map.rotation.y = 0.15;
  put(g, box(0.12, 0.03, 0.12, Palette.coral, false), 0.25, 0.87, 0.1);
  put(g, cyl(0.1, 0.12, 0.25, 0x6b6488, 8, 0.01), -0.55, 0.97, -0.2);
  return g;
}

/** Wooden crate with rope lashing. */
export function crate(s = 0.7): THREE.Group {
  const g = new THREE.Group();
  put(g, box(s, s, s, 0xd9a878, 0.02), 0, s / 2, 0);
  put(g, box(s + 0.02, 0.06, s + 0.02, ROPE, false), 0, s * 0.62, 0);
  put(g, box(0.06, s + 0.02, s + 0.02, ROPE, false), 0, s / 2, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* Critters                                                            */
/* ------------------------------------------------------------------ */

/**
 * Monkey hanging from a vine. The returned pivot sits at the top of the
 * vine: swing it about z.
 */
export function swingingMonkey(len: number, fur = 0xb98a62): THREE.Group {
  const pivot = new THREE.Group();
  const rope = put(pivot, cyl(0.04, 0.04, len, MOSS_DARK, 5, 0.01), 0, -len / 2, 0);
  rope.castShadow = false;
  const m = put(pivot, new THREE.Group(), 0, -len, 0);
  const face = 0xf5d4b0;
  put(m, toonMesh(new THREE.SphereGeometry(0.26, 12, 8), fur, { outline: 0.018 }), 0, -0.45, 0).scale.set(1, 1.2, 0.9);
  put(m, toonMesh(new THREE.SphereGeometry(0.22, 12, 8), fur, { outline: 0.018 }), 0, -0.02, 0.05);
  put(m, toonMesh(new THREE.SphereGeometry(0.15, 10, 6), face, { outline: 0.012 }), 0, -0.06, 0.18).scale.set(1, 0.8, 0.6);
  for (const s of [-1, 1]) {
    put(m, toonMesh(new THREE.SphereGeometry(0.09, 8, 6), face, { outline: 0.012 }), s * 0.22, 0.02, 0.02);
    put(m, new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: Palette.ink })), s * 0.07, 0.02, 0.26);
    // Arms up to the vine, legs dangling.
    const arm = put(m, cyl(0.05, 0.05, 0.45, fur, 6, 0.012), s * 0.12, 0.05, 0);
    arm.rotation.z = s * 0.35;
    arm.position.y = -0.15;
    const leg = put(m, cyl(0.06, 0.06, 0.4, fur, 6, 0.012), s * 0.13, -0.78, 0);
    leg.rotation.z = -s * 0.25;
  }
  const tail = put(m, toonMesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12, Math.PI * 1.4), fur, { outline: 0.01 }), 0, -0.6, -0.25);
  tail.rotation.y = Math.PI / 2;
  return pivot;
}

/** Crocodile swimming low in the water: snout, eye bumps and a back ridge. */
export function crocodile(): THREE.Group {
  const g = new THREE.Group();
  const c = 0x5fae7a;
  put(g, box(0.8, 0.3, 2.2, c, 0.025), 0, 0, 0);
  put(g, box(0.55, 0.22, 1.1, c, 0.02), 0, -0.02, 1.55);
  put(g, box(0.4, 0.18, 1, c, 0.02), 0, -0.04, -1.5).rotation.y = 0.1;
  for (const s of [-1, 1]) {
    put(g, toonMesh(new THREE.SphereGeometry(0.12, 8, 6), c, { outline: 0.012 }), s * 0.2, 0.17, 0.8);
    put(g, toonMesh(new THREE.SphereGeometry(0.06, 6, 4), 0xfff6a8, { outline: false }), s * 0.2, 0.24, 0.88);
  }
  for (let i = 0; i < 5; i++) put(g, box(0.12, 0.14, 0.14, 0x6aad78, false), 0, 0.18, -0.9 + i * 0.4);
  // Little teeth peeking out.
  for (let i = 0; i < 3; i++) put(g, box(0.05, 0.06, 0.05, 0xffffff, false), 0.27, -0.12, 1.3 + i * 0.25);
  return g;
}

/** Butterfly: two flapping wings on a hinge. */
export function butterfly(color: number): { group: THREE.Group; wings: THREE.Object3D[] } {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const geo = new THREE.CircleGeometry(0.16, 8);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(geo, mat);
    w.rotation.x = -Math.PI / 2;
    w.position.x = s * 0.15;
    w.scale.set(1, 1.3, 1);
    pivot.add(w);
    pivot.userData.side = s;
    group.add(pivot);
    wings.push(pivot);
  }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.18, 2, 4), new THREE.MeshBasicMaterial({ color: Palette.ink }));
  body.rotation.x = Math.PI / 2;
  group.add(body);
  return { group, wings };
}

/** Lily pad with an optional flower. */
export function lilyPad(r: number, flower: boolean): THREE.Group {
  const g = new THREE.Group();
  const pad = put(g, toonMesh(new THREE.CylinderGeometry(r, r, 0.04, 14, 1, false, 0.4, Math.PI * 2 - 0.4), 0x7fd49a, { outline: 0.012 }), 0, 0, 0);
  pad.castShadow = false;
  if (flower) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const p = put(g, toonMesh(new THREE.SphereGeometry(0.09, 6, 4), Palette.rose, { outline: 0.008 }), Math.cos(a) * 0.07, 0.06, Math.sin(a) * 0.07);
      p.scale.set(1, 0.6, 0.55);
      p.rotation.y = -a;
    }
    put(g, toonMesh(new THREE.SphereGeometry(0.05, 6, 4), Palette.butter, { outline: false }), 0, 0.09, 0);
  }
  return g;
}
