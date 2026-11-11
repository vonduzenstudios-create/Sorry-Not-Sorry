import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { glowSprite, textTexture } from './decor';
import { box, cyl, live, put } from './westernProps';

/*
 * Props for Hollow Hill Manor. Everything is built at the origin facing +z;
 * static parts get baked by the board, and anything that moves is marked
 * `live` and handed back through userData so the board can animate it.
 */

export const WALL = 0xbfaee6;
export const WALL_DARK = 0xa592d4;
export const TRIM = 0xfff6e6;
export const ROOF = 0x6a5596;
export const ROOF_DARK = 0x56457e;
export const STONE = 0xc9c3dc;
export const STONE_DARK = 0xa59fbe;
export const IRON = 0x4a3f66;
export const HEDGE = 0x74c39e;
export const HEDGE_DARK = 0x5eae8a;
export const BARK = 0x7d6a8e;
export const PUMPKIN = 0xffa65c;
export const WINDOW = 0xffe39a;
export const WINDOW_GLOW = 0x806010;
export const GHOST = 0xf8f6ff;
export const WISP = 0x9ff5d6;

/** Hip roof: a four-sided cone squashed to a w x d footprint. */
export function hipRoof(w: number, d: number, h: number, color: number, outline: number | false = 0.03): THREE.Mesh {
  // Turned 45 degrees the cone's base is a square with side sqrt(2); turn the
  // geometry itself so the scale below stretches along the walls.
  const geo = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
  const m = toonMesh(geo, color, { outline });
  m.scale.set(w / Math.SQRT2, h, d / Math.SQRT2);
  return m;
}

/** Triangular prism (a gable or pediment): w wide, h tall, d deep, apex up. */
export function prism(w: number, h: number, d: number, color: number, outline: number | false = 0.03): THREE.Mesh {
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return toonMesh(geo, color, { outline });
}

/** Steep pointed spire for towers and turrets. */
function spire(r: number, h: number, color: number, seg = 8): THREE.Mesh {
  return toonMesh(new THREE.ConeGeometry(r, h, seg), color, { outline: 0.03 });
}

/** Glowing window with a cream frame and a cross bar. Faces +z. */
function windowPane(w: number, h: number, flicker?: THREE.Mesh[]): THREE.Group {
  const g = new THREE.Group();
  put(g, box(w + 0.2, h + 0.2, 0.08, TRIM, 0.012), 0, 0, 0);
  const glass = put(g, toonMesh(new THREE.BoxGeometry(w, h, 0.1), WINDOW, { emissive: WINDOW_GLOW, outline: false }), 0, 0, 0.02);
  if (flicker) {
    // A shared material per board so a whole set of windows flickers together.
    live(glass);
    flicker.push(glass);
  }
  put(g, box(0.06, h, 0.06, TRIM, false), 0, 0, 0.08);
  put(g, box(w, 0.06, 0.06, TRIM, false), 0, h * 0.1, 0.08);
  return g;
}

/** Round attic window that glows mint. */
function roundWindow(r: number): THREE.Group {
  const g = new THREE.Group();
  const frame = put(g, cyl(r + 0.1, r + 0.1, 0.08, TRIM, 16, 0.012), 0, 0, 0);
  frame.rotation.x = Math.PI / 2;
  const glass = put(g, toonMesh(new THREE.CylinderGeometry(r, r, 0.1, 16), WISP, { emissive: 0x206650, outline: false }), 0, 0, 0.02);
  glass.rotation.x = Math.PI / 2;
  return g;
}

/**
 * The manor: a three-storey house with a turret, a tall tower, a wrap of
 * porch and two smoking chimneys. Front faces +z. userData: vane, flicker
 * (window meshes), smokeAt (chimney tops), lantern.
 */
