import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Palette } from '../render/palette';
import { toon, toonMesh } from '../render/toon';
import { glowSprite, textTexture } from './decor';

/*
 * Props for Bubble Reef. Static builders return plain groups that the board
 * bakes into a few merged meshes; anything that moves hands back the parts
 * to animate. Swaying plants and the caustic seabed bend in the shader, so
 * hundreds of kelp strands cost one draw call and no per-frame CPU.
 */

export const CORAL = {
  pink: 0xff9ec4,
  coral: 0xff8f80,
  lilac: 0xc6a2ff,
  butter: 0xffe08a,
  teal: 0x7fe3d0,
  peach: 0xffb68a,
  sky: 0x9fd8ff,
};
export const CORAL_COLORS = Object.values(CORAL);
export const ROCK = 0x9c8fc0;
export const ROCK_DARK = 0x7a6ea6;
export const SAND = 0xdcd2aa;
export const KELP = 0x6fcf8f;
export const KELP_DARK = 0x4fb57f;
const WINDOW = 0xfff1a0;
const DOOR = 0x5b4a86;

/** The clock every shader-animated reef material reads. */
export const reefTime = { value: 0 };

// ------------------------------------------------------------------ shaders

/**
 * Toon material whose vertices sway like a plant in a current: the higher
 * up the geometry (local y over `height`), the further it bends. Each
 * instance gets its own phase from where it stands.
 */
export function swayMaterial(color: number, height: number, amp: number, opts: { side?: THREE.Side } = {}): THREE.MeshToonMaterial {
  const m = toon(color);
  m.side = opts.side ?? THREE.FrontSide;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.reefTime = reefTime;
    sh.vertexShader =
      'uniform float reefTime;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        float swayH = clamp(position.y / ${height.toFixed(3)}, 0.0, 1.0);
        vec4 swayBase = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          swayBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float swayPh = swayBase.x * 0.31 + swayBase.z * 0.17;
        float swayK = swayH * swayH * ${amp.toFixed(3)};
        transformed.x += sin(reefTime * 1.1 + swayPh + swayH * 2.0) * swayK;
        transformed.z += cos(reefTime * 0.8 + swayPh * 1.3 + swayH * 1.4) * swayK * 0.6;`,
      );
  };
  m.customProgramCacheKey = () => `reef-sway-${height}-${amp}`;
  return m;
}

/** Shared caustic pattern (the classic iterated-warp water caustic). */
const CAUSTIC_GLSL = /* glsl */ `
  uniform float reefTime;
  varying vec3 vReefWorld;
  float reefCaustic(vec2 p, float t) {
    p = mod(p * 0.22, 6.28318) - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float tt = t * 0.3 * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
  }
`;

/** Toon material with dancing light caustics painted on top (seabed, rocks). */
export function causticMaterial(color: number, strength = 0.35, vertexColors = false): THREE.MeshToonMaterial {
  const m = toon(color);
  m.vertexColors = vertexColors;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.reefTime = reefTime;
    sh.vertexShader =
      'varying vec3 vReefWorld;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 reefW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          reefW = instanceMatrix * reefW;
        #endif
        vReefWorld = (modelMatrix * reefW).xyz;`,
      );
    sh.fragmentShader =
      CAUSTIC_GLSL +
      sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float reefC = reefCaustic(vReefWorld.xz, reefTime) + 0.5 * reefCaustic(vReefWorld.xz * 1.7 + 3.0, reefTime * 1.3);
        // Caustics fade on steep walls and with depth below the sand line.
        outgoingLight += vec3(0.78, 0.97, 1.0) * reefC * ${strength.toFixed(3)} * clamp(1.0 + vReefWorld.y * 0.08, 0.3, 1.4);
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `reef-caustic-${strength}-${vertexColors}`;
  return m;
}

// ------------------------------------------------------------------ geometry

function cleanGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
  if (!out.attributes.normal) out = (out.computeVertexNormals(), out);
  return out;
}

/** Merge transformed meshes' geometry into one (positions + normals only). */
export function mergeParts(parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((p) => cleanGeo(p.geo.clone().applyMatrix4(p.m))));
}

const mat4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

