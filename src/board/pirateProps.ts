import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Palette } from '../render/palette';
import { outline, toon, toonMesh } from '../render/toon';
import { glowSprite, Smoke, textTexture } from './decor';

/*
 * Props for Pirate Cove. Builders return plain groups; anything that moves
 * hands back the parts to animate. Static set dressing is collected under one
 * root and `bake`d into a few merged meshes so the busy island stays cheap.
 */

export const Wood = {
  light: 0xd9a878,
  mid: 0xc99a6b,
  warm: 0xb5784a,
  dark: 0x8a5a3b,
  hull: 0x9a6a4a,
  ghost: 0x8d8098,
};
export const STONE = 0xdcd4e6;
export const STONE_DARK = 0xbfb4d0;
const IRON = 0x4a4060;
const ROPE = 0x6b4f6e;
const LAMP = 0xffe38a;
const LAMP_GLOW = 0x5a4010;

// ------------------------------------------------------------------ baking

/**
 * Merges every opaque, untextured toon mesh under `root` into one mesh per
 * colour (with its ink outline), keeping sprites, textured meshes and the
 * like as they are. Hundreds of little props become a dozen draw calls.
 */
export function bake(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  const buckets = new Map<string, { color: number; emissive: number; side: THREE.Side; outline: number; ink: number; geos: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name === 'outline') return;
    if (o instanceof THREE.InstancedMesh) {
      keep.push(o);
      return;
    }
    const mat = (o as THREE.Mesh).material;
    if (o instanceof THREE.Mesh && mat instanceof THREE.MeshToonMaterial && !mat.map && !mat.transparent) {
      const hull = o.children.find((c) => c.name === 'outline') as THREE.Mesh | undefined;
      const hullMat = hull?.material as THREE.ShaderMaterial | undefined;
      const thickness = hullMat ? (hullMat.uniforms.thickness.value as number) : 0;
      const ink = hullMat ? (hullMat.uniforms.color.value as THREE.Color).getHex() : 0;
      const key = `${mat.color.getHex()}:${mat.emissive.getHex()}:${mat.side}:${thickness}:${ink}`;
      let b = buckets.get(key);
      if (!b) {
        b = { color: mat.color.getHex(), emissive: mat.emissive.getHex(), side: mat.side, outline: thickness, ink, geos: [] };
        buckets.set(key, b);
      }
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      b.geos.push(g);
    } else if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      keep.push(o);
    }
  });
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos);
    const mesh = new THREE.Mesh(geo, toon(b.color, { emissive: b.emissive }));
    (mesh.material as THREE.Material).side = b.side;
    mesh.castShadow = mesh.receiveShadow = true;
    if (b.outline > 0) outline(mesh, b.outline, b.ink);
    out.add(mesh);
  }
  for (const o of keep) {
    const c = o.clone(false);
    const hull = o.children.find((ch) => ch.name === 'outline');
    if (hull) c.add(hull.clone());
    o.matrixWorld.decompose(c.position, c.quaternion, c.scale);
    out.add(c);
  }
  return out;
}

// ------------------------------------------------------------------ plants

export function palmTree(height = 3): THREE.Group {
  const tree = new THREE.Group();
  const segs = 5;
  let lean = 0;
  for (let i = 0; i < segs; i++) {
    const seg = toonMesh(new THREE.CylinderGeometry(0.16 - i * 0.015, 0.2 - i * 0.015, height / segs, 10), 0xc99a6b, { outline: 0.02 });
    lean += 0.06;
    seg.position.set(lean * i * 0.6, (i + 0.5) * (height / segs), 0);
    seg.rotation.z = -lean * 0.5;
    tree.add(seg);
  }
  const top = new THREE.Vector3(lean * segs * 0.6, height, 0);
  const leafGeo = new THREE.SphereGeometry(0.5, 12, 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = toonMesh(leafGeo, Palette.green, { outline: 0.02 });
    leaf.scale.set(1.8, 0.18, 0.55);
    leaf.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 0.8, -0.15, Math.sin(a) * 0.8));
    leaf.rotation.set(0, -a, -0.45);
    tree.add(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const nut = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), 0x8a5a3b, { outline: 0.015 });
    nut.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2) * 0.18, -0.25, Math.sin(i * 2) * 0.18));
    tree.add(nut);
  }
  return bake(tree);
}

const JUNGLE = [0x7fd49a, 0x6cc98a, 0x8fe0a0, 0x79cfa8];
const canopyGeo = new THREE.IcosahedronGeometry(1, 1);

/** Round broadleaf tree for the jungle: a stubby trunk and a few puffs. */
export function jungleTree(size: number, shade: number): THREE.Group {
  const t = new THREE.Group();
  const trunk = toonMesh(new THREE.CylinderGeometry(0.16 * size, 0.24 * size, 1.6 * size, 7), Wood.warm, { outline: 0.02 });
  trunk.position.y = 0.8 * size;
  t.add(trunk);
  const color = JUNGLE[shade % JUNGLE.length];
  const puffs: [number, number, number, number][] = [
    [0, 2, 0, 1],
    [0.6, 1.7, 0.3, 0.7],
    [-0.55, 1.75, -0.2, 0.72],
    [0.1, 2.55, -0.1, 0.6],
  ];
  for (const [x, y, z, r] of puffs) {
    const p = toonMesh(canopyGeo, color, { outline: 0.04 });
    p.position.set(x * size, y * size, z * size);
    p.scale.setScalar(r * size);
    t.add(p);
  }
  return t;
}

// ------------------------------------------------------------------ cargo

export function barrel(): THREE.Group {
  const b = new THREE.Group();
  const body = toonMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 14), Wood.warm, { outline: 0.02 });
  body.position.y = 0.37;
  b.add(body);
  for (const y of [0.15, 0.6]) {
    const band = toonMesh(new THREE.TorusGeometry(0.33, 0.035, 6, 18), ROPE, { outline: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    b.add(band);
  }
  return b;
}

export function crate(size = 0.7): THREE.Group {
  const c = new THREE.Group();
  const box = toonMesh(new THREE.BoxGeometry(size, size, size), Wood.light, { outline: 0.02 });
  box.position.y = size / 2;
  c.add(box);
  for (const s of [-1, 1]) {
    const slat = toonMesh(new THREE.BoxGeometry(size * 1.02, size * 0.14, size * 1.02), Wood.warm, { outline: false });
    slat.position.y = size / 2 + s * size * 0.36;
    c.add(slat);
  }
  return c;
}

export function chest(open = false): THREE.Group {
  const c = new THREE.Group();
  const box = toonMesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), Wood.warm, { outline: 0.025 });
  box.position.y = 0.25;
  const lid = toonMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16, 1, false, 0, Math.PI), 0xa0663e, { outline: 0.025 });
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.5;
  if (open) {
    // Tipped back on its hinge, spilling gold.
    lid.rotation.set(-1.9, 0, Math.PI / 2);
    lid.position.set(0, 0.55, -0.42);
    const gold = toonMesh(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), Palette.yellow, { outline: 0.02, emissive: 0x221100 });
    gold.scale.set(1, 0.5, 0.66);
    gold.position.y = 0.48;
    c.add(gold);
  }
  const lock = toonMesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), Palette.yellow, { outline: 0.015 });
  lock.position.set(0, 0.48, 0.31);
  c.add(box, lid, lock);
  return c;
}

