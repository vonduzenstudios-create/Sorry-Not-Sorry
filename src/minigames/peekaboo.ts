import * as THREE from 'three';
import { peekabooTheme } from '../audio/songs/minigameThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { DIRS, dirPressed, scorePanel, type Dir } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const ROUNDS = 5;
const PICK_TIME = 2.4;
const REVEAL_TIME = 2.2;
const ROT: Record<Dir, number> = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 };
const FACE: Record<Dir, number> = { up: Math.PI, right: Math.PI / 2, down: 0, left: -Math.PI / 2 };

type Phase = 'pick' | 'reveal';

function arrowMesh(size: number, color: number): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, size);
  s.lineTo(size * 0.8, 0);
  s.lineTo(size * 0.32, 0);
  s.lineTo(size * 0.32, -size);
  s.lineTo(-size * 0.32, -size);
  s.lineTo(-size * 0.32, 0);
  s.lineTo(-size * 0.8, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: size * 0.25, bevelEnabled: false });
  geo.center();
  return toonMesh(geo, color, { outline: 0.03 });
}

/**
 * 1 vs 3. Everyone secretly points a direction. When the lookout reveals
 * theirs, any runner pointing the same way is caught. The lookout wins by
 * catching all three in five rounds.
 */
class PeekabooPanic extends Minigame {
  readonly timeLimit = 40;
  private phase: Phase = 'pick';
  private timer = 0;
  private round = 0;
  private arrows = new Map<MinigamePlayer, THREE.Mesh>();
  private lantern!: THREE.PointLight;
  private board!: HTMLDivElement;
  private callout!: HTMLDivElement;
  private judged = false;

  private get solo(): MinigamePlayer {
    return this.players.find((p) => p.team === 0)!;
  }