export function manor(): THREE.Group {
  const g = new THREE.Group();
  const flicker: THREE.Mesh[] = [];
  // Stone plinth.
  put(g, box(11, 0.7, 7.6, STONE_DARK, 0.03), 0, 0.35, 0);
  // Main block, two floors, and a narrower third floor under the roof.
  put(g, box(9.6, 4.6, 6.4, WALL, 0.04), 0, 3, 0);
  put(g, box(9.9, 0.25, 6.7, TRIM, 0.02), 0, 3.05, 0);
  put(g, box(9.9, 0.3, 6.7, TRIM, 0.02), 0, 5.35, 0);
  put(g, hipRoof(10.6, 7.4, 3.6, ROOF), 0, 7.3, 0);
  // Front gable over the door.
  put(g, prism(3.8, 2.3, 1.6, ROOF_DARK), 0, 5.45, 2.5);
  put(g, prism(3.1, 1.85, 0.1, WALL_DARK, false), 0, 5.5, 3.32);
  put(g, roundWindow(0.4), 0, 6.1, 3.38);
  // Windows across the two main floors.
  for (const y of [1.9, 4.2]) {
    for (const x of [-3.6, -1.8, 1.8, 3.6]) {
      put(g, windowPane(0.8, 1.2, (x + y) % 2 === 0 ? flicker : undefined), x, y, 3.22);
      // Lilac shutters.
      for (const s of [-1, 1]) put(g, box(0.3, 1.3, 0.06, ROOF, 0.01), x + s * 0.62, y, 3.24);
    }
  }
  // Side windows.
  for (const z of [-1.6, 1.6]) {
    for (const s of [-1, 1]) {
      const w = put(g, windowPane(0.8, 1.2), s * 4.82, 4.2, z);
      w.rotation.y = (s * Math.PI) / 2;
    }
  }
  // Dormers on the roof.
  for (const x of [-3, 3]) {
    put(g, box(1.3, 1.2, 1.2, WALL_DARK, 0.02), x, 6.2, 2.4);
    put(g, hipRoof(1.6, 1.5, 0.9, ROOF_DARK, 0.02), x, 7.25, 2.4);
    put(g, windowPane(0.6, 0.7, flicker), x, 6.15, 3.02);
  }
  // Chimneys.
  const smokeAt: THREE.Vector3[] = [];
  for (const [x, z] of [
    [-3.4, -1.6],
    [2.6, -2.2],
  ]) {
    put(g, box(0.8, 3, 0.8, STONE_DARK, 0.025), x, 7.8, z);
    put(g, box(1, 0.25, 1, STONE, 0.02), x, 9.35, z);
    smokeAt.push(new THREE.Vector3(x, 9.5, z));
  }

  // Front porch with columns, a little roof and steps.
  put(g, box(6, 0.4, 2.2, TRIM, 0.02), 0, 0.85, 4.2);
  for (let i = 0; i < 3; i++) put(g, box(2.2 - i * 0.0, 0.22, 0.45, STONE, 0.015), 0, 0.11 + i * 0.22, 5.85 - i * 0.4);
  for (const x of [-2.7, -1, 1, 2.7]) put(g, cyl(0.14, 0.17, 2.6, TRIM, 10, 0.015), x, 2.3, 5.1);
  put(g, box(6.4, 0.25, 2.6, TRIM, 0.02), 0, 3.7, 4.3);
  put(g, hipRoof(6.6, 2.8, 0.7, ROOF_DARK, 0.02), 0, 4.15, 4.3);
  // Rail between the columns.
  for (const s of [-1, 1]) {
    put(g, box(1.5, 0.08, 0.08, TRIM, 0.01), s * 1.85, 1.75, 5.1);
    for (let i = 0; i < 5; i++) put(g, box(0.05, 0.6, 0.05, TRIM, false), s * (1.25 + i * 0.3), 1.4, 5.1);
  }
  // Door: tall, rose coloured, with a brass knocker and a fanlight.
  put(g, box(1.5, 2.4, 0.2, 0x9b6a8e, 0.02), 0, 2.25, 3.24);
  put(g, box(0.06, 2.3, 0.05, 0x7d5274, false), 0, 2.25, 3.36);
  const fan = put(g, toonMesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 16, 1, false, -Math.PI / 2, Math.PI), WINDOW, { emissive: WINDOW_GLOW, outline: 0.012 }), 0, 3.45, 3.24);
  fan.rotation.x = Math.PI / 2;
  put(g, toonMesh(new THREE.TorusGeometry(0.14, 0.035, 6, 12), Palette.yellow, { outline: false }), 0.4, 2.2, 3.4);
  // Porch lantern.
  const lantern = live(glowSprite(0xffd27a, 1.6, 0.85));
  put(g, lantern, 1.2, 3.2, 3.6);
  put(g, toonMesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), Palette.butter, { emissive: 0x665500, outline: 0.012 }), 1.2, 3.2, 3.5);

  // Round turret on the west corner.
  put(g, cyl(1.3, 1.3, 6.4, WALL_DARK, 16, 0.035), -5, 3.9, 3);
  put(g, cyl(1.45, 1.45, 0.25, TRIM, 16, 0.015), -5, 5.3, 3);
  put(g, spire(1.7, 3.4, ROOF), -5, 8.8, 3);
  for (const y of [2.2, 4.4]) put(g, windowPane(0.55, 0.9, y > 3 ? flicker : undefined), -5, y, 4.3);

  // Square tower at the back east corner, with a bat-wing weathervane.
  put(g, box(2.8, 7, 2.8, WALL, 0.04), 3.9, 4.2, -1.6);
  put(g, box(3.1, 0.3, 3.1, TRIM, 0.02), 3.9, 7.7, -1.6);
  put(g, hipRoof(3.6, 3.6, 3, ROOF), 3.9, 9.35, -1.6);
  put(g, roundWindow(0.45), 3.9, 6.6, -0.17);
  put(g, cyl(0.04, 0.04, 1, IRON, 5, false), 3.9, 11.2, -1.6);
  const vane = live(new THREE.Group());
  put(g, vane, 3.9, 11.5, -1.6);
  // A little bat silhouette on the vane, plus an arrow.
  put(vane, box(1.3, 0.06, 0.06, IRON, false), 0, 0, 0);
  const tip = put(vane, toonMesh(new THREE.ConeGeometry(0.12, 0.3, 4), IRON, { outline: false }), 0.75, 0, 0);
  tip.rotation.z = -Math.PI / 2;
  for (const s of [-1, 1]) {
    const wing = put(vane, toonMesh(new THREE.ConeGeometry(0.22, 0.6, 3), IRON, { outline: false }), -0.5, 0.2, s * 0.25);
    wing.rotation.x = (s * Math.PI) / 2;
  }

  // Ivy creeping up the west wall.
  for (let i = 0; i < 18; i++) {
    const leaf = put(g, toonMesh(new THREE.IcosahedronGeometry(0.28, 0), HEDGE, { outline: 0.012 }), -3.1 + Math.sin(i * 1.7) * 0.9, 0.9 + i * 0.27, 3.25);
    leaf.scale.set(1, 0.8, 0.4);
  }

  g.userData = { vane, flicker, smokeAt, lantern };
  return g;
}

