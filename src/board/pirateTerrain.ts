import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toon } from '../render/toon';
import type { Space } from './types';

/*
 * Pirate Cove's sculpted ground: one heightfield shared by the island mesh
 * and the water shader, so beaches, cliffs and the foam lines that lap at
 * them always agree. Everything is a pure function of the board layout and
 * a fixed seed, so every peer builds the same coastline.
 */

/** Water surface height. */
export const SEA_LEVEL = -0.45;
/** Sea floor, far from any island. */
const FLOOR = -1.6;

/** One island blob: an ellipse with a beach rim and an optional hill or cone. */
export interface Isle {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Rotation of the ellipse (radians). */
  rot?: number;
  /** Height of the flat ground just behind the beach. */
  top?: number;
  /** Extra height of the hill in the middle. */
  hill?: number;
  /** How far (m) the hill takes to rise. */
  hillR?: number;
  /** Straight-sided volcano with a crater instead of a rounded hill. */
  cone?: boolean;
  grass?: number;
  /** Bare rock instead of grass. */
  rocky?: boolean;
}

/** Painted ground patches: plazas and dirt tracks. */
export interface Patch {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  color: number;
}

export interface TerrainSpec {
  spaces: Space[];
  /** Space ids that sit on planks over the water instead of on land. */
  overWater: Set<number>;
  isles: Isle[];
  patches: Patch[];
}

const MIN_X = -54;
const MIN_Z = -52;
const SIZE_X = 108;
const SIZE_Z = 90;
/** Metres per sample of the fine grid (texture); the mesh uses every other one. */
const STEP = 0.25;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 0x5ea) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Smooth noise in -0.5..0.5. */
export function fbm(x: number, z: number): number {
  return valueNoise(x * 0.22, z * 0.22) * 0.65 + valueNoise(x * 0.7 + 31, z * 0.7 - 17) * 0.35 - 0.5;
}

interface Sample {
  h: number;
  /** Metres inland from the waterline (negative out at sea). */
  inland: number;
  /** Index of the isle that won, or -1 for the path strip. */
  owner: number;
}

/** Builds the height function for a layout. */
export function heightField(spec: TerrainSpec): (x: number, z: number, out: Sample) => Sample {
  const edges: number[] = [];
  for (const s of spec.spaces) {
    for (const n of s.next) {
      if (spec.overWater.has(s.id) || spec.overWater.has(n)) continue;
      const t = spec.spaces[n];
      edges.push(s.pos.x, s.pos.z, t.pos.x, t.pos.z);
    }
  }
  const isles = spec.isles.map((i) => ({ ...i, cos: Math.cos(i.rot ?? 0), sin: Math.sin(i.rot ?? 0), reach2: (Math.max(i.rx, i.rz) + 6) ** 2 }));

  return (x, z, out) => {
    const n = fbm(x, z);
    // The strip of land the path runs along.
    let d2 = Infinity;
    for (let i = 0; i < edges.length; i += 4) {
      const ax = edges[i];
      const az = edges[i + 1];
      const bx = edges[i + 2];
      const bz = edges[i + 3];
      // Edges are short; anything 5 m outside their box can't be the nearest land.
      if (x < Math.min(ax, bx) - 5 || x > Math.max(ax, bx) + 5 || z < Math.min(az, bz) - 5 || z > Math.max(az, bz) + 5) continue;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const px = ax + dx * t - x;
      const pz = az + dz * t - z;
      d2 = Math.min(d2, px * px + pz * pz);
    }
    const d = Math.sqrt(d2);
    // No noise right under the spaces, so they always sit on flat ground.
    const e = d - 1.9 + n * 0.8 * smooth(1.2, 2.4, d);
    out.h = e < 0 ? 0 : FLOOR * smooth(0, 2.2, e);
    out.inland = 0.65 - e;
    out.owner = -1;

    for (let k = 0; k < isles.length; k++) {
      const isle = isles[k];
      const ox = x - isle.x;
      const oz = z - isle.z;
      // Far from this isle it can't win the height or the beach test.
      if (ox * ox + oz * oz > isle.reach2) continue;
      const lx = ox * isle.cos - oz * isle.sin;
      const lz = ox * isle.sin + oz * isle.cos;
      const dist = Math.max(1e-4, Math.hypot(lx / isle.rx, lz / isle.rz));
      // Ellipse radius along this direction turns the distance into metres.
      const r = Math.hypot(lx, lz);
      const along = r > 1e-3 ? r / dist : Math.min(isle.rx, isle.rz);
      const m = (1 - dist) * along - n * 1.6;
      const top = isle.top ?? 0;
      let h: number;
      if (m >= 0) {
        const k2 = Math.max(0, (m - 1.4) / (isle.hillR ?? 4));
        if (isle.cone) {
          const c = Math.min(1, k2);
          h = top + (isle.hill ?? 0) * c;
          // Scoop a crater out of the summit.
          if (c > 0.86) h -= (c - 0.86) * (isle.hill ?? 0) * 1.6;
        } else {
          h = top + (isle.hill ?? 0) * smooth(0, 1, k2);
        }
      } else {
        h = top + (FLOOR - top) * smooth(0, 2.2 + top * 0.6, -m);
      }
      if (h > out.h) {
        out.h = h;
        out.owner = k;
      }
      out.inland = Math.max(out.inland, m + 0.65 + top);
    }
    return out;
  };
}