export function cannon(): THREE.Group {
  const g = new THREE.Group();
  const barrelMesh = toonMesh(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 12), IRON, { outline: 0.02 });
  barrelMesh.rotation.x = Math.PI / 2 - 0.15;
  barrelMesh.position.set(0, 0.42, 0.15);
  const carriage = toonMesh(new THREE.BoxGeometry(0.5, 0.25, 0.8), Wood.warm, { outline: 0.02 });
  carriage.position.y = 0.2;
  g.add(barrelMesh, carriage);
  for (const s of [-1, 1]) {
    for (const z of [-0.25, 0.25]) {
      const wheel = toonMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10), Wood.dark, { outline: 0.012 });
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(s * 0.29, 0.15, z);
      g.add(wheel);
    }
  }
  return g;
}

export function cannonballs(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.14, 10, 8);
  const spots: [number, number, number][] = [
    [-0.15, 0.14, -0.15], [0.15, 0.14, -0.15], [-0.15, 0.14, 0.15], [0.15, 0.14, 0.15], [0, 0.36, 0],
  ];
  for (const [x, y, z] of spots) {
    const b = toonMesh(geo, IRON, { outline: 0.012 });
    b.position.set(x, y, z);
    g.add(b);
  }
  return g;
}

export function anchor(): THREE.Group {
  const a = new THREE.Group();
  const shank = toonMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), IRON, { outline: 0.015 });
  shank.position.y = 0.7;
  const ring = toonMesh(new THREE.TorusGeometry(0.16, 0.04, 6, 14), IRON, { outline: 0.01 });
  ring.position.y = 1.5;
  const stock = toonMesh(new THREE.BoxGeometry(0.7, 0.08, 0.08), Wood.dark, { outline: 0.01 });
  stock.position.y = 1.25;
  const arms = toonMesh(new THREE.TorusGeometry(0.45, 0.06, 6, 16, Math.PI), IRON, { outline: 0.015 });
  arms.rotation.z = Math.PI;
  arms.position.y = 0.45;
  a.add(shank, ring, stock, arms);
  return a;
}

export function ropeCoil(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = toonMesh(new THREE.TorusGeometry(0.28 - i * 0.05, 0.05, 6, 16), 0xd8b880, { outline: 0.01 });
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.05 + i * 0.09;
    g.add(r);
  }
  return g;
}

/** A pole with a fishing net slung over it to dry. */
export function netRack(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.9, 0.9]) {
    const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), Wood.dark, { outline: 0.012 });
    pole.position.set(x, 0.8, 0);
    g.add(pole);
  }
  const bar = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), Wood.dark, { outline: 0.01 });
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.55;
  const net = toonMesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 10, 1, true, -0.6, 1.2), 0x7fb8b0, { outline: 0.01 });
  (net.material as THREE.Material).side = THREE.DoubleSide;
  net.rotation.set(0, Math.PI / 2, Math.PI / 2);
  net.scale.set(0.4, 1, 1);
  net.position.set(0, 1.2, 0.1);
  g.add(bar, net);
  for (const x of [-0.5, 0.1, 0.6]) {
    const float = toonMesh(new THREE.SphereGeometry(0.09, 8, 6), Palette.coral, { outline: 0.01 });
    float.position.set(x, 0.85, 0.3);
    g.add(float);
  }
  return g;
}

// ------------------------------------------------------------------ ships

export function skullFlagTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2440';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#fff6e6';
  g.beginPath();
  g.arc(64, 42, 22, 0, Math.PI * 2);
  g.fill();
  g.fillRect(52, 54, 24, 14);
  g.fillStyle = '#2b2440';
  g.beginPath();
  g.arc(55, 42, 6, 0, Math.PI * 2);
  g.arc(73, 42, 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff6e6';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(30, 70);
  g.lineTo(98, 88);
  g.moveTo(98, 70);
  g.lineTo(30, 88);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let flagTex: THREE.CanvasTexture | null = null;

/** A waving flag; the board animates its vertices. */
export function flag(w: number, h: number): THREE.Mesh {
  flagTex ??= skullFlagTexture();
  const geo = new THREE.PlaneGeometry(w, h, 8, 1);
  geo.translate(w / 2, 0, 0);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }));
}

/** Hull half-width factor along the keel: pinched to a point at the bow (+x), a little at the stern. */
export function taper(x: number, len = 1): number {
  const k = x / len;
  return k > 0 ? 1 - 0.72 * Math.min(1, (k / 4.7) ** 2) : 1 - 0.18 * Math.min(1, (k / 4.3) ** 2);
}

/** A box squeezed to follow the hull's taper, for decks and stripes. */
export function hullBox(w: number, h: number, d: number, len: number, x = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 24, 1, 1).translate(x, 0, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * taper(p.getX(i), len));
  g.computeVertexNormals();
  return g;
}

export function hullGeometry(len = 1): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  profile.moveTo(-4 * len, 1.4);
  profile.lineTo(4.4 * len, 1.4);
  profile.quadraticCurveTo(3.8 * len, -0.2, 2.4 * len, -0.6);
  profile.lineTo(-3 * len, -0.6);
  profile.quadraticCurveTo(-4.2 * len, 0, -4 * len, 1.4);
  const geo = new THREE.ExtrudeGeometry(profile, { depth: 2.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 3, curveSegments: 16 });
  geo.translate(0, 0, -1.3);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * taper(p.getX(i), len));
  geo.computeVertexNormals();
  return geo;
}

function sail(x: number, y: number, w: number, h: number, color: number): THREE.Mesh {
  const s = toonMesh(new THREE.CylinderGeometry(w, w, h, 16, 1, true, -0.45, 0.9), color, { outline: 0.025 });
  (s.material as THREE.Material).side = THREE.DoubleSide;
  s.rotation.y = Math.PI / 2;
  s.position.set(x - w + 0.25, y, 0);
  s.scale.z = 0.95;
  return s;
}

function rope(a: THREE.Vector3, b: THREE.Vector3, r = 0.02): THREE.Mesh {
  const m = toonMesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 4), ROPE, { outline: false });
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export interface Ship {
  group: THREE.Group;
  wheel: THREE.Object3D;
  smoke: Smoke;
  flags: THREE.Mesh[];
  parrot: THREE.Object3D;
  crew: Npc[];
  lanterns: THREE.Sprite[];
}