/** Straight run of hedge with a softly rounded top. */
export function hedge(length: number, h = 1.6, w = 1): THREE.Group {
  const g = new THREE.Group();
  put(g, box(length, h, w, HEDGE, 0.03), 0, h / 2, 0);
  const n = Math.max(2, Math.round(length / 0.9));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + ((i + 0.5) / n) * length;
    const bump = put(g, toonMesh(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? HEDGE : HEDGE_DARK, { outline: 0.02 }), x, h, 0);
    bump.scale.set(length / n / 1.0, 0.5, w);
  }
  return g;
}

/** A headstone in one of a few shapes, picked by `kind`. */
export function headstone(kind: number, tint = 0): THREE.Group {
  const g = new THREE.Group();
  const c = [STONE, 0xd8d3ea, 0xbdb6d4][tint % 3];
  switch (kind % 4) {
    case 0: {
      put(g, box(0.75, 0.8, 0.2, c, 0.015), 0, 0.4, 0);
      const top = put(g, cyl(0.375, 0.375, 0.2, c, 12, 0.015), 0, 0.8, 0);
      top.rotation.x = Math.PI / 2;
      put(g, box(0.4, 0.06, 0.03, STONE_DARK, false), 0, 0.75, 0.11);
      put(g, box(0.06, 0.3, 0.03, STONE_DARK, false), 0, 0.75, 0.11);
      break;
    }
    case 1:
      put(g, box(0.16, 1.3, 0.16, c, 0.015), 0, 0.65, 0);
      put(g, box(0.7, 0.16, 0.16, c, 0.015), 0, 0.95, 0);
      break;
    case 2:
      put(g, box(0.45, 0.25, 0.45, c, 0.015), 0, 0.12, 0);
      put(g, toonMesh(new THREE.CylinderGeometry(0.08, 0.18, 1.4, 4), c, { outline: 0.015 }), 0, 0.95, 0).rotation.y = Math.PI / 4;
      break;
    default:
      put(g, box(0.9, 0.55, 0.22, c, 0.015), 0, 0.28, 0);
      put(g, box(0.7, 0.18, 0.22, c, 0.015), 0, 0.64, 0);
  }
  // A mossy mound in front.
  const mound = put(g, toonMesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8fcfae, { outline: 0.012 }), 0, 0, 0.75);
  mound.scale.set(0.9, 0.35, 1.4);
  return g;
}

