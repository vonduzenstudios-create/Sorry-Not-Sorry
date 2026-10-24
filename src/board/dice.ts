import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toonMesh } from '../render/toon';

/** Floating dice block above a player's head that cycles 1-10 until hit. */
export class DiceBlock extends THREE.Group {
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private cube: THREE.Mesh;
  private shown = 0;
  private timer = 0;
  rolling = false;

  constructor(private max = 10) {
    super();
    this.canvas.width = this.canvas.height = 128;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.cube = toonMesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.16), 0xffffff, { map: this.texture, outline: 0.04 });
    this.add(this.cube);
    this.show(1);
  }

  show(n: number): void {
    if (n === this.shown) return;
    this.shown = n;
    const g = this.canvas.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#fff3a8');
    grad.addColorStop(1, '#ffc93f');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.font = '900 78px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#2b2440';
    g.strokeText(String(n), 64, 70);
    g.fillStyle = '#ffffff';
    g.fillText(String(n), 64, 70);
    this.texture.needsUpdate = true;
  }

  get value(): number {
    return this.shown;
  }

  update(dt: number, t: number): void {
    this.cube.rotation.y = Math.sin(t * 1.5) * 0.35;
    this.cube.rotation.x = Math.sin(t * 1.1) * 0.15;
    if (!this.rolling) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.055;
      let n = this.shown;
      while (n === this.shown) n = 1 + Math.floor(Math.random() * this.max);
      this.show(n);
    }
  }
}
