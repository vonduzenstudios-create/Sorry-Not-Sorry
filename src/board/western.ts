import * as THREE from 'three';
import { westernTheme } from '../audio/songs/western';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
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
  const door = toonMesh(new THREE.BoxGeometry(1, 1, 0.1), WOOD, { outline: 0.02 });
  door.position.set(0, 1.1, 1.95);
  s.add(door);
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

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  spinners.length = 0;
  weeds.length = 0;
  scene.add(ground(spaces));

  // Cacti around the outside of the trail, never on the camera side.
  spaces.forEach((s, i) => {
    if (i >= 40 || i % 3 !== 2) return;
    const out = s.pos.clone().setY(0).normalize();
    if (out.z > 0.2) return;
    const c = cactus(1.6 + (i % 4) * 0.4);
    c.position.copy(s.pos).addScaledVector(out, 2.6).setY(0);
    c.rotation.y = i;
    scene.add(c);
  });

  // Town square in the middle.
  const town = saloon();
  town.position.set(-1, 0, -2);
  scene.add(town);
  const tower = waterTower();
  tower.position.set(-6.5, 0, -4);
  scene.add(tower);
  const mill = windmill();
  mill.position.set(4.5, 0, -5.5);
  scene.add(mill);
  const mine = mineEntrance();
  mine.position.set(15, 0, -3);
  mine.rotation.y = -0.4;
  scene.add(mine);
  const pen = fence(6);
  pen.position.set(-2, 0, 4.5);
  scene.add(pen);

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

  for (let i = 0; i < 3; i++) {
    const w = tumbleweed();
    w.userData.lane = 20 + i * 4;
    w.userData.offset = i * 23;
    scene.add(w);
    weeds.push(w);
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
