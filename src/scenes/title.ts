import * as THREE from 'three';
import { titleTheme } from '../audio/songs/title';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { addLights, skyDome } from '../render/environment';
import { PlayerColors } from '../render/palette';
import { makeCloud, makeDie, makeIsland, makePawn, makeStar } from '../render/props';
import { PlaygroundScene } from './playground';

export class TitleScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private star!: THREE.Mesh;
  private die!: THREE.Mesh;
  private pawns: THREE.Group[] = [];
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

    PlayerColors.forEach((color, i) => {
      const pawn = makePawn(color);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      pawn.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2);
      pawn.lookAt(0, 0, 0);
      this.scene.add(pawn);
      this.pawns.push(pawn);
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

    this.pawns.forEach((p, i) => {
      // Little hop, out of phase per player.
      const hop = Math.max(0, Math.sin(t * 5 + i * 1.6));
      p.position.y = hop * 0.35;
      p.scale.set(1 + hop * 0.04, 1 - hop * 0.06, 1 + hop * 0.04);
    });

    for (const c of this.clouds) {
      c.position.x += dt * 0.8;
      if (c.position.x > 40) c.position.x = -40;
    }

    if (this.game.input.controllers.some((c) => c.pressed('start') || c.pressed('a'))) {
      this.game.audio.play('confirm');
      this.game.scenes.go(new PlaygroundScene());
    }
  }

  exit(): void {
    this.game.audio.stopSong();
  }
}
