import * as THREE from 'three';
import { westernTheme } from '../audio/songs/western';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { bird, flyBird, glowSprite, instanced, scatter, seeded, Smoke, textTexture, type Bird } from './decor';
import { BoardBuilder } from './graph';
import type { BoardDef, Space } from './types';

/**
 * Dusty Gulch: a dirt trail looping around a little frontier town, with red
 * mesas on the horizon. An old mine cuts across the east side (locked) and a
 * canyon trail cuts across the west.
 */
function layout(): { spaces: Space[]; startId: number } {
  const b = new BoardBuilder()
    .loop(
      [
        [0, 15],
        [10, 16],
        [19, 12],
        [23, 3],
        [20, -7],
        [11, -12],
        [3, -9],
        [-4, -13],
        [-13, -15],
        [-21, -9],
        [-24, 1],
        [-20, 10],
        [-10, 15],
      ],
      'S B B R B I B H B* B ' + 'R B T B B H* B V B I ' + 'B R B H B B* P B R B ' + 'B H B* B V B I R B B',
    )
    // The old mine: a locked shortcut through the hills.
    .branch(5, 16, [[13, 4], [9, -4]], 'B R H B* R', true)
    // Canyon trail on the west side.
    .branch(26, 37, [[-13, -4], [-9, 6]], 'B I B* H R');
  return { spaces: b.spaces, startId: b.loopId(0) };
}

const SAND = 0xf3d9a4;
const DIRT = 0xd9b07a;
const TERRACOTTA = 0xe59a74;
const CACTUS = 0x7cc98a;
const WOOD = 0xc99a6b;

const spinners: THREE.Object3D[] = [];
const weeds: THREE.Object3D[] = [];

function ground(spaces: Space[]): THREE.Group {
  const g = new THREE.Group();
  const plain = new THREE.Mesh(new THREE.CircleGeometry(200, 48), toon(SAND));
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = -0.02;
  plain.receiveShadow = true;
  g.add(plain);
  // Trail: a dirt patch under every space blends into a road.
  const patch = new THREE.CircleGeometry(1.75, 24);
  const dirt = toon(DIRT);
  for (const s of spaces) {
    const m = new THREE.Mesh(patch, dirt);
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.pos.x, 0.005 + (s.id % 5) * 0.001, s.pos.z);
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

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

/** A layered flat-topped rock with pastel strata. */
function mesa(w: number, h: number): THREE.Group {
  const m = new THREE.Group();
  const bands = [TERRACOTTA, 0xf0b48c, 0xe08a6a, 0xf5c49c];
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const r = w * (1 - i * 0.07);
    const layer = toonMesh(new THREE.CylinderGeometry(r * 0.94, r, h / layers, 9), bands[i % bands.length], { outline: 0.06 });
    layer.position.y = (i + 0.5) * (h / layers);
    m.add(layer);
  }
  return m;
}

function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = fg;
  g.font = '900 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function saloon(): THREE.Group {
  const s = new THREE.Group();
  const body = toonMesh(new THREE.BoxGeometry(5, 3, 3.4), 0xf2c6a0, { outline: 0.05 });
  body.position.y = 1.5;
  // Tall false front, the classic frontier facade.
  const front = toonMesh(new THREE.BoxGeometry(5.4, 4.4, 0.3), 0xe8a882, { outline: 0.05 });
  front.position.set(0, 2.2, 1.75);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('SALOON', '#fff6e6', '#2b2440') }));
  sign.position.set(0, 3.6, 1.91);
  const porch = toonMesh(new THREE.BoxGeometry(5.6, 0.2, 1.4), WOOD, { outline: 0.03 });
  porch.position.set(0, 0.1, 2.5);
  const roof = toonMesh(new THREE.BoxGeometry(5.8, 0.15, 1.6), Palette.coral, { outline: 0.03 });
  roof.position.set(0, 2.3, 2.6);
  s.add(body, front, sign, porch, roof);
  for (const x of [-2.6, 2.6]) {
    const post = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), WOOD, { outline: 0.02 });
    post.position.set(x, 1.2, 3.2);
    s.add(post);
  }
  // Swinging doors and windows.
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5, 1.1, 1.95);
    const leaf = toonMesh(new THREE.BoxGeometry(0.48, 0.7, 0.05), WOOD, { outline: 0.01 });
    leaf.position.x = -side * 0.24;
    pivot.add(leaf);
    pivot.userData.side = side;
    s.add(pivot);
    doors.push(pivot);
  }
  for (const x of [-1.7, 1.7]) {
    const win = toonMesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), Palette.sky, { outline: 0.02 });
    win.position.set(x, 1.6, 1.95);
    s.add(win);
  }
  return s;
}

