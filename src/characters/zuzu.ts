import * as THREE from 'three';
import { toonMesh } from '../render/toon';
import type { Character, Rig } from './character';
import type { Expression, Face } from './face';
import type { CharacterDef } from './roster';

/**
 * Zuzu, a cat-like alien. Unlike the chibi humans she is all head and tail:
 * a wide fuzzy skull with tall ears and glowing antennae, a little bean body
 * on stubby digitigrade legs, and a long curling tail that swishes on its own.
 */

const FUR = 0xa9e7dc;
const FUR_DARK = 0x6fc7bd;
const CREAM = 0xfff3e2;
const PINK = 0xffb3c7;
const GLOW = 0xd99bff;
const ACCENT = 0x3fc4d8;
const EYE = '#ffc94a';

const HIP_Y = 0.4;
const HEAD_R = 0.5;
const HEAD_Y = 0.4;
const TAIL_SEGMENTS = 9;

export const ZUZU: CharacterDef = {
  id: 'zuzu',
  name: 'Zuzu',
  tagline: 'Came in peace. Stayed for coins.',
  colors: {
    accent: ACCENT,
    skin: FUR,
    top: FUR,
    bottom: FUR_DARK,
    shoes: CREAM,
  },
  face: { style: 'human', eyeColor: EYE, draw: drawCatFace },
  build: buildZuzu,
};

