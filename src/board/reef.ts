import * as THREE from 'three';
import { reefTheme } from '../audio/songs/reef';
import { Palette } from '../render/palette';
import { toon } from '../render/toon';
import { crab, glowSprite, scatter, seeded } from './decor';
import { BoardBuilder } from './graph';
import { bake, starfishGeo, turtle } from './pirateProps';
import {
  anemone,
  brainCoral,
  branchCoral,
  causticMaterial,
  conchHouse,
  CORAL,
  CORAL_COLORS,
  coralCastle,
  domeHouse,
  fanCoral,
  fishGeo,
  giantClam,
  grassGeo,
  jellyfish,
  KELP,
  KELP_DARK,
  kelpGeo,
  lightShaft,
  mantaRay,
  octopus,
  reefSign,
  reefTime,
  rockArch,
  ROCK,
  ROCK_DARK,
  SAND,
  submarine,
  swayMaterial,
  tubeCoral,
  urchin,
  ventChimney,
} from './reefDecor';
import type { BoardDef, Space } from './types';

/**
 * Bubble Reef: a sandy bowl on the sea floor ringed by coral walls. A coral
 * castle stands in the middle, a shell village by the start, a giant clam
 * to the north, bubbling vents to the east and a kelp forest to the west.
 * A locked grotto under rock arches cuts across the east side; a kelp
 * tunnel cuts across the west.
 */
function layout(): { spaces: Space[]; startId: number; grotto: number[] } {
  const b = new BoardBuilder().loop(
    [
      [0, 16],
      [11, 15],
      [19, 10],
      [25, 2],
      [22, -8],
      [13, -14],
      [2, -13],
      [-9, -16],
      [-19, -11],
      [-25, -2],
      [-21, 9],
      [-11, 15],
    ],
    // 40 spaces from the start, clockwise seen from above.
    'S B B R B I B H* B B ' + 'R B T B* B V B H B I ' + 'B B P R B H B* B R B ' + 'B I B H* B B V R B B',
  );
  const before = b.spaces.length;
  // Sunken grotto under the rock arches, behind a locked gate.
  b.branch(5, 15, [[12, 4], [11, -6]], 'B R H B* R', true);
  const grotto: number[] = [];
  for (let id = before; id < b.spaces.length; id++) grotto.push(id);
  // Kelp tunnel through the west forest.
  b.branch(25, 35, [[-12, -5], [-12, 6]], 'B I B* H B');
  return { spaces: b.spaces, startId: b.loopId(0), grotto };
}

/** The bowl's coral walls start on this ellipse. */
const RX = 38;
const RZ = 29;

const CASTLE = new THREE.Vector3(0, 0, 0);
const CLAM = new THREE.Vector3(3, 0, -23);
const VENTS: [number, number, number][] = [
  [33, -6, 4.5],
  [31, 3, 3.2],
  [29, -13, 3.6],
];
const KELP_FOREST = new THREE.Vector3(-33, 0, -3);
const VILLAGE: { x: number; z: number; ry: number; kind: 'conch' | 'dome'; color: number; size: number }[] = [
  { x: -25, z: 17, ry: 0.5, kind: 'conch', color: CORAL.peach, size: 1 },
  { x: -19, z: 22, ry: 0.2, kind: 'dome', color: CORAL.sky, size: 0.95 },
  { x: -30, z: 10, ry: 0.9, kind: 'dome', color: CORAL.pink, size: 0.9 },
  { x: -31, z: 18, ry: 0.7, kind: 'conch', color: CORAL.lilac, size: 1.15 },
  { x: -12, z: 23, ry: -0.1, kind: 'conch', color: CORAL.butter, size: 0.8 },
];
const OCTO = new THREE.Vector3(17, 0, 20);

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

let segments: Segment[] = [];

