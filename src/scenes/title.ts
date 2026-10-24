import * as THREE from 'three';
import { titleTheme } from '../audio/songs/title';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { addLights, skyDome } from '../render/environment';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import { makeCloud, makeDie, makeIsland, makeStar } from '../render/props';
import { SelectScene } from './select';

export class TitleScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private star!: THREE.Mesh;
  private die!: THREE.Mesh;
  private characters: Character[] = [];
  private clouds: THREE.Group[] = [];
  private t = 0;

  enter(game: Game): void {
    this.game = game;
    this.scene.add(skyDome());
    addLights(this.scene);

    const island = makeIsland(6);
    this.scene.add(island);

    this.star = makeStar(1.1);
    this.star.position.set(0, 3.2, 0);
    this.scene.add(this.star);

    this.die = makeDie(1.1);
    this.die.position.set(2.8, 1.6, 1.2);
    this.scene.add(this.die);

    ROSTER.forEach((def, i) => {
      const c = new Character(def);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      c.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2);
      // Face outward so the orbiting camera sees their faces.
      c.lookAt(c.position.x * 2, 0, c.position.z * 2);
      this.scene.add(c);
      this.characters.push(c);
    });

    for (let i = 0; i < 6; i++) {
      const cloud = makeCloud(1 + (i % 3) * 0.4);
      cloud.position.set(-30 + i * 12, 4 + (i % 2) * 5, -18 - (i % 3) * 6);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }

    game.renderer.setView(this.scene, this.camera);
    game.ui.add(
      'logo',
      '<span>Sorry</span> <span>Not</span><br><span>Sorry!</span>',
    );
    game.ui.add('prompt', 'Press Start');
    game.ui.add('hint', 'Gamepad: Start or A &nbsp;·&nbsp; Keyboard: Enter or Space');
    game.audio.playSong(titleTheme);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;

    // Slow orbit around the island.
    const a = t * 0.12;
    this.camera.position.set(Math.sin(a) * 15, 6.5, Math.cos(a) * 15);
    this.camera.lookAt(0, 1.6, 0);

    this.star.rotation.y = t * 1.4;
    this.star.position.y = 3.2 + Math.sin(t * 2) * 0.25;
    this.die.rotation.set(t * 0.9, t * 1.3, 0);
    this.die.position.y = 1.8 + Math.sin(t * 2.4 + 1) * 0.3;

    // Each character takes a turn showing off while the others idle and wave.
    const star = Math.floor(t / 2.5) % this.characters.length;
    this.characters.forEach((c, i) => {
      c.pose = i === star ? 'cheer' : (i + Math.floor(t / 2.5)) % 3 === 0 ? 'wave' : 'idle';
      c.setExpression(i === star ? 'happy' : 'neutral');
      c.update(dt);
    });

    for (const c of this.clouds) {
      c.position.x += dt * 0.8;
      if (c.position.x > 40) c.position.x = -40;
    }

    if (this.game.input.controllers.some((c) => c.pressed('start') || c.pressed('a'))) {
      this.game.audio.play('confirm');
      this.game.scenes.go(new SelectScene());
    }
  }

  exit(): void {
    this.game.audio.stopSong();
  }
}