/** The flagship moored in the middle of the lagoon. */
export function ship(): Ship {
  const s = new THREE.Group();
  const hull = toonMesh(hullGeometry(), Wood.hull, { outline: 0.05 });
  const stripe = toonMesh(hullBox(8.4, 0.25, 3.15, 1, 0.1), Palette.coral, { outline: 0.03 });
  stripe.position.set(0, 1.1, 0);
  const trim = toonMesh(hullBox(7.6, 0.12, 2.95, 1, -0.1), Palette.yellow, { outline: 0.015 });
  trim.position.set(0, 0.25, 0);
  const deck = toonMesh(hullBox(8, 0.1, 2.6, 1, 0.1), 0xd8a878, { outline: false });
  deck.position.y = 1.45;
  s.add(hull, stripe, trim, deck);
  // Rails with little posts.
  for (const side of [-1, 1]) {
    let last: THREE.Vector3 | null = null;
    for (let x = -2.4; x <= 3.8; x += 0.8) {
      const post = toonMesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), Wood.dark, { outline: false });
      post.position.set(x, 1.7, side * 1.38 * taper(x));
      s.add(post);
      const top = post.position.clone().setY(1.95);
      if (last) s.add(rope(last, top, 0.04));
      last = top;
    }
  }

  // Captain's cabin on the stern with lit windows.
  const cabin = toonMesh(new THREE.BoxGeometry(1.8, 1.1, 2.4), Wood.warm, { outline: 0.03 });
  cabin.position.set(-3, 2.05, 0);
  const cabinRoof = toonMesh(new THREE.BoxGeometry(2.1, 0.14, 2.7), Palette.coral, { outline: 0.02 });
  cabinRoof.position.set(-3, 2.65, 0);
  s.add(cabin, cabinRoof);
  for (const z of [-0.6, 0.6]) {
    const win = toonMesh(new THREE.BoxGeometry(0.06, 0.34, 0.34), LAMP, { outline: 0.012, emissive: LAMP_GLOW });
    win.position.set(-2.08, 2.1, z);
    s.add(win);
  }
  const lanterns: THREE.Sprite[] = [];
  for (const z of [-1.1, 1.1]) {
    const lamp = toonMesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), LAMP, { outline: 0.012, emissive: LAMP_GLOW });
    lamp.position.set(-3.95, 2.95, z);
    const glow = glowSprite(0xffd27a, 1.3, 0.6);
    glow.position.copy(lamp.position);
    s.add(lamp, glow);
    lanterns.push(glow);
  }
  // Ship's wheel on top of the cabin.
  const wheel = toonMesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), Wood.dark, { outline: 0.012 });
  wheel.position.set(-2.4, 3.1, 0);
  wheel.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const spoke = toonMesh(new THREE.BoxGeometry(0.04, 0.8, 0.04), Wood.dark, { outline: false });
    spoke.rotation.x = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  s.add(wheel);

  // Portholes along the hull.
  const portGeo = new THREE.CircleGeometry(0.16, 12);
  const portMat = new THREE.MeshBasicMaterial({ color: Palette.ink });
  for (const x of [-1, 1, 3]) {
    for (const side of [-1, 1]) {
      const port = new THREE.Mesh(portGeo, portMat);
      port.position.set(x, 0.55, side * 1.56 * taper(x));
      port.rotation.y = side > 0 ? 0 : Math.PI;
      s.add(port);
    }
  }

  // Bowsprit with a jib down to the bow.
  const sprit = toonMesh(new THREE.CylinderGeometry(0.06, 0.1, 2.4, 8), Wood.dark, { outline: 0.02 });
  sprit.rotation.z = -1.15;
  sprit.position.set(5.3, 1.95, 0);
  s.add(sprit);
  const jibShape = new THREE.Shape();
  jibShape.moveTo(0, 0);
  jibShape.lineTo(2.6, 0);
  jibShape.lineTo(0, 3);
  jibShape.closePath();
  const jib = toonMesh(new THREE.ShapeGeometry(jibShape), Palette.cream, { outline: false });
  (jib.material as THREE.Material).side = THREE.DoubleSide;
  jib.position.set(3.7, 2.4, 0);
  s.add(jib);

  const masts: [number, number][] = [
    [-1.6, 4.2],
    [1.4, 5],
  ];
  for (const [x, h] of masts) {
    const mast = toonMesh(new THREE.CylinderGeometry(0.12, 0.15, h, 10), Wood.dark, { outline: 0.03 });
    mast.position.set(x, 1.4 + h / 2, 0);
    s.add(mast);
    // Two billowing square sails per mast, the top one smaller, with a red stripe.
    for (const [y, w, sh] of [
      [1.4 + h * 0.42, 3, h * 0.36],
      [1.4 + h * 0.78, 2.2, h * 0.24],
    ] as const) {
      const yard = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, w * 0.95, 6), Wood.dark, { outline: 0.012 });
      yard.rotation.x = Math.PI / 2;
      yard.position.set(x + 0.2, y + sh / 2, 0);
      s.add(sail(x, y, w, sh, Palette.cream), yard);
      const band = sail(x, y, w + 0.01, sh * 0.22, Palette.coral);
      s.add(band);
    }
    for (const side of [-1, 1]) s.add(rope(new THREE.Vector3(x, 1.4 + h * 0.95, 0), new THREE.Vector3(x - 0.6, 1.5, side * 1.35)));
  }
  // Crow's nest on the main mast.
  const nest = toonMesh(new THREE.CylinderGeometry(0.42, 0.32, 0.4, 12, 1, true), Wood.warm, { outline: 0.02 });
  (nest.material as THREE.Material).side = THREE.DoubleSide;
  nest.position.set(1.4, 5.7, 0);
  s.add(nest);

  const f = flag(1.1, 0.8);
  f.position.set(1.4, 6.6, 0);
  s.add(f);
  const cannonGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.9, 12);
  for (const x of [-2, 0, 2]) {
    for (const side of [-1, 1]) {
      const c = toonMesh(cannonGeo, IRON, { outline: 0.02 });
      c.rotation.x = (side * Math.PI) / 2;
      c.position.set(x, 1.05, side * 1.55 * taper(x));
      s.add(c);
    }
  }
  // Cannon smoke that puffs out of the middle gun now and then.
  const smoke = new Smoke(5, 0.35, 1.6, 0.9, 0xffffff, new THREE.Vector3(0, 0.4, 1.4));
  smoke.group.position.set(0, 1.05, 2.1);
  s.add(smoke.group);
  // Deck cargo.
  const b1 = barrel();
  b1.position.set(2.6, 1.5, -0.7);
  const b2 = barrel();
  b2.position.set(2.9, 1.5, -0.1);
  const c1 = crate(0.6);
  c1.position.set(-0.4, 1.5, 0.7);
  s.add(b1, b2, c1);

  // A parrot keeps watch from the bow rail; the captain steers and a lookout sits up top.
  const p = parrot();
  p.position.set(3.6, 1.5, 1.1);
  p.rotation.y = 0.6;
  s.add(p);
  const captain = pirateNpc({ shirt: Palette.coral, skin: 0xffd8b8, hat: 'tricorn', beard: true });
  captain.group.position.set(-2.9, 2.72, 0);
  captain.group.rotation.y = Math.PI / 2;
  const lookout = pirateNpc({ shirt: 0x6fb7ff, skin: 0xc58c64, hat: 'bandana' });
  lookout.group.position.set(1.4, 5.5, 0);
  lookout.group.rotation.y = Math.PI / 2;
  lookout.group.scale.setScalar(0.9);
  s.add(captain.group, lookout.group);
  // Everything that never moves on its own merges into a few meshes.
  const root = new THREE.Group();
  root.add(wheel, smoke.group, f, p, captain.group, lookout.group, ...lanterns);
  root.add(bake(s));
  return { group: root, wheel, smoke, flags: [f], parrot: p, crew: [captain, lookout], lanterns };
}