/** One kelp strand: a wavy ribbon from two crossed planes, base at y = 0. */
export function kelpGeo(height: number): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  const blade = new THREE.PlaneGeometry(0.55, height, 1, 12);
  const pos = blade.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + height / 2;
    // Taper to a point at the top and ripple the edges.
    const w = (1 - Math.pow(y / height, 3)) * (1 + 0.25 * Math.sin(y * 2.4));
    pos.setX(i, pos.getX(i) * w);
    pos.setY(i, y);
  }
  blade.computeVertexNormals();
  parts.push({ geo: blade, m: mat4(0, 0, 0) });
  parts.push({ geo: blade, m: mat4(0, 0, 0, 0, Math.PI / 2) });
  return mergeParts(parts);
}

/** A clump of sea-grass blades, base at y = 0, height 1. */
export function grassGeo(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
  const blade = new THREE.ConeGeometry(0.07, 1, 4, 3);
  blade.translate(0, 0.5, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push({ geo: blade, m: mat4(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25, 1, 0.7 + (i % 3) * 0.2, 1) });
  }
  return mergeParts(parts);
}

/** Small fish: plump body, tail fin and a dorsal fin; faces +z. */
export function fishGeo(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 10, 8);
  const tail = new THREE.ConeGeometry(0.55, 0.7, 4);
  const fin = new THREE.ConeGeometry(0.3, 0.5, 4);
  return mergeParts([
    { geo: body, m: mat4(0, 0, 0, 0, 0, 0, 0.16, 0.26, 0.42) },
    { geo: tail, m: mat4(0, 0, -0.5, -Math.PI / 2, 0, 0, 0.25, 1, 0.9) },
    { geo: fin, m: mat4(0, 0.25, -0.05, -0.4, 0, 0, 0.12, 1, 0.6) },
  ]);
}

// ------------------------------------------------------------------ coral

/** Branching coral: a little three-level tree of rounded tubes. */
export function branchCoral(color: number, size = 1, seed = 0): THREE.Group {
  const g = new THREE.Group();
  const tube = new THREE.CylinderGeometry(0.11, 0.14, 1, 8);
  const tip = new THREE.SphereGeometry(0.11, 8, 6);
  const grow = (parent: THREE.Object3D, len: number, depth: number, k: number) => {
    const seg = toonMesh(tube, color, { outline: 0.02 });
    seg.scale.set(1 - depth * 0.2, len, 1 - depth * 0.2);
    seg.position.y = len / 2;
    parent.add(seg);
    const end = new THREE.Group();
    end.position.y = len;
    parent.add(end);
    if (depth >= 2) {
      const t = toonMesh(tip, color, { outline: 0.02 });
      t.scale.setScalar(1 - depth * 0.2);
      end.add(t);
      return;
    }
    const n = depth === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.set(0.5 + ((k + i) % 3) * 0.1, (i / n) * Math.PI * 2 + k, 0);
      end.add(pivot);
      grow(pivot, len * 0.75, depth + 1, k + i * 1.7);
    }
  };
  grow(g, 0.7, 0, seed);
  g.scale.setScalar(size);
  return g;
}

/** Brain coral: a squashed lumpy dome with a couple of grooves. */
export function brainCoral(color: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  const dome = toonMesh(new THREE.SphereGeometry(0.8, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), color, { outline: 0.025 });
  dome.scale.y = 0.75;
  g.add(dome);
  const ridge = new THREE.TorusGeometry(0.55, 0.06, 6, 20);
  for (let i = 0; i < 3; i++) {
    const r = toonMesh(ridge, color, { outline: 0.015 });
    r.rotation.set(Math.PI / 2 + (i - 1) * 0.5, 0, i * 0.9);
    r.position.y = 0.25;
    r.scale.setScalar(0.85 + i * 0.12);
    g.add(r);
  }
  g.scale.setScalar(size);
  return g;
}

/** Fan coral: a flat round fan on a short stalk. */
export function fanCoral(color: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  const stalk = toonMesh(new THREE.CylinderGeometry(0.06, 0.1, 0.5, 6), color, { outline: 0.015 });
  stalk.position.y = 0.25;
  const fan = toonMesh(new THREE.SphereGeometry(0.8, 14, 10), color, { outline: 0.02 });
  fan.scale.set(1, 0.85, 0.1);
  fan.position.y = 1.05;
  g.add(stalk, fan);
  for (let i = 0; i < 5; i++) {
    const vein = toonMesh(new THREE.CylinderGeometry(0.025, 0.03, 1.2, 4), 0xffffff, { outline: false });
    vein.position.set(Math.sin((i - 2) * 0.45) * 0.35, 0.95, 0.06);
    vein.rotation.z = -(i - 2) * 0.45;
    g.add(vein);
  }
  g.scale.setScalar(size);
  return g;
}