function waterTower(): THREE.Group {
  const t = new THREE.Group();
  for (const [x, z] of [
    [-0.8, -0.8],
    [0.8, -0.8],
    [-0.8, 0.8],
    [0.8, 0.8],
  ]) {
    const leg = toonMesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8), WOOD, { outline: 0.02 });
    leg.position.set(x, 1.6, z);
    t.add(leg);
  }
  const tank = toonMesh(new THREE.CylinderGeometry(1.3, 1.3, 1.8, 18), 0xb5784a, { outline: 0.04 });
  tank.position.y = 4;
  const cap = toonMesh(new THREE.ConeGeometry(1.45, 0.9, 18), Palette.coral, { outline: 0.04 });
  cap.position.y = 5.35;
  t.add(tank, cap);
  for (const y of [3.4, 4.6]) {
    const band = toonMesh(new THREE.TorusGeometry(1.32, 0.05, 6, 24), 0x6b4f6e, { outline: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    t.add(band);
  }
  return t;
}

function windmill(): THREE.Group {
  const w = new THREE.Group();
  const tower = toonMesh(new THREE.CylinderGeometry(0.15, 0.6, 5, 4), WOOD, { outline: 0.03 });
  tower.position.y = 2.5;
  w.add(tower);
  const hub = new THREE.Group();
  hub.position.set(0, 5.1, 0.4);
  for (let i = 0; i < 8; i++) {
    const blade = toonMesh(new THREE.BoxGeometry(0.28, 1.4, 0.05), i % 2 ? Palette.cream : Palette.coral, { outline: 0.015 });
    blade.position.y = 0.8;
    const arm = new THREE.Group();
    arm.rotation.z = (i / 8) * Math.PI * 2;
    arm.add(blade);
    hub.add(arm);
  }
  const tail = toonMesh(new THREE.BoxGeometry(0.06, 0.6, 1.2), Palette.cream, { outline: 0.015 });
  tail.position.set(0, 5.1, -0.8);
  w.add(hub, tail);
  spinners.push(hub);
  return w;
}

function tumbleweed(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(0.45, 1);
  const m = toonMesh(geo, 0xc7a46b, { outline: 0.02 });
  (m.material as THREE.MeshToonMaterial).wireframe = true;
  return m;
}

function fence(length: number): THREE.Group {
  const f = new THREE.Group();
  const posts = Math.max(2, Math.round(length / 1.4));
  for (let i = 0; i < posts; i++) {
    const post = toonMesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), WOOD, { outline: 0.015 });
    post.position.set(-length / 2 + (i / (posts - 1)) * length, 0.45, 0);
    f.add(post);
  }
  for (const y of [0.35, 0.7]) {
    const rail = toonMesh(new THREE.BoxGeometry(length, 0.1, 0.08), WOOD, { outline: 0.015 });
    rail.position.y = y;
    f.add(rail);
  }
  return f;
}

function mineEntrance(): THREE.Group {
  const m = new THREE.Group();
  const hill = toonMesh(new THREE.SphereGeometry(3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), TERRACOTTA, { outline: 0.05 });
  hill.scale.set(1, 0.8, 0.8);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: Palette.ink }));
  hole.position.set(0, 0.02, 2.35);
  const frame = toonMesh(new THREE.TorusGeometry(1, 0.14, 6, 16, Math.PI), WOOD, { outline: 0.02 });
  frame.position.set(0, 0.02, 2.4);
  m.add(hill, hole, frame);
  return m;
}

