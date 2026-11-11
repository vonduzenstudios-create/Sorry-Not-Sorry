import * as THREE from 'three';
import { jungleTheme } from '../audio/songs/jungle';
import { Palette } from '../render/palette';
import { makeCloud } from '../render/props';
import { toon, toonMesh } from '../render/toon';
import { bird, flyBird, instanced, scatter, seeded, Smoke, type Bird } from './decor';
import { BoardBuilder } from './graph';
import {
  BARK_DARK,
  bigLeaf,
  butterfly,
  canopyTree,
  column,
  crate,
  crocodile,
  fallenColumn,
  fern,
  fireBowl,
  karst,
  LEAF,
  lilyPad,
  mapTable,
  MOSS,
  MOSS_DARK,
  mushroom,
  pyramid,
  ROPE,
  rubble,
  ruinArch,
  ruinTower,
  serpentStatue,
  STONE_DARK,
  STONE_MID,
  stoneHead,
  swingingMonkey,
  tent,
  vine,
} from './jungleProps';
import { palmTree } from './pirateProps';
import type { BoardDef, Space } from './types';
import { bake, box, campfire, cyl, live, put, signPlane } from './westernProps';

/**
 * Jade Temple: a jungle trail looping round a great stepped pyramid. A river
 * tumbles off the northern cliffs and winds down the west side, so the trail
 * crosses it on plank bridges; a rope-bridge shortcut cuts across it too. On
 * the east side a sealed ruin path (locked) runs past a giant stone head.
 * Explorers have pitched camp by the causeway to the temple stairs.
 */
function layout(): { spaces: Space[]; startId: number } {
  const b = new BoardBuilder()
    .loop(
      [
        [0, 16],
        [10, 16],
        [19, 12],
        [24, 3],
        [21, -8],
        [12, -14.5],
        [0, -16.5],
        [-12, -14.5],
        [-21, -8],
        [-24, 3],
        [-19, 12],
        [-10, 16],
      ],
      'S B B I B R B H B B* ' + 'B R B T B H B* B V B ' + 'I B R B H B* B P B R ' + 'B B H B* V B I B R B',
    )
    // The sealed ruin path past the stone head: a locked shortcut.
    .branch(6, 15, [[13, 5], [12, -5]], 'B H B* R I B B', true)
    // The rope bridge over the river on the west side.
    .branch(30, 38, [[-17, -1], [-12, 5]], 'B I B* H B R B');
  return { spaces: b.spaces, startId: b.loopId(0) };
}

const GROUND = 128;
const GROUND_PX = 2048;
const GRASS = 0x9edca2;
const TEMPLE: [number, number] = [0, -2.5];
const CLIFF_Z = -33;

type Path = [number, number][];

/** The river, from the foot of the waterfall to the southern edge. */
const RIVER_PTS: Path = [
  [-8, -31],
  [-8.6, -24],
  [-10, -17],
  [-13, -9],
  [-15.2, -1],
  [-15, 6],
  [-13.4, 13],
  [-14.5, 21],
  [-18, 32],
  [-22, 50],
  [-26, 66],
];
const RIVER_HALF = 2.3;
const riverCurve = new THREE.CatmullRomCurve3(
  RIVER_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal',
);
const riverSamples = riverCurve.getSpacedPoints(400);

/** Distance from (x, z) to the river's centre line. */
function riverDist(x: number, z: number): number {
  let best = Infinity;
  for (const p of riverSamples) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
  return Math.sqrt(best);
}

