import * as THREE from 'three';
import { Palette } from '../render/palette';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, toonMesh } from '../render/toon';
import { glowSprite } from './decor';

/*
 * Prop builders for Star Station. Each returns a group in its own local
 * space; space.ts places them and drives the animation. Anything with a
 * moving part hangs it off userData so the board's update can find it.
 */

export const METAL = 0xd8d4ee;
export const METAL_DARK = 0xa9a3cf;
export const HULL = 0x8f88bf;
export const GLOW = 0x9ff3ff;

const basic = (color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color });

/**
 * Bakes positioned placeholder meshes into one geometry, so a lattice of
 * struts costs one draw call instead of dozens.
 */
export function merged(parts: THREE.Object3D[]): THREE.BufferGeometry {
  return mergeGeometries(
    parts.map((m) => {
      m.updateMatrix();
      return (m as THREE.Mesh).geometry.clone().applyMatrix4(m.matrix);
    }),
  );
}

/** Deck plating: big panels with seams, rivets and the odd hazard stripe. */
export function plateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7d74b4';
  g.fillRect(0, 0, 256, 256);
  // Alternate panel shades so the floor reads as tiles, not a flat sheet.
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#776eae' : '#857cbc';
      g.fillRect(i * 128 + 4, j * 128 + 4, 120, 120);
    }
  }
  g.strokeStyle = '#635b9c';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 250);
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.moveTo(0, 128);
  g.lineTo(256, 128);
  g.stroke();
  // Inner panel detail on one tile: a grille.
  g.lineWidth = 4;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.moveTo(150, 152 + k * 18);
    g.lineTo(234, 152 + k * 18);
    g.stroke();
  }
  g.fillStyle = '#a69fd6';
  for (const [x, y] of [
    [14, 14], [114, 14], [14, 114], [114, 114],
    [142, 14], [242, 14], [142, 114], [242, 114],
    [14, 142], [114, 142], [14, 242], [114, 242],
  ]) {
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Round floor window looking down into space. */
export function skylight(r: number): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, '#3a3180');
  grad.addColorStop(1, '#161339');
  x.fillStyle = grad;
  x.fillRect(0, 0, 128, 128);
  let s = 11;
  const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = i % 5 === 0 ? '#ffd6ec' : '#ffffff';
    x.globalAlpha = 0.5 + rnd() * 0.5;
    x.fillRect(rnd() * 128, rnd() * 128, 1.5 + rnd() * 1.5, 1.5 + rnd() * 1.5);
  }
  x.globalAlpha = 0.25;
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.ellipse(44, 40, 26, 9, -0.6, 0, Math.PI * 2);
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: tex }));
  glass.rotation.x = -Math.PI / 2;
  glass.position.y = 0.01;
  const frame = toonMesh(new THREE.TorusGeometry(r, 0.14, 6, 32), METAL, { outline: 0.02 });
  frame.rotation.x = Math.PI / 2;
  frame.position.y = 0.05;
  g.add(glass, frame);
  const bars: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.08, 0.12));
    bar.rotation.y = (i / 4) * Math.PI;
    bar.position.y = 0.04;
    bars.push(bar);
  }
  g.add(toonMesh(merged(bars), METAL, { outline: false }));
  return g;
}