export function parrot(): THREE.Group {
  const p = new THREE.Group();
  const body = toonMesh(new THREE.CapsuleGeometry(0.16, 0.26, 4, 10), Palette.coral, { outline: 0.015 });
  body.position.y = 0.3;
  body.rotation.x = -0.25;
  const head = toonMesh(new THREE.SphereGeometry(0.15, 12, 8), Palette.coral, { outline: 0.015 });
  head.position.set(0, 0.58, 0.05);
  const beak = toonMesh(new THREE.ConeGeometry(0.06, 0.16, 6), Palette.butter, { outline: 0.01 });
  beak.rotation.x = Math.PI / 2 + 0.5;
  beak.position.set(0, 0.54, 0.2);
  const wing = toonMesh(new THREE.SphereGeometry(0.13, 10, 6), Palette.green, { outline: 0.012 });
  wing.scale.set(0.5, 1.2, 1);
  for (const side of [-1, 1]) {
    const w = wing.clone();
    w.position.set(side * 0.15, 0.32, -0.02);
    p.add(w);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    eye.position.set(side * 0.09, 0.62, 0.13);
    p.add(eye);
  }
  const tail = toonMesh(new THREE.BoxGeometry(0.12, 0.35, 0.04), Palette.sky, { outline: 0.01 });
  tail.position.set(0, 0.1, -0.15);
  tail.rotation.x = 0.5;
  p.add(body, head, beak, tail);
  return p;
}

/** Small single-masted sloop for the town pier. */
export function sloop(sailColor: number, stripe: number): { group: THREE.Group; flag: THREE.Mesh } {
  const s = new THREE.Group();
  const hull = toonMesh(hullGeometry(0.75), 0xa87a56, { outline: 0.05 });
  hull.scale.set(1, 0.8, 0.7);
  const band = toonMesh(hullBox(6.2, 0.2, 2.25, 0.75, 0.1), stripe, { outline: 0.02 });
  band.position.set(0, 0.86, 0);
  const deck = toonMesh(hullBox(5.8, 0.08, 1.8, 0.75, 0.1), 0xd8a878, { outline: false });
  deck.position.y = 1.14;
  s.add(hull, band, deck);
  const mast = toonMesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8), Wood.dark, { outline: 0.025 });
  mast.position.set(0.4, 3.2, 0);
  s.add(mast, sail(0.4, 3.1, 2.2, 2.4, sailColor));
  const f = flag(0.8, 0.55);
  f.position.set(0.4, 5.1, 0);
  s.add(f);
  return { group: s, flag: f };
}

export function rowboat(): THREE.Group {
  const b = new THREE.Group();
  const hull = toonMesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xc98a5a, { outline: 0.03 });
  hull.scale.set(0.6, 0.45, 1.4);
  (hull.material as THREE.Material).side = THREE.DoubleSide;
  b.add(hull);
  const seat = toonMesh(new THREE.BoxGeometry(1.1, 0.06, 0.3), 0xe0b080, { outline: 0.01 });
  seat.position.y = -0.12;
  b.add(seat);
  for (const side of [-1, 1]) {
    const oar = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), 0xe0b080, { outline: 0.01 });
    oar.rotation.z = side * 1.2;
    oar.position.set(side * 0.8, -0.1, 0);
    b.add(oar);
  }
  return b;
}

/** Half-sunk, mossy ghost galleon with torn sails, listing on its side. */
export function ghostWreck(): THREE.Group {
  const w = new THREE.Group();
  // Everything rolls over together around the keel.
  const body = new THREE.Group();
  body.rotation.x = 0.45;
  w.add(body);
  const hull = toonMesh(hullGeometry(0.8), 0x8a7a92, { outline: 0.05 });
  const moss = toonMesh(hullBox(6.4, 0.24, 3.12, 0.8, 0.1), 0x8fc8a8, { outline: 0.02 });
  moss.position.set(0, 0.15, 0);
  const deck = toonMesh(hullBox(6.2, 0.1, 2.5, 0.8), 0x6f6480, { outline: false });
  deck.position.set(0, 1.42, 0);
  body.add(hull, moss, deck);
  // Holes stove in the deck and the side.
  for (const [x, z, r] of [[-1.2, 0.4, 0.55], [1.6, -0.5, 0.4], [0.2, 0.7, 0.3]] as const) {
    const hole = toonMesh(new THREE.CircleGeometry(r, 10), Palette.ink, { outline: false });
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, 1.48, z);
    body.add(hole);
  }
  const gash = toonMesh(new THREE.CircleGeometry(0.5, 8), Palette.ink, { outline: false });
  gash.position.set(-0.6, 0.6, 1.58);
  gash.scale.set(1.6, 0.7, 1);
  body.add(gash);
  for (let i = 0; i < 4; i++) {
    const rib = toonMesh(new THREE.TorusGeometry(1.15, 0.08, 5, 10, Math.PI), Wood.ghost, { outline: 0.012 });
    rib.position.set(-2.9 + i * 0.5, 1.45, 0);
    rib.rotation.y = Math.PI / 2;
    body.add(rib);
  }
  const mast = toonMesh(new THREE.CylinderGeometry(0.12, 0.16, 3.6, 8), Wood.ghost, { outline: 0.025 });
  mast.position.set(0.8, 3.1, 0);
  const stump = toonMesh(new THREE.CylinderGeometry(0.13, 0.15, 1.2, 8), Wood.ghost, { outline: 0.02 });
  stump.position.set(-1.8, 2, 0);
  const yard = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), Wood.ghost, { outline: 0.012 });
  yard.position.set(0.8, 4.6, 0);
  yard.rotation.x = Math.PI / 2 - 0.3;
  body.add(mast, stump, yard);
  const torn = new THREE.Shape();
  torn.moveTo(-1, 0);
  torn.lineTo(1, 0);
  torn.lineTo(0.9, -0.9);
  torn.lineTo(0.5, -0.6);
  torn.lineTo(0.3, -1.3);
  torn.lineTo(-0.2, -0.8);
  torn.lineTo(-0.5, -1.4);
  torn.lineTo(-0.9, -0.7);
  torn.closePath();
  const tatter = toonMesh(new THREE.ShapeGeometry(torn), 0xc4e0d0, { outline: 0.015 });
  (tatter.material as THREE.Material).side = THREE.DoubleSide;
  tatter.position.set(0.85, 4.5, 0);
  tatter.rotation.set(0, Math.PI / 2, 0.15);
  tatter.scale.set(1.2, 1.5, 1);
  body.add(tatter);
  return w;
}

// ------------------------------------------------------------------ people

export interface Npc {
  group: THREE.Group;
  arm: THREE.Object3D;
  phase: number;
}

const SKIN = [0xffd8b8, 0xe8b48a, 0xc58c64, 0x8a5a3b];

