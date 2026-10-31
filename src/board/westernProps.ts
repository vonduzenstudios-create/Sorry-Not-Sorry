import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { glowSprite, Smoke, textTexture } from './decor';

/*
 * Set pieces for Dusty Gulch. Builders return groups facing +z (toward the
 * board camera). Anything that animates is tagged `noBake` and handed back
 * through `userData` so the board can drive it; everything else is merged
 * into a handful of draw calls by `bake`.
 */

export const SAND = 0xf3d9a4;
export const DIRT = 0xd9b07a;
export const TERRACOTTA = 0xe59a74;
export const CACTUS = 0x7cc98a;
export const WOOD = 0xc99a6b;
export const WOOD_DARK = 0xa97a54;
export const WOOD_GREY = 0xb8a690;
export const IRON = 0x6b6488;
export const WINDOW = Palette.sky;

/** Toon box with an outline. */
export function box(w: number, h: number, d: number, color: number, outline: number | false = 0.02): THREE.Mesh {
  return toonMesh(new THREE.BoxGeometry(w, h, d), color, { outline });
}

export function cyl(rt: number, rb: number, h: number, color: number, seg = 10, outline: number | false = 0.02): THREE.Mesh {
  return toonMesh(new THREE.CylinderGeometry(rt, rb, h, seg), color, { outline });
}

/** Place an object in a parent and hand it back. */
export function put<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x = 0, y = 0, z = 0, ry = 0): T {
  o.position.set(x, y, z);
  if (ry) o.rotation.y = ry;
  parent.add(o);
  return o;
}

/** Mark a subtree as animated so `bake` leaves it alone. */
export function live<T extends THREE.Object3D>(o: T): T {
  o.userData.noBake = true;
  return o;
}

export function signPlane(text: string, w: number, h: number, bg = '#fff6e6', fg = '#2b2440', fontPx = 40): THREE.Mesh {
  const pw = 256;
  const ph = Math.max(48, Math.round((pw * h) / w));
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: textTexture(text, bg, fg, pw, ph, `900 ${fontPx}px system-ui, sans-serif`) }),
  );
}