let poolTex: THREE.CanvasTexture | null = null;
/** Flat pool of light lying on the floor (floodlights, doorways). */
export function lightPool(color: number, r: number, opacity = 0.35): THREE.Mesh {
  if (!poolTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    poolTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Reusable rocket. Origin at the base of the engine bell. */
export function rocket(): THREE.Group {
  const r = new THREE.Group();
  const body = toonMesh(new THREE.CylinderGeometry(0.85, 0.95, 4.6, 20), Palette.cream, { outline: 0.04 });
  body.position.y = 3.1;
  const nose = toonMesh(new THREE.ConeGeometry(0.85, 2, 20), Palette.coral, { outline: 0.04 });
  nose.position.y = 6.4;
  const tip = toonMesh(new THREE.SphereGeometry(0.16, 8, 6), Palette.butter, { outline: 0.015 });
  tip.position.y = 7.45;
  const bell = toonMesh(new THREE.CylinderGeometry(0.45, 0.75, 0.8, 16, 1, true), HULL, { outline: 0.03 });
  bell.position.y = 0.4;
  r.add(body, nose, tip, bell);
  for (const y of [1.3, 4.6]) {
    const band = toonMesh(new THREE.CylinderGeometry(0.97, 0.97, 0.28, 20), Palette.violet, { outline: 0.02 });
    band.position.y = y;
    r.add(band);
  }
  for (const y of [3.6, 2.6]) {
    const port = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14), METAL_DARK, { outline: 0.015 });
    port.rotation.x = Math.PI / 2;
    port.position.set(0, y, 0.86);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), basic(GLOW));
    glass.position.set(0, y, 0.93);
    r.add(port, glass);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const fin = toonMesh(new THREE.BoxGeometry(0.12, 1.6, 1.1), Palette.coral, { outline: 0.02 });
    fin.position.set(Math.sin(a) * 1.1, 1.2, Math.cos(a) * 1.1);
    fin.rotation.y = a;
    r.add(fin);
  }
  // Exhaust: a hot core and a softer plume, scaled by the board update.
  const flame = new THREE.Group();
  const core = glowSprite(0xfff2b8, 2.2, 1);
  core.position.y = -0.6;
  const plume = glowSprite(0xffa0c8, 3.6, 0.8);
  plume.position.y = -1.8;
  const tail = glowSprite(0x9ff3ff, 3, 0.5);
  tail.position.y = -3.2;
  flame.add(core, plume, tail);
  flame.visible = false;
  r.add(flame);
  r.userData.flame = flame;
  return r;
}

/** Launch pad with a lattice service tower behind it. */
export function launchPad(): THREE.Group {
  const g = new THREE.Group();
  const pad = toonMesh(new THREE.CylinderGeometry(2.6, 2.9, 0.4, 8), HULL, { outline: 0.03 });
  pad.position.y = 0.2;
  const ring = toonMesh(new THREE.TorusGeometry(2.1, 0.12, 6, 8), Palette.butter, { outline: false });
  ring.rotation.x = Math.PI / 2;
  ring.rotation.z = Math.PI / 8;
  ring.position.y = 0.42;
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), basic(0x6f679f));
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = 0.41;
  g.add(pad, ring, scorch);
  // Hazard lights round the pad.
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), basic(Palette.coral));
    l.position.set(Math.cos(a) * 2.7, 0.45, Math.sin(a) * 2.7);
    g.add(l);
    lights.push(l);
  }
  g.userData.lights = lights;

  // Service tower: four posts and cross braces.
  const tower = new THREE.Group();
  tower.position.set(0, 0.4, -2.6);
  const postGeo = new THREE.BoxGeometry(0.16, 9, 0.16);
  const posts = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z]) => {
    const p = new THREE.Mesh(postGeo);
    p.position.set(x, 4.5, z);
    return p;
  });
  tower.add(toonMesh(merged(posts), Palette.coral, { outline: 0.015 }));
  const braceGeo = new THREE.BoxGeometry(1.3, 0.1, 0.1);
  const braces: THREE.Mesh[] = [];
  for (let y = 1; y < 9; y += 1.4) {
    for (const [x, z, ry] of [[0, -0.6, 0], [0, 0.6, 0], [0.6, 0, Math.PI / 2], [-0.6, 0, Math.PI / 2]] as const) {
      const b = new THREE.Mesh(braceGeo);
      b.position.set(x, y, z);
      b.rotation.y = ry;
      braces.push(b);
    }
  }
  tower.add(toonMesh(merged(braces), METAL, { outline: false }));
  const arm = toonMesh(new THREE.BoxGeometry(0.5, 0.3, 1.6), METAL_DARK, { outline: 0.015 });
  arm.position.set(0, 5.5, 1.3);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), basic(Palette.coral));
  cap.position.y = 9.2;
  tower.add(arm, cap);
  g.add(tower);
  g.userData.beacon = cap;
  return g;
}

