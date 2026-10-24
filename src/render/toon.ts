import * as THREE from 'three';
import { Palette } from './palette';

const gradients = new Map<number, THREE.DataTexture>();

/** A tiny ramp texture that gives MeshToonMaterial its hard light bands. */
function gradientMap(bands: number): THREE.DataTexture {
  let tex = gradients.get(bands);
  if (tex) return tex;
  const data = new Uint8Array(bands * 4);
  for (let i = 0; i < bands; i++) {
    // Keep the darkest band fairly bright so pastels never turn muddy.
    const v = Math.round(255 * (0.62 + (0.38 * i) / Math.max(1, bands - 1)));
    data.set([v, v, v, 255], i * 4);
  }
  tex = new THREE.DataTexture(data, bands, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  gradients.set(bands, tex);
  return tex;
}

export interface ToonOptions {
  bands?: number;
  map?: THREE.Texture;
  emissive?: number;
  transparent?: boolean;
  opacity?: number;
}

export function toon(color: number, opts: ToonOptions = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(opts.bands ?? 3),
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

const outlineMaterials = new Map<string, THREE.ShaderMaterial>();

/** Inverted-hull material: pushes vertices out along normals and draws back faces in ink. */
function outlineMaterial(thickness: number, color: number): THREE.ShaderMaterial {
  const key = `${thickness}:${color}`;
  let mat = outlineMaterials.get(key);
  if (mat) return mat;
  mat = new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: thickness },
      color: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      uniform float thickness;
      void main() {
        vec3 p = position + normalize(normal) * thickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
  });
  outlineMaterials.set(key, mat);
  return mat;
}

/** Adds an ink outline to a mesh. Works best on smooth-normal geometry. */
export function outline<T extends THREE.Mesh>(mesh: T, thickness = 0.035, color: number = Palette.ink): T {
  const hull = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  hull.name = 'outline';
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}

/** Shorthand: toon mesh with outline and shadows. */
export function toonMesh(
  geometry: THREE.BufferGeometry,
  color: number,
  opts: ToonOptions & { outline?: number | false } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, toon(color, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (opts.outline !== false) outline(mesh, opts.outline ?? 0.035);
  return mesh;
}