/** Tube coral: a cluster of open pipes with dark mouths. */
export function tubeCoral(color: number, size = 1, seed = 0): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4 + seed;
    const h = 0.6 + ((i * 7 + seed * 3) % 5) * 0.18;
    const r = i === 0 ? 0 : 0.28;
    const pipe = toonMesh(new THREE.CylinderGeometry(0.15, 0.12, h, 10), color, { outline: 0.02 });
    pipe.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    const mouth = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10), 0x6a3d6e, { outline: false });
    mouth.position.set(Math.cos(a) * r, h + 0.005, Math.sin(a) * r);
    g.add(pipe, mouth);
  }
  g.scale.setScalar(size);
  return g;
}

/** Sea anemone: a soft foot and a ring of stubby tentacles. */
export function anemone(color: number, tips: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  const foot = toonMesh(new THREE.CylinderGeometry(0.32, 0.38, 0.35, 12), color, { outline: 0.02 });
  foot.position.y = 0.17;
  g.add(foot);
  const geo = new THREE.CapsuleGeometry(0.05, 0.45, 2, 6);
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const r = ring ? 0.12 : 0.26;
      const t = toonMesh(geo, i % 2 ? tips : color, { outline: 0.012 });
      t.position.set(Math.cos(a) * r, 0.55, Math.sin(a) * r);
      t.rotation.set(Math.sin(a) * (ring ? 0.2 : 0.55), 0, -Math.cos(a) * (ring ? 0.2 : 0.55));
      g.add(t);
    }
  }
  g.scale.setScalar(size);
  return g;
}

/** Spiky sea urchin. */
export function urchin(size = 1): THREE.Group {
  const g = new THREE.Group();
  const body = toonMesh(new THREE.SphereGeometry(0.28, 10, 8), 0x6e4a9a, { outline: 0.015 });
  body.position.y = 0.18;
  g.add(body);
  const spike = new THREE.ConeGeometry(0.035, 0.42, 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < 18; i++) {
    // Fibonacci sphere, upper half only.
    const y = 1 - (i / 17) * 1.1;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    v.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const s = toonMesh(spike, 0x8e6cc0, { outline: false });
    s.position.copy(v).multiplyScalar(0.36).add(new THREE.Vector3(0, 0.18, 0));
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    g.add(s);
  }
  g.scale.setScalar(size);
  return g;
}

// ------------------------------------------------------------------ village

function door(g: THREE.Group, x: number, y: number, z: number, ry: number, s = 1): void {
  const d = toonMesh(new THREE.CylinderGeometry(0.32 * s, 0.32 * s, 0.12, 14, 1, false, 0, Math.PI), DOOR, { outline: 0.015 });
  d.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  const slab = toonMesh(new THREE.BoxGeometry(0.64 * s, 0.5 * s, 0.12), DOOR, { outline: 0.015 });
  const holder = new THREE.Group();
  d.position.y = 0.5 * s;
  slab.position.y = 0.25 * s;
  holder.add(d, slab);
  holder.position.set(x, y, z);
  holder.rotation.y = ry;
  g.add(holder);
}

function porthole(g: THREE.Group, p: THREE.Vector3, normal: THREE.Vector3, r = 0.2): void {
  const rim = toonMesh(new THREE.TorusGeometry(r, 0.05, 6, 14), 0xf3d27a, { outline: 0.012 });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 14), toon(WINDOW, { emissive: 0x6a5a10 }));
  const holder = new THREE.Group();
  holder.add(rim, glass);
  holder.position.copy(p);
  holder.lookAt(p.clone().add(normal));
  g.add(holder);
}

