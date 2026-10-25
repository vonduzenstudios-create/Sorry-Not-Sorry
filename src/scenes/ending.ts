import * as THREE from 'three';
import { drumroll, endingTheme } from '../audio/songs/ending';
import { ordinal, rank } from '../board/hud';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { easeInOut, easeOutBack, linear, Tasks } from '../core/tasks';
import { addLights, skyDome } from '../render/environment';
import { css, Palette } from '../render/palette';
import { makeStar } from '../render/props';
import { toonMesh } from '../render/toon';
import type { PlayerStats } from './board';
import { TitleScene } from './title';

/** What the board hands to the ending: one entry per seat. */
export interface FinalPlayer {
  characterId: string;
  cpu: boolean;
  stars: number;
  coins: number;
  stats: PlayerStats;
}

interface Bonus {
  name: string;
  why: string;
  value: (p: FinalPlayer) => number;
  label: (n: number) => string;
}

const BONUSES: Bonus[] = [
  {
    name: 'Minigame Star',
    why: 'for winning the most coins in minigames',
    value: (p) => p.stats.minigameCoins,
    label: (n) => `● ${n} won`,
  },
  {
    name: 'Coin Star',
    why: 'for holding the most coins at once',
    value: (p) => p.stats.maxCoins,
    label: (n) => `● ${n} peak`,
  },
  {
    name: 'Happening Star',
    why: 'for landing on the most ! spaces',
    value: (p) => p.stats.happenings,
    label: (n) => `${n} × !`,
  },
];

/** Line-up x positions and podium spots by finishing place (1st..4th). */
const LINEUP_X = [-4.2, -1.4, 1.4, 4.2];
const PODIUM = [
  { x: 0, h: 1.8 },
  { x: -2.6, h: 1.2 },
  { x: 2.6, h: 0.7 },
  { x: 5.3, h: 0 },
];
const CONFETTI_COLORS = [Palette.coral, Palette.violet, Palette.green, Palette.yellow, Palette.sky, Palette.rose];

/**
 * End of the game: bonus stars are handed out one by one, then everyone
 * hops onto the podium, confetti falls and the stats card comes up.
 */
