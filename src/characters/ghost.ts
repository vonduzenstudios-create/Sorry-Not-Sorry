import * as THREE from 'three';
import { toonMesh } from '../render/toon';
import type { Character, Rig } from './character';
import type { Expression, Face } from './face';
import type { CharacterDef } from './roster';

/**
 * Wisp: a little bedsheet ghost. No legs, so the body floats and bobs, the
 * scalloped hem ripples, and two stubby sheet "arms" still give poses and
 * minigame props (mallets, paddles...) something to hang from.
 */

const SHEET = 0xf6f3ff;
const PINK = 0xff8cc6;
const HIP_Y = 0.55;
const R = 0.52;
const HOVER = 0.14;
const SCALLOPS = 7;

/** Bell-shaped sheet from the shoulders down to a wavy hem. */
function sheetGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    // Shoulders (y 0.45) flare gently out to the hem (y -0.42).
    const y = 0.45 - k * 0.87;
    pts.push(new THREE.Vector2(sheetRadius(y), y));
  }
  // Tuck the top rim inside the dome so its outline never shows as a seam.
  pts.unshift(new THREE.Vector2(R * 0.6, 0.45 + R * 0.6), new THREE.Vector2(R * 0.92, 0.45 + R * 0.25));
  // Lathe wants the profile bottom-up for outward normals (the outline needs them).
  const geo = new THREE.LatheGeometry(pts.reverse(), 48);
  // Scallop the hem: lift the bottom ring in waves around the body.
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const lower = THREE.MathUtils.clamp((0.05 - v.y) / 0.47, 0, 1);
    if (lower <= 0) continue;
    const a = Math.atan2(v.z, v.x);
    v.y += (Math.cos(a * SCALLOPS) * 0.5 + 0.5) * 0.11 * lower * lower;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Sheet radius at height y (torso space), before the hem scallops. */
function sheetRadius(y: number): number {
  const k = THREE.MathUtils.clamp((0.45 - y) / 0.87, 0, 1);
  return R * (1 + 0.16 * Math.pow(k, 1.6));
}

/**
 * Bottom-up profile for the face decal: up the sheet, then over the dome,
 * spaced evenly by arc length so the canvas isn't stretched. With these
 * numbers the dome's equator lands at canvas y ~100.
 */
function faceProfile(): THREE.Vector2[] {
  const bottom = -0.22;
  const sheetLen = 0.45 - bottom;
  const domeLat = 0.8;
  const total = sheetLen + R * domeLat;
  const pts: THREE.Vector2[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * total;
    if (d <= sheetLen) {
      const y = bottom + d;
      pts.push(new THREE.Vector2(sheetRadius(y) * 1.015, y));
    } else {
      const lat = (d - sheetLen) / R;
      pts.push(new THREE.Vector2(Math.cos(lat) * R * 1.015, 0.45 + Math.sin(lat) * R * 1.015));
    }
  }
  return pts;
}