/** Distance from (x, z) to the nearest path segment. */
function pathDistance(x: number, z: number): number {
  let best = Infinity;
  for (const s of segments) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len2 = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
    const px = s.ax + dx * k - x;
    const pz = s.az + dz * k - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function dunes(x: number, z: number): number {
  return 0.5 * Math.sin(x * 0.23 + 1) * Math.cos(z * 0.19) + 0.3 * Math.sin((x + z) * 0.41) + 0.2 * Math.cos(x * 0.6 - z * 0.37);
}

function rimK(x: number, z: number): number {
  return Math.sqrt((x / RX) ** 2 + (z / RZ) ** 2);
}

/** Seabed height: flat along the path, rolling dunes elsewhere, walls at the rim. */
function heightAt(x: number, z: number, d = pathDistance(x, z)): number {
  const flat = smooth(2, 5, d);
  const e = rimK(x, z);
  const wall = smooth(1.0, 1.45, e) * (11 + dunes(x * 0.7, z * 0.7) * 5);
  return -0.04 + flat * (0.3 + dunes(x, z) * 0.4) + wall;
}

/** Big displaced sand plane with a pale trail along the path and coral walls. */
function seabed(): THREE.Mesh {
  const size = 170;
  const seg = 130;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(SAND);
  const trail = new THREE.Color(0xf2ead0);
  const pinkSand = new THREE.Color(0xe6c8cc);
  const rock = new THREE.Color(ROCK);
  const rockDark = new THREE.Color(ROCK_DARK);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = pathDistance(x, z);
    const y = heightAt(x, z, d);
    pos.setY(i, y);
    c.copy(sand).lerp(pinkSand, smooth(0.2, 0.9, dunes(x * 0.5 + 9, z * 0.5)) * 0.6);
    c.lerp(trail, 1 - smooth(1.2, 2.2, d));
    const e = rimK(x, z);
    c.lerp(rock, smooth(1.02, 1.2, e));
    c.lerp(rockDark, smooth(1.3, 1.6, e) * 0.6);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, causticMaterial(0xffffff, 0.26, true));
  mesh.receiveShadow = true;
  return mesh;
}

/** Instanced mesh from explicit transforms. */
function placedMesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  items: { x: number; y: number; z: number; s?: number; sy?: number; ry?: number; rx?: number; color?: number }[],
  shadows = true,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    q.setFromEuler(e.set(it.rx ?? 0, it.ry ?? 0, 0));
    mesh.setMatrixAt(i, m.compose(v.set(it.x, it.y, it.z), q, sc.set(s, s * (it.sy ?? 1), s)));
    if (it.color !== undefined) mesh.setColorAt(i, col.set(it.color));
  });
  mesh.receiveShadow = true;
  mesh.castShadow = shadows;
  return mesh;
}

interface Bubble {
  x: number;
  z: number;
  y0: number;
  rise: number;
  rate: number;
  off: number;
  size: number;
  wob: number;
}

interface School {
  cx: number;
  cz: number;
  y: number;
  rx: number;
  rz: number;
  speed: number;
  count: number;
  start: number;
}

interface ReefAnim {
  bubbles: THREE.InstancedMesh | null;
  bubbleData: Bubble[];
  fish: THREE.InstancedMesh | null;
  schools: School[];
  fishOffsets: { a: number; r: number; y: number }[];
  clam: ReturnType<typeof giantClam> | null;
  jellies: (ReturnType<typeof jellyfish> & { base: THREE.Vector3; phase: number })[];
  manta: ReturnType<typeof mantaRay> | null;
  sub: ReturnType<typeof submarine> | null;
  turtle: ReturnType<typeof turtle> | null;
  octo: ReturnType<typeof octopus> | null;
  crabs: { obj: THREE.Object3D; x: number; z: number; ry: number; phase: number }[];
  shafts: { obj: THREE.Object3D; phase: number }[];
  ventGlows: THREE.Sprite[];
}