/** Stone crypt with columns, a pediment and a glowing doorway. userData.door. */
export function crypt(): THREE.Group {
  const g = new THREE.Group();
  put(g, box(3.6, 0.3, 3.2, STONE_DARK, 0.02), 0, 0.15, 0);
  put(g, box(3, 2.6, 2.6, STONE, 0.035), 0, 1.6, -0.2);
  for (const x of [-1.25, 1.25]) put(g, cyl(0.18, 0.2, 2.5, TRIM, 10, 0.015), x, 1.55, 1.3);
  put(g, box(3.4, 0.3, 3.2, TRIM, 0.02), 0, 3, 0);
  put(g, prism(3.5, 1.1, 3.2, ROOF), 0, 3.15, 0);
  put(g, toonMesh(new THREE.SphereGeometry(0.28, 12, 8), STONE, { outline: 0.015 }), 0, 4.25, 0);
  // Doorway glows ghostly mint; the door itself swings (live).
  put(g, toonMesh(new THREE.BoxGeometry(1.2, 1.9, 0.05), WISP, { emissive: 0x2a8a6a, outline: false }), 0, 1.25, 1.12);
  const hinge = live(new THREE.Group());
  put(g, hinge, -0.6, 1.25, 1.17);
  put(hinge, box(1.2, 1.9, 0.1, 0x7b6896, 0.015), 0.6, 0, 0);
  put(hinge, toonMesh(new THREE.TorusGeometry(0.1, 0.03, 6, 10), Palette.yellow, { outline: false }), 0.95, 0, 0.07);
  const plaque = put(g, new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.34), new THREE.MeshBasicMaterial({ map: textTexture('BOO-REGARD', '#fff6e6', '#6a5596', 256, 56, '900 34px system-ui, sans-serif') })), 0, 2.55, 1.12);
  plaque.renderOrder = 1;
  const glow = live(glowSprite(WISP, 2.6, 0.45));
  put(g, glow, 0, 1.3, 1.5);
  g.userData = { door: hinge, glow };
  return g;
}

/** Wrought iron fence with spear-tip bars, `length` long along x. */
export function ironFence(length: number, h = 1.3): THREE.Group {
  const g = new THREE.Group();
  for (const y of [0.25, h - 0.2]) put(g, box(length, 0.07, 0.07, IRON, false), 0, y, 0);
  const n = Math.max(2, Math.round(length / 0.35));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (i / n) * length;
    put(g, box(0.05, h, 0.05, IRON, false), x, h / 2, 0);
    put(g, toonMesh(new THREE.ConeGeometry(0.06, 0.18, 4), IRON, { outline: false }), x, h + 0.08, 0);
  }
  // Stone posts at each end.
  for (const x of [-length / 2, length / 2]) {
    put(g, box(0.3, h + 0.3, 0.3, STONE, 0.015), x, (h + 0.3) / 2, 0);
    put(g, toonMesh(new THREE.SphereGeometry(0.16, 8, 6), STONE, { outline: 0.012 }), x, h + 0.42, 0);
  }
  return g;
}

/** Twisty bare tree with lilac bark, optionally with a few violet leaf puffs. */
export function gnarledTree(seed: number, leaves = false): THREE.Group {
  const g = new THREE.Group();
  const r = (i: number) => Math.abs(Math.sin(seed * 91.7 + i * 12.9898) * 43758.5453) % 1;
  // Trunk in three leaning segments.
  let y = 0;
  let x = 0;
  for (let i = 0; i < 3; i++) {
    const h = 1.2 - i * 0.15;
    const lean = (r(i) - 0.5) * 0.5;
    const seg = put(g, cyl(0.28 - i * 0.07, 0.36 - i * 0.07, h, BARK, 7, 0.02), x + Math.sin(lean) * h * 0.5, y + h / 2, 0);
    seg.rotation.z = -lean;
    x += Math.sin(lean) * h;
    y += h * Math.cos(lean) * 0.95;
  }
  for (let i = 0; i < 5; i++) {
    const arm = put(g, new THREE.Group(), x * 0.8, y - 0.6 - r(i + 10) * 1.2, 0, r(i + 20) * Math.PI * 2);
    const len = 0.9 + r(i + 30) * 0.9;
    put(arm, cyl(0.03, 0.09, len, BARK, 5, 0.012), 0, len / 2, 0);
    arm.rotation.z = 0.6 + r(i + 40) * 0.6;
    const twig = put(arm, new THREE.Group(), 0, len, 0);
    put(twig, cyl(0.02, 0.03, 0.5, BARK, 4, false), 0, 0.25, 0);
    twig.rotation.z = -0.9;
    if (leaves) put(arm, toonMesh(new THREE.IcosahedronGeometry(0.55, 1), [0xc4a8ff, 0xd8b8f0, 0xb39ae8][i % 3], { outline: 0.02 }), 0, len + 0.2, 0);
  }
  if (leaves) put(g, toonMesh(new THREE.IcosahedronGeometry(0.9, 1), 0xc4a8ff, { outline: 0.025 }), x, y + 0.3, 0);
  return g;
}

