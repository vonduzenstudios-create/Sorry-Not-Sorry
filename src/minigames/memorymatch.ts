import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { dirPressed, scorePanel, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const COLS = 4;
const ROWS = 4;
const DX = 1.62;
const DZ = 1.95;
const CARD_W = 1.3;
const CARD_D = 1.65;
const LINE_Z = 5.3;
/** Seconds a human may dawdle before the card under the cursor flips itself. */
const PICK_TIME = 6;
const SHOW_TIME = 1.1;
const CPU_STEP = 0.14;

interface Card {
  idx: number;
  symbol: number;
  col: number;
  row: number;
  pivot: THREE.Group;
  face: THREE.Object3D;
  /** 0 face down, 1 face up; eases toward `up`. */
  flip: number;
  up: boolean;
  matched: boolean;
  owner: MinigamePlayer | null;
  home: THREE.Vector3;
}

type Phase = 'pick' | 'show' | 'pause';

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Memory Match: tiptoeing music-box waltz in G. */
export const memoryTheme: Song = {
  name: 'Memory Match',
  bpm: 132,
  stepsPerBeat: 2,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.2,
      pattern: [
        'D5 . B4 . G4 . A4 . B4 . C5 .',
        'D5 . G5 . F#5 . E5 - D5 . . .',
        'C5 . E5 . C5 . B4 . D5 . B4 .',
        'A4 . F#4 . A4 . G4 - - . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.36,
      pattern: [
        'G2 . . . . . D2 . . . . .',
        'G2 . . . . . B1 . . . . .',
        'C2 . . . . . G2 . . . . .',
        'D2 . . . . . G2 . . . . .',
      ].join(' '),
    },
    {
      instrument: 'pluck',
      volume: 0.12,
      pattern: [
        '. . B3 . D4 . . . F#3 . A3 .',
        '. . B3 . D4 . . . D3 . G3 .',
        '. . E3 . G3 . . . B3 . D4 .',
        '. . F#3 . A3 . . . B3 . D4 .',
      ].join(' '),
    },
    { instrument: 'kick', volume: 0.4, pattern: repeat('x . . . . . x . . . . .', 4) },
    { instrument: 'hat', volume: 0.06, pattern: repeat('. . x . x . . . x . x .', 4) },
  ],
};

const SYMBOL_COLORS = [0xff6b6b, 0x9a7bff, 0x4fcf8f, 0xffc93a, 0xff9640, 0xff6fb5, 0x4f9cff, 0x2fbfb4, 0x9b6a45, 0x4a4a6a];
const NOTES = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6'];

function star(points: number, outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

function heart(size: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -size);
  s.bezierCurveTo(size * 1.3, -size * 0.1, size * 0.9, size * 1.1, 0, size * 0.45);
  s.bezierCurveTo(-size * 0.9, size * 1.1, -size * 1.3, -size * 0.1, 0, -size);
  return s;
}

/** The picture on a card's face: ten shapes, each its own color. */
function symbolMesh(i: number): THREE.Object3D {
  const color = SYMBOL_COLORS[i];
  const flat = (shape: THREE.Shape) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
    g.center();
    const m = toonMesh(g, color, { outline: 0.02 });
    m.rotation.x = -0.35;
    return m;
  };
  const geos: (() => THREE.Object3D)[] = [
    () => toonMesh(new THREE.SphereGeometry(0.3, 18, 12), color, { outline: 0.03 }),
    () => toonMesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), color, { outline: 0.03 }),
    () => toonMesh(new THREE.ConeGeometry(0.3, 0.6, 16), color, { outline: 0.03 }),
    () => toonMesh(new THREE.TorusGeometry(0.24, 0.1, 10, 20), color, { outline: 0.02 }),
    () => flat(star(5, 0.38, 0.16)),
    () => flat(heart(0.3)),
    () => toonMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 18), color, { outline: 0.03 }),
    () => toonMesh(new THREE.OctahedronGeometry(0.34), color, { outline: 0.03 }),
    () => toonMesh(new THREE.CapsuleGeometry(0.16, 0.3, 6, 12), color, { outline: 0.03 }),
    () => toonMesh(new THREE.DodecahedronGeometry(0.3), color, { outline: 0.03 }),
  ];
  const g = new THREE.Group();
  const m = geos[i]();
  m.position.y = 0.42;
  g.add(m);
  // A colored disc under the shape so pairs also match by color at a glance.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.061;
  (disc.material as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(0xffffff), 0.65);
  g.add(disc);
  return g;
}

