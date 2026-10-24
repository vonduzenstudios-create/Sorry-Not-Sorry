import type Peer from 'peerjs';
import * as THREE from 'three';
import { Character } from '../characters/character';
import { ROSTER } from '../characters/roster';
import type { Game } from '../core/game';
import type { Scene } from '../core/scene';
import { Lockstep } from '../net/lockstep';
import { hostRoom, joinRoom, type Link, type Message } from '../net/transport';
import { addLights, skyDome } from '../render/environment';
import { Palette } from '../render/palette';
import { makeIsland } from '../render/props';
import { SelectScene } from './select';
import { TitleScene } from './title';

const MAX_PLAYERS = 4;

/**
 * Online lobby. The host opens a room and shares its four-letter code (or a
 * link); guests join with it. When the host starts, everyone gets the same
 * seed and switches to lockstep, then character select runs for all at once.
 */
export class LobbyScene implements Scene {
  private game!: Game;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  private characters: Character[] = [];
  private panel!: HTMLDivElement;
  private peer: Peer | null = null;
  /** Host: one link per guest, in join order. Guest: the link to the host. */
  private links: Link[] = [];
  private names: string[] = [];
  private code = '';
  private status = '';
  private t = 0;
  private done = false;

  constructor(
    private role: 'host' | 'guest',
    private joinCode = '',
  ) {}

  enter(game: Game): void {
    this.game = game;
    this.scene.add(skyDome(Palette.sky, Palette.rose));
    addLights(this.scene);
    const island = makeIsland(5);
    island.position.y = -0.2;
    this.scene.add(island);
    ROSTER.forEach((def, i) => {
      const c = new Character(def);
      c.position.set((i - 1.5) * 1.7, 0, 1);
      this.scene.add(c);
      this.characters.push(c);
    });
    this.camera.position.set(0, 3.5, 11);
    this.camera.lookAt(0, 1.6, 0);
    game.renderer.setView(this.scene, this.camera);

    game.ui.add('screen-title', this.role === 'host' ? 'Host a game' : 'Join a game');
    this.panel = game.ui.add('lobby panel');
    game.ui.add('hint', this.role === 'host' ? 'Start: begin once friends have joined · B: leave' : 'B: leave');

    if (this.role === 'host') void this.host();
    else if (this.joinCode) void this.join(this.joinCode);
    else this.askCode();
  }

  // ---------------------------------------------------------------- host

  private async host(): Promise<void> {
    this.names = ['Host'];
    this.status = 'Opening a room...';
    this.render();
    try {
      const { code, peer } = await hostRoom(
        (link) => this.addGuest(link),
        (msg) => this.fail(`Couldn't open a room: ${msg}`),
      );
      if (this.done) return void peer.destroy();
      this.peer = peer;
      this.code = code;
      this.status = 'Waiting for friends to join...';
      this.render();
    } catch {
      /* fail() already showed the error */
    }
  }

  private addGuest(link: Link): void {
    if (this.done || this.links.length >= MAX_PLAYERS - 1) {
      link.send({ t: 'full' });
      window.setTimeout(() => link.close(), 500);
      return;
    }
    this.links.push(link);
    link.onClose = () => {
      if (this.done) return;
      this.links = this.links.filter((l) => l !== link);
      this.game.audio.play('back');
      this.syncNames();
    };
    this.game.audio.play('join');
    this.syncNames();
  }

  private syncNames(): void {
    this.names = ['Host', ...this.links.map((_, i) => `Player ${i + 2}`)];
    for (const l of this.links) l.send({ t: 'lobby', names: this.names });
    this.status = this.links.length ? 'Press Start when everyone is in!' : 'Waiting for friends to join...';
    this.render();
  }

  private startAsHost(): void {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    this.links.forEach((l, i) => l.send({ t: 'start', seed, names: this.names, me: i + 1 }));
    this.begin(seed, 0, this.links);
  }

  // ---------------------------------------------------------------- guest

