import * as THREE from 'three';
import { pirateTheme } from '../audio/songs/pirate';
import { Palette } from '../render/palette';
import { makeCloud } from '../render/props';
import { toon, toonMesh } from '../render/toon';
import { bird, clearOfPath, crab, flyBird, glowSprite, instanced, scatter, seeded, Smoke, textTexture, type Bird } from './decor';
import { BoardBuilder } from './graph';
import type { BoardDef, Space } from './types';

/**
 * Pirate Cove: a ring of sandy islands around a lagoon with a pirate ship.
 * Two side paths cut across the lagoon.
 */
function layout(): { spaces: Space[]; startId: number } {
  const b = new BoardBuilder()
    .loop(
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
    )
    // Ghost-ship shortcut on the east side, behind a locked gate.
    .branch(6, 15, [[12, 2], [8, -6]], 'B R H B R', true)
    // Treasure isle path on the west side.
    .branch(25, 34, [[-10, -6], [-11, 4]], 'B I B* H R');
  return { spaces: b.spaces, startId: b.loopId(0) };
}

let waterMat: THREE.ShaderMaterial | null = null;
const flags: THREE.Object3D[] = [];

function water(): THREE.Mesh {
  waterMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deep: { value: new THREE.Color(0x7cc8ec) },
      light: { value: new THREE.Color(0xa8e2f7) },
      foam: { value: new THREE.Color(0xeefaff) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vXZ = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    // Banded, cel-style ripples: two crossing sine fields quantized to flat steps.
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 deep;
      uniform vec3 light;
      uniform vec3 foam;
      varying vec2 vXZ;
      void main() {
        float w = sin(vXZ.x * 0.35 + time * 0.8) + sin(vXZ.y * 0.42 - time * 0.6 + vXZ.x * 0.15);
        vec3 c = deep;
        if (w > 0.9) c = light;
        if (w > 1.75) c = foam;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), waterMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.45;
  mesh.receiveShadow = true;
  return mesh;
}

/** Sand and grass discs under every space merge into island strips. */
function islands(spaces: Space[]): THREE.Group {
  const g = new THREE.Group();
  const sandGeo = new THREE.CylinderGeometry(2.1, 2.4, 0.9, 28);
  const grassGeo = new THREE.CylinderGeometry(1.55, 1.6, 0.2, 28);
  const sand = toon(Palette.sand);
  const grass = toon(Palette.grass);
  for (const s of spaces) {
    // Tiny height offsets stop overlapping tops from z-fighting.
    const jitter = (s.id % 7) * 0.004;
    const sm = new THREE.Mesh(sandGeo, sand);
    sm.position.set(s.pos.x, -0.48 + jitter, s.pos.z);
    sm.receiveShadow = true;
    const gm = new THREE.Mesh(grassGeo, grass);
    gm.position.set(s.pos.x, -0.08 + jitter, s.pos.z);
    gm.receiveShadow = true;
    g.add(sm, gm);
  }
  return g;
}

export function palmTree(height = 3): THREE.Group {
  const tree = new THREE.Group();
  const segs = 5;
  let lean = 0;
  for (let i = 0; i < segs; i++) {
    const seg = toonMesh(new THREE.CylinderGeometry(0.16 - i * 0.015, 0.2 - i * 0.015, height / segs, 10), 0xc99a6b, { outline: 0.02 });
    lean += 0.06;
    seg.position.set(lean * i * 0.6, (i + 0.5) * (height / segs), 0);
    seg.rotation.z = -lean * 0.5;
    tree.add(seg);
  }
  const top = new THREE.Vector3(lean * segs * 0.6, height, 0);
  const leafGeo = new THREE.SphereGeometry(0.5, 12, 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = toonMesh(leafGeo, Palette.green, { outline: 0.02 });
    leaf.scale.set(1.8, 0.18, 0.55);
    leaf.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 0.8, -0.15, Math.sin(a) * 0.8));
    leaf.rotation.set(0, -a, -0.45);
    tree.add(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const nut = toonMesh(new THREE.SphereGeometry(0.13, 10, 8), 0x8a5a3b, { outline: 0.015 });
    nut.position.copy(top).add(new THREE.Vector3(Math.cos(i * 2) * 0.18, -0.25, Math.sin(i * 2) * 0.18));
    tree.add(nut);
  }
  return tree;
}