/** Glass greenhouse dome full of glowing alien plants. */
export function greenhouse(): THREE.Group {
  const g = new THREE.Group();
  const base = toonMesh(new THREE.CylinderGeometry(2.9, 3.1, 0.45, 24), METAL, { outline: 0.03 });
  base.position.y = 0.22;
  const soil = toonMesh(new THREE.CylinderGeometry(2.6, 2.6, 0.1, 24), 0x8ad8a8, { outline: false });
  soil.position.y = 0.48;
  g.add(base, soil);

  const plants = new THREE.Group();
  const stemGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 6);
  const bulbGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const spots: [number, number, number, number][] = [
    [-1.2, 0.6, 1.4, Palette.rose],
    [0.9, -1.1, 1.8, 0xff9fd8],
    [1.4, 0.8, 1.1, Palette.butter],
    [-0.5, -1.5, 1.2, 0x9ff3ff],
    [0.1, 0.2, 2.2, 0xc8a8ff],
    [-1.7, -0.6, 0.9, Palette.peach],
  ];
  for (const [x, z, h, c] of spots) {
    const stem = toonMesh(stemGeo, Palette.green, { outline: 0.01 });
    stem.scale.y = h;
    stem.position.set(x, 0.5 + h / 2, z);
    stem.rotation.z = x * 0.06;
    const bulb = toonMesh(bulbGeo, c, { emissive: c, outline: 0.015 });
    (bulb.material as THREE.MeshToonMaterial).emissiveIntensity = 0.35;
    bulb.position.set(x + Math.sin(x * 0.06) * -h * 0.5 * 0, 0.5 + h + 0.15, z);
    bulb.scale.setScalar(0.8 + h * 0.2);
    plants.add(stem, bulb);
  }
  // Big leafy fronds and squat mushrooms.
  const leafGeo = new THREE.SphereGeometry(0.5, 10, 6);
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(leafGeo);
    leaf.scale.set(0.5, 0.25, 1.2);
    leaf.position.set(Math.cos(a) * 2, 0.7, Math.sin(a) * 2);
    leaf.rotation.set(0.4, -a + Math.PI / 2, 0);
    leaves.push(leaf);
  }
  g.add(toonMesh(merged(leaves), Palette.grass, { outline: 0.012 }));
  for (const [x, z, s] of [[0.9, 1.6, 1], [1.8, -0.3, 0.7], [-0.4, 1.7, 0.6]]) {
    const cap = toonMesh(new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), Palette.violet, { outline: 0.012 });
    cap.position.set(x, 0.5 + 0.45 * s, z);
    cap.scale.setScalar(s);
    const stalk = toonMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 6), Palette.cream, { outline: false });
    stalk.position.set(x, 0.5 + 0.22 * s, z);
    stalk.scale.setScalar(s);
    plants.add(cap, stalk);
  }
  g.add(plants);
  g.userData.plants = plants;

  const glassMat = toon(0xc8f6ff, { transparent: true, opacity: 0.28 });
  glassMat.depthWrite = false;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.75, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
  dome.position.y = 0.45;
  dome.renderOrder = 2;
  g.add(dome);
  const ribGeo = new THREE.TorusGeometry(2.75, 0.06, 5, 28, Math.PI);
  const frame: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(ribGeo);
    rib.position.y = 0.45;
    rib.rotation.y = (i / 4) * Math.PI;
    frame.push(rib);
  }
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(2.75 * Math.cos(0.6), 0.06, 5, 28));
  hoop.rotation.x = Math.PI / 2;
  hoop.position.y = 0.45 + 2.75 * Math.sin(0.6);
  frame.push(hoop);
  g.add(toonMesh(merged(frame), METAL, { outline: false }));
  const glow = glowSprite(0xb8ffd8, 5, 0.35);
  glow.position.y = 1.4;
  g.add(glow);
  g.userData.glow = glow;
  // Airlock door facing +z.
  const door = toonMesh(new THREE.BoxGeometry(1.1, 1.4, 0.8), METAL, { outline: 0.02 });
  door.position.set(0, 0.95, 2.7);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1), basic(GLOW));
  doorGlow.position.set(0, 0.9, 3.11);
  g.add(door, doorGlow);
  return g;
}

