import * as THREE from 'three';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import type { Seat } from '../core/session';
import { addLights, skyDome } from '../render/environment';
import { css } from '../render/palette';
import { makeCoin, makeIsland, makeStar } from '../render/props';
import { TitleScene } from './title';

const ISLAND_RADIUS = 7;
const SPEED = 4.5;
const GRAVITY = 22;
const JUMP = 8;

interface Player {
  seat: Seat;
  character: Character;
  vy: number;
  coins: number;
  stars: number;
  /** CPU wander target. */
  goal: THREE.Vector3;
  celebrate: number;
}

/**
 * Test bed: the chosen characters run around an island, jump, and grab coins
 * and the star. CPU seats wander toward the nearest coin.
 */
export class PlaygroundScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  private players: Player[] = [];
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

    const bar = game.ui.add('slots');
    game.session.seats.forEach((seat, i) => {
      const def = ROSTER.find((d) => d.id === seat.characterId)!;
      const character = new Character(def);
      character.position.set((i - 1.5) * 1.8, 0, 2);
      this.scene.add(character);
      this.players.push({ seat, character, vy: 0, coins: 0, stars: 0, goal: character.position.clone(), celebrate: 0 });

      const el = document.createElement('div');
      el.className = 'slot panel';
      el.style.borderColor = css(def.colors.accent);
      bar.appendChild(el);
      this.slotEls.push(el);
    });

    this.camera.position.set(0, 11, 12);
    this.camera.lookAt(0, 0, 0.5);
    game.renderer.setView(this.scene, this.camera);

    game.ui.add('hint', 'Stick / WASD to move · A / Space to jump · Start / Enter to quit');
    this.refreshSlots();
  }

  private placeRandomly(obj: THREE.Object3D, y: number): void {
    const r = Math.sqrt(this.game.rng.next()) * (ISLAND_RADIUS - 1);
    const a = this.game.rng.range(0, Math.PI * 2);
    obj.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  }

  private refreshSlots(): void {
    this.players.forEach((p, i) => {
      const who = p.seat.controller ? p.seat.controller.label : 'CPU';
      this.slotEls[i].innerHTML = `<div class="name">${p.character.def.name}</div><div>★ ${p.stars} &nbsp; ● ${p.coins}</div><div class="device">${who}</div>`;
    });
  }

  update(dt: number): void {
    this.t += dt;
    for (const p of this.players) this.updatePlayer(p, dt);

    for (const coin of this.coins) coin.rotation.y = this.t * 3;
    this.star.rotation.y = this.t * 2;
    this.star.position.y = 1.2 + Math.sin(this.t * 3) * 0.15;

    if (this.game.input.controllers.some((c) => c.pressed('start'))) {
      this.game.audio.play('back');
      this.game.scenes.go(new TitleScene());
    }
  }

  /** Stick input for humans; CPUs steer at the nearest coin and hop now and then. */
  private intent(p: Player): { move: THREE.Vector3; jump: boolean } {
    const c = p.seat.controller;
    if (c) return { move: new THREE.Vector3(c.stickX, 0, -c.stickY), jump: c.pressed('a') };

    const pos = p.character.position;
    if (pos.distanceTo(p.goal) < 0.5 || this.game.rng.next() < 0.004) {
      let best = this.coins[0].position;
      for (const coin of this.coins) {
        if (coin.position.distanceTo(pos) < best.distanceTo(pos)) best = coin.position;
      }
      p.goal.set(best.x, 0, best.z);
    }
    const move = p.goal.clone().sub(pos).setY(0);
    if (move.length() > 1) move.normalize();
    move.multiplyScalar(0.75);
    return { move, jump: this.game.rng.next() < 0.006 };
  }

  private updatePlayer(p: Player, dt: number): void {
    const ch = p.character;
    const pos = ch.position;
    const grounded = pos.y <= 0.0001;
    const { move, jump } = this.intent(p);

    if (move.lengthSq() > 1) move.normalize();
    pos.addScaledVector(move, SPEED * dt);
    if (move.lengthSq() > 0.01) {
      const target = Math.atan2(move.x, move.z);
      let diff = target - ch.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      ch.rotation.y += diff * Math.min(1, dt * 14);
    }

    const flat = Math.hypot(pos.x, pos.z);
    const max = ISLAND_RADIUS - 0.5;
    if (flat > max) {
      pos.x *= max / flat;
      pos.z *= max / flat;
    }

    if (grounded && jump) {
      p.vy = JUMP;
      this.game.audio.play('jump');
    }
    p.vy -= GRAVITY * dt;
    pos.y = Math.max(0, pos.y + p.vy * dt);
    if (pos.y === 0) {
      if (!grounded) ch.land();
      p.vy = 0;
    }

    p.celebrate = Math.max(0, p.celebrate - dt);
    if (p.celebrate > 0 && pos.y === 0 && move.lengthSq() < 0.01) ch.pose = 'cheer';
    else if (pos.y > 0) ch.pose = 'jump';
    else if (move.lengthSq() > 0.01) ch.pose = 'walk';
    else ch.pose = 'idle';
    ch.moveSpeed = Math.min(1, move.length());
    ch.setExpression(p.celebrate > 0 ? 'happy' : move.lengthSq() > 0.01 ? 'determined' : 'neutral');
    ch.update(dt);

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
      p.celebrate = 1.5;
      this.game.audio.play('star');
      this.placeRandomly(this.star, 1.2);
      this.refreshSlots();
    }
  }

  exit(): void {}
}