let faceTex: THREE.CanvasTexture | null = null;
function jackFace(): THREE.MeshBasicMaterial {
  if (!faceTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff3a0';
    const tri = (pts: number[]) => {
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath();
      g.fill();
    };
    tri([14, 30, 22, 16, 30, 30]);
    tri([34, 30, 42, 16, 50, 30]);
    // Gap-toothed grin.
    tri([10, 38, 54, 38, 48, 50, 40, 46, 32, 52, 24, 46, 16, 50]);
    faceTex = new THREE.CanvasTexture(c);
    faceTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false });
}

/** A ribbed pumpkin; carved ones get a glowing face and are returned with userData.glow. */
export function pumpkin(s = 1, carved = false, color: number = PUMPKIN): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const rib = put(body, toonMesh(new THREE.SphereGeometry(0.32, 10, 8), color, { outline: 0.015, emissive: carved ? 0x3a1800 : 0 }), Math.cos((i / 6) * Math.PI * 2) * 0.16, 0.3, Math.sin((i / 6) * Math.PI * 2) * 0.16);
    rib.scale.set(0.8, 0.85, 0.8);
  }
  put(body, cyl(0.04, 0.06, 0.25, 0x6fbf7a, 5, 0.01), 0, 0.62, 0).rotation.z = 0.2;
  g.add(body);
  if (carved) {
    const face = live(put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), jackFace()), 0, 0.32, 0.43));
    face.renderOrder = 2;
    const glow = live(glowSprite(0xffb85c, 1.4, 0.55));
    put(g, glow, 0, 0.35, 0.5);
    g.userData.glow = glow;
  }
  g.scale.setScalar(s);
  return g;
}

/** Scarecrow with a pumpkin head that slowly turns to watch you. userData.head. */
export function scarecrow(): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.07, 0.09, 2.6, BARK, 6, 0.015), 0, 1.3, 0);
  put(g, box(2, 0.1, 0.1, BARK, 0.012), 0, 1.9, 0);
  put(g, box(0.8, 0.9, 0.45, 0x8fb8e8, 0.02), 0, 1.65, 0);
  for (const s of [-1, 1]) {
    put(g, box(0.5, 0.3, 0.3, 0x8fb8e8, 0.015), s * 0.55, 1.9, 0);
    put(g, toonMesh(new THREE.ConeGeometry(0.12, 0.35, 5), Palette.butter, { outline: 0.01 }), s * 0.95, 1.9, 0).rotation.z = (s * Math.PI) / 2;
  }
  put(g, box(0.82, 0.1, 0.47, 0xc98a5a, false), 0, 1.25, 0);
  const head = live(new THREE.Group());
  put(g, head, 0, 2.15, 0);
  head.add(pumpkin(1.1, true));
  const brim = put(head, cyl(0.55, 0.55, 0.05, 0x6a5596, 14, 0.012), 0, 0.68, 0);
  brim.rotation.z = 0.12;
  put(head, cyl(0.2, 0.3, 0.5, 0x6a5596, 10, 0.012), 0, 0.92, 0).rotation.z = 0.25;
  g.userData.head = head;
  return g;
}