function emptyAnim(): ReefAnim {
  return {
    bubbles: null,
    bubbleData: [],
    fish: null,
    schools: [],
    fishOffsets: [],
    clam: null,
    jellies: [],
    manta: null,
    sub: null,
    turtle: null,
    octo: null,
    crabs: [],
    shafts: [],
    ventGlows: [],
  };
}

let anim: ReefAnim = emptyAnim();

/** Keeps props off the landmarks. */
function nearLandmark(x: number, z: number): boolean {
  const near = (p: { x: number; z: number }, r: number) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r;
  if (near(CASTLE, 5.5) || near(CLAM, 4.5) || near(OCTO, 2.5)) return true;
  if (VENTS.some(([vx, vz]) => near({ x: vx, z: vz }, 2.5))) return true;
  if (VILLAGE.some((h) => near(h, 3.2))) return true;
  return near({ x: -4, z: 19.5 }, 3);
}

function put(stat: THREE.Group, obj: THREE.Object3D, x: number, z: number, ry = 0, sink = 0.05): void {
  obj.position.set(x, heightAt(x, z) - sink, z);
  obj.rotation.y = ry;
  stat.add(obj);
}

function corals(stat: THREE.Group, spaces: Space[], rand: () => number): void {
  // Small reef clumps among the dunes...
  const spots = scatter(rand, spaces, { count: 130, extent: 40, clearance: 2.6, reject: (x, z) => rimK(x, z) > 1.08 || nearLandmark(x, z) });
  spots.forEach(([x, z], i) => {
    const color = CORAL_COLORS[Math.floor(rand() * CORAL_COLORS.length)];
    const s = 0.6 + rand() * 0.6;
    const kind = i % 6;
    const obj =
      kind === 0
        ? branchCoral(color, s * 1.2, i)
        : kind === 1
          ? brainCoral(color, s)
          : kind === 2
            ? fanCoral(color, s)
            : kind === 3
              ? tubeCoral(color, s, i)
              : kind === 4
                ? anemone(color, Palette.cream, s)
                : urchin(s);
    put(stat, obj, x, z, rand() * Math.PI * 2);
  });
  // ...and big ones crowding the walls of the bowl.
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + rand() * 0.05;
    const k = 1.0 + rand() * 0.3;
    const x = Math.cos(a) * RX * k;
    const z = Math.sin(a) * RZ * k;
    if (nearLandmark(x, z)) continue;
    const color = CORAL_COLORS[i % CORAL_COLORS.length];
    const s = 1.4 + rand() * 1.4;
    const obj = i % 3 === 0 ? branchCoral(color, s, i) : i % 3 === 1 ? fanCoral(color, s) : brainCoral(color, s);
    put(stat, obj, x, z, rand() * Math.PI * 2, 0.2);
  }
}

function village(stat: THREE.Group): void {
  for (const h of VILLAGE) {
    const obj = h.kind === 'conch' ? conchHouse(h.color, h.size) : domeHouse(h.color, CORAL.coral, h.size);
    put(stat, obj, h.x, h.z, h.ry, 0.1);
  }
  const sign = reefSign();
  put(stat, sign, -4, 19.5, 0.1);
}

function grottoArches(stat: THREE.Group, spaces: Space[], grotto: number[]): void {
  // Arches between the 1st/2nd and 3rd/4th grotto spaces, across the path.
  for (const [i, j] of [
    [0, 1],
    [2, 3],
  ]) {
    const a = spaces[grotto[i]].pos;
    const b = spaces[grotto[j]].pos;
    const mid = a.clone().lerp(b, 0.5);
    const arch = rockArch(4.4, 3.1);
    arch.position.set(mid.x, -0.2, mid.z);
    // The arch spans its local x axis; turn it across the path.
    arch.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    stat.add(arch);
  }
}