/** Shipping container with ribbed sides. */
export function container(color: number): THREE.Group {
  const g = new THREE.Group();
  const box = toonMesh(new THREE.BoxGeometry(2.4, 1.1, 1.1), color, { outline: 0.025 });
  g.add(box);
  const ribGeo = new THREE.BoxGeometry(0.06, 1.0, 1.16);
  const ribs: THREE.Mesh[] = [];
  for (let i = -3; i <= 3; i++) {
    const rib = new THREE.Mesh(ribGeo);
    rib.position.x = i * 0.32;
    ribs.push(rib);
  }
  g.add(new THREE.Mesh(merged(ribs), toon(new THREE.Color(color).multiplyScalar(0.85).getHex())));
  return g;
}

/** Cargo crane: post, jib and a crate on a cable that winches up and down. */
export function crane(): THREE.Group {
  const g = new THREE.Group();
  const post = toonMesh(new THREE.CylinderGeometry(0.22, 0.3, 5, 10), Palette.butter, { outline: 0.02 });
  post.position.y = 2.5;
  const jibPivot = new THREE.Group();
  jibPivot.position.y = 5;
  const jib = toonMesh(new THREE.BoxGeometry(4, 0.3, 0.3), Palette.butter, { outline: 0.02 });
  jib.position.x = 1.4;
  const cab = toonMesh(new THREE.BoxGeometry(0.8, 0.7, 0.7), METAL, { outline: 0.02 });
  cab.position.set(-0.3, -0.1, 0);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), basic(GLOW));
  win.position.set(-0.3, 0, 0.36);
  jibPivot.add(jib, cab, win);
  const hook = new THREE.Group();
  hook.position.x = 3;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), basic(Palette.ink));
  const crate = toonMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), Palette.peach, { outline: 0.02 });
  hook.add(cable, crate);
  jibPivot.add(hook);
  g.add(post, jibPivot);
  g.userData.jib = jibPivot;
  g.userData.cable = cable;
  g.userData.crate = crate;
  return g;
}

/** Cluster of fuel spheres on legs, joined by pipes. */
export function fuelTanks(): THREE.Group {
  const g = new THREE.Group();
  const spots: [number, number, number][] = [
    [0, 0, 1.2],
    [2.2, 0.6, 0.9],
    [-1.6, 1.4, 0.8],
  ];
  const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 5);
  const legs: THREE.Mesh[] = [];
  for (const [x, z, r] of spots) {
    const h = r + 0.5;
    const ball = toonMesh(new THREE.SphereGeometry(r, 20, 14), Palette.cream, { outline: 0.03 });
    ball.position.set(x, h, z);
    const band = toonMesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, r * 0.3, 20), Palette.coral, { outline: false });
    band.position.copy(ball.position);
    g.add(ball, band);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const leg = new THREE.Mesh(legGeo);
      leg.scale.y = h;
      leg.position.set(x + Math.cos(a) * r * 0.7, h / 2, z + Math.sin(a) * r * 0.7);
      legs.push(leg);
    }
  }
  g.add(toonMesh(merged(legs), HULL, { outline: false }));
  const pipeGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
  for (const [a, b] of [[0, 1], [0, 2]]) {
    const p = new THREE.Vector3(spots[a][0], 0.35, spots[a][1]);
    const q = new THREE.Vector3(spots[b][0], 0.35, spots[b][1]);
    const pipe = toonMesh(pipeGeo, METAL_DARK, { outline: 0.012 });
    pipe.scale.y = p.distanceTo(q);
    pipe.position.copy(p).lerp(q, 0.5);
    pipe.lookAt(q);
    pipe.rotateX(Math.PI / 2);
    g.add(pipe);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), basic(Palette.yellow));
  light.position.set(0, 2.95, 0);
  g.add(light);
  g.userData.light = light;
  return g;
}

