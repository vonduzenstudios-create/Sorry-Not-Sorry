import * as THREE from 'three';
import { spaceTheme } from '../audio/songs/space';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { BoardBuilder } from './graph';
import type { BoardDef, Space } from './types';

/**
 * Star Station: floating walkway platforms circling a spinning space
 * station. A locked airlock corridor cuts across the east side, a
 * maintenance tube across the west.
 */
function layout(): { spaces: Space[]; startId: number } {
  const b = new BoardBuilder()
    .loop(
      [
        [0, 15],
        [12, 14],
        [21, 8],
        [24, -2],
        [19, -11],
        [8, -15],
        [-3, -12],
        [-12, -15],
        [-21, -9],
        [-24, 2],
        [-18, 11],
        [-9, 15],
      ],
      'S B R B I B B H B* B ' + 'B R B T B V B H* B I ' + 'B B R H B B* B P R B ' + 'B H B* B I B V R B B',
    )
    // Airlock corridor, sealed until you have a key.
    .branch(4, 16, [[11, 5], [10, -5]], 'B R H B* R', true)
    // Maintenance tube on the west side.
    .branch(24, 36, [[-12, -5], [-11, 6]], 'B I B* H R');
  return { spaces: b.spaces, startId: b.loopId(0) };
}

const METAL = 0xd8d4ee;
const METAL_DARK = 0xa9a3cf;
const GLOW = 0x9ff3ff;

const spinning: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[] = [];
const blinkers: THREE.Mesh[] = [];
const drifters: { obj: THREE.Object3D; base: THREE.Vector3; phase: number }[] = [];

/** Thousands of stars on a big sphere around the board. */
function starfield(): THREE.Points {
  const n = 1500;
  const pos = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  // Fixed-seed scatter so every peer sees the same sky (not that it matters for play).
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(300 + rand() * 80);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }));
}

function platforms(spaces: Space[]): THREE.Group {
  const g = new THREE.Group();
  const deckGeo = new THREE.CylinderGeometry(1.75, 1.45, 0.5, 6);
  const glowGeo = new THREE.TorusGeometry(1.5, 0.06, 6, 6);
  const deck = toon(METAL);
  const glow = new THREE.MeshBasicMaterial({ color: GLOW });
  for (const s of spaces) {
    const d = new THREE.Mesh(deckGeo, deck);
    d.position.set(s.pos.x, -0.26 + (s.id % 5) * 0.003, s.pos.z);
    d.rotation.y = Math.PI / 6;
    d.receiveShadow = true;
    g.add(d);
    const ring = new THREE.Mesh(glowGeo, glow);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = Math.PI / 6;
    ring.position.set(s.pos.x, -0.52, s.pos.z);
    g.add(ring);
  }
  return g;
}

function station(): THREE.Group {
  const st = new THREE.Group();
  const core = toonMesh(new THREE.CylinderGeometry(1.6, 1.6, 5, 16), METAL, { outline: 0.05 });
  core.position.y = 1.5;
  const domeTop = toonMesh(new THREE.SphereGeometry(1.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), Palette.sky, { outline: 0.05 });
  domeTop.position.y = 4;
  const base = toonMesh(new THREE.CylinderGeometry(2.4, 1.2, 1.2, 16), METAL_DARK, { outline: 0.05 });
  base.position.y = -1.2;
  st.add(core, domeTop, base);

  // Big habitat ring on spokes, slowly turning.
  const wheel = new THREE.Group();
  wheel.position.y = 1.6;
  const ring = toonMesh(new THREE.TorusGeometry(5, 0.55, 10, 40), METAL, { outline: 0.05 });
  ring.rotation.x = Math.PI / 2;
  wheel.add(ring);
  for (let i = 0; i < 4; i++) {
    const spoke = toonMesh(new THREE.CylinderGeometry(0.16, 0.16, 5, 8), METAL_DARK, { outline: 0.02 });
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff0a8 }));
    win.position.set(Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5);
    win.rotation.y = -a + Math.PI / 2;
    wheel.add(win);
  }
  st.add(wheel);
  spinning.push({ obj: wheel, axis: 'y', speed: 0.25 });

  // Antenna with a blinking light.
  const mast = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), METAL_DARK, { outline: 0.015 });
  mast.position.y = 6.2;
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: Palette.coral }));
  light.position.y = 7.4;
  st.add(mast, light);
  blinkers.push(light);
  return st;
}