function plants(scene: THREE.Scene, spaces: Space[], rand: () => number): void {
  // Kelp forest to the west, a fringe along the kelp tunnel and stragglers round the rim.
  const kelpA: { x: number; y: number; z: number; s: number; sy: number; ry: number }[] = [];
  const kelpB: typeof kelpA = [];
  const addKelp = (x: number, z: number, tall: number) => {
    if (nearLandmark(x, z)) return;
    const list = rand() < 0.5 ? kelpA : kelpB;
    list.push({ x, y: heightAt(x, z) - 0.1, z, s: 0.8 + rand() * 0.6, sy: tall * (0.7 + rand() * 0.6), ry: rand() * Math.PI });
  };
  for (const [x, z] of scatter(rand, spaces, { count: 70, extent: 40, clearance: 2.4, reject: (x, z) => (x - KELP_FOREST.x) ** 2 + (z - KELP_FOREST.z) ** 2 > 110 })) addKelp(x, z, 1.4);
  for (const [x, z] of scatter(rand, spaces, { count: 40, extent: 40, clearance: 2.1, reject: (x, z) => x > -7 || x < -18 || Math.abs(z) > 9 })) addKelp(x, z, 0.5);
  for (const [x, z] of scatter(rand, spaces, { count: 45, extent: 46, clearance: 3, reject: (x, z) => rimK(x, z) < 0.92 || rimK(x, z) > 1.1 })) addKelp(x, z, 1.2);
  const kGeo = kelpGeo(6);
  scene.add(placedMesh(kGeo, swayMaterial(KELP, 6, 1.3, { side: THREE.DoubleSide }), kelpA, false));
  scene.add(placedMesh(kGeo, swayMaterial(KELP_DARK, 6, 1.3, { side: THREE.DoubleSide }), kelpB, false));

  // Sea-grass tufts hugging the path.
  const grass = scatter(rand, spaces, { count: 220, extent: 38, clearance: 1.6, reject: (x, z) => rimK(x, z) > 1.02 || nearLandmark(x, z) || pathDistance(x, z) > 4.5 });
  const gColors = [0x8fe0a0, 0x7fd4b0, 0xa6e88f];
  scene.add(
    placedMesh(
      grassGeo(),
      swayMaterial(0xffffff, 1, 0.25),
      grass.map(([x, z], i) => ({ x, y: heightAt(x, z) - 0.03, z, s: 0.7 + rand() * 0.5, sy: 0.8 + rand() * 0.6, ry: rand() * 6, color: gColors[i % 3] })),
      false,
    ),
  );

  // Rocks with caustics on them.
  const rocks = scatter(rand, spaces, { count: 70, extent: 42, clearance: 2.4, reject: (x, z) => rimK(x, z) > 1.15 || nearLandmark(x, z) });
  scene.add(
    placedMesh(
      new THREE.DodecahedronGeometry(0.7, 0),
      causticMaterial(ROCK, 0.3),
      rocks.map(([x, z]) => ({ x, y: heightAt(x, z) + 0.1, z, s: 0.5 + rand() * 1.1, sy: 0.6 + rand() * 0.4, ry: rand() * 6 })),
    ),
  );

  // Starfish on the sand.
  const stars = scatter(rand, spaces, { count: 45, extent: 36, clearance: 1.5, reject: (x, z) => rimK(x, z) > 0.98 || nearLandmark(x, z) });
  const starGeo = starfishGeo();
  const sColors = [Palette.coral, 0xffa65c, CORAL.pink, Palette.yellow, CORAL.lilac];
  scene.add(
    placedMesh(
      starGeo,
      toon(0xffffff),
      stars.map(([x, z], i) => ({ x, y: heightAt(x, z) + 0.02, z, s: 0.9 + rand() * 0.6, ry: rand() * 6, color: sColors[i % sColors.length] })),
      false,
    ),
  );

  // Pale coral rings round every space so the path reads against the sand.
  const ring = new THREE.TorusGeometry(1.15, 0.09, 6, 24);
  ring.rotateX(Math.PI / 2);
  scene.add(placedMesh(ring, toon(0xd8c8ff), spaces.map((s) => ({ x: s.pos.x, y: 0.02, z: s.pos.z })), false));
}