/** Ink outline for baked scenery: the hull thickness rides along per vertex. */
function bakedOutlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(Palette.ink) } },
    vertexShader: /* glsl */ `
      attribute float thick;
      void main() {
        vec3 p = position + normalize(normal) * thick;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
  });
}

/**
 * Merge every static mesh under `root` into a couple of vertex-coloured
 * meshes plus a single outline hull, so hundreds of props cost a handful of
 * draw calls. Textured, transparent, double-sided, instanced and `noBake`
 * pieces are moved across untouched.
 */
export function bake(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  const keep: THREE.Object3D[] = [];
  const fills = new Map<string, { emissive: number; basic: boolean; geos: THREE.BufferGeometry[] }>();
  const hulls: THREE.BufferGeometry[] = [];

  const add = (mesh: THREE.Mesh, mat: THREE.MeshToonMaterial | THREE.MeshBasicMaterial) => {
    const hull = mesh.children.find((c) => c.name === 'outline') as THREE.Mesh | undefined;
    const basic = mat instanceof THREE.MeshBasicMaterial;
    const emissive = basic ? 0 : (mat as THREE.MeshToonMaterial).emissive.getHex();
    const key = `${basic}:${emissive}`;
    let b = fills.get(key);
    if (!b) fills.set(key, (b = { emissive, basic, geos: [] }));
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.getAttribute('position').clone());
    g.setAttribute('normal', src.getAttribute('normal').clone());
    g.applyMatrix4(mesh.matrixWorld);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([mat.color.r, mat.color.g, mat.color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    b.geos.push(g);
    if (hull) {
      const h = new THREE.BufferGeometry();
      h.setAttribute('position', g.getAttribute('position'));
      h.setAttribute('normal', g.getAttribute('normal'));
      const thick = (hull.material as THREE.ShaderMaterial).uniforms.thickness.value as number;
      h.setAttribute('thick', new THREE.BufferAttribute(new Float32Array(n).fill(thick), 1));
      hulls.push(h);
    }
  };

  const walk = (o: THREE.Object3D) => {
    if (o.name === 'outline') return;
    if (o !== root && o.userData.noBake) {
      keep.push(o);
      return;
    }
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
      const mat = o.material;
      const bakeable =
        !Array.isArray(mat) &&
        mat.side === THREE.FrontSide &&
        (mat instanceof THREE.MeshToonMaterial || mat instanceof THREE.MeshBasicMaterial) &&
        !mat.map &&
        !mat.transparent;
      if (!bakeable) {
        keep.push(o);
        return;
      }
      add(o, mat as THREE.MeshToonMaterial);
    } else if (o !== root && !(o instanceof THREE.Group) && o.type !== 'Object3D') {
      // Sprites, lines, instanced meshes.
      keep.push(o);
      return;
    }
    for (const c of o.children) walk(c);
  };
  walk(root);

  for (const b of fills.values()) {
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    let mesh: THREE.Mesh;
    if (b.basic) {
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    } else {
      const mat = toon(0xffffff, { emissive: b.emissive });
      mat.vertexColors = true;
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    out.add(mesh);
  }
  const hullGeo = hulls.length ? mergeGeometries(hulls, false) : null;
  if (hullGeo) {
    const hull = new THREE.Mesh(hullGeo, bakedOutlineMaterial());
    hull.name = 'outline';
    out.add(hull);
  }
  for (const g of [...hulls, ...[...fills.values()].flatMap((b) => b.geos)]) g.dispose();
  for (const k of keep) out.attach(k);
  return out;
}

/**
 * Bake an animated prop (built at the origin) in its own space: the static
 * body collapses to a few draws while the moving parts stay separate.
 */
export function bakeLocal(root: THREE.Object3D): THREE.Group {
  const data = root.userData;
  root.userData = {};
  const out = bake(root);
  out.userData = { ...data, noBake: true };
  return out;
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export interface BuildingOpts {
  w: number;
  d: number;
  /** Wall height; two storeys above ~3.6. */
  h: number;
  wall: number;
  trim: number;
  roof?: number;
  sign?: string;
  signBg?: string;
  signFg?: string;
  porch?: boolean;
  balcony?: boolean;
}

/** False-front frontier building with a pitched roof behind the facade. */
export function building(o: BuildingOpts): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = o;
  const roof = o.roof ?? 0x9a6f8a;
  put(g, box(w, h, d, o.wall, 0.04), 0, h / 2, 0);
  // Pitched roof behind the false front.
  const pitch = 0.5;
  const slope = Math.hypot(w / 2, 1) + 0.1;
  for (const side of [-1, 1]) {
    const r = put(g, box(slope, 0.14, d + 0.3, roof, 0.025), side * (w / 4), h + pitch / 2 + 0.05, -0.05);
    r.rotation.z = -side * Math.atan2(pitch * 2, w);
  }
  // Stepped false front.
  const fz = d / 2 + 0.12;
  const fh = h + 1.1;
  put(g, box(w + 0.3, fh, 0.24, o.trim, 0.04), 0, fh / 2, fz);
  put(g, box(w * 0.55, 0.45, 0.26, o.trim, 0.03), 0, fh + 0.22, fz);
  put(g, box(w + 0.5, 0.14, 0.4, Palette.cream, 0.02), 0, fh + 0.05, fz);
  for (const x of [-1, 1]) put(g, box(0.16, fh, 0.3, Palette.cream, 0.015), x * (w / 2 + 0.12), fh / 2, fz + 0.02);
  if (o.sign) {
    const sw = Math.min(w * 0.82, 4.2);
    put(g, signPlane(o.sign, sw, 0.62, o.signBg, o.signFg), 0, h + 0.3, fz + 0.13);
  }
  // Ground floor: door and two windows.
  put(g, box(0.9, 1.5, 0.08, WOOD_DARK, 0.015), 0, 0.75, fz + 0.12);
  put(g, box(1.1, 1.65, 0.05, Palette.cream, false), 0, 0.8, fz + 0.09);
  for (const x of [-1, 1]) {
    put(g, box(0.95, 0.85, 0.06, Palette.cream, 0.015), x * w * 0.3, 1.25, fz + 0.1);
    put(g, box(0.75, 0.66, 0.08, WINDOW, false), x * w * 0.3, 1.25, fz + 0.12);
  }
  // Upper floor windows.
  if (h > 3.4) {
    for (const x of [-1, 0, 1]) {
      if (x === 0 && !o.balcony) continue;
      put(g, box(0.8, 0.95, 0.06, Palette.cream, 0.015), x * w * 0.3, h - 0.95, fz + 0.1);
      put(g, box(0.6, 0.75, 0.08, WINDOW, false), x * w * 0.3, h - 0.95, fz + 0.12);
    }
  }
  if (o.porch !== false) {
    // Boardwalk, posts and a slanted awning.
    put(g, box(w + 0.6, 0.2, 1.5, WOOD, 0.02), 0, 0.1, fz + 0.75);
    const awnY = Math.min(2.5, h - 0.4);
    for (const x of [-1, 1]) put(g, cyl(0.08, 0.08, awnY, WOOD, 6, 0.015), x * (w / 2 + 0.1), awnY / 2 + 0.2, fz + 1.35);
    if (o.balcony) {
      put(g, box(w + 0.5, 0.14, 1.5, WOOD, 0.02), 0, awnY + 0.2, fz + 0.75);
      for (let i = 0; i <= 8; i++) put(g, box(0.06, 0.5, 0.06, Palette.cream, false), -w / 2 + (i / 8) * w, awnY + 0.5, fz + 1.45);
      put(g, box(w + 0.3, 0.08, 0.1, Palette.cream, 0.012), 0, awnY + 0.78, fz + 1.45);
    } else {
      const awn = put(g, box(w + 0.5, 0.1, 1.6, o.roof ?? Palette.coral, 0.02), 0, awnY + 0.25, fz + 0.75);
      awn.rotation.x = 0.18;
    }
  }
  return g;
}

/** Saloon: two storeys, balcony and swinging doors. */
export function saloon(doors: THREE.Object3D[]): THREE.Group {
  const s = building({ w: 5.4, d: 3, h: 3.9, wall: 0xf2c6a0, trim: 0xe8a882, roof: 0xb07a8a, sign: 'SALOON', balcony: true });
  const fz = 3 / 2 + 0.12;
  for (const side of [-1, 1]) {
    const pivot = live(put(s, new THREE.Group(), side * 0.5, 0.95, fz + 0.2));
    const leaf = put(pivot, box(0.48, 0.7, 0.05, WOOD, 0.01), -side * 0.24, 0, 0);
    leaf.castShadow = false;
    pivot.userData.side = side;
    doors.push(pivot);
  }
  // A piano peeking through the window and hanging lanterns.
  put(s, box(0.6, 0.4, 0.1, Palette.ink, false), -1.6, 1.1, fz + 0.15);
  for (const x of [-2.2, 2.2]) {
    put(s, box(0.18, 0.28, 0.18, Palette.butter, 0.012), x, 2.15, fz + 1.2).material = toon(Palette.butter, { emissive: 0x665500 });
  }
  // Barrels on the boardwalk.
  for (const x of [-2.5, 2.4]) put(s, barrel(), x, 0.2, fz + 0.75);
  return s;
}

export function bank(): THREE.Group {
  const b = building({ w: 3.4, d: 3, h: 3.2, wall: 0xcfe8f4, trim: 0x9ccbe3, roof: 0x7c8fb8, sign: 'BANK', porch: false });
  const fz = 1.62;
  // Stone steps and little columns.
  put(b, box(2.2, 0.15, 0.6, Palette.cream, 0.015), 0, 0.075, fz + 0.4);
  put(b, box(1.6, 0.15, 0.4, Palette.cream, 0.015), 0, 0.22, fz + 0.3);
  for (const x of [-0.95, 0.95]) put(b, cyl(0.12, 0.14, 2.6, Palette.cream, 10, 0.015), x, 1.3, fz + 0.35);
  put(b, box(2.4, 0.25, 0.6, Palette.cream, 0.015), 0, 2.7, fz + 0.3);
  // Gold dollar plaque.
  const coin = put(b, cyl(0.32, 0.32, 0.08, Palette.yellow, 18, 0.015), 0, 3.95, fz + 0.2);
  coin.rotation.x = Math.PI / 2;
  (coin.material as THREE.MeshToonMaterial).emissive.setHex(0x332200);
  return b;
}

export function sheriff(): THREE.Group {
  const s = building({ w: 3, d: 2.8, h: 2.6, wall: 0xd8c8ff, trim: 0xb8a6e8, roof: 0x8a78c0, sign: 'SHERIFF' });
  const fz = 1.52;
  // Jail bars on the windows.
  for (const x of [-0.9, 0.9]) for (let i = -1; i <= 1; i++) put(s, box(0.05, 0.7, 0.05, IRON, false), x + i * 0.2, 1.25, fz + 0.18);
  put(s, sheriffStar(), 0, 3.15, fz + 0.15);
  // Rocking chair on the porch (animated).
  const chair = live(put(s, new THREE.Group(), 1.0, 0.2, fz + 0.8, -0.4));
  put(chair, box(0.5, 0.06, 0.5, WOOD_DARK, 0.01), 0, 0.4, 0);
  put(chair, box(0.5, 0.6, 0.06, WOOD_DARK, 0.01), 0, 0.72, -0.24);
  for (const x of [-0.22, 0.22]) {
    const rocker = put(chair, new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 4, 12, 1.4), toon(WOOD_DARK)), x, 0.42, 0);
    rocker.rotation.set(0, Math.PI / 2, Math.PI + (Math.PI - 1.4) / 2);
    put(chair, box(0.04, 0.4, 0.04, WOOD_DARK, false), x, 0.22, 0.18);
    put(chair, box(0.04, 0.4, 0.04, WOOD_DARK, false), x, 0.22, -0.18);
  }
  s.userData.chair = chair;
  return s;
}

export function hotel(): THREE.Group {
  return building({ w: 3.8, d: 3, h: 4, wall: 0xffd3b8, trim: 0xf5b896, roof: 0xc48a7a, sign: 'HOTEL', balcony: true });
}

export function generalStore(): THREE.Group {
  const g = building({ w: 3.4, d: 3, h: 2.6, wall: Palette.mint, trim: 0x9fd8b8, roof: 0x6fae9a, sign: 'GENERAL' });
  // Goods stacked out front.
  put(g, crate(Palette.butter), -1.9, 0.5, 2.4, 0.3);
  put(g, crate(0xe8b48c), -1.4, 0.5, 2.6, 0.9);
  put(g, crate(Palette.butter, 0.45), -1.65, 1.05, 2.5, 0.5);
  put(g, sack(), 1.6, 0.2, 2.5);
  put(g, sack(), 1.95, 0.2, 2.3, 1);
  return g;
}

/** Open-fronted smithy: forge glow, anvil and a smoking chimney. */
export function blacksmith(): { group: THREE.Group; smoke: Smoke; glow: THREE.Sprite } {
  const g = new THREE.Group();
  put(g, box(3.4, 0.15, 2.6, WOOD_GREY, 0.02), 0, 0.075, 0);
  put(g, box(3.4, 2.4, 0.2, 0xd6b8a0, 0.03), 0, 1.2, -1.2);
  put(g, box(0.2, 2.4, 2.6, 0xd6b8a0, 0.03), -1.6, 1.2, 0);
  for (const x of [-1.6, 1.6]) put(g, cyl(0.09, 0.09, 2.6, WOOD, 6, 0.015), x, 1.3, 1.2);
  put(g, cyl(0.09, 0.09, 2.6, WOOD, 6, 0.015), 1.6, 1.3, -1.1);
  const roof = put(g, box(3.9, 0.14, 3.1, 0x8a8ab0, 0.025), 0, 2.75, 0);
  roof.rotation.x = 0.16;
  // Brick forge with chimney.
  put(g, box(1.2, 1, 1, 0xd88a7a, 0.025), -0.8, 0.6, -0.55);
  put(g, box(0.8, 0.18, 0.7, Palette.ink, false), -0.8, 1.12, -0.5);
  const chimney = put(g, box(0.5, 2.6, 0.5, 0xd88a7a, 0.025), -0.8, 2.3, -0.8);
  chimney.castShadow = true;
  const coals = put(g, box(0.6, 0.06, 0.5, 0xff9a5a, false), -0.8, 1.22, -0.45);
  coals.material = toon(0xff9a5a, { emissive: 0xff5a1a });
  const glow = live(glowSprite(0xff9a4a, 2.2, 0.8));
  put(g, glow, -0.8, 1.5, -0.3);
  // Anvil on a stump.
  put(g, cyl(0.28, 0.32, 0.5, WOOD_DARK, 10, 0.015), 0.6, 0.4, 0.2);
  put(g, box(0.7, 0.22, 0.3, IRON, 0.015), 0.6, 0.76, 0.2);
  const horn = put(g, toonMesh(new THREE.ConeGeometry(0.11, 0.35, 8), IRON, { outline: 0.012 }), 1.1, 0.78, 0.2);
  horn.rotation.z = -Math.PI / 2;
  // Horseshoes on the wall.
  for (let i = 0; i < 3; i++) put(g, new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 4, 10, Math.PI * 1.5), toon(IRON)), 0.2 + i * 0.4, 1.7, -1.08).rotation.z = Math.PI * 1.25;
  put(g, barrel(0x8fc0e0), 1.3, 0.15, 0.8);
  const smoke = new Smoke(5, 0.35, 3.5, 0.45, 0xd8d0e8, new THREE.Vector3(0.5, 0, 0.2));
  live(put(g, smoke.group, -0.8, 3.7, -0.8));
  put(g, signPlane('SMITHY', 1.6, 0.4, '#fff6e6', '#2b2440', 34), 0.5, 2.3, 1.25);
  return { group: g, smoke, glow };
}

/** Big pastel barn with a hay loft. */
export function barn(): THREE.Group {
  const b = new THREE.Group();
  const red = 0xf0928a;
  put(b, box(5, 3, 4.4, red, 0.05), 0, 1.5, 0);
  // Gambrel roof.
  const shape = new THREE.Shape();
  shape.moveTo(-2.7, 0);
  shape.lineTo(-2, 1.2);
  shape.lineTo(0, 2);
  shape.lineTo(2, 1.2);
  shape.lineTo(2.7, 0);
  shape.lineTo(-2.7, 0);
  const gable = toonMesh(new THREE.ExtrudeGeometry(shape, { depth: 4.2, bevelEnabled: false }), 0xd87a76, { outline: 0.04 });
  put(b, gable, 0, 3, -2.1);
  const roofMat = 0x8a6f9e;
  for (const [x, y, rz, w] of [
    [-2.4, 3.65, 1.05, 1.5],
    [2.4, 3.65, -1.05, 1.5],
    [-1.05, 4.65, 0.38, 2.25],
    [1.05, 4.65, -0.38, 2.25],
  ] as const) {
    const r = put(b, box(w, 0.14, 4.7, roofMat, 0.025), x, y, 0);
    r.rotation.z = rz;
  }
  // Doors with white X bracing.
  for (const side of [-1, 1]) {
    put(b, box(1.2, 2.2, 0.08, 0xd87a76, 0.015), side * 0.62, 1.1, 2.24);
    for (const r of [0.95, -0.95]) {
      const brace = put(b, box(0.12, 2.3, 0.04, Palette.cream, false), side * 0.62, 1.1, 2.3);
      brace.rotation.z = r * 0.5;
    }
  }
  put(b, box(1.1, 0.9, 0.08, WOOD_DARK, 0.015), 0, 3.8, 2.26);
  put(b, hayBale(), -0.1, 3.75, 2.15).scale.setScalar(0.5);
  put(b, hayBale(), 2.8, 0.4, 2.7, 0.3);
  put(b, hayBale(), 3.4, 0.4, 1.6, 1.2);
  put(b, hayBale(), 3.1, 1.15, 2.2, 0.8);
  return b;
}

export function stable(): THREE.Group {
  const s = new THREE.Group();
  put(s, box(4, 2.2, 2.8, 0xe8c4a0, 0.04), 0, 1.1, 0);
  const roof = put(s, box(4.6, 0.14, 3.6, 0x9a7a6a, 0.025), 0, 2.45, 0.2);
  roof.rotation.x = 0.2;
  for (const x of [-1.3, 0, 1.3]) {
    put(s, box(1.1, 1.3, 0.08, WOOD_DARK, 0.015), x, 0.85, 1.42);
    put(s, box(1.1, 0.5, 0.06, Palette.ink, false), x, 1.75, 1.42);
  }
  put(s, signPlane('STABLE', 1.6, 0.42, '#fff6e6', '#2b2440', 34), 0, 2.85, 1.55).rotation.x = 0;
  put(s, hayBale(), 2.6, 0.4, 0.8, 0.4);
  put(s, hayBale(), 2.5, 0.4, -0.4, 1.2);
  return s;
}

/** Little white chapel with a bell that swings. */
export function church(): { group: THREE.Group; bell: THREE.Object3D } {
  const c = new THREE.Group();
  const wall = 0xfff6e6;
  put(c, box(3.4, 3, 5, wall, 0.045), 0, 1.5, 0);
  for (const side of [-1, 1]) {
    const r = put(c, box(2.5, 0.16, 5.4, 0x8fa8d8, 0.025), side * 0.95, 3.6, 0);
    r.rotation.z = -side * 0.66;
  }
  const gable = new THREE.Shape();
  gable.moveTo(-1.7, 0);
  gable.lineTo(0, 1.3);
  gable.lineTo(1.7, 0);
  gable.lineTo(-1.7, 0);
  put(c, toonMesh(new THREE.ExtrudeGeometry(gable, { depth: 4.9, bevelEnabled: false }), wall, { outline: 0.03 }), 0, 3, -2.45);
  // Steeple: a base, an open belfry on four posts, then the spire.
  put(c, box(1.3, 1.6, 1.3, wall, 0.035), 0, 4.0, 2.2);
  put(c, box(1.5, 0.14, 1.5, 0x8fa8d8, 0.02), 0, 4.85, 2.2);
  for (const [x, z] of [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ])
    put(c, box(0.14, 1.2, 0.14, wall, 0.015), x, 5.5, 2.2 + z);
  put(c, box(1.5, 0.14, 1.5, 0x8fa8d8, 0.02), 0, 6.15, 2.2);
  const spire = put(c, toonMesh(new THREE.ConeGeometry(1.05, 2.2, 4), 0x8fa8d8, { outline: 0.03 }), 0, 7.3, 2.2);
  spire.rotation.y = Math.PI / 4;
  put(c, box(0.08, 0.7, 0.08, Palette.yellow, 0.01), 0, 8.7, 2.2);
  put(c, box(0.4, 0.08, 0.08, Palette.yellow, 0.01), 0, 8.8, 2.2);
  const bell = live(put(c, new THREE.Group(), 0, 6.05, 2.2));
  put(bell, toonMesh(new THREE.CylinderGeometry(0.2, 0.4, 0.55, 12), Palette.yellow, { emissive: 0x332200, outline: 0.015 }), 0, -0.4, 0);
  put(bell, toonMesh(new THREE.SphereGeometry(0.08, 6, 5), 0xc9a24a, { outline: false }), 0, -0.72, 0);
  // Door, round window and steps.
  put(c, box(1, 1.7, 0.08, 0x8fa8d8, 0.015), 0, 0.85, 2.54);
  const rose = put(c, cyl(0.35, 0.35, 0.08, Palette.rose, 14, 0.015), 0, 2.4, 2.56);
  rose.rotation.x = Math.PI / 2;
  put(c, box(1.8, 0.16, 0.6, Palette.cream, 0.015), 0, 0.08, 2.9);
  for (const z of [-1.2, 0.2, 1.4]) for (const x of [-1, 1]) put(c, box(0.06, 1.1, 0.6, 0x8fa8d8, false), x * 1.71, 1.8, z - 0.3);
  return { group: c, bell };
}

/** Railway station with a platform behind it and a clock. */
export function station(): THREE.Group {
  const s = building({ w: 4.6, d: 2.8, h: 2.8, wall: 0xfff0a8, trim: 0xf0d878, roof: 0x7c8fb8, sign: 'DEPOT', porch: true });
  // Platform along the tracks (behind).
  put(s, box(12, 0.5, 2.2, WOOD_GREY, 0.025), 0, 0.25, -2.6);
  put(s, box(12, 0.08, 0.2, Palette.yellow, false), 0, 0.52, -3.6);
  for (const x of [-4.5, 4.5]) {
    put(s, bench(), x, 0.5, -2.2, Math.PI);
  }
  const clock = put(s, cyl(0.38, 0.38, 0.1, Palette.cream, 16, 0.015), 0, 4.2, 1.6);
  clock.rotation.x = Math.PI / 2;
  put(s, box(0.04, 0.26, 0.04, Palette.ink, false), 0, 4.3, 1.68);
  put(s, box(0.2, 0.04, 0.04, Palette.ink, false), 0.08, 4.2, 1.68);
  put(s, crate(0xe8b48c), 3.3, 0.85, -2.4, 0.3);
  put(s, sack(), 3.0, 0.65, -1.8);
  put(s, sack(), -3.2, 0.65, -1.9, 0.8);
  return s;
}

/** Tall water tower the trains fill up from. */
export function waterTower(spout = false): THREE.Group {
  const t = new THREE.Group();
  for (const [x, z] of [
    [-0.8, -0.8],
    [0.8, -0.8],
    [-0.8, 0.8],
    [0.8, 0.8],
  ]) {
    const leg = put(t, cyl(0.1, 0.14, 3.2, WOOD, 8, 0.02), x, 1.6, z);
    leg.rotation.set(z * -0.04, 0, x * 0.04);
  }
  for (const y of [1.2, 2.4]) {
    for (const rz of [0.6, -0.6]) {
      const brace = put(t, box(2, 0.06, 0.06, WOOD, false), 0, y, 0.82);
      brace.rotation.z = rz;
      const b2 = put(t, box(2, 0.06, 0.06, WOOD, false), 0, y, -0.82);
      b2.rotation.z = rz;
    }
  }
  put(t, cyl(1.3, 1.3, 1.8, 0xb5784a, 18, 0.04), 0, 4, 0);
  put(t, toonMesh(new THREE.ConeGeometry(1.45, 0.9, 18), Palette.coral, { outline: 0.04 }), 0, 5.35, 0);
  for (const y of [3.4, 4.6]) {
    const band = put(t, new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.05, 6, 24), toon(0x6b4f6e)), 0, y, 0);
    band.rotation.x = Math.PI / 2;
  }
  if (spout) {
    const pipe = put(t, cyl(0.14, 0.14, 2, IRON, 8, 0.015), 0, 3.6, 1.6);
    pipe.rotation.x = 1.0;
  }
  return t;
}

export function windmill(spinners: THREE.Object3D[]): THREE.Group {
  const w = new THREE.Group();
  for (const [x, z] of [
    [-0.6, -0.6],
    [0.6, -0.6],
    [-0.6, 0.6],
    [0.6, 0.6],
  ]) {
    const leg = put(w, cyl(0.06, 0.08, 5.2, WOOD, 6, 0.015), x * 0.6, 2.5, z * 0.6);
    leg.rotation.set(z * 0.1, 0, -x * 0.1);
  }
  for (const y of [1.4, 2.8, 4]) put(w, box(1.2 - y * 0.15, 0.06, 1.2 - y * 0.15, WOOD, false), 0, y, 0);
  put(w, box(0.4, 0.4, 0.6, IRON, 0.015), 0, 5.1, 0);
  const hub = live(put(w, new THREE.Group(), 0, 5.1, 0.4));
  for (let i = 0; i < 12; i++) {
    const arm = put(hub, new THREE.Group());
    arm.rotation.z = (i / 12) * Math.PI * 2;
    const blade = put(arm, box(0.3, 1.3, 0.04, i % 2 ? Palette.cream : Palette.coral, 0.012), 0, 0.85, 0);
    blade.rotation.y = 0.3;
  }
  put(w, box(0.06, 0.8, 1.6, Palette.cream, 0.015), 0, 5.1, -1);
  spinners.push(hub);
  return w;
}

/* ------------------------------------------------------------------ */
/* Small props                                                         */
/* ------------------------------------------------------------------ */

export function barrel(color = 0xb5784a): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.3, 0.26, 0.75, color, 12, 0.018), 0, 0.37, 0);
  for (const y of [0.15, 0.6]) {
    const hoop = put(g, new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 4, 14), toon(IRON)), 0, y, 0);
    hoop.rotation.x = Math.PI / 2;
  }
  return g;
}

export function crate(color: number = WOOD, s = 0.7): THREE.Group {
  const g = new THREE.Group();
  put(g, box(s, s, s, color, 0.018), 0, 0, 0);
  for (const r of [0.78, -0.78]) {
    const plank = put(g, box(s * 1.25, 0.06, s + 0.02, WOOD_DARK, false), 0, 0, 0);
    plank.rotation.z = r;
    plank.scale.x = 1;
  }
  return g;
}

export function sack(): THREE.Mesh {
  const m = toonMesh(new THREE.SphereGeometry(0.3, 10, 8), 0xe8d8b0, { outline: 0.015 });
  m.scale.set(1, 0.75, 0.85);
  return m;
}

export function hayBale(): THREE.Group {
  const g = new THREE.Group();
  const b = put(g, toonMesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 14), 0xf0d878, { outline: 0.02 }), 0, 0, 0);
  b.rotation.z = Math.PI / 2;
  for (const x of [-0.2, 0.2]) {
    const tie = put(g, new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 4, 16), toon(0xc9a85a)), x, 0, 0);
    tie.rotation.y = Math.PI / 2;
  }
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(1.6, 0.08, 0.4, WOOD, 0.012), 0, 0.42, 0);
  put(g, box(1.6, 0.4, 0.06, WOOD, 0.012), 0, 0.68, -0.18);
  for (const x of [-0.7, 0.7]) put(g, box(0.08, 0.42, 0.36, WOOD_DARK, false), x, 0.21, 0);
  return g;
}

export function sheriffStar(): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.34 : 0.16;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  return toonMesh(geo, Palette.yellow, { emissive: 0x332200, outline: 0.015 });
}

export function fence(length: number, color: number = WOOD): THREE.Group {
  const f = new THREE.Group();
  const posts = Math.max(2, Math.round(length / 1.4) + 1);
  for (let i = 0; i < posts; i++) put(f, box(0.16, 0.9, 0.16, color, 0.015), -length / 2 + (i / (posts - 1)) * length, 0.45, 0);
  for (const y of [0.35, 0.7]) put(f, box(length, 0.1, 0.08, color, 0.015), 0, y, 0);
  return f;
}

/** Ring of fence around a centre, with a gap for the gate. */
export function corral(r: number, gapAt = Math.PI / 2): THREE.Group {
  const g = new THREE.Group();
  const n = Math.round((Math.PI * 2 * r) / 1.6);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const d = Math.atan2(Math.sin(mid - gapAt), Math.cos(mid - gapAt));
    if (Math.abs(d) < 0.25) continue;
    const len = 2 * r * Math.sin((a1 - a0) / 2);
    const seg = put(g, fence(len), Math.cos(mid) * r, 0, Math.sin(mid) * r);
    seg.rotation.y = -mid + Math.PI / 2;
  }
  return g;
}

export function hitchingRail(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.9, 0.9]) put(g, cyl(0.07, 0.08, 1, WOOD, 6, 0.015), x, 0.5, 0);
  put(g, cyl(0.06, 0.06, 2, WOOD, 6, 0.015), 0, 0.9, 0).rotation.z = Math.PI / 2;
  return g;
}

export function trough(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(1.4, 0.45, 0.6, WOOD, 0.02), 0, 0.225, 0);
  const water = put(g, new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshBasicMaterial({ color: Palette.water })), 0, 0.46, 0);
  water.rotation.x = -Math.PI / 2;
  return g;
}

/** Stone well with a little roof and a bucket. */
export function well(): THREE.Group {
  const g = new THREE.Group();
  put(g, toonMesh(new THREE.CylinderGeometry(0.8, 0.85, 0.8, 14, 1), 0xd8ccd8, { outline: 0.025 }), 0, 0.4, 0);
  const water = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.62, 14), new THREE.MeshBasicMaterial({ color: 0x6fb7e8 })), 0, 0.7, 0);
  water.rotation.x = -Math.PI / 2;
  for (const x of [-0.7, 0.7]) put(g, box(0.12, 1.6, 0.12, WOOD, 0.015), x, 1.3, 0);
  put(g, cyl(0.06, 0.06, 1.5, WOOD_DARK, 6, 0.012), 0, 1.7, 0).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const r = put(g, box(1.0, 0.1, 1.5, Palette.coral, 0.02), s * 0.42, 2.3, 0);
    r.rotation.z = -s * 0.6;
  }
  put(g, cyl(0.16, 0.12, 0.25, WOOD_DARK, 8, 0.012), 0.2, 1.25, 0);
  return g;
}

/** Lamp post with a glowing lantern. */
export function lamp(glows: THREE.Sprite[]): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.06, 0.08, 2.4, IRON, 6, 0.015), 0, 1.2, 0);
  put(g, box(0.5, 0.06, 0.06, IRON, false), 0.22, 2.35, 0);
  put(g, toonMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8), Palette.butter, { emissive: 0x665500, outline: 0.012 }), 0.42, 2.1, 0);
  put(g, toonMesh(new THREE.ConeGeometry(0.18, 0.15, 8), IRON, { outline: 0.01 }), 0.42, 2.32, 0);
  const glow = live(glowSprite(0xffd27a, 1.3, 0.8));
  put(g, glow, 0.42, 2.1, 0);
  glows.push(glow);
  return g;
}

/** Notice board with a couple of wanted posters. */
export function wantedBoard(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.7, 0.7]) put(g, box(0.1, 1.8, 0.1, WOOD, 0.012), x, 0.9, 0);
  put(g, box(1.6, 1, 0.08, WOOD_DARK, 0.015), 0, 1.3, 0);
  for (const [x, rot] of [
    [-0.38, 0.06],
    [0.36, -0.05],
  ]) {
    const p = put(g, signPlane('WANTED', 0.6, 0.78, '#fff0c8', '#c0504a', 30), x, 1.3, 0.05);
    p.rotation.z = rot;
  }
  return g;
}

/** Leaning wagon wheel. */
export function wagonWheel(r = 0.6): THREE.Group {
  const g = new THREE.Group();
  const rim = put(g, new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 5, 18), toon(WOOD_DARK)), 0, 0, 0);
  rim.castShadow = true;
  for (let i = 0; i < 6; i++) {
    const s = put(g, box(0.05, r * 2, 0.04, WOOD, false), 0, 0, 0);
    s.rotation.z = (i / 6) * Math.PI;
  }
  put(g, cyl(0.1, 0.1, 0.12, IRON, 8, false), 0, 0, 0).rotation.x = Math.PI / 2;
  return g;
}

/** Covered wagon with a canvas bonnet. */
export function coveredWagon(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(1.4, 0.5, 3, WOOD, 0.025), 0, 0.95, 0);
  const bonnet = put(g, toonMesh(new THREE.CylinderGeometry(0.85, 0.85, 2.8, 14, 1, true, Math.PI / 2, Math.PI), Palette.cream, { outline: 0.03 }), 0, 1.2, 0);
  bonnet.rotation.x = Math.PI / 2;
  (bonnet.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  for (const z of [-1.1, 1.1]) {
    for (const x of [-0.78, 0.78]) {
      const w = put(g, wagonWheel(0.5), x, 0.5, z);
      w.rotation.y = Math.PI / 2;
    }
  }
  const tongue = put(g, box(0.1, 0.1, 1.6, WOOD_DARK, 0.012), 0, 0.5, 2.2);
  tongue.rotation.x = 0.25;
  put(g, barrel(), 0.85, 0.1, -0.3).scale.setScalar(0.7);
  return g;
}

/** Campfire: ring of stones, crossed logs, flickering flame. */
export function campfire(): { group: THREE.Group; flame: THREE.Object3D; glow: THREE.Sprite; smoke: Smoke } {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    put(g, toonMesh(new THREE.DodecahedronGeometry(0.16, 0), 0xb8b0c8, { outline: 0.012 }), Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55);
  }
  for (let i = 0; i < 3; i++) {
    const log = put(g, cyl(0.08, 0.08, 0.8, WOOD_DARK, 6, 0.012), 0, 0.15, 0);
    log.rotation.set(Math.PI / 2 - 0.3, (i / 3) * Math.PI, 0);
  }
  const flame = live(new THREE.Group());
  put(g, flame, 0, 0.1, 0);
  for (const [c, s, y] of [
    [0xff8a4a, 0.32, 0.3],
    [0xffd23f, 0.2, 0.32],
  ] as const) {
    const f = put(flame, new THREE.Mesh(new THREE.ConeGeometry(s, s * 3, 6), toon(c, { emissive: c })), 0, y, 0);
    f.castShadow = false;
  }
  const glow = live(glowSprite(0xff9040, 2, 0.6));
  put(g, glow, 0, 0.5, 0);
  const smoke = new Smoke(5, 0.25, 3, 0.4, 0xe0d8ec, new THREE.Vector3(0.3, 0, -0.2));
  live(put(g, smoke.group, 0, 0.9, 0));
  // Logs to sit on and a coffee pot.
  for (const a of [0.4, 2.6]) {
    const seat = put(g, new THREE.Group(), Math.cos(a) * 1.4, 0.2, Math.sin(a) * 1.4, -a - Math.PI / 2);
    put(seat, cyl(0.2, 0.2, 1.3, WOOD_DARK, 8, 0.015), 0, 0, 0).rotation.z = Math.PI / 2;
  }
  put(g, cyl(0.1, 0.14, 0.25, IRON, 8, 0.01), 0.45, 0.28, 0.2);
  return { group: g, flame, glow, smoke };
}

export function outhouse(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(1, 2, 1, 0xc8b4e0, 0.025), 0, 1, 0);
  const roof = put(g, box(1.3, 0.1, 1.3, 0x8a78c0, 0.02), 0, 2.1, 0);
  roof.rotation.x = 0.2;
  put(g, box(0.75, 1.6, 0.06, WOOD, 0.012), 0, 0.85, 0.52);
  const moon = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.1, 10, 0.6, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: Palette.ink })), 0, 1.4, 0.56);
  moon.rotation.z = 0;
  return g;
}

/** Wooden flagpole with a pastel pennant (pennant animated). */
export function flagpole(): { group: THREE.Group; flag: THREE.Object3D } {
  const g = new THREE.Group();
  put(g, cyl(0.06, 0.08, 4.5, WOOD_GREY, 6, 0.015), 0, 2.25, 0);
  put(g, toonMesh(new THREE.SphereGeometry(0.1, 8, 6), Palette.yellow, { outline: 0.01 }), 0, 4.55, 0);
  const flag = live(put(g, new THREE.Group(), 0, 4.1, 0));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.35);
  shape.lineTo(1.2, 0);
  shape.lineTo(0, -0.35);
  const cloth = put(flag, new THREE.Mesh(new THREE.ShapeGeometry(shape), toon(Palette.coral)), 0, 0, 0);
  (cloth.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  const star = put(flag, new THREE.Mesh(new THREE.CircleGeometry(0.1, 5), new THREE.MeshBasicMaterial({ color: Palette.cream, side: THREE.DoubleSide })), 0.35, 0, 0.01);
  star.rotation.z = Math.PI / 2;
  return { group: g, flag };
}

/** Telegraph pole; returns the cross-arm height for wiring. */
export function telegraphPole(): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.08, 0.1, 4.2, WOOD_DARK, 6, 0.015), 0, 2.1, 0);
  put(g, box(1.2, 0.1, 0.1, WOOD_DARK, 0.01), 0, 3.9, 0);
  for (const x of [-0.45, 0.45]) put(g, cyl(0.05, 0.05, 0.12, Palette.mint, 6, false), x, 4, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* Nature                                                              */
/* ------------------------------------------------------------------ */

export function cactus(h = 2.4): THREE.Group {
  const c = new THREE.Group();
  const trunk = toonMesh(new THREE.CapsuleGeometry(0.32, h, 6, 12), CACTUS, { outline: 0.03 });
  trunk.position.y = h / 2 + 0.3;
  c.add(trunk);
  for (const side of [-1, 1]) {
    const armH = h * (side < 0 ? 0.35 : 0.5);
    const elbow = toonMesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), CACTUS, { outline: 0.025 });
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(side * 0.55, h * (side < 0 ? 0.45 : 0.6), 0);
    const arm = toonMesh(new THREE.CapsuleGeometry(0.2, armH, 4, 10), CACTUS, { outline: 0.025 });
    arm.position.set(side * 0.82, elbow.position.y + armH / 2, 0);
    c.add(elbow, arm);
  }
  return c;
}

/** Prickly pear: a stack of flat paddles, sometimes with pink fruit. */
export function pricklyPear(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const pad = (x: number, y: number, rz: number, s: number, parent: THREE.Object3D) => {
    const m = put(parent, toonMesh(new THREE.SphereGeometry(0.4, 10, 8), 0x8fd49a, { outline: 0.018 }), x, y, 0);
    m.scale.set(0.8 * s, 1 * s, 0.25 * s);
    m.rotation.z = rz;
    return m;
  };
  pad(0, 0.38, 0, 1, g);
  pad(-0.35, 0.85, 0.5, 0.75, g);
  pad(0.32, 0.9, -0.4, 0.8, g);
  if (rand() < 0.7) pad(0.05, 1.25, 0.1, 0.6, g);
  for (let i = 0; i < 3; i++) put(g, toonMesh(new THREE.SphereGeometry(0.07, 6, 5), Palette.rose, { outline: 0.008 }), -0.4 + i * 0.35, 1.15 + rand() * 0.25, 0.05);
  return g;
}

/** Ribbed barrel cactus with a flower on top. */
export function barrelCactus(): THREE.Group {
  const g = new THREE.Group();
  const b = put(g, toonMesh(new THREE.SphereGeometry(0.45, 12, 10), 0x6fbf86, { outline: 0.02 }), 0, 0.4, 0);
  b.scale.set(1, 1.1, 1);
  put(g, toonMesh(new THREE.SphereGeometry(0.14, 8, 6), 0xffb36b, { outline: 0.01 }), 0, 0.9, 0);
  return g;
}

export function deadTree(): THREE.Group {
  const g = new THREE.Group();
  const bark = 0x9a8a9e;
  put(g, cyl(0.12, 0.22, 2.6, bark, 6, 0.02), 0, 1.3, 0);
  for (const [y, rz, ry, l] of [
    [1.8, 0.7, 0, 1.2],
    [2.2, -0.8, 0.5, 1],
    [1.3, -0.9, 2.2, 0.8],
    [2.5, 0.4, 3, 0.7],
  ]) {
    const arm = put(g, new THREE.Group(), 0, y, 0, ry);
    const b = put(arm, cyl(0.04, 0.08, l, bark, 5, 0.015), 0, l / 2, 0);
    arm.rotation.z = rz;
    b.castShadow = true;
  }
  return g;
}

/** Layered flat-topped rock with pastel strata. */
export function mesa(w: number, h: number, bands = [TERRACOTTA, 0xf0b48c, 0xe08a6a, 0xf5c49c], outline: number | false = 0.06, seg = 9): THREE.Group {
  const m = new THREE.Group();
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const r = w * (1 - i * 0.07);
    put(m, toonMesh(new THREE.CylinderGeometry(r * 0.94, r, h / layers, seg), bands[i % bands.length], { outline: outline && outline }), 0, (i + 0.5) * (h / layers), 0);
  }
  return m;
}

/** Long cliff made of overlapping strata blocks. */
export function cliff(len: number, h: number, rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const bands = [0xe59a74, 0xf0b48c, 0xe08a6a, 0xf5c49c, 0xeaa080];
  let x = -len / 2;
  while (x < len / 2) {
    const w = 3 + rand() * 3;
    const hh = h * (0.7 + rand() * 0.45);
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const inset = i * 0.25;
      put(g, box(w - inset, hh / layers, 4 - inset, bands[(((i + Math.floor(x)) % bands.length) + bands.length) % bands.length], 0.05), x + w / 2, (i + 0.5) * (hh / layers), rand() * 1.2 - 0.6);
    }
    x += w * 0.8;
  }
  return g;
}

/** Natural sandstone arch. */
export function rockArch(): THREE.Group {
  const g = new THREE.Group();
  const bands = [TERRACOTTA, 0xf0b48c, 0xe08a6a];
  for (const x of [-2.4, 2.4]) {
    const m = put(g, mesa(1.2, 5, bands, 0.05, 7), x, 0, 0);
    m.scale.z = 0.8;
  }
  const top = put(g, toonMesh(new THREE.TorusGeometry(2.4, 0.75, 8, 16, Math.PI), 0xf0b48c, { outline: 0.05 }), 0, 4.8, 0);
  top.scale.z = 0.8;
  put(g, toonMesh(new THREE.DodecahedronGeometry(0.7, 0), 0xe59a74, { outline: 0.03 }), 3.6, 0.35, 1);
  return g;
}

/** Desert pond with reeds and lily pads. */
export function pond(r: number): THREE.Group {
  const g = new THREE.Group();
  const bank = put(g, new THREE.Mesh(new THREE.CircleGeometry(r + 0.6, 24), toon(0xc9e6a0)), 0, 0.01, 0);
  bank.rotation.x = -Math.PI / 2;
  bank.scale.y = 0.75;
  const water = put(g, new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: Palette.water })), 0, 0.03, 0);
  water.rotation.x = -Math.PI / 2;
  water.scale.y = 0.75;
  const rand = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand(i) * 0.3;
    const reed = put(g, cyl(0.04, 0.05, 0.9 + rand(i + 9) * 0.6, 0x7cc98a, 5, false), Math.cos(a) * (r + 0.2), 0.5, Math.sin(a) * (r + 0.2) * 0.75);
    reed.rotation.z = (rand(i + 3) - 0.5) * 0.4;
    if (i % 3 === 0) put(g, cyl(0.07, 0.07, 0.3, 0x9a6f5a, 6, false), reed.position.x, 1.1 + rand(i + 9) * 0.3, reed.position.z);
  }
  for (let i = 0; i < 4; i++) {
    const pad = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), new THREE.MeshBasicMaterial({ color: 0x8fd49a })), Math.cos(i * 2) * r * 0.5, 0.05, Math.sin(i * 2) * r * 0.35);
    pad.rotation.x = -Math.PI / 2;
  }
  return g;
}

/** Graveyard on a little hill: crosses, headstones, picket fence. */
export function bootHill(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const hill = put(g, toonMesh(new THREE.SphereGeometry(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8c48e, { outline: 0.04 }), 0, 0, 0);
  hill.scale.set(1, 0.22, 0.8);
  const top = (x: number, z: number) => 1.1 * Math.sqrt(Math.max(0, 1 - (x / 5) ** 2 - (z / 4) ** 2));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      const x = -2.4 + i * 1.6 + (row ? 0.8 : 0);
      const z = -1 + row * 1.8;
      const y = top(x, z);
      if ((i + row) % 2) {
        put(g, box(0.1, 1, 0.1, WOOD_GREY, 0.012), x, y + 0.5, z).rotation.z = (rand() - 0.5) * 0.3;
        put(g, box(0.6, 0.1, 0.1, WOOD_GREY, 0.012), x, y + 0.75, z);
      } else {
        const stone = put(g, toonMesh(new THREE.CapsuleGeometry(0.28, 0.4, 4, 8), 0xc8c0d8, { outline: 0.015 }), x, y + 0.35, z);
        stone.scale.z = 0.35;
        stone.rotation.z = (rand() - 0.5) * 0.3;
      }
      put(g, box(0.5, 0.12, 0.9, 0xd8b07a, false), x, y + 0.06, z + 0.6);
    }
  }
  put(g, deadTree(), 3.2, top(3.2, -1), -1);
  const gate = put(g, new THREE.Group(), 0, 0, 3.6);
  for (const x of [-0.8, 0.8]) put(gate, box(0.14, 2, 0.14, WOOD_DARK, 0.015), x, 1, 0);
  put(gate, box(2, 0.14, 0.14, WOOD_DARK, 0.015), 0, 2, 0);
  put(gate, signPlane('BOOT HILL', 1.6, 0.36, '#c99a6b', '#fff6e6', 30), 0, 1.65, 0.08);
  for (const s of [-1, 1]) put(g, fence(3), s * 2.4, 0, 3.6);
  return g;
}

/* ------------------------------------------------------------------ */
/* Critters                                                            */
/* ------------------------------------------------------------------ */

/** Pastel pony with a swishing tail and a nodding head. */
export function horse(coat = 0xe8b48c, mane = 0x8a5a3b, saddle: number | null = Palette.coral): THREE.Group {
  const h = new THREE.Group();
  const body = toonMesh(new THREE.CapsuleGeometry(0.42, 0.9, 6, 12), coat, { outline: 0.025 });
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.15;
  h.add(body);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [
    [-0.5, -0.22],
    [-0.5, 0.22],
    [0.5, -0.22],
    [0.5, 0.22],
  ]) {
    const hip = put(h, new THREE.Group(), x, 0.9, z);
    put(hip, cyl(0.1, 0.09, 0.85, coat, 8, 0.015), 0, -0.42, 0);
    put(hip, cyl(0.11, 0.12, 0.12, Palette.ink, 8, false), 0, -0.84, 0);
    legs.push(hip);
  }
  const neck = new THREE.Group();
  neck.position.set(0.7, 1.35, 0);
  const neckMesh = toonMesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 10), coat, { outline: 0.02 });
  neckMesh.rotation.z = -0.6;
  neckMesh.position.set(0.18, 0.28, 0);
  const head = toonMesh(new THREE.CapsuleGeometry(0.19, 0.4, 4, 10), coat, { outline: 0.02 });
  head.rotation.z = Math.PI / 2 + 0.4;
  head.position.set(0.55, 0.55, 0);
  const maneMesh = toonMesh(new THREE.BoxGeometry(0.12, 0.6, 0.1), mane, { outline: 0.01 });
  maneMesh.rotation.z = -0.6;
  maneMesh.position.set(0.05, 0.4, 0);
  neck.add(neckMesh, head, maneMesh);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    eye.position.set(0.55, 0.68, side * 0.16);
    const ear = toonMesh(new THREE.ConeGeometry(0.06, 0.18, 6), coat, { outline: 0.01 });
    ear.position.set(0.4, 0.86, side * 0.09);
    neck.add(eye, ear);
  }
  h.add(neck);
  const tail = new THREE.Group();
  tail.position.set(-0.85, 1.3, 0);
  const tailMesh = toonMesh(new THREE.CapsuleGeometry(0.08, 0.55, 4, 8), mane, { outline: 0.012 });
  tailMesh.position.y = -0.3;
  tail.add(tailMesh);
  tail.rotation.z = -0.4;
  h.add(tail);
  if (saddle !== null) put(h, box(0.5, 0.12, 0.9, saddle, 0.015), 0, 1.55, 0);
  for (const o of [neck, tail, ...legs]) live(o);
  h.userData = { neck, tail, legs };
  return bakeLocal(h);
}

/** Spotted pastel cow. Faces +x like the horse. */
export function cow(spot = 0x8a7aa8): THREE.Group {
  const c = new THREE.Group();
  const coat = 0xfff6e6;
  const body = put(c, toonMesh(new THREE.CapsuleGeometry(0.5, 1, 6, 12), coat, { outline: 0.025 }), 0, 1.05, 0);
  body.rotation.z = Math.PI / 2;
  for (const [x, z, s] of [
    [0.2, 0.45, 0.3],
    [-0.4, -0.42, 0.26],
    [-0.3, 0.3, 0.2],
  ]) {
    const p = put(c, new THREE.Mesh(new THREE.CircleGeometry(s, 10), new THREE.MeshBasicMaterial({ color: spot })), x, 1.2, z + Math.sign(z) * 0.07);
    p.rotation.y = z > 0 ? 0 : Math.PI;
  }
  for (const [x, z] of [
    [-0.55, -0.25],
    [-0.55, 0.25],
    [0.55, -0.25],
    [0.55, 0.25],
  ]) {
    put(c, cyl(0.11, 0.1, 0.7, coat, 8, 0.015), x, 0.35, z);
    put(c, cyl(0.12, 0.12, 0.1, Palette.ink, 8, false), x, 0.05, z);
  }
  const head = live(put(c, new THREE.Group(), 0.85, 1.15, 0));
  put(head, toonMesh(new THREE.SphereGeometry(0.32, 12, 8), coat, { outline: 0.02 }), 0.2, 0, 0).scale.set(1.2, 0.95, 0.95);
  put(head, toonMesh(new THREE.SphereGeometry(0.2, 10, 8), Palette.rose, { outline: 0.015 }), 0.5, -0.1, 0).scale.set(0.8, 0.8, 1.2);
  for (const s of [-1, 1]) {
    put(head, new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: Palette.ink })), 0.4, 0.12, s * 0.17);
    const horn = put(head, toonMesh(new THREE.ConeGeometry(0.05, 0.22, 6), Palette.cream, { outline: 0.01 }), 0.1, 0.32, s * 0.2);
    horn.rotation.x = s * 0.5;
    const ear = put(head, toonMesh(new THREE.SphereGeometry(0.1, 6, 5), spot, { outline: 0.01 }), 0.05, 0.15, s * 0.32);
    ear.scale.set(0.5, 0.4, 1);
  }
  const tail = live(put(c, new THREE.Group(), -0.95, 1.25, 0));
  put(tail, cyl(0.03, 0.03, 0.6, coat, 5, 0.01), 0, -0.3, 0);
  put(tail, toonMesh(new THREE.SphereGeometry(0.08, 6, 5), spot, { outline: 0.01 }), 0, -0.62, 0);
  c.userData = { head, tail };
  return bakeLocal(c);
}

/** Round little hen. */
export function chicken(color: number = Palette.cream): THREE.Group {
  const c = new THREE.Group();
  const body = put(c, toonMesh(new THREE.SphereGeometry(0.2, 10, 8), color, { outline: 0.012 }), 0, 0.25, 0);
  body.scale.set(1.2, 1, 1);
  const tailTuft = put(c, toonMesh(new THREE.ConeGeometry(0.1, 0.2, 6), color, { outline: 0.01 }), -0.24, 0.35, 0);
  tailTuft.rotation.z = 0.8;
  const head = live(put(c, new THREE.Group(), 0.16, 0.38, 0));
  put(head, toonMesh(new THREE.SphereGeometry(0.11, 8, 6), color, { outline: 0.01 }), 0.04, 0.04, 0);
  const beak = put(head, toonMesh(new THREE.ConeGeometry(0.035, 0.1, 5), Palette.yellow, { outline: false }), 0.16, 0.03, 0);
  beak.rotation.z = -Math.PI / 2;
  put(head, toonMesh(new THREE.SphereGeometry(0.04, 6, 5), Palette.coral, { outline: false }), 0.05, 0.15, 0);
  for (const s of [-1, 1]) put(head, new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), new THREE.MeshBasicMaterial({ color: Palette.ink })), 0.1, 0.07, s * 0.075);
  for (const s of [-1, 1]) put(c, box(0.03, 0.12, 0.03, 0xffb36b, false), 0, 0.06, s * 0.07);
  c.userData = { head };
  return bakeLocal(c);
}

/** Prairie dog that pops out of its burrow. */
export function prairieDog(): { group: THREE.Group; body: THREE.Object3D } {
  const g = new THREE.Group();
  const mound = put(g, toonMesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe0bc88, { outline: 0.015 }), 0, 0, 0);
  mound.scale.y = 0.4;
  const hole = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.17, 10), new THREE.MeshBasicMaterial({ color: Palette.ink })), 0, 0.185, 0);
  hole.rotation.x = -Math.PI / 2;
  const body = new THREE.Group();
  const fur = 0xd8a878;
  put(body, toonMesh(new THREE.CapsuleGeometry(0.13, 0.25, 4, 8), fur, { outline: 0.012 }), 0, 0.28, 0);
  put(body, toonMesh(new THREE.SphereGeometry(0.11, 8, 6), fur, { outline: 0.012 }), 0, 0.55, 0.03);
  for (const s of [-1, 1]) {
    put(body, new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), new THREE.MeshBasicMaterial({ color: Palette.ink })), s * 0.05, 0.58, 0.12);
    put(body, toonMesh(new THREE.SphereGeometry(0.035, 5, 4), fur, { outline: 0.006 }), s * 0.09, 0.64, 0);
  }
  put(body, toonMesh(new THREE.SphereGeometry(0.03, 5, 4), Palette.rose, { outline: false }), 0, 0.53, 0.14);
  const baked = put(g, bakeLocal(body));
  return { group: g, body: baked };
}

/** Speedy roadrunner (faces +x). */
export function roadrunner(): THREE.Group {
  const r = new THREE.Group();
  const col = 0x9a8ac0;
  const body = put(r, toonMesh(new THREE.SphereGeometry(0.22, 10, 8), col, { outline: 0.014 }), 0, 0.55, 0);
  body.scale.set(1.5, 0.9, 0.9);
  const tail = put(r, box(0.5, 0.08, 0.14, 0x7a6aa8, 0.01), -0.45, 0.68, 0);
  tail.rotation.z = 0.5;
  put(r, toonMesh(new THREE.SphereGeometry(0.14, 8, 6), col, { outline: 0.012 }), 0.3, 0.8, 0);
  const crest = put(r, toonMesh(new THREE.ConeGeometry(0.06, 0.25, 5), 0x7a6aa8, { outline: 0.01 }), 0.24, 0.98, 0);
  crest.rotation.z = 0.7;
  const beak = put(r, toonMesh(new THREE.ConeGeometry(0.04, 0.28, 5), Palette.yellow, { outline: false }), 0.52, 0.78, 0);
  beak.rotation.z = -Math.PI / 2;
  for (const s of [-1, 1]) put(r, new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), new THREE.MeshBasicMaterial({ color: Palette.ink })), 0.38, 0.84, s * 0.1);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = live(put(r, new THREE.Group(), 0, 0.45, s * 0.08));
    put(hip, box(0.04, 0.45, 0.04, 0xffb36b, false), 0, -0.22, 0);
    legs.push(hip);
  }
  r.userData = { legs };
  return bakeLocal(r);
}
