import * as THREE from 'three';
import { stompTheme } from '../audio/songs/fuseStompThemes';
import type { Button } from '../input/input';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { scorePanel, topScorers } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const BPM = 120;
const BEAT = 60 / BPM;
/** The sequencer starts this long after play does. */
const OFFSET = 0.05;
const FIRST_BEAT = 4;
const LAST_BEAT = 76;
/** Seconds a note takes to fall from the top of the lane to the hit ring. */
const LEAD = 1.3;
const PERFECT = 0.07;
const GOOD = 0.16;
const LANE_TOP = 7.4;
const HIT_Y = 2.8;
const SPACING = 3;

type Key = 'a' | 'b' | 'x' | 'y';
const KEYS: readonly Key[] = ['a', 'b', 'x', 'y'];
const KEY_COLORS: Record<Key, number> = { a: Palette.green, b: Palette.coral, x: 0x6fb4ff, y: Palette.yellow };
const KEY_NOTES: Record<Key, string> = { a: 'A5', b: 'C6', x: 'E6', y: 'G6' };

type Judgement = 'perfect' | 'good' | 'miss';

interface Note {
  at: number;
  key: Key;
}

interface Lane {
  sprites: THREE.Sprite[];
  judged: (Judgement | null)[];
  /** Index of the first note not yet judged. */
  next: number;
  pad: THREE.Mesh;
  flash: number;
  label: THREE.Sprite;
  labelLife: number;
  ring: THREE.Sprite;
  /** CPU plan: press time and button per note (null = freeze up). */
  plan: { at: number; key: Key | null }[];
}