/** Glasshouse with a white frame, minty panes and plants inside. */
export function greenhouse(): THREE.Group {
  const g = new THREE.Group();
  const W = 5;
  const D = 3.4;
  const H = 2.2;
  put(g, box(W + 0.3, 0.3, D + 0.3, STONE, 0.02), 0, 0.15, 0);
  const glass = new THREE.MeshToonMaterial({ color: 0xc8fff0, transparent: true, opacity: 0.35, depthWrite: false });
  const pane = (w: number, h: number) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
  for (const z of [-D / 2, D / 2]) put(g, pane(W, H), 0, 0.3 + H / 2, z);
  for (const x of [-W / 2, W / 2]) put(g, pane(D, H), x, 0.3 + H / 2, 0).rotation.y = Math.PI / 2;
  for (const s of [-1, 1]) {
    const roof = put(g, pane(W, D * 0.62), 0, 0.3 + H + 0.55, s * D * 0.25);
    roof.rotation.x = -Math.PI / 2 + s * 0.6;
  }
  for (const x of [-W / 2, -W / 4, 0, W / 4, W / 2]) {
    for (const z of [-D / 2, D / 2]) put(g, box(0.08, H, 0.08, TRIM, 0.01), x, 0.3 + H / 2, z);
    put(g, box(0.08, 0.08, D, TRIM, 0.01), x, 0.3 + H, 0);
    for (const s of [-1, 1]) {
      const rafter = put(g, box(0.08, 0.08, D * 0.62, TRIM, 0.01), x, 0.3 + H + 0.55, s * D * 0.25);
      rafter.rotation.x = s * 0.6;
    }
  }
  put(g, box(W, 0.1, 0.1, TRIM, 0.01), 0, 0.3 + H + 1.1, 0);
  // Planters and leafy things inside.
  for (const x of [-1.6, 0, 1.6]) {
    put(g, box(1.2, 0.5, 0.8, 0xc98a5a, 0.015), x, 0.55, -0.8);
    put(g, toonMesh(new THREE.IcosahedronGeometry(0.5, 1), x ? HEDGE : 0xff9ec8, { outline: 0.015 }), x, 1.15, -0.8);
  }
  // A giant toothy flytrap peeking out of a pot (its jaw is live).
  put(g, cyl(0.45, 0.35, 0.6, 0xc98a5a, 10, 0.015), 1.4, 0.6, 0.7);
  put(g, cyl(0.06, 0.08, 0.8, 0x6fbf7a, 6, 0.01), 1.4, 1.2, 0.7);
  const jaw = live(new THREE.Group());
  put(g, jaw, 1.4, 1.6, 0.7);
  for (const s of [-1, 1]) {
    const lip = put(jaw, new THREE.Group(), 0, 0, 0);
    lip.userData.side = s;
    const half = put(lip, toonMesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI), 0x8fe08a, { outline: 0.012 }), 0, 0, 0);
    half.rotation.z = s > 0 ? 0 : Math.PI;
    half.scale.set(1, 0.55, 1);
    for (let i = 0; i < 5; i++) {
      const tooth = put(lip, toonMesh(new THREE.ConeGeometry(0.03, 0.12, 4), TRIM, { outline: false }), -0.24 + i * 0.12, 0, 0.25);
      tooth.rotation.z = s > 0 ? Math.PI : 0;
    }
  }
  g.userData.jaw = jaw;
  return g;
}

/** Little boathouse on stilts plus a jetty. Faces +z, water toward -z. */
export function boathouse(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.3, 1.3]) for (const z of [-1, 1]) put(g, cyl(0.1, 0.1, 1.2, BARK, 6, 0.01), x, 0.3, z);
  put(g, box(3, 0.15, 2.4, 0xc9a0b8, 0.015), 0, 0.8, 0);
  put(g, box(2.8, 1.8, 2.2, 0x9fc7e8, 0.025), 0, 1.75, 0);
  put(g, hipRoof(3.4, 2.8, 1.2, ROOF_DARK, 0.02), 0, 3.2, 0);
  put(g, windowPane(0.6, 0.6), 0, 1.9, 1.12);
  // Jetty out over the water.
  for (let i = 0; i < 6; i++) put(g, box(1.1, 0.1, 0.42, 0xc9a0b8, 0.01), 0, 0.72, -1.6 - i * 0.48);
  for (const x of [-0.5, 0.5]) for (const z of [-2, -3.6]) put(g, cyl(0.07, 0.07, 1.2, BARK, 5, false), x, 0.3, z);
  return g;
}

/** Rowboat, faces +z. */
export function rowboat(): THREE.Group {
  const g = new THREE.Group();
  const hull = put(g, toonMesh(new THREE.SphereGeometry(0.7, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xff9ec8, { outline: 0.02 }), 0, 0.3, 0);
  hull.scale.set(0.7, 0.5, 1.6);
  put(g, box(0.9, 0.06, 0.25, 0xc9a0b8, false), 0, 0.28, 0.2);
  for (const s of [-1, 1]) {
    const oar = put(g, cyl(0.03, 0.03, 1.6, 0xc98a5a, 5, false), s * 0.55, 0.35, 0.1);
    oar.rotation.set(0.2, 0, (s * Math.PI) / 2.6);
  }
  put(g, box(0.25, 0.25, 0.25, Palette.butter, false), 0, 0.42, -0.5);
  return g;
}

/**
 * Friendly sheet ghost: round head, wavy skirt, big eyes. userData.arms holds
 * the two little nubs that wave.
 */
export function ghost(s = 1, tint: number = GHOST): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(tint, { transparent: true, opacity: 0.88, emissive: 0x2a2840 });
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    // Dome on top flaring out to a skirt.
    const y = 1.4 - k * 1.4;
    const r = k < 0.45 ? Math.sin((k / 0.45) * (Math.PI / 2)) * 0.55 : 0.55 + (k - 0.45) * 0.35;
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 18), mat);
  body.material.side = THREE.DoubleSide;
  g.add(body);
  // Scalloped hem.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = put(g, new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat), Math.cos(a) * 0.68, 0.02, Math.sin(a) * 0.68);
    b.scale.y = 0.8;
  }
  for (const side of [-1, 1]) {
    const eye = put(g, new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: Palette.ink })), side * 0.19, 1.02, 0.47);
    eye.scale.set(0.8, 1.2, 0.5);
    const blush = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: 0xffb0d0, transparent: true, opacity: 0.8 })), side * 0.3, 0.86, 0.5);
    blush.rotation.y = side * 0.4;
  }
  const mouth = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: Palette.ink })), 0, 0.84, 0.53);
  mouth.scale.y = 1.3;
  const arms: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = put(g, new THREE.Group(), side * 0.55, 0.75, 0.05);
    const arm = put(pivot, new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat), side * 0.15, 0, 0);
    arm.scale.set(1.5, 0.7, 0.8);
    pivot.userData.side = side;
    arms.push(pivot);
  }
  const glow = glowSprite(0xd8d0ff, 3, 0.25);
  glow.position.y = 0.8;
  g.add(glow);
  g.userData.arms = arms;
  g.scale.setScalar(s);
  return g;
}