function barrel(): THREE.Group {
  const b = new THREE.Group();
  const body = toonMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 14), 0xb5784a, { outline: 0.02 });
  body.position.y = 0.37;
  b.add(body);
  for (const y of [0.15, 0.6]) {
    const band = toonMesh(new THREE.TorusGeometry(0.33, 0.035, 6, 18), 0x6b4f6e, { outline: false });
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    b.add(band);
  }
  return b;
}

function chest(): THREE.Group {
  const c = new THREE.Group();
  const box = toonMesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), 0xb5784a, { outline: 0.025 });
  box.position.y = 0.25;
  const lid = toonMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16, 1, false, 0, Math.PI), 0xa0663e, { outline: 0.025 });
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.5;
  const lock = toonMesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), Palette.yellow, { outline: 0.015 });
  lock.position.set(0, 0.48, 0.31);
  c.add(box, lid, lock);
  return c;
}

function skullFlag(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2440';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#fff6e6';
  g.beginPath();
  g.arc(64, 42, 22, 0, Math.PI * 2);
  g.fill();
  g.fillRect(52, 54, 24, 14);
  g.fillStyle = '#2b2440';
  g.beginPath();
  g.arc(55, 42, 6, 0, Math.PI * 2);
  g.arc(73, 42, 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff6e6';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(30, 70);
  g.lineTo(98, 88);
  g.moveTo(98, 70);
  g.lineTo(30, 88);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ship(): THREE.Group {
  const s = new THREE.Group();
  // Hull: side profile extruded across the beam.
  const profile = new THREE.Shape();
  profile.moveTo(-4, 1.4);
  profile.lineTo(4.4, 1.4);
  profile.quadraticCurveTo(3.8, -0.2, 2.4, -0.6);
  profile.lineTo(-3, -0.6);
  profile.quadraticCurveTo(-4.2, 0, -4, 1.4);
  const hullGeo = new THREE.ExtrudeGeometry(profile, { depth: 2.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 3 });
  hullGeo.translate(0, 0, -1.3);
  hullGeo.computeVertexNormals();
  const hull = toonMesh(hullGeo, 0x9a6a4a, { outline: 0.05 });
  const stripe = toonMesh(new THREE.BoxGeometry(8.6, 0.25, 3.15), Palette.coral, { outline: 0.03 });
  stripe.position.set(0.2, 1.1, 0);
  const deck = toonMesh(new THREE.BoxGeometry(8, 0.1, 2.6), 0xd8a878, { outline: false });
  deck.position.y = 1.45;
  s.add(hull, stripe, deck);

  // Captain's cabin on the stern with a little lit window.
  const cabin = toonMesh(new THREE.BoxGeometry(1.8, 1.1, 2.4), 0xb5784a, { outline: 0.03 });
  cabin.position.set(-3, 2.05, 0);
  const cabinRoof = toonMesh(new THREE.BoxGeometry(2.1, 0.14, 2.7), Palette.coral, { outline: 0.02 });
  cabinRoof.position.set(-3, 2.65, 0);
  const cabinWin = new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), new THREE.MeshBasicMaterial({ color: 0xffe38a }));
  cabinWin.position.set(-3, 2.05, 1.21);
  s.add(cabin, cabinRoof, cabinWin);
  // Ship's wheel on top of the cabin.
  const wheel = toonMesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), 0x8a5a3b, { outline: 0.012 });
  wheel.position.set(-2.4, 3.1, 0);
  wheel.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const spoke = toonMesh(new THREE.BoxGeometry(0.04, 0.8, 0.04), 0x8a5a3b, { outline: false });
    spoke.rotation.x = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  s.add(wheel);
  shipWheel = wheel;

  // Portholes along the hull.
  const portGeo = new THREE.CircleGeometry(0.16, 12);
  const portMat = new THREE.MeshBasicMaterial({ color: Palette.ink });
  for (const x of [-1, 1, 3]) {
    for (const side of [-1, 1]) {
      const port = new THREE.Mesh(portGeo, portMat);
      port.position.set(x, 0.55, side * 1.56);
      if (side < 0) port.rotation.y = Math.PI;
      s.add(port);
    }
  }

  // Bowsprit and figurehead.
  const sprit = toonMesh(new THREE.CylinderGeometry(0.06, 0.1, 2.4, 8), 0x8a5a3b, { outline: 0.02 });
  sprit.rotation.z = -1.15;
  sprit.position.set(5.3, 1.95, 0);
  s.add(sprit);

  const masts: [number, number][] = [
    [-1.6, 4.2],
    [1.4, 5],
  ];
  for (const [x, h] of masts) {
    const mast = toonMesh(new THREE.CylinderGeometry(0.12, 0.15, h, 10), 0x8a5a3b, { outline: 0.03 });
    mast.position.set(x, 1.4 + h / 2, 0);
    s.add(mast);
    // Two billowing square sails per mast, the top one smaller.
    for (const [y, w, sh] of [
      [1.4 + h * 0.42, 3, h * 0.36],
      [1.4 + h * 0.78, 2.2, h * 0.24],
    ] as const) {
      const sail = toonMesh(new THREE.CylinderGeometry(w, w, sh, 16, 1, true, -0.45, 0.9), Palette.cream, { outline: 0.025 });
      (sail.material as THREE.Material).side = THREE.DoubleSide;
      sail.rotation.y = Math.PI / 2;
      sail.position.set(x - w + 0.25, y, 0);
      sail.scale.z = 0.95;
      const yard = toonMesh(new THREE.CylinderGeometry(0.05, 0.05, w * 0.95, 6), 0x8a5a3b, { outline: 0.012 });
      yard.rotation.x = Math.PI / 2;
      yard.position.set(x + 0.2, y + sh / 2, 0);
      s.add(sail, yard);
    }
    // Rigging down to the rails.
    for (const side of [-1, 1]) {
      const top = new THREE.Vector3(x, 1.4 + h * 0.95, 0);
      const foot = new THREE.Vector3(x - 0.6, 1.5, side * 1.35);
      const rope = toonMesh(new THREE.CylinderGeometry(0.02, 0.02, top.distanceTo(foot), 4), 0x6b4f6e, { outline: false });
      rope.position.copy(top).add(foot).multiplyScalar(0.5);
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
      s.add(rope);
    }
  }
  // Crow's nest on the main mast.
  const nest = toonMesh(new THREE.CylinderGeometry(0.42, 0.32, 0.4, 12, 1, true), 0xb5784a, { outline: 0.02 });
  (nest.material as THREE.Material).side = THREE.DoubleSide;
  nest.position.set(1.4, 5.7, 0);
  s.add(nest);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.8, 8, 1),
    new THREE.MeshBasicMaterial({ map: skullFlag(), side: THREE.DoubleSide }),
  );
  flag.position.set(1.95, 6.6, 0);
  s.add(flag);
  flags.push(flag);
  const cannonGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.9, 12);
  for (const x of [-2, 0, 2]) {
    const cannon = toonMesh(cannonGeo, 0x4a4060, { outline: 0.02 });
    cannon.rotation.x = Math.PI / 2;
    cannon.position.set(x, 1.05, 1.55);
    s.add(cannon);
  }
  // Cannon smoke that puffs out of the middle gun now and then.
  cannonSmoke = new Smoke(5, 0.35, 1.6, 0.9, 0xffffff, new THREE.Vector3(0, 0.4, 1.4));
  cannonSmoke.group.position.set(0, 1.05, 2.1);
  s.add(cannonSmoke.group);

  // A parrot keeps watch from the bow rail.
  const p = parrot();
  p.position.set(3.6, 1.5, 1.1);
  p.rotation.y = 0.6;
  s.add(p);
  parrotBird = p;
  return s;
}