function canvasTexture(draw: (g: CanvasRenderingContext2D) => void, w = 128, h = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buttonTexture(key: Key): THREE.CanvasTexture {
  return canvasTexture((g) => {
    g.fillStyle = css(Palette.ink);
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = css(KEY_COLORS[key]);
    g.beginPath();
    g.arc(64, 64, 50, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = css(Palette.cream);
    g.font = '900 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(key.toUpperCase(), 64, 68);
  });
}

function ringTexture(): THREE.CanvasTexture {
  return canvasTexture((g) => {
    g.lineWidth = 10;
    g.strokeStyle = css(Palette.ink);
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = css(Palette.cream);
    g.stroke();
  });
}

function wordTexture(word: string, color: number): THREE.CanvasTexture {
  return canvasTexture(
    (g) => {
      g.font = '900 46px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 12;
      g.lineJoin = 'round';
      g.strokeStyle = css(Palette.ink);
      g.strokeText(word, 128, 40);
      g.fillStyle = css(color);
      g.fillText(word, 128, 40);
    },
    256,
    80,
  );
}

/** One shared note chart: sparse quarter notes that build into eighths. */
function makeChart(rand: () => number): Note[] {
  const notes: Note[] = [];
  let last: Key = 'a';
  for (let b = FIRST_BEAT; b < LAST_BEAT; b++) {
    const progress = (b - FIRST_BEAT) / (LAST_BEAT - FIRST_BEAT);
    const onBeat = progress < 0.2 ? b % 2 === 0 : rand() < 0.75 + progress * 0.2;
    const offBeat = progress > 0.35 && rand() < (progress - 0.3) * 0.7;
    for (const [hit, half] of [
      [onBeat, 0],
      [offBeat, 0.5],
    ] as const) {
      if (!hit) continue;
      // Mostly change buttons, sometimes repeat for a double tap.
      const key: Key = rand() < 0.25 ? last : KEYS[Math.floor(rand() * 4)];
      last = key;
      notes.push({ at: OFFSET + (b + half) * BEAT, key });
    }
  }
  return notes;
}

/**
 * Button notes fall down each dancer's lane in time with the disco beat.
 * Press the matching button as it crosses the ring: Perfect scores 3, Good
 * scores 1, and a streak of ten adds a bonus. Best score when the song ends wins.
 */
class BoogieStomp extends Minigame {
  readonly timeLimit = 42;
  private chart: Note[] = [];
  private lanes = new Map<MinigamePlayer, Lane>();
  private board!: HTMLDivElement;
  private tiles: THREE.Mesh[] = [];
  private lights: THREE.Mesh[] = [];
  private clock = 0;
  private beat = -1;
  private readonly words: Record<Judgement, THREE.CanvasTexture> = {
    perfect: wordTexture('PERFECT!', Palette.yellow),
    good: wordTexture('GOOD', Palette.mint),
    miss: wordTexture('MISS', Palette.rose),
  };

  protected setup(): void {
    arenaBasics(this.scene, [0x3a2a6a, 0xb07ad8], 0x2a1f4a, -6);
    // Light-up dance floor.
    for (let i = -6; i <= 6; i++) {
      for (let j = -3; j <= 1; j++) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, 0.2, 0.96),
          new THREE.MeshBasicMaterial({ color: Palette.lavender }),
        );
        tile.position.set(i, -0.1, j);
        tile.userData.phase = (i * 3 + j * 5 + 40) % 4;
        this.scene.add(tile);
        this.tiles.push(tile);
      }
    }
    const stage = toonMesh(new THREE.BoxGeometry(13.4, 0.6, 5.4), Palette.ink, { outline: 0.05 });
    stage.position.set(0, -0.5, -1);
    this.scene.add(stage);
    // Spinning mirror ball and a row of party lights.
    const ball = toonMesh(new THREE.IcosahedronGeometry(0.8, 1), 0xd8d8f0, { outline: 0.03 });
    ball.position.set(0, 8.6, -2.6);
    ball.name = 'ball';
    this.scene.add(ball);
    for (let i = 0; i < 6; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: Palette.rose }));
      bulb.position.set(-6.25 + i * 2.5, 8.6, -3);
      this.scene.add(bulb);
      this.lights.push(bulb);
    }

    const rng = this.game.rng;
    this.chart = makeChart(() => rng.next());
    const ringTex = ringTexture();
    const btnTex = Object.fromEntries(KEYS.map((k) => [k, buttonTexture(k)])) as Record<Key, THREE.CanvasTexture>;
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * SPACING;
      p.character.position.set(x, 0, 0);
      p.character.rotation.y = 0;
      p.character.setExpression('determined');
      p.data.score = 0;
      p.data.combo = 0;
      p.data.hop = 0;
      p.data.vy = 0;

      const strip = toonMesh(new THREE.BoxGeometry(1.5, LANE_TOP - HIT_Y + 1.6, 0.2), 0x4a3a7a, { outline: 0.04 });
      strip.position.set(x, (LANE_TOP + HIT_Y) / 2, -1.6);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: p.character.def.colors.accent }));
      edge.position.set(x, HIT_Y, -1.48);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 28), new THREE.MeshBasicMaterial({ color: p.character.def.colors.accent }));
      pad.position.set(x, 0.04, 0);
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, depthWrite: false }));
      ring.position.set(x, HIT_Y, -1.4);
      ring.scale.setScalar(1.15);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.words.good, transparent: true, depthTest: false }));
      label.scale.set(2.2, 0.69, 1);
      label.position.set(x, HIT_Y - 0.9, -1);
      label.visible = false;
      label.renderOrder = 5;
      this.scene.add(strip, edge, pad, ring, label);

      const sprites = this.chart.map((note) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: btnTex[note.key], transparent: true }));
        s.scale.setScalar(0.85);
        s.visible = false;
        s.position.set(x, LANE_TOP, -1.35);
        this.scene.add(s);
        return s;
      });

      // CPUs get a skill level and plan every press up front, from the shared rng.
      const skill = rng.range(0.42, 0.6);
      const plan = this.chart.map((note) => {
        const roll = rng.next();
        if (roll < skill) return { at: note.at + rng.range(-0.05, 0.05), key: note.key };
        if (roll < 0.86) return { at: note.at + rng.range(0.08, 0.14) * (rng.next() < 0.5 ? -1 : 1), key: note.key };
        if (roll < 0.94) return { at: note.at + rng.range(-0.03, 0.03), key: KEYS[(KEYS.indexOf(note.key) + rng.int(1, 3)) % 4] };
        return { at: note.at, key: null };
      });
      this.lanes.set(p, { sprites, judged: this.chart.map(() => null), next: 0, pad, flash: 0, label, labelLife: 0, ring, plan });
    });

    this.camera.position.set(0, 4.6, 13.5);
    this.camera.lookAt(0, 3.6, 0);
    this.board = scorePanel(this.overlay);
    // The lanes fill the top of the screen, so the scores sit below the stage.
    this.board.style.top = 'auto';
    this.board.style.bottom = '16px';
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => {
        const c = css(p.character.def.colors.accent);
        const combo = p.data.combo as number;
        return `<span style="color:${c}">${p.data.score as number}${combo >= 5 ? `<small style="font-size:14px"> ×${combo}</small>` : ''}</span>`;
      })
      .join('');
  }

  private judge(p: MinigamePlayer, lane: Lane, idx: number, j: Judgement): void {
    lane.judged[idx] = j;
    lane.sprites[idx].visible = false;
    lane.label.visible = true;
    lane.label.material.map = this.words[j];
    lane.label.material.needsUpdate = true;
    lane.label.scale.set(2.6, 0.81, 1);
    lane.labelLife = 0.45;
    const c = p.character;
    if (j === 'miss') {
      p.data.combo = 0;
      c.setExpression('sad');
      c.pose = 'sulk';
      p.data.sulk = 0.4;
      return;
    }
    const combo = (p.data.combo as number) + 1;
    p.data.combo = combo;
    p.data.score = (p.data.score as number) + (j === 'perfect' ? 3 : 1) + (combo % 10 === 0 ? 5 : 0);
    lane.flash = 1;
    c.setExpression('happy');
    c.pose = 'jump';
    p.data.vy = 4.5;
    p.data.sulk = 0;
    // Only the local players' hits ring out, or four CPUs would drown the song.
    if (p.controller) this.game.audio.note('bell', KEY_NOTES[this.chart[idx].key], 0.12, 0.18);
  }

  private press(p: MinigamePlayer, lane: Lane, key: Key): void {
    const idx = lane.next;
    if (idx >= this.chart.length) return;
    const off = this.clock - this.chart[idx].at;
    // Presses well ahead of the next note are ignored rather than punished.
    if (off < -GOOD) return;
    lane.next++;
    if (key !== this.chart[idx].key) this.judge(p, lane, idx, 'miss');
    else this.judge(p, lane, idx, Math.abs(off) <= PERFECT ? 'perfect' : 'good');
  }

  play(dt: number): void {
    this.clock += dt;
    const beat = Math.floor((this.clock - OFFSET) / BEAT);
    if (beat !== this.beat) {
      this.beat = beat;
      for (const t of this.tiles) {
        const on = (t.userData.phase as number) === ((beat % 4) + 4) % 4;
        (t.material as THREE.MeshBasicMaterial).color.setHex(on ? [Palette.rose, Palette.sky, Palette.butter, Palette.mint][beat & 3] : Palette.lavender);
      }
      this.lights.forEach((l, i) => (l.material as THREE.MeshBasicMaterial).color.setHex((i + beat) % 2 ? Palette.rose : Palette.butter));
    }

    for (const p of this.players) {
      const lane = this.lanes.get(p)!;
      if (p.controller) {
        for (const k of KEYS) if (p.controller.pressed(k as Button)) this.press(p, lane, k);
      } else {
        while (lane.next < this.chart.length) {
          const step = lane.plan[lane.next];
          if (!step.key || this.clock < step.at) break;
          this.press(p, lane, step.key);
        }
      }
      // Anything that slid past the ring unanswered is a miss.
      while (lane.next < this.chart.length && this.clock - this.chart[lane.next].at > GOOD) {
        this.judge(p, lane, lane.next, 'miss');
        lane.next++;
      }
      for (let i = lane.next; i < this.chart.length; i++) {
        const until = this.chart[i].at - this.clock;
        const s = lane.sprites[i];
        if (until > LEAD) break;
        s.visible = true;
        s.position.y = HIT_Y + (until / LEAD) * (LANE_TOP - HIT_Y);
      }
    }
    this.renderScore();

    const end = this.chart[this.chart.length - 1].at + 1;
    if (this.clock >= end) this.finish(this.players.filter((p) => topScorers(this.players, (q) => q.data.score as number, 0).includes(p.seat)));
  }

  animate(dt: number): void {
    super.animate(dt);
    const pulse = 1 - Math.min(1, (((this.clock - OFFSET) % BEAT) + BEAT) % BEAT / 0.15);
    for (const p of this.players) {
      const lane = this.lanes.get(p)!;
      const c = p.character;
      lane.flash = Math.max(0, lane.flash - dt * 4);
      lane.pad.scale.setScalar(1 + lane.flash * 0.25);
      lane.ring.scale.setScalar(1.15 + pulse * 0.12 + lane.flash * 0.3);
      lane.labelLife -= dt;
      lane.label.scale.lerp(new THREE.Vector3(2.2, 0.69, 1), Math.min(1, dt * 10));
      if (lane.labelLife <= 0) lane.label.visible = false;
      // Stomp hop on a hit, bob to the beat otherwise.
      p.data.vy = (p.data.vy as number) - 26 * dt;
      c.position.y = Math.max(0, c.position.y + (p.data.vy as number) * dt);
      if (c.position.y === 0 && c.pose === 'jump') {
        c.land();
        c.pose = 'idle';
      }
      p.data.sulk = Math.max(0, ((p.data.sulk as number) ?? 0) - dt);
      if (c.pose === 'sulk' && (p.data.sulk as number) === 0 && !this.winners) {
        c.pose = 'idle';
        c.setExpression('determined');
      }
      if (c.pose === 'idle') c.scale.set(1 + pulse * 0.04, 1 - pulse * 0.06, 1 + pulse * 0.04);
      else c.scale.setScalar(1);
    }
    const ball = this.scene.getObjectByName('ball');
    if (ball) ball.rotation.y += dt * 1.2;
  }

  timeout(): number[] {
    return topScorers(this.players, (p) => p.data.score as number, 0);
  }
}

export const boogieStomp: MinigameDef = {
  id: 'boogiestomp',
  name: 'Boogie Stomp',
  kind: 'ffa',
  duel: true,
  song: stompTheme,
  rules: 'Button notes fall down your lane to the beat. Press the matching button as each one hits the ring! Perfect timing scores big, and streaks earn bonuses. Top score wins!',
  controls: 'A / B / X / Y: hit the notes (keyboard J / K / U / I)',
  create: () => new BoogieStomp(),
};
