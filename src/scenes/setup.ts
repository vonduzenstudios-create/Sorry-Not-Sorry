import * as THREE from 'three';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Controller } from '../input/input';
import { addLights, skyDome } from '../render/environment';
import { Palette } from '../render/palette';
import { BoardScene } from './board';
import { SelectScene } from './select';

const BOARDS = [
  { id: 'pirate', name: 'Pirate Cove', ready: true },
  { id: 'western', name: 'Dusty Gulch', ready: true },
  { id: 'space', name: 'Star Station', ready: true },
];
const TURNS = [10, 15, 20];

/** Pick a board and a game length. Any human player can drive the menu. */
export class SetupScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private row = 0;
  private board = 0;
  private turns = 0;
  private menu!: HTMLDivElement;
  private characters: Character[] = [];
  private latch = new Map<Controller, string>();

  enter(game: Game): void {
    this.game = game;
    this.scene.add(skyDome(Palette.sky, Palette.mint));
    addLights(this.scene);
    game.session.seats.forEach((seat, i) => {
      const c = new Character(ROSTER.find((d) => d.id === seat.characterId)!);
      c.position.set((i - 1.5) * 1.6, -1.9, 0);
      this.scene.add(c);
      this.characters.push(c);
    });
    this.camera.position.set(0, 1.2, 9);
    this.camera.lookAt(0, -0.2, 0);
    game.renderer.setView(this.scene, this.camera);
    game.ui.add('screen-title', 'Game setup');
    this.menu = game.ui.add('menu');
    game.ui.add('hint', 'Up/Down: choose · Left/Right: change · A: start · B: back');
    this.turns = Math.max(0, TURNS.indexOf(game.session.turns));
    this.render();
  }

  /** One step per stick push. */
  private dir(c: Controller): string {
    const d =
      c.stickY > 0.5 ? 'up' : c.stickY < -0.5 ? 'down' : c.stickX < -0.5 ? 'left' : c.stickX > 0.5 ? 'right' : '';
    const prev = this.latch.get(c) ?? '';
    this.latch.set(c, d);
    return d !== prev ? d : '';
  }

  update(dt: number): void {
    for (const ch of this.characters) {
      ch.pose = 'idle';
      ch.update(dt);
    }
    const humans = this.game.session.humans.map((s) => s.controller!);
    for (const c of humans) {
      const d = this.dir(c);
      if (d === 'up' || d === 'down') {
        this.row = (this.row + (d === 'down' ? 1 : 2)) % 3;
        this.game.audio.play('select');
      } else if (d === 'left' || d === 'right') {
        const step = d === 'right' ? 1 : -1;
        if (this.row === 0) this.board = (this.board + step + BOARDS.length) % BOARDS.length;
        if (this.row === 1) this.turns = (this.turns + step + TURNS.length) % TURNS.length;
        this.game.audio.play('select');
      }
      if (c.pressed('a') || c.pressed('start')) {
        if (!BOARDS[this.board].ready) {
          this.game.audio.play('back');
        } else if (this.row === 2 || c.pressed('start')) {
          this.game.session.boardId = BOARDS[this.board].id;
          this.game.session.turns = TURNS[this.turns];
          this.game.audio.play('confirm');
          this.game.scenes.go(new BoardScene());
          return;
        } else {
          this.row = 2;
          this.game.audio.play('select');
        }
      }
      if (c.pressed('b')) {
        this.game.audio.play('back');
        this.game.scenes.go(new SelectScene());
        return;
      }
    }
    this.render();
  }

  private render(): void {
    const b = BOARDS[this.board];
    const rows = [
      `<span>Board</span><span class="value">◀ ${b.name} ▶${b.ready ? '' : ' <span class="locked">(coming soon)</span>'}</span>`,
      `<span>Turns</span><span class="value">◀ ${TURNS[this.turns]} ▶</span>`,
      `<span>Start game</span><span class="value">${b.ready ? 'Go!' : '—'}</span>`,
    ];
    const html = rows.map((r, i) => `<div class="menu-row panel ${i === this.row ? 'sel' : ''}">${r}</div>`).join('');
    if (this.menu.innerHTML !== html) this.menu.innerHTML = html;
  }

  exit(): void {}
}