function parrot(): THREE.Group {
  const p = new THREE.Group();
  const body = toonMesh(new THREE.CapsuleGeometry(0.16, 0.26, 4, 10), Palette.coral, { outline: 0.015 });
  body.position.y = 0.3;
  body.rotation.x = -0.25;
  const head = toonMesh(new THREE.SphereGeometry(0.15, 12, 8), Palette.coral, { outline: 0.015 });
  head.position.set(0, 0.58, 0.05);
  const beak = toonMesh(new THREE.ConeGeometry(0.06, 0.16, 6), Palette.butter, { outline: 0.01 });
  beak.rotation.x = Math.PI / 2 + 0.5;
  beak.position.set(0, 0.54, 0.2);
  const wing = toonMesh(new THREE.SphereGeometry(0.13, 10, 6), Palette.green, { outline: 0.012 });
  wing.scale.set(0.5, 1.2, 1);
  for (const side of [-1, 1]) {
    const w = wing.clone();
    w.position.set(side * 0.15, 0.32, -0.02);
    p.add(w);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: Palette.ink }));
    eye.position.set(side * 0.09, 0.62, 0.13);
    p.add(eye);
  }
  const tail = toonMesh(new THREE.BoxGeometry(0.12, 0.35, 0.04), Palette.sky, { outline: 0.01 });
  tail.position.set(0, 0.1, -0.15);
  tail.rotation.x = 0.5;
  p.add(body, head, beak, tail);
  return p;
}