/** Round little pirate townsfolk. One arm is free to wave or work. */
export function pirateNpc(o: { shirt: number; skin?: number; hat?: 'tricorn' | 'bandana' | 'none'; beard?: boolean; pants?: number; phase?: number }): Npc {
  const parts = new THREE.Group();
  const skin = o.skin ?? SKIN[0];
  const legs = toonMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.32, 10), o.pants ?? 0x5a5a8a, { outline: 0.015 });
  legs.position.y = 0.16;
  const body = toonMesh(new THREE.CapsuleGeometry(0.22, 0.22, 4, 12), o.shirt, { outline: 0.018 });
  body.position.y = 0.52;
  const belt = toonMesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 12), Wood.dark, { outline: false });
  belt.position.y = 0.4;
  const head = toonMesh(new THREE.SphereGeometry(0.2, 14, 10), skin, { outline: 0.018 });
  head.position.y = 0.95;
  parts.add(legs, body, belt, head);
  for (const side of [-1, 1]) {
    const eye = toonMesh(new THREE.SphereGeometry(0.03, 6, 4), Palette.ink, { outline: false });
    eye.position.set(side * 0.07, 0.98, 0.18);
    parts.add(eye);
  }
  const off = toonMesh(new THREE.CapsuleGeometry(0.06, 0.22, 3, 6), o.shirt, { outline: 0.012 });
  off.position.set(-0.27, 0.55, 0);
  off.rotation.z = -0.2;
  parts.add(off);
  if (o.beard) {
    const beard = toonMesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), Wood.dark, { outline: 0.012 });
    beard.position.set(0, 0.9, 0.08);
    parts.add(beard);
  }
  if (o.hat === 'tricorn') {
    const brim = toonMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 3), Palette.ink, { outline: 0.012 });
    brim.position.y = 1.12;
    brim.rotation.y = Math.PI / 6 + Math.PI;
    const crown = toonMesh(new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), Palette.ink, { outline: 0.012 });
    crown.position.y = 1.12;
    const badge = toonMesh(new THREE.SphereGeometry(0.04, 6, 4), Palette.cream, { outline: false });
    badge.position.set(0, 1.2, 0.15);
    parts.add(brim, crown, badge);
  } else if (o.hat === 'bandana') {
    const band = toonMesh(new THREE.SphereGeometry(0.21, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), Palette.coral, { outline: 0.012 });
    band.position.y = 0.97;
    parts.add(band);
  }
  const group = bake(parts);
  const arm = new THREE.Group();
  arm.position.set(0.25, 0.68, 0);
  const sleeve = toonMesh(new THREE.CapsuleGeometry(0.06, 0.22, 3, 6), o.shirt, { outline: 0.012 });
  sleeve.position.y = -0.14;
  const hand = toonMesh(new THREE.SphereGeometry(0.06, 6, 4), skin, { outline: 0.01 });
  hand.position.y = -0.3;
  arm.add(sleeve, hand);
  arm.rotation.z = 0.2;
  group.add(arm);
  return { group, arm, phase: o.phase ?? 0 };
}

// ------------------------------------------------------------------ buildings

function roofPrism(w: number, d: number, h: number, color: number, overhang = 0.25): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - overhang, 0);
  shape.lineTo(d / 2 + overhang, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  return toonMesh(geo, color, { outline: 0.03 });
}

export interface HouseOptions {
  w: number;
  d: number;
  h: number;
  wall: number;
  roof: number;
  chimney?: boolean;
  stilts?: number;
  /** Lit windows on the front. */
  windows?: number;
}

/** Timber-framed cottage with a pitched roof; the door faces +z. */
export function house(o: HouseOptions): { group: THREE.Group; chimneyTop: THREE.Vector3 | null } {
  const g = new THREE.Group();
  const base = o.stilts ?? 0;
  if (base > 0) {
    for (const x of [-o.w / 2 + 0.2, o.w / 2 - 0.2]) {
      for (const z of [-o.d / 2 + 0.2, o.d / 2 - 0.2]) {
        const post = toonMesh(new THREE.CylinderGeometry(0.12, 0.14, base + 1.4, 7), Wood.dark, { outline: 0.015 });
        post.position.set(x, base / 2 - 0.7, z);
        g.add(post);
      }
    }
    const porch = toonMesh(new THREE.BoxGeometry(o.w + 0.6, 0.14, o.d + 1.2), Wood.mid, { outline: 0.02 });
    porch.position.set(0, base, 0.3);
    g.add(porch);
  }
  const walls = toonMesh(new THREE.BoxGeometry(o.w, o.h, o.d), o.wall, { outline: 0.03 });
  walls.position.y = base + o.h / 2;
  g.add(walls);
  // Corner beams and a sill beam.
  for (const x of [-o.w / 2, o.w / 2]) {
    for (const z of [-o.d / 2, o.d / 2]) {
      const beam = toonMesh(new THREE.BoxGeometry(0.16, o.h, 0.16), Wood.dark, { outline: false });
      beam.position.set(x, base + o.h / 2, z);
      g.add(beam);
    }
  }
  const sill = toonMesh(new THREE.BoxGeometry(o.w + 0.1, 0.14, o.d + 0.1), Wood.dark, { outline: false });
  sill.position.y = base + o.h - 0.07;
  g.add(sill);
  const roofH = Math.min(o.w, o.d) * 0.55;
  const roof = roofPrism(o.w, o.d, roofH, o.roof);
  roof.position.y = base + o.h;
  g.add(roof);
  const door = toonMesh(new THREE.BoxGeometry(0.62, 1.05, 0.08), Wood.warm, { outline: 0.015 });
  door.position.set(0, base + 0.53, o.d / 2 + 0.02);
  const knob = toonMesh(new THREE.SphereGeometry(0.05, 6, 4), Palette.yellow, { outline: false });
  knob.position.set(0.18, base + 0.55, o.d / 2 + 0.08);
  g.add(door, knob);
  const wins = o.windows ?? 2;
  for (let i = 0; i < wins; i++) {
    const x = wins === 1 ? o.w * 0.28 : (i === 0 ? -1 : 1) * o.w * 0.3;
    const win = toonMesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), LAMP, { outline: 0.012, emissive: LAMP_GLOW });
    win.position.set(x, base + o.h * 0.62, o.d / 2 + 0.03);
    const frameH = toonMesh(new THREE.BoxGeometry(0.5, 0.06, 0.08), Wood.dark, { outline: false });
    frameH.position.set(x, base + o.h * 0.62, o.d / 2 + 0.05);
    const frameV = toonMesh(new THREE.BoxGeometry(0.06, 0.5, 0.08), Wood.dark, { outline: false });
    frameV.position.copy(frameH.position);
    const box = toonMesh(new THREE.BoxGeometry(0.56, 0.14, 0.2), Wood.warm, { outline: 0.01 });
    box.position.set(x, base + o.h * 0.62 - 0.3, o.d / 2 + 0.1);
    g.add(win, frameH, frameV, box);
    for (let k = 0; k < 3; k++) {
      const flower = toonMesh(new THREE.SphereGeometry(0.07, 6, 4), [Palette.coral, Palette.butter, Palette.rose][(i + k) % 3], { outline: false });
      flower.position.set(x - 0.16 + k * 0.16, base + o.h * 0.62 - 0.18, o.d / 2 + 0.12);
      g.add(flower);
    }
  }
  let chimneyTop: THREE.Vector3 | null = null;
  if (o.chimney) {
    const ch = toonMesh(new THREE.BoxGeometry(0.42, 1.2, 0.42), STONE_DARK, { outline: 0.02 });
    ch.position.set(o.w * 0.28, base + o.h + roofH * 0.6, -o.d * 0.15);
    g.add(ch);
    chimneyTop = new THREE.Vector3(o.w * 0.28, base + o.h + roofH * 0.6 + 0.6, -o.d * 0.15);
  }
  return { group: g, chimneyTop };
}

