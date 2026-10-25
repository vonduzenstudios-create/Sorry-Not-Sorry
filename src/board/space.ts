import * as THREE from 'three';
import { spaceTheme } from '../audio/songs/space';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { glowSprite, instanced, seeded, textTexture } from './decor';
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

let starMat: THREE.ShaderMaterial | null = null;

/** Thousands of twinkling stars on a big sphere around the board. */
function starfield(): THREE.Points {
  const n = 1500;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const tint = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const tints = [new THREE.Color(0xffffff), new THREE.Color(0xffd6ec), new THREE.Color(0xc8f6ff), new THREE.Color(0xfff2b8)];
  // Fixed-seed scatter so every peer sees the same sky (not that it matters for play).
  const rand = seeded(7);
  for (let i = 0; i < n; i++) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(300 + rand() * 80);
    pos.set([v.x, v.y, v.z], i * 3);
    phase[i] = rand() * 100;
    const c = tints[i % tints.length];
    tint.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  starMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float time;
      attribute float phase;
      attribute vec3 tint;
      varying vec3 vTint;
      varying float vBright;
      void main() {
        vTint = tint;
        vBright = 0.55 + 0.45 * sin(time * (1.0 + fract(phase) * 2.5) + phase);
        gl_PointSize = 1.4 + 1.8 * vBright * step(0.85, fract(phase * 7.0)) + 0.6;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vTint;
      varying float vBright;
      void main() {
        gl_FragColor = vec4(vTint * vBright, 1.0);
        #include <colorspace_fragment>
      }
    `,
    depthWrite: false,
  });
  return new THREE.Points(geo, starMat);
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
    const spoke = toonMesh(new THREE.CylinderGeometry(0.16, 0.16, 10, 8), METAL_DARK, { outline: 0.02 });
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

/** Little shuttle with a glowing engine. Faces +z. */
function shuttle(): THREE.Group {
  const s = new THREE.Group();
  const body = toonMesh(new THREE.CapsuleGeometry(0.5, 1.4, 6, 12), Palette.cream, { outline: 0.025 });
  body.rotation.x = Math.PI / 2;
  const nose = toonMesh(new THREE.SphereGeometry(0.42, 12, 8), Palette.coral, { outline: 0.02 });
  nose.position.z = 0.95;
  nose.scale.set(1, 1, 0.8);
  const canopy = toonMesh(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), GLOW, { outline: 0.015 });
  canopy.position.set(0, 0.35, 0.45);
  s.add(body, nose, canopy);
  for (const side of [-1, 1]) {
    const wing = toonMesh(new THREE.BoxGeometry(1.1, 0.08, 0.7), Palette.coral, { outline: 0.015 });
    wing.position.set(side * 0.75, -0.1, -0.3);
    wing.rotation.z = side * -0.15;
    s.add(wing);
  }
  const fin = toonMesh(new THREE.BoxGeometry(0.08, 0.6, 0.6), Palette.coral, { outline: 0.015 });
  fin.position.set(0, 0.5, -0.75);
  s.add(fin);
  const flame = glowSprite(0x9ff3ff, 1.6, 0.95);
  flame.position.z = -1.35;
  s.add(flame);
  s.userData.flame = flame;
  return s;
}

/** Flying saucer with a friendly alien and a pulsing tractor beam. */
function ufo(): THREE.Group {
  const u = new THREE.Group();
  const disc = toonMesh(new THREE.SphereGeometry(1.6, 24, 10), METAL, { outline: 0.04 });
  disc.scale.y = 0.28;
  const rim = toonMesh(new THREE.TorusGeometry(1.55, 0.12, 6, 28), Palette.violet, { outline: 0.02 });
  rim.rotation.x = Math.PI / 2;
  const glass = toonMesh(new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLOW, { transparent: true, opacity: 0.55, outline: 0.02 });
  glass.position.y = 0.25;
  const alien = toonMesh(new THREE.SphereGeometry(0.38, 14, 10), Palette.green, { outline: 0.02 });
  alien.position.y = 0.45;
  u.add(disc, rim, alien, glass);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    eye.position.set(side * 0.13, 0.55, 0.3);
    const stalk = toonMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 5), Palette.green, { outline: false });
    stalk.position.set(side * 0.15, 0.85, 0);
    const bulb = toonMesh(new THREE.SphereGeometry(0.06, 6, 4), Palette.yellow, { outline: false });
    bulb.position.set(side * 0.15, 1.02, 0);
    u.add(eye, stalk, bulb);
  }
  // Running lights round the rim.
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: Palette.yellow }));
    l.position.set(Math.cos(a) * 1.55, -0.05, Math.sin(a) * 1.55);
    u.add(l);
    lights.push(l);
  }
  const beamGeo = new THREE.ConeGeometry(1.4, 5, 20, 1, true);
  beamGeo.translate(0, -2.5, 0);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({ color: 0xc8fff0, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.position.y = -0.1;
  u.add(beam);
  u.userData.lights = lights;
  u.userData.beam = beam;
  return u;
}

/** A floating spaceperson, waving hello. */
function astronaut(): THREE.Group {
  const a = new THREE.Group();
  const suit = Palette.cream;
  const body = toonMesh(new THREE.CapsuleGeometry(0.38, 0.5, 6, 12), suit, { outline: 0.025 });
  const helmet = toonMesh(new THREE.SphereGeometry(0.42, 16, 12), suit, { outline: 0.025 });
  helmet.position.y = 0.75;
  const visor = toonMesh(new THREE.SphereGeometry(0.3, 14, 10), 0x7fa8ff, { outline: 0.012 });
  visor.position.set(0, 0.77, 0.2);
  visor.scale.set(1, 0.8, 0.7);
  const pack = toonMesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), Palette.coral, { outline: 0.02 });
  pack.position.set(0, 0.1, -0.4);
  a.add(body, helmet, visor, pack);
  const limbGeo = new THREE.CapsuleGeometry(0.13, 0.4, 4, 8);
  for (const side of [-1, 1]) {
    const leg = toonMesh(limbGeo, suit, { outline: 0.015 });
    leg.position.set(side * 0.2, -0.65, 0);
    leg.rotation.z = side * 0.2;
    const arm = new THREE.Group();
    arm.position.set(side * 0.45, 0.25, 0);
    const armMesh = toonMesh(limbGeo, suit, { outline: 0.015 });
    armMesh.position.y = 0.3;
    arm.add(armMesh);
    arm.rotation.z = side * -2.2;
    a.add(leg, arm);
    if (side > 0) a.userData.wave = arm;
  }
  return a;
}

const instanceColor = new THREE.Color();

const lightCol = new THREE.Color(GLOW);
const lightDim = new THREE.Color(0x4a4a8a);
let runway: THREE.InstancedMesh | null = null;
let shuttleRef: THREE.Group | null = null;
let ufoRef: THREE.Group | null = null;
let spaceman: THREE.Group | null = null;
let belt: THREE.Object3D | null = null;
let comet: THREE.Group | null = null;
let holo: THREE.Mesh | null = null;

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  spinning.length = 0;
  blinkers.length = 0;
  drifters.length = 0;
  const rand = seeded(0x57a);
  scene.add(starfield());
  scene.add(platforms(spaces));

  // A cool rim light from behind gives the metal a second cel band.
  const rim = new THREE.DirectionalLight(0xc8b8ff, 0.7);
  rim.position.set(-12, 6, -14);
  scene.add(rim);

  // Nebula clouds glowing in the deep background.
  for (const [x, y, z, c, sc] of [
    [-90, -110, -60, 0xff8fc8, 220],
    [80, -130, -20, 0x7fd8ff, 200],
    [10, -150, -140, 0xb08bff, 260],
    [-140, -40, -120, 0x8fffd8, 160],
  ] as const) {
    const n = glowSprite(c, sc, 0.28);
    n.position.set(x, y, z);
    scene.add(n);
  }

  // Chasing runway lights on the outer edge of every loop platform.
  const loop = spaces.slice(0, 40);
  runway = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), loop.length);
  const m = new THREE.Matrix4();
  loop.forEach((s, i) => {
    const out = s.pos.clone().setY(0).normalize();
    m.makeTranslation(s.pos.x + out.x * 1.65, -0.05, s.pos.z + out.z * 1.65);
    runway!.setMatrixAt(i, m);
    runway!.setColorAt(i, lightDim);
  });
  scene.add(runway);

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
  // A huge striped gas giant far below, peeking out past the walkways.
  const giant = planet(36, 0xffd3b8);
  giant.position.set(-95, -85, -25);
  giant.rotation.z = 0.3;
  scene.add(giant);
  const stripeMat = toon(0xf5b89a);
  for (const y of [-0.45, -0.1, 0.3, 0.62]) {
    const r = 36 * Math.sqrt(1 - y * y) * 1.005;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 36 * 0.1, 40, 1, true), stripeMat);
    band.position.y = y * 36;
    giant.add(band);
  }

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

  // Asteroid belt sweeping slowly round below the station.
  const beltItems = Array.from({ length: 120 }, () => {
    const a = rand() * Math.PI * 2;
    const r = 34 + rand() * 10;
    return { x: Math.cos(a) * r, y: -6 + (rand() - 0.5) * 3, z: Math.sin(a) * r, s: 0.4 + rand() * 1.1, ry: rand() * 6, sy: 0.6 + rand() * 0.6 };
  });
  belt = instanced(new THREE.DodecahedronGeometry(1, 0), 0xb8a6c8, beltItems);
  scene.add(belt);

  // Shuttle doing laps round the station, a UFO and a floating spaceperson.
  shuttleRef = shuttle();
  scene.add(shuttleRef);
  ufoRef = ufo();
  scene.add(ufoRef);
  spaceman = astronaut();
  scene.add(spaceman);

  // Comet streaking across the far sky now and then.
  comet = new THREE.Group();
  const head = glowSprite(0xffffff, 6, 1);
  comet.add(head);
  for (let i = 1; i < 8; i++) {
    const tail = glowSprite(i < 4 ? 0xc8f6ff : 0xffc2e6, 6 - i * 0.55, 0.7 - i * 0.08);
    tail.position.x = -i * 2.2;
    comet.add(tail);
  }
  comet.rotation.z = -0.35;
  scene.add(comet);

  // Hologram welcome sign by the start, flickering.
  const holoMat = new THREE.MeshBasicMaterial({
    map: textTexture('STAR STATION', 'rgba(0,0,0,0)', '#9ff3ff', 256, 64, '900 36px system-ui, sans-serif'),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  holo = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), holoMat);
  holo.position.set(-4.4, 1.3, 19.2);
  scene.add(holo);
  const emitter = toonMesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 12), METAL_DARK, { outline: 0.02 });
  emitter.position.set(-4.4, 0.1, 19.2);
  scene.add(emitter);
  const beamUp = glowSprite(GLOW, 1.6, 0.5);
  beamUp.position.set(-4.4, 0.6, 19.2);
  scene.add(beamUp);
}

function updateScenery(t: number): void {
  if (starMat) starMat.uniforms.time.value = t;
  for (const s of spinning) s.obj.rotation[s.axis] = t * s.speed;
  for (const b of blinkers) b.visible = t % 1.2 < 0.6;
  for (const d of drifters) {
    d.obj.position.y = d.base.y + Math.sin(t * 0.8 + d.phase) * 0.6;
    d.obj.rotation.set(t * 0.2 + d.phase, t * 0.3, 0);
  }
  if (runway) {
    const n = runway.count;
    const head = (t * 10) % n;
    for (let i = 0; i < n; i++) {
      // A bright pulse with a short fading tail racing round the loop.
      const behind = (head - i + n) % n;
      const k = behind < 6 ? 1 - behind / 6 : 0;
      runway.setColorAt(i, instanceColor.copy(lightDim).lerp(lightCol, k));
    }
    runway.instanceColor!.needsUpdate = true;
  }
  if (belt) belt.rotation.y = t * 0.02;
  if (shuttleRef) {
    // Elliptical laps round the station, banking into the turns.
    const a = t * 0.5;
    shuttleRef.position.set(-1 + Math.cos(a) * 8, 4.6 + Math.sin(t * 1.1) * 0.3, -1 + Math.sin(a) * 5.5);
    const vx = -Math.sin(a) * 8;
    const vz = Math.cos(a) * 5.5;
    shuttleRef.rotation.set(0, Math.atan2(vx, vz), 0);
    shuttleRef.rotateZ(0.35);
    const flame = shuttleRef.userData.flame as THREE.Sprite;
    flame.scale.setScalar(1.4 + Math.sin(t * 30) * 0.2);
  }
  if (ufoRef) {
    ufoRef.position.set(Math.sin(t * 0.11) * 28, 6 + Math.sin(t * 0.9) * 0.5, -22 + Math.cos(t * 0.17) * 4);
    ufoRef.rotation.set(Math.sin(t * 0.7) * 0.08, t * 0.6, Math.cos(t * 0.6) * 0.08);
    (ufoRef.userData.lights as THREE.Mesh[]).forEach((l, i) => (l.visible = Math.floor(t * 6 + i) % 2 === 0));
    const beam = ufoRef.userData.beam as THREE.Mesh;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.max(0, Math.sin(t * 0.8)) * 0.18;
  }
  if (spaceman) {
    spaceman.position.set(-17 + Math.sin(t * 0.3) * 0.8, 2.6 + Math.sin(t * 0.7) * 0.5, 1 + Math.cos(t * 0.25) * 1.2);
    spaceman.rotation.set(Math.sin(t * 0.4) * 0.4, t * 0.25, Math.sin(t * 0.3) * 0.3);
    (spaceman.userData.wave as THREE.Object3D).rotation.z = -2.4 + Math.sin(t * 5) * 0.4;
  }
  if (comet) {
    // One pass every 25 seconds, high across the back of the sky.
    const k = (t % 25) / 6;
    comet.visible = k < 1;
    comet.position.set(-140 + k * 280, 30 - k * 20, -150);
  }
  if (holo) {
    const flicker = Math.sin(t * 40) > 0.92 ? 0.35 : 0.9;
    (holo.material as THREE.MeshBasicMaterial).opacity = flicker;
    holo.position.y = 1.3 + Math.sin(t * 1.5) * 0.08;
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