/** Big radar dish on a lattice mast. The dish group turns. */
export function radar(): THREE.Group {
  const g = new THREE.Group();
  const base = toonMesh(new THREE.CylinderGeometry(1.2, 1.6, 0.8, 12), HULL, { outline: 0.03 });
  base.position.y = 0.4;
  const mast = toonMesh(new THREE.CylinderGeometry(0.25, 0.4, 4, 10), METAL, { outline: 0.025 });
  mast.position.y = 2.8;
  g.add(base, mast);
  const head = new THREE.Group();
  head.position.y = 4.8;
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.7;
  // Bottom cap of a sphere makes a bowl; lift it so its lowest point is the pivot.
  const bowl = new THREE.SphereGeometry(2.6, 24, 8, 0, Math.PI * 2, Math.PI - 0.75, 0.75);
  bowl.translate(0, 2.6, 0);
  const dish = toonMesh(bowl, Palette.cream, { outline: false });
  (dish.material as THREE.Material).side = THREE.DoubleSide;
  const hub = toonMesh(new THREE.SphereGeometry(0.4, 10, 8), METAL_DARK, { outline: 0.02 });
  const feed = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), METAL_DARK, { outline: false });
  feed.position.y = 0.65;
  const horn = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), basic(Palette.coral));
  horn.position.y = 1.35;
  tilt.add(dish, hub, feed, horn);
  head.add(tilt);
  g.add(head);
  g.userData.head = head;
  g.userData.horn = horn;
  return g;
}

/** Stubby cargo freighter. Faces +x. */
export function freighter(): THREE.Group {
  const f = new THREE.Group();
  const hull = toonMesh(new THREE.CapsuleGeometry(1.1, 4, 6, 14), Palette.cream, { outline: 0.04 });
  hull.rotation.z = Math.PI / 2;
  const bridge = toonMesh(new THREE.BoxGeometry(1.4, 0.9, 1.2), Palette.violet, { outline: 0.03 });
  bridge.position.set(2.1, 1, 0);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.4), basic(GLOW));
  glass.position.set(2.81, 1.1, 0);
  glass.rotation.y = Math.PI / 2;
  f.add(hull, bridge, glass);
  const podColors = [Palette.mint, Palette.butter, Palette.rose];
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const pod = toonMesh(new THREE.BoxGeometry(1.1, 0.9, 0.8), podColors[(i + (side > 0 ? 1 : 0)) % 3], { outline: 0.02 });
      pod.position.set(-1.4 + i * 1.2, 0, side * 1.35);
      f.add(pod);
    }
  }
  const engines: THREE.Sprite[] = [];
  for (const z of [-0.5, 0.5]) {
    const nozzle = toonMesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 10), HULL, { outline: 0.02 });
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(-3.3, 0, z);
    const e = glowSprite(GLOW, 1.4, 0.8);
    e.position.set(-3.8, 0, z);
    f.add(nozzle, e);
    engines.push(e);
  }
  f.userData.engines = engines;
  return f;
}

/** Docking arm: a truss reaching off the deck edge with a cradle. Runs along +x. */
export function dockArm(length: number): THREE.Group {
  const g = new THREE.Group();
  const truss = toonMesh(new THREE.BoxGeometry(length, 0.4, 0.9), METAL_DARK, { outline: 0.025 });
  truss.position.x = length / 2;
  g.add(truss);
  const strutGeo = new THREE.BoxGeometry(0.12, 0.12, 1.1);
  const struts: THREE.Mesh[] = [];
  for (let x = 0.6; x < length; x += 1.2) {
    const s = new THREE.Mesh(strutGeo);
    s.position.set(x, 0.26, 0);
    s.rotation.y = 0.7;
    struts.push(s);
  }
  g.add(toonMesh(merged(struts), METAL, { outline: false }));
  // Two strings of lamps (odd and even) so they can alternate.
  const lampGeo = new THREE.SphereGeometry(0.09, 6, 4);
  const lamps: THREE.Mesh[][] = [[], []];
  let k = 0;
  for (let x = 0.5; x < length; x += 1.5, k++) {
    for (const z of [-0.5, 0.5]) {
      const l = new THREE.Mesh(lampGeo);
      l.position.set(x, 0.1, z);
      lamps[k % 2].push(l);
    }
  }
  const lights = lamps.map((set) => new THREE.Mesh(merged(set), basic(Palette.butter)));
  g.add(...lights);
  g.userData.lights = lights;
  return g;
}

