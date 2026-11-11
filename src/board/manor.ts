import * as THREE from 'three';
import { manorTheme } from '../audio/songs/manor';
import { toon, toonMesh } from '../render/toon';
import { bird, flyBird, glowSprite, scatter, seeded, Smoke, type Bird } from './decor';
import { BoardBuilder } from './graph';
import {
  archway,
  BARK,
  boathouse,
  cat,
  crypt,
  fountain,
  gasLamp,
  ghost,
  gnarledTree,
  greenhouse,
  headstone,
  hedge,
  ironFence,
  manor,
  pumpkin,
  rowboat,
  scarecrow,
  signpost,
  STONE,
  swingTree,
  toadstool,
  wishingWell,
  WISP,
} from './manorProps';
import type { BoardDef, Space } from './types';
import { bake, live, put } from './westernProps';

/**
 * Hollow Hill Manor: a cobbled lane looping round a creaky old mansion at
 * dusk. A locked hedge maze cuts across the east side (find the key!), a
 * shortcut through the graveyard cuts across the west. Around the loop: a
 * misty lake with a boathouse, a glasshouse, a pumpkin patch and the woods.
 */
function layout(): { spaces: Space[]; startId: number } {
  const b = new BoardBuilder()
    .loop(
      [
        [0, 16],
        [10, 16.5],
        [19, 13],
        [24, 4],
        [22, -6],
        [14, -13],
        [5, -15],
        [-5, -14],
        [-14, -15],
        [-22, -8],
        [-25, 2],
        [-20, 11],
        [-10, 16],
      ],
      'S B B I B R B H B* B ' + 'B T R B H B B* V B I ' + 'B R B B H* P B R B B ' + 'I B H B* B V B R B B',
    )
    // The hedge maze: locked, but it's the quick way round the back.
    .branch(5, 16, [[12, 4], [10, -5]], 'B H B* R B', true)
    // A shortcut between the graves.
    .branch(26, 37, [[-12, -5], [-10, 5]], 'R B I B* H');
  return { spaces: b.spaces, startId: b.loopId(0) };
}

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

const GROUND = 140;
const GROUND_PX = 2048;
const GRASS = 0x9fd3b9;
const LAKE = { x: 0, z: -25.5, rx: 10.5, rz: 5 };
const MANOR = { x: 0, z: -1 };