/**
 * Cards lie face down on the table. Take turns flipping two: a pair is yours
 * and you go again, a miss passes the turn. Most pairs when the table is clear wins.
 */
class MemoryMatch extends Minigame {
  readonly timeLimit = 90;
  private cards: Card[] = [];
  private phase: Phase = 'pick';
  private timer = 0;
  private turn = 0;
  private picks: Card[] = [];
  private cursor = { col: 1, row: 1 };
  private cursorMesh = new THREE.Group();
  private cursorMat!: THREE.MeshToonMaterial;
  private board!: HTMLDivElement;
  private callout!: HTMLDivElement;
  /** CPU's planned card and when it may next step the cursor. */
  private target: Card | null = null;
  private stepAt = 0;

  protected setup(): void {
    arenaBasics(this.scene, [0xc8b8ff, 0xffe4f0], 0x9a88d8, -6);
    const floor = toonMesh(new THREE.CylinderGeometry(11, 11, 0.6, 48), Palette.peach, { outline: 0.06 });
    floor.position.y = -1.3;
    this.scene.add(floor);
    const table = toonMesh(new THREE.BoxGeometry(COLS * DX + 0.8, 1, ROWS * DZ + 0.8), 0x5fb58a, { outline: 0.06 });
    table.position.set(0, -0.5, 0);
    const rim = toonMesh(new THREE.BoxGeometry(COLS * DX + 1.3, 0.9, ROWS * DZ + 1.3), 0xa06a40, { outline: 0.05 });
    rim.position.set(0, -0.6, 0);
    this.scene.add(table, rim);

    // Eight pairs, shuffled with the shared rng so every peer deals the same table.
    const deck: number[] = [];
    for (let i = 0; i < (COLS * ROWS) / 2; i++) deck.push(i, i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = this.game.rng.int(0, i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const backMat = new THREE.MeshBasicMaterial({ color: Palette.lavender });
    const dotMat = new THREE.MeshBasicMaterial({ color: Palette.violet });
    deck.forEach((symbol, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const pivot = new THREE.Group();
      const body = toonMesh(new THREE.BoxGeometry(CARD_W, 0.12, CARD_D), Palette.cream, { outline: 0.03 });
      pivot.add(body);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W - 0.16, CARD_D - 0.16), backMat);
      back.rotation.x = Math.PI / 2;
      back.position.y = -0.061;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.28, 4), dotMat);
      dot.rotation.x = Math.PI / 2;
      dot.position.y = -0.062;
      pivot.add(back, dot);
      const face = symbolMesh(symbol);
      pivot.add(face);
      const home = new THREE.Vector3((col - (COLS - 1) / 2) * DX, 0.06, (row - (ROWS - 1) / 2) * DZ);
      pivot.position.copy(home);
      pivot.rotation.z = Math.PI;
      this.scene.add(pivot);
      this.cards.push({ idx, symbol, col, row, pivot, face, flip: 0, up: false, matched: false, owner: null, home });
    });

    this.cursorMat = new THREE.MeshToonMaterial({ color: Palette.coral });
    for (const [w, d, x, z] of [
      [CARD_W + 0.3, 0.12, 0, (CARD_D + 0.18) / 2],
      [CARD_W + 0.3, 0.12, 0, -(CARD_D + 0.18) / 2],
      [0.12, CARD_D + 0.3, (CARD_W + 0.18) / 2, 0],
      [0.12, CARD_D + 0.3, -(CARD_W + 0.18) / 2, 0],
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), this.cursorMat);
      bar.position.set(x, 0.15, z);
      this.cursorMesh.add(bar);
    }
    const pointer = toonMesh(new THREE.ConeGeometry(0.22, 0.45, 12), Palette.cream, { outline: 0.03 });
    pointer.material = this.cursorMat;
    pointer.rotation.x = Math.PI;
    pointer.position.set(0, 1.5, 0.6);
    this.cursorMesh.add(pointer);
    this.scene.add(this.cursorMesh);

    const n = this.players.length;
    this.players.forEach((p, i) => {
      p.character.position.set((i - (n - 1) / 2) * 2.6, -1, LINE_Z);
      p.character.rotation.y = Math.PI;
      p.data.pairs = 0;
      p.data.mem = new Map<number, number>();
    });

    this.camera.position.set(0, 15, 10);
    this.camera.lookAt(0, 0, 0.7);
    this.board = scorePanel(this.overlay);
    this.callout = document.createElement('div');
    this.callout.className = 'mg-callout';
    this.overlay.appendChild(this.callout);
    this.turn = this.game.rng.int(0, n - 1);
    this.startTurn();
  }

  private get current(): MinigamePlayer {
    return this.players[this.turn];
  }

  private cardAt(col: number, row: number): Card {
    return this.cards[row * COLS + col];
  }

  private open(): Card[] {
    return this.cards.filter((c) => !c.matched && !c.up);
  }

  private startTurn(): void {
    this.phase = 'pick';
    this.timer = 0;
    this.picks = [];
    this.target = null;
    this.stepAt = 0.55;
    const p = this.current;
    this.cursorMat.color.setHex(p.character.def.colors.accent);
    for (const q of this.players) {
      q.character.pose = q === p ? 'wave' : 'idle';
      q.character.setExpression(q === p ? 'determined' : 'neutral');
    }
    this.callout.textContent = `${p.character.def.name}'s turn!`;
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => {
        const c = css(p.character.def.colors.accent);
        const on = p === this.current ? 'text-decoration:underline;' : 'opacity:.75;';
        return `<span style="color:${c};${on}">${p.character.def.name} ${p.data.pairs as number}</span>`;
      })
      .join('');
  }

  /** CPUs glimpse every flipped card; some stick, and a few old ones fade. */
  private remember(card: Card): void {
    const rng = this.game.rng;
    for (const p of this.players) {
      if (p.controller) continue;
      const mem = p.data.mem as Map<number, number>;
      for (const k of [...mem.keys()]) if (rng.next() < 0.04) mem.delete(k);
      if (rng.next() < 0.5 + (p.seat % 2) * 0.15) mem.set(card.idx, card.symbol);
    }
  }

  /** What a CPU flips next, from what it remembers. */
  private choose(p: MinigamePlayer): Card {
    const rng = this.game.rng;
    const mem = p.data.mem as Map<number, number>;
    const open = this.open();
    const known = open.filter((c) => mem.get(c.idx) === c.symbol);
    const unknown = open.filter((c) => !mem.has(c.idx));
    const fresh = () => rng.pick(unknown.length ? unknown : open);
    if (rng.next() < 0.05) return rng.pick(open);
    if (this.picks.length === 0) {
      for (const a of known) {
        const b = known.find((c) => c !== a && c.symbol === a.symbol);
        if (b) return a;
      }
      return fresh();
    }
    const first = this.picks[0];
    return known.find((c) => c.symbol === first.symbol) ?? fresh();
  }

  private flip(card: Card): void {
    card.up = true;
    this.picks.push(card);
    this.game.audio.note('bell', NOTES[card.symbol], 0.25, 0.25);
    this.game.audio.play('select');
    this.remember(card);
    this.timer = 0;
    if (this.picks.length === 2) {
      this.phase = 'show';
      this.callout.textContent = this.picks[0].symbol === card.symbol ? 'A match!' : 'No match...';
    } else this.stepAt = this.timer + 0.4;
  }

  private tryFlip(): void {
    const card = this.cardAt(this.cursor.col, this.cursor.row);
    if (card.matched || card.up) {
      this.game.audio.play('back');
      return;
    }
    this.flip(card);
  }

  play(dt: number): void {
    this.timer += dt;
    const p = this.current;
    if (this.phase === 'pick') {
      if (p.controller) {
        const d = dirPressed(p);
        if (d) {
          if (d === 'left') this.cursor.col = Math.max(0, this.cursor.col - 1);
          if (d === 'right') this.cursor.col = Math.min(COLS - 1, this.cursor.col + 1);
          if (d === 'up') this.cursor.row = Math.max(0, this.cursor.row - 1);
          if (d === 'down') this.cursor.row = Math.min(ROWS - 1, this.cursor.row + 1);
          this.game.audio.note('pluck', 'G5', 0.05, 0.1);
        }
        if (p.controller.pressed('a')) this.tryFlip();
        else if (this.timer > PICK_TIME) {
          // Too slow: flip whatever is under the cursor, or the nearest open card.
          const here = this.cardAt(this.cursor.col, this.cursor.row);
          const open = this.open();
          const pick = !here.matched && !here.up ? here : open.reduce((a, b) => (dist(b, this.cursor) < dist(a, this.cursor) ? b : a));
          this.cursor = { col: pick.col, row: pick.row };
          this.flip(pick);
        }
      } else if (this.timer >= this.stepAt) {
        this.target ??= this.choose(p);
        const t = this.target;
        this.stepAt = this.timer + CPU_STEP;
        if (this.cursor.col !== t.col) this.cursor.col += Math.sign(t.col - this.cursor.col);
        else if (this.cursor.row !== t.row) this.cursor.row += Math.sign(t.row - this.cursor.row);
        else {
          this.target = null;
          this.flip(t);
          this.stepAt = this.timer + 0.45;
          return;
        }
        this.game.audio.note('pluck', 'G5', 0.05, 0.08);
      }
      return;
    }

    if (this.phase === 'show') {
      if (this.timer < SHOW_TIME) return;
      const [a, b] = this.picks;
      if (a.symbol === b.symbol) {
        for (const c of this.picks) {
          c.matched = true;
          c.owner = p;
        }
        p.data.pairs = (p.data.pairs as number) + 1;
        p.character.pose = 'cheer';
        p.character.setExpression('happy');
        this.game.audio.play('coin');
        // Everybody now knows those two are gone.
        for (const q of this.players) for (const c of this.picks) (q.data.mem as Map<number, number>).delete(c.idx);
      } else {
        for (const c of this.picks) c.up = false;
        p.character.pose = 'sulk';
        p.character.setExpression('sad');
        this.game.audio.play('back');
      }
      this.phase = 'pause';
      this.timer = 0;
      this.renderScore();
      return;
    }

    if (this.timer < 0.6) return;
    if (this.cards.every((c) => c.matched)) {
      this.finish(this.players.filter((q) => topScorers(this.players, (x) => x.data.pairs as number, 0).includes(q.seat)));
      return;
    }
    // A pair earns another go; a miss passes the turn.
    const [a, b] = this.picks;
    if (a.symbol !== b.symbol) this.turn = (this.turn + 1) % this.players.length;
    this.startTurn();
  }

  animate(dt: number): void {
    super.animate(dt);
    const k = Math.min(1, dt * 9);
    for (const c of this.cards) {
      c.flip += ((c.up || c.matched ? 1 : 0) - c.flip) * k;
      c.pivot.rotation.z = (1 - c.flip) * Math.PI;
      c.face.rotation.y = c.flip > 0.95 ? c.face.rotation.y + dt * 1.5 : 0;
      if (c.matched && c.owner && this.phase !== 'show') {
        // Won pairs fly off to their owner and shrink away.
        const to = c.owner.character.position.clone().add(new THREE.Vector3(0, 1.6, 0));
        c.pivot.position.lerp(to, Math.min(1, dt * 4));
        c.pivot.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
        if (c.pivot.scale.x < 0.05) c.pivot.visible = false;
      } else {
        c.pivot.position.y = c.home.y + Math.sin(c.flip * Math.PI) * 0.7;
      }
    }
    const card = this.cardAt(this.cursor.col, this.cursor.row);
    const want = new THREE.Vector3(card.home.x, 0.1 + Math.abs(Math.sin(this.t * 4)) * 0.08, card.home.z);
    this.cursorMesh.position.lerp(want, Math.min(1, dt * 18));
    this.cursorMesh.visible = this.phase === 'pick' && !this.winners;
    // The player whose turn it is steps up to the table.
    for (const p of this.players) {
      const z = p === this.current && !this.winners ? LINE_Z - 0.6 : LINE_Z;
      p.character.position.z += (z - p.character.position.z) * Math.min(1, dt * 6);
    }
  }

  protected finish(winners: MinigamePlayer[]): void {
    this.callout.textContent = '';
    super.finish(winners);
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return p.data.pairs as number;
  }

  timeout(): number[] {
    this.callout.textContent = '';
    return topScorers(this.players, (p) => p.data.pairs as number, 0);
  }
}

function dist(c: Card, at: { col: number; row: number }): number {
  return Math.abs(c.col - at.col) + Math.abs(c.row - at.row);
}

export const memoryMatch: MinigameDef = {
  id: 'memorymatch',
  name: 'Memory Match',
  kind: 'ffa',
  duel: true,
  song: memoryTheme,
  rules: 'Take turns flipping two cards. Find a pair and it is yours, and you go again! Miss, and the next player is up. Most pairs when the table is clear wins!',
  controls: 'Stick / d-pad: move the cursor · A: flip a card',
  create: () => new MemoryMatch(),
};