/** Stone causeways (painted into the ground texture). */
const ROADS: Path[] = [
  // From the start up to the temple stairs.
  [
    [0, 15],
    [0, 9],
    [0, 4],
  ],
  // Over to the explorers' camp.
  [
    [0, 9.5],
    [4, 10],
    [8, 9.6],
  ],
  // North out of the plaza toward the waterfall.
  [
    [-3, -8],
    [-3.6, -14],
    [-3.4, -24],
  ],
];

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Fixed-seed ground texture: jungle floor, the stone plaza, the river and the trail. */
function groundTexture(spaces: Space[], rand: () => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = GROUND_PX;
  const g = c.getContext('2d')!;
  const k = GROUND_PX / GROUND;
  const px = (v: number) => (v + GROUND / 2) * k;
  g.fillStyle = hex(GRASS);
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Soft blotches: deep shade under the canopy, sunny clearings, bare earth.
  for (let i = 0; i < 110; i++) {
    const x = (rand() * 2 - 1) * 56;
    const z = (rand() * 2 - 1) * 56;
    const r = (2 + rand() * 7) * k;
    const grad = g.createRadialGradient(px(x), px(z), 0, px(x), px(z), r);
    const roll = rand();
    const col = roll < 0.45 ? '128,204,146' : roll < 0.8 ? '184,234,172' : '222,206,156';
    grad.addColorStop(0, `rgba(${col},0.7)`);
    grad.addColorStop(0.7, `rgba(${col},0.4)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(px(x), px(z), r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }

  const stroke = (path: Path, width: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = width * k;
    g.beginPath();
    path.forEach(([x, z], i) => (i ? g.lineTo(px(x), px(z)) : g.moveTo(px(x), px(z))));
    g.stroke();
  };

  // The river: sandy banks, deep water, a lighter current down the middle.
  const river: Path = riverSamples.map((p) => [p.x, p.z]);
  stroke(river, RIVER_HALF * 2 + 1.6, '#e6d6a4');
  stroke(river, RIVER_HALF * 2, '#6cc4e4');
  stroke(river, RIVER_HALF * 1.1, '#86d4ee');
  // Plunge pool at the foot of the falls.
  for (const [r, col] of [
    [5.4, '#e6d6a4'],
    [4.6, '#6cc4e4'],
    [3, '#86d4ee'],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(px(-8), px(-30), r * 1.3 * k, r * k, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Stone plaza round the temple, laid in flagstones with a few gone to grass.
  const [tx, tz] = TEMPLE;
  const PW = 10;
  const PD = 8.6;
  g.save();
  g.beginPath();
  g.ellipse(px(tx), px(tz), PW * k, PD * k, 0, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#d6c09c';
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);
  const tile = 1.4;
  for (let x = tx - PW; x < tx + PW; x += tile) {
    for (let z = tz - PD; z < tz + PD; z += tile) {
      const roll = rand();
      g.fillStyle = roll < 0.12 ? hex(GRASS) : roll < 0.4 ? '#e6d2ae' : roll < 0.55 ? '#c4d8a4' : '#eedcbc';
      g.fillRect(px(x) + 2, px(z) + 2, tile * k - 4, tile * k - 4);
    }
  }
  g.restore();

  // Flagstone causeways.
  for (const r of ROADS) stroke(r, 3.6, '#c8b088');
  for (const r of ROADS) stroke(r, 3.1, '#e6d2ae');
  for (const r of ROADS) {
    for (let i = 1; i < r.length; i++) {
      const [ax, az] = r[i - 1];
      const [bx, bz] = r[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0.7; d < len; d += 1.1) {
        const x = ax + ((bx - ax) * d) / len;
        const z = az + ((bz - az) * d) / len;
        g.strokeStyle = 'rgba(196,170,130,0.7)';
        g.lineWidth = 2;
        const nx = (-(bz - az) / len) * 1.5;
        const nz = ((bx - ax) / len) * 1.5;
        g.beginPath();
        g.moveTo(px(x - nx), px(z - nz));
        g.lineTo(px(x + nx), px(z + nz));
        g.stroke();
      }
    }
  }

  // The trail: packed earth linking every space.
  const links: Path[] = [];
  for (const s of spaces) for (const n of s.next) links.push([[s.pos.x, s.pos.z], [spaces[n].pos.x, spaces[n].pos.z]]);
  for (const l of links) stroke(l, 3.1, '#b99a6c');
  for (const s of spaces) {
    g.fillStyle = '#b99a6c';
    g.beginPath();
    g.arc(px(s.pos.x), px(s.pos.z), 1.9 * k, 0, Math.PI * 2);
    g.fill();
  }
  for (const l of links) stroke(l, 2.6, '#dcc08e');
  for (const s of spaces) {
    g.fillStyle = '#dcc08e';
    g.beginPath();
    g.arc(px(s.pos.x), px(s.pos.z), 1.65 * k, 0, Math.PI * 2);
    g.fill();
  }

  // Leaf litter and petals everywhere.
  const litter = ['rgba(120,196,140,0.55)', 'rgba(220,244,200,0.55)', 'rgba(255,194,214,0.5)', 'rgba(196,170,120,0.4)', 'rgba(255,240,168,0.5)'];
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = litter[i % litter.length];
    const s = 1 + rand() * 2.5;
    g.fillRect(rand() * GROUND_PX, rand() * GROUND_PX, s, s * (0.6 + rand()));
  }
  // Fade the edges back to plain grass so the texture meets the outer plain.
  const edge = g.createRadialGradient(GROUND_PX / 2, GROUND_PX / 2, GROUND_PX * 0.4, GROUND_PX / 2, GROUND_PX / 2, GROUND_PX * 0.5);
  edge.addColorStop(0, 'rgba(158,220,162,0)');
  edge.addColorStop(1, hex(GRASS));
  g.fillStyle = edge;
  g.fillRect(0, 0, GROUND_PX, GROUND_PX);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
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

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

/** Wavy white streaks on a clear background; scrolled to make water flow. */
function streakTexture(vertical: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const rand = seeded(vertical ? 0xfa11 : 0x41fe);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineCap = 'round';
  for (let i = 0; i < (vertical ? 26 : 14); i++) {
    const x = rand() * 128;
    const y = rand() * 256;
    const len = vertical ? 60 + rand() * 90 : 14 + rand() * 26;
    g.lineWidth = vertical ? 3 + rand() * 5 : 2 + rand() * 3;
    g.beginPath();
    for (let s = 0; s <= 8; s++) {
      const yy = y + (s / 8) * len;
      const xx = x + Math.sin(s * 0.9 + i) * (vertical ? 1.5 : 4);
      for (const off of [0, -256]) if (s === 0) g.moveTo(xx, yy + off);
      g.lineTo(xx, yy);
    }
    g.stroke();
    // Wrap the bottom of long streaks round to the top.
    if (y + len > 256) {
      g.beginPath();
      g.moveTo(x, y - 256);
      g.lineTo(x, y + len - 256);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A ribbon over the painted river that carries scrolling ripples. */
function riverRibbon(): { mesh: THREE.Mesh; tex: THREE.CanvasTexture } {
  const n = 240;
  const pts = riverCurve.getSpacedPoints(n);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const len = riverCurve.getLength();
  pts.forEach((p, i) => {
    const t = riverCurve.getTangentAt(Math.min(1, i / n));
    const nx = -t.z;
    const nz = t.x;
    const w = RIVER_HALF * 0.9;
    pos.push(p.x - nx * w, 0.03, p.z - nz * w, p.x + nx * w, 0.03, p.z + nz * w);
    const v = ((i / n) * len) / 6;
    uv.push(0, v, 1, v);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tex = streakTexture(false);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  );
  return { mesh, tex };
}

/** The waterfall: a curtain of scrolling streaks over a blue sheet, with spray at the foot. */
function waterfall(h: number, w: number): { group: THREE.Group; tex: THREE.CanvasTexture; spray: Smoke[] } {
  const g = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(0x7ccdee));
  sheet.position.y = h / 2;
  const tex = streakTexture(true);
  tex.repeat.set(w / 3, h / 6);
  const streaks = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  streaks.position.set(0, h / 2, 0.02);
  // The lip where the river pours over.
  const lip = toonMesh(new THREE.CylinderGeometry(0.35, 0.35, w + 0.2, 10), 0xa8e4f8, { outline: 0.03 });
  lip.rotation.z = Math.PI / 2;
  lip.position.set(0, h, 0.1);
  g.add(sheet, streaks, lip);
  const spray: Smoke[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new Smoke(5, 0.55, 1.8, 0.5 + i * 0.1, 0xffffff, new THREE.Vector3((i - 1) * 0.4, 0, 0.6));
    s.group.position.set((i - 1) * w * 0.32, 0.1, 0.6);
    g.add(s.group);
    spray.push(s);
  }
  return { group: g, tex, spray };
}

/** Plank decking (and rope rails) wherever a trail link crosses the river. */
function bridges(spaces: Space[]): THREE.Group {
  const g = new THREE.Group();
  const plankGeo = new THREE.BoxGeometry(2.7, 0.12, 0.3);
  const planks: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  for (const s of spaces) {
    for (const nId of s.next) {
      const a = s.pos;
      const b = spaces[nId].pos;
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      dir.normalize();
      const yaw = Math.atan2(dir.x, dir.z);
      q.setFromAxisAngle(up, yaw);
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      let run: THREE.Vector3[] = [];
      const flush = () => {
        if (run.length > 1) {
          const from = run[0];
          const to = run[run.length - 1];
          for (const sgn of [-1, 1]) {
            const off = side.clone().multiplyScalar(1.35 * sgn);
            for (const p of [from, to]) if (!spaces.some((sp) => Math.hypot(sp.pos.x - p.x, sp.pos.z - p.z) < 1.3)) put(g, cyl(0.08, 0.1, 1.1, BARK_DARK, 6, 0.015), p.x + off.x, 0.55, p.z + off.z);
            const mid = from.clone().add(to).multiplyScalar(0.5).add(off);
            const rope = put(g, cyl(0.035, 0.035, from.distanceTo(to), ROPE, 5, false), mid.x, 0.85, mid.z);
            rope.rotation.set(Math.PI / 2, 0, 0);
            rope.rotation.order = 'YXZ';
            rope.rotation.y = yaw;
          }
        }
        run = [];
      };
      for (let d = 0; d <= len; d += 0.34) {
        const p = a.clone().addScaledVector(dir, d);
        if (riverDist(p.x, p.z) < RIVER_HALF + 0.7) {
          const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.08 + Math.sin(d * 7) * 0.015, p.z), q, one);
          planks.push(m);
          run.push(p);
        } else flush();
      }
      flush();
    }
  }
  if (planks.length) {
    const mesh = new THREE.InstancedMesh(plankGeo, toon(0xd9a878), planks.length);
    planks.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    g.add(live(mesh));
  }
  return g;
}

/** Long mossy cliff made of stacked stone blocks, with vines hanging down. */
function jungleCliff(len: number, h: number, rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const bands = [0xa8c49a, 0xbcd0a8, 0x9cba90, 0xb4caa0];
  let x = -len / 2;
  while (x < len / 2) {
    const w = 3 + rand() * 3;
    const hh = h * (0.75 + rand() * 0.4);
    const layers = 3;
    const z0 = rand() * 1.4 - 0.7;
    for (let i = 0; i < layers; i++) {
      const inset = i * 0.35;
      put(g, box(w - inset, hh / layers, 5 - inset, bands[(i + Math.floor(x * 7)) & 3], 0.05), x + w / 2, (i + 0.5) * (hh / layers), z0);
    }
    put(g, box(w - 0.5, 0.4, 4.2, rand() < 0.5 ? MOSS : MOSS_DARK, 0.04), x + w / 2, hh + 0.15, z0);
    if (rand() < 0.7) put(g, vine(hh * (0.3 + rand() * 0.4), Math.floor(rand() * 9)), x + w * rand(), hh, z0 + 2.4);
    x += w * 0.82;
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type Flyer = Bird & { cx: number; cz: number; r: number; y: number; speed: number; phase: number };

const anim = {
  flames: [] as THREE.Object3D[],
  glows: [] as THREE.Sprite[],
  smokes: [] as Smoke[],
  monkeys: [] as { pivot: THREE.Object3D; phase: number; speed: number }[],
  birds: [] as Flyer[],
  butterflies: [] as { obj: ReturnType<typeof butterfly>; cx: number; cz: number; phase: number }[],
  clouds: [] as { obj: THREE.Object3D; x: number; speed: number }[],
  idol: null as THREE.Object3D | null,
  idolGlow: null as THREE.Sprite | null,
  croc: null as THREE.Group | null,
  river: null as THREE.CanvasTexture | null,
  falls: null as THREE.CanvasTexture | null,
};

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  for (const v of Object.values(anim)) if (Array.isArray(v)) v.length = 0;
  const rand = seeded(0x1a6e);
  scene.add(ground(spaces, rand));

  // Humid, green-tinged haze toward the horizon.
  scene.fog = new THREE.Fog(0xdcf2dc, 90, 240);
  const warm = new THREE.DirectionalLight(0xfff0b0, 0.45);
  warm.position.set(20, 14, -25);
  scene.add(warm);

  const s = new THREE.Group();
  const zones: [number, number, number][] = [];
  const place = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0, r = 0): T => {
    put(s, o, x, 0, z, ry);
    if (r) zones.push([x, z, r]);
    return o;
  };

  // --- The temple and its plaza --------------------------------------
  const [tx, tz] = TEMPLE;
  const temple = pyramid();
  place(temple.group, tx, tz, 0, 8.5);
  anim.idol = temple.idol;
  anim.idolGlow = temple.glows[0];
  anim.glows.push(...temple.glows.slice(1));
  anim.flames.push(...temple.flames);
  // Columns standing round the plaza, a couple of them toppled.
  const cols: [number, number, boolean][] = [
    [-8.6, -6, false],
    [-9.4, -1, true],
    [-8.4, 3.6, false],
    [8.6, -6, true],
    [9.3, -1, false],
    [8.4, 3.6, false],
    [-4.5, -9.8, false],
    [4.5, -9.8, true],
  ];
  cols.forEach(([x, z, broken], i) => place(column(broken ? 3.2 : 3.4, broken, i), x, z, i, 1));
  place(fallenColumn(3.2), -6.4, -9.6, 0.5, 2);
  place(fallenColumn(2.6), 10.4, 1.8, 1.4, 1.6);
  place(rubble(rand, 6), 7, -8.4, 0, 1.5);
  place(rubble(rand, 4), -7.2, 5.6, 0, 1.2);
  // Serpent guardians on the north side.
  place(serpentStatue(), -3.5, -11.2, 0.4, 1.2);
  place(serpentStatue(), 3.5, -11.2, -0.4, 1.2);

  // --- The causeway and the gate arch --------------------------------
  zones.push([0, 9, 2.2], [0, 6, 2.2], [0, 12, 2.2], [4, 10, 1.6]);
  const sign = signPlane('JADE TEMPLE', 3.6, 0.62, '#e8a080', '#fff6e6', 30);
  place(ruinArch(3.8, 3.2, sign), 0, 9.2);
  zones.push([-2.4, 9.2, 1], [2.4, 9.2, 1]);
  for (const x of [-2.6, 2.6]) {
    const b = fireBowl();
    place(b.group, x, 12.2);
    anim.flames.push(b.flame);
    anim.glows.push(b.glow);
  }

  // --- Explorers' camp (south-east, inside the loop) -----------------
  place(tent(), 9.4, 7.4, -0.5, 2.4);
  place(tent(0xbfe0f0), 12.6, 9.6, -0.9, 2);
  const fire = campfire();
  place(fire.group, 6.4, 11.4, 0, 1.6);
  anim.flames.push(fire.flame);
  anim.glows.push(fire.glow);
  anim.smokes.push(fire.smoke);
  place(mapTable(), 11.4, 12.4, 0.2, 1);
  place(crate(), 6.4, 7.4, 0.3, 0.6);
  place(crate(0.55), 7.1, 8.1, 0.9);
  const stacked = place(crate(0.5), 6.35, 7.4, 0.6);
  stacked.position.y = 0.7;
  // Flagpole with a pennant.
  put(s, cyl(0.05, 0.06, 3.2, BARK_DARK, 6, 0.012), 7.6, 1.6, 6.2);
  put(s, box(0.8, 0.45, 0.04, Palette.coral, 0.01), 8.0, 2.95, 6.2);

  // --- The sealed ruin path and the stone head (east) -----------------
  place(stoneHead(), 18.4, 1.2, -0.45, 3);
  place(column(3, false, 3), 10, 6.6, 0, 1);
  place(column(3, true, 4), 10.4, -2.4, 0, 1);
  place(column(3, false, 5), 15.6, -7.6, 0, 1);
  place(rubble(rand, 5), 16, 7.6, 0, 1.4);
  place(fallenColumn(2.8), 18.6, -5.4, 0.7, 1.6);

  // --- The river side (west) ----------------------------------------
  // Lily pads on the slower stretches.
  for (let i = 0; i < 22; i++) {
    const p = riverCurve.getPointAt(0.1 + rand() * 0.55);
    const t = riverCurve.getTangentAt(0.5);
    const off = (rand() * 2 - 1) * RIVER_HALF * 0.8;
    const x = p.x + -t.z * off;
    const z = p.z + t.x * off;
    if (spaces.some((sp) => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 1.8)) continue;
    const pad = place(lilyPad(0.3 + rand() * 0.25, rand() < 0.3), x, z, rand() * 6);
    pad.position.y = 0.06;
  }
  // Reeds and rocks along the banks.
  for (let i = 0; i < 40; i++) {
    const u = rand();
    const p = riverCurve.getPointAt(u * 0.85);
    const t = riverCurve.getTangentAt(u * 0.85);
    const sgn = rand() < 0.5 ? -1 : 1;
    const off = (RIVER_HALF + 0.4 + rand() * 0.5) * sgn;
    const x = p.x - t.z * off;
    const z = p.z + t.x * off;
    if (spaces.some((sp) => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 2)) continue;
    if (rand() < 0.6) {
      for (let j = 0; j < 3; j++) {
        const reed = put(s, cyl(0.03, 0.04, 0.9 + rand() * 0.6, LEAF, 4, false), x + (rand() - 0.5) * 0.4, 0.5, z + (rand() - 0.5) * 0.4);
        reed.rotation.z = (rand() - 0.5) * 0.3;
      }
    } else {
      const r = put(s, toonMesh(new THREE.DodecahedronGeometry(0.4, 0), rand() < 0.5 ? STONE_MID : STONE_DARK, { outline: 0.02 }), x, 0.15, z);
      r.scale.set(1, 0.6, 1);
    }
  }
  s.add(bridges(spaces));

  // --- North: the cliffs and the waterfall -----------------------------
  const cliff = jungleCliff(150, 10, rand);
  cliff.position.set(0, 0, CLIFF_Z - 2.5);
  s.add(cliff);
  const falls = waterfall(10, 4.4);
  falls.group.position.set(-8, 0, CLIFF_Z + 0.15);
  scene.add(falls.group);
  anim.falls = falls.tex;
  anim.smokes.push(...falls.spray);
  for (const [x, z] of [
    [-11.6, -29.5],
    [-4.6, -29.2],
    [-12.8, -27.4],
  ]) {
    const r = place(toonMesh(new THREE.DodecahedronGeometry(0.8, 0), STONE_MID, { outline: 0.03 }), x, z, rand() * 3);
    r.position.y = 0.3;
    r.scale.set(1, 0.7, 1);
  }
  zones.push([-8, -29, 6]);
  // The overgrown watchtower in the north-east.
  place(ruinTower(), 13, -24.5, -0.2, 4);
  place(ruinArch(3, 2.8), -24, -21, 0.5, 3);
  place(rubble(rand, 6), 22, -21, 0, 2);
  place(serpentStatue(), 4.5, -23, -0.3, 1.4);

  // --- West and east fringes -----------------------------------------
  place(ruinArch(3.2, 3), -31, 4, Math.PI / 2 - 0.2, 3);
  place(stoneHead(), 32, -10, -0.9, 3.5).scale.setScalar(0.8);
  place(rubble(rand, 5), 30, 14, 0, 2);

  // --- Horizon: karst pillars and far hills ----------------------------
  for (const [x, z, w, h] of [
    [-40, -46, 5, 22],
    [-28, -52, 4, 28],
    [-14, -58, 6, 20],
    [10, -56, 4.5, 26],
    [26, -50, 5.5, 18],
    [42, -42, 4, 24],
    [54, -20, 5, 16],
    [-54, -18, 4.5, 18],
    [-50, 22, 5, 14],
    [52, 24, 4, 12],
  ]) {
    place(karst(w, h, rand), x, z, rand() * 3);
  }
  const far = [0x9fd4b0, 0xb0d8c8, 0x8fcaa8, 0xb8dcc0];
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * 0.95 + (i / 25) * Math.PI * 1.1 + (rand() - 0.5) * 0.08;
    const r = 120 + rand() * 40;
    const w = 12 + rand() * 16;
    const h = 14 + rand() * 24;
    const m = put(new THREE.Group(), toonMesh(new THREE.ConeGeometry(w, h, 7), far[i % 4], { outline: false }), 0, h / 2, 0);
    place(m, Math.cos(a) * r, Math.sin(a) * r, rand() * 3);
  }

  // --- The jungle -----------------------------------------------------
  const nearRoad = (x: number, z: number) =>
    ROADS.some((r) =>
      r.slice(1).some(([bx, bz], i) => {
        const [ax, az] = r[i];
        const dx = bx - ax;
        const dz = bz - az;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(x - ax - dx * u, z - az - dz * u) < 2.2;
      }),
    );
  const wet = (x: number, z: number) => riverDist(x, z) < RIVER_HALF + 1 || (z < CLIFF_Z + 3.5 && z > CLIFF_Z - 6);
  const blocked = (x: number, z: number) => wet(x, z) || nearRoad(x, z) || zones.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r);
  // Tall things must not stand just in front of (camera side of) a space.
  const screens = (x: number, z: number, reach: number) => spaces.some((sp) => Math.abs(sp.pos.x - x) < 3.2 && z - sp.pos.z > 0 && z - sp.pos.z < reach);
  const pick = (n: number, clearance: number, extent = 50, reject?: (x: number, z: number) => boolean) =>
    scatter(rand, spaces, { count: n, extent, clearance, reject: (x, z) => blocked(x, z) || !!reject?.(x, z) });

  // Big canopy trees, thickest outside the loop.
  for (const [x, z] of pick(70, 3.6, 52, (x, z) => screens(x, z, 8) || z > 22 || Math.hypot(x / 24, z / 16.5) < 0.85)) {
    const sz = 0.9 + rand() * 0.6;
    place(canopyTree(sz, Math.floor(rand() * 5), rand), x, z, rand() * 6);
    zones.push([x, z, 2.2 * sz]);
    // Some trees have a monkey swinging from them.
    if (anim.monkeys.length < 5 && rand() < 0.4 && Math.abs(x) < 32 && z > -28) {
      const m = swingingMonkey(1.6, [0xb98a62, 0xc8a07a, 0x9a7a62][anim.monkeys.length % 3]);
      m.position.set(x + 1.1 * sz, 3.4 * sz - 0.1, z + 0.7 * sz);
      scene.add(m);
      anim.monkeys.push({ pivot: m, phase: rand() * 6, speed: 1.4 + rand() * 0.6 });
    }
  }
  // Palms dotted through the loop and along the river.
  for (const [x, z] of pick(16, 3.8, 30, (x, z) => screens(x, z, 6))) {
    place(palmTree(2.6 + rand() * 1.4), x, z, rand() * 6);
    zones.push([x, z, 1.4]);
  }
  for (const [x, z] of pick(40, 3.1, 50)) {
    place(bigLeaf(0.7 + rand() * 0.5, rand), x, z, rand() * 6);
    zones.push([x, z, 1.2]);
  }
  for (const [x, z] of pick(70, 2.1, 50)) {
    place(fern(0.7 + rand() * 0.6, rand() < 0.5 ? LEAF : MOSS_DARK), x, z, rand() * 6);
    zones.push([x, z, 0.8]);
  }
  for (const [x, z] of pick(22, 2, 40)) {
    const caps = [Palette.coral, Palette.lavender, Palette.butter, 0xff9ab8];
    place(mushroom(0.8 + rand() * 0.8, caps[Math.floor(rand() * caps.length)]), x, z, rand() * 6);
  }
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  for (const [x, z] of pick(18, 2.6)) {
    const r = place(toonMesh(rockGeo, rand() < 0.5 ? STONE_MID : 0xb8c4a8, { outline: 0.03 }), x, z, rand() * 6);
    const sc = 0.6 + rand() * 1;
    r.scale.set(sc, sc * 0.7, sc);
    r.position.y = 0.2 * sc;
    if (rand() < 0.5) put(s, box(sc * 0.8, 0.06, sc * 0.6, MOSS, 0.01), x, 0.42 * sc, z);
  }
  // Undergrowth as instanced batches.
  scene.add(instanced(new THREE.ConeGeometry(0.22, 0.7, 5), LEAF, pick(160, 2.1, 54).map(([x, z]) => ({ x, y: 0.3, z, s: 0.6 + rand() * 0.7, ry: rand() * 6 }))));
  scene.add(instanced(new THREE.ConeGeometry(0.2, 0.5, 4), 0x8fd49a, pick(120, 2.1, 54).map(([x, z]) => ({ x, y: 0.22, z, s: 0.6 + rand() * 0.6, ry: rand() * 6 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.45, 10, 8), 0x86d09a, pick(50, 2.6, 54).map(([x, z]) => ({ x, y: 0.3, z, s: 0.6 + rand() * 0.7, ry: rand() * 6, sy: 0.75 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.15, 8, 6), Palette.rose, pick(50, 2.1).map(([x, z]) => ({ x, y: 0.12, z, s: 0.8 + rand() * 0.5 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.14, 8, 6), Palette.butter, pick(40, 2.1).map(([x, z]) => ({ x, y: 0.1, z, s: 0.8 + rand() * 0.5 }))));
  scene.add(instanced(new THREE.SphereGeometry(0.14, 8, 6), Palette.lavender, pick(30, 2.1).map(([x, z]) => ({ x, y: 0.1, z, s: 0.8 + rand() * 0.5 }))));

  // Trees on top of the cliff.
  for (let x = -70; x < 70; x += 4 + rand() * 4) {
    if (Math.abs(x + 8) < 4) continue;
    const t = canopyTree(0.8 + rand() * 0.5, Math.floor(rand() * 5), rand);
    put(s, t, x, 10 + rand(), CLIFF_Z - 3 - rand() * 3, rand() * 6);
  }

  scene.add(bake(s));

  // --- Moving things ---------------------------------------------------
  const ribbon = riverRibbon();
  scene.add(ribbon.mesh);
  anim.river = ribbon.tex;
  anim.croc = crocodile();
  scene.add(anim.croc);
  const flyers: [number, number, number][] = [
    [Palette.coral, 0x5fc0ff, Palette.butter],
    [0x4a4060, 0x4a4060, 0xffa040],
    [0x5fd39a, Palette.butter, Palette.coral],
    [Palette.sky, Palette.butter, Palette.ink],
  ];
  flyers.forEach(([body, wing, beak], i) => {
    const b = bird(body, wing, beak);
    b.group.scale.setScalar(1.2);
    scene.add(b.group);
    anim.birds.push({ ...b, cx: [-14, 16, 0, 26][i], cz: [-20, -20, 0, 8][i], r: 5 + i * 2.5, y: 9 + i * 1.2, speed: [-0.35, 0.3, 0.22, -0.28][i], phase: i * 1.7 });
  });
  const wingColors = [Palette.rose, Palette.butter, 0x8fd8ff, Palette.lavender, 0xffb070];
  for (let i = 0; i < 10; i++) {
    const b = butterfly(wingColors[i % wingColors.length]);
    scene.add(b.group);
    const [cx, cz] = [
      [6, 12],
      [-4, 7],
      [12, -6],
      [-10, -8],
      [16, 4],
      [-18, 4],
      [3, -12],
      [-6, 19],
      [20, 16],
      [-20, -14],
    ][i];
    anim.butterflies.push({ obj: b, cx, cz, phase: i * 1.3 });
  }
  for (let i = 0; i < 6; i++) {
    const c = makeCloud(2 + rand() * 1.5);
    c.position.set(0, 26 + rand() * 10, -70 - rand() * 40);
    scene.add(c);
    anim.clouds.push({ obj: c, x: (rand() * 2 - 1) * 120, speed: 0.5 + rand() * 0.5 });
  }
}

function updateScenery(t: number): void {
  if (anim.idol) {
    anim.idol.position.y = 0.1 + Math.sin(t * 1.6) * 0.06;
    anim.idol.rotation.y = Math.sin(t * 0.7) * 0.25;
  }
  if (anim.idolGlow) {
    anim.idolGlow.material.opacity = 0.55 + Math.sin(t * 2.2) * 0.2;
    anim.idolGlow.scale.setScalar(3 + Math.sin(t * 2.2) * 0.4);
  }
  anim.flames.forEach((f, i) => {
    f.scale.set(1, 0.85 + Math.sin(t * 14 + i) * 0.12 + Math.sin(t * 23 + i * 2) * 0.06, 1);
    f.rotation.y = t * 2 + i;
  });
  anim.glows.forEach((g, i) => (g.material.opacity = 0.5 + Math.sin(t * 9 + i) * 0.08 + Math.sin(t * 13 + i * 2) * 0.05));
  for (const s of anim.smokes) s.update(t);
  if (anim.river) anim.river.offset.y = -t * 0.35;
  if (anim.falls) anim.falls.offset.y = t * 1.2;
  // The croc cruises up and down the river, nosing along the current.
  if (anim.croc) {
    const k = (t * 0.012) % 2;
    const u = 0.12 + (k < 1 ? k : 2 - k) * 0.6;
    const p = riverCurve.getPointAt(u);
    const tan = riverCurve.getTangentAt(u);
    const dir = k < 1 ? 1 : -1;
    anim.croc.position.set(p.x - tan.z * 0.8 * dir, 0.02 + Math.sin(t * 2) * 0.03, p.z + tan.x * 0.8 * dir);
    anim.croc.rotation.y = Math.atan2(tan.x * dir, tan.z * dir) + Math.sin(t * 3) * 0.08;
  }
  for (const m of anim.monkeys) m.pivot.rotation.z = Math.sin(t * m.speed + m.phase) * 0.7;
  for (const b of anim.birds) flyBird(b, t, b.cx, b.cz, b.r, b.y, b.speed, b.phase);
  for (const b of anim.butterflies) {
    const a = t * 0.5 + b.phase;
    const g = b.obj.group;
    g.position.set(b.cx + Math.sin(a) * 2.2 + Math.sin(a * 2.3) * 0.6, 1.1 + Math.sin(t * 2.2 + b.phase) * 0.35, b.cz + Math.sin(a * 0.8) * 1.6);
    g.rotation.y = Math.atan2(Math.cos(a) * 2.2, Math.cos(a * 0.8) * 1.3);
    const flap = Math.sin(t * 18 + b.phase) * 0.9;
    for (const w of b.obj.wings) w.rotation.z = flap * (w.userData.side as number);
  }
  for (const c of anim.clouds) c.obj.position.x = ((c.x + t * c.speed + 150) % 300) - 150;
}

export function jadeTemple(): BoardDef {
  const { spaces, startId } = layout();
  return {
    id: 'jungle',
    name: 'Jade Temple',
    spaces,
    startId,
    song: jungleTheme,
    sky: [0x86d0f0, 0xf4f6c8],
    buildScenery,
    updateScenery,
    happening: {
      title: 'Monkey business!',
      description: 'A troop of monkeys flings you through the treetops!',
      style: 'launch',
    },
  };
}

