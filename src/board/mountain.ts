import * as THREE from 'three';
import { frostbiteTheme } from '../audio/songs/frostbite';
import { Palette } from '../render/palette';
import { makeCloud } from '../render/props';
import { toon, toonMesh } from '../render/toon';
import { bird, flyBird, instanced, scatter, seeded, Smoke, type Bird } from './decor';
import { BoardBuilder } from './graph';
import {
  bigPine,
  chalet,
  cocoaStand,
  crystals,
  fishingHut,
  hotSpring,
  ICE,
  iceCave,
  igloo,
  lanternPost,
  liftChair,
  liftStation,
  liftTower,
  lodge,
  pennants,
  penguin,
  pine,
  PINE,
  PINE_DARK,
  ridge,
  ROCK,
  ROCK_DARK,
  signpost,
  skier,
  skiJump,
  skiRack,
  sled,
  SNOW,
  SNOW_SHADE,
  snowman,
  snowRock,
  welcomeArch,
  woodpile,
  yeti,
} from './mountainProps';
import type { BoardDef, Space } from './types';
import { bake, bench, put } from './westernProps';
import { fbm } from './pirateTerrain';

/**
 * Frostbite Peak: a snowy trail looping round an alpine village at the foot
 * of a big mountain. A locked ice cave cuts through the east side; the west
 * shortcut crosses a frozen lake. Around the loop: the ski lift up the
 * mountain, igloos, a steaming hot spring, a sledding hill and a yeti who
 * keeps peeking out from behind the rocks.
 */
function layout(): { spaces: Space[]; startId: number } {
  const b = new BoardBuilder()
    .loop(
      [
        [0, 16],
        [11, 15],
        [20, 10],
        [24, 1],
        [21, -8],
        [13, -14],
        [4, -15],
        [-5, -12],
        [-14, -15],
        [-22, -10],
        [-25, 0],
        [-21, 10],
        [-11, 15],
      ],
      'S B B I B R B H B B* ' + 'R B B T B H B* V B I ' + 'B B R H B B* P B R B ' + 'I B H B* B V B R B B',
    )
    // Through the ice cave: a locked shortcut on the east side.
    .branch(7, 14, [[15.5, 4], [14.5, -5]], 'B R H B* B R', true)
    // Across the frozen lake on the west side.
    .branch(26, 35, [[-14.5, -4], [-13.5, 5]], 'B I B* H B R');
  return { spaces: b.spaces, startId: b.loopId(0) };
}

/* ------------------------------------------------------------------ */
/* The mountain range to the north                                     */
/* ------------------------------------------------------------------ */

/** Where the flat valley floor ends and the slopes begin. */
const FOOT_Z = -27;

/** [x, z, height, radius] for each peak. */
const PEAKS: [number, number, number, number][] = [
  [0, -74, 42, 40],
  [-38, -64, 30, 28],
  [36, -62, 32, 30],
  [-76, -54, 26, 30],
  [76, -52, 24, 28],
  [-20, -50, 13, 15],
  [28, -42, 10, 13],
];