function buildZuzu(_def: CharacterDef, face: Face): Rig {
  const body = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  body.add(hips);

  // Stubby haunches with big round paws.
  const [legL, legR] = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.x = side * 0.15;
    const haunch = toonMesh(new THREE.SphereGeometry(0.15, 16, 12), FUR, { outline: 0.022 });
    haunch.scale.set(0.95, 1.1, 1.15);
    haunch.position.set(0, -0.1, -0.02);
    const paw = toonMesh(new THREE.SphereGeometry(0.12, 16, 12), CREAM, { outline: 0.022 });
    paw.scale.set(1, 0.62, 1.35);
    paw.position.set(0, -0.31, 0.06);
    pivot.add(haunch, paw);
    // Toe beans peek out the front.
    for (const dx of [-0.05, 0, 0.05]) {
      const bean = toonMesh(new THREE.SphereGeometry(0.026, 8, 6), PINK, { outline: false });
      bean.position.set(dx, -0.33, 0.21);
      pivot.add(bean);
    }
    return pivot;
  });
  hips.add(legL, legR);

  // A pear-shaped bean of a body with a cream belly.
  const torso = new THREE.Group();
  hips.add(torso);
  const trunk = toonMesh(new THREE.SphereGeometry(0.3, 24, 16), FUR);
  trunk.scale.set(1.02, 1.1, 0.92);
  trunk.position.y = 0.22;
  const belly = toonMesh(new THREE.SphereGeometry(0.22, 20, 14), CREAM, { outline: false });
  belly.scale.set(1, 1.15, 0.6);
  belly.position.set(0, 0.18, 0.15);
  torso.add(trunk, belly);

  // Space collar with a glowing star gem.
  const collar = toonMesh(new THREE.TorusGeometry(0.2, 0.045, 8, 28), ACCENT, { outline: 0.015 });
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.5;
  const gem = toonMesh(new THREE.OctahedronGeometry(0.07), 0xfff27a, { outline: 0.015, emissive: 0x665500 });
  gem.position.set(0, 0.44, 0.22);
  gem.scale.set(1, 1.2, 0.6);
  torso.add(collar, gem);

  // Short arms ending in mitten paws.
  const [armL, armR] = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.28, 0.4, 0.02);
    const limb = toonMesh(new THREE.CapsuleGeometry(0.065, 0.16, 4, 10), FUR, { outline: 0.02 });
    limb.position.y = -0.13;
    const paw = toonMesh(new THREE.SphereGeometry(0.09, 14, 10), CREAM, { outline: 0.02 });
    paw.position.y = -0.29;
    pivot.add(limb, paw);
    return pivot;
  });
  torso.add(armL, armR);

  // Oversized, slightly wide head.
  const head = new THREE.Group();
  head.position.y = 0.52;
  torso.add(head);
  const skull = toonMesh(new THREE.SphereGeometry(HEAD_R, 32, 20), FUR);
  skull.scale.set(1.12, 0.94, 1);
  skull.position.y = HEAD_Y;
  head.add(skull);
  // Fluffy cheek ruffs.
  for (const side of [-1, 1]) {
    const ruff = toonMesh(new THREE.ConeGeometry(0.16, 0.3, 10), FUR, { outline: 0.02 });
    ruff.rotation.z = side * (Math.PI / 2 + 0.35);
    ruff.position.set(side * 0.5, HEAD_Y - 0.14, 0.02);
    ruff.scale.set(1, 1, 0.7);
    head.add(ruff);
  }
  const facePatch = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R * 1.02, 32, 16, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.8, 1.6),
    new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false }),
  );
  facePatch.scale.copy(skull.scale);
  facePatch.position.y = HEAD_Y;
  head.add(facePatch);
  // Forehead stripes.
  for (const [x, rz] of [
    [-0.12, 0.25],
    [0, 0],
    [0.12, -0.25],
  ] as const) {
    const stripe = toonMesh(new THREE.CapsuleGeometry(0.028, 0.1, 4, 8), FUR_DARK, { outline: false });
    stripe.rotation.set(-0.6, 0, rz);
    stripe.position.set(x * 1.1, HEAD_Y + 0.38, 0.27);
    head.add(stripe);
  }

  // Tall ears with pink insides and a tuft.
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.3, HEAD_Y + 0.34, -0.02);
    ear.rotation.set(-0.12, 0, -side * 0.38);
    const outer = toonMesh(new THREE.ConeGeometry(0.17, 0.42, 12), FUR, { outline: 0.022 });
    outer.scale.z = 0.55;
    outer.position.y = 0.16;
    const inner = toonMesh(new THREE.ConeGeometry(0.11, 0.3, 12), PINK, { outline: false });
    inner.scale.z = 0.3;
    inner.position.set(0, 0.13, 0.045);
    const tuft = toonMesh(new THREE.SphereGeometry(0.045, 8, 6), CREAM, { outline: 0.012 });
    tuft.position.y = 0.38;
    ear.add(outer, inner, tuft);
    head.add(ear);
    ears.push(ear);
  }

  // Two curly antennae with glowing bulbs.
  const antennae: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ant = new THREE.Group();
    ant.position.set(side * 0.1, HEAD_Y + 0.42, 0.06);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.05, 0.18, 0.04),
      new THREE.Vector3(side * 0.16, 0.32, 0.02),
      new THREE.Vector3(side * 0.26, 0.36, -0.02),
    ]);
    const stalk = toonMesh(new THREE.TubeGeometry(curve, 16, 0.022, 6), FUR_DARK, { outline: 0.012 });
    const bulb = toonMesh(new THREE.SphereGeometry(0.07, 14, 10), GLOW, { outline: 0.016, emissive: 0x5a2a88 });
    bulb.position.set(side * 0.27, 0.37, -0.02);
    ant.add(stalk, bulb);
    head.add(ant);
    antennae.push(ant);
  }

  // A long tail: a chain of shrinking segments, each its own pivot so the
  // swish ripples from base to tip. Ends in a glowing puff.
  const tail = new THREE.Group();
  tail.position.set(0, 0.08, -0.24);
  torso.add(tail);
  const tailJoints: THREE.Group[] = [];
  let parent: THREE.Object3D = tail;
  const segLen = 0.11;
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const joint = new THREE.Group();
    if (i > 0) joint.position.y = segLen;
    const r = 0.07 - i * 0.003;
    const seg = toonMesh(new THREE.SphereGeometry(r, 10, 8), i % 3 === 2 ? FUR_DARK : FUR, { outline: 0.016 });
    seg.scale.y = 1.25;
    seg.position.y = segLen * 0.5;
    joint.add(seg);
    parent.add(joint);
    tailJoints.push(joint);
    parent = joint;
  }
  const tip = toonMesh(new THREE.SphereGeometry(0.1, 14, 10), GLOW, { outline: 0.02, emissive: 0x5a2a88 });
  tip.position.y = segLen + 0.04;
  parent.add(tip);

  let t = Math.random() * 10;
  const tick = (dt: number, character: Character): void => {
    t += dt;
    const excited = character.pose === 'cheer' || character.pose === 'jump';
    const droop = character.pose === 'sulk';
    const speed = excited ? 9 : character.pose === 'walk' ? 6 : 2.4;
    const amp = excited ? 0.32 : droop ? 0.05 : 0.18;
    // Base sweeps back and up, then the tail curls forward over the top.
    tail.rotation.x = droop ? -2.3 : -1.95;
    tailJoints.forEach((j, i) => {
      const k = i / TAIL_SEGMENTS;
      j.rotation.z = Math.sin(t * speed - i * 0.55) * amp * (0.4 + k);
      j.rotation.x = i === 0 ? 0 : droop ? 0.06 : 0.12 + k * 0.32;
    });
    antennae.forEach((a, i) => {
      a.rotation.z = Math.sin(t * (excited ? 12 : 3) + i * 1.7) * (excited ? 0.25 : 0.08);
      a.rotation.x = droop ? 0.5 : Math.sin(t * 2.1 + i) * 0.06;
    });
    ears.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      const twitch = Math.max(0, Math.sin(t * 1.3 + i * 2.4) - 0.92) * 6;
      e.rotation.z = -side * (droop ? 0.95 : 0.38 + twitch * 0.25);
      e.rotation.x = droop ? 0.35 : -0.12;
    });
  };

  return { body, hips, torso, head, armL, armR, legL, legR, tick };
}