/** A spiral conch-shell cottage with a round door. */
export function conchHouse(color: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    // Fat bottom whorl tapering to a pointed spire.
    const r = k < 0.35 ? 1.25 + Math.sin(k * 9) * 0.12 : 1.4 * Math.pow(1 - (k - 0.35) / 0.65, 1.3) + 0.04;
    pts.push(new THREE.Vector2(r, k * 3.6));
  }
  const shell = toonMesh(new THREE.LatheGeometry(pts, 20), color, { outline: 0.03 });
  g.add(shell);
  // Spiral ridge winding up the shell.
  const curvePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const k = i / 60;
    const y = 0.9 + k * 2.5;
    const kk = y / 3.6;
    const r = (kk < 0.35 ? 1.3 : 1.4 * Math.pow(1 - (kk - 0.35) / 0.65, 1.3) + 0.04) + 0.03;
    const a = k * Math.PI * 6;
    curvePts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const ridge = toonMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), 120, 0.08, 6), 0xfff1f4, { outline: 0.012 });
  g.add(ridge);
  door(g, 0, 0, 1.28, 0);
  porthole(g, new THREE.Vector3(0.9, 1.3, 0.9), new THREE.Vector3(1, 0, 1).normalize());
  porthole(g, new THREE.Vector3(-0.95, 1.1, 0.85), new THREE.Vector3(-1, 0, 1).normalize(), 0.16);
  g.scale.setScalar(size);
  return g;
}

/** A round sea-urchin dome house with a stubby chimney. */
export function domeHouse(color: number, spikes: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  const dome = toonMesh(new THREE.SphereGeometry(1.4, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), color, { outline: 0.03 });
  dome.scale.y = 0.95;
  g.add(dome);
  const spike = new THREE.ConeGeometry(0.1, 0.5, 5);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996;
    const y = 0.35 + (i / 14) * 0.6;
    const r = Math.sqrt(1 - y * y);
    const n = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (n.z > 0.75 && n.y < 0.6) continue; // keep the doorway clear
    const s = toonMesh(spike, spikes, { outline: 0.012 });
    s.position.copy(n).multiplyScalar(1.38).setY(n.y * 1.38 * 0.95);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    g.add(s);
  }
  door(g, 0, 0, 1.3, 0);
  porthole(g, new THREE.Vector3(1.0, 0.85, 0.82), new THREE.Vector3(1, 0.2, 1).normalize());
  const chim = toonMesh(new THREE.CylinderGeometry(0.2, 0.25, 0.7, 10), 0xf3d27a, { outline: 0.015 });
  chim.position.set(-0.5, 1.45, -0.3);
  g.add(chim);
  g.scale.setScalar(size);
  return g;
}