/** Gas lamp post with a flickering glow (pushed into `glows`). */
export function gasLamp(glows: THREE.Sprite[]): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.2, 0.24, 0.3, IRON, 8, 0.015), 0, 0.15, 0);
  put(g, cyl(0.06, 0.08, 2.6, IRON, 6, 0.015), 0, 1.45, 0);
  put(g, toonMesh(new THREE.CylinderGeometry(0.2, 0.14, 0.45, 6), Palette.butter, { emissive: 0x665500, outline: 0.012 }), 0, 2.95, 0);
  put(g, toonMesh(new THREE.ConeGeometry(0.28, 0.3, 6), IRON, { outline: 0.01 }), 0, 3.32, 0);
  const glow = live(glowSprite(0xffd27a, 1.6, 0.8));
  put(g, glow, 0, 2.95, 0);
  glows.push(glow);
  return g;
}

/** Stone wishing well with a little roof and a bucket. */
export function wishingWell(): THREE.Group {
  const g = new THREE.Group();
  const ring = put(g, toonMesh(new THREE.CylinderGeometry(0.9, 0.95, 0.9, 16, 1, true), STONE, { outline: 0.025 }), 0, 0.45, 0);
  (ring.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  put(g, toonMesh(new THREE.TorusGeometry(0.9, 0.1, 6, 18), STONE_DARK, { outline: 0.012 }), 0, 0.9, 0).rotation.x = Math.PI / 2;
  const water = put(g, new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), new THREE.MeshBasicMaterial({ color: 0x5fd3b0 })), 0, 0.5, 0);
  water.rotation.x = -Math.PI / 2;
  for (const x of [-0.8, 0.8]) put(g, box(0.12, 1.6, 0.12, BARK, 0.012), x, 1.6, 0);
  put(g, prism(2.3, 0.9, 1.9, ROOF, 0.02), 0, 2.35, 0).rotation.y = Math.PI / 2;
  put(g, cyl(0.06, 0.06, 1.6, BARK, 6, false), 0, 2, 0).rotation.z = Math.PI / 2;
  put(g, cyl(0.15, 0.12, 0.25, 0xc98a5a, 8, 0.01), 0.2, 1.4, 0);
  return g;
}

/** Big old tree with a rope swing; userData.swing pivots at the branch. */
export function swingTree(): THREE.Group {
  const g = gnarledTree(7, true);
  g.scale.setScalar(1.3);
  const branch = put(g, cyl(0.06, 0.1, 2, BARK, 6, 0.015), 0.5, 2.6, 0);
  branch.rotation.z = Math.PI / 2;
  const swing = live(new THREE.Group());
  put(g, swing, 1.1, 2.6, 0);
  for (const z of [-0.25, 0.25]) put(swing, cyl(0.015, 0.015, 1.7, 0xfff0c8, 4, false), 0, -0.85, z);
  put(swing, box(0.3, 0.06, 0.7, 0xff9ec8, 0.01), 0, -1.7, 0);
  g.userData.swing = swing;
  return g;
}