  private get runners(): MinigamePlayer[] {
    return this.players.filter((p) => p.team === 1);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0x3a2f6a, 0x8a6ab8], 0x2a2050, -2);
    const floor = toonMesh(new THREE.BoxGeometry(14, 0.6, 9), 0x6a5a9a, { outline: 0.05 });
    floor.position.y = -0.3;
    this.scene.add(floor);
    // Spooky garden: lumpy hedges, a moon and some gravestone-ish blocks.
    for (let i = 0; i < 7; i++) {
      const hedge = toonMesh(new THREE.SphereGeometry(0.9, 14, 10), 0x4a8a6a, { outline: 0.04 });
      hedge.scale.y = 0.8;
      hedge.position.set(-6 + i * 2, 0.4, -4);
      this.scene.add(hedge);
    }
    const moon = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: Palette.butter }));
    moon.position.set(5, 7, -12);
    this.scene.add(moon);
    for (const x of [-5.6, 5.6]) {
      const stone = toonMesh(new THREE.BoxGeometry(0.8, 1.1, 0.3), 0xb8b0d0, { outline: 0.03 });
      stone.position.set(x, 0.55, -1.5);
      this.scene.add(stone);
    }
    this.lantern = new THREE.PointLight(0xffe8a0, 6, 12);
    this.lantern.position.set(0, 4, 0);
    this.scene.add(this.lantern);

    const stage = toonMesh(new THREE.CylinderGeometry(1.2, 1.4, 1.2, 20), Palette.violet, { outline: 0.04 });
    stage.position.set(0, 0.6, -2.4);
    this.scene.add(stage);
    const solo = this.solo;
    solo.character.position.set(0, 1.2, -2.4);
    solo.character.rotation.y = 0;
    this.addArrow(solo, new THREE.Vector3(0, 3.4, -2.4), 0.6);

    this.runners.forEach((p, i) => {
      const x = (i - 1) * 3.4;
      const pad = toonMesh(new THREE.CylinderGeometry(0.8, 0.9, 0.3, 16), Palette.cream, { outline: 0.03 });
      pad.position.set(x, 0.15, 1.6);
      this.scene.add(pad);
      p.character.position.set(x, 0.3, 1.6);
      this.addArrow(p, new THREE.Vector3(x, 2.5, 1.6), 0.4);
    });

    this.camera.position.set(0, 5.5, 11);
    this.camera.lookAt(0, 1.6, -0.4);
    this.board = scorePanel(this.overlay);
    this.callout = document.createElement('div');
    this.callout.className = 'mg-callout';
    this.overlay.appendChild(this.callout);
    this.newRound();
  }

  private addArrow(p: MinigamePlayer, at: THREE.Vector3, size: number): void {
    const a = arrowMesh(size, p.character.def.colors.accent);
    a.position.copy(at);
    a.visible = false;
    this.scene.add(a);
    this.arrows.set(p, a);
  }

  private newRound(): void {
    this.round++;
    this.phase = 'pick';
    this.timer = 0;
    this.judged = false;
    for (const p of this.players) {
      if (!p.alive) continue;
      // Everyone starts with a random pick, so sitting still is still a gamble.
      p.data.choice = this.game.rng.pick(DIRS);
      p.data.locked = false;
      p.data.lockAt = 0.4 + this.game.rng.next() * (PICK_TIME - 0.8);
      this.arrows.get(p)!.visible = false;
      p.character.pose = 'idle';
      p.character.setExpression('determined');
    }
    this.callout.textContent = `Round ${this.round} of ${ROUNDS}: pick a direction!`;
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => {
        const c = css(p.character.def.colors.accent);
        if (!p.alive) return `<span style="color:${c};opacity:.4">${p.character.def.name} ✕</span>`;
        const mark = this.phase === 'pick' ? (p.data.locked ? '✓' : '…') : '';
        return `<span style="color:${c}">${p.character.def.name}${p === this.solo ? ' ★' : ''} ${mark}</span>`;
      })
      .join('');
  }

  play(dt: number): void {
    this.timer += dt;
    if (this.phase === 'pick') {
      let changed = false;
      for (const p of this.players) {
        if (!p.alive) continue;
        if (p.controller) {
          const d = dirPressed(p);
          if (d) {
            p.data.choice = d;
            if (!p.data.locked) changed = true;
            p.data.locked = true;
            this.game.audio.play('select');
          }
        } else if (!p.data.locked && this.timer >= (p.data.lockAt as number)) {
          p.data.locked = true;
          changed = true;
        }
        // Spin while picking so nobody can peek.
        p.character.rotation.y += dt * (p.data.locked ? 4 : 9);
      }
      if (changed) this.renderScore();
      if (this.timer >= PICK_TIME) this.reveal();
      return;
    }

    if (!this.judged && this.timer > 0.7) this.judge();
    if (this.timer >= REVEAL_TIME) {
      const left = this.runners.filter((r) => r.alive);
      if (left.length === 0) return this.finish([this.solo]);
      if (this.round >= ROUNDS) return this.runnersWin();
      this.newRound();
    }
  }

  private reveal(): void {
    this.phase = 'reveal';
    this.timer = 0;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = p.data.choice as Dir;
      const a = this.arrows.get(p)!;
      a.visible = true;
      a.rotation.z = ROT[d];
      a.scale.setScalar(1.4);
      p.character.rotation.y = FACE[d];
    }
    this.callout.textContent = 'Peekaboo!';
    this.game.audio.play('confirm');
    this.renderScore();
  }

  private judge(): void {
    this.judged = true;
    const look = this.solo.data.choice as Dir;
    const caught = this.runners.filter((r) => r.alive && r.data.choice === look);
    for (const r of caught) {
      r.alive = false;
      r.character.pose = 'jump';
      r.character.setExpression('surprised');
      r.data.zap = 0;
    }
    if (caught.length) {
      this.game.audio.play('boom');
      this.solo.character.pose = 'cheer';
      this.callout.textContent = `Caught ${caught.map((r) => r.character.def.name).join(' & ')}!`;
    } else {
      this.game.audio.play('back');
      this.solo.character.setExpression('sad');
      this.callout.textContent = 'Nobody caught!';
      for (const r of this.runners) if (r.alive) r.character.pose = 'cheer';
    }
    this.renderScore();
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const a of this.arrows.values()) a.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));
    // Caught runners shrink into a puff.
    for (const r of this.runners) {
      if (r.alive || r.data.zap === undefined) continue;
      const z = (r.data.zap as number) + dt;
      r.data.zap = z;
      r.character.position.y = 0.3 + z * 2;
      r.character.rotation.y += dt * 10;
      r.character.scale.setScalar(Math.max(0.01, 1 - z * 1.2));
      this.arrows.get(r)!.visible = false;
      if (z > 0.85) r.character.visible = false;
    }
    this.lantern.intensity = 6 + Math.sin(this.t * 7) * 0.8;
  }

  protected finish(winners: MinigamePlayer[]): void {
    this.callout.textContent = '';
    super.finish(winners);
  }

  /** The whole team wins together; caught runners pop back for the victory pose. */
  private runnersWin(): void {
    for (const r of this.runners) {
      if (r.alive) continue;
      r.data.zap = undefined;
      r.character.scale.setScalar(1);
      r.character.position.y = 0.3;
      r.character.rotation.y = 0;
    }
    this.finish(this.runners);
  }

  timeout(): number[] {
    this.callout.textContent = '';
    if (!this.runners.some((r) => r.alive)) return [this.solo.seat];
    this.runnersWin();
    return this.runners.map((r) => r.seat);
  }
}

export const peekabooPanic: MinigameDef = {
  id: 'peekaboo',
  name: 'Peekaboo Panic',
  kind: '1v3',
  song: peekabooTheme,
  rules: 'Everyone secretly picks a direction. Runners pointing the same way as the lookout get caught! The lookout wins by catching all three in 5 rounds.',
  controls: 'Stick / d-pad: pick a direction',
  create: () => new PeekabooPanic(),
};
