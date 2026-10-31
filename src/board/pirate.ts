import * as THREE from 'three';
import { pirateTheme } from '../audio/songs/pirate';
import { Palette } from '../render/palette';
import { makeCloud } from '../render/props';
import { toon, toonMesh } from '../render/toon';
import { bird, clearOfPath, crab, flyBird, glowSprite, instanced, scatter, seeded, Smoke, textTexture, type Bird } from './decor';
import { BoardBuilder } from './graph';
import {
  anchor,
  bake,
  barrel,
  buoy,
  bunting,
  cannon,
  cannonballs,
  chest,
  crate,
  dolphin,
  fort,
  ghostWreck,
  hangingSign,
  house,
  jungleTree,
  lampPost,
  lighthouse,
  netRack,
  palmTree,
  pier,
  pirateNpc,
  rowboat,
  ropeCoil,
  sharkFin,
  ship,
  signpost,
  skullRock,
  sloop,
  stall,
  starfishGeo,
  tentacle,
  tiki,
  torch,
  turtle,
  Wood,
  type Npc,
  type Tentacle,
} from './pirateProps';
import { buildTerrain, fbm, SEA_LEVEL, waterMaterial, type Isle, type Patch, type Terrain } from './pirateTerrain';
import type { BoardDef, Space } from './types';

/**
 * Pirate Cove: a ring of sandy islands around a lagoon with the pirate
 * flagship at anchor. A port town sits to the west, a fort guards the east,
 * and Skull Island's jungle and volcano loom over the north shore. Two side
 * paths cut across the lagoon: a haunted boardwalk past a ghost wreck
 * (locked) and Treasure Isle.
 */
function layout(): { spaces: Space[]; startId: number; boardwalk: Set<number> } {
  const b = new BoardBuilder().loop(
    [
      [0, 15],
      [11, 15],
      [20, 11],
      [24, 3],
      [22, -6],
      [15, -13],
      [4, -15],
      [-7, -14],
      [-16, -10],
      [-23, -3],
      [-22, 7],
      [-13, 14],
    ],
    // 40 spaces, starting at the dock and going counter-clockwise (seen from above).
    'S B B R B I* B H B B ' + 'R B T B H* B B V B I ' + 'B P R B H B B* I B R ' + 'B H B B V* B B I R B',
  );
  const before = b.spaces.length;
  // Ghost-ship shortcut on the east side, behind a locked gate.
  b.branch(6, 15, [[12, 2], [8, -6]], 'B R H B R', true);
  const boardwalk = new Set<number>();
  for (let id = before; id < b.spaces.length; id++) boardwalk.add(id);
  // Treasure isle path on the west side.
  b.branch(25, 34, [[-10, -6], [-11, 4]], 'B I B* H R');
  return { spaces: b.spaces, startId: b.loopId(0), boardwalk };
}

/** Land beyond the path strip. */
const ISLES: Isle[] = [
  // Skull Island along the whole north shore, with a volcano and a jungle hill.
  { x: -2, z: -34, rx: 32, rz: 12, hill: 1.6, hillR: 6, grass: 0x8fdc9c },
  { x: -9, z: -39, rx: 12, rz: 11, hill: 10, hillR: 8, cone: true },
  { x: 11, z: -40, rx: 9, rz: 8, hill: 4.5, hillR: 5, grass: 0x8fdc9c },
  // Waterfall bluff on Skull Island's shore.
  { x: 15, z: -27, rx: 4, rz: 3, top: 3.6, hill: 0.4, hillR: 2 },
  // Lighthouse headland.
  { x: 28, z: -18, rx: 4.5, rz: 3.8, top: 0.5, hill: 0.8, hillR: 2, rocky: true },
  // Fort hill to the east.
  { x: 36, z: 0, rx: 9, rz: 11, hill: 2.2, hillR: 3 },
  // Port town to the west.
  { x: -36, z: 8, rx: 10, rz: 12.5, hill: 0.5, hillR: 6 },
  // Treasure Isle in the lagoon.
  { x: -13.6, z: -0.5, rx: 3.3, rz: 5.2 },
  // Little palm islets.
  { x: 31, z: 16, rx: 2.6, rz: 2.2 },
  { x: -22, z: -21, rx: 2.2, rz: 1.8 },
];

const TOWN = new THREE.Vector3(-35.5, 0, 6);
const FORT = new THREE.Vector3(36.2, 0, 0);
const TREASURE = new THREE.Vector3(-14.2, 0, -1);
const KRAKEN = new THREE.Vector3(-31, 0, -14);
const WATERFALL_X = 15;

const PATCHES: Patch[] = [
  { ax: TOWN.x, az: TOWN.z, bx: TOWN.x, bz: TOWN.z, r: 4.4, color: 0xecd6ae },
  { ax: TOWN.x + 3, az: TOWN.z - 1.5, bx: -25.5, bz: 2, r: 0.75, color: 0xecd6ae },
  { ax: TOWN.x - 2, az: TOWN.z + 3, bx: -38, bz: 15.5, r: 0.7, color: 0xecd6ae },
  { ax: 25.6, az: 0.8, bx: FORT.x - 3.6, bz: 0, r: 0.8, color: 0xecd6ae },
  { ax: FORT.x, az: FORT.z, bx: FORT.x, bz: FORT.z, r: 3.4, color: 0xd9cfe0 },
];

// ------------------------------------------------------------------ animated bits

interface Sway {
  obj: THREE.Object3D;
  phase: number;
}

interface Anim {
  water: THREE.ShaderMaterial | null;
  falls: THREE.ShaderMaterial | null;
  flags: THREE.Mesh[];
  ship: ReturnType<typeof ship> | null;
  beam: THREE.Object3D | null;
  fin: THREE.Object3D | null;
  palms: Sway[];
  bobbers: (Sway & { y: number })[];
  crabs: (Sway & { x: number; z: number; y: number; dir: number })[];
  gulls: (Bird & { cx: number; cz: number; r: number; y: number; speed: number; phase: number })[];
  wisps: (Sway & { base: THREE.Vector3 })[];
  torches: (Sway & { flame: THREE.Object3D; glow: THREE.Sprite })[];
  npcs: (Npc & { y: number; mode: 'wave' | 'work' | 'look' })[];
  smokes: { smoke: Smoke; offset: number }[];
  tentacles: (Tentacle & { phase: number })[];
  kraken: THREE.Group | null;
  dolphins: { obj: THREE.Object3D; splash: THREE.Mesh; offset: number }[];
  turtle: ReturnType<typeof turtle> | null;
  sparkles: (Sway & { obj: THREE.Sprite })[];
  fortGuns: { at: THREE.Vector3; yaw: number }[];
  gunSmoke: Smoke | null;
}

