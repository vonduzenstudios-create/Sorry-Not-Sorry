import * as THREE from 'three';
import type { MinigamePlayer } from './types';

/** Stick direction in world XZ (camera looks toward -Z). */
export function stick(p: MinigamePlayer): THREE.Vector3 {
  const c = p.controller;
  if (!c) return new THREE.Vector3();
  const v = new THREE.Vector3(c.stickX, 0, -c.stickY);
  if (v.lengthSq() > 1) v.normalize();
  return v;
}

/** Turns a character smoothly toward a movement direction. */
export function face(p: MinigamePlayer, dir: THREE.Vector3, dt: number): void {
  if (dir.lengthSq() < 0.01) return;
  const target = Math.atan2(dir.x, dir.z);
  const r = p.character.rotation;
  let diff = target - r.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  r.y += diff * Math.min(1, dt * 12);
}

/** Sets walk/idle pose from how fast the player is moving. */
export function moveAnim(p: MinigamePlayer, speed01: number): void {
  if (!p.alive) return;
  p.character.pose = speed01 > 0.08 ? 'walk' : 'idle';
  p.character.moveSpeed = Math.min(1, speed01);
}

/** Pushes overlapping circles apart (characters bumping into each other). */
export function separate(players: MinigamePlayer[], radius: number): void {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i].character.position;
      const b = players[j].character.position;
      const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
      const len = d.length();
      if (len > 0 && len < radius * 2) {
        d.multiplyScalar((radius * 2 - len) / len / 2);
        a.sub(d);
        b.add(d);
      }
    }
  }
}

/** Places players evenly on a circle facing the center. */
export function ring(players: MinigamePlayer[], radius: number, y = 0): void {
  players.forEach((p, i) => {
    const a = (i / players.length) * Math.PI * 2 + Math.PI / 2;
    p.character.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
    p.character.rotation.y = Math.atan2(-p.character.position.x, -p.character.position.z);
  });
}

/** Knocked out: tumble and fall out of sight. */
export function knockOut(p: MinigamePlayer, push = new THREE.Vector3()): void {
  if (!p.alive) return;
  p.alive = false;
  p.character.pose = 'jump';
  p.character.setExpression('surprised');
  p.data.fall = { vel: push.clone().add(new THREE.Vector3(0, 6, 0)), spin: 6 + Math.random() * 4 };
}

/** Advances a knocked-out player's fall. Call every frame for dead players. */
export function fall(p: MinigamePlayer, dt: number, floor = -30): void {
  const f = p.data.fall as { vel: THREE.Vector3; spin: number } | undefined;
  if (!f) return;
  const pos = p.character.position;
  if (pos.y < floor) {
    p.character.visible = false;
    return;
  }
  f.vel.y -= 25 * dt;
  pos.addScaledVector(f.vel, dt);
  p.character.rotation.x += f.spin * dt;
}

/**
 * CPU button mashing at a steady rate (presses per second). Deterministic:
 * driven only by dt, so every online peer sees the same presses.
 */
export function cpuMash(p: MinigamePlayer, rate: number, dt: number): boolean {
  const t = ((p.data.mashT as number | undefined) ?? 0) + dt * rate;
  p.data.mashT = t % 1;
  return t >= 1;
}

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];

/** A fresh flick of the stick or d-pad this frame (edge-triggered), or null. */
export function dirPressed(p: MinigamePlayer): Dir | null {
  const c = p.controller;
  if (!c) return null;
  const x = c.stickX;
  const y = c.stickY;
  let d: Dir | null = null;
  if (Math.max(Math.abs(x), Math.abs(y)) > 0.6) d = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'up' : 'down';
  const prev = p.data.lastDir as Dir | null | undefined;
  p.data.lastDir = d;
  return d && d !== prev ? d : null;
}

/** The standard score strip under the clock. */
export function scorePanel(overlay: HTMLDivElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'mg-score panel';
  overlay.appendChild(el);
  return el;
}

/** Players with the top score (all of them on a tie), or nobody if the best is `floor` or less. */
export function topScorers(players: MinigamePlayer[], score: (p: MinigamePlayer) => number, floor = -Infinity): number[] {
  const best = Math.max(...players.map(score));
  if (best <= floor) return [];
  return players.filter((p) => score(p) === best).map((p) => p.seat);
}