function landmarks(scene: THREE.Scene, stat: THREE.Group, spaces: Space[], grotto: number[]): void {
  put(stat, coralCastle(), CASTLE.x, CASTLE.z, 0, 0.1);
  village(stat);
  grottoArches(stat, spaces, grotto);

  // Vents: chimneys with glowing mouths, bubble columns added below.
  for (const [x, z, h] of VENTS) {
    const v = ventChimney(h);
    v.group.position.set(x, heightAt(x, z) - 0.1, z);
    scene.add(v.group);
    anim.ventGlows.push(v.group.children.find((c) => c instanceof THREE.Sprite) as THREE.Sprite);
  }

  const clam = giantClam();
  clam.group.position.set(CLAM.x, heightAt(CLAM.x, CLAM.z) - 0.3, CLAM.z);
  clam.group.rotation.y = -0.15;
  scene.add(clam.group);
  anim.clam = clam;

  const octo = octopus(0xff9fb0);
  const perch = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), causticMaterial(ROCK, 0.3));
  perch.scale.set(1.2, 0.7, 1.1);
  perch.position.set(OCTO.x, heightAt(OCTO.x, OCTO.z) + 0.3, OCTO.z);
  perch.castShadow = perch.receiveShadow = true;
  scene.add(perch);
  octo.group.position.set(OCTO.x, heightAt(OCTO.x, OCTO.z) + 0.55, OCTO.z);
  octo.group.rotation.y = -0.6;
  scene.add(octo.group);
  anim.octo = octo;
}

