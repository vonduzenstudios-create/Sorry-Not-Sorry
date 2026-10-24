import * as THREE from 'three';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Controller } from '../input/input';
import { addLights, skyDome } from '../render/environment';
import { css, PlayerColors } from '../render/palette';
import { makeCoin, makeIsland, makePawn, makeStar } from '../render/props';
import { TitleScene } from './title';

const ISLAND_RADIUS = 7;
const SPEED = 4.5;
const GRAVITY = 22;
const JUMP = 8;
const NAMES = ['Rex', 'Ivy', 'Marcus', 'Bolt'];

interface Player {
  controller: Controller;
  pawn: THREE.Group;
  vy: number;
  coins: number;
  stars: number;
}

/**
 * Milestone 1 test bed: up to 4 controllers join, run around an island,
 * jump, grab coins and the star. Exercises rendering, input and audio together.
 */
export class PlaygroundScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  private slots: (Player | null)[] = [null, null, null, null];
  private slotEls: HTMLDivElement[] = [];
  private coins: THREE.Mesh[] = [];
  private star!: THREE.Mesh;
  private t = 0;

  enter(game: Game): void {
    this.game = game;
    this.scene.add(skyDome());
    addLights(this.scene);
    this.scene.add(makeIsland(ISLAND_RADIUS));

    for (let i = 0; i < 10; i++) {
      const coin = makeCoin(0.35);
      this.placeRandomly(coin, 0.6);
      this.scene.add(coin);
      this.coins.push(coin);
    }
    this.star = makeStar(0.6);
    this.placeRandomly(this.star, 1.2);
    this.scene.add(this.star);

    this.camera.position.set(0, 11, 12);
    this.camera.lookAt(0, 0, 0.5);
    game.renderer.setView(this.scene, this.camera);

    const bar = game.ui.add('slots');
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'slot panel empty';
      el.style.borderColor = css(PlayerColors[i]);
      bar.appendChild(el);
      this.slotEls.push(el);
    }
    game.ui.add('hint', 'Press A to join · Stick / WASD to move · A / Space to jump · Start / Enter to go back');
    this.refreshSlots();
  }

  private placeRandomly(obj: THREE.Object3D, y: number): void {
    const r = Math.sqrt(this.game.rng.next()) * (ISLAND_RADIUS - 1);
    const a = this.game.rng.range(0, Math.PI * 2);
    obj.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  }

  private refreshSlots(): void {
    this.slots.forEach((p, i) => {
      const el = this.slotEls[i];
      el.classList.toggle('empty', !p);
      el.innerHTML = p
        ? `<div class="name">${NAMES[i]}</div><div>★ ${p.stars} &nbsp; ● ${p.coins}</div><div class="device">${p.controller.label}</div>`
        : `<div class="name">P${i + 1}</div><div>Press A</div><div class="device">&nbsp;</div>`;
    });
  }

  private join(controller: Controller): void {
    const index = this.slots.indexOf(null);
    if (index < 0) return;
    const pawn = makePawn(PlayerColors[index]);
    pawn.position.set((index - 1.5) * 1.6, 0, 2);
    this.scene.add(pawn);
    this.slots[index] = { controller, pawn, vy: 0, coins: 0, stars: 0 };
    this.game.audio.play('join');
    this.refreshSlots();
  }

  update(dt: number): void {
    this.t += dt;
    const input = this.game.input;
    const joined = new Set(this.slots.filter((p) => p).map((p) => p!.controller));

    for (const c of input.controllers) {
      if (!joined.has(c) && c.pressed('a')) this.join(c);
    }

    // Unplugged pads leave their slot.
    let changed = false;
    this.slots.forEach((p, i) => {
      if (p && !input.controllers.includes(p.controller)) {
        this.scene.remove(p.pawn);
        this.slots[i] = null;
        changed = true;
      }
    });
    if (changed) this.refreshSlots();

    for (const p of this.slots) {
      if (p) this.updatePlayer(p, dt);
    }

    for (const coin of this.coins) {
      coin.rotation.y = this.t * 3;
    }
    this.star.rotation.y = this.t * 2;
    this.star.position.y = 1.2 + Math.sin(this.t * 3) * 0.15;

    const anyJoinedStart = this.slots.some((p) => p?.controller.pressed('start'));
    const keyboardStart = !joined.has(input.keyboard) && input.keyboard.pressed('start');
    if (anyJoinedStart || keyboardStart) {
      this.game.audio.play('back');
      this.game.scenes.go(new TitleScene());
    }
  }

  private updatePlayer(p: Player, dt: number): void {
    const c = p.controller;
    const pos = p.pawn.position;
    const grounded = pos.y <= 0.0001;

    const move = new THREE.Vector3(c.stickX, 0, -c.stickY);
    if (move.lengthSq() > 1) move.normalize();
    pos.addScaledVector(move, SPEED * dt);
    if (move.lengthSq() > 0.01) {
      // Turn to face the direction of travel.
      const target = Math.atan2(move.x, move.z);
      let diff = target - p.pawn.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.pawn.rotation.y += diff * Math.min(1, dt * 14);
    }

    // Stay on the island.
    const flat = Math.hypot(pos.x, pos.z);
    const max = ISLAND_RADIUS - 0.5;
    if (flat > max) {
      pos.x *= max / flat;
      pos.z *= max / flat;
    }

    if (grounded && c.pressed('a')) {
      p.vy = JUMP;
      this.game.audio.play('jump');
    }
    p.vy -= GRAVITY * dt;
    pos.y = Math.max(0, pos.y + p.vy * dt);
    if (pos.y === 0) p.vy = 0;

    // Squash and stretch while airborne or walking.
    const walk = move.length() > 0.1 && pos.y === 0 ? Math.abs(Math.sin(this.t * 14)) * 0.06 : 0;
    const air = pos.y > 0 ? Math.min(0.12, Math.abs(p.vy) * 0.012) : 0;
    p.pawn.scale.set(1 - air * 0.5, 1 + air - walk, 1 - air * 0.5);

    for (const coin of this.coins) {
      if (coin.position.distanceTo(new THREE.Vector3(pos.x, pos.y + 0.6, pos.z)) < 0.8) {
        p.coins++;
        this.game.audio.play('coin');
        this.placeRandomly(coin, 0.6);
        this.refreshSlots();
      }
    }
    if (this.star.position.distanceTo(new THREE.Vector3(pos.x, pos.y + 0.8, pos.z)) < 1) {
      p.stars++;
      this.game.audio.play('star');
      this.placeRandomly(this.star, 1.2);
      this.refreshSlots();
    }
  }

  exit(): void {}
}