/** Tall lamp post with a glowing head and a light pool on the deck. */
export function floodlight(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.2, 6));
  pole.position.y = 1.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.4));
  head.position.set(0, 3.25, 0.15);
  head.rotation.x = 0.4;
  const lamp = toonMesh(merged([pole, head]), METAL_DARK, { outline: 0.015 });
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), basic(0xfffbe0));
  lens.position.set(0, 3.13, 0.26);
  lens.rotation.x = Math.PI / 2 + 0.4;
  const glow = glowSprite(0xfff2c8, 1.8, 0.7);
  glow.position.set(0, 3.05, 0.3);
  const pool = lightPool(0xfff2c8, 2.6, 0.22);
  pool.position.set(0, 0.03, 1.4);
  g.add(lamp, lens, glow, pool);
  return g;
}

/** Little one-eyed alien. Origin at the feet. */
export function alien(color: number): THREE.Group {
  const a = new THREE.Group();
  const body = new THREE.Group();
  const blob = toonMesh(new THREE.SphereGeometry(0.42, 16, 12), color, { outline: 0.02 });
  blob.scale.set(1, 1.1, 1);
  blob.position.y = 0.5;
  const eyeWhite = toonMesh(new THREE.SphereGeometry(0.17, 12, 8), 0xffffff, { outline: 0.012 });
  eyeWhite.position.set(0, 0.65, 0.33);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), basic(Palette.ink));
  pupil.position.set(0, 0.66, 0.47);
  const stalk = toonMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 5), color, { outline: false });
  stalk.position.y = 1.05;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), basic(Palette.yellow));
  bulb.position.y = 1.25;
  body.add(blob, eyeWhite, pupil, stalk, bulb);
  a.add(body);
  for (const side of [-1, 1]) {
    const foot = toonMesh(new THREE.SphereGeometry(0.13, 8, 6), color, { outline: 0.012 });
    foot.scale.set(1, 0.6, 1.4);
    foot.position.set(side * 0.2, 0.07, 0.05);
    a.add(foot);
  }
  a.userData.body = body;
  return a;
}

/** Trundling maintenance bot. Faces +z. */
export function maintBot(): THREE.Group {
  const b = new THREE.Group();
  const body = toonMesh(new THREE.CylinderGeometry(0.42, 0.48, 0.5, 14), Palette.butter, { outline: 0.02 });
  body.position.y = 0.4;
  const dome = toonMesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), GLOW, { outline: 0.015 });
  dome.position.y = 0.65;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.05), basic(Palette.ink));
  eye.position.set(0, 0.78, 0.24);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), basic(Palette.coral));
  light.position.y = 1;
  const brush = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), Palette.violet, { outline: 0.01 });
  brush.rotation.z = Math.PI / 2;
  brush.position.set(0, 0.12, 0.35);
  b.add(body, dome, eye, light, brush);
  b.userData.light = light;
  return b;
}