const anim: Anim = emptyAnim();

function emptyAnim(): Anim {
  return {
    water: null,
    falls: null,
    flags: [],
    ship: null,
    beam: null,
    fin: null,
    palms: [],
    bobbers: [],
    crabs: [],
    gulls: [],
    wisps: [],
    torches: [],
    npcs: [],
    smokes: [],
    tentacles: [],
    kraken: null,
    dolphins: [],
    turtle: null,
    sparkles: [],
    fortGuns: [],
    gunSmoke: null,
  };
}

let boardwalkIds = new Set<number>();

// ------------------------------------------------------------------ scenery

function waterPlane(terrain: Terrain): THREE.Mesh {
  anim.water = waterMaterial(terrain);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), anim.water);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = SEA_LEVEL;
  return mesh;
}

/** Scrolling cel-shaded waterfall down the bluff's face. */
function waterfall(top: THREE.Vector3, bottom: THREE.Vector3, width: number): THREE.Mesh {
  anim.falls = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, a: { value: new THREE.Color(0x9fdcf5) }, b: { value: new THREE.Color(0xf4fcff) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 a;
      uniform vec3 b;
      varying vec2 vUv;
      void main() {
        float s = sin(vUv.y * 22.0 + time * 7.0 + sin(vUv.x * 9.0) * 1.5);
        vec3 c = s > 0.55 ? b : a;
        if (vUv.x < 0.08 || vUv.x > 0.92 || vUv.y < 0.1) c = b;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  });
  const len = top.distanceTo(bottom);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len, 1, 1), anim.falls);
  mesh.position.copy(top).add(bottom).multiplyScalar(0.5);
  // Plane's local Y runs up the face.
  const up = top.clone().sub(bottom).normalize();
  const normal = new THREE.Vector3(0, up.z, -up.y).negate();
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), up, normal);
  mesh.quaternion.setFromRotationMatrix(m);
  return mesh;
}

/** Plank walkway and round pads carrying the ghost path over the water. */
function boardwalk(spaces: Space[], stat: THREE.Group, scene: THREE.Scene): void {
  const plank = new THREE.BoxGeometry(1.5, 0.12, 0.36);
  const post = new THREE.CylinderGeometry(0.1, 0.12, 1.6, 6);
  const shades = [Wood.ghost, 0x9a8ea4, 0x7f7390];
  let k = 0;
  for (const id of boardwalkIds) {
    const s = spaces[id];
    const pad = toonMesh(new THREE.CylinderGeometry(1.45, 1.5, 0.28, 20), Wood.ghost, { outline: 0.03 });
    pad.position.set(s.pos.x, -0.16, s.pos.z);
    stat.add(pad);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const p = toonMesh(post, 0x6f6480, { outline: 0.012 });
      p.position.set(s.pos.x + Math.cos(a) * 1.25, -0.9, s.pos.z + Math.sin(a) * 1.25);
      stat.add(p);
    }
  }
  for (const s of spaces) {
    for (const n of s.next) {
      if (!boardwalkIds.has(s.id) && !boardwalkIds.has(n)) continue;
      const a = s.pos;
      const b = spaces[n].pos;
      const dir = new THREE.Vector3().subVectors(b, a).setY(0);
      const len = dir.length();
      dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const yaw = Math.atan2(dir.x, dir.z);
      const steps = Math.floor(len / 0.42);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = a.clone().lerp(b, t);
        // Pads cover the ends.
        if (t * len < 1.2 || (1 - t) * len < 1.2) continue;
        const m = toonMesh(plank, shades[(i * 7 + k) % 3], { outline: 0.01 });
        m.position.set(p.x, -0.1 + ((i * 13) % 5) * 0.01, p.z);
        m.rotation.set(((i * 5) % 3) * 0.02 - 0.02, yaw, 0);
        stat.add(m);
      }
      // Posts and rope rails on both sides, and a green lantern midway.
      const posts = Math.max(2, Math.round(len / 1.6));
      for (const sd of [-1, 1]) {
        let last: THREE.Vector3 | null = null;
        for (let i = 1; i < posts; i++) {
          const p = a.clone().lerp(b, i / posts).addScaledVector(side, sd * 0.85);
          const pm = toonMesh(post, 0x6f6480, { outline: 0.012 });
          pm.position.set(p.x, -0.2, p.z);
          stat.add(pm);
          const topP = new THREE.Vector3(p.x, 0.55, p.z);
          if (last) {
            const r = toonMesh(new THREE.CylinderGeometry(0.025, 0.025, last.distanceTo(topP), 4), 0x6b4f6e, { outline: false });
            r.position.copy(last).add(topP).multiplyScalar(0.5).setY(0.5);
            r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), topP.clone().sub(last).normalize());
            stat.add(r);
          }
          last = topP;
        }
      }
      const mid = a.clone().lerp(b, 0.5).addScaledVector(side, (k % 2 ? 1 : -1) * 0.85);
      const lantern = toonMesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), 0xb8ffd8, { outline: 0.012, emissive: 0x2a6a48 });
      lantern.position.set(mid.x, 0.75, mid.z);
      stat.add(lantern);
      const glow = glowSprite(0x9ff7c8, 1.5, 0.7);
      glow.position.copy(lantern.position);
      scene.add(glow);
      anim.wisps.push({ obj: glow, phase: k * 1.7, base: glow.position.clone() });
      k++;
    }
  }
}

/** Places a static prop on the ground at (x, z). */
function put<T extends THREE.Object3D>(stat: THREE.Group, terrain: Terrain, obj: T, x: number, z: number, ry = 0, s = 1): T {
  obj.position.set(x, terrain.heightAt(x, z), z);
  obj.rotation.y = ry;
  obj.scale.setScalar(s);
  stat.add(obj);
  return obj;
}

function addTorch(scene: THREE.Scene, terrain: Terrain, x: number, z: number, phase: number): void {
  const t = torch();
  t.group.position.set(x, terrain.heightAt(x, z), z);
  scene.add(t.group);
  anim.torches.push({ obj: t.group, flame: t.flame, glow: t.glow, phase });
}

function addNpc(scene: THREE.Scene, terrain: Terrain, npc: Npc, x: number, z: number, ry: number, mode: 'wave' | 'work' | 'look', y?: number): void {
  const gy = y ?? terrain.heightAt(x, z);
  npc.group.position.set(x, gy, z);
  npc.group.rotation.y = ry;
  scene.add(npc.group);
  anim.npcs.push({ ...npc, y: gy, mode });
}