export interface Terrain {
  mesh: THREE.Mesh;
  /** Heights for the water shader, encoded -1.6..0.6 into one byte. */
  heightTex: THREE.DataTexture;
  bounds: THREE.Vector4;
  /** Ground height lookup for placing props. */
  heightAt(x: number, z: number): number;
  /** Metres inland from the waterline at a point (negative at sea). */
  inlandAt(x: number, z: number): number;
}

const SAND = Palette.sand;
const DAMP = 0xedd39e;
const ROCK = 0xd2c6de;
const ROCK_DARK = 0xb8aacb;
const LAVA = 0xff9a76;

const glsl = (hex: number) => {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

/** Toon material whose colour comes from the per-vertex ground fields. */
function groundMaterial(): THREE.MeshToonMaterial {
  const mat = toon(0xffffff);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aF1;
        attribute vec4 aF2;
        attribute vec3 aGrass;
        attribute vec3 aPatch;
        varying vec4 vF1;
        varying vec4 vF2;
        varying vec3 vGrass;
        varying vec3 vPatch;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vF1 = aF1;
        vF2 = aF2;
        vGrass = aGrass;
        vPatch = aPatch;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vF1;
        varying vec4 vF2;
        varying vec3 vGrass;
        varying vec3 vPatch;`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 g = vGrass * (vF2.z > 0.12 ? 0.94 : vF2.z < -0.22 ? 1.04 : 1.0);
        if (vF2.x > 0.0) g = vPatch;
        vec3 c = vF1.x > 0.0 ? g : ${glsl(SAND)};
        if (vF1.z > 0.0) c = vF2.y > 0.0 ? ${glsl(ROCK_DARK)} : ${glsl(ROCK)};
        if (vF1.w > 0.0) c = ${glsl(LAVA)};
        if (vF1.y < 0.0) c = ${glsl(DAMP)};
        vec4 diffuseColor = vec4( c, opacity );`,
      );
  };
  return mat;
}

