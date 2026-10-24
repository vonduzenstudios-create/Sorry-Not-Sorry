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
  }
}