/** Small quad drone with a blinking light. */
export function drone(color: number): THREE.Group {
  const d = new THREE.Group();
  const body = toonMesh(new THREE.SphereGeometry(0.28, 12, 8), color, { outline: 0.015 });
  body.scale.y = 0.6;
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), basic(Palette.ink));
  lens.position.set(0, -0.05, 0.24);
  d.add(body, lens);
  const rotors: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
    const arm = toonMesh(new THREE.BoxGeometry(0.06, 0.04, 0.5), METAL_DARK, { outline: false });
    arm.position.set(x / 2, 0, z / 2);
    arm.lookAt(x, 0, z);
    const rotor = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    rotor.rotation.x = -Math.PI / 2;
    rotor.position.set(x, 0.08, z);
    d.add(arm, rotor);
    rotors.push(rotor);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), basic(Palette.coral));
  light.position.y = 0.2;
  d.add(light);
  d.userData.light = light;
  d.userData.rotors = rotors;
  return d;
}

/** A huge gentle space whale. Faces +x. */
export function spaceWhale(): THREE.Group {
  const w = new THREE.Group();
  const skin = 0x9fb8ff;
  const body = toonMesh(new THREE.SphereGeometry(1, 24, 16), skin, { outline: 0.02 });
  body.scale.set(3.4, 1.2, 1.3);
  const belly = toonMesh(new THREE.SphereGeometry(1, 20, 12), Palette.cream, { outline: false });
  belly.scale.set(3, 0.9, 1.05);
  belly.position.set(0.2, -0.35, 0);
  w.add(body, belly);
  // Tail stock plus fluke, on a pivot so it can sweep.
  const tail = new THREE.Group();
  tail.position.x = -2.8;
  const stock = toonMesh(new THREE.ConeGeometry(0.7, 2.4, 14), skin, { outline: 0.02 });
  stock.rotation.z = Math.PI / 2;
  stock.position.x = -1;
  const fluke = toonMesh(new THREE.SphereGeometry(1, 14, 8), skin, { outline: 0.02 });
  fluke.scale.set(0.5, 0.12, 1.6);
  fluke.position.x = -2.2;
  tail.add(stock, fluke);
  w.add(tail);
  for (const side of [-1, 1]) {
    const fin = toonMesh(new THREE.SphereGeometry(1, 12, 8), skin, { outline: 0.015 });
    fin.scale.set(0.7, 0.1, 0.35);
    fin.position.set(0.8, -0.6, side * 1.3);
    fin.rotation.set(side * 0.5, side * 0.6, 0);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), basic(Palette.ink));
    eye.position.set(2.3, 0.05, side * 0.82);
    w.add(fin, eye);
  }
  // Glowing freckles along its back.
  for (let i = 0; i < 6; i++) {
    const s = glowSprite(i % 2 ? 0xffd6ec : GLOW, 0.7, 0.9);
    s.position.set(1.8 - i * 0.75, 1.05 - Math.abs(i - 2) * 0.06, 0);
    w.add(s);
  }
  w.userData.tail = tail;
  return w;
}

/** Round planter with a little cluster of glowing alien sprouts. */
export function planter(): THREE.Group {
  const g = new THREE.Group();
  const pot = toonMesh(new THREE.CylinderGeometry(0.75, 0.6, 0.6, 12), Palette.violet, { outline: 0.02 });
  pot.position.y = 0.3;
  const soil = toonMesh(new THREE.CylinderGeometry(0.68, 0.68, 0.06, 12), 0x8ad8a8, { outline: false });
  soil.position.y = 0.6;
  g.add(pot, soil);
  const colors = [0xff9fd8, Palette.butter, GLOW];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const h = 0.5 + i * 0.25;
    const stem = toonMesh(new THREE.CylinderGeometry(0.04, 0.05, h, 5), Palette.green, { outline: false });
    stem.position.set(Math.cos(a) * 0.3, 0.6 + h / 2, Math.sin(a) * 0.3);
    const bulb = toonMesh(new THREE.SphereGeometry(0.16, 8, 6), colors[i], { emissive: colors[i], outline: 0.01 });
    (bulb.material as THREE.MeshToonMaterial).emissiveIntensity = 0.35;
    bulb.position.set(Math.cos(a) * 0.3, 0.6 + h + 0.1, Math.sin(a) * 0.3);
    g.add(stem, bulb);
  }
  return g;
}