/** Red-and-cream striped lighthouse on a rocky islet, with a sweeping beam. */
function lighthouse(): THREE.Group {
  const l = new THREE.Group();
  const rock = toonMesh(new THREE.DodecahedronGeometry(3.2, 0), 0xb8b0c8, { outline: 0.05 });
  rock.scale.set(1, 0.4, 1);
  rock.position.y = -0.4;
  l.add(rock);
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const r0 = 1.2 - i * 0.12;
    const band = toonMesh(new THREE.CylinderGeometry(r0 - 0.12, r0, 1.2, 18), i % 2 ? Palette.cream : Palette.coral, { outline: 0.035 });
    band.position.y = 0.6 + i * 1.2 + 0.4;
    l.add(band);
  }
  const top = 0.6 + bands * 1.2 + 0.4;
  const balcony = toonMesh(new THREE.CylinderGeometry(0.85, 0.85, 0.15, 18), Palette.ink, { outline: false });
  balcony.position.y = top - 0.55;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
  lamp.position.y = top;
  const roof = toonMesh(new THREE.ConeGeometry(0.7, 0.8, 18), Palette.coral, { outline: 0.03 });
  roof.position.y = top + 0.8;
  l.add(balcony, lamp, roof);
  const glow = glowSprite(0xfff2a8, 4, 0.7);
  glow.position.y = top;
  l.add(glow);

  // Beam: a long soft cone swinging round.
  const pivot = new THREE.Group();
  pivot.position.y = top;
  const beamGeo = new THREE.ConeGeometry(1.4, 14, 16, 1, true);
  beamGeo.translate(0, -7, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.rotation.z = -0.12;
  pivot.add(beam);
  l.add(pivot);
  beamPivot = pivot;
  return l;
}

/** Big grey rock with a skull face and a cave for a mouth. */
function skullRock(): THREE.Group {
  const g = new THREE.Group();
  const dome = toonMesh(new THREE.SphereGeometry(4, 20, 14), 0xd2cade, { outline: 0.06 });
  dome.scale.set(1.1, 0.9, 0.9);
  dome.position.y = 1.4;
  const jaw = toonMesh(new THREE.CylinderGeometry(2.6, 2.4, 2.4, 16), 0xc4bcd2, { outline: 0.05 });
  jaw.position.set(0, -0.2, 0.9);
  g.add(dome, jaw);
  const holeMat = new THREE.MeshBasicMaterial({ color: Palette.ink });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), holeMat);
    eye.position.set(side * 1.45, 2.2, 3.5);
    eye.rotation.x = -0.35;
    eye.rotation.y = side * 0.3;
    g.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16, 0, Math.PI), holeMat);
  mouth.position.set(0, -0.4, 3.32);
  g.add(mouth);
  return g;
}

function rowboat(): THREE.Group {
  const b = new THREE.Group();
  const hull = toonMesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xc98a5a, { outline: 0.03 });
  hull.scale.set(0.6, 0.45, 1.4);
  (hull.material as THREE.Material).side = THREE.DoubleSide;
  b.add(hull);
  const seat = toonMesh(new THREE.BoxGeometry(1.1, 0.06, 0.3), 0xe0b080, { outline: 0.01 });
  seat.position.y = -0.12;
  b.add(seat);
  for (const side of [-1, 1]) {
    const oar = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), 0xe0b080, { outline: 0.01 });
    oar.rotation.z = side * 1.2;
    oar.position.set(side * 0.8, -0.1, 0);
    b.add(oar);
  }
  return b;
}