export class EndingScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
  private tasks = new Tasks();
  private characters: Character[] = [];
  private cards: HTMLDivElement[] = [];
  private title!: HTMLDivElement;
  private podium = new THREE.Group();
  private confetti: THREE.InstancedMesh | null = null;
  private bits: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3 }[] = [];
  private t = 0;
  private alive = true;

  constructor(private players: FinalPlayer[]) {}

  enter(game: Game): void {
    this.game = game;
    if (game.net) game.net.finished = true;
    this.scene.add(skyDome(0xb8a8ff, 0xffe1f0));
    addLights(this.scene);
    this.buildStage();

    this.players.forEach((p, i) => {
      const c = new Character(ROSTER.find((d) => d.id === p.characterId)!);
      c.position.set(LINEUP_X[i], 0, 0.6);
      this.scene.add(c);
      this.characters.push(c);
    });

    this.camera.position.set(0, 4.2, 14);
    this.camera.lookAt(0, 1.7, 0);
    game.renderer.setView(this.scene, this.camera);

    this.title = game.ui.add('end-title panel');
    const row = game.ui.add('end-cards');
    this.players.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'end-card panel';
      card.style.borderColor = css(ROSTER.find((d) => d.id === p.characterId)!.colors.accent);
      row.appendChild(card);
      this.cards.push(card);
      this.renderCard(i);
    });

    game.audio.playSong(endingTheme);
    void this.run().catch((e) => {
      if (this.alive) throw e;
    });
  }

  exit(): void {
    this.alive = false;
    this.tasks.clear();
    this.game.audio.stopSong();
  }

  private buildStage(): void {
    const floor = toonMesh(new THREE.CylinderGeometry(9, 9.4, 0.6, 64), Palette.lavender, { outline: 0.06 });
    floor.position.y = -0.3;
    const rim = toonMesh(new THREE.TorusGeometry(9, 0.16, 10, 64), Palette.cream, { outline: 0.03 });
    rim.rotation.x = Math.PI / 2;
    this.scene.add(floor, rim);

    // Back arch with a big star on top.
    const arch = toonMesh(new THREE.TorusGeometry(5.8, 0.45, 14, 48, Math.PI), Palette.rose, { outline: 0.05 });
    arch.position.set(0, 0, -4);
    this.scene.add(arch);
    const star = makeStar(1.2);
    star.position.set(0, 6.4, -4);
    star.userData.spin = true;
    this.scene.add(star);
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      const bulb = toonMesh(new THREE.SphereGeometry(0.22, 12, 8), i % 2 ? Palette.yellow : Palette.cream, { outline: 0.02, emissive: 0x332200 });
      bulb.position.set(Math.cos(a) * 5.8, Math.sin(a) * 5.8, -3.55);
      this.scene.add(bulb);
    }

    // Podium blocks, hidden until the reveal.
    const colors = [Palette.yellow, 0xd8dbe8, 0xe8b48a];
    PODIUM.slice(0, 3).forEach((spot, i) => {
      const block = toonMesh(new THREE.BoxGeometry(2.2, spot.h, 2), colors[i], { outline: 0.05 });
      block.position.set(spot.x, spot.h / 2, 0);
      const label = this.numberPlate(i + 1);
      label.position.set(spot.x, spot.h / 2, 1.01);
      this.podium.add(block, label);
    });
    this.podium.scale.set(1, 0.01, 1);
    this.podium.visible = false;
    this.scene.add(this.podium);
  }

  private numberPlate(n: number): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2b2440';
    g.font = '900 96px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  }

  private renderCard(i: number, extra = ''): void {
    const p = this.players[i];
    const def = ROSTER.find((d) => d.id === p.characterId)!;
    this.cards[i].innerHTML = `
      <div class="name">${def.name}${p.cpu ? ' <span class="cpu">CPU</span>' : ''}</div>
      <div class="stats"><span class="star">★ ${p.stars}</span><span class="coin">● ${p.coins}</span></div>
      <div class="extra">${extra}</div>`;
  }

  private setTitle(html: string): void {
    this.title.innerHTML = html;
    this.title.classList.remove('pop');
    void this.title.offsetWidth;
    this.title.classList.add('pop');
  }

  // ---------------------------------------------------------------- flow

  private async run(): Promise<void> {
    for (const c of this.characters) c.pose = 'wave';
    this.setTitle('<div class="big">Bonus Stars!</div><div>Three extra stars go to the best at...</div>');
    await this.tasks.sleep(2.6);
    for (const c of this.characters) c.pose = 'idle';

    for (const bonus of BONUSES) await this.awardBonus(bonus);

    // Drumroll, then the podium.
    this.cards.forEach((_, i) => this.renderCard(i));
    this.game.audio.stopSong();
    this.setTitle('<div class="big">And the winner is...</div>');
    this.game.audio.playSong(drumroll);
    for (const c of this.characters) c.setExpression('determined');
    await this.tasks.sleep(2.2);
    this.game.audio.stopSong();
    await this.podiumReveal();
  }

  private async awardBonus(bonus: Bonus): Promise<void> {
    this.setTitle(`<div class="big">${bonus.name}</div><div>${bonus.why}</div>`);
    const values = this.players.map(bonus.value);
    await this.tasks.sleep(1.4);
    for (let i = 0; i < this.players.length; i++) {
      this.renderCard(i, bonus.label(values[i]));
      this.game.audio.play('select');
      await this.tasks.sleep(0.45);
    }
    await this.tasks.sleep(0.8);
    const best = Math.max(...values);
    if (best <= 0) {
      this.setTitle(`<div class="big">${bonus.name}</div><div>Nobody earns it this time!</div>`);
      this.game.audio.play('back');
      await this.tasks.sleep(1.8);
      return;
    }
    const winners = values.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
    const names = winners.map((i) => this.characters[i].def.name).join(' & ');
    this.setTitle(`<div class="big">${bonus.name}</div><div>goes to <b>${names}</b>!</div>`);
    await Promise.all(winners.map((i) => this.flyStar(i)));
    for (const i of winners) {
      this.players[i].stars++;
      this.renderCard(i, bonus.label(values[i]));
      this.cards[i].classList.add('win');
    }
    await this.tasks.sleep(1.6);
    for (const i of winners) {
      this.cards[i].classList.remove('win');
      this.characters[i].pose = 'idle';
      this.characters[i].setExpression('neutral');
    }
  }

  /** A star drops from the arch onto a player's head. */
  private async flyStar(i: number): Promise<void> {
    const star = makeStar(0.6);
    this.scene.add(star);
    const from = new THREE.Vector3(0, 6.4, -4);
    const to = this.characters[i].position.clone().add(new THREE.Vector3(0, 2.3, 0));
    await this.tasks.tween(
      0.9,
      (k) => {
        star.position.lerpVectors(from, to, k);
        star.position.y += Math.sin(k * Math.PI) * 2;
        star.rotation.y = k * 12;
      },
      easeInOut,
    );
    this.game.audio.play('star');
    const c = this.characters[i];
    c.pose = 'cheer';
    c.setExpression('happy');
    await this.tasks.tween(0.3, (k) => star.scale.setScalar(Math.max(0.01, 1 - k)));
    this.scene.remove(star);
  }

  private async podiumReveal(): Promise<void> {
    const ranks = rank(this.players);
    // Finishing order; ties keep seat order.
    const order = this.players.map((_, i) => i).sort((a, b) => ranks[a] - ranks[b] || a - b);
    this.podium.visible = true;
    this.game.audio.play('boom');
    await this.tasks.tween(0.5, (k) => this.podium.scale.set(1, Math.max(0.01, k), 1), easeOutBack);

    await Promise.all(
      order.map((seat, place) => {
        const c = this.characters[seat];
        const spot = PODIUM[place];
        return this.hopTo(c, new THREE.Vector3(spot.x, spot.h, place === 3 ? 0.9 : 0), place * 0.15);
      }),
    );

    const winners = order.filter((s) => ranks[s] === 1);
    order.forEach((seat) => {
      const c = this.characters[seat];
      const r = ranks[seat];
      c.pose = r === 1 ? 'cheer' : r === 4 ? 'sulk' : 'wave';
      c.setExpression(r === 1 ? 'happy' : r === 4 ? 'sad' : 'neutral');
    });
    this.startConfetti();
    this.game.audio.play('star');
    this.game.audio.playSong(endingTheme);
    const names = winners.map((s) => this.characters[s].def.name).join(' & ');
    this.setTitle(`<div class="big">${names} win${winners.length === 1 ? 's' : ''}!</div><div>Sorry... not sorry!</div>`);
    await this.tasks.sleep(2.4);

    // Stats card replaces the little name cards.
    for (const card of this.cards) card.remove();
    const panel = this.game.ui.add('end-stats panel');
    const head = ['', '★', '●', 'Minigame ●', 'Minigames won', 'Peak ●', '! spaces', 'Items used'];
    panel.innerHTML =
      `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>` +
      order
        .map((seat) => {
          const p = this.players[seat];
          const c = this.characters[seat];
          const s = p.stats;
          return `<tr><td class="who"><span class="dot" style="background:${css(c.def.colors.accent)}"></span>${ordinal(ranks[seat])} ${c.def.name}</td><td>${p.stars}</td><td>${p.coins}</td><td>${s.minigameCoins}</td><td>${s.minigamesWon}</td><td>${s.maxCoins}</td><td>${s.happenings}</td><td>${s.itemsUsed}</td></tr>`;
        })
        .join('') +
      '</table><div class="hint-line">Press A to return to the title</div>';

    await this.tasks.until(() => this.game.controllers.some((c) => c.pressed('a') || c.pressed('start')));
    this.game.audio.play('confirm');
    // Online, everyone sees the same press on the same frame and leaves together.
    this.game.leaveOnline();
    this.game.scenes.go(new TitleScene());
  }

  private async hopTo(c: Character, to: THREE.Vector3, delay: number): Promise<void> {
    await this.tasks.sleep(delay);
    const from = c.position.clone();
    c.pose = 'jump';
    this.game.audio.play('jump');
    await this.tasks.tween(
      0.55,
      (k) => {
        c.position.lerpVectors(from, to, k);
        c.position.y += Math.sin(k * Math.PI) * 2.4;
      },
      linear,
    );
    c.land();
    c.pose = 'idle';
  }

  private startConfetti(): void {
    const count = 220;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      mesh.setColorAt(i, color.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
      this.bits.push({
        pos: new THREE.Vector3((Math.random() - 0.5) * 18, 6 + Math.random() * 10, (Math.random() - 0.5) * 6),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -1.4 - Math.random() * 1.2, 0),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        spin: new THREE.Vector3(Math.random() * 5, Math.random() * 5, 0),
      });
    }
    this.confetti = mesh;
    this.scene.add(mesh);
  }

  update(dt: number): void {
    this.t += dt;
    this.tasks.update(dt);
    for (const c of this.characters) c.update(dt);
    this.scene.traverse((o) => {
      if (o.userData.spin) o.rotation.y = this.t * 1.5;
    });

    if (this.confetti) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      this.bits.forEach((b, i) => {
        b.pos.addScaledVector(b.vel, dt);
        b.pos.x += Math.sin(this.t * 2 + i) * dt * 0.4;
        if (b.pos.y < -0.2) b.pos.y = 12 + Math.random() * 3;
        b.rot.x += b.spin.x * dt;
        b.rot.y += b.spin.y * dt;
        m.compose(b.pos, q.setFromEuler(b.rot), one);
        this.confetti!.setMatrixAt(i, m);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
    }

    // Gentle camera sway.
    this.camera.position.x = Math.sin(this.t * 0.3) * 1.2;
    this.camera.lookAt(0, 1.7, 0);
  }
}
