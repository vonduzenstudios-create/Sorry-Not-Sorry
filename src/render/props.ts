import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Palette } from './palette';
import { toonMesh } from './toon';

/** Five-pointed star, extruded and bevelled. */
export function makeStar(size = 1, color: number = Palette.yellow): THREE.Mesh {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? size : size * 0.46;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: size * 0.3,
    bevelEnabled: true,
    bevelThickness: size * 0.12,
    bevelSize: size * 0.1,
    bevelSegments: 3,
  });
  geo.center();
  geo.computeVertexNormals();
  return toonMesh(geo, color, { emissive: 0x332200, outline: 0.04 * size });
}

/** Canvas texture for one die face. Pip layout matches a real die. */
function dieFace(value: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  const pips: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
  };
  g.fillStyle = value === 1 ? '#ff7a7a' : '#2b2440';
  for (const [x, y] of pips[value]) {
    g.beginPath();
    g.arc(x * 128, y * 128, value === 1 ? 18 : 12, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Rounded six-sided die. Board dice will use a 1-10 block later; this one is for show. */
export function makeDie(size = 1): THREE.Mesh {
  const geo = new RoundedBoxGeometry(size, size, size, 4, size * 0.16);
  // Box face order: +x, -x, +y, -y, +z, -z -> opposite faces sum to 7.
  const values = [3, 4, 1, 6, 2, 5];
  const base = toonMesh(geo, 0xffffff, { outline: 0.04 * size });
  base.material = values.map((v) => {
    const m = (base.material as THREE.MeshToonMaterial).clone();
    m.map = dieFace(v);
    return m;
  });
  return base;
}

export function makeCoin(radius = 0.4): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, radius * 0.25, 28);
  const coin = toonMesh(geo, Palette.yellow, { emissive: 0x221100, outline: 0.025 });
  // Stand it up; YXZ order lets callers spin it around world Y with rotation.y.
  coin.rotation.order = 'YXZ';
  coin.rotation.x = Math.PI / 2;
  return coin;
}

/**
 * Placeholder pawn used until the real characters land in milestone 2:
 * a capsule body, a round head and two eyes, tinted with the player color.
 */
export function makePawn(color: number): THREE.Group {
  const pawn = new THREE.Group();
  const body = toonMesh(new THREE.CapsuleGeometry(0.38, 0.5, 6, 16), color);
  body.position.y = 0.63;
  const head = toonMesh(new THREE.SphereGeometry(0.36, 24, 16), Palette.cream);
  head.position.y = 1.35;
  const eyeGeo = new THREE.SphereGeometry(0.055, 12, 8);
  for (const side of [-1, 1]) {
    const eye = toonMesh(eyeGeo, Palette.ink, { outline: false });
    eye.position.set(side * 0.12, 1.4, 0.32);
    eye.scale.y = 1.5;
    pawn.add(eye);
  }
  pawn.add(body, head);
  return pawn;
}

/** Round grassy island with a sandy rim, floating on nothing. */
export function makeIsland(radius = 7): THREE.Group {
  const island = new THREE.Group();
  const top = toonMesh(new THREE.CylinderGeometry(radius, radius * 0.96, 0.6, 48), Palette.grass, { outline: 0.06 });
  top.position.y = -0.3;
  const rim = toonMesh(new THREE.CylinderGeometry(radius * 0.97, radius * 0.6, 1.6, 48), Palette.sand, { outline: 0.06 });
  rim.position.y = -1.4;
  const root = toonMesh(new THREE.ConeGeometry(radius * 0.6, 3, 48), Palette.peach, { outline: 0.06 });
  root.position.y = -3.7;
  root.rotation.x = Math.PI;
  island.add(top, rim, root);
  return island;
}

/** Puffy cloud made of a few overlapping spheres. */
export function makeCloud(scale = 1): THREE.Group {
  const cloud = new THREE.Group();
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [0.9, -0.2, 0.1, 0.75],
    [-0.9, -0.2, 0, 0.7],
    [0.3, 0.45, -0.2, 0.7],
  ];
  for (const [x, y, z, r] of puffs) {
    const puff = toonMesh(new THREE.SphereGeometry(r, 20, 14), 0xffffff, { outline: 0.05 });
    puff.castShadow = false;
    puff.position.set(x, y, z);
    cloud.add(puff);
  }
  cloud.scale.setScalar(scale);
  return cloud;
}