/** Wooden jetty reaching out from the start island. */
function dock(length: number): THREE.Group {
  const d = new THREE.Group();
  const plankGeo = new THREE.BoxGeometry(2, 0.12, 0.45);
  const planks = Math.round(length / 0.5);
  for (let i = 0; i < planks; i++) {
    const p = toonMesh(plankGeo, i % 3 === 1 ? 0xd9a878 : 0xc99a6b, { outline: 0.012 });
    p.position.set(0, 0, i * 0.5);
    p.rotation.y = ((i * 37) % 7) * 0.006 - 0.02;
    d.add(p);
  }
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8);
  for (let i = 0; i <= length; i += 2) {
    for (const side of [-1, 1]) {
      const post = toonMesh(postGeo, 0x9a6a4a, { outline: 0.015 });
      post.position.set(side * 1.05, -0.3, i);
      d.add(post);
    }
  }
  return d;
}

function buoy(): THREE.Group {
  const b = new THREE.Group();
  const base = toonMesh(new THREE.CylinderGeometry(0.4, 0.5, 0.5, 12), Palette.coral, { outline: 0.02 });
  const mid = toonMesh(new THREE.CylinderGeometry(0.25, 0.35, 0.5, 12), Palette.cream, { outline: 0.02 });
  mid.position.y = 0.5;
  const cap = toonMesh(new THREE.ConeGeometry(0.25, 0.4, 12), Palette.coral, { outline: 0.02 });
  cap.position.y = 0.95;
  b.add(base, mid, cap);
  return b;
}

function sharkFin(): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.quadraticCurveTo(0.1, 0.4, 0.35, 1.1);
  shape.quadraticCurveTo(0.3, 0.4, 0.5, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  geo.translate(0, 0, -0.05);
  return toonMesh(geo, 0x8a9ac0, { outline: 0.02 });
}

/** Flat five-armed starfish for the beaches. */
function starfishGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.3 : 0.11;
    const a = (i / 10) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Wet-sand foam rings round every island; they breathe with the waves. */
function surf(spaces: Space[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(2.3, 2.75, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.75 }),
    spaces.length,
  );
  mesh.position.y = -0.43;
  mesh.userData.centres = spaces.map((s) => s.pos.clone().setY(0));
  return mesh;
}

/** Things that just need moving every frame. */
interface Sway {
  obj: THREE.Object3D;
  phase: number;
}

