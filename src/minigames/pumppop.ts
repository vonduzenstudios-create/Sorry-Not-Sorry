import * as THREE from 'three';
import { pumpTheme } from '../audio/songs/minigameThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { cpuMash, scorePanel, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

/** Pumps needed to pop a balloon. */
const FULL = 32;
/** Air lost per second, so steady pumping beats bursts. */
const LEAK = 2.2;
const SPACING = 3.4;

interface Rig {
  balloon: THREE.Mesh;
  plunger: THREE.Group;
  knot: THREE.Mesh;
  /** Plunger travel animation, 1 right after a pump. */
  push: number;
  popped: boolean;
  bits: THREE.Mesh[];
}

/**
 * Mash A to work the pump and blow up your balloon. It leaks a little, so
 * don't stop! First balloon to pop wins.
 */
class PumpPumpPop extends Minigame {
  readonly timeLimit = 25;
  private rigs = new Map<MinigamePlayer, Rig>();
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xffb8d8, 0xfff2c8], 0xffd7a8, -0.05);
    // Circus stage with striped tent wall behind.
    const stage = toonMesh(new THREE.BoxGeometry(16, 0.5, 6), 0xc98a5a, { outline: 0.05 });
    stage.position.set(0, -0.25, 0);
    this.scene.add(stage);
    for (let i = 0; i < 12; i++) {
      const stripe = toonMesh(new THREE.BoxGeometry(1.6, 9, 0.3), i % 2 ? Palette.cream : Palette.coral, { outline: false });
      stripe.position.set(-8.8 + i * 1.6, 4, -4);
      this.scene.add(stripe);
    }
    const bunting = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const flag = toonMesh(new THREE.ConeGeometry(0.3, 0.6, 3), [Palette.yellow, Palette.mint, Palette.violet, Palette.sky][i % 4], { outline: 0.02 });
      flag.rotation.x = Math.PI;
      flag.position.set(-8 + i * 1.07, 7.2 - Math.sin((i / 15) * Math.PI) * 0.8, -3.6);
      bunting.add(flag);
    }
    this.scene.add(bunting);

    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * SPACING;
      p.character.position.set(x - 0.6, 0, 1.2);
      p.character.rotation.y = 0.5;
      p.data.air = 0;
      // CPUs mash at their own pace for the whole game.
      p.data.rate = 6 + this.game.rng.next() * 2.6;

      const pump = toonMesh(new THREE.CylinderGeometry(0.28, 0.32, 1.1, 16), Palette.sky, { outline: 0.03 });
      pump.position.set(x + 0.4, 0.55, 1.2);
      const plunger = new THREE.Group();
      const rod = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), Palette.cream, { outline: 0.02 });
      rod.position.y = 0.4;
      const handle = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8), Palette.ink, { outline: false });
      handle.rotation.z = Math.PI / 2;
      handle.position.y = 0.8;
      plunger.add(rod, handle);
      plunger.position.set(x + 0.4, 1.1, 1.2);
      const hose = toonMesh(new THREE.TorusGeometry(0.5, 0.05, 6, 16, Math.PI), Palette.ink, { outline: false });
      hose.position.set(x + 0.9, 0.3, 1.2);
      hose.rotation.z = Math.PI;
      const balloon = toonMesh(new THREE.SphereGeometry(1, 24, 18), p.character.def.colors.accent, { outline: 0.03 });
      balloon.position.set(x + 1.4, 1, 0.8);
      const knot = toonMesh(new THREE.ConeGeometry(0.12, 0.2, 8), p.character.def.colors.accent, { outline: 0.02 });
      knot.position.set(x + 1.4, 0.15, 0.8);
      this.scene.add(pump, plunger, hose, balloon, knot);
      this.rigs.set(p, { balloon, plunger, knot, push: 0, popped: false, bits: [] });
      this.size(p);
    });

    this.camera.position.set(0, 4.5, 13);
    this.camera.lookAt(0, 1.8, 0);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private size(p: MinigamePlayer): void {
    const rig = this.rigs.get(p)!;
    const s = 0.25 + (p.data.air as number) / FULL;
    rig.balloon.scale.set(s, s * 1.12, s);
    rig.balloon.position.y = 0.25 + s * 1.12;
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">${Math.min(100, Math.round(((p.data.air as number) / FULL) * 100))}%</span>`)
      .join('');
  }

  private pop(p: MinigamePlayer): void {
    const rig = this.rigs.get(p)!;
    rig.popped = true;
    rig.balloon.visible = false;
    rig.knot.visible = false;
    this.game.audio.play('pop');
    this.game.audio.play('boom');
    // Rubbery scraps fly out (visual only, so Math.random is fine here).
    for (let i = 0; i < 10; i++) {
      const bit = toonMesh(new THREE.TetrahedronGeometry(0.18), p.character.def.colors.accent, { outline: false });
      bit.position.copy(rig.balloon.position);
      bit.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 4);
      this.scene.add(bit);
      rig.bits.push(bit);
    }
  }

  play(dt: number): void {
    for (const p of this.players) {
      const rig = this.rigs.get(p)!;
      const pumped = p.controller ? p.controller.pressed('a') : cpuMash(p, p.data.rate as number, dt);
      let air = Math.max(0, (p.data.air as number) - LEAK * dt);
      if (pumped) {
        air += 1;
        rig.push = 1;
        p.character.pose = 'jump';
        this.game.audio.note('square', ['C5', 'E5', 'G5'][Math.floor(air) % 3], 0.04, 0.08);
      }
      p.data.air = air;
      this.size(p);
      if (air >= FULL && !rig.popped) {
        this.pop(p);
        for (const o of this.players) {
          o.character.pose = o === p ? 'cheer' : 'sulk';
          o.character.setExpression(o === p ? 'happy' : 'surprised');
        }
        this.finish([p]);
        return;
      }
      // Wobble harder the closer it gets to popping.
      const nerves = air / FULL;
      rig.balloon.rotation.z = Math.sin(this.t * (8 + nerves * 30)) * 0.05 * nerves;
      p.character.setExpression(nerves > 0.75 ? 'surprised' : 'determined');
    }
    this.renderScore();
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const [p, rig] of this.rigs) {
      rig.push = Math.max(0, rig.push - dt * 7);
      rig.plunger.position.y = 1.1 - rig.push * 0.45;
      if (rig.push < 0.4 && p.character.pose === 'jump') p.character.pose = 'idle';
      for (const bit of rig.bits) {
        const v = bit.userData.vel as THREE.Vector3;
        v.y -= 20 * dt;
        bit.position.addScaledVector(v, dt);
        bit.rotation.x += dt * 9;
        if (bit.position.y < 0.05) {
          bit.position.y = 0.05;
          v.set(0, 0, 0);
        }
      }
    }
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => Math.round(p.data.air as number), 0);
  }
}

export const pumpPumpPop: MinigameDef = {
  id: 'pumppop',
  name: 'Pump Pump Pop',
  kind: 'ffa',
  duel: true,
  song: pumpTheme,
  rules: 'Mash A to pump up your balloon. It leaks, so keep going! First balloon to pop wins.',
  controls: 'A: pump (mash!)',
  create: () => new PumpPumpPop(),
};