function portTown(scene: THREE.Scene, stat: THREE.Group, terrain: Terrain): void {
  const T = TOWN;
  const tav = house({ w: 4.4, d: 3, h: 2.6, wall: 0xfff0d8, roof: Palette.coral, chimney: true, windows: 2 });
  put(stat, terrain, tav.group, T.x - 0.5, T.z - 5, 0);
  const sign = hangingSign('THE SALTY GULL', 2.2);
  sign.position.set(T.x - 0.5 + 2.2, terrain.heightAt(T.x, T.z - 5) + 2.2, T.z - 5 + 1.5);
  sign.rotation.y = -Math.PI / 2;
  stat.add(sign);
  if (tav.chimneyTop) {
    const sm = new Smoke(5, 0.32, 2.4, 0.25, 0xf4f0fa, new THREE.Vector3(0.5, 0, 0.2));
    sm.group.position.copy(tav.chimneyTop).add(tav.group.position);
    scene.add(sm.group);
    anim.smokes.push({ smoke: sm, offset: 0 });
  }
  const homes: [number, number, number, number, number, number, number, number, boolean][] = [
    // x, z, ry, w, d, h, wall, roof, chimney
    [T.x - 6, T.z - 1, Math.PI / 2, 2.6, 2.4, 2.1, 0xbfe6ff, Palette.violet, true],
    [T.x - 6.2, T.z + 4.2, Math.PI / 2, 2.4, 2.6, 1.9, Palette.mint, 0x5fb8c8, false],
    [T.x + 4.6, T.z - 5.2, -0.2, 2.4, 2.2, 1.9, Palette.peach, 0x6fa0e0, false],
    [T.x - 4.8, T.z - 6.2, 0.3, 2.2, 2, 1.8, Palette.butter, Palette.coral, true],
  ];
  homes.forEach(([x, z, ry, w, d, h, wall, roof, ch], i) => {
    const hs = house({ w, d, h, wall, roof, chimney: ch, windows: i % 2 ? 1 : 2 });
    put(stat, terrain, hs.group, x, z, ry);
    if (hs.chimneyTop) {
      const sm = new Smoke(4, 0.24, 1.8, 0.3, 0xf4f0fa, new THREE.Vector3(0.5, 0, 0.2));
      sm.group.position.copy(hs.chimneyTop).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(hs.group.position);
      scene.add(sm.group);
      anim.smokes.push({ smoke: sm, offset: i * 0.37 });
    }
  });
  // Stilt house out over the water by the pier.
  const stilt = house({ w: 2.4, d: 2.2, h: 1.8, wall: 0xffd6e4, roof: 0x5fb8c8, stilts: 0.4, windows: 1 });
  stilt.group.position.set(T.x - 6.5, 0, T.z + 12.5);
  stilt.group.rotation.y = 0.5;
  stat.add(stilt.group);

  // Market: stalls, the well, lamps and bunting.
  put(stat, terrain, stall(Palette.coral, [Palette.coral, Palette.yellow, Palette.green, 0xffa65c, Palette.coral, Palette.yellow, Palette.green]), T.x + 2.2, T.z + 0.8, -0.3);
  put(stat, terrain, stall(0x5fb8c8, [0x9fb4e0, 0x9fb4e0, Palette.rose, 0x9fb4e0, Palette.rose]), T.x - 2.2, T.z + 1.6, 0.25);
  put(stat, terrain, stall(Palette.violet, [Palette.yellow, Palette.butter, Palette.yellow, 0xffa65c]), T.x + 1, T.z + 4.6, 0.1);
  put(stat, terrain, (() => {
    const g = new THREE.Group();
    g.add(chest(true));
    return g;
  })(), T.x + 3.2, T.z - 2.2, 0.4);
  put(stat, terrain, cannon(), T.x + 4.6, T.z + 2.2, -1.2);
  put(stat, terrain, cannonballs(), T.x + 4.4, T.z + 3.4);
  const w = (() => {
    const g = new THREE.Group();
    g.add(...[0, 1, 2].map((i) => {
      const b = barrel();
      b.position.set(i * 0.7, 0, (i % 2) * 0.3);
      return b;
    }));
    return g;
  })();
  put(stat, terrain, w, T.x - 3.6, T.z - 3, 0.2);
  for (const [x, z] of [[T.x + 3.4, T.z - 3.2], [T.x - 3.4, T.z - 2.8], [T.x + 0.5, T.z + 7]] as const) {
    const c = crate(0.6);
    put(stat, terrain, c, x, z, x);
  }
  const lamps: [number, number][] = [[T.x + 3.8, T.z + 0.5], [T.x - 3.2, T.z + 4.5], [T.x + 1.8, T.z - 3.4], [T.x - 2.8, T.z - 2]];
  for (const [x, z] of lamps) put(stat, terrain, lampPost().group, x, z, x);
  const gy = terrain.heightAt(T.x, T.z - 5);
  stat.add(bunting(new THREE.Vector3(T.x - 2.5, gy + 2.7, T.z - 3.4), new THREE.Vector3(T.x + 4.6, gy + 2.5, T.z - 4), [Palette.coral, Palette.yellow, 0x6fb7ff, Palette.green]));
  stat.add(bunting(new THREE.Vector3(T.x - 5, gy + 2.4, T.z - 1), new THREE.Vector3(T.x - 2.5, gy + 2.7, T.z - 3.4), [Palette.violet, Palette.coral, Palette.butter]));
  // Pier with a moored sloop and a rowboat.
  const p = pier(9, 1.6);
  p.position.set(T.x - 2.6, 0.02, T.z + 9.4);
  stat.add(p);
  const sl = sloop(Palette.cream, 0x6fb7ff);
  sl.group.position.set(T.x + 0.4, -0.55, T.z + 15);
  sl.group.rotation.y = Math.PI / 2 + 0.1;
  scene.add(sl.group);
  anim.flags.push(sl.flag);
  anim.bobbers.push({ obj: sl.group, phase: 2.2, y: -0.55 });
  const rb = rowboat();
  rb.position.set(T.x - 4.4, -0.25, T.z + 17);
  rb.rotation.y = -0.3;
  scene.add(rb);
  anim.bobbers.push({ obj: rb, phase: 1.1, y: -0.25 });
  put(stat, terrain, netRack(), T.x - 7.5, T.z + 8, 0.3);
  put(stat, terrain, ropeCoil(), T.x - 1.5, T.z + 9);
  // Townsfolk.
  addNpc(scene, terrain, pirateNpc({ shirt: 0x6fb7ff, skin: 0xc58c64, hat: 'bandana' }), T.x + 2.4, T.z + 1.8, -0.3, 'work');
  addNpc(scene, terrain, pirateNpc({ shirt: Palette.butter, skin: 0xffd8b8, hat: 'tricorn', beard: true, phase: 1 }), T.x - 0.2, T.z - 1.6, 0.2, 'wave');
  addNpc(scene, terrain, pirateNpc({ shirt: Palette.rose, skin: 0x8a5a3b, hat: 'none', pants: 0x6b4f9e, phase: 2 }), T.x - 2.6, T.z + 2.6, 0.6, 'look');
  addNpc(scene, terrain, pirateNpc({ shirt: Palette.mint, skin: 0xe8b48a, hat: 'bandana', phase: 3 }), T.x - 2.6, T.z + 13, Math.PI, 'work', 0.08);
}