/** Hanging shop sign on a bracket. */
export function hangingSign(text: string, w = 2): THREE.Group {
  const g = new THREE.Group();
  const arm = toonMesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), Wood.dark, { outline: 0.01 });
  arm.position.set(0, 0, 0.45);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.3, 0.06), [
    ...Array(4).fill(toon(Wood.mid)),
    new THREE.MeshBasicMaterial({ map: textTexture(text, '#8a5a3b', '#ffe38a', 256, 76, '900 30px system-ui, sans-serif') }),
    toon(Wood.mid),
  ]);
  board.rotation.y = Math.PI / 2;
  board.position.set(0.04, -w * 0.2, 0.75);
  outline(board, 0.015);
  g.add(arm, board);
  return g;
}

/** Market stall with a striped awning. */
export function stall(stripe: number, goods: number[]): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.9, 0.9]) {
    for (const z of [-0.5, 0.5]) {
      const post = toonMesh(new THREE.BoxGeometry(0.1, z < 0 ? 2.1 : 1.7, 0.1), Wood.dark, { outline: 0.01 });
      post.position.set(x, z < 0 ? 1.05 : 0.85, z);
      g.add(post);
    }
  }
  const counter = toonMesh(new THREE.BoxGeometry(2, 0.7, 0.8), Wood.mid, { outline: 0.02 });
  counter.position.y = 0.35;
  g.add(counter);
  for (let i = 0; i < 5; i++) {
    const strip = toonMesh(new THREE.BoxGeometry(0.44, 0.06, 1.5), i % 2 ? Palette.cream : stripe, { outline: 0.012 });
    strip.position.set(-0.88 + i * 0.44, 1.9, 0);
    strip.rotation.x = 0.28;
    g.add(strip);
  }
  goods.forEach((c, i) => {
    const item = toonMesh(new THREE.SphereGeometry(0.13, 8, 6), c, { outline: 0.01 });
    item.position.set(-0.7 + (i % 6) * 0.28, 0.82, i < 6 ? 0.15 : -0.12);
    g.add(item);
  });
  return g;
}

export function lampPost(): { group: THREE.Group; glow: THREE.Sprite } {
  const g = new THREE.Group();
  const post = toonMesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 7), Wood.dark, { outline: 0.012 });
  post.position.y = 1.2;
  const arm = toonMesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), Wood.dark, { outline: 0.01 });
  arm.position.set(0.22, 2.3, 0);
  const lamp = toonMesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), LAMP, { outline: 0.015, emissive: LAMP_GLOW });
  lamp.position.set(0.42, 2.05, 0);
  const cap = toonMesh(new THREE.ConeGeometry(0.2, 0.16, 4), IRON, { outline: 0.01 });
  cap.position.set(0.42, 2.28, 0);
  cap.rotation.y = Math.PI / 4;
  g.add(post, arm, lamp, cap);
  const glow = glowSprite(0xffd27a, 1.4, 0.55);
  glow.position.set(0.42, 2.05, 0);
  g.add(glow);
  return { group: g, glow };
}

/** Tiki torch; the flame and glow flicker. */
export function torch(): { group: THREE.Group; flame: THREE.Object3D; glow: THREE.Sprite } {
  const g = new THREE.Group();
  const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), Wood.warm, { outline: 0.012 });
  pole.position.y = 0.8;
  const bowl = toonMesh(new THREE.CylinderGeometry(0.17, 0.1, 0.24, 8), Wood.dark, { outline: 0.012 });
  bowl.position.y = 1.65;
  g.add(pole, bowl);
  const flame = new THREE.Group();
  flame.position.y = 1.78;
  const outer = toonMesh(new THREE.ConeGeometry(0.14, 0.42, 8), 0xff9a4a, { outline: false, emissive: 0x803000 });
  outer.position.y = 0.18;
  const inner = toonMesh(new THREE.ConeGeometry(0.07, 0.24, 6), 0xffe38a, { outline: false, emissive: 0x806000 });
  inner.position.y = 0.11;
  flame.add(outer, inner);
  const glow = glowSprite(0xffa050, 1.3, 0.6);
  glow.position.y = 1.95;
  g.add(flame, glow);
  return { group: g, flame, glow };
}

export function well(): THREE.Group {
  const g = new THREE.Group();
  const ring = toonMesh(new THREE.CylinderGeometry(0.7, 0.75, 0.7, 14, 1, true), STONE, { outline: 0.02 });
  (ring.material as THREE.Material).side = THREE.DoubleSide;
  ring.position.y = 0.35;
  const water = toonMesh(new THREE.CircleGeometry(0.66, 14), 0x7cc8ec, { outline: false });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.4;
  g.add(ring, water);
  for (const x of [-0.65, 0.65]) {
    const post = toonMesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), Wood.dark, { outline: 0.01 });
    post.position.set(x, 1.05, 0);
    g.add(post);
  }
  const roof = roofPrism(1.6, 1.2, 0.5, Palette.coral, 0.1);
  roof.position.y = 1.75;
  const bucket = toonMesh(new THREE.CylinderGeometry(0.14, 0.11, 0.2, 8), Wood.warm, { outline: 0.01 });
  bucket.position.set(0, 1.15, 0);
  g.add(roof, bucket);
  return g;
}

/** String of triangle pennants between two points, sagging in the middle. */
export function bunting(a: THREE.Vector3, b: THREE.Vector3, colors: number[]): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(3, Math.round(a.distanceTo(b) / 0.5));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(a.clone().lerp(b, t).setY(a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.5));
  }
  for (let i = 0; i < n; i++) g.add(rope(pts[i], pts[i + 1], 0.015));
  const tri = new THREE.Shape();
  tri.moveTo(-0.16, 0);
  tri.lineTo(0.16, 0);
  tri.lineTo(0, -0.34);
  tri.closePath();
  const geo = new THREE.ShapeGeometry(tri);
  const dir = Math.atan2(-(b.z - a.z), b.x - a.x);
  for (let i = 1; i < n; i++) {
    const f = toonMesh(geo, colors[i % colors.length], { outline: false });
    (f.material as THREE.Material).side = THREE.DoubleSide;
    f.position.copy(pts[i]);
    f.rotation.y = dir;
    g.add(f);
  }
  return g;
}

export function signpost(labels: [string, number][]): THREE.Group {
  const g = new THREE.Group();
  const post = toonMesh(new THREE.CylinderGeometry(0.07, 0.08, 2, 6), Wood.dark, { outline: 0.012 });
  post.position.y = 1;
  g.add(post);
  labels.forEach(([text, dir], i) => {
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.06), [
      ...Array(4).fill(toon(Wood.mid)),
      new THREE.MeshBasicMaterial({ map: textTexture(text, '#c99a6b', '#fff6e6', 256, 58, '900 30px system-ui, sans-serif') }),
      new THREE.MeshBasicMaterial({ map: textTexture(text, '#c99a6b', '#fff6e6', 256, 58, '900 30px system-ui, sans-serif') }),
    ]);
    arrow.position.set(Math.cos(dir) * 0.55, 1.7 - i * 0.42, -Math.sin(dir) * 0.55);
    arrow.rotation.y = dir;
    outline(arrow, 0.012);
    g.add(arrow);
  });
  return g;
}