/** A small false-front shop for main street. */
function shop(name: string, wall: number, trim: number, w = 3, h = 2.4): THREE.Group {
  const s = new THREE.Group();
  const body = toonMesh(new THREE.BoxGeometry(w, h, 2.4), wall, { outline: 0.04 });
  body.position.y = h / 2;
  const front = toonMesh(new THREE.BoxGeometry(w + 0.3, h + 0.9, 0.25), trim, { outline: 0.04 });
  front.position.set(0, (h + 0.9) / 2, 1.25);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 0.55), new THREE.MeshBasicMaterial({ map: textTexture(name, '#fff6e6', '#2b2440') }));
  sign.position.set(0, h + 0.35, 1.39);
  const awning = toonMesh(new THREE.BoxGeometry(w + 0.2, 0.1, 0.9), Palette.cream, { outline: 0.02 });
  awning.position.set(0, h - 0.5, 1.8);
  awning.rotation.x = 0.2;
  const door = toonMesh(new THREE.BoxGeometry(0.7, 1.2, 0.06), WOOD, { outline: 0.015 });
  door.position.set(-w * 0.2, 0.6, 1.4);
  const win = toonMesh(new THREE.BoxGeometry(0.8, 0.7, 0.06), Palette.sky, { outline: 0.015 });
  win.position.set(w * 0.22, 1.1, 1.4);
  s.add(body, front, sign, awning, door, win);
  return s;
}

function sheriffStar(): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.32 : 0.15;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  return toonMesh(geo, Palette.yellow, { emissive: 0x332200, outline: 0.015 });
}

/** Pastel pony with a swishing tail and a nodding head. */
function horse(): THREE.Group {
  const h = new THREE.Group();
  const coat = 0xe8b48c;
  const mane = 0x8a5a3b;
  const body = toonMesh(new THREE.CapsuleGeometry(0.42, 0.9, 6, 12), coat, { outline: 0.025 });
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.15;
  h.add(body);
  for (const [x, z] of [
    [-0.5, -0.22],
    [-0.5, 0.22],
    [0.5, -0.22],
    [0.5, 0.22],
  ]) {
    const leg = toonMesh(new THREE.CylinderGeometry(0.1, 0.09, 0.85, 8), coat, { outline: 0.015 });
    leg.position.set(x, 0.45, z);
    const hoof = toonMesh(new THREE.CylinderGeometry(0.11, 0.12, 0.12, 8), Palette.ink, { outline: false });
    hoof.position.set(x, 0.06, z);
    h.add(leg, hoof);
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
  const saddle = toonMesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), Palette.coral, { outline: 0.015 });
  saddle.position.set(0, 1.55, 0);
  h.add(saddle);
  h.userData.neck = neck;
  h.userData.tail = tail;
  return h;
}

function wheel(r: number, color: number): THREE.Mesh {
  const w = toonMesh(new THREE.CylinderGeometry(r, r, 0.12, 14), color, { outline: 0.015 });
  w.rotation.x = Math.PI / 2;
  const hub = toonMesh(new THREE.BoxGeometry(r * 1.7, 0.08, 0.14), Palette.ink, { outline: false });
  w.add(hub);
  return w;
}