/** Black(ish) cat sitting on a ledge, tail swishing. userData.tail. */
export function cat(): THREE.Group {
  const g = new THREE.Group();
  const fur = 0x4a3d6b;
  const body = put(g, toonMesh(new THREE.SphereGeometry(0.28, 12, 8), fur, { outline: 0.015 }), 0, 0.28, 0);
  body.scale.set(0.9, 1.2, 0.8);
  put(g, toonMesh(new THREE.SphereGeometry(0.2, 12, 8), fur, { outline: 0.015 }), 0, 0.7, 0.05);
  for (const s of [-1, 1]) {
    put(g, toonMesh(new THREE.ConeGeometry(0.07, 0.16, 4), fur, { outline: 0.01 }), s * 0.11, 0.9, 0.04);
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8ff8a })), s * 0.08, 0.73, 0.21);
  }
  const tail = live(new THREE.Group());
  put(g, tail, 0, 0.1, -0.22);
  const t = put(tail, cyl(0.04, 0.05, 0.6, fur, 6, 0.01), 0, 0.3, -0.05);
  t.rotation.x = -0.3;
  g.userData.tail = tail;
  return g;
}

/** A crooked signpost with planks pointing around the grounds. */
export function signpost(labels: [string, number][]): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.08, 0.1, 2.6, BARK, 6, 0.015), 0, 1.3, 0);
  labels.forEach(([text, ry], i) => {
    const arm = put(g, new THREE.Group(), 0, 2.2 - i * 0.42, 0, ry);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.06), [
      toon(0xc9a0b8),
      toon(0xc9a0b8),
      toon(0xc9a0b8),
      toon(0xc9a0b8),
      new THREE.MeshBasicMaterial({ map: textTexture(text, '#c9a0b8', '#fff6e6', 256, 64, '900 34px system-ui, sans-serif') }),
      new THREE.MeshBasicMaterial({ map: textTexture(text, '#c9a0b8', '#fff6e6', 256, 64, '900 34px system-ui, sans-serif') }),
    ]);
    put(arm, plank, 0.55, 0, 0);
  });
  return g;
}

/** Wrought-iron archway over the walk with the manor's name. */
export function archway(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.6, 1.6]) {
    put(g, box(0.5, 3, 0.5, STONE, 0.02), x, 1.5, 0);
    put(g, toonMesh(new THREE.SphereGeometry(0.28, 10, 8), STONE, { outline: 0.012 }), x, 3.3, 0);
  }
  const arc = put(g, toonMesh(new THREE.TorusGeometry(1.6, 0.07, 6, 24, Math.PI), IRON, { outline: false }), 0, 2.9, 0);
  arc.scale.y = 0.6;
  const sign = put(g, new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: textTexture('HOLLOW HILL', 'rgba(0,0,0,0)', '#fff6e6', 320, 64, '900 44px system-ui, sans-serif'), transparent: true, side: THREE.DoubleSide })), 0, 3.45, 0);
  sign.renderOrder = 1;
  // Iron curls along the top.
  for (const x of [-0.8, 0, 0.8]) put(g, toonMesh(new THREE.TorusGeometry(0.16, 0.03, 5, 10), IRON, { outline: false }), x, 3.95, 0);
  return g;
}

/** Fountain with a little ghost statue spitting water. userData.spray. */
export function fountain(): THREE.Group {
  const g = new THREE.Group();
  const basin = put(g, toonMesh(new THREE.CylinderGeometry(1.6, 1.7, 0.5, 18, 1, true), STONE, { outline: 0.025 }), 0, 0.25, 0);
  (basin.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
  put(g, toonMesh(new THREE.TorusGeometry(1.6, 0.1, 6, 20), STONE_DARK, { outline: 0.012 }), 0, 0.5, 0).rotation.x = Math.PI / 2;
  const w = put(g, new THREE.Mesh(new THREE.CircleGeometry(1.55, 18), new THREE.MeshBasicMaterial({ color: 0x8fd3f0 })), 0, 0.38, 0);
  w.rotation.x = -Math.PI / 2;
  put(g, cyl(0.25, 0.35, 1.2, STONE, 10, 0.015), 0, 0.9, 0);
  const statue = put(g, ghost(0.55, STONE), 0, 1.5, 0);
  // Stone ghost: swap its see-through material for a solid one.
  statue.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshToonMaterial) o.material = toon(STONE);
    if (o instanceof THREE.Sprite) o.visible = false;
  });
  const spray = live(new THREE.Group());
  put(g, spray, 0, 1.95, 0.3);
  for (let i = 0; i < 5; i++) {
    const drop = put(spray, new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xc8f0ff })), 0, 0, 0);
    drop.userData.k = i / 5;
  }
  g.userData.spray = spray;
  return g;
}

/** Glowing toadstool for the scatter. */
export function toadstool(color: number): THREE.Group {
  const g = new THREE.Group();
  put(g, cyl(0.06, 0.08, 0.3, TRIM, 6, false), 0, 0.15, 0);
  const cap = put(g, toonMesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), color, { emissive: 0x302040, outline: 0.012 }), 0, 0.28, 0);
  cap.scale.y = 0.7;
  return g;
}
