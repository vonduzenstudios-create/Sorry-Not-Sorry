import * as THREE from 'three';
import type { Space, SpaceType } from './types';

const CODES: Record<string, SpaceType> = {
  S: 'start',
  B: 'blue',
  R: 'red',
  H: 'happening',
  I: 'item',
  T: 'battle',
  V: 'villain',
};

/**
 * Builds a board graph from a closed main loop plus branches.
 * Space types are given as letter strings (one per space) so a board's
 * layout reads at a glance: "SBBRBIBH...". A '*' after a letter marks a
 * star candidate.
 */
export class BoardBuilder {
  readonly spaces: Space[] = [];
  private loopIds: number[] = [];

  /** Samples `types` evenly along a closed Catmull-Rom curve through `points` (x, z). */
  loop(points: [number, number][], types: string): this {
    const codes = parseCodes(types);
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    const pts = curve.getSpacedPoints(codes.length).slice(0, codes.length);
    this.loopIds = pts.map((p, i) => this.add(p, codes[i]));
    this.loopIds.forEach((id, i) => {
      this.spaces[id].next = [this.loopIds[(i + 1) % this.loopIds.length]];
    });
    return this;
  }

  /**
   * A side path leaving loop index `from` and rejoining at loop index `to`,
   * bending through `via` (x, z). Its spaces come from `types`.
   */
  branch(from: number, to: number, via: [number, number][], types: string): this {
    const codes = parseCodes(types);
    const a = this.spaces[this.loopIds[from]].pos;
    const b = this.spaces[this.loopIds[to]].pos;
    const curve = new THREE.CatmullRomCurve3(
      [a, ...via.map(([x, z]) => new THREE.Vector3(x, 0, z)), b],
      false,
      'centripetal',
    );
    // n + 2 points including both ends; keep the inner ones.
    const pts = curve.getSpacedPoints(codes.length + 1).slice(1, -1);
    const ids = pts.map((p, i) => this.add(p, codes[i]));
    ids.forEach((id, i) => {
      this.spaces[id].next = [i < ids.length - 1 ? ids[i + 1] : this.loopIds[to]];
    });
    this.spaces[this.loopIds[from]].next.push(ids[0]);
    return this;
  }

  loopId(index: number): number {
    return this.loopIds[index];
  }

  private add(pos: THREE.Vector3, code: { type: SpaceType; star: boolean }): number {
    const id = this.spaces.length;
    this.spaces.push({ id, type: code.type, pos: pos.clone(), next: [], starCandidate: code.star });
    return id;
  }
}

function parseCodes(s: string): { type: SpaceType; star: boolean }[] {
  const out: { type: SpaceType; star: boolean }[] = [];
  for (const ch of s.replace(/\s+/g, '')) {
    if (ch === '*') {
      out[out.length - 1].star = true;
      continue;
    }
    const type = CODES[ch];
    if (!type) throw new Error(`Unknown space code: ${ch}`);
    out.push({ type, star: false });
  }
  return out;
}

/** Steps from `from` to `to` along the shortest route (BFS), or Infinity. */
export function distance(spaces: Space[], from: number, to: number): number {
  const seen = new Map<number, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    const d = seen.get(id)!;
    if (id === to) return d;
    for (const n of spaces[id].next) {
      if (!seen.has(n)) {
        seen.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return Infinity;
}