/** Scallop shell (a fan of ribs) used for awnings and the clam. */
export function scallopGeo(radius: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, 24, 8, Math.PI * 0.05, Math.PI * 0.9, 0, Math.PI / 2);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Ribbed: push out in waves around the fan.
    const a = Math.atan2(v.z, v.x);
    const k = 1 + Math.abs(Math.sin(a * 9)) * 0.06 * (v.length() / radius);
    pos.setXYZ(i, v.x * k, v.y * 0.45, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Giant clam: bottom shell, a hinged lid and a glowing pearl. */
export function giantClam(): { group: THREE.Group; lid: THREE.Object3D; pearl: THREE.Object3D } {
  const group = new THREE.Group();
  const shellGeo = new THREE.SphereGeometry(2.6, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const pos = shellGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    // Wavy lip so the two halves interlock like a real giant clam.
    const lip = Math.sin(a * 6) * 0.25 * (1 - Math.abs(v.y) / 2.6);
    pos.setXYZ(i, v.x, v.y * 0.5 + lip, v.z * 0.8);
  }
  shellGeo.computeVertexNormals();
  const bottom = toonMesh(shellGeo, 0xb6a6f0, { outline: 0.04 });
  bottom.position.y = 1.3;
  const flesh = toonMesh(new THREE.SphereGeometry(2.3, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x7fe3d0, { outline: false });
  flesh.scale.set(1, 0.18, 0.78);
  flesh.position.y = 1.3;
  group.add(bottom, flesh);
  const hinge = new THREE.Group();
  hinge.position.set(0, 1.3, -2.0);
  const top = toonMesh(shellGeo, 0xc8b8ff, { outline: 0.04 });
  top.rotation.x = Math.PI;
  top.position.z = 2.0;
  hinge.add(top);
  group.add(hinge);
  const pearl = new THREE.Group();
  const ball = toonMesh(new THREE.SphereGeometry(0.6, 20, 14), 0xfff8f0, { outline: 0.02, emissive: 0x3a3a46 });
  pearl.add(ball, glowSprite(0xfff3fb, 3.4, 0.55));
  pearl.position.set(0, 1.85, 0.2);
  group.add(pearl);
  return { group, lid: hinge, pearl };
}

/** Coral castle: rounded pink towers with shell spires and lit windows. */
export function coralCastle(): THREE.Group {
  const g = new THREE.Group();
  const towers: [number, number, number, number, number][] = [
    // x, z, radius, height, color
    [0, 0, 1.6, 6.5, CORAL.pink],
    [-2.3, 0.6, 1.05, 4.2, CORAL.peach],
    [2.3, 0.4, 1.1, 4.8, CORAL.lilac],
    [0.6, -2.0, 0.9, 3.6, CORAL.coral],
    [-1.2, 2.0, 0.8, 2.6, CORAL.butter],
  ];
  for (const [x, z, r, h, c] of towers) {
    const body = toonMesh(new THREE.CylinderGeometry(r * 0.88, r, h, 18), c, { outline: 0.03 });
    body.position.set(x, h / 2, z);
    g.add(body);
    // Lumpy coral bands round each tower.
    for (let b = 1; b < h / 1.4; b++) {
      const band = toonMesh(new THREE.TorusGeometry(r * (0.95 - b * 0.02), 0.12, 6, 20), c, { outline: 0.015 });
      band.rotation.x = Math.PI / 2;
      band.position.set(x, b * 1.4, z);
      g.add(band);
    }
    // Spiral shell spire on top.
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      pts.push(new THREE.Vector2(r * 1.1 * Math.pow(1 - k, 1.4) + 0.02 + Math.sin(k * 14) * 0.06 * (1 - k), k * r * 2.2));
    }
    const spire = toonMesh(new THREE.LatheGeometry(pts, 16), 0xfff1f4, { outline: 0.02 });
    spire.position.set(x, h, z);
    g.add(spire);
    const ball = toonMesh(new THREE.SphereGeometry(0.16, 8, 6), Palette.yellow, { outline: 0.015 });
    ball.position.set(x, h + r * 2.2 + 0.1, z);
    g.add(ball);
    // Windows on the side facing the camera.
    for (let w = 0; w < Math.floor(h / 1.6); w++) {
      const a = Math.PI / 2 + (w % 2 ? 0.5 : -0.4);
      const p = new THREE.Vector3(x + Math.cos(a) * r * 0.93, 1.1 + w * 1.5, z + Math.sin(a) * r * 0.93);
      porthole(g, p, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0.22);
    }
  }
  door(g, 0, 0, 1.58, 0, 1.6);
  return g;
}

/** Hydrothermal vent chimney; the glowing mouth sits at `top`. */
export function ventChimney(height: number): { group: THREE.Group; top: number } {
  const g = new THREE.Group();
  let y = 0;
  let r = 0.9;
  for (let i = 0; i < 4; i++) {
    const h = height / 4;
    const seg = toonMesh(new THREE.CylinderGeometry(r * 0.78, r, h, 9), i % 2 ? ROCK_DARK : 0x8a7cb4, { outline: 0.025 });
    seg.position.y = y + h / 2;
    seg.rotation.y = i;
    g.add(seg);
    y += h;
    r *= 0.8;
  }
  const lip = toonMesh(new THREE.TorusGeometry(r * 0.95, 0.12, 6, 12), 0xffb68a, { outline: 0.015, emissive: 0x5a2a10 });
  lip.rotation.x = Math.PI / 2;
  lip.position.y = y;
  g.add(lip);
  const glow = glowSprite(0xffc08a, 2.4, 0.6);
  glow.position.y = y + 0.2;
  g.add(glow);
  return { group: g, top: y };
}

/** Rock arch spanning a path. */
export function rockArch(span: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(span / 2, 0.4, 8, 18, Math.PI);
  const arch = toonMesh(geo, ROCK, { outline: 0.03 });
  arch.scale.y = (height / span) * 2;
  g.add(arch);
  for (let i = 0; i < 6; i++) {
    const a = 0.3 + (i / 5) * (Math.PI - 0.6);
    const c = toonMesh(new THREE.SphereGeometry(0.28, 8, 6), CORAL_COLORS[i % CORAL_COLORS.length], { outline: 0.015 });
    c.position.set(Math.cos(a) * span * 0.5, Math.sin(a) * height + 0.35, 0.2 * (i % 2 ? 1 : -1));
    g.add(c);
  }
  return g;
}

/** Welcome sign: a driftwood board between two coral posts. */
export function reefSign(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = toonMesh(new THREE.CylinderGeometry(0.16, 0.2, 2.4, 8), CORAL.coral, { outline: 0.02 });
    post.position.set(s * 2, 1.2, 0);
    const knob = toonMesh(new THREE.SphereGeometry(0.26, 10, 8), CORAL.pink, { outline: 0.02 });
    knob.position.set(s * 2, 2.45, 0);
    g.add(post, knob);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(4.3, 1.05, 0.14),
    [toon(0xd9a878), toon(0xd9a878), toon(0xd9a878), toon(0xd9a878), toon(0xffffff, { map: textTexture('BUBBLE REEF', '#d9a878', '#5b3a6e', 512, 128, '900 76px system-ui, sans-serif') }), toon(0xd9a878)],
  );
  board.position.y = 1.75;
  board.castShadow = true;
  g.add(board);
  return g;
}

