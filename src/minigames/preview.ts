import * as THREE from 'three';
import { Character } from '../characters/character';
import type { Game } from '../core/game';
import type { Button, Controller } from '../input/input';
import { addLights } from '../render/environment';
import { css } from '../render/palette';
import { toon } from '../render/toon';
import { parseControls, roleIndex, type ControlEntry, type ControlRole } from './controls';
import type { MinigameDef, MinigameMode, MinigamePlayer } from './types';

/** What a player has picked on the preview screen. */
type Choice = 'try' | 'menu' | 'play' | 'practice';

const KIND_LABEL = { ffa: '4-Player', '2v2': '2 vs 2', '1v3': '1 vs 3' } as const;
const OPTIONS = ['Play for real', 'Practice round'] as const;
const FACE_BUTTONS: Button[] = ['a', 'b', 'x', 'y', 'l', 'r'];
/** Keyboard keys for each button, shown when the player is on the keyboard. */
const KEY_NAMES: Record<string, string> = { stick: 'WASD', a: 'Space', b: 'Shift', x: 'U', y: 'I', l: 'Q', r: 'E' };
/** World units of the pad strip from top to bottom (orthographic camera). */
const VIEW_H = 5.6;

/** How a puppet acts out an action word. */
type Move = 'hop' | 'dash' | 'duck' | 'mash' | 'act';

function moveFor(text: string): Move {
  if (/jump|hop|bounce|spike|pound/i.test(text)) return 'hop';
  if (/duck/i.test(text)) return 'duck';
  if (/dash|charge|lunge|boost|turbo|burst|shove|push|spin/i.test(text)) return 'dash';
  if (/mash|pump|pull|paddle/i.test(text)) return 'mash';
  return 'act';
}

interface Pad {
  player: MinigamePlayer;
  /** A stand-in character on the practice pad, separate from the minigame's. */
  puppet: Character;
  disc: THREE.Mesh;
  role: ControlRole;
  choice: Choice;
  cursor: number;
  lastY: number;
  tile: HTMLDivElement;
  status: HTMLDivElement;
  menu: HTMLDivElement;
  bubble: HTMLDivElement;
  chips: Map<string, HTMLSpanElement>;
  // Puppet motion (cosmetic only, so it never touches game state).
  hop: number;
  vy: number;
  dash: number;
  act: number;
  bubbleT: number;
  /** CPUs fake some input so their pads aren't frozen. */
  cpu: { t: number; stick: THREE.Vector3; press: Button | null; hold: Button | null; holdT: number };
}

function label(k: string): string {
  return k === 'stick' ? 'Stick' : k.toUpperCase();
}

/**
 * The instruction screen before a minigame: name, rules and controls, plus a
 * practice pad for each player where their character walks in place and acts
 * out whatever button they press. Every human then picks "Play for real" or
 * "Practice round"; if anyone asks for practice, everyone practices.
 *
 * The choice is driven only by controller presses, so online every peer sees
 * the same picks on the same frame (the controllers are lockstep inputs).
 */
export class MinigamePreview {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  readonly root: HTMLDivElement;
  private strip: HTMLDivElement;
  private pads: Pad[] = [];
  private prompt: HTMLDivElement;

  constructor(
    private game: Game,
    def: MinigameDef,
    players: MinigamePlayer[],
    mode: MinigameMode,
    overlay: HTMLDivElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'mg-preview';
    const humans = players.some((p) => human(p.controller));
    this.root.innerHTML = `
      <div class="mg-card panel">
        <div class="mg-kind">${mode === 'duel' ? 'Duel' : mode === 'battle' ? 'Battle' : KIND_LABEL[def.kind]} minigame</div>
        <div class="mg-name">${def.name}</div>
        ${teamsHtml(def, players, mode)}
        <div class="mg-rules">${def.rules}</div>
        <div class="mg-controls">${def.controls}</div>
        <div class="mg-start"></div>
      </div>
      <div class="mg-pads"></div>`;
    this.prompt = this.root.querySelector('.mg-start')!;
    this.prompt.textContent = humans ? 'Try the buttons below! Press START (Enter) when you are ready.' : 'Starting...';
    this.strip = this.root.querySelector('.mg-pads')!;
    overlay.appendChild(this.root);

    addLights(this.scene);
    this.camera.position.set(0, 4, 10);
    this.camera.lookAt(0, 1, 0);

    const roles = parseControls(def.controls);
    for (const p of players) {
      const mates = players.filter((q) => q.team === p.team);
      const role = roles[Math.min(roles.length - 1, roleIndex(def.kind, p.team, mates.indexOf(p)))];
      this.pads.push(this.makePad(p, role));
    }
    game.renderer.inset = { scene: this.scene, camera: this.camera, el: this.strip };
  }