// ------------------------------------------------------------------ landmarks

/** Stone fort with corner towers, a gate facing -x and cannons on the walls. */
export function fort(): { group: THREE.Group; flag: THREE.Mesh; cannons: THREE.Object3D[] } {
  const g = new THREE.Group();
  const S = 3.6;
  const wallH = 1.6;
  const wall = (x: number, z: number, len: number, alongX: boolean) => {
    const w = toonMesh(new THREE.BoxGeometry(alongX ? len : 0.7, wallH, alongX ? 0.7 : len), STONE, { outline: 0.03 });
    w.position.set(x, wallH / 2, z);
    g.add(w);
    const merlons = Math.floor(len / 0.7);
    for (let i = 0; i < merlons; i += 2) {
      const m = toonMesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), STONE, { outline: 0.015 });
      const o = -len / 2 + 0.35 + i * 0.7;
      m.position.set(alongX ? x + o : x, wallH + 0.18, alongX ? z : z + o);
      g.add(m);
    }
  };
  wall(0, -S, S * 2, true);
  wall(0, S, S * 2, true);
  wall(S, 0, S * 2, false);
  // The west wall is split around the gate.
  wall(-S, -S / 2 - 0.55, S - 1.1, false);
  wall(-S, S / 2 + 0.55, S - 1.1, false);
  const arch = toonMesh(new THREE.BoxGeometry(0.9, 0.5, 2.2), STONE_DARK, { outline: 0.02 });
  arch.position.set(-S, wallH + 0.1, 0);
  const gate = toonMesh(new THREE.BoxGeometry(0.2, 1.3, 1.4), Wood.warm, { outline: 0.02 });
  gate.position.set(-S - 0.2, 0.65, 0.45);
  gate.rotation.y = 0.9;
  g.add(arch, gate);
  for (const x of [-S, S]) {
    for (const z of [-S, S]) {
      const tower = toonMesh(new THREE.CylinderGeometry(1, 1.1, 2.8, 14), STONE_DARK, { outline: 0.03 });
      tower.position.set(x, 1.4, z);
      const ring = toonMesh(new THREE.CylinderGeometry(1.15, 1.15, 0.3, 14), STONE, { outline: 0.02 });
      ring.position.set(x, 2.85, z);
      const roof = toonMesh(new THREE.ConeGeometry(1.2, 1.3, 14), Palette.coral, { outline: 0.03 });
      roof.position.set(x, 3.65, z);
      const slit = toonMesh(new THREE.BoxGeometry(0.1, 0.5, 0.12), Palette.ink, { outline: false });
      slit.position.set(x, 1.6, z + Math.sign(z) * 1.02);
      g.add(tower, ring, roof, slit);
    }
  }
  // Courtyard: a keep, a flagpole, powder kegs and cannonballs.
  const keep = house({ w: 2.6, d: 2, h: 1.8, wall: STONE, roof: 0x5fb8c8, windows: 1 });
  keep.group.position.set(1.4, 0, -1.4);
  keep.group.rotation.y = -Math.PI / 2;
  g.add(keep.group);
  const pole = toonMesh(new THREE.CylinderGeometry(0.06, 0.08, 5.4, 8), Wood.dark, { outline: 0.015 });
  pole.position.set(-0.8, 2.7, 1.2);
  const ball = toonMesh(new THREE.SphereGeometry(0.12, 8, 6), Palette.yellow, { outline: 0.01 });
  ball.position.set(-0.8, 5.45, 1.2);
  g.add(pole, ball);
  const f = flag(1.6, 1.1);
  f.position.set(-0.8, 4.8, 1.2);
  g.add(f);
  const balls = cannonballs();
  balls.position.set(1.8, 0, 1.8);
  const k1 = barrel();
  k1.position.set(-2.2, 0, -2.4);
  const k2 = barrel();
  k2.position.set(-1.6, 0, -2.6);
  g.add(balls, k1, k2);
  // Cannons on the walls, pointing out to sea.
  const cannons: THREE.Object3D[] = [];
  const guns: [number, number, number][] = [
    [S, -1.2, Math.PI / 2], [S, 1.2, Math.PI / 2], [-1.6, -S, Math.PI], [1.6, -S, Math.PI], [-1.6, S, 0], [1.6, S, 0],
  ];
  for (const [x, z, ry] of guns) {
    const c = cannon();
    c.position.set(x, wallH - 0.05, z);
    c.rotation.y = ry;
    g.add(c);
    cannons.push(c);
  }
  return { group: g, flag: f, cannons };
}

/** Red-and-cream striped lighthouse; returns the beam pivot to spin. */
export function lighthouse(): { group: THREE.Group; beam: THREE.Object3D } {
  const l = new THREE.Group();
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const r0 = 1.2 - i * 0.12;
    const band = toonMesh(new THREE.CylinderGeometry(r0 - 0.12, r0, 1.2, 18), i % 2 ? Palette.cream : Palette.coral, { outline: 0.035 });
    band.position.y = i * 1.2 + 0.6;
    l.add(band);
  }
  const top = bands * 1.2 + 0.4;
  const balcony = toonMesh(new THREE.CylinderGeometry(0.85, 0.85, 0.15, 18), Palette.ink, { outline: false });
  balcony.position.y = top - 0.55;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
  lamp.position.y = top;
  const roof = toonMesh(new THREE.ConeGeometry(0.7, 0.8, 18), Palette.coral, { outline: 0.03 });
  roof.position.y = top + 0.8;
  const door = toonMesh(new THREE.BoxGeometry(0.6, 0.9, 0.2), Wood.warm, { outline: 0.015 });
  door.position.set(0, 0.45, 1.12);
  l.add(balcony, lamp, roof, door);
  const glow = glowSprite(0xfff2a8, 4, 0.7);
  glow.position.y = top;
  l.add(glow);
  const pivot = new THREE.Group();
  pivot.position.y = top;
  const beamGeo = new THREE.ConeGeometry(1.4, 14, 16, 1, true);
  beamGeo.translate(0, -7, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.rotation.z = -0.12;
  pivot.add(beam);
  l.add(pivot);
  return { group: l, beam: pivot };
}

/** Big grey rock with a skull face and a cave for a mouth. */
export function skullRock(): THREE.Group {
  const g = new THREE.Group();
  const dome = toonMesh(new THREE.SphereGeometry(4, 20, 14), 0xd2cade, { outline: 0.06 });
  dome.scale.set(1.1, 0.9, 0.9);
  dome.position.y = 1.4;
  const jaw = toonMesh(new THREE.CylinderGeometry(2.6, 2.4, 2.4, 16), 0xc4bcd2, { outline: 0.05 });
  jaw.position.set(0, -0.2, 0.9);
  g.add(dome, jaw);
  const holeMat = toon(Palette.ink);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), holeMat);
    eye.position.set(side * 1.45, 2.2, 3.5);
    eye.rotation.x = -0.35;
    eye.rotation.y = side * 0.3;
    g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16, 0, Math.PI), holeMat);
  mouth.position.set(0, -0.4, 3.32);
  g.add(mouth);
  return g;
}