function fortHill(scene: THREE.Scene, stat: THREE.Group, terrain: Terrain): void {
  const f = fort();
  const y = terrain.heightAt(FORT.x, FORT.z) - 0.05;
  f.group.position.set(FORT.x, y, FORT.z);
  f.group.updateMatrixWorld(true);
  // The fort bakes with the rest; remember where its guns point for the smoke.
  anim.fortGuns = f.cannons.map((c) => {
    const at = c.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));
    return { at: at.addScaledVector(dir, 0.9).setY(at.y + 0.45), yaw: Math.atan2(dir.x, dir.z) - Math.PI / 2 };
  });
  stat.add(f.group);
  anim.flags.push(f.flag);
  anim.gunSmoke = new Smoke(5, 0.4, 1.8, 0.9, 0xffffff, new THREE.Vector3(1.2, 0.3, 0));
  scene.add(anim.gunSmoke.group);
  addNpc(scene, terrain, pirateNpc({ shirt: 0x6fb7ff, skin: 0xffd8b8, hat: 'tricorn', phase: 0.5 }), FORT.x - 1.6, FORT.z + 2.2, 0.4, 'look', y);
  addNpc(scene, terrain, pirateNpc({ shirt: Palette.coral, skin: 0xc58c64, hat: 'bandana', phase: 2.5 }), FORT.x + 0.5, FORT.z + 1.8, -0.6, 'work', y);
  // Torches either side of the gate and a sign down by the path.
  addTorch(scene, terrain, FORT.x - 4.4, FORT.z - 1.2, 0.3);
  addTorch(scene, terrain, FORT.x - 4.4, FORT.z + 1.2, 1.1);
  put(stat, terrain, cannonballs(), 27.6, -1.8);
  put(stat, terrain, barrel(), 27.8, 2.6);
  put(stat, terrain, crate(0.6), 28.5, 3.1, 0.4);
}

function skullIsland(scene: THREE.Scene, stat: THREE.Group, terrain: Terrain, spaces: Space[], rand: () => number): void {
  const skull = skullRock();
  skull.position.set(-5, -0.8, -24.5);
  skull.rotation.y = 0.12;
  skull.scale.setScalar(0.8);
  stat.add(skull);
  put(stat, terrain, tiki(), -15, -25.5, 0.25);
  put(stat, terrain, tiki(0xc4b0a0), 4.5, -25.5, -0.2, 0.9);
  put(stat, terrain, tiki(), -18.5, -27, 0.3, 0.75);
  addTorch(scene, terrain, -13.2, -24.6, 0.7);
  addTorch(scene, terrain, -16.8, -24.8, 1.5);
  addTorch(scene, terrain, 2.8, -24.2, 2.1);
  addTorch(scene, terrain, 6.3, -24.4, 2.9);

  // Jungle: broadleaf trees inland, palms along the beach.
  const trees: [number, number][] = [];
  for (let tries = 0; trees.length < 90 && tries < 4000; tries++) {
    const x = -36 + rand() * 70;
    const z = -48 + rand() * 24;
    const h = terrain.heightAt(x, z);
    if (h < 0.1 || h > 3.4 || terrain.inlandAt(x, z) < 2.2) continue;
    if (Math.hypot(x + 5, z + 24.5) < 4.5 || Math.abs(x - WATERFALL_X) < 3.5) continue;
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.9)) continue;
    trees.push([x, z]);
    put(stat, terrain, jungleTree(0.9 + rand() * 0.6, Math.floor(rand() * 4)), x, z, rand() * 6);
  }
  for (let i = 0; i < 9; i++) {
    const x = -30 + i * 6.5 + rand() * 2;
    const z = -23.5 - rand() * 1.5;
    if (terrain.inlandAt(x, z) < 0.8 || Math.hypot(x + 5, z + 24.5) < 4.5 || Math.abs(x - WATERFALL_X) < 3) continue;
    if (!clearOfPath(spaces, x, z, 4)) continue;
    const palm = palmTree(2.6 + rand());
    palm.position.set(x, terrain.heightAt(x, z), z);
    palm.rotation.y = rand() * 6;
    scene.add(palm);
    anim.palms.push({ obj: palm, phase: i * 1.3 });
  }

  // The volcano smokes, with clouds snagged round its peak.
  const sm = new Smoke(7, 1.4, 7, 0.08, 0xeee6f4, new THREE.Vector3(0.6, 0, 0.15));
  sm.group.position.set(-9, terrain.heightAt(-9, -39) + 0.5, -39);
  scene.add(sm.group);
  anim.smokes.push({ smoke: sm, offset: 0 });
  const glow = glowSprite(0xff9a76, 7, 0.55);
  glow.position.set(-9, terrain.heightAt(-9, -39) + 1, -39);
  scene.add(glow);
  for (const [x, y, z, s] of [[-15, 9, -42, 1.6], [-2, 10.5, -44, 2]] as const) {
    const c = makeCloud(s);
    c.position.set(x, y, z);
    scene.add(c);
  }

  // Waterfall pouring off the bluff into the sea.
  let topZ = -27;
  let botZ = -20;
  for (let z = -29; z < -18; z += 0.1) {
    const h = terrain.heightAt(WATERFALL_X, z);
    if (h > 3.3) topZ = z;
    if (h > SEA_LEVEL) botZ = z;
  }
  const falls = waterfall(new THREE.Vector3(WATERFALL_X, terrain.heightAt(WATERFALL_X, topZ) + 0.25, topZ), new THREE.Vector3(WATERFALL_X, SEA_LEVEL + 0.02, botZ + 0.6), 1.8);
  scene.add(falls);
  const pool = toonMesh(new THREE.CircleGeometry(1.5, 18), 0x9fdcf5, { outline: false });
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(WATERFALL_X, terrain.heightAt(WATERFALL_X, topZ - 1.6) + 0.06, topZ - 1.6);
  stat.add(pool);
  const splash = new Smoke(5, 0.5, 1.2, 0.7, 0xffffff, new THREE.Vector3(0, 0, 0.5));
  splash.group.position.set(WATERFALL_X, SEA_LEVEL, botZ + 1);
  scene.add(splash.group);
  anim.smokes.push({ smoke: splash, offset: 0 });
  for (const sx of [-1.6, 1.6]) {
    const r = toonMesh(new THREE.DodecahedronGeometry(0.9, 0), 0xc4bcd2, { outline: 0.03 });
    r.position.set(WATERFALL_X + sx, SEA_LEVEL + 0.1, botZ + 0.6);
    r.scale.set(1, 0.7, 1);
    stat.add(r);
  }

  // Lighthouse on its headland with the keeper's hut.
  const lh = lighthouse();
  lh.group.position.set(28.4, terrain.heightAt(28.4, -18.6), -18.6);
  scene.add(lh.group);
  anim.beam = lh.beam;
  const hut = house({ w: 2, d: 1.8, h: 1.5, wall: Palette.cream, roof: Palette.coral, windows: 1 });
  put(stat, terrain, hut.group, 25.6, -16.8, -0.5);
  put(stat, terrain, anchor(), 30.4, -16, 0.6);
}