/** Little steam train: locomotive plus a freight car and a caboose. */
function train(): { group: THREE.Group; wheels: THREE.Mesh[]; smoke: Smoke } {
  const g = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const addWheels = (parent: THREE.Object3D, xs: number[], r: number) => {
    for (const x of xs) {
      for (const z of [-0.62, 0.62]) {
        const w = wheel(r, 0x4a4060);
        w.position.set(x, r, z);
        parent.add(w);
        wheels.push(w);
      }
    }
  };
  // Locomotive faces +x.
  const loco = new THREE.Group();
  const boiler = toonMesh(new THREE.CylinderGeometry(0.6, 0.6, 2.4, 16), Palette.coral, { outline: 0.03 });
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.5, 1.2, 0);
  const cab = toonMesh(new THREE.BoxGeometry(1.3, 1.7, 1.4), 0x7fa8ff, { outline: 0.03 });
  cab.position.set(-1.1, 1.45, 0);
  const cabRoof = toonMesh(new THREE.BoxGeometry(1.6, 0.14, 1.7), Palette.ink, { outline: false });
  cabRoof.position.set(-1.1, 2.35, 0);
  const stack = toonMesh(new THREE.CylinderGeometry(0.32, 0.18, 0.8, 12), Palette.ink, { outline: 0.02 });
  stack.position.set(1.3, 2.1, 0);
  const dome = toonMesh(new THREE.SphereGeometry(0.25, 12, 8), Palette.yellow, { outline: 0.015 });
  dome.position.set(0.3, 1.85, 0);
  const lamp = toonMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.25, 10), Palette.butter, { emissive: 0x554400, outline: 0.012 });
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(1.85, 1.6, 0);
  const catcher = toonMesh(new THREE.ConeGeometry(0.5, 0.6, 4), Palette.yellow, { outline: 0.02 });
  catcher.rotation.set(0, Math.PI / 4, -Math.PI / 2);
  catcher.position.set(2, 0.4, 0);
  const frame = toonMesh(new THREE.BoxGeometry(3.8, 0.25, 1.1), 0x4a4060, { outline: 0.02 });
  frame.position.set(0, 0.55, 0);
  loco.add(boiler, cab, cabRoof, stack, dome, lamp, catcher, frame);
  addWheels(loco, [-1.1, 0, 1], 0.38);
  const smoke = new Smoke(6, 0.45, 3, 0.8, 0xffffff, new THREE.Vector3(-0.9, 0, 0));
  smoke.group.position.set(1.3, 2.5, 0);
  loco.add(smoke.group);
  g.add(loco);

  const freight = new THREE.Group();
  freight.position.x = -4.2;
  const bed = toonMesh(new THREE.BoxGeometry(3, 0.8, 1.3), 0xc98a5a, { outline: 0.03 });
  bed.position.y = 0.95;
  freight.add(bed);
  for (const [x, c] of [
    [-0.7, Palette.mint],
    [0.5, Palette.butter],
  ] as const) {
    const crate = toonMesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), c, { outline: 0.02 });
    crate.position.set(x, 1.7, 0);
    crate.rotation.y = x;
    freight.add(crate);
  }
  addWheels(freight, [-1, 1], 0.3);
  g.add(freight);

  const caboose = new THREE.Group();
  caboose.position.x = -7.8;
  const cbody = toonMesh(new THREE.BoxGeometry(2.6, 1.4, 1.3), Palette.violet, { outline: 0.03 });
  cbody.position.y = 1.3;
  const cupola = toonMesh(new THREE.BoxGeometry(1, 0.5, 1), Palette.lavender, { outline: 0.02 });
  cupola.position.y = 2.25;
  const croof = toonMesh(new THREE.BoxGeometry(2.9, 0.12, 1.5), Palette.ink, { outline: false });
  croof.position.y = 2.02;
  caboose.add(cbody, cupola, croof);
  addWheels(caboose, [-0.8, 0.8], 0.3);
  g.add(caboose);
  return { group: g, wheels, smoke };
}

/** Straight track: two rails on a run of sleepers (one instanced draw). */
function track(length: number): THREE.Group {
  const t = new THREE.Group();
  const n = Math.round(length / 0.9);
  t.add(
    instanced(
      new THREE.BoxGeometry(0.35, 0.12, 1.8),
      0xa97a54,
      Array.from({ length: n }, (_, i) => ({ x: -length / 2 + i * 0.9, y: 0.06, z: 0, s: 1 })),
    ),
  );
  for (const z of [-0.62, 0.62]) {
    const rail = toonMesh(new THREE.BoxGeometry(length, 0.1, 0.1), 0x8a84a8, { outline: false });
    rail.position.set(0, 0.17, z);
    t.add(rail);
  }
  return t;
}

function mineCart(): THREE.Group {
  const c = new THREE.Group();
  const tub = toonMesh(new THREE.CylinderGeometry(0.75, 0.55, 0.7, 4, 1), 0x8a84a8, { outline: 0.025 });
  tub.rotation.y = Math.PI / 4;
  tub.position.y = 0.65;
  const ore = toonMesh(new THREE.DodecahedronGeometry(0.42, 0), Palette.yellow, { emissive: 0x332200, outline: 0.02 });
  ore.position.y = 1;
  ore.scale.set(1.1, 0.5, 0.8);
  c.add(tub, ore);
  for (const x of [-0.35, 0.35]) {
    for (const z of [-0.45, 0.45]) {
      const w = wheel(0.16, Palette.ink);
      w.position.set(x, 0.16, z);
      c.add(w);
    }
  }
  return c;
}

