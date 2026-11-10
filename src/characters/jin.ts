import * as THREE from 'three';
import { toonMesh } from '../render/toon';
import type { CharacterDef } from './roster';

const HEAD_Y = 0.38;
const HEAD_R = 0.42;
const HAIR = 0x221c2c;
const TEAL = 0x45c4d6;
const TANGERINE = 0xffa24c;

/**
 * Jin: swept-up quiff, round glasses, a teal bomber jacket and headphones
 * slung around his neck. Kept in its own file so the roster only needs one line.
 */
export const JIN: CharacterDef = {
  id: 'jin',
  name: 'Jin',
  tagline: 'Speedruns everything.',
  colors: {
    accent: TEAL,
    skin: 0xf6d7b6,
    top: TEAL,
    sleeves: TEAL,
    bottom: 0x4a4860,
    shoes: 0xffffff,
  },
  face: { style: 'human', eyeColor: '#4a2f22' },
  decorate(rig) {
    const head = rig.head;

    // Short sides and back.
    const cap = toonMesh(new THREE.SphereGeometry(HEAD_R * 1.04, 32, 16, 0, Math.PI * 2, 0, 1.05), HAIR);
    cap.position.y = HEAD_Y;
    head.add(cap);

    // Tall quiff: tapered locks rising off the forehead and sweeping back,
    // tallest at the front so his silhouette reads from across the board.
    const lockGeo = new THREE.ConeGeometry(0.13, 0.42, 12);
    const locks: [number, number, number, number][] = [
      // x, z, tilt back, scale
      [-0.2, 0.2, 0.75, 0.85],
      [-0.05, 0.24, 0.5, 1.2],
      [0.12, 0.2, 0.6, 1.05],
      [0.26, 0.1, 0.9, 0.75],
      [-0.12, 0.02, 1.0, 0.95],
      [0.08, 0.0, 1.05, 0.95],
      [-0.02, -0.18, 1.45, 0.8],
    ];
    for (const [x, z, tilt, k] of locks) {
      const m = toonMesh(lockGeo, HAIR, { outline: 0.02 });
      m.scale.setScalar(k);
      m.position.set(x, HEAD_Y + 0.34 + k * 0.06, z);
      m.rotation.set(-tilt, 0, -x * 0.9);
      head.add(m);
    }
    // Rounded base so the locks grow out of a full head of hair.
    const base = toonMesh(new THREE.SphereGeometry(0.3, 20, 12), HAIR, { outline: 0.02 });
    base.scale.set(1.25, 0.6, 1.2);
    base.position.set(0.02, HEAD_Y + 0.33, 0.04);
    head.add(base);

    // Round glasses sitting just off the painted eyes.
    const frame = 0x2b2440;
    const ring = new THREE.TorusGeometry(0.085, 0.014, 8, 28);
    for (const side of [-1, 1]) {
      const lens = toonMesh(ring, frame, { outline: false });
      lens.position.set(side * 0.125, HEAD_Y + 0.025, 0.43);
      lens.rotation.y = side * 0.28;
      head.add(lens);
      const arm = toonMesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 6), frame, { outline: false });
      arm.rotation.x = Math.PI / 2;
      arm.position.set(side * 0.38, HEAD_Y + 0.04, 0.24);
      arm.rotation.z = side * 0.12;
      head.add(arm);
    }
    const bridge = toonMesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), frame, { outline: false });
    bridge.position.set(0, HEAD_Y + 0.04, 0.455);
    head.add(bridge);

    // Bomber jacket: ribbed collar, hem and cuffs, plus the white tee in the open zip.
    const rib = (radius: number, tube: number) =>
      toonMesh(new THREE.TorusGeometry(radius, tube, 8, 28), TANGERINE, { outline: 0.015 });
    const collar = rib(0.19, 0.05);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.6;
    rig.torso.add(collar);
    const hem = rib(0.29, 0.045);
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(1.08, 0.92, 1);
    hem.position.y = 0.1;
    rig.torso.add(hem);
    for (const arm of [rig.armL, rig.armR]) {
      const cuff = rib(0.08, 0.03);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.31;
      arm.add(cuff);
    }
    const zip = toonMesh(new THREE.BoxGeometry(0.025, 0.4, 0.06), TANGERINE, { outline: false });
    zip.position.set(0, 0.35, 0.25);
    rig.torso.add(zip);
    // Sleeve patch.
    const patch = toonMesh(new THREE.CircleGeometry(0.05, 16), TANGERINE, { outline: false });
    patch.position.set(-0.088, -0.12, 0);
    patch.rotation.y = -Math.PI / 2;
    rig.armL.add(patch);

    // Headphones resting around his neck, cups sitting on the collarbones.
    const phones = 0x3a3550;
    const band = toonMesh(new THREE.TorusGeometry(0.23, 0.028, 8, 24, Math.PI), phones, { outline: 0.012 });
    band.rotation.x = Math.PI / 2 + 0.25;
    band.position.set(0, 0.64, 0.02);
    band.rotation.z = Math.PI;
    rig.torso.add(band);
    for (const side of [-1, 1]) {
      const cup = toonMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 18), phones, { outline: 0.015 });
      cup.rotation.set(Math.PI / 2 - 0.5, 0, side * 0.5);
      cup.position.set(side * 0.2, 0.6, 0.17);
      rig.torso.add(cup);
      const pad = toonMesh(new THREE.CircleGeometry(0.065, 16), TEAL, { outline: false });
      pad.rotation.copy(cup.rotation);
      pad.rotateX(-Math.PI / 2);
      pad.position.copy(cup.position).add(new THREE.Vector3(0, 0.036, 0).applyEuler(cup.rotation));
      rig.torso.add(pad);
    }
  },
};
