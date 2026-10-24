import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import type { Rig } from './character';
import type { FaceOptions } from './face';

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  robot?: boolean;
  colors: {
    accent: number;
    skin: number;
    top: number;
    sleeves?: number;
    bottom: number;
    shoes: number;
  };
  face: FaceOptions;
  decorate?: (rig: Rig, def: CharacterDef) => void;
}

const HEAD_Y = 0.38;
const HEAD_R = 0.42;

/** Top-of-head cap: a slightly larger partial sphere over the skull. */
function hairCap(color: number, coverage = 1.15, scale = 1.06): THREE.Mesh {
  const cap = toonMesh(new THREE.SphereGeometry(HEAD_R * scale, 32, 16, 0, Math.PI * 2, 0, coverage), color);
  cap.position.y = HEAD_Y;
  return cap;
}

/** Points spread evenly over a sphere's upper part (Fibonacci lattice). */
function topPoints(count: number, minY: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count * 3 && pts.length < count; i++) {
    const y = 1 - (i / (count * 3 - 1)) * 2;
    if (y < minY) break;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return pts;
}

export const ROSTER: CharacterDef[] = [
  {
    id: 'rex',
    name: 'Rex',
    tagline: 'All gas, no brakes.',
    colors: {
      accent: Palette.coral,
      skin: 0xffd9c2,
      top: Palette.coral,
      bottom: 0x6f7fb8,
      shoes: 0xffffff,
    },
    face: { style: 'human', eyeColor: '#4a8fd8' },
    decorate(rig) {
      const hair = 0x8a5634;
      rig.head.add(hairCap(hair, 1.0));
      // Front swoop.
      const swoop = toonMesh(new THREE.SphereGeometry(0.26, 20, 12), hair, { outline: 0.025 });
      swoop.scale.set(1.3, 0.55, 0.9);
      swoop.position.set(0.1, HEAD_Y + 0.33, 0.2);
      swoop.rotation.z = -0.35;
      rig.head.add(swoop);
      // Hood bunched behind the neck, plus drawstrings.
      const hood = toonMesh(new THREE.TorusGeometry(0.24, 0.09, 10, 24), Palette.coral, { outline: 0.02 });
      hood.rotation.x = Math.PI / 2 + 0.3;
      hood.position.set(0, 0.62, -0.06);
      rig.torso.add(hood);
      for (const side of [-1, 1]) {
        const s = toonMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), 0xffffff, { outline: false });
        s.position.set(side * 0.08, 0.5, 0.27);
        rig.torso.add(s);
      }
    },
  },
  {
    id: 'ivy',
    name: 'Ivy',
    tagline: 'Plans three moves ahead.',
    colors: {
      accent: Palette.violet,
      skin: 0xffe3d0,
      top: Palette.violet,
      sleeves: Palette.violet,
      bottom: 0x5b4a8a,
      shoes: 0xffffff,
    },
    face: { style: 'human', eyeColor: '#3fa86a', lashes: true },
    decorate(rig) {
      const hair = 0xf2b84b;
      rig.head.add(hairCap(hair, 1.25));
      const bangs = toonMesh(new THREE.SphereGeometry(0.3, 20, 12), hair, { outline: 0.025 });
      bangs.scale.set(1.4, 0.45, 0.8);
      bangs.position.set(-0.05, HEAD_Y + 0.3, 0.22);
      bangs.rotation.z = 0.2;
      rig.head.add(bangs);
      const tie = toonMesh(new THREE.TorusGeometry(0.08, 0.035, 8, 16), Palette.rose, { outline: 0.015 });
      tie.position.set(0, HEAD_Y + 0.22, -0.43);
      rig.head.add(tie);
      const tail = toonMesh(new THREE.CapsuleGeometry(0.12, 0.34, 6, 12), hair, { outline: 0.025 });
      tail.position.set(0, HEAD_Y - 0.02, -0.5);
      tail.rotation.x = 0.35;
      rig.head.add(tail);
      // Side locks frame the face.
      for (const side of [-1, 1]) {
        const lock = toonMesh(new THREE.CapsuleGeometry(0.08, 0.26, 4, 10), hair, { outline: 0.02 });
        lock.position.set(side * 0.39, HEAD_Y - 0.1, -0.04);
        lock.rotation.z = side * 0.12;
        rig.head.add(lock);
      }
      // Cream shirt peeking out of the open jacket.
      const shirt = toonMesh(new THREE.BoxGeometry(0.1, 0.32, 0.05), Palette.cream, { outline: false });
      shirt.position.set(0, 0.36, 0.255);
      rig.torso.add(shirt);
    },
  },
  {
    id: 'marcus',
    name: 'Marcus',
    tagline: 'Smooth moves, big heart.',
    colors: {
      accent: Palette.green,
      skin: 0x8d5a3b,
      top: Palette.green,
      sleeves: Palette.cream,
      bottom: 0x3f4f7a,
      shoes: 0xffffff,
    },
    face: { style: 'human', eyeColor: '#5a3a24' },
    decorate(rig) {
      const hair = 0x2a1a14;
      rig.head.add(hairCap(hair, 0.9, 1.03));
      // Curly top: a cluster of small spheres.
      const curl = new THREE.SphereGeometry(0.1, 10, 8);
      for (const p of topPoints(34, 0.42)) {
        const c = toonMesh(curl, hair, { outline: 0.018 });
        c.position.copy(p.multiplyScalar(HEAD_R * 1.08)).add(new THREE.Vector3(0, HEAD_Y + 0.04, 0));
        rig.head.add(c);
      }
      // Varsity jacket trim.
      const collar = toonMesh(new THREE.TorusGeometry(0.2, 0.05, 8, 24), Palette.cream, { outline: 0.015 });
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.6;
      rig.torso.add(collar);
      const letter = toonMesh(new THREE.CircleGeometry(0.08, 20), Palette.cream, { outline: false });
      letter.position.set(-0.13, 0.4, 0.262);
      rig.torso.add(letter);
    },
  },
  {
    id: 'bolt',
    name: 'Bolt',
    tagline: 'Beep boop. Sorry not sorry.',
    robot: true,
    colors: {
      accent: Palette.yellow,
      skin: 0xc9c4d6,
      top: Palette.yellow,
      bottom: 0xb6b1c6,
      shoes: 0x8b86a0,
    },
    face: { style: 'robot', eyeColor: '#7ff0ff', screen: '#2b2440' },
    decorate(rig, def) {
      const stalk = toonMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 8), def.colors.bottom, { outline: 0.015 });
      stalk.position.y = 0.9;
      const bulb = toonMesh(new THREE.SphereGeometry(0.08, 16, 12), Palette.coral, { outline: 0.02, emissive: 0x551111 });
      bulb.position.y = 1.06;
      rig.head.add(stalk, bulb);
      for (const side of [-1, 1]) {
        const ear = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16), def.colors.bottom, { outline: 0.02 });
        ear.rotation.z = Math.PI / 2;
        ear.position.set(side * 0.45, 0.42, 0);
        rig.head.add(ear);
      }
      const belt = toonMesh(new RoundedBoxGeometry(0.72, 0.1, 0.52, 2, 0.04), def.colors.bottom, { outline: 0.02 });
      belt.position.y = 0.04;
      rig.torso.add(belt);
    },
  },
];
