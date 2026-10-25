import * as THREE from 'three';
import { tugTheme } from '../audio/songs/minigameThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { cpuMash, scorePanel } from './common';
import { Minigame, type MinigameDef } from './types';

/** Rope travel that wins the match. */
const WIN = 2.2;
const PIT = 1.1;
const TUG = 0.16;
const DRAG = 2.6;
/** How far each teammate stands from the rope's middle. */
const GRIP = [1.8, 3];

/**
 * 2 vs 2 tug of war over a mud pit. Mash A to pull: drag the flag past your
 * line and the other team goes for a swim.
 */
class TugTussle extends Minigame {
  readonly timeLimit = 25;
  /** Rope middle along X. Team 0 pulls toward -X, team 1 toward +X. */
  private x = 0;
  private vel = 0;
  private rope = new THREE.Group();
  private board!: HTMLDivElement;
  private teamColors: number[] = [];
  private done = false;

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd8ff, 0xfff0d0], 0x7cc8ec, -3);
    for (const side of [-1, 1]) {
      const bank = toonMesh(new THREE.BoxGeometry(8, 1, 6), Palette.grass, { outline: 0.05 });
      bank.position.set(side * (PIT + 4), -0.5, 0);
      this.scene.add(bank);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 6), new THREE.MeshBasicMaterial({ color: Palette.cream }));
      line.rotation.x = -Math.PI / 2;
      line.position.set(side * WIN, 0.01, 0);
      this.scene.add(line);
    }
    const mud = toonMesh(new THREE.BoxGeometry(PIT * 2, 0.6, 6), 0x8a6040, { outline: 0.03 });
    mud.position.y = -0.7;
    this.scene.add(mud);
    for (let i = 0; i < 6; i++) {
      const bubble = toonMesh(new THREE.SphereGeometry(0.12 + (i % 3) * 0.05, 10, 8), 0x9a7050, { outline: false });
      bubble.position.set(((i % 3) - 1) * 0.6, -0.42, (i - 2.5) * 0.9);
      this.scene.add(bubble);
    }
    // Line markers in the middle of each bank line.
    for (const side of [-1, 1]) {
      const peg = toonMesh(new THREE.ConeGeometry(0.2, 0.6, 8), Palette.yellow, { outline: 0.02 });
      peg.position.set(side * WIN, 0.3, -1.4);
      this.scene.add(peg);
    }

    const cord = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 8), 0xe6c98a, { outline: 0.02 });
    cord.rotation.z = Math.PI / 2;
    const flag = toonMesh(new THREE.ConeGeometry(0.25, 0.7, 3), Palette.coral, { outline: 0.02 });
    flag.rotation.x = Math.PI;
    flag.position.y = -0.3;
    this.rope.add(cord, flag);
    this.rope.position.y = 0.8;
    this.scene.add(this.rope);

    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          p.data.grip = GRIP[i] * (team === 0 ? -1 : 1);
          p.data.rate = 5.8 + this.game.rng.next() * 2.2;
          p.data.pull = 0;
          // Yaw first so the lean tips each puller back along the rope.
          p.character.rotation.order = 'YXZ';
          p.character.rotation.y = team === 0 ? Math.PI / 2 : -Math.PI / 2;
          p.character.position.z = (i - 0.5) * 0.2;
        });
    }
    this.place();
    this.camera.position.set(0, 6, 12.5);
    this.camera.lookAt(0, 0.6, 0);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private place(): void {
    this.rope.position.x = this.x;
    for (const p of this.players) {
      const c = p.character;
      c.position.x = this.x + (p.data.grip as number);
      // Lean back while heaving.
      c.rotation.x = -(0.12 + (p.data.pull as number) * 0.2);
    }
  }

  private renderScore(): void {
    // A little gauge: where the flag sits between the two lines.
    const pct = Math.round(((this.x + WIN) / (WIN * 2)) * 100);
    this.board.innerHTML = `<span style="color:${css(this.teamColors[0])}">◀</span><span style="font-size:18px">${'▬'.repeat(Math.max(0, Math.round(pct / 10)))}⚑${'▬'.repeat(Math.max(0, 10 - Math.round(pct / 10)))}</span><span style="color:${css(this.teamColors[1])}">▶</span>`;
  }

  play(dt: number): void {
    if (this.done) return;
    for (const p of this.players) {
      const pulled = p.controller ? p.controller.pressed('a') : cpuMash(p, p.data.rate as number, dt);
      p.data.pull = Math.max(0, (p.data.pull as number) - dt * 5);
      if (pulled) {
        this.vel += p.team === 0 ? -TUG : TUG;
        p.data.pull = 1;
        p.character.pose = 'walk';
        p.character.moveSpeed = 1;
      } else if ((p.data.pull as number) <= 0) p.character.pose = 'idle';
      p.character.setExpression('determined');
    }
    this.vel *= Math.exp(-DRAG * dt);
    this.x += this.vel * dt;
    this.place();
    this.renderScore();
    if (Math.abs(this.x) >= WIN) {
      const winTeam = this.x < 0 ? 0 : 1;
      this.done = true;
      for (const p of this.players) {
        const won = p.team === winTeam;
        p.character.pose = won ? 'cheer' : 'sulk';
        p.character.setExpression(won ? 'happy' : 'surprised');
        p.character.rotation.x = 0;
        // The losers land in the mud.
        if (!won) p.character.position.set(Math.sign(this.x) * -0.3 + (p.data.grip as number) * 0.15, -0.55, p.character.position.z);
      }
      this.game.audio.play('boom');
      this.finish(this.players.filter((p) => p.team === winTeam));
    }
  }

  timeout(): number[] {
    if (Math.abs(this.x) < 0.15) return [];
    const team = this.x < 0 ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const tugTussle: MinigameDef = {
  id: 'tugtussle',
  name: 'Tug Tussle',
  kind: '2v2',
  song: tugTheme,
  rules: 'Mash A to haul on the rope. Pull the flag past your line to drag the other team into the mud!',
  controls: 'A: pull (mash!)',
  create: () => new TugTussle(),
};