function critters(scene: THREE.Scene, rand: () => number): void {
  // Jellyfish drifting over the grotto.
  const jColors = [0xffb0e0, 0xc6a2ff, 0xa0e8ff, 0xffc8a0, 0xffb0e0];
  [
    [16, 3, 3.6],
    [8, -3, 4.2],
    [17, -5, 3.2],
    [7, 3, 4.8],
    [15, -10, 3.8],
  ].forEach(([x, z, y], i) => {
    const j = jellyfish(jColors[i]);
    const base = new THREE.Vector3(x, y, z);
    j.group.position.copy(base);
    scene.add(j.group);
    anim.jellies.push({ ...j, base, phase: i * 1.7 });
  });

  anim.manta = mantaRay();
  anim.manta.group.scale.setScalar(1.3);
  scene.add(anim.manta.group);

  anim.sub = submarine();
  scene.add(anim.sub.group);

  anim.turtle = turtle();
  anim.turtle.group.scale.setScalar(1.6);
  scene.add(anim.turtle.group);

  for (const [x, z, ry] of [
    [6, 21, 0.2],
    [-8, 22, -0.4],
    [23, 13, 1.1],
    [-26, -10, 0.6],
    [8, -19, -0.3],
  ]) {
    const c = crab(rand() < 0.5 ? Palette.coral : 0xffa65c);
    c.scale.setScalar(1.3);
    scene.add(c);
    anim.crabs.push({ obj: c, x, z, ry, phase: rand() * 6 });
  }

  // Fish schools circling different parts of the reef.
  anim.schools = [
    { cx: 2, cz: -27, y: 6, rx: 12, rz: 3, speed: 0.22, count: 18, start: 0 },
    { cx: -30, cz: -4, y: 5, rx: 5, rz: 4, speed: -0.35, count: 14, start: 0 },
    { cx: 26, cz: 10, y: 4.5, rx: 6, rz: 4, speed: 0.3, count: 14, start: 0 },
    { cx: -18, cz: 25, y: 3.5, rx: 8, rz: 3, speed: -0.26, count: 16, start: 0 },
  ];
  const fColors = [0xffd23f, 0x6fb7ff, 0xff8f80, 0xc6a2ff];
  let total = 0;
  for (const s of anim.schools) {
    s.start = total;
    total += s.count;
  }
  const fish = new THREE.InstancedMesh(fishGeo(), toon(0xffffff), total);
  const col = new THREE.Color();
  anim.schools.forEach((s, si) => {
    for (let i = 0; i < s.count; i++) {
      fish.setColorAt(s.start + i, col.set(fColors[si]).lerp(new THREE.Color(0xffffff), (i % 3) * 0.12));
      anim.fishOffsets.push({ a: i * 0.11 + rand() * 0.08, r: (rand() - 0.5) * 1.8, y: (rand() - 0.5) * 1.6 });
    }
  });
  scene.add(fish);
  anim.fish = fish;

  // Bubbles: dense columns over the vents, a trickle from the clam and the chimneys, strays everywhere.
  const data: Bubble[] = [];
  const push = (x: number, z: number, y0: number, rise: number, n: number, rate: number, size: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      data.push({ x: x + (rand() - 0.5) * spread, z: z + (rand() - 0.5) * spread, y0, rise, rate: rate * (0.8 + rand() * 0.4), off: rand(), size: size * (0.6 + rand() * 0.8), wob: rand() * 6 });
    }
  };
  for (const [x, z, h] of VENTS) push(x, z, heightAt(x, z) + h, 22, 40, 0.16, 0.22, 0.5);
  push(CLAM.x, CLAM.z + 0.3, 2.5, 18, 16, 0.12, 0.18, 1.2);
  for (const h of VILLAGE.filter((v) => v.kind === 'dome')) push(h.x - 0.5 * h.size, h.z - 0.3 * h.size, 1.9 * h.size, 14, 8, 0.12, 0.14, 0.2);
  push(CASTLE.x, CASTLE.z, 9, 16, 12, 0.08, 0.16, 3);
  for (let i = 0; i < 60; i++) {
    const x = (rand() * 2 - 1) * 34;
    const z = (rand() * 2 - 1) * 24;
    push(x, z, heightAt(x, z), 20 + rand() * 10, 1, 0.05, 0.16, 0);
  }
  anim.bubbleData = data;
  const bubbleMat = toon(0xe8fbff, { transparent: true, opacity: 0.7, emissive: 0x204050 });
  bubbleMat.depthWrite = false;
  anim.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), bubbleMat, data.length);
  anim.bubbles.frustumCulled = false;
  scene.add(anim.bubbles);
}

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  anim = emptyAnim();
  segments = [];
  for (const s of spaces) for (const n of s.next) segments.push({ ax: s.pos.x, az: s.pos.z, bx: spaces[n].pos.x, bz: spaces[n].pos.z });
  const grotto = spaces.filter((s) => s.gate).flatMap((g) => {
    const ids = [g.id];
    let cur = g;
    while (cur.next.length === 1 && spaces[cur.next[0]].id > cur.id && ids.length < 5) {
      cur = spaces[cur.next[0]];
      ids.push(cur.id);
    }
    return ids;
  });

  // Underwater light: a teal fill from above and blue haze in the distance.
  // The board scene's own lights are already in; cool them down to sea tones.
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) {
      o.color.set(0xc4f2ff);
      o.groundColor.set(0x5f7fd0);
    } else if (o instanceof THREE.DirectionalLight) {
      o.color.set(0xe4fbff);
    }
  });
  scene.fog = new THREE.Fog(0x4a9ad0, 30, 150);

  scene.add(seabed());
  const rand = seeded(2024);
  const stat = new THREE.Group();
  corals(stat, spaces, rand);
  landmarks(scene, stat, spaces, grotto);
  scene.add(bake(stat));
  plants(scene, spaces, rand);
  critters(scene, rand);

  // Sun shafts slanting down from the surface.
  const shafts: [number, number, number][] = [
    [-14, -6, 5],
    [8, -8, 6],
    [20, 6, 4],
    [-24, 8, 5],
    [-4, 10, 4],
    [28, -16, 6],
    [-30, -18, 5],
  ];
  shafts.forEach(([x, z, w], i) => {
    const s = lightShaft(w, 46);
    s.position.set(x + 6, 42, z - 4);
    s.rotation.set(0.12, i * 0.7, 0.14);
    scene.add(s);
    anim.shafts.push({ obj: s, phase: i * 1.9 });
  });

  // Glints of light near the "surface" for depth.
  for (let i = 0; i < 6; i++) {
    const g = glowSprite(0xd8fbff, 18, 0.12);
    g.position.set((rand() - 0.5) * 80, 40 + rand() * 6, (rand() - 0.5) * 60 - 10);
    scene.add(g);
  }
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const eul = new THREE.Euler();
const v3 = new THREE.Vector3();
const sc = new THREE.Vector3();

