import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import type { CharacterDef } from './roster';

const HEAD_Y = 0.38;
const HEAD_R = 0.42;

/** Points spread evenly over a sphere down to height minY (Fibonacci lattice). */
function spherePoints(count: number, minY: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const span = (1 - minY) / 2;
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2 * span;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return pts;
}

/**
 * Nia: dancer with a big afro puff, coral head wrap, gold hoops, teal
 * jacket and a flared skirt over plum leggings.
 */
export const NIA: CharacterDef = {
  id: 'nia',
  name: 'Nia',
  tagline: 'Never misses a beat.',
  colors: {
    accent: 0x3fc9c9,
    skin: 0x5e3a24,
    top: 0x3fc9c9,
    sleeves: 0x3fc9c9,
    bottom: 0x6a4a8c,
    shoes: 0xffffff,
  },
  face: { style: 'human', eyeColor: '#3a2416', lashes: true },
  decorate(rig) {
    const hair = 0x23160f;
    const scarf = Palette.coral;
    // The wrap's plane tilts back: high on the forehead, low at the nape.
    const tilt = 0.45;
    const cap = toonMesh(new THREE.SphereGeometry(HEAD_R * 1.04, 32, 16, 0, Math.PI * 2, 0, 1.4), hair);
    cap.position.y = HEAD_Y;
    cap.rotation.x = -tilt;
    rig.head.add(cap);
    // Big afro puff crowning the head: a fluffy ball of curls.
    const puff = new THREE.Group();
    puff.position.set(0, HEAD_Y + 0.5, -0.12);
    const core = toonMesh(new THREE.SphereGeometry(0.3, 20, 14), hair, { outline: 0.03 });
    puff.add(core);
    const curl = new THREE.SphereGeometry(0.1, 10, 8);
    for (const p of spherePoints(30, -0.75)) {
      const c = toonMesh(curl, hair, { outline: 0.018 });
      c.position.copy(p.multiplyScalar(0.3));
      puff.add(c);
    }
    puff.scale.set(1.15, 0.95, 1.05);
    rig.head.add(puff);
    // Coral head wrap.
    const wrapR = HEAD_R * 1.06;
    const d = 0.12;
    const ringR = Math.sqrt(wrapR * wrapR - d * d);
    const band = toonMesh(new THREE.TorusGeometry(ringR, 0.06, 10, 40), scarf, { outline: 0.018 });
    band.rotation.x = Math.PI / 2 - tilt;
    band.position.set(0, HEAD_Y + d * Math.cos(tilt), -d * Math.sin(tilt));
    rig.head.add(band);
    // Bow tied on the band, up and off to one side of the forehead.
    const at = 0.85;
    const bow = new THREE.Group();
    bow.position
      .set(Math.sin(at), Math.cos(at) * Math.sin(tilt), Math.cos(at) * Math.cos(tilt))
      .multiplyScalar(ringR + 0.03)
      .add(band.position);
    bow.rotation.set(-0.3, at, -0.35);
    for (const side of [-1, 1]) {
      const loop = toonMesh(new THREE.SphereGeometry(0.09, 14, 10), scarf, { outline: 0.018 });
      loop.scale.set(1.4, 0.75, 0.55);
      loop.position.x = side * 0.11;
      loop.rotation.z = side * 0.35;
      bow.add(loop);
    }
    const knot = toonMesh(new THREE.SphereGeometry(0.055, 12, 8), scarf, { outline: 0.015 });
    bow.add(knot);
    rig.head.add(bow);
    // Big gold hoop earrings.
    for (const side of [-1, 1]) {
      const hoop = toonMesh(new THREE.TorusGeometry(0.09, 0.018, 8, 24), Palette.yellow, { outline: 0.012, emissive: 0x332200 });
      hoop.position.set(side * HEAD_R * 1.02, HEAD_Y - 0.15, 0.02);
      hoop.rotation.y = Math.PI / 2;
      rig.head.add(hoop);
    }
    // Flared skirt over the leggings.
    const skirt = toonMesh(new THREE.CylinderGeometry(0.27, 0.42, 0.3, 24, 1, true), Palette.butter, { outline: 0.025 });
    skirt.position.y = -0.02;
    rig.torso.add(skirt);
    // Cropped jacket trim and a star patch.
    const collar = toonMesh(new THREE.TorusGeometry(0.19, 0.045, 8, 24), Palette.cream, { outline: 0.015 });
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.6;
    rig.torso.add(collar);
    const patch = toonMesh(new THREE.CircleGeometry(0.07, 5), Palette.yellow, { outline: false });
    patch.position.set(0.13, 0.42, 0.262);
    rig.torso.add(patch);
  },
};