let waterRef: THREE.InstancedMesh | null = null;
let shipRef: THREE.Group | null = null;
let shipWheel: THREE.Object3D | null = null;
let cannonSmoke: Smoke | null = null;
let parrotBird: THREE.Object3D | null = null;
let beamPivot: THREE.Object3D | null = null;
let fin: THREE.Object3D | null = null;
const palms: Sway[] = [];
const bobbers: (Sway & { y: number })[] = [];
const crabs: (Sway & { x: number; z: number; dir: number })[] = [];
const gulls: (Bird & { cx: number; cz: number; r: number; y: number; speed: number; phase: number })[] = [];
const clouds: (Sway & { z: number; y: number })[] = [];
const wisps: (Sway & { base: THREE.Vector3 })[] = [];

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  palms.length = bobbers.length = crabs.length = gulls.length = clouds.length = wisps.length = 0;
  const rand = seeded(0x5ea);
  scene.add(water());
  scene.add(islands(spaces));
  waterRef = surf(spaces);
  scene.add(waterRef);

  const addPalm = (p: THREE.Group, phase: number) => {
    scene.add(p);
    palms.push({ obj: p, phase });
  };

  // Palms on the outside of the main ring, away from the lagoon.
  spaces.forEach((s, i) => {
    if (i >= 40 || i % 3 !== 1) return;
    const out = s.pos.clone().setY(0).normalize();
    // Skip the camera-facing side so trees never hide the path.
    if (out.z > 0.2) return;
    const palm = palmTree(2.4 + (i % 4) * 0.35);
    palm.position.copy(s.pos).addScaledVector(out, 2.3).setY(0);
    palm.rotation.y = Math.atan2(out.x, out.z) + Math.PI / 2;
    addPalm(palm, i);
  });

  // Beach dressing: starfish, shells and pebbles round the island rims.
  const stars: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  const shells: typeof stars = [];
  spaces.forEach((s, i) => {
    const out = s.pos.clone().setY(0).normalize();
    for (let k = 0; k < 2; k++) {
      const a = Math.atan2(out.z, out.x) + (rand() - 0.5) * 2.2 + (k ? Math.PI : 0);
      const r = 1.75 + rand() * 0.35;
      const x = s.pos.x + Math.cos(a) * r;
      const z = s.pos.z + Math.sin(a) * r;
      // Stay off the neighbouring spaces' grass.
      if (!clearOfPath(spaces, x, z, 1.62)) continue;
      const it = { x, y: -0.02 + (s.id % 7) * 0.004, z, s: 0.7 + rand() * 0.6, ry: rand() * 6 };
      ((i + k) % 3 === 0 ? stars : shells).push(it);
    }
  });
  scene.add(instanced(starfishGeo(), Palette.coral, stars));
  const shellGeo = new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  scene.add(instanced(shellGeo, Palette.rose, shells));

  const pirateShip = ship();
  pirateShip.position.set(0, -0.5, -1);
  pirateShip.rotation.y = 0.25;
  scene.add(pirateShip);
  shipRef = pirateShip;

  // Landmarks: the lighthouse, Skull Rock and the old jetty.
  const light = lighthouse();
  light.position.set(27, 0, -17);
  scene.add(light);
  const skull = skullRock();
  skull.position.set(-5, -0.6, -24);
  skull.rotation.y = 0.15;
  skull.scale.setScalar(0.8);
  scene.add(skull);
  const jetty = dock(7);
  jetty.position.set(-3.4, 0.02, 17.2);
  scene.add(jetty);
  const boat = rowboat();
  boat.position.set(-5.6, -0.25, 21.5);
  boat.rotation.y = 0.3;
  scene.add(boat);
  bobbers.push({ obj: boat, phase: 0.5, y: -0.25 });
  const sign = new THREE.Group();
  const signPost = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), 0x9a6a4a, { outline: 0.015 });
  signPost.position.y = 0.8;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.08), [
    ...Array(4).fill(toon(0xc99a6b)),
    new THREE.MeshBasicMaterial({ map: textTexture('PIRATE COVE', '#c99a6b', '#fff6e6', 256, 64, '900 34px system-ui, sans-serif') }),
    toon(0xc99a6b),
  ]);
  board.position.y = 1.5;
  board.rotation.z = -0.05;
  sign.add(signPost, board);
  sign.position.set(-3.6, 0, 20.4);
  scene.add(sign);

  // Little decorative islands out at sea, each with a crab.
  const extras: [number, number, number][] = [
    [32, 10, 2.6],
    [-33, 14, 3],
    [-30, -18, 2.8],
    [6, 26, 2],
  ];
  extras.forEach(([x, z, r], i) => {
    const isle = toonMesh(new THREE.CylinderGeometry(r, r * 1.25, 1, 24), Palette.sand, { outline: 0.04 });
    isle.position.set(x, -0.4, z);
    scene.add(isle);
    const palm = palmTree(2.2 + r * 0.3);
    palm.position.set(x, 0.1, z);
    palm.rotation.y = x;
    addPalm(palm, i * 2.1);
    const c = crab(i % 2 ? Palette.coral : 0xff9a6a);
    c.position.set(x + r * 0.5, 0.1, z + r * 0.35);
    scene.add(c);
    crabs.push({ obj: c, phase: i * 1.3, x: c.position.x, z: c.position.z, dir: i * 0.9 });
  });

  // Treasure isle: X marks the spot, with a half-dug hole and a shovel.
  const xMat = new THREE.MeshBasicMaterial({ color: Palette.coral });
  for (const a of [0.78, -0.78]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.24), xMat);
    bar.rotation.set(-Math.PI / 2, 0, a);
    bar.position.set(-12.6, 0.14, -0.6);
    scene.add(bar);
  }
  const mound = toonMesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8cf98, { outline: 0.015 });
  mound.position.set(-13.4, 0.1, 0.4);
  mound.scale.y = 0.6;
  const shovel = new THREE.Group();
  const handle = toonMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), 0x9a6a4a, { outline: 0.01 });
  handle.position.y = 0.65;
  const blade = toonMesh(new THREE.BoxGeometry(0.3, 0.36, 0.04), 0xc8c4d8, { outline: 0.01 });
  shovel.add(handle, blade);
  shovel.position.set(-13.3, 0.2, 0.3);
  shovel.rotation.set(0.3, 0.4, 0.2);
  scene.add(mound, shovel);

  // Haunted wreck beside the ghost-ship shortcut, with ghostly wisps.
  const wreckMast = toonMesh(new THREE.CylinderGeometry(0.12, 0.16, 3.4, 8), 0x7a6a7a, { outline: 0.025 });
  wreckMast.position.set(16.6, 0.8, -3.5);
  wreckMast.rotation.z = 0.35;
  const tatter = toonMesh(new THREE.PlaneGeometry(1.2, 0.9, 1, 1), 0xb8c8c0, { outline: false });
  (tatter.material as THREE.Material).side = THREE.DoubleSide;
  tatter.position.set(16.2, 1.6, -3.4);
  tatter.rotation.set(0.1, 0.4, 0.35);
  const wreckHull = toonMesh(new THREE.BoxGeometry(2.6, 0.5, 1.2), 0x7a6a7a, { outline: 0.03 });
  wreckHull.position.set(17, -0.35, -3.2);
  wreckHull.rotation.set(0.2, 0.6, 0.25);
  scene.add(wreckMast, tatter, wreckHull);
  for (let i = 0; i < 3; i++) {
    const w = glowSprite(0x9ff7c8, 1.1, 0.9);
    const base = new THREE.Vector3(15.5 + i * 1.2, 1.8 + i * 0.4, -4.8 + i * 1.6);
    w.position.copy(base);
    scene.add(w);
    wisps.push({ obj: w, phase: i * 2.2, base });
  }

  // Buoys and sea rocks with foam collars.
  const buoys: [number, number][] = [
    [27, 2],
    [-28, -6],
    [12, -22],
    [-18, 20],
    [20, 20],
  ];
  buoys.forEach(([x, z], i) => {
    const b = buoy();
    b.position.set(x, -0.45, z);
    scene.add(b);
    bobbers.push({ obj: b, phase: i * 1.9, y: -0.45 });
  });
  const rocks = scatter(rand, spaces, {
    count: 14,
    extent: 38,
    clearance: 4,
    // Keep clear of the ship, the jetty and the other landmarks.
    reject: (x, z) => (Math.abs(x) < 7 && z > -6 && z < 4) || (Math.abs(x + 4) < 4 && z > 15) || Math.hypot(x - 27, z + 17) < 5 || Math.hypot(x + 5, z + 24) < 6,
  });
  const rockItems = rocks.map(([x, z]) => ({ x, y: -0.35, z, s: 0.5 + rand() * 0.9, ry: rand() * 6, sy: 0.7 }));
  scene.add(instanced(new THREE.DodecahedronGeometry(1, 0), 0xc4bcd2, rockItems));
  scene.add(instanced(new THREE.RingGeometry(1.05, 1.45, 14).rotateX(-Math.PI / 2), 0xf2fbff, rockItems.map((r) => ({ ...r, y: -0.42, sy: 1 }))));

  // Shark circling in the lagoon.
  fin = sharkFin();
  fin.scale.setScalar(1.5);
  scene.add(fin);

  // Gulls wheeling overhead.
  for (let i = 0; i < 4; i++) {
    const g = bird(0xffffff, 0xeef0ff);
    g.group.scale.setScalar(1.1);
    scene.add(g.group);
    // Wide circles round the outside of the ring, so they never hide the path for long.
    gulls.push({ ...g, cx: 0, cz: -2, r: 28 + i * 2, y: 6 + i * 0.5, speed: i % 2 ? 0.12 : -0.1, phase: i * 1.6 });
  }

  // Clouds drifting by out past the islands.
  const cloudSpots: [number, number, number][] = [
    [-30, 10, -34],
    [20, 12, -40],
    [44, 9, -10],
    [-46, 11, 0],
  ];
  cloudSpots.forEach(([x, y, z], i) => {
    const c = makeCloud(2 + (i % 2));
    c.position.set(x, y, z);
    scene.add(c);
    clouds.push({ obj: c, phase: x, z, y });
  });

  const props: [THREE.Group, number, number][] = [
    [chest(), -12.5, 1.5],
    [barrel(), 5.5, 18.6],
    [barrel(), 6.4, 19],
    [chest(), 17, -14],
    [barrel(), -24.6, 4],
    [barrel(), -1.6, 22.5],
  ];
  for (const [p, x, z] of props) {
    p.position.set(x, 0.02, z);
    p.rotation.y = x * 0.7;
    scene.add(p);
  }
}