function updateScenery(t: number): void {
  reefTime.value = t;

  if (anim.bubbles) {
    const mesh = anim.bubbles;
    anim.bubbleData.forEach((b, i) => {
      const k = (t * b.rate + b.off) % 1;
      const y = b.y0 + k * b.rise;
      const s = b.size * (0.7 + k * 0.6) * Math.min(1, (1 - k) * 6);
      m4.compose(v3.set(b.x + Math.sin(t * 2.2 + b.wob + k * 8) * 0.25, y, b.z + Math.cos(t * 1.7 + b.wob) * 0.2), q.identity(), sc.setScalar(Math.max(0.001, s)));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  if (anim.fish) {
    const mesh = anim.fish;
    for (const s of anim.schools) {
      for (let i = 0; i < s.count; i++) {
        const o = anim.fishOffsets[s.start + i];
        const a = t * s.speed + o.a * Math.sign(s.speed) * -1;
        const rx = s.rx + o.r;
        const rz = s.rz + o.r * 0.6;
        const x = s.cx + Math.cos(a) * rx;
        const z = s.cz + Math.sin(a) * rz;
        // Tangent of the ellipse in the swim direction.
        const dir = Math.sign(s.speed);
        const vx = -Math.sin(a) * rx * dir;
        const vz = Math.cos(a) * rz * dir;
        eul.set(0, Math.atan2(vx, vz) + Math.sin(t * 9 + i) * 0.12, 0);
        q.setFromEuler(eul);
        m4.compose(v3.set(x, s.y + o.y + Math.sin(t * 1.3 + i) * 0.2, z), q, sc.setScalar(1.3));
        mesh.setMatrixAt(s.start + i, m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  if (anim.clam) {
    // Opens slowly every 12 s, shows the pearl, then snaps shut.
    const c = (t % 12) / 12;
    const open = c < 0.15 ? smooth(0, 0.15, c) : c < 0.7 ? 1 : c < 0.76 ? 1 - smooth(0.7, 0.76, c) : 0;
    anim.clam.lid.rotation.x = -open * 0.75;
    anim.clam.pearl.position.y = 1.85 + Math.sin(t * 1.4) * 0.06;
    const glow = anim.clam.pearl.children[1] as THREE.Sprite;
    glow.material.opacity = 0.2 + open * 0.5 + Math.sin(t * 2) * 0.05;
  }

  for (const j of anim.jellies) {
    const pulse = Math.sin(t * 2.2 + j.phase);
    j.group.position.set(j.base.x + Math.sin(t * 0.3 + j.phase) * 1.2, j.base.y + Math.sin(t * 0.7 + j.phase) * 0.9 + Math.max(0, pulse) * 0.25, j.base.z + Math.cos(t * 0.25 + j.phase) * 1.2);
    j.bell.scale.set(1 + pulse * 0.12, 0.8 - pulse * 0.12, 1 + pulse * 0.12);
    for (const tn of j.tentacles) tn.rotation.set(Math.sin(t * 1.6 + (tn.userData.phase as number)) * 0.25, 0, Math.cos(t * 1.3 + (tn.userData.phase as number)) * 0.25);
  }

  if (anim.manta) {
    const a = t * 0.16;
    const g = anim.manta.group;
    g.position.set(Math.cos(a) * 24, 9 + Math.sin(t * 0.5) * 0.8, -31 + Math.sin(a) * 5);
    g.rotation.set(0, Math.atan2(-Math.sin(a) * 24, Math.cos(a) * 5), 0);
    g.rotateZ(-0.25);
    for (const w of anim.manta.wings) w.rotation.z = Math.sin(t * 1.6) * 0.4 * (w.userData.side as number);
  }

  if (anim.sub) {
    const a = -t * 0.07 + 1;
    const g = anim.sub.group;
    g.position.set(Math.cos(a) * 33, 7.5 + Math.sin(t * 0.6) * 0.4, -2 + Math.sin(a) * 24);
    g.rotation.set(Math.sin(t * 0.6) * 0.05, Math.atan2(Math.sin(a) * 33, -Math.cos(a) * 24), 0);
    anim.sub.prop.rotation.z = t * 8;
    anim.sub.lamp.material.opacity = 0.65 + Math.sin(t * 3) * 0.1;
  }

  if (anim.turtle) {
    const a = t * 0.18;
    const g = anim.turtle.group;
    g.position.set(Math.cos(a) * 7.5, 4.6 + Math.sin(t * 0.9) * 0.4, Math.sin(a) * 6);
    g.rotation.set(0, -a, 0);
    for (const f of anim.turtle.flippers) f.rotation.z = Math.sin(t * 2 + (f.userData.side as number)) * 0.5 * (f.userData.side as number);
  }

  if (anim.octo) {
    anim.octo.group.position.y = heightAt(OCTO.x, OCTO.z) + 0.55 + Math.sin(t * 1.2) * 0.05;
    anim.octo.arms.forEach((arm, i) => {
      const joints = arm.userData.joints as THREE.Object3D[];
      if (i === 1) {
        // Waving hello at the players.
        joints[0].rotation.z = 0.6 + Math.sin(t * 4) * 0.3;
        joints[1].rotation.z = 0.5 + Math.sin(t * 4 + 0.6) * 0.4;
        joints[2].rotation.z = 0.5 + Math.sin(t * 4 + 1.2) * 0.4;
      } else {
        joints[0].rotation.z = 1.9 + Math.sin(t * 1.5 + i) * 0.1;
        joints[1].rotation.z = 0.35 + Math.sin(t * 1.5 + i + 0.7) * 0.15;
        joints[2].rotation.z = 0.35 + Math.sin(t * 1.5 + i + 1.4) * 0.2;
      }
    });
  }

  for (const c of anim.crabs) {
    // Scuttle sideways back and forth, pausing now and then.
    const s = Math.sin(t * 0.7 + c.phase);
    const off = Math.sign(s) * Math.min(1, Math.abs(s) * 1.6) * 1.2;
    const dx = Math.cos(c.ry) * off;
    const dz = -Math.sin(c.ry) * off;
    c.obj.position.set(c.x + dx, heightAt(c.x + dx, c.z + dz) + Math.abs(Math.sin(t * 12 + c.phase)) * 0.04, c.z + dz);
    c.obj.rotation.y = c.ry;
  }

  for (const s of anim.shafts) {
    const o = 0.06 + Math.sin(t * 0.4 + s.phase) * 0.03;
    for (const p of s.obj.children) ((p as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = o;
  }

  anim.ventGlows.forEach((g, i) => (g.material.opacity = 0.45 + Math.sin(t * 3 + i * 2) * 0.15));
}

export function bubbleReef(): BoardDef {
  const { spaces, startId } = layout();
  return {
    id: 'reef',
    name: 'Bubble Reef',
    spaces,
    startId,
    song: reefTheme,
    sky: [0x8fe8f4, 0x23679e],
    buildScenery,
    updateScenery,
    happening: {
      title: 'Bubble geyser!',
      description: 'A vent blasts you across the reef!',
      style: 'launch',
    },
  };
}