export function buildTerrain(spec: TerrainSpec): Terrain {
  const field = heightField(spec);
  const W = Math.round(SIZE_X / STEP) + 1;
  const D = Math.round(SIZE_Z / STEP) + 1;
  const heights = new Float32Array(W * D);
  const inland = new Float32Array(W * D);
  const owner = new Int8Array(W * D);
  const s: Sample = { h: 0, inland: 0, owner: -1 };
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      field(MIN_X + i * STEP, MIN_Z + j * STEP, s);
      const k = j * W + i;
      heights[k] = s.h;
      inland[k] = s.inland;
      owner[k] = s.owner;
    }
  }

  const at = (i: number, j: number) => heights[Math.min(D - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];

  // The mesh uses every other sample and skips cells deep under the sea.
  // Each vertex carries signed "distance to the next colour" fields; the
  // shader thresholds them per pixel, so beaches and grass get smooth,
  // crisp edges instead of stair-stepped texels.
  const MW = (W + 1) >> 1;
  const MD = (D + 1) >> 1;
  const count = MW * MD;
  const pos = new Float32Array(count * 3);
  const f1 = new Float32Array(count * 4);
  const f2 = new Float32Array(count * 4);
  const grass = new Float32Array(count * 3);
  const patch = new Float32Array(count * 3);
  const col = new THREE.Color();
  for (let j = 0; j < MD; j++) {
    for (let i = 0; i < MW; i++) {
      const fi = Math.min(W - 1, i * 2);
      const fj = Math.min(D - 1, j * 2);
      const k = j * MW + i;
      const fk = fj * W + fi;
      const x = MIN_X + fi * STEP;
      const z = MIN_Z + fj * STEP;
      const h = heights[fk];
      pos.set([x, h, z], k * 3);
      const slope = Math.hypot(at(fi + 1, fj) - at(fi - 1, fj), at(fi, fj + 1) - at(fi, fj - 1)) / (2 * STEP);
      const n = fbm(x * 2.3, z * 2.3);
      const isle = owner[fk] >= 0 ? spec.isles[owner[fk]] : null;
      const inl = inland[fk];
      let rock = slope - (0.85 + n * 0.3);
      if (isle?.rocky) rock = Math.max(rock, 1);
      if (isle?.cone) rock = Math.max(rock, h - (2.2 + n * 1.5));
      const lava = isle?.cone ? Math.min(h - (isle.hill ?? 0) * 0.78, 0.55 - slope) : -1;
      f1.set([inl - (1.15 + n * 0.5), Math.min(inl - 0.35, h - SEA_LEVEL - 0.1), rock, lava], k * 4);
      // Plazas and tracks.
      let best = -9;
      let pc = 0;
      for (const p of spec.patches) {
        const dx = p.bx - p.ax;
        const dz = p.bz - p.az;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - p.ax) * dx + (z - p.az) * dz) / len2)) : 0;
        const v = p.r - Math.hypot(p.ax + dx * t - x, p.az + dz * t - z) + n * 0.4;
        if (v > best) {
          best = v;
          pc = p.color;
        }
      }
      f2.set([best, h - (6.5 + n), n, 0], k * 4);
      col.setHex(isle?.grass ?? Palette.grass, THREE.SRGBColorSpace).toArray(grass, k * 3);
      col.setHex(pc, THREE.SRGBColorSpace).toArray(patch, k * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < MD - 1; j++) {
    for (let i = 0; i < MW - 1; i++) {
      const a = j * MW + i;
      const b = a + 1;
      const c = a + MW;
      const d = c + 1;
      const top = Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]);
      if (top < FLOOR + 0.25) continue;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aF1', new THREE.BufferAttribute(f1, 4));
  geo.setAttribute('aF2', new THREE.BufferAttribute(f2, 4));
  geo.setAttribute('aGrass', new THREE.BufferAttribute(grass, 3));
  geo.setAttribute('aPatch', new THREE.BufferAttribute(patch, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, groundMaterial());
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  const bytes = new Uint8Array(W * D);
  for (let k = 0; k < W * D; k++) bytes[k] = Math.round(Math.min(1, Math.max(0, (heights[k] - FLOOR) / 2.2)) * 255);
  const heightTex = new THREE.DataTexture(bytes, W, D, THREE.RedFormat, THREE.UnsignedByteType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  const heightAt = (x: number, z: number) => {
    const fi = (x - MIN_X) / STEP;
    const fj = (z - MIN_Z) / STEP;
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const tx = fi - i;
    const tz = fj - j;
    return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz;
  };
  const probe: Sample = { h: 0, inland: 0, owner: -1 };
  const inlandAt = (x: number, z: number) => field(x, z, probe).inland;
  return { mesh, heightTex, inlandAt, bounds: new THREE.Vector4(MIN_X - STEP / 2, MIN_Z - STEP / 2, W * STEP, D * STEP), heightAt };
}

/**
 * Banded cel water that reads the island heights: turquoise shallows, a
 * foam collar on every beach and a second foam line that rolls in to shore.
 */
export function waterMaterial(terrain: Terrain): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      heightMap: { value: terrain.heightTex },
      bounds: { value: terrain.bounds },
      deep: { value: new THREE.Color(0x74c2ea) },
      light: { value: new THREE.Color(0xa0dcf5) },
      shallow: { value: new THREE.Color(0x96e4e2) },
      foam: { value: new THREE.Color(0xf4fcff) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vXZ = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform sampler2D heightMap;
      uniform vec4 bounds;
      uniform vec3 deep;
      uniform vec3 light;
      uniform vec3 shallow;
      uniform vec3 foam;
      varying vec2 vXZ;
      void main() {
        vec2 uv = (vXZ - bounds.xy) / bounds.zw;
        float h = texture2D(heightMap, uv).r * 2.2 - 1.6;
        // Outside the map it's open sea.
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) h = -1.6;
        float depth = ${SEA_LEVEL.toFixed(2)} - h;
        float w = sin(vXZ.x * 0.35 + time * 0.8) + sin(vXZ.y * 0.42 - time * 0.6 + vXZ.x * 0.15);
        vec3 c = deep;
        if (w > 0.9) c = light;
        if (depth < 0.62 + w * 0.04) c = shallow;
        if (w > 1.75 && depth > 0.3) c = foam;
        // A wave rolls in every few seconds and fades as it reaches the beach.
        float k = fract(time * 0.22 + w * 0.03);
        float line = 0.6 - k * 0.5;
        if (abs(depth - line) < 0.025 + 0.02 * (1.0 - k) && k < 0.85) c = foam;
        if (depth < 0.1 + 0.05 * sin(time * 1.4 + vXZ.x * 0.3 + vXZ.y * 0.2)) c = foam;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
