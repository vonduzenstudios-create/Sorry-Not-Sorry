import * as THREE from 'three';
import { spaceTheme } from '../audio/songs/space';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { glowSprite, instanced, scatter, seeded, Smoke, textTexture } from './decor';
import {
  alien,
  container,
  crane,
  dockArm,
  drone,
  floodlight,
  freighter,
  fuelTanks,
  GLOW,
  greenhouse,
  HULL,
  launchPad,
  lightPool,
  maintBot,
  merged,
  planter,
  METAL,
  METAL_DARK,
  plateTexture,
  radar,
  rocket,
  skylight,
  spaceWhale,
} from './spaceDecor';
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

const spinning: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[] = [];
const blinkers: THREE.Mesh[] = [];
const drifters: { obj: THREE.Object3D; base: THREE.Vector3; phase: number }[] = [];
/** Per-frame animation for the set dressing; rebuilt with the scenery. */
const anims: ((t: number) => void)[] = [];

/** The station deck is an ellipse that the whole board sits on. */
const RX = 31;
const RZ = 23;
const DECK_Y = -1;

function onRim(a: number, k: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(a) * RX * k, y, Math.sin(a) * RZ * k);
}

/** Closed ellipse curve at height y, for tubes running round the deck. */
function rimCurve(k: number, y: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 96; i++) pts.push(onRim((i / 96) * Math.PI * 2, k, y));
  return new THREE.CatmullRomCurve3(pts, true);
}

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

/** Lays one instance per entry, each from a position, yaw and scale. */
function placed(geo: THREE.BufferGeometry, mat: THREE.Material, items: { p: THREE.Vector3; ry?: number; s?: THREE.Vector3 }[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.ry ?? 0);
    mesh.setMatrixAt(i, m.compose(it.p, q, it.s ?? one));
  });
  mesh.receiveShadow = true;
  return mesh;
}

/** Hovering hex pads on stubby pedestals, linked by catwalk bridges. */
function platforms(spaces: Space[]): THREE.Group {
  const g = new THREE.Group();
  g.add(
    placed(
      new THREE.CylinderGeometry(1.75, 1.45, 0.5, 6),
      toon(METAL),
      spaces.map((s) => ({ p: new THREE.Vector3(s.pos.x, -0.26 + (s.id % 5) * 0.003, s.pos.z), ry: Math.PI / 6 })),
    ),
  );
  const ring = new THREE.TorusGeometry(1.5, 0.06, 6, 6);
  ring.rotateX(Math.PI / 2);
  g.add(placed(ring, new THREE.MeshBasicMaterial({ color: GLOW }), spaces.map((s) => ({ p: new THREE.Vector3(s.pos.x, -0.52, s.pos.z), ry: Math.PI / 6 }))));
  g.add(placed(new THREE.CylinderGeometry(0.45, 0.7, 0.5, 6), toon(HULL), spaces.map((s) => ({ p: new THREE.Vector3(s.pos.x, DECK_Y + 0.25, s.pos.z) }))));

  // Catwalks from pad edge to pad edge, with glowing kerbs.
  const walks: { p: THREE.Vector3; ry: number; s: THREE.Vector3 }[] = [];
  const kerbs: { p: THREE.Vector3; ry: number; s: THREE.Vector3 }[] = [];
  const side = new THREE.Vector3();
  for (const s of spaces) {
    for (const n of s.next) {
      const a = s.pos;
      const b = spaces[n].pos;
      const len = a.distanceTo(b) - 2.6;
      if (len <= 0.1) continue;
      const ry = Math.atan2(b.x - a.x, b.z - a.z);
      const mid = a.clone().lerp(b, 0.5).setY(-0.1);
      walks.push({ p: mid, ry, s: new THREE.Vector3(1, 1, len) });
      side.set(Math.cos(ry), 0, -Math.sin(ry)).multiplyScalar(0.5);
      for (const k of [-1, 1]) kerbs.push({ p: mid.clone().addScaledVector(side, k).setY(-0.04), ry, s: new THREE.Vector3(1, 1, len) });
    }
  }
  g.add(placed(new THREE.BoxGeometry(1, 0.14, 1), toon(0xe6e1f8), walks));
  g.add(placed(new THREE.BoxGeometry(0.08, 0.06, 1), new THREE.MeshBasicMaterial({ color: 0x8fe6f6 }), kerbs));
  return g;
}