// ------------------------------------------------------------------ critters

/** Jellyfish: translucent bell with dangling tentacles. */
export function jellyfish(color: number): { group: THREE.Group; bell: THREE.Object3D; tentacles: THREE.Object3D[] } {
  const group = new THREE.Group();
  const bellMat = toon(color, { transparent: true, opacity: 0.78, emissive: 0x2a1030 });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
  bell.scale.y = 0.8;
  group.add(bell);
  const glow = glowSprite(color, 2.6, 0.35);
  glow.position.y = 0.2;
  group.add(glow);
  const tentacles: THREE.Object3D[] = [];
  const tGeo = new THREE.CylinderGeometry(0.035, 0.015, 1.6, 4);
  tGeo.translate(0, -0.8, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const t = new THREE.Mesh(tGeo, toon(0xffffff, { transparent: true, opacity: 0.7 }));
    t.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
    t.userData.phase = i;
    group.add(t);
    tentacles.push(t);
  }
  return { group, bell, tentacles };
}

/** Manta ray: a broad flat body with two flapping wings and a whip tail. Faces +z. */
export function mantaRay(): { group: THREE.Group; wings: THREE.Object3D[] } {
  const group = new THREE.Group();
  const body = toonMesh(new THREE.SphereGeometry(1, 14, 8), 0x6b7fc8, { outline: 0.03 });
  body.scale.set(0.9, 0.22, 1.3);
  const belly = toonMesh(new THREE.SphereGeometry(0.95, 12, 6), 0xeef2ff, { outline: false });
  belly.scale.set(0.82, 0.16, 1.2);
  belly.position.y = -0.06;
  group.add(body, belly);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.x = side * 0.7;
    const w = toonMesh(new THREE.SphereGeometry(1, 12, 6), 0x6b7fc8, { outline: 0.025 });
    w.scale.set(1.5, 0.1, 0.8);
    w.position.set(side * 1.2, 0, -0.2);
    w.rotation.y = side * 0.35;
    pivot.add(w);
    pivot.userData.side = side;
    group.add(pivot);
    wings.push(pivot);
  }
  const tail = toonMesh(new THREE.CylinderGeometry(0.03, 0.08, 2.4, 5), 0x5a6cb0, { outline: 0.012 });
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -2.4;
  group.add(tail);
  for (const s of [-1, 1]) {
    const horn = toonMesh(new THREE.CapsuleGeometry(0.1, 0.35, 2, 6), 0x5a6cb0, { outline: 0.012 });
    horn.rotation.x = Math.PI / 2;
    horn.position.set(s * 0.45, 0, 1.3);
    const eye = toonMesh(new THREE.SphereGeometry(0.07, 8, 6), Palette.ink, { outline: false });
    eye.position.set(s * 0.6, 0.14, 0.95);
    group.add(horn, eye);
  }
  return { group, wings };
}

