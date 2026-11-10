import * as THREE from 'three';
import { Character } from '../characters/character';
import { MAX_SEATS, ROSTER } from '../characters/roster';
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
/** Characters per row; larger rosters stack extra rows behind on raised steps. */
const PER_ROW = 4;
const ROWS = Math.ceil(ROSTER.length / PER_ROW);

/** Where roster entry `i` stands. Row 0 is the back row, so it reads like the name grid. */
function slot(i: number): THREE.Vector3 {
  const row = Math.floor(i / PER_ROW);
  const inRow = Math.min(PER_ROW, ROSTER.length - row * PER_ROW);
  const back = ROWS - 1 - row;
  return new THREE.Vector3((i % PER_ROW - (inRow - 1) / 2) * SPACING, back * 1.5, -back * 2.4);
}

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
  private stickLatchY = new Map<Controller, boolean>();
  private t = 0;

  enter(game: Game): void {
    this.game = game;
    this.scene.add(skyDome(Palette.lavender, Palette.peach));
    addLights(this.scene);

    const floor = toonMesh(new THREE.CylinderGeometry(9, 9, 0.4, 48), Palette.cream, { outline: 0.05 });
    floor.position.y = -0.4;
    this.scene.add(floor);

    ROSTER.forEach((def, i) => {
      const p = slot(i);
      const height = 0.4 + p.y;
      const pedestal = toonMesh(new THREE.CylinderGeometry(0.85, 0.95, height, 32), def.colors.accent, { outline: 0.04 });
      pedestal.position.set(p.x, p.y + 0.2 - height / 2, p.z);
      this.scene.add(pedestal);
      const c = new Character(def);
      c.position.set(p.x, p.y + 0.2, p.z);
      this.scene.add(c);
      this.characters.push(c);
    });

    const depth = (ROWS - 1) * 2.6;
    this.camera.position.set(0, 3.2 + depth * 0.5, 10.5 + depth * 0.9);
    this.camera.lookAt(0, 1.1 + depth * 0.25, -depth * 0.5);
    game.renderer.setView(this.scene, this.camera);

    game.ui.add('screen-title', 'Choose your character');
    const names = game.ui.add(ROWS > 1 ? 'names compact' : 'names');
    names.style.gridTemplateColumns = `repeat(${Math.min(PER_ROW, ROSTER.length)}, minmax(0, 1fr))`;
    for (const def of ROSTER) {
      const el = document.createElement('div');
      el.className = 'name-card panel';
      el.innerHTML = `<div class="name">${def.name}</div><div class="tag">${def.tagline}</div>`;
      el.style.borderColor = css(def.colors.accent);
      names.appendChild(el);
      this.nameEls.push(el);
    }
    this.labelLayer = game.ui.add('labels');
    this.prompt = game.ui.add(ROWS > 1 ? 'prompt high' : 'prompt');
    game.ui.add('hint', `A: join / pick · B: undo · ${ROWS > 1 ? 'Stick' : 'Left/Right'}: move · Start: play when ready`);
    this.refresh();
  }

  private taken(index: number, except?: Picker): boolean {
    return this.pickers.some((p) => p !== except && p.locked && p.cursor === index);
  }

  private join(controller: Controller): void {
    if (this.pickers.length >= MAX_SEATS) return;
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

  /** Up/down hops between rows; +1 is up (toward the back row). */
  private vertical(c: Controller): number {
    const y = c.stickY;
    const active = Math.abs(y) > 0.5;
    const was = this.stickLatchY.get(c) ?? false;
    this.stickLatchY.set(c, active);
    return active && !was ? Math.sign(y) : 0;
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
      const rowDir = this.vertical(c);
      if (!picker.locked && dir !== 0) {
        picker.cursor = (picker.cursor + dir + ROSTER.length) % ROSTER.length;
        this.game.audio.play('select');
        this.refresh();
      } else if (!picker.locked && rowDir !== 0 && ROWS > 1) {
        // Up moves toward row 0 (the back row); clamp into the target row.
        const row = Math.floor(picker.cursor / PER_ROW) - rowDir;
        if (row >= 0 && row < ROWS) {
          picker.cursor = Math.min(row * PER_ROW + (picker.cursor % PER_ROW), ROSTER.length - 1);
          this.game.audio.play('select');
          this.refresh();
        }
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
      const pos = slot(p.cursor).add(new THREE.Vector3(0, 2.45, 0)).project(this.camera);
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
    ].slice(0, MAX_SEATS);
    this.game.audio.play('star');
    this.game.scenes.go(new SetupScene());
  }

  private back(): void {
    this.game.audio.play('back');
    this.game.scenes.go(new TitleScene());
  }

  exit(): void {}
}
