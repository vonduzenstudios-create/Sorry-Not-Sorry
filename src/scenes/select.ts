import * as THREE from 'three';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Controller } from '../input/input';
import { addLights, skyDome } from '../render/environment';
import { css, Palette, PlayerColors } from '../render/palette';
import { toonMesh } from '../render/toon';
import { SetupScene } from './setup';
import { TitleScene } from './title';

interface Picker {
  controller: Controller;
  /** Index into ROSTER the cursor is on. */
  cursor: number;
  locked: boolean;
  label: HTMLDivElement;
}

const SPACING = 2.6;

/**
 * Up to four controllers join with A, move a cursor left/right, and lock a
 * character with A. Each character can be taken once; unpicked ones become CPUs.
 */
export class SelectScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  private characters: Character[] = [];
  private pickers: Picker[] = [];
  private nameEls: HTMLDivElement[] = [];
  private prompt!: HTMLDivElement;
  private labelLayer!: HTMLDivElement;
  private stickLatch = new Map<Controller, boolean>();
  private t = 0;

  enter(game: Game): void {
    this.game = game;
    this.scene.add(skyDome(Palette.lavender, Palette.peach));
    addLights(this.scene);

    const floor = toonMesh(new THREE.CylinderGeometry(9, 9, 0.4, 48), Palette.cream, { outline: 0.05 });
    floor.position.y = -0.4;
    this.scene.add(floor);

    ROSTER.forEach((def, i) => {
      const x = (i - 1.5) * SPACING;
      const pedestal = toonMesh(new THREE.CylinderGeometry(0.85, 0.95, 0.4, 32), def.colors.accent, { outline: 0.04 });
      pedestal.position.set(x, -0.0, 0);
      this.scene.add(pedestal);
      const c = new Character(def);
      c.position.set(x, 0.2, 0);
      this.scene.add(c);
      this.characters.push(c);
    });

    this.camera.position.set(0, 3.2, 10.5);
    this.camera.lookAt(0, 1.1, 0);
    game.renderer.setView(this.scene, this.camera);

    game.ui.add('screen-title', 'Choose your character');
    const names = game.ui.add('names');
    for (const def of ROSTER) {
      const el = document.createElement('div');
      el.className = 'name-card panel';
      el.innerHTML = `<div class="name">${def.name}</div><div class="tag">${def.tagline}</div>`;
      el.style.borderColor = css(def.colors.accent);
      names.appendChild(el);
      this.nameEls.push(el);
    }
    this.labelLayer = game.ui.add('labels');
    this.prompt = game.ui.add('prompt');
    game.ui.add('hint', 'A: join / pick · B: undo · Left/Right: move · Start: play when ready');
    this.refresh();
  }

  private taken(index: number, except?: Picker): boolean {
    return this.pickers.some((p) => p !== except && p.locked && p.cursor === index);
  }

  private join(controller: Controller): void {
    if (this.pickers.length >= 4) return;
    let cursor = 0;
    while (this.taken(cursor)) cursor++;
    const label = document.createElement('div');
    label.className = 'cursor-label';
    this.labelLayer.appendChild(label);
    this.pickers.push({ controller, cursor, locked: false, label });
    this.game.audio.play('join');
    this.refresh();
  }

  /** Stick flicks move one step per push, like a d-pad. */
  private horizontal(c: Controller): number {
    const x = c.stickX;
    const active = Math.abs(x) > 0.5;
    const was = this.stickLatch.get(c) ?? false;
    this.stickLatch.set(c, active);
    return active && !was ? Math.sign(x) : 0;
  }

  update(dt: number): void {
    this.t += dt;
    // Online players who left lose their picker.
    for (const p of this.pickers.filter((p) => p.controller.gone)) {
      p.label.remove();
      this.pickers.splice(this.pickers.indexOf(p), 1);
      this.refresh();
    }

    for (const c of this.game.controllers) {
      if (c.gone) continue;
      const picker = this.pickers.find((p) => p.controller === c);
      // Online, only the host starts the game.
      if (c.pressed('start') && this.ready() && this.canStart(c)) {
        this.start();
        return;
      }
      if (!picker) {
        if (c.pressed('a')) this.join(c);
        else if (c.pressed('b') && this.pickers.length === 0 && !this.game.net) this.back();
        continue;
      }
      const dir = this.horizontal(c);
      if (!picker.locked && dir !== 0) {
        picker.cursor = (picker.cursor + dir + ROSTER.length) % ROSTER.length;
        this.game.audio.play('select');
        this.refresh();
      }
      if (c.pressed('a') && !picker.locked) {
        if (this.taken(picker.cursor, picker)) {
          this.game.audio.play('back');
        } else {
          picker.locked = true;
          this.game.audio.play('confirm');
          this.refresh();
        }
      } else if (c.pressed('b')) {
        if (picker.locked) {
          picker.locked = false;
        } else {
          picker.label.remove();
          this.pickers.splice(this.pickers.indexOf(picker), 1);
        }
        this.game.audio.play('back');
        this.refresh();
      }
    }

    // Poses follow selection state.
    this.characters.forEach((ch, i) => {
      const lockedBy = this.pickers.find((p) => p.locked && p.cursor === i);
      const hovered = this.pickers.some((p) => !p.locked && p.cursor === i);
      ch.pose = lockedBy ? 'cheer' : hovered ? 'wave' : 'idle';
      ch.setExpression(lockedBy ? 'happy' : hovered ? 'surprised' : 'neutral');
      const targetRot = hovered || lockedBy ? 0 : Math.sin(this.t / 1.5 + i) * 0.3;
      ch.rotation.y += (targetRot - ch.rotation.y) * Math.min(1, dt * 6);
      ch.update(dt);
    });

    this.placeLabels();
  }

  private canStart(c: Controller): boolean {
    return !this.game.net || c === this.game.net.controllers[0];
  }

  private ready(): boolean {
    return this.pickers.length > 0 && this.pickers.every((p) => p.locked);
  }

  private placeLabels(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Stack labels of pickers sharing a character.
    const stacks = new Map<number, number>();
    this.pickers.forEach((p) => {
      const n = stacks.get(p.cursor) ?? 0;
      stacks.set(p.cursor, n + 1);
      const pos = new THREE.Vector3((p.cursor - 1.5) * SPACING, 2.45, 0).project(this.camera);
      p.label.style.left = `${((pos.x + 1) / 2) * w}px`;
      p.label.style.top = `${((1 - pos.y) / 2) * h - n * 34}px`;
    });
  }

  private refresh(): void {
    this.pickers.forEach((p, i) => {
      const color = css(PlayerColors[i]);
      // Online, label players by who is behind the controller (Host, Player 2...).
      const who = this.game.net ? p.controller.label : `P${i + 1}`;
      p.label.textContent = p.locked ? `${who} ✓` : who;
      p.label.style.background = color;
      p.label.classList.toggle('locked', p.locked);
    });
    this.nameEls.forEach((el, i) => {
      const owner = this.pickers.findIndex((p) => p.locked && p.cursor === i);
      el.classList.toggle('taken', owner >= 0);
      el.querySelector('.tag')!.textContent = owner >= 0 ? `Player ${owner + 1}` : ROSTER[i].tagline;
    });
    if (this.pickers.length === 0) this.prompt.textContent = 'Press A to join';
    else if (this.ready()) this.prompt.textContent = this.game.net && !this.game.net.isHost ? 'Waiting for the host to start...' : 'Press Start!';
    else this.prompt.textContent = 'Pick a character';
  }

  private start(): void {
    const seats = ROSTER.map((def, i) => {
      const owner = this.pickers.find((p) => p.cursor === i);
      return { characterId: def.id, controller: owner?.controller ?? null };
    });
    // Humans take the first seats, in join order; CPUs fill the rest.
    this.game.session.seats = [
      ...this.pickers.map((p) => seats[p.cursor]),
      ...seats.filter((s) => !s.controller),
    ];
    this.game.audio.play('star');
    this.game.scenes.go(new SetupScene());
  }

  private back(): void {
    this.game.audio.play('back');
    this.game.scenes.go(new TitleScene());
  }

  exit(): void {}
}