/** Bleached cow skull lying in the sand. */
function cowSkull(): THREE.Group {
  const s = new THREE.Group();
  const head = toonMesh(new THREE.SphereGeometry(0.3, 12, 8), Palette.cream, { outline: 0.015 });
  head.scale.set(0.8, 0.6, 1.2);
  head.position.y = 0.15;
  s.add(head);
  for (const side of [-1, 1]) {
    const horn = toonMesh(new THREE.ConeGeometry(0.07, 0.5, 6), Palette.cream, { outline: 0.012 });
    horn.rotation.z = side * -1.2;
    horn.position.set(side * 0.38, 0.28, -0.15);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    eye.rotation.x = -Math.PI / 2 + 0.6;
    eye.position.set(side * 0.1, 0.32, 0.12);
    s.add(horn, eye);
  }
  return s;
}

/** Whirling column of dust rings: the gulch's own little twister. */
function dustDevil(): THREE.Group {
  const d = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const mat = toon(0xe8cfa0, { transparent: true, opacity: 0.55 - i * 0.05 });
    mat.depthWrite = false;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35 + i * 0.28, 0.14 + i * 0.03, 6, 14), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3 + i * 0.6;
    d.add(ring);
  }
  return d;
}

const doors: THREE.Object3D[] = [];
const vultures: (Bird & { cx: number; cz: number; r: number; y: number; speed: number; phase: number })[] = [];
let horseRef: THREE.Group | null = null;
let trainRef: ReturnType<typeof train> | null = null;
let devil: THREE.Group | null = null;
let cartRef: THREE.Object3D | null = null;
let lantern: THREE.Sprite | null = null;

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  spinners.length = 0;
  weeds.length = 0;
  doors.length = 0;
  vultures.length = 0;
  const rand = seeded(0x60d);
  scene.add(ground(spaces));

  // Big soft patches of darker sand so the plain isn't one flat colour.
  const patches = scatter(rand, spaces, { count: 26, extent: 46, clearance: 3 });
  scene.add(
    instanced(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      0xedcd92,
      patches.map(([x, z]) => ({ x, y: -0.012, z, s: 2.5 + rand() * 4, ry: rand() * 6, sy: 1 })),
    ),
  );

  // Cacti around the outside of the trail, never on the camera side.
  spaces.forEach((s, i) => {
    if (i >= 40 || i % 3 !== 2) return;
    const out = s.pos.clone().setY(0).normalize();
    if (out.z > 0.2) return;
    const c = cactus(1.6 + (i % 4) * 0.4);
    c.position.copy(s.pos).addScaledVector(out, 2.6).setY(0);
    c.rotation.y = i;
    scene.add(c);
    // Every other cactus is in bloom.
    if (i % 2) {
      const flower = toonMesh(new THREE.SphereGeometry(0.2, 10, 6), Palette.rose, { outline: 0.015 });
      flower.position.set(0, 1.6 + (i % 4) * 0.4 + 0.75, 0);
      c.add(flower);
    }
  });

  // Town square in the middle.
  const town = saloon();
  town.position.set(-1, 0, -2);
  scene.add(town);
  const store = shop('GENERAL', Palette.mint, 0x9fd8b8, 2.8, 2.2);
  store.position.set(-5.8, 0, 1.6);
  store.rotation.y = 0.25;
  scene.add(store);
  const jail = shop('SHERIFF', 0xd8c8ff, 0xb8a6e8, 2.6, 2);
  jail.position.set(4.6, 0, 0.8);
  jail.rotation.y = -0.3;
  const badge = sheriffStar();
  badge.position.set(0, 2.95, 1.4);
  jail.add(badge);
  scene.add(jail);

  const tower = waterTower();
  tower.position.set(-6.5, 0, -4);
  scene.add(tower);
  const mill = windmill();
  mill.position.set(27, 0, -9);
  mill.rotation.y = -0.5;
  scene.add(mill);
  const mine = mineEntrance();
  mine.position.set(15, 0, -3);
  mine.rotation.y = -0.4;
  scene.add(mine);
  // Mine rails, a cart that trundles in and out, and a lantern by the door.
  const mineTrack = track(5);
  mineTrack.position.set(16.3, 0, 0.3);
  mineTrack.rotation.y = -0.4 + Math.PI / 2;
  scene.add(mineTrack);
  cartRef = mineCart();
  mineTrack.add(cartRef);
  cartRef.rotation.y = Math.PI / 2;
  lantern = glowSprite(0xffd27a, 1.6, 0.9);
  lantern.position.set(13.7, 1.6, -0.3);
  scene.add(lantern);
  const lanternBody = toonMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), Palette.butter, { emissive: 0x665500, outline: 0.012 });
  lanternBody.position.copy(lantern.position);
  scene.add(lanternBody);

  const pen = fence(6);
  pen.position.set(-2, 0, 4.5);
  scene.add(pen);
  // Hitching post and a pony waiting outside the saloon.
  horseRef = horse();
  horseRef.position.set(1.8, 0, 3.1);
  horseRef.rotation.y = -0.4;
  scene.add(horseRef);
  const trough = toonMesh(new THREE.BoxGeometry(1.4, 0.4, 0.6), WOOD, { outline: 0.02 });
  trough.position.set(3.3, 0.2, 2.6);
  const troughWater = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshBasicMaterial({ color: Palette.sky }));
  troughWater.rotation.x = -Math.PI / 2;
  troughWater.position.set(3.3, 0.41, 2.6);
  scene.add(trough, troughWater);
  // Barrels and crates on the boardwalk.
  for (const [x, z, c] of [
    [-3.9, 0.8, 0xb5784a],
    [2.2, 0.3, 0xb5784a],
    [-7.8, 3.2, Palette.butter],
  ] as const) {
    const box = toonMesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), c, { outline: 0.02 });
    box.position.set(x, 0.35, z);
    box.rotation.y = x;
    scene.add(box);
  }

  // Welcome sign by the start.
  const sign = new THREE.Group();
  for (const x of [-1, 1]) {
    const post = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), WOOD, { outline: 0.015 });
    post.position.set(x, 0.9, 0);
    sign.add(post);
  }
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 0.1), [
    ...Array(4).fill(toon(WOOD)),
    new THREE.MeshBasicMaterial({ map: textTexture('DUSTY GULCH', '#c99a6b', '#fff6e6', 256, 80, '900 34px system-ui, sans-serif') }),
    toon(WOOD),
  ]);
  plank.position.y = 1.5;
  plank.rotation.z = 0.04;
  sign.add(plank);
  sign.position.set(-4, 0, 18.4);
  scene.add(sign);

  // Mesas on the horizon.
  const mesas: [number, number, number, number][] = [
    [-38, -34, 7, 9],
    [-20, -40, 5, 12],
    [2, -44, 9, 8],
    [26, -38, 6, 11],
    [42, -26, 5, 7],
    [-44, -14, 4, 6],
  ];
  for (const [x, z, w, h] of mesas) {
    const m = mesa(w, h);
    m.position.set(x, 0, z);
    scene.add(m);
  }
  // Rock spires guarding the canyon trail.
  for (const [x, z, w, h] of [
    [-17, -1, 1.4, 4.5],
    [-16.5, 4.5, 1.1, 3.2],
  ]) {
    const m = mesa(w, h);
    m.position.set(x, 0, z);
    scene.add(m);
  }

  // The railroad behind town, with a train puffing along it.
  const rail = track(160);
  rail.position.set(0, 0, -29);
  scene.add(rail);
  trainRef = train();
  trainRef.group.position.z = -29;
  scene.add(trainRef.group);

  // Rocks and a few skulls of cattle long gone.
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  for (const [x, z, s] of [
    [26, 8, 1.2],
    [-28, 4, 1.5],
    [8, -20, 1],
    [-14, -21, 1.3],
    [29, -12, 0.9],
  ]) {
    const r = toonMesh(rockGeo, 0xe0a688, { outline: 0.03 });
    r.position.set(x, 0.3 * s, z);
    r.scale.setScalar(s);
    scene.add(r);
  }
  for (const [x, z, ry] of [
    [-27, -6, 0.5],
    [24, -14, -0.8],
    [9, -16.5, 2],
  ]) {
    const sk = cowSkull();
    sk.position.set(x, 0, z);
    sk.rotation.y = ry;
    scene.add(sk);
  }

  // Desert scrub: pebbles, dry grass, little flowers and prickly pears.
  const outOfTown = (x: number, z: number) => (x > -10 && x < 8 && z > -9 && z < 6) || Math.hypot(x - 15, z + 3) < 4.5 || Math.abs(z + 29) < 2;
  const pick = (n: number, clearance: number) => scatter(rand, spaces, { count: n, extent: 42, clearance, reject: outOfTown });
  scene.add(instanced(new THREE.DodecahedronGeometry(0.25, 0), 0xe0a688, pick(60, 2.1).map(([x, z]) => ({ x, y: 0.05, z, s: 0.6 + rand(), ry: rand() * 6, sy: 0.6 }))));
  scene.add(instanced(new THREE.ConeGeometry(0.25, 0.7, 5), 0xd8c070, pick(70, 2.2).map(([x, z]) => ({ x, y: 0.3, z, s: 0.6 + rand() * 0.6, ry: rand() * 6 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.16, 8, 6), Palette.rose, pick(30, 2.2).map(([x, z]) => ({ x, y: 0.12, z, s: 0.8 + rand() * 0.5 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.4, 10, 8), CACTUS, pick(16, 2.6).map(([x, z]) => ({ x, y: 0.35, z, s: 0.8 + rand() * 0.5, ry: rand() * 6, sy: 1.1 }))));

  for (let i = 0; i < 3; i++) {
    const w = tumbleweed();
    w.userData.lane = 20 + i * 4;
    w.userData.offset = i * 23;
    scene.add(w);
    weeds.push(w);
  }

  devil = dustDevil();
  scene.add(devil);

  for (let i = 0; i < 2; i++) {
    const v = bird(0x8a7aa8, 0x6b5e88, Palette.peach);
    v.group.scale.setScalar(1.5);
    scene.add(v.group);
    vultures.push({ ...v, cx: i ? 18 : -20, cz: i ? -26 : -22, r: 6 + i * 2, y: 11 + i, speed: i ? 0.3 : -0.25, phase: i * 2 });
  }
}

function updateScenery(t: number): void {
  for (const s of spinners) s.rotation.z = t * 1.6;
  // Tumbleweeds bounce across the plain and wrap around.
  for (const w of weeds) {
    const x = ((t * 3 + (w.userData.offset as number)) % 80) - 40;
    w.position.set(x, 0.45 + Math.abs(Math.sin(t * 4 + (w.userData.offset as number))) * 0.6, -(w.userData.lane as number));
    w.rotation.z = -t * 6;
  }
  for (const d of doors) d.rotation.y = (d.userData.side as number) * Math.max(0, Math.sin(t * 2.2)) * 0.9 * Math.max(0, Math.sin(t * 0.4));
  if (horseRef) {
    (horseRef.userData.neck as THREE.Object3D).rotation.z = -0.35 * Math.max(0, Math.sin(t * 0.5)) ** 2;
    (horseRef.userData.tail as THREE.Object3D).rotation.x = Math.sin(t * 3) * 0.4;
  }
  if (trainRef) {
    trainRef.group.position.x = ((t * 5) % 170) - 85;
    for (const w of trainRef.wheels) w.rotation.y = -t * 12;
    trainRef.smoke.update(t);
  }
  if (cartRef) {
    // In and out of the mine: roll, wait, roll back.
    const k = Math.sin(t * 0.35);
    cartRef.position.x = Math.max(-1, Math.min(1, k * 1.6)) * 1.8;
  }
  if (lantern) lantern.material.opacity = 0.75 + Math.sin(t * 9) * 0.08 + Math.sin(t * 13) * 0.05;
  if (devil) {
    devil.position.set(Math.sin(t * 0.06) * 34, 0, -21 + Math.sin(t * 0.17) * 2.5);
    devil.rotation.y = t * 5;
    devil.children.forEach((r, i) => (r.position.x = Math.sin(t * 3 + i * 0.7) * 0.12 * i));
  }
  for (const v of vultures) flyBird(v, t, v.cx, v.cz, v.r, v.y, v.speed, v.phase);
}

export function dustyGulch(): BoardDef {
  const { spaces, startId } = layout();
  return {
    id: 'western',
    name: 'Dusty Gulch',
    spaces,
    startId,
    song: westernTheme,
    sky: [0x9fd0ff, 0xffe0c2],
    buildScenery,
    updateScenery,
    happening: {
      title: 'Dust devil!',
      description: 'A twister whisks you across the gulch!',
      style: 'launch',
    },
  };
}