const tmpM = new THREE.Matrix4();

function updateScenery(t: number): void {
  if (waterMat) waterMat.uniforms.time.value = t;
  for (const f of flags) {
    const pos = (f as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(t * 6 + x * 4) * 0.08 * (x + 0.55));
    }
    pos.needsUpdate = true;
  }
  if (waterRef) {
    const centres = waterRef.userData.centres as THREE.Vector3[];
    centres.forEach((c, i) => {
      const s = 1 + Math.sin(t * 1.6 + i * 0.7) * 0.05;
      tmpM.makeScale(s, 1, s).setPosition(c);
      waterRef!.setMatrixAt(i, tmpM);
    });
    waterRef.instanceMatrix.needsUpdate = true;
  }
  if (shipRef) {
    shipRef.position.y = -0.5 + Math.sin(t * 0.9) * 0.12;
    shipRef.rotation.x = Math.sin(t * 0.9 + 1) * 0.035;
    shipRef.rotation.z = Math.sin(t * 0.7) * 0.02;
  }
  if (shipWheel) shipWheel.rotation.x = Math.sin(t * 0.5) * 0.8;
  if (cannonSmoke) {
    // A volley every nine seconds; the smoke shows for the first two.
    const k = t % 9;
    cannonSmoke.group.visible = k < 2;
    cannonSmoke.update(k * 0.5);
  }
  if (parrotBird) {
    parrotBird.rotation.y = 0.6 + Math.sin(t * 0.8) * 0.5;
    parrotBird.position.y = 1.5 + Math.max(0, Math.sin(t * 3)) * 0.06;
  }
  if (beamPivot) beamPivot.rotation.y = t * 0.8;
  if (fin) {
    const a = -t * 0.45;
    fin.position.set(-1 + Math.cos(a) * 4, -0.55 + Math.sin(t * 2) * 0.05, 8 + Math.sin(a) * 2.6);
    fin.rotation.y = -a - Math.PI / 2 + Math.PI;
  }
  for (const p of palms) {
    p.obj.rotation.x = Math.sin(t * 1.1 + p.phase) * 0.025;
    p.obj.rotation.z = Math.sin(t * 0.8 + p.phase * 1.3) * 0.03;
  }
  for (const b of bobbers) {
    b.obj.position.y = b.y + Math.sin(t * 1.4 + b.phase) * 0.12;
    b.obj.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.12;
    b.obj.rotation.x = Math.cos(t * 0.9 + b.phase) * 0.08;
  }
  for (const c of crabs) {
    // Scuttle sideways, pause, scuttle back.
    const s = Math.sin(t * 0.7 + c.phase);
    const step = Math.max(-1, Math.min(1, s * 2)) * 0.7;
    c.obj.position.set(c.x + Math.cos(c.dir) * step, 0.1 + Math.abs(Math.sin(t * 12)) * 0.03 * Math.abs(Math.cos(t * 0.7 + c.phase)), c.z + Math.sin(c.dir) * step);
    c.obj.rotation.y = -c.dir;
  }
  for (const g of gulls) flyBird(g, t, g.cx, g.cz, g.r, g.y, g.speed, g.phase);
  for (const c of clouds) c.obj.position.x = ((c.phase + t * 0.6 + 60) % 120) - 60;
  for (const w of wisps) {
    w.obj.position.set(w.base.x + Math.sin(t * 0.7 + w.phase) * 0.6, w.base.y + Math.sin(t * 1.3 + w.phase) * 0.35, w.base.z + Math.cos(t * 0.5 + w.phase) * 0.6);
    ((w.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(t * 2.3 + w.phase) * 0.35;
  }
}

export function pirateCove(): BoardDef {
  flags.length = 0;
  const { spaces, startId } = layout();
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