function solarArray(): THREE.Group {
  const s = new THREE.Group();
  const beam = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 8), METAL_DARK, { outline: 0.02 });
  beam.rotation.z = Math.PI / 2;
  s.add(beam);
  for (const x of [-2, 2]) {
    const panel = toonMesh(new THREE.BoxGeometry(3, 0.08, 1.8), 0x7fa8ff, { outline: 0.03 });
    panel.position.x = x;
    s.add(panel);
    for (let i = -1; i <= 1; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 1.8), new THREE.MeshBasicMaterial({ color: 0xd8e6ff }));
      line.position.set(x + i * 0.75, 0, 0);
      s.add(line);
    }
  }
  return s;
}

function planet(r: number, color: number, ringColor?: number): THREE.Group {
  const p = new THREE.Group();
  const body = toonMesh(new THREE.SphereGeometry(r, 32, 20), color, { outline: r * 0.02 });
  p.add(body);
  if (ringColor) {
    const ring = toonMesh(new THREE.TorusGeometry(r * 1.6, r * 0.12, 4, 48), ringColor, { outline: false });
    ring.rotation.x = Math.PI / 2.4;
    ring.scale.z = 0.25;
    p.add(ring);
  }
  return p;
}

function satellite(): THREE.Group {
  const s = new THREE.Group();
  const body = toonMesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), Palette.butter, { outline: 0.02 });
  s.add(body);
  for (const x of [-0.9, 0.9]) {
    const wing = toonMesh(new THREE.BoxGeometry(0.9, 0.05, 0.5), 0x7fa8ff, { outline: 0.015 });
    wing.position.x = x;
    s.add(wing);
  }
  const dish = toonMesh(new THREE.ConeGeometry(0.35, 0.25, 12, 1, true), METAL, { outline: 0.015 });
  dish.position.y = 0.5;
  s.add(dish);
  return s;
}

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  spinning.length = 0;
  blinkers.length = 0;
  drifters.length = 0;
  scene.add(starfield());
  scene.add(platforms(spaces));

  const st = station();
  st.position.set(-1, 0, -1);
  scene.add(st);

  for (const [x, z, ry] of [
    [30, -6, 0.3],
    [-31, -2, -0.3],
    [6, -26, 0],
  ] as const) {
    const arr = solarArray();
    arr.position.set(x, 1, z);
    arr.rotation.y = ry;
    scene.add(arr);
    spinning.push({ obj: arr, axis: 'x', speed: 0.15 });
  }

  const big = planet(14, 0xffc2d6, Palette.lavender);
  big.position.set(-60, 8, -110);
  scene.add(big);
  const moon = planet(6, Palette.mint);
  moon.position.set(70, 22, -120);
  scene.add(moon);
  const tiny = planet(3, Palette.butter, Palette.peach);
  tiny.position.set(28, 14, -60);
  scene.add(tiny);
  spinning.push({ obj: big, axis: 'y', speed: 0.05 });

  // Satellites and asteroids bob around the edges.
  const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
  const things: [THREE.Object3D, number, number, number][] = [
    [satellite(), 28, 6, -18],
    [satellite(), -26, 5, -20],
    [toonMesh(rockGeo, 0xb8a6c8, { outline: 0.03 }), 30, 1, 8],
    [toonMesh(rockGeo, 0xc8b6d8, { outline: 0.03 }), -30, 0, 10],
    [toonMesh(rockGeo, 0xb8a6c8, { outline: 0.03 }), 14, -1, -22],
    [toonMesh(rockGeo, 0xd0c0e0, { outline: 0.03 }), -15, 0.5, -24],
  ];
  things.forEach(([obj, x, y, z], i) => {
    obj.position.set(x, y, z);
    obj.scale.setScalar(1 + (i % 3) * 0.4);
    scene.add(obj);
    drifters.push({ obj, base: obj.position.clone(), phase: i * 1.7 });
  });
}

function updateScenery(t: number): void {
  for (const s of spinning) s.obj.rotation[s.axis] = t * s.speed;
  for (const b of blinkers) b.visible = t % 1.2 < 0.6;
  for (const d of drifters) {
    d.obj.position.y = d.base.y + Math.sin(t * 0.8 + d.phase) * 0.6;
    d.obj.rotation.set(t * 0.2 + d.phase, t * 0.3, 0);
  }
}

export function starStation(): BoardDef {
  const { spaces, startId } = layout();
  return {
    id: 'space',
    name: 'Star Station',
    spaces,
    startId,
    song: spaceTheme,
    sky: [0x8f78d2, 0x231f52],
    buildScenery,
    updateScenery,
    happening: {
      title: 'Teleporter glitch!',
      description: 'You get beamed to another part of the station!',
      style: 'warp',
    },
  };
}