function drawFace(g: CanvasRenderingContext2D, e: Expression, blinking: boolean): void {
  const ink = '#2b2440';
  const eyeY = 112;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const side of [-1, 1]) {
    const x = 128 + side * 42;
    g.strokeStyle = ink;
    g.fillStyle = ink;
    if (blinking || e === 'happy') {
      g.lineWidth = 10;
      g.beginPath();
      if (e === 'happy') g.arc(x, eyeY + 10, 18, Math.PI * 1.15, Math.PI * 1.85);
      else g.arc(x, eyeY - 2, 18, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    } else {
      // Big glossy bean eyes, the whole personality of a sheet ghost.
      const h = e === 'surprised' ? 34 : e === 'determined' ? 20 : 28;
      g.beginPath();
      g.ellipse(x, eyeY, 19, h, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(x - 6, eyeY - h * 0.4, 7, 9, -0.3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x + 7, eyeY + h * 0.35, 3.5, 0, Math.PI * 2);
      g.fill();
      if (e === 'determined') {
        // Furrowed lid cuts across the top of each eye.
        g.strokeStyle = ink;
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(x - side * 22, eyeY - 30);
        g.lineTo(x + side * 20, eyeY - 18);
        g.stroke();
      }
    }
    if (e === 'sad') {
      g.strokeStyle = ink;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x - side * 18, eyeY - 34);
      g.lineTo(x + side * 14, eyeY - 44);
      g.stroke();
    }
  }

  g.fillStyle = 'rgba(255, 130, 170, 0.45)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(128 + side * 74, 158, 17, 10, 0, 0, Math.PI * 2);
    g.fill();
  }

  g.strokeStyle = ink;
  g.fillStyle = '#5a2340';
  g.lineWidth = 7;
  const my = 170;
  g.beginPath();
  switch (e) {
    case 'happy':
      // Wide "boo!" grin with a little tongue.
      g.moveTo(102, my - 4);
      g.quadraticCurveTo(128, my + 40, 154, my - 4);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ff8fb0';
      g.beginPath();
      g.ellipse(128, my + 14, 11, 7, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'surprised':
      g.ellipse(128, my + 6, 13, 18, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    case 'sad':
      g.moveTo(112, my + 12);
      g.quadraticCurveTo(128, my - 2, 144, my + 12);
      g.stroke();
      break;
    case 'determined':
      g.moveTo(112, my + 4);
      g.lineTo(128, my - 2);
      g.lineTo(144, my + 4);
      g.stroke();
      break;
    default:
      // Small "w" cat-mouth smile.
      g.moveTo(110, my);
      g.quadraticCurveTo(119, my + 10, 128, my);
      g.quadraticCurveTo(137, my + 10, 146, my);
      g.stroke();
  }
}

function buildGhost(def: CharacterDef, face: Face): Rig {
  const body = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP_Y + HOVER;
  body.add(hips);

  // No legs: empty pivots keep the stock walk cycle harmless.
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  hips.add(legL, legR);

  const torso = new THREE.Group();
  hips.add(torso);
  const sheet = toonMesh(sheetGeometry(), def.colors.top, { outline: 0.03 });
  (sheet.material as THREE.Material).side = THREE.DoubleSide;
  torso.add(sheet);

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (R - 0.02), 0.12, 0.02);
    const flap = toonMesh(new THREE.CapsuleGeometry(0.09, 0.14, 6, 12), def.colors.top, { outline: 0.022 });
    flap.position.set(side * 0.04, -0.16, 0);
    flap.rotation.z = side * 0.35;
    flap.scale.set(1, 1, 0.75);
    pivot.add(flap);
    return pivot;
  });
  torso.add(...arms);

  // The head pivot sits at the dome's center so nods roll the face, not the dome.
  const head = new THREE.Group();
  head.position.y = 0.45;
  torso.add(head);
  const dome = toonMesh(new THREE.SphereGeometry(R, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2 + 0.12), def.colors.top);
  head.add(dome);
  // The face wraps the front of the dome and sheet, hugging both surfaces.
  // It hangs off the torso, not the head, so nods don't peel it off the sheet.
  const facePatch = new THREE.Mesh(
    new THREE.LatheGeometry(faceProfile(), 24, -0.85, 1.7),
    new THREE.MeshBasicMaterial({ map: face.texture, transparent: true, depthWrite: false }),
  );
  torso.add(facePatch);

  // Little wisp curl on top, and a bow in the accent color.
  const curl = toonMesh(new THREE.ConeGeometry(0.1, 0.24, 16), def.colors.top, { outline: 0.02 });
  curl.position.set(0.04, R + 0.06, -0.02);
  curl.rotation.z = -0.5;
  head.add(curl);
  const bow = new THREE.Group();
  bow.position.set(-0.26, R * 0.82, 0.12);
  bow.rotation.set(0.3, 0.2, 0.5);
  for (const side of [-1, 1]) {
    const loop = toonMesh(new THREE.ConeGeometry(0.1, 0.18, 12), def.colors.accent, { outline: 0.018 });
    loop.rotation.z = (side * Math.PI) / 2;
    loop.position.x = side * 0.09;
    bow.add(loop);
  }
  const knot = toonMesh(new THREE.SphereGeometry(0.05, 12, 8), def.colors.accent, { outline: 0.015 });
  bow.add(knot);
  head.add(bow);

  let t = Math.random() * 10;
  const tick = (dt: number, c: Character): void => {
    t += dt;
    const moving = c.pose === 'walk';
    const rate = moving ? 5 : 2.4;
    // Hover and bob instead of stepping; the hem ripples by spinning its scallops.
    hips.position.y = HIP_Y + HOVER + Math.sin(t * rate) * (moving ? 0.05 : 0.07);
    sheet.rotation.y += dt * (moving ? 2.2 : 0.6);
    torso.rotation.z = Math.sin(t * rate * 0.5) * (moving ? 0.06 : 0.03);
  };

  return { body, hips, torso, head, armL: arms[0], armR: arms[1], legL, legR, tick };
}

export const GHOST: CharacterDef = {
  id: 'wisp',
  name: 'Wisp',
  tagline: 'Boo! ...sorry, was that too much?',
  colors: {
    accent: PINK,
    skin: SHEET,
    top: SHEET,
    bottom: SHEET,
    shoes: SHEET,
  },
  face: { style: 'human', eyeColor: '#2b2440', draw: drawFace },
  build: buildGhost,
};
