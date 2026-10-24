import * as THREE from 'three';
import { addLights, skyDome } from '../render/environment';

/** Sky + lights + a flat cel-shaded sea far below the arena. */
export function arenaBasics(scene: THREE.Scene, sky: [number, number], sea: number, seaY = -12): void {
  scene.add(skyDome(sky[0], sky[1]));
  addLights(scene);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: sea }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = seaY;
  scene.add(water);
}