  private askCode(): void {
    this.status = '';
    this.panel.innerHTML = `
      <div class="lobby-label">Room code</div>
      <input class="code-input" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD" />
      <div class="lobby-sub">Type the 4-letter code and press Enter</div>`;
    const input = this.panel.querySelector('input')!;
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim().length === 4) void this.join(input.value.trim());
      if (e.key === 'Escape') this.leave();
    });
  }

  private async join(code: string): Promise<void> {
    this.code = code.toUpperCase();
    this.status = `Joining room ${this.code}...`;
    this.render();
    try {
      const { link, peer } = await joinRoom(this.code, (msg) => this.fail(msg));
      if (this.done) return void peer.destroy();
      this.peer = peer;
      this.links = [link];
      link.onMessage = (m) => this.guestMessage(link, m);
      link.onClose = () => {
        if (!this.done) this.fail('The host closed the room.');
      };
      this.game.audio.play('join');
      this.status = 'Connected! Waiting for the host to start...';
      this.render();
    } catch {
      /* fail() already showed the error */
    }
  }

  private guestMessage(link: Link, m: Message): void {
    if (m.t === 'lobby') {
      this.names = m.names as string[];
      this.render();
    } else if (m.t === 'full') {
      this.fail('That room is full.');
    } else if (m.t === 'start') {
      this.names = m.names as string[];
      this.begin(m.seed as number, m.me as number, [link]);
    }
  }

  // ---------------------------------------------------------------- shared

  private begin(seed: number, me: number, links: Link[]): void {
    this.done = true;
    const game = this.game;
    game.rng.reset(seed);
    game.session.seats = [];
    game.session.turns = 10;
    const net = new Lockstep(me, this.names.length, links, this.names, () => game.rng.seed, {
      onDrop: (peer) => {
        const c = net.controllers[peer];
        c.gone = true;
        for (const seat of game.session.seats) if (seat.controller === c) seat.controller = null;
        game.notify(`${this.names[peer]} left. A CPU takes over.`);
      },
      onHostLost: () => {
        game.leaveOnline();
        game.scenes.go(new TitleScene('The host left the game.'));
      },
      onDesync: (frame) => {
        console.warn(`Desync detected at frame ${frame}`);
        game.notify('Games are out of sync! Results may differ between players.');
      },
    });
    game.goOnline(net, this.peer);
    this.game.audio.play('star');
    game.scenes.go(new SelectScene());
  }

  private fail(msg: string): void {
    if (this.done) return;
    this.status = msg;
    this.game.audio.play('back');
    this.render(true);
  }

  private leave(): void {
    if (this.done) return;
    this.done = true;
    for (const l of this.links) l.close();
    this.peer?.destroy();
    this.game.audio.play('back');
    this.game.scenes.go(new TitleScene());
  }

  private render(error = false): void {
    const link = this.code ? `${location.origin}${location.pathname}?join=${this.code}` : '';
    const players = this.names
      .map((n, i) => `<div class="lobby-player"><span class="dot p${i}"></span>${n}${i === 0 && this.role === 'host' ? ' (you)' : ''}</div>`)
      .join('');
    this.panel.innerHTML = `
      ${this.code ? `<div class="lobby-label">Room code</div><div class="lobby-code">${this.code}</div>` : ''}
      ${this.role === 'host' && link ? `<div class="lobby-link"><span>${link}</span><button class="copy">Copy link</button></div>` : ''}
      <div class="lobby-status ${error ? 'error' : ''}">${this.status}</div>
      ${players ? `<div class="lobby-players">${players}</div>` : ''}
      ${this.role === 'host' ? `<div class="lobby-sub">Up to 4 players. CPUs fill any empty seats.</div>` : ''}`;
    this.panel.querySelector('.copy')?.addEventListener('click', () => {
      void navigator.clipboard?.writeText(link);
      this.game.audio.play('confirm');
    });
  }

  update(dt: number): void {
    this.t += dt;
    this.characters.forEach((c, i) => {
      c.pose = i < this.names.length ? 'wave' : 'idle';
      c.update(dt);
    });
    if (this.done) return;
    for (const c of this.game.input.controllers) {
      if (c.pressed('b')) return this.leave();
      if (this.role === 'host' && c.pressed('start') && this.links.length > 0) return this.startAsHost();
    }
  }

  exit(): void {
    if (!this.done) {
      for (const l of this.links) l.close();
      this.peer?.destroy();
    }
  }
}
