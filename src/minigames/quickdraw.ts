import * as THREE from 'three';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const WINS_NEEDED = 3;

type Phase = 'wait' | 'draw' | 'result';

/**
 * Western showdown. Wait for the sign to flip to DRAW!, then press A first.
 * Pressing early fouls you out of that round. First to three rounds wins.
 */
class QuickDraw extends Minigame {
  readonly timeLimit = 60;
  private phase: Phase = 'wait';
  private timer = 0;
  private drawAt = 0;
  private sign!: THREE.Mesh;
  private signCtx!: CanvasRenderingContext2D;
  private signTex!: THREE.CanvasTexture;
  private board!: HTMLDivElement;
  private fouled = new Set<MinigamePlayer>();

  protected setup(): void {
    arenaBasics(this.scene, [0x9fd0ff, 0xffe0c2], 0xf3d9a4, -0.05);
    const street = toonMesh(new THREE.BoxGeometry(18, 0.3, 6), 0xd9b07a, { outline: 0.05 });
    street.position.y = -0.15;
    this.scene.add(street);

    // Sign post in the middle of the street.
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    this.signCtx = c.getContext('2d')!;
    this.signTex = new THREE.CanvasTexture(c);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    const post = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8), 0xc99a6b, { outline: 0.02 });
    post.position.set(0, 1.1, -2.2);
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: this.signTex }));
    this.sign.position.set(0, 2.6, -2.15);
    const frame = toonMesh(new THREE.BoxGeometry(3.4, 1.8, 0.1), 0xc99a6b, { outline: 0.03 });
    frame.position.set(0, 2.6, -2.25);
    this.scene.add(post, frame, this.sign);

    // A couple of storefronts behind.
    const colors = [0xf2c6a0, 0xd8c8ff, 0xb8f0d8, 0xffc2d6];
    colors.forEach((col, i) => {
      const b = toonMesh(new THREE.BoxGeometry(3.6, 3.5 + (i % 2), 2), col, { outline: 0.05 });
      b.position.set(-6.3 + i * 4.2, 1.75, -5);
      this.scene.add(b);
    });

    const n = this.players.length;
    this.players.forEach((p, i) => {
      p.character.position.set((i - (n - 1) / 2) * 2.6, 0, 1);
      p.character.rotation.y = 0;
      p.data.wins = 0;
    });

    this.camera.position.set(0, 5.5, 11);
    this.camera.lookAt(0, 2.4, 0);
    this.board = document.createElement('div');
    this.board.className = 'mg-score panel';
    this.overlay.appendChild(this.board);
    this.paintSign('WAIT...', Palette.cream, Palette.ink);
    this.newRound();
  }

  private paintSign(text: string, bg: number, fg: number): void {
    const g = this.signCtx;
    g.fillStyle = css(bg);
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = css(fg);
    g.font = '900 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 70);
    this.signTex.needsUpdate = true;
  }

  private newRound(): void {
    this.phase = 'wait';
    this.timer = 0;
    this.drawAt = 1.5 + this.game.rng.next() * 2.5;
    this.fouled.clear();
    for (const p of this.players) {
      p.character.pose = 'idle';
      p.character.setExpression('determined');
      // CPUs pick their reaction time (and sometimes jump the gun) up front.
      p.data.react = 0.22 + this.game.rng.next() * 0.35;
      p.data.jumpGun = this.game.rng.next() < 0.08 ? this.drawAt * this.game.rng.next() : -1;
    }
    this.paintSign('WAIT...', Palette.cream, Palette.ink);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">${p.character.def.name} ${'★'.repeat(p.data.wins as number)}${'☆'.repeat(WINS_NEEDED - (p.data.wins as number))}</span>`)
      .join('');
  }

  private pressed(p: MinigamePlayer): boolean {
    if (p.controller) return p.controller.pressed('a');
    if (this.phase === 'wait') return (p.data.jumpGun as number) > 0 && this.timer >= (p.data.jumpGun as number);
    return this.timer - this.drawAt >= (p.data.react as number);
  }

  play(dt: number): void {
    this.timer += dt;
    if (this.phase === 'result') {
      if (this.timer > 1.6) {
        const champ = this.players.find((p) => (p.data.wins as number) >= WINS_NEEDED);
        if (champ) this.finish([champ]);
        else this.newRound();
      }
      return;
    }

    if (this.phase === 'wait' && this.timer >= this.drawAt) {
      this.phase = 'draw';
      this.paintSign('DRAW!', Palette.coral, Palette.cream);
      this.game.audio.play('boom');
    }

    for (const p of this.players) {
      if (this.fouled.has(p) || !this.pressed(p)) continue;
      if (this.phase === 'wait') {
        // Too early: out for this round.
        this.fouled.add(p);
        p.character.pose = 'sulk';
        p.character.setExpression('sad');
        this.game.audio.play('back');
        if (this.fouled.size === this.players.length) return this.endRound(null);
      } else {
        this.endRound(p);
        return;
      }
    }
  }

  private endRound(winner: MinigamePlayer | null): void {
    this.phase = 'result';
    this.timer = 0;
    if (!winner) {
      this.paintSign('FOUL!', Palette.lavender, Palette.ink);
      return;
    }
    winner.data.wins = (winner.data.wins as number) + 1;
    this.paintSign(winner.character.def.name.toUpperCase(), Palette.yellow, Palette.ink);
    this.game.audio.play('star');
    for (const p of this.players) {
      p.character.pose = p === winner ? 'cheer' : 'sulk';
      p.character.setExpression(p === winner ? 'happy' : 'sad');
    }
    this.renderScore();
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p.data.wins as number;
  }

  timeout(): number[] {
    const best = Math.max(...this.players.map((p) => p.data.wins as number));
    if (best === 0) return [];
    return this.players.filter((p) => p.data.wins === best).map((p) => p.seat);
  }
}

export const quickDraw: MinigameDef = {
  id: 'quickdraw',
  name: 'Quick Draw',
  kind: 'ffa',
  duel: true,
  rules: 'Wait for the sign to say DRAW!, then press A first. Too early and you sit out the round. First to 3 wins!',
  controls: 'A: draw',
  create: () => new QuickDraw(),
};
