import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';

/**
 * The Grudge: the board villain. A big grumpy purple blob with horns and a
 * tiny crown who shows up on villain spaces to take what he wants.
 */
export function makeGrudge(): THREE.Group {
  const g = new THREE.Group();
  const purple = 0x7a5aa8;
  const body = toonMesh(new THREE.SphereGeometry(1.1, 32, 20), purple, { outline: 0.05 });
  body.scale.set(1, 0.9, 0.95);
  body.position.y = 1.1;
  const belly = toonMesh(new THREE.SphereGeometry(0.75, 24, 16), Palette.lavender, { outline: false });
  belly.scale.set(1, 0.9, 0.5);
  belly.position.set(0, 0.95, 0.62);
  g.add(body, belly);

  for (const side of [-1, 1]) {
    const horn = toonMesh(new THREE.ConeGeometry(0.2, 0.6, 12), Palette.cream, { outline: 0.03 });
    horn.position.set(side * 0.55, 2.05, 0);
    horn.rotation.z = -side * 0.4;
    g.add(horn);
    const eye = toonMesh(new THREE.SphereGeometry(0.17, 16, 12), 0xffffff, { outline: 0.025 });
    eye.position.set(side * 0.33, 1.45, 0.88);
    const pupil = toonMesh(new THREE.SphereGeometry(0.08, 10, 8), Palette.ink, { outline: false });
    pupil.position.set(side * 0.31, 1.42, 1.03);
    const brow = toonMesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), Palette.ink, { outline: false });
    brow.position.set(side * 0.33, 1.68, 0.93);
    brow.rotation.z = side * 0.4;
    const foot = toonMesh(new THREE.SphereGeometry(0.32, 16, 12), 0x5b3f88, { outline: 0.03 });
    foot.scale.set(1, 0.6, 1.3);
    foot.position.set(side * 0.5, 0.15, 0.2);
    const arm = toonMesh(new THREE.SphereGeometry(0.3, 16, 12), purple, { outline: 0.03 });
    arm.scale.set(0.8, 1.2, 0.8);
    arm.position.set(side * 1.1, 1.0, 0.1);
    g.add(eye, pupil, brow, foot, arm);
  }
  const mouth = toonMesh(new THREE.TorusGeometry(0.28, 0.06, 8, 20, Math.PI), Palette.ink, { outline: false });
  mouth.position.set(0, 1.08, 0.98);
  g.add(mouth);
  const crown = toonMesh(new THREE.CylinderGeometry(0.32, 0.28, 0.3, 5), Palette.yellow, { outline: 0.03 });
  crown.position.set(0, 2.15, 0);
  g.add(crown);
  return g;
}