/** The deck itself: plated ellipse, hull underneath, railing and rim lights. */
function deck(): THREE.Group {
  const g = new THREE.Group();
  const plates = plateTexture();
  plates.repeat.set((RX * 2) / 4, (RZ * 2) / 4);
  const top = toon(0xffffff, { map: plates });
  const side = toon(HULL);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.6, 96), [side, top, side]);
  slab.scale.set(RX, 1, RZ);
  slab.position.y = DECK_Y - 0.3;
  slab.receiveShadow = true;
  g.add(slab);

  // Tapering hull below, with a band of lit windows and four engine pods.
  const hullMat = toon(METAL_DARK);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.55, 4, 96, 1, true), hullMat);
  hull.scale.set(RX * 0.97, 1, RZ * 0.97);
  hull.position.y = DECK_Y - 2.6;
  const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.12, 3, 64), hullMat);
  keel.scale.set(RX * 0.97, 1, RZ * 0.97);
  keel.position.y = DECK_Y - 6.1;
  g.add(hull, keel);
  const winItems: { p: THREE.Vector3; ry: number }[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const p = onRim(a, 0.97 * 0.915 + 0.012, DECK_Y - 1.3);
    winItems.push({ p, ry: Math.atan2(Math.cos(a) / RX, Math.sin(a) / RZ) });
  }
  g.add(placed(new THREE.BoxGeometry(0.7, 0.35, 0.08), new THREE.MeshBasicMaterial({ color: Palette.butter }), winItems));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const pod = toonMesh(new THREE.CylinderGeometry(1, 1.3, 3, 14), HULL, { outline: 0.04 });
    pod.position.copy(onRim(a, 0.7, DECK_Y - 4.6));
    const nozzle = glowSprite(GLOW, 5, 0.8);
    nozzle.position.copy(pod.position).setY(DECK_Y - 6.6);
    g.add(pod, nozzle);
    anims.push((t) => nozzle.scale.setScalar(4.5 + Math.sin(t * 9 + i) * 0.4));
  }

  // Glowing edge seam, then a railing just inside it.
  g.add(new THREE.Mesh(new THREE.TubeGeometry(rimCurve(0.995, DECK_Y + 0.01), 192, 0.09, 5, true), new THREE.MeshBasicMaterial({ color: GLOW })));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(rimCurve(0.975, DECK_Y + 0.8), 192, 0.06, 5, true), toon(METAL)));
  const posts: { p: THREE.Vector3 }[] = [];
  for (let i = 0; i < 110; i++) posts.push({ p: onRim((i / 110) * Math.PI * 2, 0.975, DECK_Y + 0.4) });
  g.add(placed(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5), toon(METAL_DARK), posts));

  // Lights round the deck's side, rippling slowly.
  const n = 80;
  const rimLights = placed(
    new THREE.SphereGeometry(0.16, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    Array.from({ length: n }, (_, i) => ({ p: onRim((i / n) * Math.PI * 2, 1.003, DECK_Y - 0.3) })),
  );
  rimLights.receiveShadow = false;
  const warm = new THREE.Color(Palette.butter);
  const cool = new THREE.Color(0x6a5fb0);
  for (let i = 0; i < n; i++) rimLights.setColorAt(i, warm);
  g.add(rimLights);
  anims.push((t) => {
    for (let i = 0; i < n; i++) {
      const k = 0.5 + 0.5 * Math.sin(t * 2.5 - (i / n) * Math.PI * 8);
      rimLights.setColorAt(i, instanceColor.copy(cool).lerp(warm, k));
    }
    rimLights.instanceColor!.needsUpdate = true;
  });
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
  // Glow inside the dome, and an observation gallery round the waist.
  const domeGlow = glowSprite(GLOW, 3.4, 0.45);
  domeGlow.position.y = 4.6;
  const gallery = toonMesh(new THREE.CylinderGeometry(2.3, 2.3, 0.7, 20), Palette.violet, { outline: 0.04 });
  gallery.position.y = 3.2;
  st.add(domeGlow, gallery);
  const panes: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35));
    w.position.set(Math.sin(a) * 2.32, 3.2, Math.cos(a) * 2.32);
    w.rotation.y = a;
    panes.push(w);
  }
  st.add(new THREE.Mesh(merged(panes), new THREE.MeshBasicMaterial({ color: Palette.butter })));
  // Buttress legs down to the deck.
  const legs: THREE.Mesh[] = [];
  const feet: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.6));
    leg.position.set(Math.sin(a) * 2.2, -0.2, Math.cos(a) * 2.2);
    leg.rotation.set(0, a, 0);
    leg.rotateX(-0.45);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.2, 8));
    foot.position.set(Math.sin(a) * 2.75, DECK_Y + 0.1, Math.cos(a) * 2.75);
    legs.push(leg);
    feet.push(foot);
  }
  st.add(toonMesh(merged(legs), METAL_DARK, { outline: 0.03 }), toonMesh(merged(feet), HULL, { outline: 0.02 }));
  // Side dish aimed at the sky.
  const dish = toonMesh(new THREE.SphereGeometry(0.9, 16, 6, 0, Math.PI * 2, 0, 0.8), Palette.cream, { outline: 0.02 });
  (dish.material as THREE.Material).side = THREE.DoubleSide;
  dish.position.set(1.6, 5.2, 0.4);
  dish.rotation.set(-0.5, 0, -0.7);
  const dishArm = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), METAL_DARK, { outline: 0.01 });
  dishArm.position.set(1.3, 4.6, 0.3);
  dishArm.rotation.z = -0.8;
  st.add(dish, dishArm);

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

