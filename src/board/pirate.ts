import * as THREE from 'three';
import { pirateTheme } from '../audio/songs/pirate';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
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

  for (const [x, h] of [
    [-1.6, 4.2],
    [1.4, 5],
  ] as const) {
    const mast = toonMesh(new THREE.CylinderGeometry(0.12, 0.15, h, 10), 0x8a5a3b, { outline: 0.03 });
    mast.position.set(x, 1.4 + h / 2, 0);
    s.add(mast);
    const sail = toonMesh(new THREE.CylinderGeometry(3, 3, h * 0.55, 16, 1, true, -0.45, 0.9), Palette.cream, { outline: 0.03 });
    (sail.material as THREE.Material).side = THREE.DoubleSide;
    sail.rotation.y = Math.PI / 2;
    sail.position.set(x - 2.9, 1.6 + h * 0.55, 0);
    s.add(sail);
  }
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
  return s;
}

function buildScenery(scene: THREE.Scene, spaces: Space[]): void {
  scene.add(water());
  scene.add(islands(spaces));

  // Palms on the outside of the main ring, away from the lagoon.
  spaces.forEach((s, i) => {
    if (i >= 40 || i % 3 !== 1) return;
    const out = s.pos.clone().setY(0).normalize();
    // Skip the camera-facing side so trees never hide the path.
    if (out.z > 0.2) return;
    const palm = palmTree(2.4 + (i % 4) * 0.35);
    palm.position.copy(s.pos).addScaledVector(out, 2.3).setY(0);
    palm.rotation.y = Math.atan2(out.x, out.z) + Math.PI / 2;
    scene.add(palm);
  });

  const pirateShip = ship();
  pirateShip.position.set(0, -0.5, -1);
  pirateShip.rotation.y = 0.25;
  scene.add(pirateShip);

  // Little decorative islands out at sea.
  const extras: [number, number, number][] = [
    [32, 10, 2.6],
    [-33, 14, 3],
    [30, -20, 2.2],
    [-30, -18, 2.8],
    [6, 26, 2],
  ];
  for (const [x, z, r] of extras) {
    const isle = toonMesh(new THREE.CylinderGeometry(r, r * 1.25, 1, 24), Palette.sand, { outline: 0.04 });
    isle.position.set(x, -0.4, z);
    scene.add(isle);
    const palm = palmTree(2.2 + r * 0.3);
    palm.position.set(x, 0.1, z);
    palm.rotation.y = x;
    scene.add(palm);
  }

  const props: [THREE.Group, number, number][] = [
    [chest(), -12.5, 1.5],
    [barrel(), 5.5, 18.6],
    [barrel(), 6.4, 19],
    [chest(), 17, -14],
    [barrel(), -24.6, 4],
  ];
  for (const [p, x, z] of props) {
    p.position.set(x, 0.02, z);
    p.rotation.y = x * 0.7;
    scene.add(p);
  }
}

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
    happening: {
      title: 'Cannon blast!',
      description: 'The ship fires you to another island!',
    },
  };
}