const ramp = (a: number, b: number, v: number) => {
  const k = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Height of the mountains at (x, z); zero (just under the snow) on the valley floor. */
export function mountainHeight(x: number, z: number): number {
  const rise = ramp(FOOT_Z, FOOT_Z - 14, z);
  let h = rise * 5;
  for (const [px, pz, ph, pr] of PEAKS) {
    const p = Math.max(0, 1 - Math.hypot(x - px, z - pz) / pr);
    h = Math.max(h, ph * p ** 1.25);
  }
  h += fbm(x * 0.6, z * 0.6) * 3 * rise;
  return h * ramp(FOOT_Z, FOOT_Z - 3, z) - 0.3;
}

/** Height-field mountains: snow everywhere except on the steep rock faces. */
function mountains(): THREE.Mesh {
  const W = 260;
  const D = 110;
  const geo = new THREE.PlaneGeometry(W, D, 170, 80);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, FOOT_Z + 1 - D / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, mountainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const snow = new THREE.Color(SNOW);
  const shade = new THREE.Color(SNOW_SHADE);
  const rock = new THREE.Color(ROCK);
  const rockDark = new THREE.Color(ROCK_DARK);
  const c = new THREE.Color();
  const cold = new THREE.Color(0xc9d3f2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const steep = 1 - nrm.getY(i);
    const n = fbm(x * 1.7 + 9, z * 1.7 - 4);
    // Rock shows through on steep faces and along noisy gullies up high.
    const rocky = steep * 2.4 + n * 1.3 + Math.min(1, h / 30) * 0.35;
    if (h > 1 && rocky > 0.72) c.copy(n > 0.08 ? rockDark : rock);
    else {
      c.copy(snow).lerp(shade, Math.max(0, Math.min(1, steep * 3 + n)));
      // Shadowed north-west faces go cold blue.
      const away = Math.max(0, -nrm.getX(i) * 0.6 - nrm.getZ(i) * 0.8);
      c.lerp(cold, Math.min(0.85, away * 1.6));
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = toon(0xffffff);
  mat.vertexColors = true;
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** Far-off snowy peaks all round the horizon. */
function farPeak(w: number, h: number, color: number): THREE.Group {
  const g = new THREE.Group();
  put(g, toonMesh(new THREE.ConeGeometry(w, h, 7), color, { outline: false }), 0, h / 2, 0);
  put(g, toonMesh(new THREE.ConeGeometry(w * 0.45, h * 0.45, 7), SNOW, { outline: false }), 0, h - h * 0.225 + 0.05, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

/** The valley floor is a touch bluer than the white snow on props, so they read. */
const GROUND_SNOW = 0xeaf0fc;

const GROUND = 128;
const GROUND_PX = 2048;

type Path = [number, number][];

/** Sledding hill, south-east of the loop. */
const HILL = { x: 31, z: 18, r: 4.8, sy: 0.65 };

/** Frozen lake (centre x, z and radii) under the west shortcut. */
const LAKE = { x: -15, z: 0.5, rx: 5.8, rz: 9.6 };

/** Packed-snow lanes between the landmarks (painted into the ground). */
const ROADS: Path[] = [
  // From the square down through the arch to the start.
  [
    [0, 5],
    [-0.3, 10],
    [0, 14],
  ],
  // North past the lodge to the lift station.
  [
    [3.2, -1],
    [5, -8],
    [7, -14],
    [8, -18.6],
  ],
  // Over to the igloos.
  [
    [-4, -1],
    [-6, -7],
    [-8, -11],
  ],
];

function groundTexture(spaces: Space[], rand: () => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = GROUND_PX;
  const g = c.getContext('2d')!;
  const k = GROUND_PX / GROUND;
  const px = (v: number) => (v + GROUND / 2) * k;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(GROUND_SNOW);
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Soft blue-lavender hollows and bright drifts.
  for (let i = 0; i < 110; i++) {
    const x = (rand() * 2 - 1) * 56;
    const z = (rand() * 2 - 1) * 56;
    const r = (2 + rand() * 7) * k;
    const grad = g.createRadialGradient(px(x), px(z), 0, px(x), px(z), r);
    const col = rand() < 0.6 ? '210,220,246' : '255,255,255';
    grad.addColorStop(0, `rgba(${col},0.8)`);
    grad.addColorStop(0.7, `rgba(${col},0.4)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(px(x), px(z), r, r * (0.5 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Wind ripples: short curved strokes.
  g.strokeStyle = 'rgba(205,215,242,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 260; i++) {
    const x = (rand() * 2 - 1) * 58;
    const z = (rand() * 2 - 1) * 58;
    const len = (0.8 + rand() * 1.6) * k;
    g.beginPath();
    g.arc(px(x), px(z), len, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }

  // The frozen lake: snowy rim, ice, cracks and skate swirls.
  const lake = (grow: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(px(LAKE.x), px(LAKE.z), (LAKE.rx + grow) * k, (LAKE.rz + grow) * k, 0.08, 0, Math.PI * 2);
    g.fill();
  };
  lake(0.7, '#dfe7f8');
  lake(0, hex(ICE));
  const sheen = g.createRadialGradient(px(LAKE.x - 1.5), px(LAKE.z - 3), 0, px(LAKE.x), px(LAKE.z), LAKE.rz * k);
  sheen.addColorStop(0, 'rgba(255,255,255,0.65)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  sheen.addColorStop(1, 'rgba(143,205,236,0.35)');
  g.fillStyle = sheen;
  lake(0, 'rgba(0,0,0,0)');
  g.fillStyle = sheen;
  g.beginPath();
  g.ellipse(px(LAKE.x), px(LAKE.z), LAKE.rx * k, LAKE.rz * k, 0.08, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2.5;
  for (let i = 0; i < 16; i++) {
    let x = LAKE.x + (rand() * 2 - 1) * LAKE.rx * 0.7;
    let z = LAKE.z + (rand() * 2 - 1) * LAKE.rz * 0.7;
    let a = rand() * Math.PI * 2;
    g.beginPath();
    g.moveTo(px(x), px(z));
    for (let j = 0; j < 4; j++) {
      a += (rand() - 0.5) * 1.4;
      x += Math.cos(a) * 0.8;
      z += Math.sin(a) * 0.8;
      g.lineTo(px(x), px(z));
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(160,200,232,0.5)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) {
    const cx = LAKE.x + (rand() * 2 - 1) * 2.5;
    const cz = LAKE.z + (rand() * 2 - 1) * 5;
    g.beginPath();
    g.ellipse(px(cx), px(cz), (1 + rand() * 1.8) * k, (0.6 + rand()) * k, rand() * 3, 0, Math.PI * 1.6);
    g.stroke();
  }

  const stroke = (path: Path, width: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = width * k;
    g.beginPath();
    path.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))));
    g.stroke();
  };
  // Trampled village square.
  const square = (r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(px(0), px(1.5), r * 8 * k, r * 6.6 * k, 0, 0, Math.PI * 2);
    g.fill();
  };
  square(1.05, '#dbe3f6');
  square(1, '#e7edfb');
  // Cobbles peeking through the snow in the square.
  for (let i = 0; i < 160; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    g.fillStyle = rand() < 0.5 ? 'rgba(200,196,230,0.55)' : 'rgba(214,206,236,0.5)';
    g.beginPath();
    g.ellipse(px(Math.cos(a) * r * 7), px(1.5 + Math.sin(a) * r * 5.6), 0.22 * k, 0.16 * k, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (const r of ROADS) stroke(r, 2.4, '#dbe3f6');
  for (const r of ROADS) stroke(r, 1.9, '#e7edfb');
  // Sled runner tracks and footprints along the lanes.
  for (const r of ROADS) {
    for (const off of [-0.35, 0.35]) {
      const shifted: Path = r.map(([x, z], i) => {
        const [ax, az] = r[Math.max(0, i - 1)];
        const [bx, bz] = r[Math.min(r.length - 1, i + 1)];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        return [x + (-(bz - az) / len) * off, z + ((bx - ax) / len) * off];
      });
      stroke(shifted, 0.1, 'rgba(176,188,226,0.6)');
    }
  }

  // The trail: packed, slightly blue snow with a darker edge.
  const links: Path[] = [];
  for (const s of spaces) for (const n of s.next) links.push([[s.pos.x, s.pos.z], [spaces[n].pos.x, spaces[n].pos.z]]);
  const blob = (r: number, color: string) => {
    g.fillStyle = color;
    for (const s of spaces) {
      g.beginPath();
      g.arc(px(s.pos.x), px(s.pos.z), r * k, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (const l of links) stroke(l, 3.1, '#a3b3df');
  blob(1.9, '#a3b3df');
  for (const l of links) stroke(l, 2.6, '#c6d1ef');
  blob(1.65, '#c6d1ef');
  // Boot prints dotted down the middle of the trail.
  g.fillStyle = 'rgba(176,190,228,0.55)';
  for (const [[ax, az], [bx, bz]] of links) {
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0.6; d < len; d += 0.7) {
      const u = d / len;
      const side = Math.round(d / 0.7) % 2 ? 0.18 : -0.18;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      g.beginPath();
      g.ellipse(px(ax + (bx - ax) * u + nx * side), px(az + (bz - az) * u + nz * side), 0.1 * k, 0.16 * k, Math.atan2(bz - az, bx - ax) + Math.PI / 2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Sparkles in the snow.
  const sparkle = ['rgba(255,255,255,0.9)', 'rgba(200,214,250,0.5)', 'rgba(230,214,255,0.5)', 'rgba(190,232,250,0.5)'];
  for (let i = 0; i < 8000; i++) {
    g.fillStyle = sparkle[i % sparkle.length];
    const s = 1 + rand() * 2.5;
    g.fillRect(rand() * GROUND_PX, rand() * GROUND_PX, s, s);
  }
  const edge = g.createRadialGradient(GROUND_PX / 2, GROUND_PX / 2, GROUND_PX * 0.4, GROUND_PX / 2, GROUND_PX / 2, GROUND_PX * 0.5);
  edge.addColorStop(0, 'rgba(234,240,252,0)');
  edge.addColorStop(1, hex(GROUND_SNOW));
  g.fillStyle = edge;
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function ground(spaces: Space[], rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const plain = new THREE.Mesh(new THREE.CircleGeometry(220, 48), toon(GROUND_SNOW));
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
/* Snowfall                                                            */
/* ------------------------------------------------------------------ */

const FLAKES = 1400;
const FLAKE_TOP = 26;

function flakeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function snowfall(rand: () => number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLAKES * 3), 3));
  const seed = new Float32Array(FLAKES * 4);
  for (let i = 0; i < FLAKES; i++) seed.set([(rand() * 2 - 1) * 55, (rand() * 2 - 1) * 50 - 4, 0.8 + rand() * 0.9, rand()], i * 4);
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ map: flakeTexture(), size: 0.28, transparent: true, depthWrite: false, opacity: 0.9, color: 0xffffff }),
  );
  pts.userData.seed = seed;
  pts.frustumCulled = false;
  return pts;
}

function updateSnow(pts: THREE.Points, t: number): void {
  const seed = pts.userData.seed as Float32Array;
  const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
  const a = pos.array as Float32Array;
  for (let i = 0; i < FLAKES; i++) {
    const x = seed[i * 4];
    const z = seed[i * 4 + 1];
    const sp = seed[i * 4 + 2];
    const ph = seed[i * 4 + 3];
    const y = FLAKE_TOP - ((t * sp + ph * FLAKE_TOP) % FLAKE_TOP);
    a[i * 3] = x + Math.sin(t * 0.6 + ph * 20) * 0.9 + t * 0.15 * sp - Math.floor((x + t * 0.15 * sp + 55) / 110) * 110;
    a[i * 3 + 1] = y;
    a[i * 3 + 2] = z + Math.cos(t * 0.45 + ph * 17) * 0.6;
  }
  pos.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Scenery                                                             */
/* ------------------------------------------------------------------ */

/** Base and top of the chairlift (bullwheel centres) and the cable height above them. */
const LIFT_BASE = new THREE.Vector3(8, 3.3, -23.4);
const LIFT_TOP_XZ: [number, number] = [8, -52];
const LIFT_OFFSET = 1.25;
const LIFT_CHAIRS = 14;

interface Skier {
  obj: THREE.Group;
  x: number;
  phase: number;
  speed: number;
}

const anim = {
  smokes: [] as Smoke[],
  glows: [] as THREE.Sprite[],
  bulbs: [] as THREE.Mesh[],
  chairs: [] as THREE.Object3D[],
  wheels: [] as THREE.Object3D[],
  skiers: [] as Skier[],
  colony: [] as { obj: THREE.Group; phase: number }[],
  sliders: [] as { obj: THREE.Group; x: number; phase: number }[],
  bobs: [] as THREE.Object3D[],
  birds: [] as (Bird & { cx: number; cz: number; r: number; y: number; speed: number; phase: number })[],
  clouds: [] as { obj: THREE.Object3D; x: number; speed: number }[],
  yeti: null as THREE.Group | null,
  sledder: null as THREE.Group | null,
  snow: null as THREE.Points | null,
  liftTop: new THREE.Vector3(),
};

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  for (const v of Object.values(anim)) if (Array.isArray(v)) v.length = 0;
  const rand = seeded(0xf205);
  scene.add(ground(spaces, rand));

  // Crisp, cold light and a pale haze that turns the far peaks blue.
  scene.fog = new THREE.Fog(0xe4ecff, 90, 250);
  const cool = new THREE.DirectionalLight(0xb8c8ff, 0.5);
  cool.position.set(30, 14, -20);
  scene.add(cool);
  scene.add(mountains());

  const s = new THREE.Group();
  const zones: [number, number, number][] = [];
  const place = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0, r = 0): T => {
    put(s, o, x, 0, z, ry);
    if (r) zones.push([x, z, r]);
    return o;
  };
  const smoke = (at: THREE.Vector3, parent: THREE.Object3D) => {
    const sm = new Smoke(6, 0.4, 3.4, 0.35, 0xffffff, new THREE.Vector3(0.5, 0, 0.1));
    parent.updateMatrixWorld(true);
    sm.group.position.copy(parent.localToWorld(at.clone()));
    sm.group.userData.noBake = true;
    scene.add(sm.group);
    anim.smokes.push(sm);
  };

  // --- Village square ------------------------------------------------
  zones.push([0, 1.5, 8.5], [0, 10, 3]);
  const hall = lodge();
  place(hall.group, -0.3, -4.6, 0);
  smoke(hall.chimneyTop, hall.group);
  const tree = bigPine(anim.bulbs);
  place(tree, 0.3, 2.4);
  for (const [x, z, ry, o] of [
    [-6.4, -2.4, 0.3, { w: 3, d: 2.8, h: 2.6, wall: 0xf7d4c0, roof: Palette.coral, sign: 'BAKERY', chimney: true }],
    [5.9, -2.6, -0.3, { w: 3, d: 2.8, h: 2.6, wall: 0xd8e4ff, roof: 0x7fa8ff, sign: 'SKI SHOP' }],
    [-7, 3.8, 1.15, { w: 3.2, d: 3, h: 3.6, wall: 0xe8dcff, roof: 0xa77ec0, sign: 'INN', chimney: true }],
    [7, 3.6, -1.15, { w: 3, d: 2.8, h: 2.6, wall: 0xd4f0e4, roof: 0x4fa889, chimney: true }],
  ] as const) {
    const c = chalet(o);
    place(c.group, x, z, ry);
    if (c.chimneyTop) smoke(c.chimneyTop, c.group);
  }
  const cocoa = cocoaStand();
  place(cocoa.group, 3.4, 6.4, -0.45);
  anim.smokes.push(cocoa.steam);
  place(snowman(Palette.coral), -3.2, 6.2, 0.4);
  place(snowman(0x7fa8ff, false), -4.3, 7.1, 0.7).scale.setScalar(0.6);
  for (const [x, z] of [
    [-3.6, 0.2],
    [3.7, 0.2],
    [-2.4, 8.9],
    [2.2, 9.2],
  ])
    place(lanternPost(anim.glows), x, z);
  s.add(pennants(new THREE.Vector3(-3.6, 2.5, 0.2), new THREE.Vector3(3.7, 2.5, 0.2), 0.4));
  place(bench(), -1.9, 5.4, 0.2);
  place(skiRack(), 4.4, -0.6, -0.3);
  place(woodpile(), -4.4, -6.2, 0.2);
  place(sled(), 1.4, 8.1, 0.6);
  place(sled(0x7fa8ff), 5.4, 8.6, -0.3);
  place(welcomeArch('FROSTBITE PEAK'), -0.2, 12.2);
  zones.push([-2.5, 12.2, 0.8], [2.1, 12.2, 0.8]);

  // --- Ice cave (east, inside the loop) -------------------------------
  const cave = iceCave(anim.glows);
  cave.scale.setScalar(0.8);
  place(cave, 19.4, -1.4, -0.6, 4);
  place(crystals(0xc8b4ff, 0.8), 17.8, 4.6, 0.6, 1.2);
  place(crystals(0x9fe8ff, 0.7), 18.2, -7.2, 1.2, 1.2);
  place(snowRock(1.1), 10.8, 6.6, 0.4, 1.4);
  place(snowRock(0.8), 11.2, -6.5, 1.4, 1.2);

  // --- Frozen lake (west, inside the loop) ----------------------------
  zones.push([LAKE.x, LAKE.z, 7.5]);
  for (const [x, z, c, ry] of [
    [-10.8, -5.6, 0xffc2d6, -0.5],
    [-10.6, 6.4, 0xfff0a8, -0.9],
  ] as const) {
    const hut = fishingHut(c);
    place(hut.group, x, z, ry);
    anim.bobs.push(hut.bob);
  }
  for (let i = 0; i < 2; i++) {
    const p = penguin();
    scene.add(p);
    anim.sliders.push({ obj: p, x: -18.6 + i * 1.6, phase: i * 3.5 });
  }

  // --- North: lift station, ski jump, igloos ---------------------------
  const base = liftStation('CHAIRLIFT');
  place(base.group, LIFT_BASE.x, LIFT_BASE.z + 2, 0, 3.5);
  anim.wheels.push(base.wheel);
  const topY = mountainHeight(...LIFT_TOP_XZ);
  const top = liftStation();
  place(top.group, LIFT_TOP_XZ[0], LIFT_TOP_XZ[1] - 2, Math.PI).position.y = topY;
  anim.wheels.push(top.wheel);
  anim.liftTop.set(LIFT_TOP_XZ[0], topY + 3.3, LIFT_TOP_XZ[1]);
  // Pylons carry the cable between the two wheels.
  const span = anim.liftTop.clone().sub(LIFT_BASE);
  for (const u of [0.22, 0.45, 0.68, 0.88]) {
    const p = LIFT_BASE.clone().addScaledVector(span, u);
    const gy = mountainHeight(p.x, p.z);
    const tower = liftTower(p.y - gy + 0.15);
    tower.position.set(p.x, Math.max(0, gy), p.z);
    if (gy < 0) tower.scale.y = 1;
    s.add(tower);
  }
  for (const off of [-LIFT_OFFSET, LIFT_OFFSET]) {
    const a = LIFT_BASE.clone().setX(LIFT_BASE.x + off);
    const b = anim.liftTop.clone().setX(anim.liftTop.x + off);
    s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: Palette.ink })));
  }
  const chairCols = [Palette.coral, 0x7fa8ff, Palette.yellow, Palette.violet];
  for (let i = 0; i < LIFT_CHAIRS; i++) {
    const c = liftChair(chairCols[i % chairCols.length]);
    scene.add(c);
    anim.chairs.push(c);
  }
  place(signpost(['LIFT', 'LODGE', 'LAKE']), 4.6, -18.6, -0.2, 0.8);
  place(skiRack(), 11.6, -19.4, -0.4, 1.4);
  const jump = skiJump();
  place(jump, -23, -37, 0.15).position.y = mountainHeight(-23, -37) - 1.2;
  // Igloo camp between the lake trail and the foothills.
  place(igloo(1.7), -30, -19, 0.6, 2.6);
  place(igloo(1.3), -25.8, -22.4, 0.1, 2.2);
  place(igloo(1.1), -33.4, -14.6, 1.2, 1.8);
  place(sled(Palette.yellow), -28.6, -16.2, 1.2);
  for (let i = 0; i < 6; i++) {
    const p = penguin();
    const x = -34 + (i % 3) * 1.3 + (i > 2 ? 0.6 : 0);
    const z = -9 + Math.floor(i / 3) * 1.4;
    p.scale.setScalar(0.85 + (i % 2) * 0.2);
    p.position.set(x, 0, z);
    p.rotation.y = 0.4 + i * 0.3;
    scene.add(p);
    anim.colony.push({ obj: p, phase: i * 1.3 });
  }
  // Skiers carving down the mountain face.
  const skierCols: [number, number][] = [
    [Palette.coral, Palette.yellow],
    [0x7fa8ff, Palette.coral],
    [Palette.violet, Palette.green],
    [Palette.green, 0x7fa8ff],
  ];
  skierCols.forEach(([j, h], i) => {
    const sk = skier(j, h);
    sk.scale.setScalar(1.3);
    scene.add(sk);
    anim.skiers.push({ obj: sk, x: [-4, 2, -9, 15][i], phase: i * 0.27, speed: 0.045 + i * 0.006 });
  });

  // --- North-east: hot spring and the yeti's rocks ---------------------
  const spring = hotSpring();
  place(spring.group, 31, -19, 0.2, 4.2);
  anim.smokes.push(...spring.steam);
  place(snowRock(1.3), 27, -22.6, 0.6, 1.6);
  place(snowRock(0.9), 35.6, -21.2, 1.6, 1.2);
  const wall = ridge(8, 2.4, rand);
  place(wall, 33, -4.6, 0.15, 0);
  zones.push([33, -5, 4.4]);
  // The yeti hides on the far (north) side of the rocks, facing the camera.
  anim.yeti = yeti();
  anim.yeti.position.set(33.2, 0, -6.6);
  anim.yeti.rotation.y = -0.15;
  scene.add(anim.yeti);

  // --- South-east: the sledding hill ----------------------------------
  const hill = toonMesh(new THREE.SphereGeometry(HILL.r, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xe4ebfb, { outline: 0.04 });
  hill.scale.set(1, HILL.sy, 1);
  place(hill, HILL.x, HILL.z, 0, HILL.r + 1.5);
  const hillTop = HILL.r * HILL.sy;
  place(pine(2.6, PINE_DARK), HILL.x + 1.2, HILL.z - 1.6).position.y = hillTop - 0.6;
  place(pine(2, PINE), HILL.x + 2.4, HILL.z - 0.2).position.y = hillTop - 1.2;
  const flagPole = place(new THREE.Group(), HILL.x - 0.4, HILL.z - 0.3);
  flagPole.position.y = hillTop - 0.05;
  put(flagPole, toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), 0x5a5a8a, { outline: 0.01 }), 0, 0.8, 0);
  put(flagPole, toonMesh(new THREE.ConeGeometry(0.3, 0.8, 3), Palette.coral, { outline: 0.012 }), 0.36, 1.35, 0).rotation.z = -Math.PI / 2;
  place(snowman(Palette.green), 26.4, 13.2, -0.6, 1);
  anim.sledder = new THREE.Group();
  anim.sledder.add(sled(Palette.coral));
  const rider = skier(Palette.violet, Palette.yellow);
  [0, 1, 2, 3, 9, 10].forEach((i) => (rider.children[i].visible = false));
  rider.position.set(0, 0.05, -0.1);
  rider.scale.setScalar(0.9);
  anim.sledder.add(rider);
  scene.add(anim.sledder);

  // --- South and west: cabins, snowmen, the lakeside woods -------------
  for (const [x, z, ry, roof] of [
    [-27, 19.6, 0.5, 0x7fa8ff],
    [-33, 14, 1.0, Palette.coral],
    [18, 22.6, -0.3, 0xa77ec0],
  ] as const) {
    const cab = chalet({ w: 2.6, d: 2.4, h: 2.2, wall: 0xf0c6a8, roof, chimney: true });
    place(cab.group, x, z, ry, 2.8);
    smoke(cab.chimneyTop!, cab.group);
  }
  place(woodpile(), -24.4, 21.4, 0.4, 1);
  place(snowman(Palette.yellow), -14.6, 20.4, 0.2, 1);
  place(snowman(Palette.violet), 9.4, 20.6, -0.3, 1);
  place(snowman(0x7fa8ff, false), 10.6, 21.4, -0.5).scale.setScalar(0.55);
  place(ridge(14, 3, rand), -42, -2, Math.PI / 2 + 0.1, 0);
  zones.push([-42, -2, 0]);

  // --- Horizon: a ring of far snowy peaks -------------------------------
  const far = [0xc8d0f0, 0xd8cff0, 0xc0d8f0, 0xd0c8e8];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + (rand() - 0.5) * 0.1;
    const r = 140 + rand() * 30;
    if (Math.sin(a) < -0.55) continue; // the near range already fills the north
    place(farPeak(14 + rand() * 16, 16 + rand() * 22, far[i % 4]), Math.cos(a) * r, Math.sin(a) * r, rand() * 3);
  }

  // --- Pines, rocks and drifts ----------------------------------------
  const nearRoad = (x: number, z: number) =>
    ROADS.some((r) =>
      r.slice(1).some(([bx, bz], i) => {
        const [ax, az] = r[i];
        const dx = bx - ax;
        const dz = bz - az;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(x - ax - dx * u, z - az - dz * u) < 1.8;
      }),
    );
  const blocked = (x: number, z: number) =>
    nearRoad(x, z) || z < FOOT_Z + 1 || Math.abs(x - LIFT_BASE.x) < 2.5 && z < -18 || zones.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r);
  const pick = (n: number, clearance: number, extent = 50) => scatter(rand, spaces, { count: n, extent, clearance, reject: blocked });
  // Tall pines never stand just south of the trail, where they'd hide it from the camera.
  const hidesTrail = (x: number, z: number) => spaces.some((sp) => z > sp.pos.z && z < sp.pos.z + 6 && Math.abs(x - sp.pos.x) < 2.6);
  for (const [x, z] of pick(70, 2.6)) {
    if (hidesTrail(x, z)) continue;
    const h = 2.4 + rand() * 2.6;
    place(pine(h, rand() < 0.5 ? PINE : PINE_DARK), x, z, rand() * 6);
    zones.push([x, z, 1.3]);
  }
  for (const [x, z] of pick(14, 2.4)) {
    place(snowRock(0.6 + rand() * 0.6), x, z, rand() * 6);
    zones.push([x, z, 1.2]);
  }
  for (const [x, z] of pick(8, 2.2)) place(crystals(rand() < 0.5 ? 0x9fe8ff : 0xc8b4ff, 0.5 + rand() * 0.3), x, z, rand() * 6);
  // Pines up the lower slopes, sitting on the mountain surface.
  for (let i = 0; i < 70; i++) {
    const x = (rand() * 2 - 1) * 90;
    const z = FOOT_Z - 1 - rand() * 22;
    if (Math.abs(x - LIFT_BASE.x) < 4 || (x > -28 && x < -18 && z > -42)) continue;
    const y = mountainHeight(x, z);
    if (y > 10) continue;
    const p = place(pine(2.6 + rand() * 2.4, rand() < 0.5 ? PINE : PINE_DARK), x, z, rand() * 6);
    p.position.y = y - 0.2;
  }
  scene.add(instanced(new THREE.SphereGeometry(0.5, 10, 6), SNOW, pick(90, 2.1, 54).map(([x, z]) => ({ x, y: 0, z, s: 0.6 + rand() * 1.3, ry: rand() * 6, sy: 0.35 }))));
  scene.add(instanced(new THREE.ConeGeometry(0.22, 0.6, 5), PINE_DARK, pick(24, 2.2, 52).map(([x, z]) => ({ x, y: 0.25, z, s: 0.6 + rand() * 0.6, ry: rand() * 6 }))));
  scene.add(instanced(new THREE.DodecahedronGeometry(0.25, 0), ROCK, pick(60, 2.1, 52).map(([x, z]) => ({ x, y: 0.08, z, s: 0.6 + rand(), ry: rand() * 6, sy: 0.6 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.12, 8, 6), 0xff8fa8, pick(30, 2.2).map(([x, z]) => ({ x, y: 0.1, z, s: 0.8 + rand() * 0.5 }))));

  scene.add(bake(s));

  // --- Sky: clouds, birds, snow ---------------------------------
  for (let i = 0; i < 6; i++) {
    const c = makeCloud(2 + rand() * 1.5);
    c.position.set(0, 26 + rand() * 10, -80 - rand() * 40);
    scene.add(c);
    anim.clouds.push({ obj: c, x: (rand() * 2 - 1) * 120, speed: 0.5 + rand() * 0.5 });
  }
  for (let i = 0; i < 2; i++) {
    const b = bird(0x7fa8ff, 0x5f88e0, Palette.peach);
    b.group.scale.setScalar(1.3);
    scene.add(b.group);
    anim.birds.push({ ...b, cx: [-10, 24][i], cz: [-24, -10][i], r: 7 + i * 3, y: 12 + i * 2, speed: [0.3, -0.24][i], phase: i * 2 });
  }
  anim.snow = snowfall(rand);
  scene.add(anim.snow);
}

/** Where a chair is along the lift loop at phase u (0..1): up one side, down the other. */
function placeChair(c: THREE.Object3D, u: number): void {
  const up = u < 0.5;
  const k = up ? u * 2 : 2 - u * 2;
  const p = new THREE.Vector3().lerpVectors(LIFT_BASE, anim.liftTop, k);
  p.x += up ? LIFT_OFFSET : -LIFT_OFFSET;
  c.position.copy(p);
  c.rotation.set(0, up ? Math.PI : 0, 0);
}

function updateScenery(t: number): void {
  for (const s of anim.smokes) s.update(t);
  anim.glows.forEach((g, i) => (g.material.opacity = 0.72 + Math.sin(t * 9 + i) * 0.08 + Math.sin(t * 13 + i * 2) * 0.05));
  // Tree lights twinkle in a chase.
  anim.bulbs.forEach((b, i) => {
    const on = Math.sin(t * 3 - i * 0.7) > -0.2;
    (b.material as THREE.MeshToonMaterial).emissiveIntensity = on ? 2.4 : 0.3;
  });
  // Chairlift: the loop turns slowly; chairs swing a little.
  const loopU = t * 0.012;
  anim.chairs.forEach((c, i) => {
    placeChair(c, (loopU + i / anim.chairs.length) % 1);
    c.rotation.x = Math.sin(t * 1.4 + i) * 0.05;
  });
  for (const w of anim.wheels) w.rotation.y = t * 0.6;
  // Skiers zig-zag down the face, then start again from the top.
  for (const sk of anim.skiers) {
    const k = (t * sk.speed + sk.phase) % 1;
    const z = -50 + k * 22;
    const sway = Math.sin(k * Math.PI * 7);
    const x = sk.x + sway * 3;
    sk.obj.position.set(x, mountainHeight(x, z) + 0.05, z);
    sk.obj.rotation.set(0.25, Math.cos(k * Math.PI * 7) * 0.7, -Math.cos(k * Math.PI * 7) * 0.25);
    sk.obj.visible = k > 0.02 && k < 0.97;
  }
  // Penguin colony: shuffle, flap and look about.
  for (const p of anim.colony) {
    const flippers = p.obj.userData.flippers as THREE.Object3D[];
    const flap = Math.max(0, Math.sin(t * 2 + p.phase)) ** 4;
    flippers.forEach((f) => (f.rotation.z = (f.userData.side as number) * (0.15 + flap * 0.9 * Math.abs(Math.sin(t * 16)))));
    p.obj.rotation.z = Math.sin(t * 5 + p.phase) * 0.06;
    (p.obj.userData.head as THREE.Object3D).rotation.y = Math.sin(t * 0.7 + p.phase) * 0.6;
  }
  // Two penguins belly-slide up and down the west side of the lake.
  for (const p of anim.sliders) {
    const k = (t * 0.07 + p.phase / 7) % 1;
    const dir = k < 0.5 ? 1 : -1;
    const u = k < 0.5 ? k * 2 : 2 - k * 2;
    const z = LAKE.z - 7 + u * 14;
    p.obj.position.set(p.x + Math.sin(u * Math.PI) * 0.8, 0.22, z);
    p.obj.rotation.set(dir * Math.PI / 2 * 0.95, dir > 0 ? 0 : Math.PI, 0);
    const flippers = p.obj.userData.flippers as THREE.Object3D[];
    flippers.forEach((f) => (f.rotation.z = (f.userData.side as number) * 1.3));
  }
  anim.bobs.forEach((b, i) => (b.position.y = 0.05 + Math.max(0, Math.sin(t * 1.3 + i * 2)) ** 8 * -0.05 + Math.sin(t * 3 + i) * 0.01));
  // The yeti peeks over the ridge, waves, and ducks back down.
  if (anim.yeti) {
    const k = t % 20;
    const up = k < 7 ? Math.min(1, k * 1.2, (7 - k) * 1.2) : 0;
    anim.yeti.position.y = -2.9 + up * 2.6;
    anim.yeti.visible = up > 0.02;
    const arms = anim.yeti.userData.arms as THREE.Object3D[];
    const wave = k > 2 && k < 5;
    arms[1].rotation.z = wave ? 2.4 + Math.sin(t * 9) * 0.4 : 0.15;
    arms[0].rotation.z = -0.15;
    anim.yeti.rotation.z = Math.sin(t * 1.5) * 0.06;
  }
  // Sledder: whoosh down the hill, trudge back up.
  if (anim.sledder) {
    const k = (t * 0.1) % 1;
    const down = k < 0.3;
    const u = down ? k / 0.3 : 1 - (k - 0.3) / 0.7;
    const r = 0.4 + u * (HILL.r + 2.4);
    const a = Math.PI * 0.85;
    const inside = Math.min(r, HILL.r - 0.05);
    const ground = Math.sqrt(HILL.r * HILL.r - inside * inside);
    const hy = r < HILL.r ? ground * HILL.sy : 0;
    const slope = r < HILL.r ? (HILL.sy * inside) / Math.max(0.3, ground) : 0;
    anim.sledder.position.set(HILL.x + Math.cos(a) * r, hy, HILL.z + Math.sin(a) * r);
    anim.sledder.rotation.order = 'YXZ';
    anim.sledder.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)) + (down ? 0 : Math.PI);
    anim.sledder.rotation.x = Math.atan(Math.min(1.2, slope)) * (down ? 1 : -1);
  }
  for (const b of anim.birds) flyBird(b, t, b.cx, b.cz, b.r, b.y, b.speed, b.phase);
  for (const c of anim.clouds) c.obj.position.x = ((c.x + t * c.speed + 150) % 300) - 150;
  if (anim.snow) updateSnow(anim.snow, t);
}

export function frostbitePeak(): BoardDef {
  const { spaces, startId } = layout();
  return {
    id: 'mountain',
    name: 'Frostbite Peak',
    spaces,
    startId,
    song: frostbiteTheme,
    sky: [0x93b4f0, 0xfbe6f4],
    buildScenery,
    updateScenery,
    happening: {
      title: 'Avalanche!',
      description: 'A rumbling snowslide sweeps you across the mountain!',
      style: 'launch',
    },
  };
}
