import * as THREE from 'three';
import { Palette } from './palette';

/**
 * Owns the WebGL renderer, the active camera and scene, and resizing.
 * Scenes call `setView` on enter to show their own scene graph.
 */
export class Renderer {
  readonly three: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  /**
   * A second scene drawn on top of the main one, inside the screen rectangle
   * of an HTML element (the minigame preview's practice pads).
   */
  inset: { scene: THREE.Scene; camera: THREE.Camera; el: HTMLElement } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFShadowMap;
    this.three.setClearColor(Palette.sky);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setView(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera;
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.three.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.three.render(this.scene, this.camera);
    const inset = this.inset;
    if (!inset) return;
    const r = inset.el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const y = window.innerHeight - r.bottom;
    const t = this.three;
    t.autoClear = false;
    t.setScissorTest(true);
    t.setViewport(r.left, y, r.width, r.height);
    t.setScissor(r.left, y, r.width, r.height);
    t.clearDepth();
    t.render(inset.scene, inset.camera);
    t.setScissorTest(false);
    t.setViewport(0, 0, window.innerWidth, window.innerHeight);
    t.autoClear = true;
  }
}