function treasureIsle(scene: THREE.Scene, stat: THREE.Group, terrain: Terrain): void {
  const T = TREASURE;
  put(stat, terrain, chest(true), T.x - 0.2, T.z + 0.2, 0.5, 1.2);
  // Gold spilled about, glinting.
  const coins: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  const r = seeded(0x901d);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.5 + r() * 1.1;
    const x = T.x + Math.cos(a) * d;
    const z = T.z + 0.4 + Math.sin(a) * d * 0.7;
    coins.push({ x, y: terrain.heightAt(x, z) + 0.03, z, s: 0.8 + r() * 0.4, ry: r() * 6 });
  }
  scene.add(instanced(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), Palette.yellow, coins));
  for (let i = 0; i < 4; i++) {
    const s = glowSprite(0xfff2a8, 0.7, 0.9);
    s.position.set(T.x - 0.6 + i * 0.4, terrain.heightAt(T.x, T.z) + 0.75 + (i % 2) * 0.2, T.z + 0.3 + (i % 2) * 0.2);
    scene.add(s);
    anim.sparkles.push({ obj: s, phase: i * 1.7 });
  }
  const xMat = toon(Palette.coral);
  for (const a of [0.78, -0.78]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.24), xMat);
    bar.rotation.set(-Math.PI / 2, 0, a);
    bar.position.set(T.x + 0.3, terrain.heightAt(T.x + 0.3, T.z - 2.2) + 0.04, T.z - 2.2);
    stat.add(bar);
  }
  const mound = toonMesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8cf98, { outline: 0.015 });
  mound.scale.y = 0.6;
  put(stat, terrain, mound, T.x - 0.6, T.z - 2.8);
  const shovel = new THREE.Group();
  const handle = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), Wood.hull, { outline: 0.01 });
  handle.position.y = 0.65;
  const blade = toonMesh(new THREE.BoxGeometry(0.3, 0.36, 0.04), 0xc8c4d8, { outline: 0.01 });
  shovel.add(handle, blade);
  put(stat, terrain, shovel, T.x - 0.4, T.z - 2.6, 0.4).rotation.set(0.3, 0.4, 0.2);
  // A grinning skull keeps an eye on the loot.
  const skull = new THREE.Group();
  const head = toonMesh(new THREE.SphereGeometry(0.22, 12, 8), Palette.cream, { outline: 0.015 });
  head.position.y = 0.2;
  skull.add(head);
  for (const s of [-1, 1]) {
    const eye = toonMesh(new THREE.SphereGeometry(0.06, 6, 4), Palette.ink, { outline: false });
    eye.position.set(s * 0.08, 0.24, 0.18);
    skull.add(eye);
  }
  put(stat, terrain, skull, T.x + 0.9, T.z + 1.2, 0.6);
  for (const [x, z, h] of [[T.x - 1.4, T.z - 3.8, 2.6], [T.x - 2.3, T.z - 0.6, 3], [T.x - 1.8, T.z + 3.6, 2.4]] as const) {
    const palm = palmTree(h);
    palm.position.set(x, terrain.heightAt(x, z), z);
    palm.rotation.y = x * 2;
    scene.add(palm);
    anim.palms.push({ obj: palm, phase: x + z });
  }
  addTorch(scene, terrain, T.x + 0.9, T.z - 1.2, 0.2);
  addNpc(scene, terrain, pirateNpc({ shirt: Palette.violet, skin: 0xe8b48a, hat: 'bandana', phase: 1.5 }), T.x - 1.1, T.z - 1.9, 0.9, 'work');
}

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  Object.assign(anim, emptyAnim());
  const rand = seeded(0x5ea);
  const terrain = buildTerrain({ spaces, overWater: boardwalkIds, isles: ISLES, patches: PATCHES });
  scene.add(waterPlane(terrain));
  scene.add(terrain.mesh);
  // Static props collect here and get baked into a handful of meshes at the end.
  const stat = new THREE.Group();

  boardwalk(spaces, stat, scene);
  portTown(scene, stat, terrain);
  fortHill(scene, stat, terrain);
  skullIsland(scene, stat, terrain, spaces, rand);
  treasureIsle(scene, stat, terrain);

  // Palms on the outside of the main ring, away from the lagoon.
  spaces.forEach((s, i) => {
    if (i >= 40 || i % 3 !== 1) return;
    const out = s.pos.clone().setY(0).normalize();
    // Skip the camera-facing side so trees never hide the path.
    if (out.z > 0.2) return;
    const x = s.pos.x + out.x * 2.3;
    const z = s.pos.z + out.z * 2.3;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < 8 || Math.hypot(x - FORT.x, z - FORT.z) < 7) return;
    const palm = palmTree(2.4 + (i % 4) * 0.35);
    palm.position.set(x, Math.max(-0.2, terrain.heightAt(x, z)), z);
    palm.rotation.y = Math.atan2(out.x, out.z) + Math.PI / 2;
    scene.add(palm);
    anim.palms.push({ obj: palm, phase: i });
  });

  // Beach dressing: starfish and shells round the sandy rims.
  const stars: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  const shells: typeof stars = [];
  for (let i = 0; i < 260; i++) {
    const x = -46 + rand() * 92;
    const z = -30 + rand() * 54;
    const inland = terrain.inlandAt(x, z);
    if (inland < 0.4 || inland > 1.1 || !clearOfPath(spaces, x, z, 1.3)) continue;
    const it = { x, y: terrain.heightAt(x, z) - 0.01, z, s: 0.7 + rand() * 0.6, ry: rand() * 6 };
    (i % 3 === 0 ? stars : shells).push(it);
  }
  scene.add(instanced(starfishGeo(), Palette.coral, stars));
  scene.add(instanced(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), Palette.rose, shells));

  // Grass tufts, flowers and bushes on the green bits.
  const tufts: { x: number; y: number; z: number; s: number; ry: number; sy?: number }[] = [];
  const flowers: typeof tufts = [];
  const flowers2: typeof tufts = [];
  const bushes: typeof tufts = [];
  for (let i = 0; i < 2600; i++) {
    const x = -48 + rand() * 96;
    const z = -48 + rand() * 72;
    const h = terrain.heightAt(x, z);
    if (h < -0.05 || h > 3 || terrain.inlandAt(x, z) < 1.6) continue;
    if (!clearOfPath(spaces, x, z, 1.25)) continue;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < 4.6 || Math.hypot(x - FORT.x, z - FORT.z) < 4.8) continue;
    const n = fbm(x * 1.7, z * 1.7);
    const it = { x, y: h, z, s: 0.6 + rand() * 0.6, ry: rand() * 6 };
    if (n > 0.2 && bushes.length < 120 && clearOfPath(spaces, x, z, 1.8)) bushes.push({ ...it, sy: 0.7 });
    else if (n < -0.15) (i % 2 ? flowers : flowers2).push(it);
    else if (tufts.length < 700) tufts.push(it);
  }
  scene.add(instanced(new THREE.ConeGeometry(0.1, 0.36, 4).translate(0, 0.16, 0), Palette.grassDark, tufts));
  scene.add(instanced(new THREE.SphereGeometry(0.09, 6, 4).translate(0, 0.08, 0), Palette.rose, flowers));
  scene.add(instanced(new THREE.SphereGeometry(0.09, 6, 4).translate(0, 0.08, 0), Palette.butter, flowers2));
  scene.add(instanced(new THREE.IcosahedronGeometry(0.55, 1).translate(0, 0.25, 0), 0x86d8a0, bushes));

  // The flagship at anchor in the lagoon.
  const fs = ship();
  fs.group.position.set(0, -0.5, -1);
  fs.group.rotation.y = 0.25;
  scene.add(fs.group);
  anim.ship = fs;
  anim.flags.push(...fs.flags);
  for (const c of fs.crew) anim.npcs.push({ ...c, y: c.group.position.y, mode: c === fs.crew[0] ? 'work' : 'look' });

  // Haunted wreck beside the ghost-ship shortcut, with ghostly wisps.
  const wreck = ghostWreck();
  wreck.position.set(16.2, -1.2, -3);
  wreck.rotation.set(0, Math.PI / 2 + 0.35, 0.3);
  stat.add(wreck);
  for (let i = 0; i < 4; i++) {
    const w = glowSprite(0x9ff7c8, 1.1, 0.9);
    const base = new THREE.Vector3(15 + (i % 2) * 2, 1.8 + i * 0.5, -5.5 + i * 1.6);
    w.position.copy(base);
    scene.add(w);
    anim.wisps.push({ obj: w, phase: i * 2.2, base });
  }

  // The old jetty by the start, with the cove's name.
  const jetty = pier(7);
  jetty.position.set(-3.4, 0.02, 17.2);
  stat.add(jetty);
  const boat = rowboat();
  boat.position.set(-5.6, -0.25, 21.5);
  boat.rotation.y = 0.3;
  scene.add(boat);
  anim.bobbers.push({ obj: boat, phase: 0.5, y: -0.25 });
  const sign = new THREE.Group();
  const signPost = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), Wood.hull, { outline: 0.015 });
  signPost.position.y = 0.8;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.08), [
    ...Array(4).fill(toon(Wood.mid)),
    new THREE.MeshBasicMaterial({ map: textTexture('PIRATE COVE', '#c99a6b', '#fff6e6', 256, 64, '900 34px system-ui, sans-serif') }),
    toon(Wood.mid),
  ]);
  board.position.y = 1.5;
  board.rotation.z = -0.05;
  sign.add(signPost, board);
  sign.position.set(-3.6, 0, 20.4);
  stat.add(sign);
  const post = signpost([['TOWN', Math.PI], ['FORT', 0], ['SKULL ISLE', Math.PI / 2]]);
  put(stat, terrain, post, 2.6, 17.4, 0.2);

  // Torches and odds and ends along the path.
  const torchSpots = [2, 9, 13, 20, 24, 29, 33, 37];
  torchSpots.forEach((idx, i) => {
    const s = spaces[idx];
    const out = s.pos.clone().setY(0).normalize();
    const side = i % 2 ? 1 : -1;
    const tangent = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(side * 1.2);
    const x = s.pos.x + out.x * 1.75 + tangent.x;
    const z = s.pos.z + out.z * 1.75 + tangent.z;
    if (!clearOfPath(spaces, x, z, 1.3) || terrain.heightAt(x, z) < SEA_LEVEL) return;
    addTorch(scene, terrain, x, z, i * 0.9);
  });
  const odds: [THREE.Object3D, number, number][] = [
    [barrel(), 5.5, 18.6],
    [barrel(), 6.4, 19],
    [crate(), 7.2, 18.4],
    [anchor(), -24.6, 10.5],
    [ropeCoil(), -26.4, -2.6],
    [netRack(), 26.4, 7.6],
    [crate(), 20.4, -13.2],
    [barrel(), 21.2, -12.6],
    [chest(), -26, 1.2],
    [cannon(), 13.6, 17.6],
    [cannonballs(), 14.6, 18.2],
  ];
  odds.forEach(([o, x, z]) => {
    if (clearOfPath(spaces, x, z, 1.3)) put(stat, terrain, o, x, z, x * 0.7);
  });

  // Little islets, each with a palm and a crab.
  for (const [x, z, i] of [[31, 16, 0], [-22, -21, 1]] as const) {
    const palm = palmTree(2.8);
    palm.position.set(x, terrain.heightAt(x, z), z);
    palm.rotation.y = x;
    scene.add(palm);
    anim.palms.push({ obj: palm, phase: i * 2.1 });
    const c = crab(i ? Palette.coral : 0xff9a6a);
    const cx = x + 1;
    const cz = z + 0.6;
    const y = terrain.heightAt(cx, cz) + 0.05;
    c.position.set(cx, y, cz);
    scene.add(c);
    anim.crabs.push({ obj: c, phase: i * 1.3, x: cx, z: cz, y, dir: i * 0.9 });
  }
  // Crabs on the main beaches too.
  for (const [x, z, i] of [[-6, 17.4, 2], [21.8, 13.6, 3], [-26.2, 6, 4]] as const) {
    const c = crab(i % 2 ? Palette.coral : 0xff9a6a);
    const y = terrain.heightAt(x, z) + 0.05;
    c.position.set(x, y, z);
    scene.add(c);
    anim.crabs.push({ obj: c, phase: i * 1.3, x, z, y, dir: i * 0.9 });
  }

  // Buoys, floating cargo and sea rocks with foam collars.
  const floaters: [THREE.Object3D, number, number, number][] = [
    [buoy(), 27, 4, -0.45],
    [buoy(), 12, -21, -0.45],
    [buoy(), -18, 20, -0.45],
    [buoy(), 20, 20, -0.45],
    [barrel(), -4, -8, -0.75],
    [crate(0.7), 5, 9.6, -0.65],
    [barrel(), -19, -16, -0.75],
  ];
  floaters.forEach(([o, x, z, y], i) => {
    o.position.set(x, y, z);
    scene.add(o);
    anim.bobbers.push({ obj: o, phase: i * 1.9, y });
  });
  const rocks = scatter(rand, spaces, {
    count: 18,
    extent: 44,
    clearance: 4,
    reject: (x, z) => terrain.heightAt(x, z) > -1.2 || (Math.abs(x) < 7 && z > -6 && z < 4) || Math.hypot(x - KRAKEN.x, z - KRAKEN.z) < 5 || (x > 6 && x < 20 && z > -10 && z < 9),
  });
  const rockItems = rocks.map(([x, z]) => ({ x, y: -0.35, z, s: 0.5 + rand() * 0.9, ry: rand() * 6, sy: 0.7 }));
  scene.add(instanced(new THREE.DodecahedronGeometry(1, 0), 0xc4bcd2, rockItems));
  scene.add(instanced(new THREE.RingGeometry(1.05, 1.45, 14).rotateX(-Math.PI / 2), 0xf2fbff, rockItems.map((r) => ({ ...r, y: -0.42, sy: 1 }))));

  // Sea life: the shark, dolphins, a turtle and the kraken.
  anim.fin = sharkFin();
  anim.fin.scale.setScalar(1.5);
  scene.add(anim.fin);
  const splashGeo = new THREE.RingGeometry(0.4, 0.75, 16).rotateX(-Math.PI / 2);
  for (let i = 0; i < 2; i++) {
    const d = dolphin();
    scene.add(d);
    const splash = new THREE.Mesh(splashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    scene.add(splash);
    anim.dolphins.push({ obj: d, splash, offset: i * 0.45 });
  }
  anim.turtle = turtle();
  scene.add(anim.turtle.group);
  const kr = new THREE.Group();
  kr.position.copy(KRAKEN);
  const head = toonMesh(new THREE.SphereGeometry(2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0xb48ad8, { outline: 0.05 });
  head.scale.set(1, 1.3, 1);
  kr.add(head);
  for (const s of [-1, 1]) {
    const eye = toonMesh(new THREE.SphereGeometry(0.4, 10, 8), 0xffffff, { outline: 0.02 });
    eye.position.set(s * 0.8, 1.1, 1.6);
    const pupil = toonMesh(new THREE.SphereGeometry(0.2, 8, 6), Palette.ink, { outline: false });
    pupil.position.set(s * 0.8, 1.1, 1.95);
    kr.add(eye, pupil);
  }
  const tentacleSpots: [number, number, number][] = [[-3, 1.2, 0.4], [3, 0.8, -0.4], [-1.6, 2.8, 0.1], [2, 3, -0.1]];
  tentacleSpots.forEach(([x, z, lean], i) => {
    const tn = tentacle(9, 0.42 - i * 0.03);
    tn.root.position.set(x, 0, z);
    tn.root.rotation.z = lean;
    kr.add(tn.root);
    anim.tentacles.push({ ...tn, phase: i * 1.4 });
  });
  scene.add(kr);
  anim.kraken = kr;

  // Gulls wheeling overhead.
  for (let i = 0; i < 5; i++) {
    const g = bird(0xffffff, 0xeef0ff);
    g.group.scale.setScalar(1.1);
    scene.add(g.group);
    // Wide circles round the outside of the ring, so they never hide the path for long.
    anim.gulls.push({ ...g, cx: 0, cz: -2, r: 30 + i * 2, y: 5 + i * 0.4, speed: i % 2 ? 0.12 : -0.1, phase: i * 1.6 });
  }

  scene.add(bake(stat));
}

// ------------------------------------------------------------------ animation

function updateScenery(t: number): void {
  if (anim.water) anim.water.uniforms.time.value = t;
  if (anim.falls) anim.falls.uniforms.time.value = t;
  for (const f of anim.flags) {
    const pos = f.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(t * 6 - x * 4) * 0.09 * x);
    }
    pos.needsUpdate = true;
  }
  const s = anim.ship;
  if (s) {
    s.group.position.y = -0.5 + Math.sin(t * 0.9) * 0.12;
    s.group.rotation.x = Math.sin(t * 0.9 + 1) * 0.035;
    s.group.rotation.z = Math.sin(t * 0.7) * 0.02;
    s.wheel.rotation.x = Math.sin(t * 0.5) * 0.8;
    // A volley every nine seconds; the smoke shows for the first two.
    const k = t % 9;
    s.smoke.group.visible = k < 2;
    s.smoke.update(k * 0.5);
    s.parrot.rotation.y = 0.6 + Math.sin(t * 0.8) * 0.5;
    s.parrot.position.y = 1.5 + Math.max(0, Math.sin(t * 3)) * 0.06;
    for (const l of s.lanterns) l.material.opacity = 0.5 + Math.sin(t * 3 + l.position.z) * 0.1;
  }
  // The fort answers the ship's volley a few seconds later, from a different gun each time.
  if (anim.gunSmoke && anim.fortGuns.length) {
    const k = (t + 4.5) % 9;
    const gun = anim.fortGuns[Math.floor((t + 4.5) / 9) % anim.fortGuns.length];
    anim.gunSmoke.group.position.copy(gun.at);
    anim.gunSmoke.group.rotation.y = gun.yaw;
    anim.gunSmoke.group.visible = k < 2;
    anim.gunSmoke.update(k * 0.5);
  }
  if (anim.beam) anim.beam.rotation.y = t * 0.8;
  if (anim.fin) {
    const a = -t * 0.45;
    anim.fin.position.set(3 + Math.cos(a) * 3.5, -0.55 + Math.sin(t * 2) * 0.05, 7.2 + Math.sin(a) * 2.2);
    anim.fin.rotation.y = -a - Math.PI / 2 + Math.PI;
  }
  for (const p of anim.palms) {
    p.obj.rotation.x = Math.sin(t * 1.1 + p.phase) * 0.025;
    p.obj.rotation.z = Math.sin(t * 0.8 + p.phase * 1.3) * 0.03;
  }
  for (const b of anim.bobbers) {
    b.obj.position.y = b.y + Math.sin(t * 1.4 + b.phase) * 0.12;
    b.obj.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.12;
    b.obj.rotation.x = Math.cos(t * 0.9 + b.phase) * 0.08;
  }
  for (const c of anim.crabs) {
    // Scuttle sideways, pause, scuttle back.
    const sw = Math.sin(t * 0.7 + c.phase);
    const step = Math.max(-1, Math.min(1, sw * 2)) * 0.7;
    c.obj.position.set(c.x + Math.cos(c.dir) * step, c.y + Math.abs(Math.sin(t * 12)) * 0.03 * Math.abs(Math.cos(t * 0.7 + c.phase)), c.z + Math.sin(c.dir) * step);
    c.obj.rotation.y = -c.dir;
  }
  for (const g of anim.gulls) flyBird(g, t, g.cx, g.cz, g.r, g.y, g.speed, g.phase);
  for (const w of anim.wisps) {
    w.obj.position.set(w.base.x + Math.sin(t * 0.7 + w.phase) * 0.4, w.base.y + Math.sin(t * 1.3 + w.phase) * 0.25, w.base.z + Math.cos(t * 0.5 + w.phase) * 0.4);
    ((w.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(t * 2.3 + w.phase) * 0.35;
  }
  for (const tr of anim.torches) {
    const f = 1 + Math.sin(t * 13 + tr.phase) * 0.12 + Math.sin(t * 7.3 + tr.phase * 2) * 0.08;
    tr.flame.scale.set(1 / f, f, 1 / f);
    tr.flame.rotation.z = Math.sin(t * 5 + tr.phase) * 0.12;
    tr.glow.material.opacity = 0.45 + (f - 1) * 1.2;
  }
  for (const n of anim.npcs) {
    const p = t + n.phase;
    n.group.position.y = n.y + Math.abs(Math.sin(p * 2.2)) * 0.04;
    if (n.mode === 'wave') n.arm.rotation.z = 2.4 + Math.sin(p * 7) * 0.4;
    else if (n.mode === 'work') n.arm.rotation.z = 0.6 + Math.sin(p * 4) * 0.6;
    else {
      // Shade their eyes and scan the horizon.
      n.arm.rotation.z = 2.1;
      n.group.rotation.y += Math.sin(p * 0.6) * 0.004;
    }
  }
  for (const sm of anim.smokes) sm.smoke.update(t + sm.offset * 10);
  for (const sp of anim.sparkles) {
    const k = Math.max(0, Math.sin(t * 2.5 + sp.phase));
    sp.obj.material.opacity = k * k;
    sp.obj.scale.setScalar(0.3 + k * 0.6);
  }

  // Kraken: surfaces every 24 seconds, waves its tentacles about, then sinks.
  if (anim.kraken) {
    const k = t % 24;
    const up = k < 3 ? k / 3 : k < 11 ? 1 : k < 14 ? 1 - (k - 11) / 3 : 0;
    const e = up * up * (3 - 2 * up);
    anim.kraken.visible = up > 0;
    anim.kraken.position.y = -4.2 + e * 3.6;
    for (const tn of anim.tentacles) {
      tn.joints.forEach((j, i) => {
        j.rotation.x = Math.sin(t * 1.6 + tn.phase + i * 0.6) * 0.22 + 0.08;
        j.rotation.z = Math.cos(t * 1.1 + tn.phase + i * 0.4) * 0.1;
      });
    }
  }
  // Dolphins leap across the lagoon in pairs, from a new spot each time.
  for (const d of anim.dolphins) {
    const period = 5;
    const lt = t / period + d.offset * 0.08;
    const n = Math.floor(lt);
    const k = (lt - n) * period;
    const dur = 1.3;
    const dir = n % 2 ? -1 : 1;
    const sx = -7 + (n % 3) * 1.2 + d.offset * 2.2 * dir - (dir < 0 ? -6 : 0);
    const sz = -7.4 + (n % 2) * 0.8 + d.offset * 1.4;
    if (k < dur) {
      const u = k / dur;
      const y = SEA_LEVEL - 0.4 + 2.3 * 4 * u * (1 - u);
      d.obj.visible = true;
      d.obj.position.set(sx + dir * u * 5, y, sz);
      d.obj.rotation.set(-Math.atan(2.3 * 4 * (1 - 2 * u) / 5), dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 'YXZ');
    } else d.obj.visible = false;
    // Splash rings where it leaves and re-enters the water.
    const sk = k < 0.6 ? k : k > dur - 0.1 && k < dur + 0.6 ? k - (dur - 0.1) : -1;
    d.splash.visible = sk >= 0;
    if (sk >= 0) {
      d.splash.position.set(sx + (k < 0.6 ? 0.3 : 4.7) * dir, SEA_LEVEL + 0.03, sz);
      d.splash.scale.setScalar(0.6 + sk * 2.5);
      (d.splash.material as THREE.MeshBasicMaterial).opacity = 1 - sk / 0.6;
    }
  }
  if (anim.turtle) {
    const a = t * 0.25;
    anim.turtle.group.position.set(-4.6 + Math.cos(a) * 1.8, SEA_LEVEL - 0.05 + Math.sin(t * 1.2) * 0.04, 6 + Math.sin(a) * 1.4);
    anim.turtle.group.rotation.y = -a;
    for (const f of anim.turtle.flippers) f.rotation.z = Math.sin(t * 3 + (f.userData.side as number)) * 0.4 * (f.userData.side as number);
  }
}

export function pirateCove(): BoardDef {
  const { spaces, startId, boardwalk: ids } = layout();
  boardwalkIds = ids;
  return {
    id: 'pirate',
    name: 'Pirate Cove',
    spaces,
    startId,
    song: pirateTheme,
    buildScenery,
    updateScenery,
    sky: [0x8ec9ff, 0xfde4f2],
    happening: {
      title: 'Cannon blast!',
      description: 'The ship fires you to another island!',
      style: 'launch',
    },
  };
}