function groundTexture(spaces: Space[], rand: () => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = GROUND_PX;
  const g = c.getContext('2d')!;
  const k = GROUND_PX / GROUND;
  const px = (v: number) => (v + GROUND / 2) * k;
  g.fillStyle = `#${GRASS.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Mottled lawn: mint and lilac patches.
  for (let i = 0; i < 120; i++) {
    const x = (rand() * 2 - 1) * 60;
    const z = (rand() * 2 - 1) * 60;
    const r = (2 + rand() * 6) * k;
    const col = rand() < 0.55 ? '134,196,170' : rand() < 0.5 ? '184,170,224' : '176,226,196';
    const grad = g.createRadialGradient(px(x), px(z), 0, px(x), px(z), r);
    grad.addColorStop(0, `rgba(${col},0.7)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(px(x), px(z), r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }

  // Graveyard earth and the maze's gravel.
  const patch = (x: number, z: number, rx: number, rz: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(px(x), px(z), rx * k, rz * k, 0, 0, Math.PI * 2);
    g.fill();
  };
  patch(-17.5, 0, 5, 9.5, 'rgba(150,180,160,0.55)');
  patch(17, 0, 5, 8.5, 'rgba(226,214,236,0.8)');
  patch(-28, 13, 5, 4, 'rgba(196,150,130,0.7)');
  // Lake shore.
  patch(LAKE.x, LAKE.z, LAKE.rx + 1.2, LAKE.rz + 1, 'rgba(214,206,170,1)');

  // Cobbled lane: dark edge, pale fill, then a scatter of cobbles.
  const segs: [THREE.Vector3, THREE.Vector3][] = [];
  for (const s of spaces) for (const n of s.next) segs.push([s.pos, spaces[n].pos]);
  // The front walk up to the porch, and little side paths.
  const walk: [number, number][][] = [
    [
      [0, 15],
      [0, 4.8],
    ],
    [
      [0, 9],
      [-5.6, 8],
    ],
    [
      [0, 7],
      [6.2, 8.4],
    ],
  ];
  for (const w of walk) segs.push([new THREE.Vector3(w[0][0], 0, w[0][1]), new THREE.Vector3(w[1][0], 0, w[1][1])]);
  const strokeAll = (width: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = width * k;
    for (const [a, b] of segs) {
      g.beginPath();
      g.moveTo(px(a.x), px(a.z));
      g.lineTo(px(b.x), px(b.z));
      g.stroke();
    }
  };
  strokeAll(3.4, '#9a8cbc');
  strokeAll(2.8, '#d9cfea');
  for (const [a, b] of segs) {
    const len = a.distanceTo(b);
    for (let i = 0; i < len * 7; i++) {
      const t = rand();
      const off = (rand() - 0.5) * 2.4;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const x = a.x + dx * t + (-dz / len) * off;
      const z = a.z + dz * t + (dx / len) * off;
      g.fillStyle = rand() < 0.5 ? 'rgba(184,172,214,0.85)' : 'rgba(240,234,250,0.9)';
      g.beginPath();
      g.ellipse(px(x), px(z), (0.18 + rand() * 0.14) * k, (0.14 + rand() * 0.1) * k, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function ground(spaces: Space[], rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const plain = new THREE.Mesh(new THREE.CircleGeometry(220, 48), toon(GRASS));
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

/** Soft blob texture for the ground mist. */
let mistTex: THREE.CanvasTexture | null = null;
function mistMaterial(): THREE.MeshBasicMaterial {
  if (!mistTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    for (const [x, y, r] of [
      [64, 64, 60],
      [40, 70, 34],
      [90, 58, 36],
    ]) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
    mistTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: mistTex, color: 0xf0eaff, transparent: true, opacity: 0.32, depthWrite: false });
}

/* ------------------------------------------------------------------ */
/* Animation state                                                     */
/* ------------------------------------------------------------------ */

interface Floater {
  obj: THREE.Object3D;
  move: (t: number, o: THREE.Object3D) => void;
}

const anim = {
  floaters: [] as Floater[],
  bats: [] as { b: Bird; cx: number; cz: number; r: number; y: number; speed: number; phase: number }[],
  glows: [] as THREE.Sprite[],
  pumpkinGlows: [] as THREE.Sprite[],
  windows: [] as THREE.Mesh[],
  smokes: [] as Smoke[],
  wisps: [] as { s: THREE.Sprite; x: number; y: number; z: number; phase: number }[],
  mists: [] as { m: THREE.Mesh; x: number; z: number; phase: number }[],
  vane: null as THREE.Object3D | null,
  door: null as THREE.Object3D | null,
  cryptGlow: null as THREE.Sprite | null,
  swing: null as THREE.Object3D | null,
  head: null as THREE.Object3D | null,
  tail: null as THREE.Object3D | null,
  jaw: null as THREE.Object3D | null,
  spray: null as THREE.Object3D | null,
  boat: null as THREE.Object3D | null,
  lantern: null as THREE.Sprite | null,
  moonGlow: null as THREE.Sprite | null,
};

/* ------------------------------------------------------------------ */
/* Scenery                                                             */
/* ------------------------------------------------------------------ */

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  for (const v of Object.values(anim)) if (Array.isArray(v)) v.length = 0;
  const rand = seeded(0x6057);
  scene.add(ground(spaces, rand));

  // Dusk: cool moonlight in place of the noon sun, and a lilac haze.
  scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) {
      o.color.set(0xe4dcff);
      o.groundColor.set(0x8a7ab8);
      o.intensity = 1.35;
    } else if (o instanceof THREE.DirectionalLight) {
      o.color.set(0xeae4ff);
      o.intensity = 1.8;
    }
  });
  scene.fog = new THREE.Fog(0x9d8cc8, 70, 210);
  const rim = new THREE.DirectionalLight(0xffb8d8, 0.55);
  rim.position.set(-20, 10, -30);
  scene.add(rim);

  const s = new THREE.Group();
  const zones: [number, number, number][] = [];
  const place = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0, r = 0): T => {
    put(s, o, x, 0, z, ry);
    if (r) zones.push([x, z, r]);
    return o;
  };

  // --- The manor and front garden ------------------------------------
  const house = place(manor(), MANOR.x, MANOR.z, 0, 7.5);
  zones.push([0, 5, 3]);
  anim.vane = house.userData.vane as THREE.Object3D;
  anim.windows.push(...(house.userData.flicker as THREE.Mesh[]));
  anim.lantern = house.userData.lantern as THREE.Sprite;
  for (const at of house.userData.smokeAt as THREE.Vector3[]) {
    const smoke = new Smoke(5, 0.4, 2.2, 0.35, 0xe6defa, new THREE.Vector3(0.6, 0, -0.4));
    smoke.group.position.set(MANOR.x + at.x, at.y, MANOR.z + at.z);
    scene.add(smoke.group);
    anim.smokes.push(smoke);
  }
  place(archway(), 0, 11.5, 0, 2.5);
  for (const z of [6.5, 9.5]) for (const x of [-1.9, 1.9]) place(gasLamp(anim.glows), x, z);
  // Jack-o'-lanterns lining the walk.
  for (const [x, z, sc] of [
    [-1.4, 13.3, 0.9],
    [1.5, 13.1, 1],
    [-1.3, 7, 0.8],
    [1.3, 10, 0.85],
    [-1.2, 5.6, 0.75],
    [1.25, 5.5, 0.8],
  ]) {
    const p = place(pumpkin(sc, true), x, z, x < 0 ? 0.3 : -0.3);
    anim.pumpkinGlows.push(p.userData.glow as THREE.Sprite);
  }
  place(wishingWell(), -6.2, 8, 0.3, 1.6);
  const swing = place(swingTree(), 7, 8.5, -0.3, 2);
  anim.swing = swing.userData.swing as THREE.Object3D;
  place(signpost([
    ['MANOR', 0.2],
    ['LAKE', -1.2],
    ['GRAVES', 2.6],
  ]), -3, 13.6, 0.4, 0.8);
  // Ornamental hedges framing the front of the house.
  for (const x of [-4.2, 4.2]) place(hedge(3.6, 0.9, 0.7), x, 4.4, 0);

  // --- Graveyard (west, inside the loop) ------------------------------
  const tomb = place(crypt(), -18.4, 0.2, Math.PI / 2, 2.8);
  anim.door = tomb.userData.door as THREE.Object3D;
  anim.cryptGlow = tomb.userData.glow as THREE.Sprite;
  const kitty = cat();
  put(tomb, kitty, -0.6, 3.15, 0.7);
  kitty.rotation.y = 0.4;
  anim.tail = kitty.userData.tail as THREE.Object3D;
  const graves = scatter(rand, spaces, {
    count: 22,
    extent: 24,
    clearance: 1.7,
    reject: (x, z) => x > -14 || x < -22 || z < -9 || z > 9 || Math.hypot(x + 18.4, z - 0.2) < 2.8,
  });
  graves.forEach(([x, z], i) => {
    const h = place(headstone(Math.floor(rand() * 4), i), x, z, Math.PI / 2 + (rand() - 0.5) * 0.5);
    h.rotation.z = (rand() - 0.5) * 0.18;
  });
  for (const [x, z, ry, len] of [
    [-17.6, -8.6, 0, 5],
    [-17.6, 8.6, 0, 5],
  ] as const)
    place(ironFence(len), x, z, ry);

  // --- Hedge maze (east, inside the loop) -----------------------------
  const fount = place(fountain(), 17.5, 0, 0, 2.2);
  anim.spray = fount.userData.spray as THREE.Object3D;
  for (const [x, z, len, ry] of [
    [15.2, -6.5, 4.6, 0],
    [19.2, -4.2, 3.4, Math.PI / 2],
    [14.6, -3.2, 2.6, Math.PI / 2],
    [20.2, 2.4, 3, Math.PI / 2],
    [15.8, 3.6, 3.4, 0],
    [18.6, 6, 3.2, 0],
    [14.2, 6.8, 2, Math.PI / 2],
  ] as const)
    place(hedge(len), x, z, ry);

  // --- Behind the manor -------------------------------------------------
  // Kept small: the camera looks over them at the back of the loop.
  for (const [x, z, sc, leaves] of [
    [-8, -8, 0.8, true],
    [-4.5, -7.5, 0.6, false],
  ] as const)
    place(gnarledTree(x * 3 + z, leaves), x, z, x, 1.2).scale.setScalar(sc);

  // --- Lake (north, outside the loop) ----------------------------------
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x8fb8f0 }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(LAKE.rx, LAKE.rz, 1);
  water.position.set(LAKE.x, 0.02, LAKE.z);
  s.add(water);
  zones.push([LAKE.x - 5, LAKE.z, 5.5], [LAKE.x + 5, LAKE.z, 5.5], [LAKE.x, LAKE.z, 5.5]);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 0.6;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.4 + rand() * 0.2, 10, 0.4, Math.PI * 1.8), new THREE.MeshBasicMaterial({ color: 0x9fe0b0 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(LAKE.x + Math.cos(a) * LAKE.rx * r, 0.05, LAKE.z + Math.sin(a) * LAKE.rz * r);
    s.add(pad);
    if (i % 3 === 0) {
      const lily = toonMesh(new THREE.ConeGeometry(0.16, 0.2, 5), 0xffb0d8, { emissive: 0x402030, outline: 0.01 });
      lily.rotation.x = Math.PI;
      lily.position.copy(pad.position).setY(0.15);
      s.add(lily);
    }
  }
  place(boathouse(), 9.2, -19.6, 0, 2.2);
  anim.boat = live(rowboat());
  s.add(anim.boat);

  // --- Greenhouse (north-west) ------------------------------------------
  const glass = place(greenhouse(), -31, -13, 0.6, 3.6);
  anim.jaw = glass.userData.jaw as THREE.Object3D;

  // --- Pumpkin patch (south-west) -----------------------------------------
  const crow = place(scarecrow(), -28.5, 12.5, 0.6, 1.2);
  anim.head = crow.userData.head as THREE.Object3D;
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.3 + rand() * 3;
    const x = -28.5 + Math.cos(a) * r;
    const z = 12.5 + Math.sin(a) * r * 0.8;
    const p = place(pumpkin(0.7 + rand() * 0.9, i % 5 === 0, [0xffa65c, 0xffbe7a, 0xfff0a8, 0xffd3b8][i % 4]), x, z, rand() * 6);
    if (p.userData.glow) {
      p.rotation.y = 0.3;
      anim.pumpkinGlows.push(p.userData.glow as THREE.Sprite);
    }
  }
  // Curly vines between the pumpkins.
  for (let i = 0; i < 10; i++) {
    const v = toonMesh(new THREE.TorusGeometry(0.3 + rand() * 0.3, 0.04, 4, 12, Math.PI * 1.4), 0x6fbf7a, { outline: false });
    v.rotation.set(-Math.PI / 2, 0, rand() * 6);
    v.position.set(-28.5 + (rand() - 0.5) * 7, 0.05, 12.5 + (rand() - 0.5) * 6);
    s.add(v);
  }

  // --- Spooky woods (north-east and round the back) -----------------------
  const trees = scatter(rand, spaces, {
    count: 34,
    extent: 46,
    clearance: 3,
    reject: (x, z) => {
      const d = Math.hypot(x / 1.25, z);
      if (d < 27) return true;
      if (z > 20) return true;
      if (Math.hypot(x - LAKE.x, (z - LAKE.z) * 2) < LAKE.rx * 1.25) return true;
      return zones.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r + 1.5);
    },
  });
  trees.forEach(([x, z], i) => {
    const t = place(gnarledTree(i + 3, i % 3 === 0), x, z, rand() * 6);
    t.scale.setScalar(1 + rand() * 0.8);
  });
  // Glowing toadstools, and a fairy ring out in the east.
  const shrooms = scatter(rand, spaces, {
    count: 40,
    extent: 34,
    clearance: 1.5,
    reject: (x, z) => zones.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r),
  });
  shrooms.forEach(([x, z], i) => place(toadstool([0xff9ec8, 0xb79cff, 0x9ff5d6, 0xfff0a8][i % 4]), x, z).scale.setScalar(0.8 + rand() * 0.9));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    place(toadstool(i % 2 ? 0xff9ec8 : 0xb79cff), 30 + Math.cos(a) * 2.4, 13 + Math.sin(a) * 2.4).scale.setScalar(1.3);
  }
  // Low iron fence along the front, broken where the lane comes in.
  for (const x of [-9, 9]) place(ironFence(11, 0.9), x, 19.8);

  scene.add(bake(s));

  // --- Sky: big moon, far hills, the odd cloud ----------------------------
  const moon = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff4d8, fog: false }));
  moon.position.set(-55, 70, -150);
  scene.add(moon);
  for (const [x, y, r] of [
    [-3, 4, 2.4],
    [4, -2, 1.8],
    [-5, -5, 1.2],
  ]) {
    const crater = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0xf2e2c0, fog: false }));
    crater.position.set(x, y, 11.6);
    crater.lookAt(crater.position.clone().multiplyScalar(2));
    moon.add(crater);
  }
  anim.moonGlow = glowSprite(0xfff0d0, 70, 0.35);
  (anim.moonGlow.material as THREE.SpriteMaterial).fog = false;
  anim.moonGlow.position.copy(moon.position);
  scene.add(anim.moonGlow);

  const hills = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.2;
    const r = 75 + rand() * 15;
    const h = toonMesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? 0x8a78bc : 0x7a69ac, { outline: false });
    h.scale.set(22 + rand() * 10, 9 + rand() * 9, 16);
    h.position.set(Math.cos(a) * r, -1, Math.sin(a) * r);
    h.rotation.y = -a;
    hills.add(h);
    // Pointy pines along the ridge.
    for (let j = 0; j < 4; j++) {
      const pine = toonMesh(new THREE.ConeGeometry(1.6, 6 + rand() * 4, 6), 0x6a5a9c, { outline: false });
      const off = (rand() - 0.5) * 30;
      pine.position.set(Math.cos(a) * (r - 6) - Math.sin(a) * off, 4 + rand() * 4, Math.sin(a) * (r - 6) + Math.cos(a) * off);
      hills.add(pine);
    }
  }
  scene.add(bake(hills));

  // --- Moving things ------------------------------------------------------
  // Bats circling the tower and the woods.
  for (let i = 0; i < 7; i++) {
    const b = bird(0x5d4a8a, 0x4a3d6b, 0x5d4a8a);
    b.group.scale.setScalar(0.8);
    scene.add(b.group);
    const tower = i < 4;
    anim.bats.push({
      b,
      cx: tower ? 3.9 : 26,
      cz: tower ? -2.6 : -12,
      r: tower ? 3 + i * 0.7 : 4 + (i - 4) * 1.5,
      y: tower ? 9.5 + i * 0.4 : 7 + i,
      speed: (i % 2 ? 1 : -1) * (0.9 + i * 0.1),
      phase: i * 1.9,
    });
  }

  // Friendly ghosts, each with its own haunt.
  const addGhost = (sc: number, move: Floater['move']) => {
    const gh = ghost(sc);
    scene.add(gh);
    anim.floaters.push({ obj: gh, move });
  };
  // Round and round the tower top.
  addGhost(0.9, (t, o) => {
    const a = t * 0.45;
    o.position.set(3.9 + Math.cos(a) * 3.4, 7.8 + Math.sin(t * 1.3) * 0.5, -2.6 + Math.sin(a) * 3.4);
    o.rotation.y = -a;
  });
  // Rising out of the graveyard and sinking back down again.
  addGhost(0.75, (t, o) => {
    const k = (t % 12) / 12;
    const up = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    o.position.set(-19.5 + Math.sin(t * 0.4) * 1.2, -1.2 + up * 3.2, -5 + Math.cos(t * 0.3) * 2);
    o.rotation.y = Math.PI / 2 + Math.sin(t) * 0.4;
    o.visible = up > 0.02;
  });
  // Drifting over the lake.
  addGhost(1.1, (t, o) => {
    o.position.set(LAKE.x + Math.sin(t * 0.21) * 7, 1.6 + Math.sin(t * 1.1) * 0.4, LAKE.z + Math.cos(t * 0.33) * 2.5);
    o.rotation.y = Math.sin(t * 0.21) * 0.8;
  });
  // Peekaboo behind the hedges.
  addGhost(0.7, (t, o) => {
    const k = Math.max(0, Math.sin(t * 0.8));
    o.position.set(19.8, 0.2 + k * 1.6, -4 + Math.sin(t * 0.17) * 2);
    o.rotation.y = -Math.PI / 2;
  });
  // Loafing in a dormer window.
  addGhost(0.55, (t, o) => {
    o.position.set(MANOR.x - 3, 6.6 + Math.sin(t * 1.6) * 0.15, MANOR.z + 3.4 + Math.max(0, Math.sin(t * 0.5)) * 0.6);
    o.rotation.y = Math.sin(t * 0.7) * 0.3;
  });

  // Will-o'-wisps bobbing about the graves and the woods.
  for (let i = 0; i < 26; i++) {
    const graveyard = i < 10;
    const a = rand() * Math.PI * 2;
    const x = graveyard ? -18 + (rand() - 0.5) * 8 : Math.cos(a) * (30 + rand() * 10);
    const z = graveyard ? (rand() - 0.5) * 16 : Math.sin(a) * (24 + rand() * 8);
    const sp = glowSprite(i % 3 ? WISP : 0xffb0e0, 0.9 + rand() * 0.6, 0.85);
    scene.add(sp);
    anim.wisps.push({ s: sp, x, y: 1 + rand() * 2, z, phase: rand() * 10 });
  }

  // Ground mist creeping about.
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mistMaterial());
    m.rotation.x = -Math.PI / 2;
    const sc = 10 + rand() * 12;
    m.scale.set(sc, sc * 0.6, 1);
    m.renderOrder = 3;
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 30;
    scene.add(m);
    anim.mists.push({ m, x: Math.cos(a) * r, z: Math.sin(a) * r * 0.8, phase: rand() * 10 });
  }
  // A few slow clouds across the moon.
  for (let i = 0; i < 3; i++) {
    const cl = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = toonMesh(new THREE.SphereGeometry(4 + j, 14, 10), 0xd8ccf4, { outline: false });
      puff.position.set(j * 5 - 5, Math.sin(j) * 1.5, 0);
      puff.castShadow = false;
      cl.add(puff);
    }
    cl.position.set(-80 + i * 50, 48 + i * 8, -120 - i * 10);
    scene.add(cl);
    anim.floaters.push({
      obj: cl,
      move: (t, o) => {
        o.position.x = ((-80 + i * 60 + t * 1.2 + 140) % 220) - 140;
      },
    });
  }
  // Silly stone pillar markers by the graveyard shortcut so it reads as a path.
  for (const z of [-7, 7]) {
    const post = toonMesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), STONE, { outline: 0.015 });
    post.position.set(-13.3, 0.7, z);
    scene.add(post);
    const cap = toonMesh(new THREE.SphereGeometry(0.24, 8, 6), BARK, { outline: 0.01 });
    cap.position.set(-13.3, 1.55, z);
    scene.add(cap);
  }
}

