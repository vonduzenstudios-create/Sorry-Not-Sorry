import * as THREE from 'three';
import { Palette } from '../render/palette';
import { makeCloud, makeCoin } from '../render/props';
import { toonMesh } from '../render/toon';
import { glowSprite } from './decor';
import type { Space } from './types';

/** Board health. Hitting 0 knocks a player out: they drop coins and respawn at the start. */
export const MAX_HP = 10;
/** Share of a knocked-out player's coins that spill onto the board. */
export const KO_DROP = 0.5;
/** Spilled coins land on spaces up to this many steps (either direction) from the KO. */
export const SCATTER_RANGE = 2;

/** A pile of spilled coins on a space; anyone but `owner` scoops it up by walking past. */
export interface CoinPile {
  spaceId: number;
  owner: number;
  amount: number;
}

/** A Snap Trap hidden on a space; it bites the first rival of `owner` to step on it. */
export interface Trap {
  spaceId: number;
  owner: number;
}

/** Spaces you can reach in both directions, so ranges reach players behind you too. */
export function neighbors(spaces: Space[]): number[][] {
  const out = spaces.map(() => [] as number[]);
  for (const s of spaces) {
    for (const n of s.next) {
      if (!out[s.id].includes(n)) out[s.id].push(n);
      if (!out[n].includes(s.id)) out[n].push(s.id);
    }
  }
  return out;
}

/** Every space within `range` steps of `from`, in BFS order, with its distance. */
export function within(adj: number[][], from: number, range: number): Map<number, number> {
  const seen = new Map<number, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    const d = seen.get(id)!;
    if (d >= range) continue;
    for (const n of adj[id]) {
      if (!seen.has(n)) {
        seen.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** The `n` spaces ahead of `from` along the main path (first exit at junctions). */
export function pathAhead(spaces: Space[], from: number, n: number): number[] {
  const out: number[] = [];
  let id = from;
  for (let i = 0; i < n; i++) {
    id = spaces[id].next[0];
    out.push(id);
  }
  return out;
}

// ------------------------------------------------------------------ meshes

/** A cork-and-fizz cannonball. */
export function makeCork(): THREE.Mesh {
  const cork = toonMesh(new THREE.CylinderGeometry(0.22, 0.3, 0.45, 16), 0xd9a066, { outline: 0.03 });
  cork.add(glowSprite(Palette.yellow, 1.1, 0.7));
  return cork;
}

/** Storm cloud plus a zig-zag bolt that hangs under it (hidden until it strikes). */
export function makeStorm(): THREE.Group & { bolt: THREE.Object3D } {
  const g = new THREE.Group() as THREE.Group & { bolt: THREE.Object3D };
  const cloud = makeCloud(0.9);
  cloud.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name !== 'outline') (o.material as THREE.MeshToonMaterial).color.setHex(0x8a86a8);
  });
  g.add(cloud);
  const bolt = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: Palette.yellow });
  // Jagged bolt: short segments that kink left and right on the way down.
  const pts = [
    [0, -0.4],
    [0.35, -1.4],
    [-0.25, -2.4],
    [0.3, -3.4],
    [-0.1, -4.6],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(pts[i][0], pts[i][1], 0);
    const b = new THREE.Vector3(pts[i + 1][0], pts[i + 1][1], 0);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, a.distanceTo(b), 6), mat);
    seg.position.lerpVectors(a, b, 0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    bolt.add(seg);
  }
  bolt.add(glowSprite(Palette.yellow, 3, 0.9));
  bolt.children[bolt.children.length - 1].position.y = -4.4;
  bolt.visible = false;
  g.add(bolt);
  g.bolt = bolt;
  return g;
}

/** Spring-loaded jaws in the owner's color, sitting on a space. */
export function makeTrap(color: number): THREE.Group {
  const g = new THREE.Group();
  const base = toonMesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 20), 0x8c8c9c, { outline: 0.025 });
  base.position.y = 0.06;
  const ring = toonMesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), color, { outline: false });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  g.add(base, ring);
  const tooth = new THREE.ConeGeometry(0.08, 0.26, 4);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = toonMesh(tooth, 0xe8e8f0, { outline: false });
    t.position.set(Math.cos(a) * 0.45, 0.26, Math.sin(a) * 0.45);
    g.add(t);
  }
  return g;
}

/** Big rolling stone with a bowling-ball finger grip. */
export function makeBoulder(): THREE.Group {
  const g = new THREE.Group();
  const ball = toonMesh(new THREE.IcosahedronGeometry(0.9, 1), 0xb49a7a, { outline: 0.05 });
  ball.castShadow = true;
  g.add(ball);
  for (const [x, y] of [
    [-0.22, 0.35],
    [0.22, 0.35],
    [0, 0.05],
  ]) {
    const hole = toonMesh(new THREE.SphereGeometry(0.12, 8, 6), Palette.ink, { outline: false });
    hole.position.set(x, y, 0.82);
    ball.add(hole);
  }
  return g;
}

/** Flat shockwave ring for the Quake Drum. */
export function makeShockwave(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

/** A little coin stack; taller for bigger piles. */
export function makePile(amount: number): THREE.Group {
  const g = new THREE.Group();
  const n = Math.min(5, 1 + Math.floor(amount / 3));
  for (let i = 0; i < n; i++) {
    const c = makeCoin(0.28);
    c.rotation.x = 0;
    c.position.set(Math.sin(i * 2.4) * 0.08, 0.05 + i * 0.08, Math.cos(i * 2.4) * 0.08);
    g.add(c);
  }
  return g;
}
