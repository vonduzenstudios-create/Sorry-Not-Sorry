import * as THREE from 'three';
import { Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import type { Space, SpaceType } from './types';

export const SPACE_COLORS: Record<SpaceType, number> = {
  start: 0xfff6e6,
  blue: 0x6fb7ff,
  red: 0xff6f7d,
  happening: 0x6fdc8c,
  item: 0xb79cff,
  battle: 0xffa65c,
  villain: 0x6b4f9e,
  shop: 0xffd23f,
};

const SPACE_RADIUS = 0.95;
const SPACE_HEIGHT = 0.25;

const iconCache = new Map<SpaceType, THREE.CanvasTexture>();

/** Top-face icon for a space type, drawn on a canvas. */
function icon(type: SpaceType): THREE.CanvasTexture {
  const cached = iconCache.get(type);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${SPACE_COLORS[type].toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  const ink = '#2b2440';
  switch (type) {
    case 'blue':
      g.beginPath();
      g.moveTo(64, 36);
      g.lineTo(64, 92);
      g.moveTo(36, 64);
      g.lineTo(92, 64);
      g.stroke();
      break;
    case 'red':
      g.beginPath();
      g.moveTo(36, 64);
      g.lineTo(92, 64);
      g.stroke();
      break;
    case 'happening':
      g.font = '900 78px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('!', 64, 68);
      break;
    case 'item':
      g.font = '900 72px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', 64, 68);
      break;
    case 'battle':
      g.beginPath();
      g.moveTo(38, 38);
      g.lineTo(90, 90);
      g.moveTo(90, 38);
      g.lineTo(38, 90);
      g.stroke();
      break;
    case 'villain':
      // Grumpy face: angry brows and a frown.
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(34, 44);
      g.lineTo(56, 56);
      g.moveTo(94, 44);
      g.lineTo(72, 56);
      g.stroke();
      g.beginPath();
      g.arc(46, 64, 6, 0, Math.PI * 2);
      g.arc(82, 64, 6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(64, 100, 20, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      break;
    case 'shop':
      // A little shopping bag.
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(38, 52, 52, 44);
      g.lineWidth = 8;
      g.beginPath();
      g.arc(64, 52, 14, Math.PI, 0);
      g.stroke();
      g.fillStyle = ink;
      g.font = '900 30px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 64, 76);
      break;
    case 'start':
      g.fillStyle = ink;
      g.font = '900 46px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('GO', 64, 66);
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(type, tex);
  return tex;
}

/** Builds the space discs and the dotted connectors between them. */
export function buildSpaces(spaces: Space[]): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(SPACE_RADIUS, SPACE_RADIUS * 1.04, SPACE_HEIGHT, 32);
  const capGeo = new THREE.CircleGeometry(SPACE_RADIUS * 0.84, 32);
  const dotGeo = new THREE.SphereGeometry(0.13, 10, 8);

  for (const s of spaces) {
    const disc = toonMesh(geo, SPACE_COLORS[s.type], { outline: 0.04 });
    disc.position.copy(s.pos).setY(SPACE_HEIGHT / 2);
    group.add(disc);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ map: icon(s.type) }));
    cap.rotation.x = -Math.PI / 2;
    cap.position.copy(s.pos).setY(SPACE_HEIGHT + 0.005);
    group.add(cap);

    for (const n of s.next) {
      const a = s.pos;
      const b = spaces[n].pos;
      const gap = a.distanceTo(b);
      const dots = Math.max(1, Math.floor(gap / 0.8) - 2);
      for (let i = 1; i <= dots; i++) {
        const dot = toonMesh(dotGeo, Palette.cream, { outline: 0.02 });
        dot.castShadow = false;
        dot.position.lerpVectors(a, b, i / (dots + 1)).setY(0.08);
        group.add(dot);
      }
    }
  }
  return group;
}

export const SPACE_TOP = SPACE_HEIGHT;