function updateScenery(t: number): void {
  for (const f of anim.floaters) f.move(t, f.obj);
  for (const f of anim.floaters) {
    const arms = f.obj.userData.arms as THREE.Object3D[] | undefined;
    if (arms) for (const a of arms) a.rotation.z = (a.userData.side as number) * (0.3 + Math.sin(t * 4 + f.obj.position.x) * 0.35);
  }
  for (const b of anim.bats) flyBird(b.b, t, b.cx, b.cz, b.r, b.y, b.speed, b.phase);
  for (const s of anim.smokes) s.update(t);
  // Gas lamps and pumpkins flicker on their own little rhythms.
  anim.glows.forEach((g, i) => (g.material.opacity = 0.65 + Math.sin(t * 9 + i * 2.3) * 0.08 + Math.sin(t * 23 + i) * 0.05));
  anim.pumpkinGlows.forEach((g, i) => g.scale.setScalar(1.3 + Math.sin(t * 7 + i * 1.7) * 0.12 + Math.sin(t * 17 + i) * 0.06));
  // Windows: one lights up and dims as if someone walks past with a candle.
  anim.windows.forEach((w, i) => {
    const m = w.material as THREE.MeshToonMaterial;
    const k = Math.max(0, Math.sin(t * 0.6 + i * 1.3));
    m.emissive.setRGB(0.5 * (0.6 + k * 0.4), 0.38 * (0.6 + k * 0.4), 0.08);
  });
  if (anim.lantern) anim.lantern.material.opacity = 0.75 + Math.sin(t * 11) * 0.1;
  if (anim.vane) anim.vane.rotation.y = Math.sin(t * 0.3) * 1.2 + Math.sin(t * 1.7) * 0.2;
  if (anim.door) {
    // The crypt door creaks open every so often.
    const k = (t % 14) / 14;
    anim.door.rotation.y = k > 0.7 ? -Math.sin(((k - 0.7) / 0.3) * Math.PI) * 1.1 : 0;
  }
  if (anim.cryptGlow) anim.cryptGlow.material.opacity = 0.35 + Math.sin(t * 2) * 0.12;
  if (anim.swing) anim.swing.rotation.x = Math.sin(t * 1.4) * 0.35;
  if (anim.head) anim.head.rotation.y = Math.sin(t * 0.35) * 0.9;
  if (anim.tail) anim.tail.rotation.z = Math.sin(t * 2.2) * 0.5;
  if (anim.jaw) {
    // Chomp, chomp... pause.
    const open = (t % 3) < 1.2 ? Math.abs(Math.sin(t * 6)) * 0.6 : 0.1;
    for (const lip of anim.jaw.children) lip.rotation.x = -(lip.userData.side as number) * open;
  }
  if (anim.spray) {
    for (const d of anim.spray.children) {
      const k = (t * 0.8 + (d.userData.k as number)) % 1;
      d.position.set(0, Math.sin(k * Math.PI) * 0.5 - k * 0.6, k * 1.2);
    }
  }
  if (anim.boat) {
    anim.boat.position.set(LAKE.x - 4 + Math.sin(t * 0.12) * 2, 0.02 + Math.sin(t * 1.3) * 0.05, LAKE.z + 1);
    anim.boat.rotation.set(Math.sin(t * 1.1) * 0.05, 0.8 + Math.sin(t * 0.12) * 0.3, Math.sin(t * 1.3) * 0.06);
  }
  for (const w of anim.wisps) {
    w.s.position.set(w.x + Math.sin(t * 0.5 + w.phase) * 1.2, w.y + Math.sin(t * 1.3 + w.phase) * 0.5, w.z + Math.cos(t * 0.4 + w.phase) * 1.2);
    w.s.material.opacity = 0.55 + Math.sin(t * 3 + w.phase) * 0.3;
  }
  for (const m of anim.mists) {
    m.m.position.set(m.x + Math.sin(t * 0.05 + m.phase) * 4, 0.25, m.z + Math.cos(t * 0.04 + m.phase) * 3);
    (m.m.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 0.3 + m.phase) * 0.08;
  }
}

export function hollowHill(): BoardDef {
  const { spaces, startId } = layout();
  return {
    id: 'manor',
    name: 'Hollow Hill Manor',
    spaces,
    startId,
    song: manorTheme,
    sky: [0x6a58a8, 0xf4b8d0],
    buildScenery,
    updateScenery,
    happening: {
      title: 'Boo!',
      description: 'A mischievous ghost whisks you off to somewhere else on the grounds!',
      style: 'warp',
    },
  };
}