/** Inward-facing yaw for a prop standing on the rim at angle a. */
function faceIn(a: number): number {
  return Math.atan2(-Math.cos(a) / RX, -Math.sin(a) / RZ);
}

/** Landmarks, deck clutter and the critters that live on the station. */
function setDressing(scene: THREE.Scene, spaces: Space[]): void {
  const onDeck = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0): T => {
    o.position.set(x, DECK_Y, z);
    o.rotation.y = ry;
    scene.add(o);
    return o;
  };

  // Launch pad on the south plaza: a reusable rocket that flies off and lands again.
  const PAD = new THREE.Vector3(5.5, DECK_Y, 9);
  const pad = onDeck(launchPad(), PAD.x, PAD.z);
  const padLights = pad.userData.lights as THREE.Mesh[];
  blinkers.push(pad.userData.beacon as THREE.Mesh);
  const rk = rocket();
  scene.add(rk);
  const flame = rk.userData.flame as THREE.Group;
  const smokes = [-1, 1].map((k) => {
    const sm = new Smoke(8, 0.9, 1.6, 0.9, 0xffffff, new THREE.Vector3(1.8 * k, 0, 0.6));
    sm.group.position.copy(PAD).setY(DECK_Y + 0.5);
    scene.add(sm.group);
    return sm;
  });
  anims.push((t) => {
    // 70 s cycle: wait, ignite, lift off, gone, then a retro-burn landing.
    const p = t % 70;
    let y = 0;
    let burn = 0;
    if (p >= 40 && p < 43) burn = (p - 40) / 3;
    else if (p >= 43 && p < 52) {
      y = 1.9 * (p - 43) ** 2;
      burn = 1;
    } else if (p >= 52 && p < 60) y = 999;
    else if (p >= 60) {
      y = 1.5 * (70 - p) ** 2;
      burn = 0.75;
    }
    const shake = burn > 0 && y < 2 ? Math.sin(t * 70) * 0.04 : 0;
    rk.position.set(PAD.x + shake, PAD.y + 0.4 + y, PAD.z);
    rk.visible = y < 400;
    flame.visible = burn > 0;
    flame.scale.setScalar(0.3 + burn * 0.8 + Math.sin(t * 45) * 0.08);
    for (const sm of smokes) {
      sm.group.visible = burn > 0 && y < 10;
      sm.update(t);
    }
    // Hazard lights race round the pad around launches, idle-blink otherwise.
    const busy = p >= 36 && (p < 46 || p >= 62);
    padLights.forEach((l, i) => (l.visible = busy ? Math.floor(t * 10 + i) % 4 === 0 : (t + i * 0.15) % 2 < 1.4));
  });

  // Greenhouse on the other side of the plaza.
  const gh = onDeck(greenhouse(), -6.5, 9);
  const ghGlow = gh.userData.glow as THREE.Sprite;
  const plants = gh.userData.plants as THREE.Group;
  anims.push((t) => {
    ghGlow.material.opacity = 0.28 + Math.sin(t * 1.3) * 0.08;
    plants.children.forEach((c, i) => (c.rotation.z = Math.sin(t * 1.1 + i) * 0.05));
  });
  const doorPool = lightPool(GLOW, 1.6, 0.3);
  doorPool.position.set(-6.5, DECK_Y + 0.02, 12.6);
  scene.add(doorPool);

  // South promenade: a parked shuttle on its own pad, and planters.
  const miniPad = toonMesh(new THREE.CylinderGeometry(1.9, 2.1, 0.25, 8), HULL, { outline: 0.02 });
  onDeck(miniPad, 6, 18.8).position.y += 0.12;
  const miniRing = toonMesh(new THREE.TorusGeometry(1.5, 0.08, 4, 8), Palette.butter, { outline: false });
  miniRing.rotation.x = Math.PI / 2;
  miniRing.position.set(6, DECK_Y + 0.26, 18.8);
  scene.add(miniRing);
  const parked = shuttle();
  parked.position.set(6, DECK_Y + 0.85, 18.8);
  parked.rotation.y = 2.4;
  (parked.userData.flame as THREE.Sprite).visible = false;
  scene.add(parked);
  for (const [x, z] of [[-9.5, 18], [10.5, 17.4], [-1.4, 18.6]] as const) onDeck(planter(), x, z);

  // Floor windows down into space.
  for (const [x, z, r] of [[-0.5, 9.8, 1.6], [-8.6, 1, 1.2], [7.2, 1.2, 1.1]] as const) onDeck(skylight(r), x, z);

  // Cargo yard behind the spire, with a crane winching crates about.
  onDeck(container(Palette.coral), 1.6, -9.6, 0.05).position.y += 0.55;
  onDeck(container(Palette.mint), 4.2, -9.4, -0.05).position.y += 0.55;
  onDeck(container(Palette.sky), 2.9, -9.5, 0.1).position.y += 1.65;
  const cr = onDeck(crane(), 6.6, -7.4);
  const jib = cr.userData.jib as THREE.Object3D;
  const cable = cr.userData.cable as THREE.Mesh;
  const crate = cr.userData.crate as THREE.Mesh;
  anims.push((t) => {
    jib.rotation.y = 2.5 + Math.sin(t * 0.25) * 0.6;
    const len = 1 + (1 + Math.sin(t * 0.5)) * 0.35;
    cable.scale.y = len;
    cable.position.y = -len / 2;
    crate.position.y = -len - 0.45;
  });

  // Fuel farm in the north-west corner.
  const tanks = onDeck(fuelTanks(), -7.5, -9.5, 0.3);
  blinkers.push(tanks.userData.light as THREE.Mesh);

  // Floodlights on the rim and at the plaza corners.
  for (const a of [-Math.PI / 2, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9, 0, Math.PI, 0.75, Math.PI - 0.75]) {
    const p = onRim(a, 0.975);
    onDeck(floodlight(), p.x, p.z, faceIn(a));
  }
  onDeck(floodlight(), 2.3, 12.2, Math.PI * 0.85);
  onDeck(floodlight(), -3.1, 12.4, -Math.PI * 0.85);

  // Docking arm off the north-east rim, a freighter moored alongside.
  {
    const a = -0.75;
    const base = onRim(a, 0.97, DECK_Y - 0.2);
    const out = new THREE.Vector3(Math.cos(a) / RX, 0, Math.sin(a) / RZ).normalize();
    const yaw = Math.atan2(-out.z, out.x);
    const arm = dockArm(10);
    arm.position.copy(base);
    arm.rotation.y = yaw;
    scene.add(arm);
    const armLights = arm.userData.lights as THREE.Mesh[];
    const ship = freighter();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const shipPos = base.clone().addScaledVector(out, 6.5).addScaledVector(side, -2.6);
    ship.rotation.y = yaw;
    scene.add(ship);
    const engines = ship.userData.engines as THREE.Sprite[];
    anims.push((t) => {
      ship.position.copy(shipPos).setY(DECK_Y - 0.2 + Math.sin(t * 0.7) * 0.15);
      ship.rotation.z = Math.sin(t * 0.5) * 0.03;
      for (const e of engines) e.scale.setScalar(1.1 + Math.sin(t * 13) * 0.15);
      armLights.forEach((l, i) => (l.visible = Math.floor(t * 3) % 2 === i));
    });
  }

  // Radar dish on its own little platform off the north-west rim.
  {
    const a = -2.35;
    const centre = onRim(a, 1.3, DECK_Y);
    const isle = new THREE.Group();
    isle.position.copy(centre);
    const disc = toonMesh(new THREE.CylinderGeometry(3.4, 3.4, 0.6, 24), HULL, { outline: 0.04 });
    disc.position.y = -0.3;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.62, 24), toon(METAL));
    top.position.y = -0.29;
    const under = toonMesh(new THREE.ConeGeometry(3.3, 4, 24), METAL_DARK, { outline: 0.04 });
    under.rotation.x = Math.PI;
    under.position.y = -2.6;
    const glow = glowSprite(GLOW, 4, 0.7);
    glow.position.y = -4.8;
    const dish = radar();
    isle.add(disc, top, under, glow, dish);
    scene.add(isle);
    const head = dish.userData.head as THREE.Object3D;
    blinkers.push(dish.userData.horn as THREE.Mesh);
    const from = onRim(a, 0.97, DECK_Y - 0.2);
    const toward = centre.clone().setY(from.y).sub(from);
    const bridge = dockArm(toward.length() - 3.1);
    bridge.position.copy(from);
    bridge.rotation.y = Math.atan2(-toward.z, toward.x);
    scene.add(bridge);
    anims.push((t) => {
      head.rotation.y = t * 0.3;
      isle.position.y = centre.y + Math.sin(t * 0.6) * 0.1;
    });
  }

  // Deck clutter: crates and vents scattered clear of the path and landmarks.
  const keepOut: [number, number, number][] = [
    [-1, -1, 6.6],
    [PAD.x, PAD.z, 3.6],
    [-6.5, 9, 3.6],
    [-0.5, 9.8, 2.2],
    [-8.6, 1, 1.8],
    [7.2, 1.2, 1.7],
    [3, -9, 3.6],
    [6.6, -7.4, 1.2],
    [-7.5, -9.5, 3.4],
    [-4.4, 19.2, 1.5],
    [6, 18.8, 2.8],
    [-9.5, 18, 1.2],
    [10.5, 17.4, 1.2],
    [-1.4, 18.6, 1.2],
  ];
  const rand = seeded(0x5ace);
  const spots = scatter(rand, spaces, {
    count: 46,
    extent: RX,
    clearance: 2.5,
    reject: (x, z) => Math.hypot(x / RX, z / RZ) > 0.9 || keepOut.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r),
  });
  const crates = spots.slice(0, 26).map(([x, z]) => {
    const s = 0.45 + rand() * 0.35;
    return { x, y: DECK_Y + s / 2, z, s, ry: rand() * Math.PI };
  });
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), Palette.peach, crates.filter((_, i) => i % 2 === 0)));
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), Palette.lavender, crates.filter((_, i) => i % 2 === 1)));
  const vents = spots.slice(26).map(([x, z]) => ({ x, y: DECK_Y + 0.1, z, s: 0.6 + rand() * 0.4, sy: 0.3, ry: rand() * Math.PI }));
  scene.add(instanced(new THREE.CylinderGeometry(1, 1.1, 0.6, 8), METAL_DARK, vents));
  scene.add(instanced(new THREE.TorusGeometry(0.7, 0.08, 4, 8).rotateX(Math.PI / 2), METAL, vents.map((v) => ({ ...v, y: v.y + 0.1, sy: 1 }))));

  // Aliens out for a stroll.
  const walkers: { o: THREE.Group; at: (t: number) => [number, number] }[] = [
    { o: alien(Palette.green), at: (t) => [-6.5 + Math.cos(t * 0.22) * 3.7, 9 + Math.sin(t * 0.22) * 3.7] },
    { o: alien(0xff9fd8), at: (t) => [Math.sin(t * 0.35) * 1.8 - 0.4, 6.4] },
    { o: alien(0x9fd8ff), at: (t) => [2 + Math.sin(t * 0.27) * 2.6, -7.5] },
  ];
  for (const w of walkers) scene.add(w.o);
  anims.push((t) => {
    walkers.forEach((w, i) => {
      const [x, z] = w.at(t);
      const [nx, nz] = w.at(t + 0.05);
      w.o.position.set(x, DECK_Y, z);
      w.o.rotation.y = Math.atan2(nx - x, nz - z);
      const body = w.o.userData.body as THREE.Object3D;
      body.position.y = Math.abs(Math.sin(t * 7 + i)) * 0.18;
      body.rotation.z = Math.sin(t * 7 + i) * 0.08;
    });
  });

  // Maintenance bots sweeping the rim lane in opposite directions.
  const bots = [maintBot(), maintBot(), maintBot()];
  for (const b of bots) scene.add(b);
  anims.push((t) => {
    bots.forEach((b, i) => {
      const dir = i === 1 ? -1 : 1;
      const a = dir * t * 0.045 + i * 2.1;
      b.position.copy(onRim(a, 0.94, DECK_Y));
      b.rotation.y = Math.atan2(-Math.sin(a) * RX * dir, Math.cos(a) * RZ * dir);
      (b.userData.light as THREE.Mesh).visible = (t * 2 + i) % 1 < 0.5;
    });
  });

  // Delivery drones zipping over the inner deck.
  const drones = [drone(Palette.butter), drone(Palette.mint), drone(Palette.rose)];
  for (const d of drones) scene.add(d);
  anims.push((t) => {
    drones.forEach((d, i) => {
      const s = 0.18 + i * 0.05;
      const x = Math.sin(t * s + i * 2) * (10 + i * 3);
      const z = Math.sin(t * s * 1.7 + i) * (6 + i);
      d.position.set(x, 4 + i * 0.8 + Math.sin(t * 2 + i) * 0.25, z);
      const dx = Math.cos(t * s + i * 2) * (10 + i * 3) * s;
      const dz = Math.cos(t * s * 1.7 + i) * (6 + i) * s * 1.7;
      d.rotation.set(0, Math.atan2(dx, dz), 0);
      d.rotateX(0.2);
      (d.userData.light as THREE.Mesh).visible = (t * 1.5 + i * 0.3) % 1 < 0.3;
      for (const r of d.userData.rotors as THREE.Mesh[]) r.scale.setScalar(0.85 + Math.sin(t * 50 + i) * 0.15);
    });
  });

  // A space whale cruising far beyond the station.
  const whale = spaceWhale();
  whale.scale.setScalar(3);
  scene.add(whale);
  const tail = whale.userData.tail as THREE.Object3D;
  anims.push((t) => {
    const a = t * 0.025 + 2;
    whale.position.set(Math.cos(a) * 40, -14 + Math.sin(t * 0.3) * 1.5, -4 + Math.sin(a) * 32);
    // Heading along the path (local +x is the nose).
    whale.rotation.set(0, Math.atan2(-Math.cos(a) * 32, -Math.sin(a) * 40), Math.sin(t * 0.3) * 0.08);
    tail.rotation.z = Math.sin(t * 1.2) * 0.25;
  });
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
  anims.length = 0;
  const rand = seeded(0x57a);
  scene.add(starfield());
  scene.add(deck());
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
    [35, 6, 0.3],
    [-35, 4, -0.3],
    [-4, -27, 0],
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
    [toonMesh(rockGeo, 0xb8a6c8, { outline: 0.03 }), 35, 1, 9],
    [toonMesh(rockGeo, 0xc8b6d8, { outline: 0.03 }), -35, 0, 10],
    [toonMesh(rockGeo, 0xb8a6c8, { outline: 0.03 }), 17, -2, -27],
    [toonMesh(rockGeo, 0xd0c0e0, { outline: 0.03 }), -15, 0, -28],
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
  holo = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), holoMat);
  holo.position.set(-4.4, 1.3, 19.2);
  scene.add(holo);
  const emitter = toonMesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 12), METAL_DARK, { outline: 0.02 });
  emitter.position.set(-4.4, DECK_Y + 0.12, 19.2);
  scene.add(emitter);
  const beamUp = glowSprite(GLOW, 1.6, 0.5);
  beamUp.position.set(-4.4, 0.2, 19.2);
  scene.add(beamUp);

  setDressing(scene, spaces);
}

function updateScenery(t: number): void {
  for (const a of anims) a(t);
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
    shuttleRef.position.set(-1 + Math.cos(a) * 8, 6 + Math.sin(t * 1.1) * 0.3, -1 + Math.sin(a) * 5.5);
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