  private makePad(player: MinigamePlayer, role: ControlRole): Pad {
    const def = player.character.def;
    const puppet = new Character(def);
    this.scene.add(puppet);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.25, 28), toon(def.colors.accent));
    disc.position.y = -0.125;
    disc.receiveShadow = true;
    this.scene.add(disc);
    puppet.traverse((o) => (o.castShadow = true));

    const kb = player.controller?.id === 'keyboard';
    const tile = document.createElement('div');
    tile.className = 'mg-pad';
    tile.style.setProperty('--c', css(def.colors.accent));
    const who = human(player.controller) ? player.controller!.label : 'CPU';
    tile.innerHTML = `
      <div class="mg-pad-head"><b>${def.name}</b><span>${who}${role.role ? ` · ${role.role}` : ''}</span></div>
      <div class="mg-pad-bubble"></div>
      <div class="mg-pad-menu"></div>
      <div class="mg-pad-status"></div>
      <div class="mg-pad-keys"></div>`;
    const keys = tile.querySelector('.mg-pad-keys') as HTMLDivElement;
    const chips = new Map<string, HTMLSpanElement>();
    for (const e of role.entries) {
      const row = document.createElement('span');
      row.className = 'mg-chip';
      const names = e.keys.map((k) => label(k) + (kb ? ` <small>${KEY_NAMES[k]}</small>` : '')).join(' / ');
      row.innerHTML = `<b>${names}</b> ${e.text}`;
      keys.appendChild(row);
      for (const k of e.keys) if (!chips.has(k)) chips.set(k, row);
    }
    if (!role.entries.length) keys.textContent = 'Watch and wait!';
    this.strip.appendChild(tile);

    const pad: Pad = {
      player,
      puppet,
      disc,
      role,
      choice: human(player.controller) ? 'try' : 'play',
      cursor: 0,
      lastY: 0,
      tile,
      status: tile.querySelector('.mg-pad-status') as HTMLDivElement,
      menu: tile.querySelector('.mg-pad-menu') as HTMLDivElement,
      bubble: tile.querySelector('.mg-pad-bubble') as HTMLDivElement,
      chips,
      hop: 0,
      vy: 0,
      dash: 0,
      act: 0,
      bubbleT: 0,
      cpu: { t: 1 + Math.random(), stick: new THREE.Vector3(), press: null, hold: null, holdT: 0 },
    };
    this.renderChoice(pad);
    return pad;
  }

  /** Whether any human is choosing; with none the runner just starts. */
  get hasHumans(): boolean {
    return this.pads.some((p) => human(p.player.controller));
  }

  /** Everyone has picked: 'practice' if anybody asked for it. Null while still choosing. */
  decided(): 'play' | 'practice' | null {
    const live = this.pads.filter((p) => human(p.player.controller));
    if (live.some((p) => p.choice === 'try' || p.choice === 'menu')) return null;
    return live.some((p) => p.choice === 'practice') ? 'practice' : 'play';
  }

  /** Back to trying controls, after a practice round. */
  reset(): void {
    for (const p of this.pads) {
      if (human(p.player.controller)) p.choice = 'try';
      this.renderChoice(p);
    }
    this.prompt.textContent = 'Practice over! Press START when you are ready.';
  }

  set visible(on: boolean) {
    this.root.style.display = on ? '' : 'none';
    this.game.renderer.inset = on ? { scene: this.scene, camera: this.camera, el: this.strip } : null;
  }

  dispose(): void {
    if (this.game.renderer.inset?.scene === this.scene) this.game.renderer.inset = null;
    this.root.remove();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
  }

  /** Choices: deterministic, driven by controller presses only. Call every frame. */
  update(dt: number): void {
    for (const pad of this.pads) {
      const c = pad.player.controller;
      if (!human(c)) {
        if (pad.choice !== 'play') {
          pad.choice = 'play';
          this.renderChoice(pad);
        }
        continue;
      }
      this.choose(pad, c!);
    }
    this.animate(dt);
  }

  private choose(pad: Pad, c: Controller): void {
    const before = pad.choice;
    if (pad.choice === 'try') {
      if (c.pressed('start')) {
        pad.choice = 'menu';
        pad.cursor = 0;
        pad.lastY = 1;
      }
    } else if (pad.choice === 'menu') {
      const y = c.stickY > 0.6 ? 1 : c.stickY < -0.6 ? -1 : 0;
      if (y !== 0 && y !== pad.lastY) {
        pad.cursor = (pad.cursor + 1) % OPTIONS.length;
        this.game.audio.play('select');
        this.renderChoice(pad);
      }
      pad.lastY = y;
      if (c.pressed('a') || c.pressed('start')) pad.choice = pad.cursor === 0 ? 'play' : 'practice';
      else if (c.pressed('b')) pad.choice = 'try';
    } else if (c.pressed('b')) {
      pad.choice = 'try';
    }
    if (pad.choice !== before) {
      this.game.audio.play(pad.choice === 'try' ? 'back' : 'confirm');
      this.renderChoice(pad);
    }
  }

  private renderChoice(pad: Pad): void {
    const cpu = !human(pad.player.controller);
    pad.tile.classList.toggle('choosing', pad.choice === 'menu');
    pad.tile.classList.toggle('done', pad.choice === 'play' || pad.choice === 'practice');
    pad.menu.innerHTML =
      pad.choice === 'menu'
        ? OPTIONS.map((o, i) => `<div class="${i === pad.cursor ? 'on' : ''}">${i === pad.cursor ? '▶ ' : ''}${o}</div>`).join('') +
          '<small>A: pick · B: back</small>'
        : '';
    pad.status.textContent = cpu
      ? 'CPU · Ready!'
      : pad.choice === 'try'
        ? 'START: ready'
        : pad.choice === 'menu'
          ? ''
          : pad.choice === 'play'
            ? 'Ready! ✓ (B: undo)'
            : 'Wants practice (B: undo)';
    const done = pad.choice === 'play' || pad.choice === 'practice';
    pad.puppet.setExpression(done ? 'happy' : 'neutral');
  }

  // ---------------------------------------------------------------- puppets

  private animate(dt: number): void {
    const r = this.strip.getBoundingClientRect();
    const aspect = r.width > 0 && r.height > 0 ? r.width / r.height : 4;
    const hw = (VIEW_H * aspect) / 2;
    Object.assign(this.camera, { left: -hw, right: hw, top: VIEW_H / 2, bottom: -VIEW_H / 2 });
    this.camera.updateProjectionMatrix();

    for (const pad of this.pads) {
      const t = pad.tile.getBoundingClientRect();
      const x = r.width > 0 ? ((t.left + t.width / 2 - r.left) / r.width) * 2 * hw - hw : 0;
      pad.disc.position.x = x;
      this.drive(pad, dt);
      const ch = pad.puppet;
      // Dash: a quick scoot along the facing, springing back to the pad.
      const fx = Math.sin(ch.rotation.y) * pad.dash * 0.6;
      const fz = Math.cos(ch.rotation.y) * pad.dash * 0.6;
      ch.position.set(x + fx, pad.hop, fz);
      ch.update(dt);
    }
  }

  /** Reads input (real or faked for CPUs) into puppet motion. */
  private drive(pad: Pad, dt: number): void {
    const ch = pad.puppet;
    const c = pad.player.controller;
    let sx = 0;
    let sy = 0;
    let pressed: Button | null = null;
    const held = new Set<string>();
    if (human(c)) {
      if (pad.choice === 'try') {
        sx = c!.stickX;
        sy = c!.stickY;
        for (const b of FACE_BUTTONS) {
          if (c!.down(b)) held.add(b);
          if (!pressed && c!.pressed(b)) pressed = b;
        }
      }
    } else {
      const cpu = pad.cpu;
      cpu.t -= dt;
      if (cpu.t <= 0) {
        const e = pad.role.entries[Math.floor(Math.random() * pad.role.entries.length)] as ControlEntry | undefined;
        const k = e?.keys[Math.floor(Math.random() * e.keys.length)];
        cpu.stick.set(0, 0, 0);
        if (k === 'stick') {
          const a = Math.random() * Math.PI * 2;
          cpu.stick.set(Math.cos(a), Math.sin(a), 0);
        } else if (k) {
          cpu.press = k;
          cpu.hold = k;
          cpu.holdT = 0.5;
        }
        cpu.t = 0.8 + Math.random() * 1.6;
      } else if (cpu.t < 0.5) cpu.stick.set(0, 0, 0);
      sx = cpu.stick.x;
      sy = cpu.stick.y;
      pressed = cpu.press;
      cpu.press = null;
      cpu.holdT -= dt;
      if (cpu.hold && cpu.holdT > 0) held.add(cpu.hold);
    }

    const mag = Math.min(1, Math.hypot(sx, sy));
    if (mag > 0.15) held.add('stick');
    for (const [k, chip] of pad.chips) chip.classList.toggle('lit', held.has(k));

    // Walk in place, turning toward the stick (camera looks toward -Z).
    const r = ch.rotation;
    const target = mag > 0.15 ? Math.atan2(sx, -sy) : 0;
    let diff = target - r.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    r.y += diff * Math.min(1, dt * (mag > 0.15 ? 12 : 4));

    if (pressed) {
      const e = pad.role.entries.find((en) => en.keys.includes(pressed!));
      this.say(pad, e ? `${label(pressed)}: ${e.text}!` : `${label(pressed)}: not used here`, !e);
      if (e) {
        const move = moveFor(e.text);
        if (move === 'hop' && pad.hop <= 0) pad.vy = 7;
        else if (move === 'dash') pad.dash = 1;
        else if (move === 'mash') pad.act = 0.15;
        else if (move === 'act') pad.act = 0.4;
        if (move !== 'duck') this.game.audio.play('select');
      } else {
        ch.setExpression('surprised');
        pad.act = 0;
        window.setTimeout(() => pad.choice === 'try' && ch.setExpression('neutral'), 500);
      }
    }
    // Ducking lasts as long as the button is held.
    const duckKey = pad.role.entries.find((en) => moveFor(en.text) === 'duck')?.keys.find((k) => k !== 'stick');
    const ducking = !!duckKey && held.has(duckKey);
    ch.scale.y += ((ducking ? 0.62 : 1) - ch.scale.y) * Math.min(1, dt * 18);

    if (pad.hop > 0 || pad.vy > 0) {
      pad.vy -= 22 * dt;
      pad.hop += pad.vy * dt;
      if (pad.hop <= 0) {
        pad.hop = 0;
        pad.vy = 0;
        ch.land();
      }
    }
    pad.dash = Math.max(0, pad.dash - dt * 4);
    pad.act = Math.max(0, pad.act - dt);

    const done = pad.choice === 'play' || pad.choice === 'practice';
    ch.pose = pad.hop > 0 ? 'jump' : pad.act > 0 ? 'cheer' : done ? 'wave' : mag > 0.15 ? 'walk' : 'idle';
    ch.moveSpeed = Math.max(0.3, mag);

    pad.bubbleT -= dt;
    if (pad.bubbleT <= 0) pad.bubble.classList.remove('show');
  }

  private say(pad: Pad, text: string, dim: boolean): void {
    pad.bubble.textContent = text;
    pad.bubble.classList.toggle('dim', dim);
    pad.bubble.classList.remove('show');
    void pad.bubble.offsetWidth;
    pad.bubble.classList.add('show');
    pad.bubbleT = 1.1;
  }
}

/** A seat someone is actually playing (not a CPU, and not a player who left). */
function human(c: Controller | null): boolean {
  return !!c && !c.gone;
}

export function teamsHtml(def: MinigameDef, players: MinigamePlayer[], mode: MinigameMode): string {
  if (def.kind === 'ffa' && mode !== 'duel') return '';
  const teams = [0, 1].map((team) =>
    players
      .filter((p) => p.team === team)
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">${p.character.def.name}</span>`)
      .join(' & '),
  );
  return `<div class="mg-teams">${teams[0]} <b>vs</b> ${teams[1]}</div>`;
}
