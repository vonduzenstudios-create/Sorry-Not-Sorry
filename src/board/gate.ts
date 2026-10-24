import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';

/**
 * A wooden gate with a padlock that blocks a shortcut. `open(k)` slides the
 * bars down into the ground (0 = shut, 1 = open).
 */
export function makeGate(): THREE.Group & { open(k: number): void } {
  const wood = 0xc99a6b;
  const g = new THREE.Group() as THREE.Group & { open(k: number): void };
  for (const side of [-1, 1]) {
    const post = toonMesh(new THREE.BoxGeometry(0.28, 2.2, 0.28), wood, { outline: 0.03 });
    post.position.set(side * 1.1, 1.1, 0);
    const cap = toonMesh(new THREE.SphereGeometry(0.2, 12, 8), Palette.yellow, { outline: 0.02 });
    cap.position.set(side * 1.1, 2.3, 0);
    g.add(post, cap);
  }
  const beam = toonMesh(new THREE.BoxGeometry(2.6, 0.24, 0.3), wood, { outline: 0.03 });
  beam.position.y = 2.05;
  g.add(beam);

  const bars = new THREE.Group();
  const barGeo = new THREE.BoxGeometry(0.14, 1.7, 0.14);
  for (let i = 0; i < 5; i++) {
    const bar = toonMesh(barGeo, 0xe8c08f, { outline: 0.02 });
    bar.position.set(-0.76 + i * 0.38, 0.95, 0);
    bars.add(bar);
  }
  const rail = toonMesh(new THREE.BoxGeometry(1.9, 0.16, 0.18), wood, { outline: 0.02 });
  rail.position.y = 1.2;
  bars.add(rail);
  const lock = toonMesh(new THREE.BoxGeometry(0.42, 0.36, 0.2), Palette.yellow, { outline: 0.03 });
  lock.position.set(0, 1.15, 0.12);
  const shackle = toonMesh(new THREE.TorusGeometry(0.13, 0.04, 8, 16, Math.PI), 0x9a9aa8, { outline: false });
  shackle.position.set(0, 1.33, 0.12);
  bars.add(lock, shackle);
  g.add(bars);

  g.open = (k: number) => {
    bars.position.y = -1.9 * k;
    bars.visible = k < 0.99;
  };
  return g;
}
