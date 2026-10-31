import * as THREE from 'three';
import { westernTheme } from '../audio/songs/western';
import { Palette } from '../render/palette';
import { makeCloud } from '../render/props';
import { toon, toonMesh } from '../render/toon';
import { bird, flyBird, glowSprite, instanced, scatter, seeded, Smoke, textTexture, type Bird } from './decor';
import { BoardBuilder } from './graph';
import type { BoardDef, Space } from './types';
import {
  bake,
  bakeLocal,
  bank,
  barrel,
  barrelCactus,
  barn,
  bench,
  blacksmith,
  bootHill,
  box,
  cactus,
  campfire,
  church,
  cliff,
  corral,
  cow,
  coveredWagon,
  crate,
  cyl,
  deadTree,
  DIRT,
  fence,
  flagpole,
  generalStore,
  hayBale,
  hitchingRail,
  horse,
  hotel,
  IRON,
  lamp,
  live,
  mesa,
  outhouse,
  pond,
  prairieDog,
  pricklyPear,
  put,
  roadrunner,
  rockArch,
  saloon,
  SAND,
  sheriff,
  signPlane,
  stable,
  station,
  telegraphPole,
  TERRACOTTA,
  trough,
  wagonWheel,
  wantedBoard,
  waterTower,
  well,
  windmill,
  WOOD,
  WOOD_DARK,
  chicken,
} from './westernProps';

export { cactus };

/**
 * Dusty Gulch: a dirt trail looping around a little frontier town, with red
 * mesas on the horizon. An old mine cuts across the east side (locked) and a
 * canyon trail cuts across the west. Around the loop: a chapel and Boot Hill,
 * the depot on the railroad, a ranch with a pond, and a cowpoke camp.
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

function tumbleweed(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(0.45, 1);
  const m = toonMesh(geo, 0xc7a46b, { outline: 0.02 });
  (m.material as THREE.MeshToonMaterial).wireframe = true;
  return m;
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
        const w = live(wheel(r, 0x4a4060));
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
  live(smoke.group);
  return { group: bakeLocal(g), wheels, smoke };
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

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

const GROUND = 128;
const GROUND_PX = 2048;

type Path = [number, number][];

/** Dirt roads between the landmarks (painted into the ground texture). */
const ROADS: Path[] = [
  // Main street north out of town, across the trail, to the depot.
  [
    [1.5, -1],
    [3, -7],
    [3.1, -13],
    [3.4, -22.6],
  ],
  // Down to the arch at the start.
  [
    [-0.5, 5],
    [-1.2, 10],
    [-1.6, 14],
  ],
  // Out to the ranch.
  [
    [3.3, -17.6],
    [11, -18.6],
    [19, -18.8],
    [22, -17.5],
  ],
  // Over to the chapel.
  [
    [3.2, -17.4],
    [-5, -18.2],
    [-11.8, -18.6],
  ],
];