/** Little yellow research submarine with a spinning propeller. Faces +z. */
export function submarine(): { group: THREE.Group; prop: THREE.Object3D; lamp: THREE.Sprite } {
  const group = new THREE.Group();
  const hull = toonMesh(new THREE.CapsuleGeometry(0.75, 2.2, 8, 16), Palette.yellow, { outline: 0.035 });
  hull.rotation.x = Math.PI / 2;
  group.add(hull);
  const tower = toonMesh(new THREE.CylinderGeometry(0.4, 0.5, 0.7, 14), Palette.yellow, { outline: 0.025 });
  tower.position.set(0, 0.85, 0.3);
  const scope = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), 0x8a7cb4, { outline: 0.012 });
  scope.position.set(0, 1.4, 0.4);
  const eyepiece = toonMesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), 0x8a7cb4, { outline: 0.012 });
  eyepiece.position.set(0, 1.7, 0.5);
  group.add(tower, scope, eyepiece);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      porthole(group, new THREE.Vector3(s * 0.74, 0.05, 0.8 - i * 0.7), new THREE.Vector3(s, 0, 0), 0.18);
    }
    const fin = toonMesh(new THREE.BoxGeometry(0.7, 0.06, 0.4), 0xffa65c, { outline: 0.012 });
    fin.position.set(s * 0.7, 0, -1.5);
    group.add(fin);
  }
  const rudder = toonMesh(new THREE.BoxGeometry(0.06, 0.8, 0.45), 0xffa65c, { outline: 0.012 });
  rudder.position.set(0, 0.2, -1.6);
  group.add(rudder);
  const prop = new THREE.Group();
  prop.position.z = -1.95;
  for (let i = 0; i < 3; i++) {
    const blade = toonMesh(new THREE.BoxGeometry(0.12, 0.6, 0.04), 0x8a7cb4, { outline: 0.01 });
    blade.position.y = 0.25;
    const arm = new THREE.Group();
    arm.rotation.z = (i / 3) * Math.PI * 2;
    blade.rotation.y = 0.4;
    arm.add(blade);
    prop.add(arm);
  }
  group.add(prop);
  const lamp = glowSprite(0xfff3b0, 2.2, 0.8);
  lamp.position.set(0, -0.1, 1.9);
  group.add(lamp);
  return { group, prop, lamp };
}

/** Octopus perched on a rock, one arm waving. */
export function octopus(color: number): { group: THREE.Group; arms: THREE.Object3D[] } {
  const group = new THREE.Group();
  const head = toonMesh(new THREE.SphereGeometry(0.6, 16, 12), color, { outline: 0.025 });
  head.scale.set(1, 1.15, 1);
  head.position.y = 0.9;
  group.add(head);
  for (const s of [-1, 1]) {
    const eye = toonMesh(new THREE.SphereGeometry(0.14, 10, 8), 0xffffff, { outline: 0.012 });
    eye.position.set(s * 0.22, 0.95, 0.5);
    const pupil = toonMesh(new THREE.SphereGeometry(0.07, 8, 6), Palette.ink, { outline: false });
    pupil.position.set(s * 0.22, 0.95, 0.62);
    group.add(eye, pupil);
  }
  const arms: THREE.Object3D[] = [];
  const seg = new THREE.CapsuleGeometry(0.1, 0.5, 2, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const root = new THREE.Group();
    root.position.set(Math.cos(a) * 0.35, 0.45, Math.sin(a) * 0.35);
    root.rotation.y = -a + Math.PI / 2;
    let parent: THREE.Object3D = root;
    const joints: THREE.Object3D[] = [];
    for (let j = 0; j < 3; j++) {
      const joint = new THREE.Group();
      if (j > 0) joint.position.y = 0.55;
      const m = toonMesh(seg, color, { outline: 0.012 });
      m.scale.setScalar(1 - j * 0.22);
      m.position.y = 0.27;
      joint.add(m);
      joint.rotation.z = j === 0 ? 1.9 : 0.35;
      parent.add(joint);
      joints.push(joint);
      parent = joint;
    }
    root.userData.joints = joints;
    root.userData.phase = i;
    group.add(root);
    arms.push(root);
  }
  return { group, arms };
}

/** Light shaft from the surface: two crossed additive gradient planes. */
let shaftTex: THREE.CanvasTexture | null = null;
export function lightShaft(width: number, height: number): THREE.Group {
  if (!shaftTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,255,255,0.9)');
    v.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    // Soft edges left and right.
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
    shaftTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: shaftTex,
    color: 0xd8fbff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, -height / 2, 0);
  const g = new THREE.Group();
  for (const ry of [0, Math.PI / 2]) {
    const p = new THREE.Mesh(geo, mat);
    p.rotation.y = ry;
    g.add(p);
  }
  return g;
}