/** Carved stone tiki head. */
export function tiki(color: number = STONE_DARK): THREE.Group {
  const g = new THREE.Group();
  const body = toonMesh(new THREE.BoxGeometry(1.1, 2.2, 0.9), color, { outline: 0.03 });
  body.position.y = 1.1;
  const brow = toonMesh(new THREE.BoxGeometry(1.2, 0.22, 0.3), color, { outline: 0.015 });
  brow.position.set(0, 1.75, 0.45);
  const nose = toonMesh(new THREE.BoxGeometry(0.3, 0.55, 0.3), color, { outline: 0.015 });
  nose.position.set(0, 1.35, 0.5);
  const mouth = toonMesh(new THREE.BoxGeometry(0.7, 0.2, 0.1), Palette.ink, { outline: false });
  mouth.position.set(0, 0.85, 0.46);
  const crown = toonMesh(new THREE.BoxGeometry(1.25, 0.25, 1), Palette.coral, { outline: 0.015 });
  crown.position.y = 2.3;
  g.add(body, brow, nose, mouth, crown);
  for (const s of [-1, 1]) {
    const eye = toonMesh(new THREE.BoxGeometry(0.25, 0.14, 0.08), Palette.cream, { outline: false });
    eye.position.set(s * 0.3, 1.55, 0.46);
    g.add(eye);
  }
  return g;
}

/** Wooden jetty planks along +z, with posts. */
export function pier(length: number, width = 2, color = Wood.mid): THREE.Group {
  const d = new THREE.Group();
  const plankGeo = new THREE.BoxGeometry(width, 0.12, 0.45);
  const planks = Math.round(length / 0.5);
  for (let i = 0; i < planks; i++) {
    const p = toonMesh(plankGeo, i % 3 === 1 ? Wood.light : color, { outline: 0.012 });
    p.position.set(0, 0, i * 0.5);
    p.rotation.y = ((i * 37) % 7) * 0.006 - 0.02;
    d.add(p);
  }
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8);
  for (let i = 0; i <= length; i += 2) {
    for (const side of [-1, 1]) {
      const post = toonMesh(postGeo, Wood.hull, { outline: 0.015 });
      post.position.set(side * (width / 2 + 0.05), -0.3, i);
      d.add(post);
    }
  }
  return d;
}

export function buoy(): THREE.Group {
  const b = new THREE.Group();
  const base = toonMesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 12), Palette.coral, { outline: 0.02 });
  const mid = toonMesh(new THREE.CylinderGeometry(0.25, 0.35, 0.5, 12), Palette.cream, { outline: 0.02 });
  mid.position.y = 0.5;
  const cap = toonMesh(new THREE.ConeGeometry(0.25, 0.4, 12), Palette.coral, { outline: 0.02 });
  cap.position.y = 0.95;
  b.add(base, mid, cap);
  return b;
}

export function sharkFin(): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.quadraticCurveTo(0.1, 0.4, 0.35, 1.1);
  shape.quadraticCurveTo(0.3, 0.4, 0.5, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.translate(0, 0, -0.05);
  return toonMesh(geo, 0x8a9ac0, { outline: 0.02 });
}

/** Flat five-armed starfish for the beaches. */
export function starfishGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.3 : 0.11;
    const a = (i / 10) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// ------------------------------------------------------------------ sea life

/** Curling tentacle made of nested segments; `curl` bends every joint. */
export interface Tentacle {
  root: THREE.Group;
  joints: THREE.Object3D[];
}

export function tentacle(segments = 9, base = 0.45): Tentacle {
  const root = new THREE.Group();
  const joints: THREE.Object3D[] = [];
  let parent: THREE.Object3D = root;
  for (let i = 0; i < segments; i++) {
    const r = base * (1 - i / (segments + 1));
    const len = 0.55;
    const j = new THREE.Group();
    j.position.y = i === 0 ? 0 : len;
    const seg = toonMesh(new THREE.CylinderGeometry(r * 0.9, r, len + 0.06, 10), 0xb48ad8, { outline: 0.025 });
    seg.position.y = len / 2;
    j.add(seg);
    const sucker = toonMesh(new THREE.SphereGeometry(r * 0.38, 8, 6), Palette.rose, { outline: false });
    sucker.position.set(0, len / 2, r * 0.8);
    sucker.scale.z = 0.4;
    j.add(sucker);
    parent.add(j);
    joints.push(j);
    parent = j;
  }
  return { root, joints };
}

export function dolphin(): THREE.Group {
  const d = new THREE.Group();
  const body = toonMesh(new THREE.CapsuleGeometry(0.32, 1.3, 6, 12), 0x9fb4e0, { outline: 0.025 });
  body.rotation.x = Math.PI / 2;
  const belly = toonMesh(new THREE.CapsuleGeometry(0.24, 1, 4, 10), 0xe8f0ff, { outline: false });
  belly.rotation.x = Math.PI / 2;
  belly.position.y = -0.12;
  const snout = toonMesh(new THREE.CylinderGeometry(0.08, 0.14, 0.35, 8), 0x9fb4e0, { outline: 0.015 });
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.06, 1.1);
  const fin = toonMesh(new THREE.ConeGeometry(0.16, 0.45, 6), 0x8aa0d0, { outline: 0.015 });
  fin.position.set(0, 0.4, -0.1);
  fin.rotation.x = -0.5;
  const tail = toonMesh(new THREE.BoxGeometry(0.8, 0.06, 0.28), 0x8aa0d0, { outline: 0.015 });
  tail.position.set(0, 0, -1);
  d.add(body, belly, snout, fin, tail);
  for (const s of [-1, 1]) {
    const eye = toonMesh(new THREE.SphereGeometry(0.04, 6, 4), Palette.ink, { outline: false });
    eye.position.set(s * 0.22, 0.08, 0.72);
    d.add(eye);
  }
  return d;
}

export function turtle(): { group: THREE.Group; flippers: THREE.Object3D[] } {
  const g = new THREE.Group();
  const shell = toonMesh(new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x6cc98a, { outline: 0.025 });
  shell.scale.y = 0.55;
  const plate = toonMesh(new THREE.CylinderGeometry(0.6, 0.62, 0.08, 14), 0xe8d8a0, { outline: 0.015 });
  const head = toonMesh(new THREE.SphereGeometry(0.2, 10, 8), 0xa8e0b0, { outline: 0.015 });
  head.position.set(0, 0.05, 0.72);
  g.add(shell, plate, head);
  const flippers: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.55, 0.3], [0.55, 0.3], [-0.45, -0.4], [0.45, -0.4]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z);
    const f = toonMesh(new THREE.SphereGeometry(0.22, 8, 6), 0xa8e0b0, { outline: 0.012 });
    f.scale.set(1.4, 0.25, 0.6);
    f.position.x = Math.sign(x) * 0.18;
    pivot.add(f);
    pivot.userData.side = Math.sign(x);
    g.add(pivot);
    flippers.push(pivot);
  }
  return { group: g, flippers };
}