/** Fixed-seed ground texture: sand, cracked earth, roads, the trail and speckles. */
function groundTexture(spaces: Space[], rand: () => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = GROUND_PX;
  const g = c.getContext('2d')!;
  const k = GROUND_PX / GROUND;
  const px = (v: number) => (v + GROUND / 2) * k;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(SAND);
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Soft blotches of darker and lighter sand.
  for (let i = 0; i < 90; i++) {
    const x = (rand() * 2 - 1) * 54;
    const z = (rand() * 2 - 1) * 54;
    const r = (2 + rand() * 6) * k;
    const grad = g.createRadialGradient(px(x), px(z), 0, px(x), px(z), r);
    const col = rand() < 0.6 ? '237,205,146' : '250,232,190';
    grad.addColorStop(0, `rgba(${col},0.75)`);
    grad.addColorStop(0.7, `rgba(${col},0.45)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(px(x), px(z), r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }

  // Cracked hardpan: a few patches of polygon cells.
  for (const [cx, cz, cr] of [
    [-30, -4, 6],
    [28, 14, 5],
    [-14, 24, 5],
    [36, -30, 6],
    [-40, -34, 5],
    [14, 26, 4],
  ]) {
    const base = g.createRadialGradient(px(cx), px(cz), 0, px(cx), px(cz), cr * k);
    base.addColorStop(0, 'rgba(236,200,140,0.9)');
    base.addColorStop(1, 'rgba(236,200,140,0)');
    g.fillStyle = base;
    g.beginPath();
    g.arc(px(cx), px(cz), cr * k, 0, Math.PI * 2);
    g.fill();
    // Short zig-zag cracks that read as dried-out hardpan cells.
    g.strokeStyle = 'rgba(214,176,124,0.55)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * cr * 0.8;
      let x = cx + Math.cos(a) * r;
      let z = cz + Math.sin(a) * r;
      let b = rand() * Math.PI * 2;
      g.beginPath();
      g.moveTo(px(x), px(z));
      for (let j = 0; j < 3; j++) {
        b += (rand() - 0.5) * 1.6;
        x += Math.cos(b) * 0.45;
        z += Math.sin(b) * 0.45;
        g.lineTo(px(x), px(z));
      }
      g.stroke();
    }
  }

  const stroke = (path: Path, width: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = width * k;
    g.beginPath();
    path.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))));
    g.stroke();
  };
  // Packed-dirt town square.
  const square = (r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(px(-0.3), px(0.6), r * 7.8 * k, r * 6.4 * k, 0, 0, Math.PI * 2);
    g.fill();
  };
  square(1.06, '#e3bf88');
  square(1, '#ebc994');
  for (const r of ROADS) stroke(r, 2.6, '#e3bf88');
  for (const r of ROADS) stroke(r, 2.1, '#ebc994');
  // Wagon ruts down the middle of each road.
  for (const r of ROADS) {
    for (const off of [-0.45, 0.45]) {
      const shifted: Path = r.map(([x, z], i) => {
        const [ax, az] = r[Math.max(0, i - 1)];
        const [bx, bz] = r[Math.min(r.length - 1, i + 1)];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        return [x + (-(bz - az) / len) * off, z + ((bx - ax) / len) * off];
      });
      stroke(shifted, 0.18, 'rgba(201,160,108,0.6)');
    }
  }

  // The trail: a darker edged dirt road linking every space.
  const links: Path[] = [];
  for (const s of spaces) for (const n of s.next) links.push([[s.pos.x, s.pos.z], [spaces[n].pos.x, spaces[n].pos.z]]);
  for (const l of links) stroke(l, 3.1, '#cfa26c');
  for (const s of spaces) {
    g.fillStyle = '#cfa26c';
    g.beginPath();
    g.arc(px(s.pos.x), px(s.pos.z), 1.9 * k, 0, Math.PI * 2);
    g.fill();
  }
  for (const l of links) stroke(l, 2.6, hex(DIRT));
  for (const s of spaces) {
    g.fillStyle = hex(DIRT);
    g.beginPath();
    g.arc(px(s.pos.x), px(s.pos.z), 1.65 * k, 0, Math.PI * 2);
    g.fill();
  }

  // Speckles of grit everywhere.
  const grit = ['rgba(214,170,115,0.55)', 'rgba(255,244,220,0.6)', 'rgba(229,154,116,0.45)', 'rgba(190,150,110,0.4)'];
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = grit[i % grit.length];
    const s = 1 + rand() * 2.5;
    g.fillRect(rand() * GROUND_PX, rand() * GROUND_PX, s, s);
  }
  // Fade the edges back to plain sand so the texture meets the outer plain.
  const edge = g.createRadialGradient(GROUND_PX / 2, GROUND_PX / 2, GROUND_PX * 0.4, GROUND_PX / 2, GROUND_PX / 2, GROUND_PX * 0.5);
  edge.addColorStop(0, 'rgba(243,217,164,0)');
  edge.addColorStop(1, hex(SAND));
  g.fillStyle = edge;
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function ground(spaces: Space[], rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const plain = new THREE.Mesh(new THREE.CircleGeometry(220, 48), toon(SAND));
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = -0.03;
  plain.receiveShadow = true;
  const painted = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), toon(0xffffff, { map: groundTexture(spaces, rand) }));
  painted.rotation.x = -Math.PI / 2;
  painted.position.y = -0.01;
  painted.receiveShadow = true;
  g.add(plain, painted);
  return g;
}

/* ------------------------------------------------------------------ */
/* Set pieces specific to the gulch                                    */
/* ------------------------------------------------------------------ */

/** Timber archway where the town road meets the trail. */
function gateway(): THREE.Group {
  const g = new THREE.Group();
  for (const z of [-2.3, 2.3]) {
    put(g, cyl(0.22, 0.26, 4.6, WOOD_DARK, 8, 0.025), 0, 2.3, z);
    put(g, cyl(0.3, 0.3, 0.2, WOOD_DARK, 8, 0.02), 0, 0.1, z);
  }
  put(g, cyl(0.2, 0.2, 5.6, WOOD_DARK, 8, 0.025), 0, 4.4, 0).rotation.x = Math.PI / 2;
  const wood = toon(WOOD);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 4.2), [
    new THREE.MeshBasicMaterial({ map: textTexture('DUSTY GULCH', '#c99a6b', '#fff6e6', 512, 110, '900 72px system-ui, sans-serif') }),
    wood,
    wood,
    wood,
    wood,
    wood,
  ]);
  put(g, plank, 0.06, 3.65, 0);
  for (const z of [-1.4, 1.4]) put(g, box(0.05, 0.5, 0.05, IRON, false), 0.06, 4.15, z);
  // Cow skulls on the posts.
  for (const z of [-2.3, 2.3]) {
    const sk = put(g, cowSkull(), 0.3, 4.75, z);
    sk.rotation.set(-Math.PI / 2 + 0.2, Math.PI / 2, 0);
    sk.scale.setScalar(0.8);
  }
  return g;
}

/** Rocky hill with a timber-framed mine entrance. */
function mineEntrance(): THREE.Group {
  const m = new THREE.Group();
  const hill = put(m, toonMesh(new THREE.SphereGeometry(3.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), TERRACOTTA, { outline: 0.05 }), 0, 0, 0);
  hill.scale.set(1, 0.9, 0.8);
  const top = put(m, toonMesh(new THREE.SphereGeometry(2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xf0b48c, { outline: 0.04 }), -0.8, 2, -0.6);
  top.scale.set(1, 0.8, 1);
  for (const [x, y, z, s] of [
    [2.6, 0.4, 1.3, 0.6],
    [-2.8, 0.3, 1.2, 0.5],
    [1.5, 2.4, -0.5, 0.45],
    [-2.2, 1.3, 1.6, 0.35],
  ]) {
    put(m, toonMesh(new THREE.DodecahedronGeometry(1, 0), 0xe08a6a, { outline: 0.03 }), x, y, z).scale.setScalar(s);
  }
  const hole = put(m, new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.8), new THREE.MeshBasicMaterial({ color: Palette.ink })), 0, 0.9, 2.62);
  hole.renderOrder = 1;
  for (const x of [-0.85, 0.85]) put(m, box(0.25, 2.1, 0.25, WOOD, 0.02), x, 1.05, 2.72);
  put(m, box(2.2, 0.3, 0.3, WOOD, 0.02), 0, 2.15, 2.72);
  put(m, signPlane('MINE', 1.2, 0.36), 0, 2.15, 2.88);
  // Ore piles and dynamite.
  put(m, toonMesh(new THREE.ConeGeometry(0.7, 0.6, 7), 0xb8a8c8, { outline: 0.02 }), 2.2, 0.3, 2.6);
  for (let i = 0; i < 4; i++) put(m, toonMesh(new THREE.DodecahedronGeometry(0.14, 0), Palette.yellow, { emissive: 0x332200, outline: 0.01 }), 2 + (i % 2) * 0.3, 0.55 + (i > 1 ? 0.12 : 0), 2.5 + i * 0.1);
  const tnt = put(m, crate(Palette.coral, 0.6), -2, 0.3, 2.9, 0.4);
  put(tnt, signPlane('TNT', 0.45, 0.22, '#ff7a7a', '#fff6e6', 36), 0, 0, 0.31);
  // Pickaxe leaning on the frame.
  const pick = put(m, new THREE.Group(), 1.25, 0.6, 2.95);
  put(pick, cyl(0.04, 0.04, 1.2, WOOD, 5, 0.01), 0, 0, 0);
  const headPick = put(pick, box(0.7, 0.08, 0.08, IRON, 0.01), 0, 0.58, 0);
  headPick.rotation.z = 0.1;
  pick.rotation.z = 0.35;
  return m;
}

/** Canvas tent for the prospector. */
function tent(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, 0);
  shape.lineTo(0, 1.5);
  shape.lineTo(1.1, 0);
  shape.lineTo(-1.1, 0);
  put(g, toonMesh(new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }), 0xf6ead0, { outline: 0.03 }), 0, 0, -1);
  put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1), new THREE.MeshBasicMaterial({ color: 0x9a8a7a })), 0, 0.5, 1.01);
  for (const z of [-1.05, 1.05]) put(g, box(0.06, 1.7, 0.06, WOOD_DARK, false), 0, 0.85, z);
  // Gold pan and a sluice box beside it.
  const pan = put(g, cyl(0.3, 0.2, 0.08, IRON, 12, 0.01), 1.4, 0.05, 0.8);
  pan.rotation.z = 0.2;
  const sluice = put(g, box(0.5, 0.3, 2, WOOD, 0.015), -1.6, 0.4, 0.2);
  sluice.rotation.x = 0.2;
  return g;
}

function bones(): THREE.Group {
  const g = new THREE.Group();
  put(g, cowSkull(), 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const rib = put(g, new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 4, 10, Math.PI), toon(Palette.cream)), -0.8 - i * 0.22, 0.02, 0);
    rib.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    rib.castShadow = true;
  }
  put(g, cyl(0.04, 0.04, 1, Palette.cream, 5, 0.01), -1.1, 0.04, 0).rotation.z = Math.PI / 2;
  return g;
}

/* ------------------------------------------------------------------ */
/* Build + animate                                                     */
/* ------------------------------------------------------------------ */

interface Cow {
  obj: THREE.Group;
  cx: number;
  cz: number;
  r: number;
  phase: number;
}

const anim = {
  spinners: [] as THREE.Object3D[],
  weeds: [] as THREE.Object3D[],
  doors: [] as THREE.Object3D[],
  glows: [] as THREE.Sprite[],
  smokes: [] as Smoke[],
  vultures: [] as (Bird & { cx: number; cz: number; r: number; y: number; speed: number; phase: number })[],
  chickens: [] as { obj: THREE.Group; x: number; z: number; phase: number }[],
  cows: [] as Cow[],
  dogs: [] as { body: THREE.Object3D; phase: number }[],
  clouds: [] as { obj: THREE.Object3D; x: number; speed: number }[],
  horse: null as THREE.Group | null,
  paddock: [] as { obj: THREE.Group; cx: number; cz: number; r: number; speed: number; phase: number }[],
  runner: null as THREE.Group | null,
  train: null as ReturnType<typeof train> | null,
  devil: null as THREE.Group | null,
  cart: null as THREE.Object3D | null,
  bell: null as THREE.Object3D | null,
  chair: null as THREE.Object3D | null,
  flag: null as THREE.Object3D | null,
  forge: null as THREE.Sprite | null,
  fire: null as ReturnType<typeof campfire> | null,
};

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  for (const v of Object.values(anim)) if (Array.isArray(v)) v.length = 0;
  const rand = seeded(0x60d);
  scene.add(ground(spaces, rand));

  // Warm late-afternoon light and a dusty haze toward the horizon.
  scene.fog = new THREE.Fog(0xffe2c4, 90, 240);
  const warm = new THREE.DirectionalLight(0xffb98a, 0.6);
  warm.position.set(-30, 12, -20);
  scene.add(warm);

  // Everything static goes here and is baked into a few draw calls at the end.
  const s = new THREE.Group();
  // Circles that scattered scrub must keep out of.
  const zones: [number, number, number][] = [];
  const place = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0, r = 0): T => {
    put(s, o, x, 0, z, ry);
    if (r) zones.push([x, z, r]);
    return o;
  };

  // --- Town ---------------------------------------------------------
  zones.push([-0.3, 0.6, 8.5], [1, 9.5, 5.5]);
  place(saloon(anim.doors), -0.8, -3.1, 0);
  place(generalStore(), -5.6, -2.7, 0.15);
  place(bank(), 4.1, -2.7, -0.15);
  place(hotel(), -6.5, 2.9, 1.15);
  const jail = place(sheriff(), 6.1, 2.7, -1.15);
  anim.chair = jail.userData.chair as THREE.Object3D;
  place(waterTower(), -7.4, -7.4, 0, 2);
  place(outhouse(), -2.9, -7.6, 0.3, 1);
  place(well(), 0.4, 3.4);
  place(hitchingRail(), 2.7, 4.4, -0.3);
  anim.horse = horse();
  place(anim.horse, 2.6, 5.1, -0.3);
  place(trough(), 4, 5.7, -0.3);
  place(wantedBoard(), -2.9, 1.5, 0.4);
  place(bench(), 3.9, 0.4, -0.15);
  for (const [x, z] of [
    [-3.5, 0.1],
    [2.3, 0.2],
    [-3.6, 5.6],
    [3.6, 7.2],
  ])
    place(lamp(anim.glows), x, z, x < 0 ? 0 : Math.PI);
  const flag = flagpole();
  place(flag.group, 7.2, -0.6);
  anim.flag = flag.flag;
  // Smithy, stable and the paddock along the south of the square.
  const smithy = blacksmith();
  place(smithy.group, -4.8, 7.6, 0.55);
  anim.smokes.push(smithy.smoke);
  anim.forge = smithy.glow;
  place(stable(), 7.6, 7.4, -0.95);
  place(corral(2.3, -Math.PI / 2), 3.8, 10.2);
  for (let i = 0; i < 2; i++) {
    const h = horse(i ? 0xfff6e6 : 0xb8a0d8, i ? 0xc8b4e0 : 0x6b5e88, null);
    h.scale.setScalar(0.85);
    place(h, 3.8, 10.2);
    anim.paddock.push({ obj: h, cx: 3.8, cz: 10.2, r: 1.1, speed: i ? 0.35 : -0.28, phase: i * 3 });
  }
  place(coveredWagon(), -1.6, 9.6, 0.5);
  place(hayBale(), 6.2, 10.3, 0.3);
  place(hayBale(), 5.6, 11.1, 1.1);
  place(barrel(), -7.4, 5.4);
  place(barrel(0x8fc0e0), -7.1, 4.7);
  place(crate(), 1.8, 7.6, 0.4).position.y = 0.35;
  place(wagonWheel(), 8.4, 4.6, -1).position.y = 0.58;
  for (let i = 0; i < 5; i++) {
    const c = chicken(i % 2 ? Palette.cream : 0xe8b48c);
    const x = -2 + (i % 3) * 1.4;
    const z = 4.6 + Math.floor(i / 3) * 1.6;
    place(c, x, z);
    anim.chickens.push({ obj: c, x, z, phase: i * 1.7 });
  }

  // --- Mine (east, inside the loop) --------------------------------
  place(mineEntrance(), 15.6, -3.2, -0.4, 4);
  const mineTrack = track(5);
  mineTrack.position.set(16.9, 0, 0.1);
  mineTrack.rotation.y = -0.4 + Math.PI / 2;
  // Not baked: the cart rides along it in the track's own space.
  scene.add(mineTrack);
  zones.push([17.6, 0.9, 2.4]);
  anim.cart = bakeLocal(mineCart());
  mineTrack.add(anim.cart);
  anim.cart.rotation.y = Math.PI / 2;
  const lantern = live(glowSprite(0xffd27a, 1.6, 0.9));
  lantern.position.set(13.9, 1.9, -0.6);
  s.add(lantern);
  anim.glows.push(lantern);
  place(tent(), 18.4, 4.8, -0.5, 2.2);
  const camp2 = campfire();
  place(camp2.group, 17, 7, 0);
  zones.push([17, 7, 1.5]);
  anim.fire = camp2;
  anim.smokes.push(camp2.smoke);

  // --- Canyon (west, inside the loop) ------------------------------
  for (const [x, z, w, h] of [
    [-17.2, -1.2, 1.5, 5],
    [-16.6, 4.6, 1.1, 3.4],
    [-19.2, 1.8, 0.9, 2.6],
    [-18.6, -5.4, 1, 3.6],
  ]) {
    place(mesa(w, h), x, z, rand() * 3, w + 1);
  }
  place(bones(), -17.6, 8.6, 0.6, 1.5);
  place(deadTree(), -15.4, 9.2, 1, 1);

  // --- North: chapel, Boot Hill, depot and railroad -----------------
  const chapel = church();
  place(chapel.group, -12, -22, 0, 4);
  anim.bell = chapel.bell;
  place(bootHill(rand), -24, -21.5, 0.2, 6);
  place(station(), 3.6, -24.8, 0, 5);
  place(waterTower(true), 13, -26.2, 0.2, 2);
  place(wantedBoard(), -1.8, -23.6, 0.2);
  place(barrel(), 7, -23.2);
  place(barrel(0x8fc0e0), 7.6, -23.6);
  const rail = track(170);
  rail.position.set(0, 0, -29);
  s.add(rail);
  zones.push([0, -29, 0]);
  // Telegraph line on the far side of the tracks.
  const wireY = 4;
  const wire: THREE.Vector3[] = [];
  for (let x = -72; x <= 72; x += 9) {
    place(telegraphPole(), x, -31.6);
    wire.push(new THREE.Vector3(x - 0.45, wireY, -31.6), new THREE.Vector3(x + 0.45, wireY, -31.6));
  }
  for (const off of [-0.45, 0.45]) {
    const pts: THREE.Vector3[] = [];
    for (let x = -72; x < 72; x += 9) {
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        pts.push(new THREE.Vector3(x + off + u * 9, wireY - Math.sin(u * Math.PI) * 0.45, -31.6));
      }
    }
    s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: Palette.ink })));
  }

  // --- North-east: ranch, pond, windmill ----------------------------
  place(barn(), 29, -23.5, -0.45, 5);
  place(corral(4, Math.PI * 0.85), 22.8, -19.6, 0, 4.5);
  for (let i = 0; i < 3; i++) {
    const c = cow([0x8a7aa8, 0xe8a882, 0x6b5e88][i]);
    place(c, 22.8, -19.6);
    anim.cows.push({ obj: c, cx: 22.8, cz: -19.6, r: 1.2 + i * 0.9, phase: i * 2.1 });
  }
  place(windmill(anim.spinners), 30, -9, -0.6, 2);
  place(pond(3), 34, -13.5, 0, 4.5);
  place(trough(), 31.2, -10.4, 0.6);

  // --- East: rock arch and big saguaros -------------------------------
  place(rockArch(), 33, 5, 0.35, 4);

  // --- West: cowpoke camp and the canyon wall ------------------------
  place(coveredWagon(), -31.5, 9.5, -0.6, 3);
  const camp = campfire();
  place(camp.group, -29.6, 5.6, 0, 2);
  anim.smokes.push(camp.smoke);
  anim.glows.push(camp.glow);
  const fireFlames = camp.flame;
  fireFlames.userData.flicker = true;
  anim.clouds.length = 0;
  const westWall = cliff(70, 12, rand);
  westWall.position.set(-42, 0, -4);
  westWall.rotation.y = Math.PI / 2;
  s.add(westWall);
  const eastWall = cliff(40, 9, rand);
  eastWall.position.set(46, 0, -14);
  eastWall.rotation.y = -Math.PI / 2 + 0.2;
  s.add(eastWall);

  // --- South: the arch over the trail and the edge of town ------------
  place(gateway(), -1.3, 12, -Math.PI / 2 + 0.06);
  zones.push([-3.6, 12, 0.8], [1, 12, 0.8]);
  const welcome = new THREE.Group();
  for (const x of [-0.7, 0.7]) put(welcome, cyl(0.07, 0.07, 1.6, WOOD, 6, 0.015), x, 0.8, 0);
  put(welcome, signPlane('POP. 4', 1.6, 0.6, '#c99a6b', '#fff6e6', 36), 0, 1.35, 0.05);
  place(welcome, 4.5, 19.2, -0.2, 1.2);
  for (const [x, z] of [
    [-9, 20],
    [-14, 19.4],
    [10, 20.2],
    [16, 19.2],
  ])
    place(fence(4), x, z, rand() - 0.5);
  place(wagonWheel(), -6.4, 19.8, 0.4).position.y = 0.58;

  // --- Horizon: mesas, far mountains ----------------------------------
  for (const [x, z, w, h] of [
    [-38, -40, 7, 10],
    [-20, -46, 5, 13],
    [2, -50, 9, 9],
    [24, -46, 6, 12],
    [42, -36, 5, 8],
    [-44, -22, 4, 7],
    [46, 20, 5, 8],
    [-46, 26, 6, 9],
  ]) {
    place(mesa(w, h), x, z, rand() * 3);
  }
  const far = [0xe8b4b0, 0xd8b8d8, 0xf0c4a8, 0xc8b8e0];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * 0.95 + (i / 25) * Math.PI * 1.1 + (rand() - 0.5) * 0.08;
    const r = 120 + rand() * 40;
    const w = 14 + rand() * 18;
    const h = 10 + rand() * 18;
    const m = rand() < 0.5 ? mesa(w, h, [far[i % 4], far[(i + 1) % 4]], false, 7) : put(new THREE.Group(), toonMesh(new THREE.ConeGeometry(w, h, 6), far[i % 4], { outline: false }), 0, h / 2, 0);
    place(m, Math.cos(a) * r, Math.sin(a) * r, rand() * 3);
  }

  // --- Scrub and cacti -----------------------------------------------
  const nearRoad = (x: number, z: number) =>
    ROADS.some((r) =>
      r.slice(1).some(([bx, bz], i) => {
        const [ax, az] = r[i];
        const dx = bx - ax;
        const dz = bz - az;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(x - ax - dx * u, z - az - dz * u) < 2;
      }),
    );
  const blocked = (x: number, z: number) => nearRoad(x, z) || zones.some(([zx, zz, r]) => (r ? Math.hypot(x - zx, z - zz) < r : Math.abs(z - zz) < 2.5));
  const pick = (n: number, clearance: number, extent = 46) => scatter(rand, spaces, { count: n, extent, clearance, reject: blocked });
  // Saguaros: tall ones on the far side of the trail, a few out front.
  for (const [x, z] of pick(34, 2.8)) {
    if (z > 18 && rand() < 0.5) continue;
    const h = 1.4 + rand() * 1.8;
    const c = place(cactus(h), x, z, rand() * 6);
    if (rand() < 0.5) put(c, toonMesh(new THREE.SphereGeometry(0.2, 10, 6), Palette.rose, { outline: 0.015 }), 0, h + 0.75, 0);
    zones.push([x, z, 1.2]);
  }
  for (const [x, z] of pick(22, 2.4)) {
    place(pricklyPear(rand), x, z, rand() * 6);
    zones.push([x, z, 1]);
  }
  for (const [x, z] of pick(18, 2.2)) {
    place(barrelCactus(), x, z).scale.setScalar(0.7 + rand() * 0.5);
    zones.push([x, z, 0.8]);
  }
  for (const [x, z] of pick(6, 3)) {
    place(deadTree(), x, z, rand() * 6).scale.setScalar(0.8 + rand() * 0.4);
    zones.push([x, z, 1.5]);
  }
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  for (const [x, z] of pick(16, 2.6)) {
    const r = place(toonMesh(rockGeo, rand() < 0.5 ? 0xe0a688 : 0xd8b0a0, { outline: 0.03 }), x, z, rand() * 6);
    const sc = 0.7 + rand() * 1.1;
    r.scale.set(sc, sc * 0.8, sc);
    r.position.y = 0.25 * sc;
  }
  for (const [x, z] of pick(6, 2.4)) place(cowSkull(), x, z, rand() * 6);
  // Fine scrub as instanced batches.
  scene.add(instanced(new THREE.DodecahedronGeometry(0.25, 0), 0xe0a688, pick(110, 2.1, 50).map(([x, z]) => ({ x, y: 0.05, z, s: 0.6 + rand(), ry: rand() * 6, sy: 0.6 }))));
  scene.add(instanced(new THREE.ConeGeometry(0.25, 0.7, 5), 0xd8c070, pick(120, 2.2, 50).map(([x, z]) => ({ x, y: 0.3, z, s: 0.6 + rand() * 0.6, ry: rand() * 6 }))));
  scene.add(instanced(new THREE.ConeGeometry(0.2, 0.5, 4), 0xb8d890, pick(80, 2.2, 50).map(([x, z]) => ({ x, y: 0.22, z, s: 0.6 + rand() * 0.6, ry: rand() * 6 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.16, 8, 6), Palette.rose, pick(40, 2.2).map(([x, z]) => ({ x, y: 0.12, z, s: 0.8 + rand() * 0.5 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.14, 8, 6), 0xfff0a8, pick(40, 2.2).map(([x, z]) => ({ x, y: 0.1, z, s: 0.8 + rand() * 0.5 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.4, 10, 8), 0x9fd4a0, pick(30, 2.6).map(([x, z]) => ({ x, y: 0.3, z, s: 0.6 + rand() * 0.6, ry: rand() * 6, sy: 0.8 }))));

  // Prairie dog town, south of the trail.
  for (const [x, z] of [
    [8.4, 20.4],
    [10.6, 21.8],
    [12.4, 20.2],
    [-11.6, 20.6],
    [-13.8, 22],
    [26, 13],
    [27.6, 11.4],
  ]) {
    const d = prairieDog();
    place(d.group, x, z);
    anim.dogs.push({ body: d.body, phase: rand() * 10 });
  }

  scene.add(bake(s));
  // Baking left the chair with a world-space yaw; rock it about its own axis.
  if (anim.chair) anim.chair.rotation.order = 'YXZ';

  // --- Moving things (outside the bake) -------------------------------
  anim.train = train();
  anim.train.group.position.z = -29;
  scene.add(anim.train.group);
  for (let i = 0; i < 4; i++) {
    const w = tumbleweed();
    w.userData.lane = [-17.4, 22.5, -35, 25.5][i];
    w.userData.offset = i * 23;
    scene.add(w);
    anim.weeds.push(w);
  }
  anim.devil = dustDevil();
  scene.add(anim.devil);
  anim.runner = roadrunner();
  scene.add(anim.runner);
  for (let i = 0; i < 3; i++) {
    const v = bird(0x8a7aa8, 0x6b5e88, Palette.peach);
    v.group.scale.setScalar(1.5);
    scene.add(v.group);
    anim.vultures.push({ ...v, cx: [-20, 18, 30][i], cz: [-24, -26, 8][i], r: 6 + i * 2, y: 11 + i, speed: [-0.25, 0.3, 0.22][i], phase: i * 2 });
  }
  for (let i = 0; i < 6; i++) {
    const c = makeCloud(2 + rand() * 1.5);
    c.position.set(0, 24 + rand() * 10, -70 - rand() * 40);
    scene.add(c);
    anim.clouds.push({ obj: c, x: (rand() * 2 - 1) * 120, speed: 0.6 + rand() * 0.6 });
  }
}

function updateScenery(t: number): void {
  for (const s of anim.spinners) s.rotation.z = t * 1.6;
  // Tumbleweeds bounce across the plain and wrap around.
  for (const w of anim.weeds) {
    const off = w.userData.offset as number;
    const x = ((t * 3 + off) % 100) - 50;
    w.position.set(x, 0.45 + Math.abs(Math.sin(t * 4 + off)) * 0.6, w.userData.lane as number);
    w.rotation.z = -t * 6;
  }
  for (const d of anim.doors) d.rotation.y = (d.userData.side as number) * Math.max(0, Math.sin(t * 2.2)) * 0.9 * Math.max(0, Math.sin(t * 0.4));
  if (anim.horse) {
    const u = anim.horse.userData;
    (u.neck as THREE.Object3D).rotation.z = -0.35 * Math.max(0, Math.sin(t * 0.5)) ** 2;
    (u.tail as THREE.Object3D).rotation.x = Math.sin(t * 3) * 0.4;
  }
  // Paddock ponies trot in slow circles.
  for (const p of anim.paddock) {
    const a = t * p.speed + p.phase;
    p.obj.position.set(p.cx + Math.cos(a) * p.r, Math.abs(Math.sin(t * 6 + p.phase)) * 0.06, p.cz + Math.sin(a) * p.r);
    p.obj.rotation.y = -a - (p.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    const legs = p.obj.userData.legs as THREE.Object3D[];
    legs.forEach((l, i) => (l.rotation.z = Math.sin(t * 6 + p.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.4));
    (p.obj.userData.tail as THREE.Object3D).rotation.x = Math.sin(t * 4 + p.phase) * 0.3;
  }
  // Cows wander slowly, stopping to graze.
  for (const c of anim.cows) {
    const walk = Math.sin(t * 0.15 + c.phase);
    const a = t * 0.08 + c.phase + Math.max(0, walk) * 0;
    const ang = c.phase * 2 + Math.sin(t * 0.07 + c.phase) * 1.4;
    c.obj.position.set(c.cx + Math.cos(ang) * c.r, 0, c.cz + Math.sin(ang) * c.r);
    c.obj.rotation.y = -ang - Math.PI / 2 * Math.sign(Math.cos(t * 0.07 + c.phase));
    const graze = Math.max(0, Math.sin(t * 0.6 + c.phase));
    (c.obj.userData.head as THREE.Object3D).rotation.z = -graze * 0.7 + Math.sin(a * 20) * 0.02;
    (c.obj.userData.tail as THREE.Object3D).rotation.x = Math.sin(t * 2.5 + c.phase) * 0.35;
  }
  // Chickens peck and hop about.
  for (const ch of anim.chickens) {
    const k = t * 0.5 + ch.phase;
    ch.obj.position.set(ch.x + Math.sin(k) * 0.6, Math.max(0, Math.sin(t * 9 + ch.phase)) * 0.05, ch.z + Math.sin(k * 0.7) * 0.4);
    ch.obj.rotation.y = -Math.atan2(Math.cos(k * 0.7) * 0.28, Math.cos(k) * 0.6);
    const peck = Math.sin(t * 3 + ch.phase) > 0.5 ? 0.9 : 0;
    (ch.obj.userData.head as THREE.Object3D).rotation.z = -peck;
  }
  // Prairie dogs pop up, look around and duck back down.
  for (const d of anim.dogs) {
    const k = (t * 0.25 + d.phase) % 4;
    const up = k < 2 ? Math.min(1, k * 4, (2 - k) * 4) : 0;
    d.body.position.y = -0.55 + up * 0.55;
    d.body.rotation.y = Math.sin(t * 1.5 + d.phase) * 0.8;
    d.body.visible = up > 0.05;
  }
  // Roadrunner: a dash across the south plain every so often.
  if (anim.runner) {
    const cycle = t % 18;
    const run = cycle < 6;
    anim.runner.visible = run;
    if (run) {
      anim.runner.position.set(-45 + cycle * 15, Math.abs(Math.sin(t * 22)) * 0.08, 18.4);
      (anim.runner.userData.legs as THREE.Object3D[]).forEach((l, i) => (l.rotation.z = Math.sin(t * 30 + i * Math.PI) * 0.9));
    }
  }
  if (anim.train) {
    anim.train.group.position.x = ((t * 5) % 180) - 90;
    for (const w of anim.train.wheels) w.rotation.y = -t * 12;
    anim.train.smoke.update(t);
  }
  for (const s of anim.smokes) s.update(t);
  if (anim.cart) {
    // In and out of the mine: roll, wait, roll back.
    const k = Math.sin(t * 0.35);
    anim.cart.position.x = Math.max(-1, Math.min(1, k * 1.6)) * 1.8;
  }
  anim.glows.forEach((g, i) => (g.material.opacity = 0.72 + Math.sin(t * 9 + i) * 0.08 + Math.sin(t * 13 + i * 2) * 0.05));
  if (anim.forge) anim.forge.material.opacity = 0.6 + Math.sin(t * 7) * 0.15 + Math.sin(t * 17) * 0.08;
  if (anim.fire) {
    anim.fire.flame.scale.set(1, 0.85 + Math.sin(t * 14) * 0.12 + Math.sin(t * 23) * 0.06, 1);
    anim.fire.flame.rotation.y = t * 2;
    anim.fire.glow.material.opacity = 0.6 + Math.sin(t * 11) * 0.12;
  }
  if (anim.bell) anim.bell.rotation.x = Math.sin(t * 2.4) * 0.35 * Math.max(0, Math.sin(t * 0.21));
  if (anim.chair) anim.chair.rotation.x = Math.sin(t * 1.8) * 0.12;
  if (anim.flag) {
    anim.flag.rotation.y = 0.3 + Math.sin(t * 1.3) * 0.25;
    anim.flag.scale.x = 0.9 + Math.sin(t * 5) * 0.1;
  }
  if (anim.devil) {
    anim.devil.position.set(Math.sin(t * 0.06) * 40, 0, -38 + Math.sin(t * 0.17) * 3);
    anim.devil.rotation.y = t * 5;
    anim.devil.children.forEach((r, i) => (r.position.x = Math.sin(t * 3 + i * 0.7) * 0.12 * i));
  }
  for (const v of anim.vultures) flyBird(v, t, v.cx, v.cz, v.r, v.y, v.speed, v.phase);
  for (const c of anim.clouds) c.obj.position.x = ((c.x + t * c.speed + 150) % 300) - 150;
}

export function dustyGulch(): BoardDef {
  const { spaces, startId } = layout();
  return {
    id: 'western',
    name: 'Dusty Gulch',
    spaces,
    startId,
    song: westernTheme,
    sky: [0x8fc4f5, 0xffd9b8],
    buildScenery,
    updateScenery,
    happening: {
      title: 'Dust devil!',
      description: 'A twister whisks you across the gulch!',
      style: 'launch',
    },
  };
}