/** Big alien cat eyes with slit pupils, a pink nose, an ":3" mouth and whiskers. */
function drawCatFace(g: CanvasRenderingContext2D, e: Expression, blinking: boolean): void {
  const ink = '#2b2440';
  const eyeY = 112;
  const eyeDx = 52;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  for (const side of [-1, 1]) {
    const x = 128 + side * eyeDx;
    if (blinking || e === 'happy') {
      g.strokeStyle = ink;
      g.lineWidth = 9;
      g.beginPath();
      if (e === 'happy') g.arc(x, eyeY + 10, 20, Math.PI * 1.15, Math.PI * 1.85);
      else g.arc(x, eyeY - 6, 22, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    } else {
      // Almond eye tilted up at the outer corner.
      const h = e === 'surprised' ? 32 : e === 'determined' ? 18 : 27;
      g.save();
      g.translate(x, eyeY);
      g.rotate(side * -0.22);
      g.fillStyle = EYE;
      g.beginPath();
      g.ellipse(0, 0, 25, h, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = ink;
      g.lineWidth = 6;
      g.stroke();
      // Vertical slit pupil, rounder when surprised.
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(0, 1, e === 'surprised' ? 13 : 6, h - 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(-8, -h * 0.4, 5, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (e === 'sad' || e === 'determined') {
        // Heavy lid sets the mood.
        g.strokeStyle = ink;
        g.lineWidth = 8;
        g.beginPath();
        const ly = eyeY - h + 4;
        if (e === 'sad') {
          g.moveTo(x - side * 22, ly - 6);
          g.lineTo(x + side * 20, ly + 6);
        } else {
          g.moveTo(x - side * 24, ly + 6);
          g.lineTo(x + side * 20, ly - 8);
        }
        g.stroke();
      }
    }
  }

  // Cream muzzle puff under the nose.
  g.fillStyle = '#fff3e2';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(128 + side * 20, 178, 30, 22, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Blush.
  g.fillStyle = 'rgba(255, 120, 160, 0.38)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(128 + side * 82, 162, 16, 9, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Whiskers, three per side.
  g.strokeStyle = ink;
  g.lineWidth = 3.5;
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(128 + side * 44, 172 + i * 9);
      g.quadraticCurveTo(128 + side * 82, 168 + i * 14, 128 + side * 118, 166 + i * 20);
      g.stroke();
    }
  }

  // Nose.
  g.fillStyle = '#ff8fae';
  g.strokeStyle = ink;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(116, 156);
  g.lineTo(140, 156);
  g.lineTo(128, 168);
  g.closePath();
  g.fill();
  g.stroke();

  // Mouth hangs off the nose.
  g.lineWidth = 6;
  g.fillStyle = '#7a2d3d';
  const my = 172;
  g.beginPath();
  switch (e) {
    case 'happy':
      g.moveTo(108, my);
      g.quadraticCurveTo(128, my + 30, 148, my);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ff8fae';
      g.beginPath();
      g.ellipse(128, my + 14, 8, 5, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'sad':
      g.moveTo(112, my + 14);
      g.quadraticCurveTo(128, my + 2, 144, my + 14);
      g.stroke();
      break;
    case 'surprised':
      g.ellipse(128, my + 10, 9, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    case 'determined':
      g.moveTo(112, my + 6);
      g.lineTo(144, my + 4);
      g.stroke();
      break;
    default:
      // ":3" — two little bumps under the nose.
      g.moveTo(128, my - 4);
      g.lineTo(128, my);
      g.arc(119, my, 9, 0, Math.PI);
      g.moveTo(128, my);
      g.arc(137, my, 9, Math.PI, 0, true);
      g.stroke();
  }
}
